
import { ObjectId } from "mongodb";

import {
  getDB,
  getMongoClient,
} from "../config/db.js";

const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "confirmed",
];

class BookingError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "BookingError";
    this.statusCode = statusCode;
  }
}

const getPagination = (query) => {
  const page = Number(query.page ?? "1");
  const limit = Number(query.limit ?? "10");

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    throw new BookingError(
      400,
      "Invalid pagination parameters"
    );
  }

  return { page, limit };
};

// Create booking - Customer only
export const createBooking = async (_req, res) => {
  // Direct booking creation bypasses verified Stripe payment.
  return res.status(410).json({
    success: false,
    message: "Direct booking creation is disabled. Use Stripe Checkout.",
  });
};

// Get bookings belonging to authenticated Customer
export const getMyBookings = async (req, res) => {
  try {
    if (
      req.auth?.role !== "customer" ||
      !ObjectId.isValid(req.auth?.userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Only Customers can view their bookings",
      });
    }

    const { page, limit } = getPagination(
      req.query
    );

    const db = getDB();

    const filter = {
      customerId: new ObjectId(
        req.auth.userId
      ),
    };

    const total = await db
      .collection("bookings")
      .countDocuments(filter);

    const bookings = await db
      .collection("bookings")
      .find(filter)
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof BookingError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Customer booking listing failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve bookings",
    });
  }
};

// Get bookings for authenticated Owner's equipment
export const getOwnerBookings = async (req, res) => {
  try {
    if (
      req.auth?.role !== "owner" ||
      !ObjectId.isValid(req.auth?.userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Only Owners can view equipment bookings",
      });
    }

    const { page, limit } = getPagination(req.query);
    const db = getDB();

    // Only return bookings belonging to the authenticated owner.
    const filter = {
      ownerId: new ObjectId(req.auth.userId),
    };

    const total = await db
      .collection("bookings")
      .countDocuments(filter);

    const bookings = await db
      .collection("bookings")
      .aggregate([
        {
          $match: filter,
        },
        {
          $sort: {
            createdAt: -1,
            _id: -1,
          },
        },
        {
          $skip: (page - 1) * limit,
        },
        {
          $limit: limit,
        },

        // Get customer details from Better Auth's user collection.
        {
          $lookup: {
            from: "user",
            localField: "customerId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  email: 1,
                },
              },
            ],
            as: "customerInfo",
          },
        },

        // Get the actual equipment name.
        {
          $lookup: {
            from: "equipment",
            localField: "equipmentId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
            as: "equipmentInfo",
          },
        },

        // Add readable fields without changing booking data.
        {
          $addFields: {
            customerName: {
              $ifNull: [
                {
                  $arrayElemAt: [
                    "$customerInfo.name",
                    0,
                  ],
                },
                "Unknown Customer",
              ],
            },

            customerEmail: {
              $ifNull: [
                {
                  $arrayElemAt: [
                    "$customerInfo.email",
                    0,
                  ],
                },
                "",
              ],
            },

            equipmentName: {
              $ifNull: [
                {
                  $arrayElemAt: [
                    "$equipmentInfo.name",
                    0,
                  ],
                },
                "Unknown Equipment",
              ],
            },
          },
        },

        // Don't expose joined internal documents.
        {
          $project: {
            customerInfo: 0,
            equipmentInfo: 0,
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof BookingError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Owner booking listing failed:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve Owner bookings",
    });
  }
};

// Confirm a pending AND paid booking - Owner only
export const confirmBooking = async (req, res) => {
  if (
    req.auth?.role !== "owner" ||
    !ObjectId.isValid(req.auth?.userId)
  ) {
    return res.status(403).json({
      success: false,
      message: "Only Owners can confirm bookings",
    });
  }

  const { id } = req.params;

  if (
    typeof id !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(id)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid booking ID",
    });
  }

  try {
    const db = getDB();
    const bookingId = new ObjectId(id);
    const ownerId = new ObjectId(
      req.auth.userId
    );

    const now = new Date();

    // IMPORTANT:
    // The payment condition is part of the atomic MongoDB
    // update filter, not a separate read-before-write check.
    //
    // A booking is confirmed only when:
    // 1. It belongs to the authenticated Owner.
    // 2. Its current status is pending.
    // 3. Its payment status is paid.
    //
    // Missing, unpaid, failed, or refunded payment
    // statuses do not satisfy this condition.
    const result = await db
      .collection("bookings")
      .updateOne(
        {
          _id: bookingId,
          ownerId,
          status: "pending",
          paymentStatus: "paid",
        },
        {
          $set: {
            status: "confirmed",
            confirmedAt: now,
            updatedAt: now,
          },
        }
      );

    if (result.modifiedCount === 1) {
      return res.status(200).json({
        success: true,
        message: "Booking confirmed successfully",
        booking: {
          bookingId: bookingId.toHexString(),
          status: "confirmed",
        },
      });
    }

    // Distinguish a missing booking, an invalid status,
    // and an unpaid booking without modifying any data.
    const booking = await db
      .collection("bookings")
      .findOne(
        {
          _id: bookingId,
          ownerId,
        },
        {
          projection: {
            status: 1,
            paymentStatus: 1,
          },
        }
      );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or access denied",
      });
    }

    if (booking.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Only pending bookings can be confirmed",
      });
    }

    if (booking.paymentStatus !== "paid") {
      return res.status(409).json({
        success: false,
        message:
          "Payment must be completed before confirming this booking",
      });
    }

    return res.status(409).json({
      success: false,
      message:
        "Booking could not be confirmed. Please refresh and try again.",
    });
  } catch (error) {
    console.error(
      "Booking confirmation failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to confirm booking",
    });
  }
};

// Reject pending, unpaid booking - Owner only
export const rejectBooking = async (req, res) => {
  if (
    req.auth?.role !== "owner" ||
    !ObjectId.isValid(req.auth?.userId)
  ) {
    return res.status(403).json({
      success: false,
      message: "Only Owners can reject bookings",
    });
  }

  const { id } = req.params;

  if (
    typeof id !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(id)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid booking ID",
    });
  }

  try {
    const db = getDB();

    const bookingId = new ObjectId(id);
    const ownerId = new ObjectId(
      req.auth.userId
    );

    const now = new Date();

    // Atomic update prevents duplicate rejection and
    // conflicting status changes on the same booking.
    const result = await db
      .collection("bookings")
      .updateOne(
        {
          _id: bookingId,
          ownerId,
          status: "pending",
          paymentStatus: "unpaid",
        },
        {
          $set: {
            status: "rejected",
            rejectedAt: now,
            updatedAt: now,
          },
        }
      );

    if (result.modifiedCount === 1) {
      return res.status(200).json({
        success: true,
        message: "Booking rejected successfully",
        booking: {
          bookingId: bookingId.toHexString(),
          status: "rejected",
        },
      });
    }

    // Check only bookings owned by authenticated Owner.
    const booking = await db
      .collection("bookings")
      .findOne(
        {
          _id: bookingId,
          ownerId,
        },
        {
          projection: {
            status: 1,
            paymentStatus: 1,
          },
        }
      );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or access denied",
      });
    }

    if (booking.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Only pending bookings can be rejected",
      });
    }

    return res.status(409).json({
      success: false,
      message:
        "Paid bookings require a separate refund process",
    });
  } catch (error) {
    console.error(
      "Booking rejection failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to reject booking",
    });
  }
};

// Cancel own pending, unpaid booking - Customer only
export const cancelBooking = async (req, res) => {
  if (
    req.auth?.role !== "customer" ||
    !ObjectId.isValid(req.auth?.userId)
  ) {
    return res.status(403).json({
      success: false,
      message: "Only Customers can cancel bookings",
    });
  }

  const { id } = req.params;

  if (
    typeof id !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(id)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid booking ID",
    });
  }

  const db = getDB();
  const client = getMongoClient();

  const bookingId = new ObjectId(id);
  const customerId = new ObjectId(req.auth.userId);

  let session;

  try {
    session = client.startSession();

    const cancelledBooking = await session.withTransaction(
      async () => {
        const booking = await db
          .collection("bookings")
          .findOne(
            {
              _id: bookingId,
              customerId,
            },
            { session }
          );

        if (!booking) {
          throw new BookingError(
            404,
            "Booking not found or access denied"
          );
        }

        if (booking.status !== "pending") {
          throw new BookingError(
            409,
            "Only pending bookings can be cancelled"
          );
        }

        if (booking.paymentStatus !== "unpaid") {
          throw new BookingError(
            409,
            "Paid bookings require a separate refund process"
          );
        }

        // Coordinate with booking creation transactions.
        const reservationLock = await db
          .collection("equipment")
          .updateOne(
            {
              _id: booking.equipmentId,
            },
            {
              $inc: {
                bookingRevision: 1,
              },
            },
            { session }
          );

        if (reservationLock.matchedCount !== 1) {
          throw new BookingError(
            409,
            "Equipment record is unavailable"
          );
        }

        const now = new Date();

        const result = await db
          .collection("bookings")
          .updateOne(
            {
              _id: bookingId,
              customerId,
              status: "pending",
              paymentStatus: "unpaid",
            },
            {
              $set: {
                status: "cancelled",
                cancelledAt: now,
                updatedAt: now,
              },
            },
            { session }
          );

        if (result.matchedCount !== 1) {
          throw new BookingError(
            409,
            "Booking is no longer eligible for cancellation"
          );
        }

        return {
          bookingId: bookingId.toHexString(),
          status: "cancelled",
        };
      },
      {
        readConcern: {
          level: "snapshot",
        },
        writeConcern: {
          w: "majority",
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      booking: cancelledBooking,
    });
  } catch (error) {
    if (error instanceof BookingError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Booking cancellation failed:",
      error.message
    );

    if (
      typeof error.hasErrorLabel === "function" &&
      error.hasErrorLabel("TransientTransactionError")
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Booking conflict detected. Please try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};