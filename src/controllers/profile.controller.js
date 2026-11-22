
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

function getUserId(req) {
  const id = req.auth?.userId;

  if (!id || !ObjectId.isValid(id)) return null;

  return new ObjectId(id);
}

function publicProfile(user) {
  return {
    _id: user._id,
    name: user.name || "",
    email: user.email || "",
    image: user.image || "",
    phone: user.phone || "",
    address: user.address || "",
    role: user.role || "customer",
    createdAt: user.createdAt,
  };
}

export async function getMyProfile(req, res) {
  try {
    const id = getUserId(req);

    if (!id) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication",
      });
    }

    const user = await getDB()
      .collection("user")
      .findOne({ _id: id });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      data: publicProfile(user),
    });
  } catch (error) {
    console.error("Get profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to load profile",
    });
  }
}

export async function updateMyProfile(req, res) {
  try {
    const id = getUserId(req);

    if (!id) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication",
      });
    }

    const input = req.body;

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile data",
      });
    }

    const allowed = ["name", "image", "phone", "address"];
    const updates = {};

    for (const field of allowed) {
      if (Object.hasOwn(input, field)) {
        if (typeof input[field] !== "string") {
          return res.status(400).json({
            success: false,
            message: `${field} must be text`,
          });
        }

        updates[field] = input[field].trim();
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    if (
      Object.hasOwn(updates, "name") &&
      (updates.name.length < 2 || updates.name.length > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Name must contain 2 to 100 characters",
      });
    }

    if (
      Object.hasOwn(updates, "phone") &&
      updates.phone.length > 30
    ) {
      return res.status(400).json({
        success: false,
        message: "Phone number is too long",
      });
    }

    if (
      Object.hasOwn(updates, "address") &&
      updates.address.length > 300
    ) {
      return res.status(400).json({
        success: false,
        message: "Address must be 300 characters or less",
      });
    }

    if (Object.hasOwn(updates, "image")) {
      if (updates.image.length > 2048) {
        return res.status(400).json({
          success: false,
          message: "Photo URL is too long",
        });
      }

      if (updates.image) {
        try {
          const url = new URL(updates.image);

          if (url.protocol !== "https:") {
            throw new Error("Invalid protocol");
          }
        } catch {
          return res.status(400).json({
            success: false,
            message: "Photo must be a valid HTTPS image URL",
          });
        }
      }
    }

    updates.updatedAt = new Date();

    const users = getDB().collection("user");

    const result = await users.updateOne(
      { _id: id },
      { $set: updates },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const updatedUser = await users.findOne({ _id: id });

    return res.json({
      success: true,
      message: "Profile updated successfully",
      data: publicProfile(updatedUser),
    });
  } catch (error) {
    console.error("Update profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
}