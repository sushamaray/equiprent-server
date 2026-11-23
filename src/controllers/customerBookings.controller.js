
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

export async function getCustomerBookings(req, res) {
  try {
    // Customer authentication and authorization
    if (
      req.auth?.role !== "customer" ||
      !ObjectId.isValid(req.auth?.userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Only Customers can view their bookings",
      });
    }

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    // Preserve existing pagination validation
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    const db = getDB();

    // Only the authenticated customer's bookings
    const filter = {
      customerId: new ObjectId(req.auth.userId),
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

        // Fetch equipment name from MongoDB
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

        // Add readable equipment name
        // without changing original booking records
        {
          $addFields: {
            equipmentName: {
              $ifNull: [
                {
                  $arrayElemAt: [
                    "$equipmentInfo.name",
                    0,
                  ],
                },
                {
                  $ifNull: [
                    "$equipmentName",
                    "Equipment unavailable",
                  ],
                },
              ],
            },
          },
        },

        // Remove temporary joined documents
        {
          $project: {
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
    console.error(
      "Customer booking listing failed:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve Customer bookings",
    });
  }
}