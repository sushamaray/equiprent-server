
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

import {
  validateEquipment,
  buildEquipmentDocument,
  validateEquipmentUpdate,
  buildEquipmentUpdate,
} from "../models/equipment.model.js";

// Fields visible through public equipment APIs
const publicEquipmentProjection = {
  name: 1,
  description: 1,
  category: 1,
  pricePerDay: 1,
  rentalType: 1,
  availableQuantity: 1,
  brand: 1,
  model: 1,
  condition: 1,
  rentalTerms: 1,
  location: 1,
  image: 1,
  availability: 1,
  createdAt: 1,
};

// Create equipment - Owner only
export const createEquipment = async (req, res) => {
  try {
    const validation = validateEquipment(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    if (
      req.auth?.role !== "owner" ||
      !ObjectId.isValid(req.auth?.userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Only authenticated Owners can add equipment",
      });
    }

    const ownerId = new ObjectId(req.auth.userId);

    const equipment = buildEquipmentDocument(
      req.body,
      ownerId
    );

    const db = getDB();

    const result = await db
      .collection("equipment")
      .insertOne(equipment);

    return res.status(201).json({
      success: true,
      message: "Equipment created successfully",
      equipment: {
        ...equipment,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error(
      "Equipment creation failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create equipment",
    });
  }
};

// Public equipment listing - Approved only
export const getAllEquipment = async (req, res) => {
  try {
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

    const filter = {
      availability: true,
      status: "approved",
      deletedAt: { $exists: false },
    };

    const total = await db
      .collection("equipment")
      .countDocuments(filter);

    const equipment = await db
      .collection("equipment")
      .find(filter)
      .project(publicEquipmentProjection)
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
    console.error(
      "Equipment listing failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve equipment",
    });
  }
};

// Public equipment details - Approved only
export const getEquipmentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID",
      });
    }

    const db = getDB();

    const equipment = await db
      .collection("equipment")
      .findOne(
        {
          _id: new ObjectId(id),
          availability: true,
          status: "approved",
          deletedAt: { $exists: false },
        },
        {
          projection: publicEquipmentProjection,
        }
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
    console.error(
      "Equipment details failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve equipment",
    });
  }
};

// Update equipment - Actual Owner only
export const updateEquipment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID",
      });
    }

    const validation = validateEquipmentUpdate(
      req.body
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    if (
      req.auth?.role !== "owner" ||
      !ObjectId.isValid(req.auth?.userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Only Owners can update equipment",
      });
    }

    const db = getDB();

    const filter = {
      _id: new ObjectId(id),
      ownerId: new ObjectId(req.auth.userId),
      deletedAt: { $exists: false },
    };

    const updateData = buildEquipmentUpdate(
      req.body
    );

    const result = await db
      .collection("equipment")
      .updateOne(
        filter,
        {
          $set: updateData,
        }
      );

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
    console.error(
      "Equipment update failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update equipment",
    });
  }
};

// Soft delete equipment - Actual Owner only
export const deleteEquipment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID",
      });
    }

    if (
      req.auth?.role !== "owner" ||
      !ObjectId.isValid(req.auth?.userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Only Owners can delete equipment",
      });
    }

    const db = getDB();

    const filter = {
      _id: new ObjectId(id),
      ownerId: new ObjectId(req.auth.userId),
      deletedAt: { $exists: false },
    };

    const now = new Date();

    const result = await db
      .collection("equipment")
      .updateOne(
        filter,
        {
          $set: {
            availability: false,
            deletedAt: now,
            updatedAt: now,
          },
        }
      );

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
    console.error(
      "Equipment deletion failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete equipment",
    });
  }
};

// List equipment belonging to the logged-in Owner
export const getMyEquipment = async (req, res) => {
  try {
    if (
      req.auth?.role !== "owner" ||
      !ObjectId.isValid(req.auth?.userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Only Owners can view their equipment",
      });
    }

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

    const filter = {
      ownerId: new ObjectId(req.auth.userId),
      deletedAt: { $exists: false },
    };

    const total = await db
      .collection("equipment")
      .countDocuments(filter);

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
    console.error(
      "Owner equipment listing failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve Owner equipment",
    });
  }
};

// Change equipment approval status - Admin only
const changeEquipmentApprovalStatus = (status) => {
  return async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID",
        });
      }

      if (
        req.auth?.role !== "admin" ||
        !ObjectId.isValid(req.auth?.userId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Only Admins can review equipment",
        });
      }

      const db = getDB();

      const now = new Date();

      const result = await db
        .collection("equipment")
        .updateOne(
          {
            _id: new ObjectId(id),
            deletedAt: { $exists: false },
            status: "pending",
          },
          {
            $set: {
              status,
              reviewedAt: now,
              reviewedBy: new ObjectId(
                req.auth.userId
              ),
              updatedAt: now,
            },
          }
        );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Equipment not found or not eligible for review",
        });
      }

      return res.status(200).json({
        success: true,
        message: `Equipment ${status} successfully`,
        status,
      });
    } catch (error) {
      console.error(
        "Equipment approval status update failed:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update equipment approval status",
      });
    }
  };
};

// Admin approves pending equipment
export const approveEquipment =
  changeEquipmentApprovalStatus("approved");

// Admin rejects pending equipment
export const rejectEquipment =
  changeEquipmentApprovalStatus("rejected");