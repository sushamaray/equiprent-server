
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const validId = (value) =>
  typeof value === "string" &&
  /^[a-fA-F0-9]{24}$/.test(value);

const getCustomerId = (req) => {
  if (
    req.auth?.role !== "customer" ||
    !validId(req.auth?.userId)
  ) {
    return null;
  }

  return new ObjectId(req.auth.userId);
};

export const getMyFavorites = async (req, res) => {
  try {
    const customerId = getCustomerId(req);

    if (!customerId) {
      return res.status(403).json({
        success: false,
        message: "Customer access required",
      });
    }

    const db = getDB();

    const favorites = await db.collection("favorites")
      .aggregate([
        { $match: { customerId } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "equipment",
            localField: "equipmentId",
            foreignField: "_id",
            as: "equipment",
          },
        },
        { $unwind: "$equipment" },
        {
          $match: {
            "equipment.status": "approved",
            "equipment.deletedAt": { $exists: false },
          },
        },
        {
          $project: {
            _id: 1,
            equipmentId: 1,
            createdAt: 1,
            equipment: {
              _id: "$equipment._id",
              name: "$equipment.name",
              category: "$equipment.category",
              location: "$equipment.location",
              image: "$equipment.image",
              rentalPrice: "$equipment.rentalPrice",
              pricePerDay: "$equipment.pricePerDay",
              rentalType: "$equipment.rentalType",
              availability: "$equipment.availability",
            },
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      data: favorites,
      total: favorites.length,
    });
  } catch (error) {
    console.error("Favorite listing failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve favorites",
    });
  }
};

export const addFavorite = async (req, res) => {
  try {
    const customerId = getCustomerId(req);

    if (!customerId) {
      return res.status(403).json({
        success: false,
        message: "Customer access required",
      });
    }

    const { equipmentId } = req.body || {};

    if (!validId(equipmentId)) {
      return res.status(400).json({
        success: false,
        message: "Valid equipmentId is required",
      });
    }

    const db = getDB();
    const id = new ObjectId(equipmentId);

    const equipment = await db.collection("equipment").findOne({
      _id: id,
      status: "approved",
      deletedAt: { $exists: false },
    });

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found",
      });
    }

    await db.collection("favorites").updateOne(
      { customerId, equipmentId: id },
      {
        $setOnInsert: {
          customerId,
          equipmentId: id,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

    return res.status(200).json({
      success: true,
      message: "Equipment added to favorites",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: "Equipment already in favorites",
      });
    }

    console.error("Add favorite failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to add favorite",
    });
  }
};

export const removeFavorite = async (req, res) => {
  try {
    const customerId = getCustomerId(req);

    if (!customerId) {
      return res.status(403).json({
        success: false,
        message: "Customer access required",
      });
    }

    if (!validId(req.params.equipmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID",
      });
    }

    const db = getDB();

    const result = await db.collection("favorites").deleteOne({
      customerId,
      equipmentId: new ObjectId(req.params.equipmentId),
    });

    return res.status(200).json({
      success: true,
      removed: result.deletedCount === 1,
      message: "Favorite removed successfully",
    });
  } catch (error) {
    console.error("Remove favorite failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to remove favorite",
    });
  }
};