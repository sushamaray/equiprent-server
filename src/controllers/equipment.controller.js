
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
  rentalPrice: 1,
  rentalType: 1,
  availableQuantity: 1,
  brand: 1,
  model: 1,
  condition: 1,
  rentalTerms: 1,
  location: 1,
  image: 1,
  availability: 1,
  ownerId: 1,
  createdAt: 1,
};

const isValidPrice = (value) => {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    Number.isSafeInteger(Math.round(value * 100)) &&
    Math.round(value * 100) > 0
  );
};

const hasOwn = (object, field) => {
  return Object.prototype.hasOwnProperty.call(
    object,
    field
  );
};

// Validate the final rental pricing structure
// before applying an equipment update.
const preparePricingUpdate = (
  existingEquipment,
  updateData
) => {
  const currentRentalType =
    existingEquipment.rentalType ?? "daily";

  const nextRentalType =
    updateData.rentalType ?? currentRentalType;

  const rentalTypeChanged =
    nextRentalType !== currentRentalType;

  const hasNewRentalPrice = hasOwn(
    updateData,
    "rentalPrice"
  );

  const hasNewLegacyPrice = hasOwn(
    updateData,
    "pricePerDay"
  );

  // Prevent ambiguous price updates
  if (hasNewRentalPrice && hasNewLegacyPrice) {
    return {
      valid: false,
      message:
        "Update rentalPrice or pricePerDay, not both",
    };
  }

  // A rental period change requires an explicit
  // new rentalPrice for that period.
  if (
    rentalTypeChanged &&
    !hasNewRentalPrice
  ) {
    return {
      valid: false,
      message:
        "Changing rentalType requires a new rentalPrice",
    };
  }

  // Legacy pricePerDay may only describe
  // daily rental equipment.
  if (
    hasNewLegacyPrice &&
    nextRentalType !== "daily"
  ) {
    return {
      valid: false,
      message:
        "pricePerDay can only be used for daily rentals",
    };
  }

  const unsetFields = {};

  if (hasNewRentalPrice) {
    // New pricing replaces the legacy daily field.
    unsetFields.pricePerDay = "";
  }

  if (hasNewLegacyPrice) {
    // Keep only one effective price field.
    unsetFields.rentalPrice = "";
  }

  const finalRentalPrice = hasNewRentalPrice
    ? updateData.rentalPrice
    : hasNewLegacyPrice
      ? undefined
      : existingEquipment.rentalPrice;

  const finalLegacyPrice = hasNewLegacyPrice
    ? updateData.pricePerDay
    : hasNewRentalPrice
      ? undefined
      : existingEquipment.pricePerDay;

  if (
    finalRentalPrice !== undefined &&
    isValidPrice(finalRentalPrice)
  ) {
    return {
      valid: true,
      unsetFields,
    };
  }

  if (
    nextRentalType === "daily" &&
    finalRentalPrice === undefined &&
    isValidPrice(finalLegacyPrice)
  ) {
    return {
      valid: true,
      unsetFields,
    };
  }

  return {
    valid: false,
    message:
      "A valid rentalPrice is required for weekly or monthly rentals",
  };
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
        message:
          "Only authenticated Owners can add equipment",
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

    if (
      typeof id !== "string" ||
      !/^[a-fA-F0-9]{24}$/.test(id)
    ) {
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

    if (
      typeof id !== "string" ||
      !/^[a-fA-F0-9]{24}$/.test(id)
    ) {
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

    const existingEquipment = await db
      .collection("equipment")
      .findOne(filter);

    if (!existingEquipment) {
      return res.status(404).json({
        success: false,
        message:
          "Equipment not found or access denied",
      });
    }

    const updateData = buildEquipmentUpdate(
      req.body
    );

    const pricingValidation =
      preparePricingUpdate(
        existingEquipment,
        updateData
      );

    if (!pricingValidation.valid) {
      return res.status(400).json({
        success: false,
        message: pricingValidation.message,
      });
    }

    const updateOperations = {
      $set: updateData,
    };

    if (
      Object.keys(
        pricingValidation.unsetFields
      ).length > 0
    ) {
      updateOperations.$unset =
        pricingValidation.unsetFields;
    }

    // Prevent applying a pricing update if
    // the equipment changed after it was read.
    const result = await db
      .collection("equipment")
      .updateOne(
        {
          ...filter,
          updatedAt: existingEquipment.updatedAt,
        },
        updateOperations
      );

    if (result.matchedCount === 0) {
      return res.status(409).json({
        success: false,
        message:
          "Equipment changed while updating. Please try again.",
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

    if (
      typeof id !== "string" ||
      !/^[a-fA-F0-9]{24}$/.test(id)
    ) {
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
        message:
          "Equipment not found or access denied",
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

// List equipment belonging to logged-in Owner
export const getMyEquipment = async (req, res) => {
  try {
    if (
      req.auth?.role !== "owner" ||
      !ObjectId.isValid(req.auth?.userId)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only Owners can view their equipment",
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
      message:
        "Failed to retrieve Owner equipment",
    });
  }
};

// Change equipment approval status - Admin only
const changeEquipmentApprovalStatus = (status) => {
  return async (req, res) => {
    try {
      const { id } = req.params;

      if (
        typeof id !== "string" ||
        !/^[a-fA-F0-9]{24}$/.test(id)
      ) {
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
          message:
            "Only Admins can review equipment",
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
        message:
          `Equipment ${status} successfully`,
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