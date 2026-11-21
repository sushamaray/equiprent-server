import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

import {
  validateEquipment,
  buildEquipmentDocument,
  validateEquipmentUpdate,
  buildEquipmentUpdate,
} from "../models/equipment.model.js";

export const createEquipment = async (req, res) => {
  try {
    // Validate incoming equipment data
    const validation = validateEquipment(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    // Only verified Owners can create equipment
    if (req.auth?.role !== "owner" || !ObjectId.isValid(req.auth?.userId)) {
      return res.status(403).json({
        success: false,
        message: "Only authenticated Owners can add equipment",
      });
    }

    const ownerId = new ObjectId(req.auth.userId);

    // Build equipment document using verified Owner ID
    const equipment = buildEquipmentDocument(req.body, ownerId);

    const db = getDB();

    const result = await db.collection("equipment").insertOne(equipment);

    return res.status(201).json({
      success: true,
      message: "Equipment created successfully",
      equipment: {
        ...equipment,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Equipment creation failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to create equipment",
    });
  }
};

export const getAllEquipment = async (req, res) => {
  try {
    const rawPage = req.query.page ?? "1";
    const rawLimit = req.query.limit ?? "10";

    const page = Number(rawPage);
    const limit = Number(rawLimit);

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
      availability: true,
    };

    const total = await db.collection("equipment").countDocuments(filter);

    const equipment = await db
      .collection("equipment")
      .find(filter)
      .project({
        name: 1,
        description: 1,
        category: 1,
        pricePerDay: 1,
        location: 1,
        image: 1,
        availability: 1,
        createdAt: 1,
      })
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return res.status(200).json({
      success: true,
      data: equipment,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Equipment listing failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve equipment",
    });
  }
};

export const getEquipmentById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId format
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID",
      });
    }

    const db = getDB();

    const equipment = await db.collection("equipment").findOne(
      {
        _id: new ObjectId(id),
        availability: true,
      },
      {
        projection: {
          name: 1,
          description: 1,
          category: 1,
          pricePerDay: 1,
          location: 1,
          image: 1,
          availability: 1,
          createdAt: 1,
        },
      },
    );

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found",
      });
    }

    return res.status(200).json({
      success: true,
      equipment,
    });
  } catch (error) {
    console.error("Equipment details failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve equipment",
    });
  }
};

export const updateEquipment = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate equipment ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID",
      });
    }

    // Validate update data
    const validation = validateEquipmentUpdate(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    // Check authenticated Owner
    if (req.auth?.role !== "owner" || !ObjectId.isValid(req.auth?.userId)) {
      return res.status(403).json({
        success: false,
        message: "Only Owners can update equipment",
      });
    }

    const db = getDB();

    // Match both equipment ID and authenticated Owner ID
    const filter = {
      _id: new ObjectId(id),
      ownerId: new ObjectId(req.auth.userId),
      deletedAt: { $exists: false },
    };

    const updateData = buildEquipmentUpdate(req.body);

    const result = await db.collection("equipment").updateOne(filter, {
      $set: updateData,
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found or access denied",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Equipment updated successfully",
    });
  } catch (error) {
    console.error("Equipment update failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update equipment",
    });
  }
};

export const deleteEquipment = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate equipment ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID",
      });
    }

    // Verify authenticated Owner
    if (req.auth?.role !== "owner" || !ObjectId.isValid(req.auth?.userId)) {
      return res.status(403).json({
        success: false,
        message: "Only Owners can delete equipment",
      });
    }

    const db = getDB();

    // Only the actual Owner can delete this equipment
    const filter = {
      _id: new ObjectId(id),
      ownerId: new ObjectId(req.auth.userId),
      deletedAt: { $exists: false },
    };

    // Soft delete instead of permanently removing data
    const now = new Date();

    const result = await db.collection("equipment").updateOne(filter, {
      $set: {
        availability: false,
        deletedAt: now,
        updatedAt: now,
      },
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found or access denied",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Equipment deleted successfully",
    });
  } catch (error) {
    console.error("Equipment deletion failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to delete equipment",
    });
  }
};

export const getMyEquipment = async (req, res) => {
  try {
    // Validate authenticated Owner
    if (req.auth?.role !== "owner" || !ObjectId.isValid(req.auth?.userId)) {
      return res.status(403).json({
        success: false,
        message: "Only Owners can view their equipment",
      });
    }

    // Validate pagination
    const page = Number(req.query.page ?? "1");
    const limit = Number(req.query.limit ?? "10");

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

    // Show only the authenticated Owner's non-deleted equipment
    const filter = {
      ownerId: new ObjectId(req.auth.userId),
      deletedAt: { $exists: false },
    };

    const total = await db.collection("equipment").countDocuments(filter);

    const equipment = await db
      .collection("equipment")
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
      data: equipment,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Owner equipment listing failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve Owner equipment",
    });
  }
};