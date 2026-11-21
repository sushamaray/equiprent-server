
import { ObjectId } from "mongodb";

import {
  getDB,
  getMongoClient,
} from "../config/db.js";

import {
  validateBooking,
  calculateRentalDays,
  buildBookingDocument,
} from "../models/booking.model.js";

// Booking statuses that reserve equipment stock
const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "confirmed",
];

// Controlled API errors
class BookingError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "BookingError";
    this.statusCode = statusCode;
  }
}

// Validate pagination parameters
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
export const createBooking = async (req, res) => {
  const validation = validateBooking(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.message,
    });
  }

  if (
    req.auth?.role !== "customer" ||
    !ObjectId.isValid(req.auth?.userId)
  ) {
    return res.status(403).json({
      success: false,
      message: "Only Customers can create bookings",
    });
  }

  const db = getDB();
  const client = getMongoClient();

  const equipmentId = new ObjectId(
    req.body.equipmentId
  );

  const customerId = new ObjectId(
    req.auth.userId
  );

  const quantity = req.body.quantity ?? 1;
  const startDate = req.body.startDate;
  const endDate = req.body.endDate;

  let session;

  try {
    session = client.startSession();

    const savedBooking = await session.withTransaction(
      async () => {
        const equipment = await db
          .collection("equipment")
          .findOne(
            {
              _id: equipmentId,
              status: "approved",
              availability: true,
              deletedAt: { $exists: false },
            },
            { session }
          );

        if (!equipment) {
          throw new BookingError(
            404,
            "Equipment not found or unavailable"
          );
        }

        if (!ObjectId.isValid(equipment.ownerId)) {
          throw new BookingError(
            500,
            "Equipment Owner information is invalid"
          );
        }

        const ownerId = new ObjectId(
          equipment.ownerId
        );

        if (ownerId.equals(customerId)) {
          throw new BookingError(
            403,
            "You cannot book your own equipment"
          );
        }

        const rentalType =
          equipment.rentalType ?? "daily";

        if (rentalType !== "daily") {
          throw new BookingError(
            400,
            "Only daily rental bookings are currently supported"
          );
        }

        if (
          typeof equipment.pricePerDay !== "number" ||
          !Number.isFinite(equipment.pricePerDay) ||
          equipment.pricePerDay <= 0
        ) {
          throw new BookingError(
            400,
            "Equipment rental price is invalid"
          );
        }

        const availableQuantity =
          equipment.availableQuantity ?? 1;

        if (
          !Number.isInteger(availableQuantity) ||
          availableQuantity < 0
        ) {
          throw new BookingError(
            400,
            "Equipment stock information is invalid"
          );
        }

        if (quantity > availableQuantity) {
          throw new BookingError(
            409,
            "Requested quantity exceeds available stock"
          );
        }

        // Coordinate concurrent operations
        // using the equipment document
        const reservationLock = await db
          .collection("equipment")
          .updateOne(
            {
              _id: equipmentId,
              status: "approved",
              availability: true,
              deletedAt: { $exists: false },
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
            "Equipment availability changed"
          );
        }

        const rentalDays = calculateRentalDays(
          startDate,
          endDate
        );

        // Rental intervals are [startDate, endDate)
        const overlappingBookings = await db
          .collection("bookings")
          .find(
            {
              equipmentId,
              status: {
                $in: ACTIVE_BOOKING_STATUSES,
              },
              startDate: {
                $lt: endDate,
              },
              endDate: {
                $gt: startDate,
              },
            },
            { session }
          )
          .project({
            quantity: 1,
          })
          .toArray();

        const reservedQuantity =
          overlappingBookings.reduce(
            (total, booking) =>
              total + (booking.quantity ?? 1),
            0
          );

        if (
          reservedQuantity + quantity >
          availableQuantity
        ) {
          throw new BookingError(
            409,
            "Not enough equipment available for the selected dates"
          );
        }

        // Calculate price using trusted database values
        const totalPrice =
          equipment.pricePerDay *
          rentalDays *
          quantity;

        if (
          !Number.isFinite(totalPrice) ||
          totalPrice <= 0 ||
          !Number.isSafeInteger(
            Math.round(totalPrice * 100)
          )
        ) {
          throw new BookingError(
            400,
            "Calculated booking price is invalid"
          );
        }

        const booking = buildBookingDocument({
          equipmentId: equipmentId.toHexString(),
          customerId: customerId.toHexString(),
          ownerId: ownerId.toHexString(),
          startDate,
          endDate,
          quantity,
          rentalDays,
          pricePerDay: equipment.pricePerDay,
          totalPrice,
        });

        const result = await db
          .collection("bookings")
          .insertOne(booking, { session });

        return {
          ...booking,
          _id: result.insertedId,
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

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking: savedBooking,
    });
  } catch (error) {
    if (error instanceof BookingError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Booking creation failed:",
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
      message: "Failed to create booking",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
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

// Cancel own pending and unpaid booking - Customer only
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
        // Only find a booking belonging to this Customer
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

        // Avoid cancelling bookings that may require a refund
        if (booking.paymentStatus !== "unpaid") {
          throw new BookingError(
            409,
            "Paid bookings require a separate refund process"
          );
        }

        // Coordinate with booking creation transactions
        // through the same equipment document
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

        // Atomic conditional transition
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