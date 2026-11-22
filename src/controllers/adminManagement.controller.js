
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const validId = (value) =>
  typeof value === "string" &&
  /^[a-fA-F0-9]{24}$/.test(value);

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

  return { page, limit, skip: (page - 1) * limit };
}

function deny(res) {
  return res.status(403).json({
    success: false,
    message: "Admin access required",
  });
}

export async function getAllUsers(req, res) {
  try {
    if (req.auth?.role !== "admin") return deny(res);

    const options = pagination(req);
    if (!options) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination",
      });
    }

    const db = getDB();
    const users = db.collection("user");

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
        totalPages: Math.ceil(total / options.limit),
      },
    });
  } catch (error) {
    console.error("Admin users error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to load users",
    });
  }
}

export async function changeUserRole(req, res) {
  try {
    if (req.auth?.role !== "admin") return deny(res);

    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const { role } = req.body || {};

    // Admin promotion is intentionally excluded.
    if (!["customer", "owner"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Only customer and owner roles can be assigned",
      });
    }

    const targetId = new ObjectId(req.params.id);

    if (String(targetId) === req.auth.userId) {
      return res.status(403).json({
        success: false,
        message: "You cannot change your own role",
      });
    }

    const collection = getDB().collection("user");
    const target = await collection.findOne({ _id: targetId });

    if (!target) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (target.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin accounts cannot be changed here",
      });
    }

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
        message: "User role changed; refresh and retry",
      });
    }

    return res.json({
      success: true,
      message: `User role updated to ${role}`,
    });
  } catch (error) {
    console.error("Change role error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to change user role",
    });
  }
}

export async function getAllAdminEquipment(req, res) {
  try {
    if (req.auth?.role !== "admin") return deny(res);

    const options = pagination(req);
    if (!options) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination",
      });
    }

    const collection = getDB().collection("equipment");

    const filter = {
      deletedAt: { $exists: false },
    };

    const total = await collection.countDocuments(filter);

    const data = await collection
      .find(filter)
      .project({
        name: 1,
        category: 1,
        location: 1,
        rentalPrice: 1,
        pricePerDay: 1,
        rentalType: 1,
        status: 1,
        image: 1,
        ownerId: 1,
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
        totalPages: Math.ceil(total / options.limit),
      },
    });
  } catch (error) {
    console.error("Admin equipment error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to load equipment",
    });
  }
}

export async function adminDeleteEquipment(req, res) {
  try {
    if (req.auth?.role !== "admin") return deny(res);

    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID",
      });
    }

    const db = getDB();
    const equipmentId = new ObjectId(req.params.id);

    // Do not remove equipment that has active rental obligations.
    const activeBooking = await db.collection("bookings").findOne({
      equipmentId,
      status: { $in: ["pending", "confirmed"] },
    });

    if (activeBooking) {
      return res.status(409).json({
        success: false,
        message:
          "This equipment has active bookings and cannot be deleted",
      });
    }

    const result = await db.collection("equipment").updateOne(
      {
        _id: equipmentId,
        deletedAt: { $exists: false },
      },
      {
        $set: {
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    if (!result.matchedCount) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found",
      });
    }

    return res.json({
      success: true,
      message: "Equipment removed from marketplace",
    });
  } catch (error) {
    console.error("Admin delete equipment:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to remove equipment",
    });
  }
}

export async function getAllAdminRentals(req, res) {
  try {
    if (req.auth?.role !== "admin") return deny(res);

    const options = pagination(req);
    if (!options) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination",
      });
    }

    const db = getDB();
    const collection = db.collection("bookings");

    const total = await collection.countDocuments();

    const data = await collection
      .aggregate([
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: options.skip },
        { $limit: options.limit },
        {
          $lookup: {
            from: "user",
            localField: "customerId",
            foreignField: "_id",
            as: "customer",
          },
        },
        {
          $lookup: {
            from: "equipment",
            localField: "equipmentId",
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
                { $arrayElemAt: ["$customer.name", 0] },
                "Unknown customer",
              ],
            },
            customerEmail: {
              $ifNull: [
                { $arrayElemAt: ["$customer.email", 0] },
                "",
              ],
            },
            equipmentName: {
              $ifNull: [
                { $arrayElemAt: ["$equipment.name", 0] },
                "Unknown equipment",
              ],
            },
            ownerName: {
              $ifNull: [
                { $arrayElemAt: ["$owner.name", 0] },
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
        totalPages: Math.ceil(total / options.limit),
      },
    });
  } catch (error) {
    console.error("Admin rentals error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to load rentals",
    });
  }
}