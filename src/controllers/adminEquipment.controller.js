
import { getDB } from "../config/db.js";

export const getPendingEquipment = async (req, res) => {
  try {
    if (req.auth?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

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

    const filter = {
      status: "pending",
      deletedAt: { $exists: false },
    };

    const collection = db.collection("equipment");

    const total = await collection.countDocuments(filter);

    const data = await collection
      .find(filter)
      .project({
        name: 1,
        description: 1,
        category: 1,
        location: 1,
        image: 1,
        rentalType: 1,
        rentalPrice: 1,
        pricePerDay: 1,
        availableQuantity: 1,
        condition: 1,
        brand: 1,
        model: 1,
        ownerId: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Pending equipment retrieval failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve pending equipment",
    });
  }
};