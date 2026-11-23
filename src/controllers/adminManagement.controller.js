
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const validId = (value) =>
  typeof value === "string" &&
  /^[a-fA-F0-9]{24}$/.test(value);

const ASSIGNABLE_ROLES = [
  "customer",
  "owner",
  "admin",
];

function pagination(req) {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    return null;
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function deny(res) {
  return res.status(403).json({
    success: false,
    message: "Admin access required",
  });
}

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

export async function getAllUsers(req, res) {
  try {
    if (req.auth?.role !== "admin") {
      return deny(res);
    }

    const options = pagination(req);

    if (!options) {
      return badRequest(
        res,
        "Invalid pagination",
      );
    }

    const users = getDB().collection("user");
    const total = await users.countDocuments();

    const data = await users
      .find({})
      .project({
        name: 1,
        email: 1,
        image: 1,
        role: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1, _id: -1 })
      .skip(options.skip)
      .limit(options.limit)
      .toArray();

    return res.json({
      success: true,
      data,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(
          total / options.limit,
        ),
      },
    });
  } catch (error) {
    console.error(
      "Admin users error:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load users",
    });
  }
}

export async function changeUserRole(req, res) {
  try {
    if (req.auth?.role !== "admin") {
      return deny(res);
    }

    if (!validId(req.params.id)) {
      return badRequest(
        res,
        "Invalid user ID",
      );
    }

    const { role } = req.body || {};

    if (!ASSIGNABLE_ROLES.includes(role)) {
      return badRequest(
        res,
        "Role must be customer, owner, or admin",
      );
    }

    const targetId = new ObjectId(
      req.params.id,
    );

    // Prevent changing the current Admin's own role.
    if (
      String(targetId) ===
      String(req.auth.userId)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You cannot change your own role",
      });
    }

    const collection = getDB().collection(
      "user",
    );

    const target = await collection.findOne({
      _id: targetId,
    });

    if (!target) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Existing Admin accounts remain protected.
    if (target.role === "admin") {
      return res.status(403).json({
        success: false,
        message:
          "Existing Admin accounts cannot be changed here",
      });
    }

    // A non-admin user can be promoted to Admin
    // only through this authenticated Admin endpoint.
    const result = await collection.updateOne(
      {
        _id: targetId,
        role: { $ne: "admin" },
      },
      {
        $set: {
          role,
          updatedAt: new Date(),
        },
      },
    );

    if (!result.matchedCount) {
      return res.status(409).json({
        success: false,
        message:
          "User role changed; refresh and retry",
      });
    }

    return res.json({
      success: true,
      message:
        `User role updated to ${role}`,
    });
  } catch (error) {
    console.error(
      "Change role error:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to change user role",
    });
  }
}

export async function getAllAdminEquipment(
  req,
  res,
) {
  try {
    if (req.auth?.role !== "admin") {
      return deny(res);
    }

    const options = pagination(req);

    if (!options) {
      return badRequest(
        res,
        "Invalid pagination",
      );
    }

    const collection = getDB().collection(
      "equipment",
    );

    const filter = {
      deletedAt: { $exists: false },
    };

    const total =
      await collection.countDocuments(
        filter,
      );

    const data = await collection
      .find(filter)
      .project({
        name: 1,
        description: 1,
        category: 1,
        location: 1,
        rentalPrice: 1,
        pricePerDay: 1,
        rentalType: 1,
        availableQuantity: 1,
        availability: 1,
        condition: 1,
        brand: 1,
        model: 1,
        rentalTerms: 1,
        status: 1,
        image: 1,
        ownerId: 1,
        createdAt: 1,
      })
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(options.skip)
      .limit(options.limit)
      .toArray();

    return res.json({
      success: true,
      data,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(
          total / options.limit,
        ),
      },
    });
  } catch (error) {
    console.error(
      "Admin equipment error:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load equipment",
    });
  }
}

// Admin can edit listing information without changing
// its owner, approval status, bookings, or payments.
export async function adminUpdateEquipment(
  req,
  res,
) {
  try {
    if (req.auth?.role !== "admin") {
      return deny(res);
    }

    if (!validId(req.params.id)) {
      return badRequest(
        res,
        "Invalid equipment ID",
      );
    }

    const body = req.body;

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return badRequest(
        res,
        "Invalid equipment data",
      );
    }

    const allowedFields = [
      "name",
      "description",
      "category",
      "location",
      "rentalPrice",
      "rentalType",
      "availableQuantity",
      "availability",
      "condition",
      "brand",
      "model",
      "rentalTerms",
      "image",
    ];

    const receivedFields =
      Object.keys(body);

    if (
      receivedFields.length === 0 ||
      receivedFields.some(
        (field) =>
          !allowedFields.includes(field),
      )
    ) {
      return badRequest(
        res,
        "Request contains empty or unsupported equipment fields",
      );
    }

    const updates = {};

    const textRules = {
      name: [2, 150],
      description: [5, 3000],
      category: [2, 100],
      location: [2, 150],
      condition: [1, 100],
      brand: [0, 150],
      model: [0, 150],
      rentalTerms: [0, 3000],
    };

    for (const [
      field,
      [minLength, maxLength],
    ] of Object.entries(textRules)) {
      if (!Object.hasOwn(body, field)) {
        continue;
      }

      if (
        typeof body[field] !== "string"
      ) {
        return badRequest(
          res,
          `Invalid ${field}`,
        );
      }

      const value =
        body[field].trim();

      if (
        value.length < minLength ||
        value.length > maxLength
      ) {
        return badRequest(
          res,
          `${field} must contain ${minLength}-${maxLength} characters`,
        );
      }

      updates[field] = value;
    }

    if (
      Object.hasOwn(
        body,
        "rentalType",
      )
    ) {
      if (
        ![
          "daily",
          "weekly",
          "monthly",
        ].includes(body.rentalType)
      ) {
        return badRequest(
          res,
          "Invalid rental type",
        );
      }

      updates.rentalType =
        body.rentalType;
    }

    if (
      Object.hasOwn(
        body,
        "rentalPrice",
      )
    ) {
      const price = body.rentalPrice;

      if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        price > 100000000 ||
        !Number.isSafeInteger(price)
      ) {
        return badRequest(
          res,
          "Rental price must be a positive whole BDT amount",
        );
      }

      updates.rentalPrice = price;

      if (
        (updates.rentalType ||
          body.rentalType) ===
        "daily"
      ) {
        updates.pricePerDay = price;
      }
    }

    if (
      Object.hasOwn(
        body,
        "availableQuantity",
      )
    ) {
      const quantity =
        body.availableQuantity;

      if (
        typeof quantity !==
          "number" ||
        !Number.isSafeInteger(
          quantity,
        ) ||
        quantity < 0 ||
        quantity > 100000
      ) {
        return badRequest(
          res,
          "Available quantity must be a non-negative integer",
        );
      }

      updates.availableQuantity =
        quantity;
    }

    if (
      Object.hasOwn(
        body,
        "availability",
      )
    ) {
      if (
        typeof body.availability !==
        "boolean"
      ) {
        return badRequest(
          res,
          "Availability must be true or false",
        );
      }

      updates.availability =
        body.availability;
    }

    if (
      Object.hasOwn(body, "image")
    ) {
      if (
        typeof body.image !==
          "string" ||
        body.image.length > 2000
      ) {
        return badRequest(
          res,
          "Invalid image URL",
        );
      }

      let url;

      try {
        url = new URL(
          body.image,
        );
      } catch {
        return badRequest(
          res,
          "Image must be a valid URL",
        );
      }

      if (
        url.protocol !== "https:"
      ) {
        return badRequest(
          res,
          "Image URL must use HTTPS",
        );
      }

      updates.image =
        url.toString();
    }

    const db = getDB();

    const equipmentId =
      new ObjectId(
        req.params.id,
      );

    const existing = await db
      .collection("equipment")
      .findOne({
        _id: equipmentId,
        deletedAt: {
          $exists: false,
        },
      });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message:
          "Equipment not found",
      });
    }

    const nextRentalType =
      updates.rentalType ||
      existing.rentalType ||
      "daily";

    if (
      nextRentalType === "daily" &&
      Object.hasOwn(
        updates,
        "rentalPrice",
      )
    ) {
      updates.pricePerDay =
        updates.rentalPrice;
    }

    const nextQuantity =
      updates.availableQuantity ??
      existing.availableQuantity ??
      1;

    const nextAvailability =
      updates.availability ??
      existing.availability ??
      true;

    if (
      nextAvailability &&
      nextQuantity < 1
    ) {
      return badRequest(
        res,
        "Available equipment must have at least 1 unit",
      );
    }

    const changesRentalTerms =
      Object.hasOwn(
        updates,
        "rentalPrice",
      ) ||
      Object.hasOwn(
        updates,
        "rentalType",
      ) ||
      Object.hasOwn(
        updates,
        "availableQuantity",
      );

    if (changesRentalTerms) {
      const activeReservation =
        await db
          .collection(
            "checkoutReservations",
          )
          .findOne({
            equipmentId,
            status: {
              $in: [
                "pending",
                "processing",
              ],
            },
          });

      if (activeReservation) {
        return res.status(409).json({
          success: false,
          message:
            "This equipment has an in-progress checkout. Retry after it finishes.",
        });
      }
    }

    updates.updatedAt =
      new Date();

    const result = await db
      .collection("equipment")
      .updateOne(
        {
          _id: equipmentId,
          deletedAt: {
            $exists: false,
          },
        },
        {
          $set: updates,
        },
      );

    if (!result.matchedCount) {
      return res.status(404).json({
        success: false,
        message:
          "Equipment not found",
      });
    }

    return res.json({
      success: true,
      message:
        "Equipment updated successfully",
    });
  } catch (error) {
    console.error(
      "Admin update equipment error:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update equipment",
    });
  }
}

export async function adminDeleteEquipment(
  req,
  res,
) {
  try {
    if (req.auth?.role !== "admin") {
      return deny(res);
    }

    if (!validId(req.params.id)) {
      return badRequest(
        res,
        "Invalid equipment ID",
      );
    }

    const db = getDB();

    const equipmentId =
      new ObjectId(
        req.params.id,
      );

    const activeBooking = await db
      .collection("bookings")
      .findOne({
        equipmentId,
        status: {
          $in: [
            "pending",
            "confirmed",
          ],
        },
      });

    if (activeBooking) {
      return res.status(409).json({
        success: false,
        message:
          "This equipment has active bookings and cannot be deleted",
      });
    }

    const result = await db
      .collection("equipment")
      .updateOne(
        {
          _id: equipmentId,
          deletedAt: {
            $exists: false,
          },
        },
        {
          $set: {
            deletedAt:
              new Date(),
            updatedAt:
              new Date(),
          },
        },
      );

    if (!result.matchedCount) {
      return res.status(404).json({
        success: false,
        message:
          "Equipment not found",
      });
    }

    return res.json({
      success: true,
      message:
        "Equipment removed from marketplace",
    });
  } catch (error) {
    console.error(
      "Admin delete equipment:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to remove equipment",
    });
  }
}

export async function getAllAdminRentals(
  req,
  res,
) {
  try {
    if (req.auth?.role !== "admin") {
      return deny(res);
    }

    const options = pagination(req);

    if (!options) {
      return badRequest(
        res,
        "Invalid pagination",
      );
    }

    const db = getDB();
    const collection =
      db.collection("bookings");

    const total =
      await collection.countDocuments();

    const data = await collection
      .aggregate([
        {
          $sort: {
            createdAt: -1,
            _id: -1,
          },
        },
        {
          $skip: options.skip,
        },
        {
          $limit: options.limit,
        },
        {
          $lookup: {
            from: "user",
            localField:
              "customerId",
            foreignField: "_id",
            as: "customer",
          },
        },
        {
          $lookup: {
            from: "equipment",
            localField:
              "equipmentId",
            foreignField: "_id",
            as: "equipment",
          },
        },
        {
          $lookup: {
            from: "user",
            localField: "ownerId",
            foreignField: "_id",
            as: "owner",
          },
        },
        {
          $addFields: {
            customerName: {
              $ifNull: [
                {
                  $arrayElemAt: [
                    "$customer.name",
                    0,
                  ],
                },
                "Unknown customer",
              ],
            },
            customerEmail: {
              $ifNull: [
                {
                  $arrayElemAt: [
                    "$customer.email",
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
                    "$equipment.name",
                    0,
                  ],
                },
                "Unknown equipment",
              ],
            },
            ownerName: {
              $ifNull: [
                {
                  $arrayElemAt: [
                    "$owner.name",
                    0,
                  ],
                },
                "Unknown owner",
              ],
            },
          },
        },
        {
          $project: {
            customer: 0,
            equipment: 0,
            owner: 0,
          },
        },
      ])
      .toArray();

    return res.json({
      success: true,
      data,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(
          total / options.limit,
        ),
      },
    });
  } catch (error) {
    console.error(
      "Admin rentals error:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load rentals",
    });
  }
}