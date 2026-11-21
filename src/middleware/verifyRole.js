import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const ALLOWED_ROLES = ["customer", "owner", "admin"];

export const verifyRole = (...allowedRoles) => {
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => !ALLOWED_ROLES.includes(role))
  ) {
    throw new Error("Invalid RBAC configuration");
  }

  return async (req, res, next) => {
    // verifyToken must run before verifyRole
    if (!req.auth?.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    try {
      const db = getDB();

      // Better Auth stores users in the "user" collection
      // Convert verified JWT user ID to MongoDB ObjectId
      if (!ObjectId.isValid(req.auth.userId)) {
        return res.status(401).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const user = await db.collection("user").findOne(
        { _id: new ObjectId(req.auth.userId) },
        {
          projection: {
            _id: 1,
            role: 1,
          },
        },
      );

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User account not found",
        });
      }

      // Deny access if the database role is missing or invalid
      if (!ALLOWED_ROLES.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: "User role is not authorized",
        });
      }

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: insufficient permissions",
        });
      }

      // Store verified database role for subsequent handlers
      req.auth.role = user.role;

      next();
    } catch (error) {
      console.error("RBAC verification failed:", error.message);

      return res.status(500).json({
        success: false,
        message: "Authorization verification failed",
      });
    }
  };
};

// Role-specific middleware
export const verifyCustomer = verifyRole("customer");

export const verifyOwner = verifyRole("owner");

export const verifyAdmin = verifyRole("admin");
