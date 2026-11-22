
import express from "express";
import cors from "cors";
import "dotenv/config";

import { toNodeHandler } from "better-auth/node";

import { connectDB } from "./config/db.js";
import { createAuth } from "./config/auth.js";

import { verifyToken } from "./middleware/verifyToken.js";

import {
  verifyCustomer,
  verifyOwner,
  verifyAdmin,
} from "./middleware/verifyRole.js";

import equipmentRoutes from "./routes/equipment.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import adminManagementRoutes from "./routes/adminManagement.routes.js";

import {
  reconcileStripeReservations,
} from "./services/stripeReconciliation.service.js";

import {
  handleStripeWebhook,
} from "./controllers/stripeWebhook.controller.js";

const app = express();
const PORT = process.env.PORT || 5000;

// CORS must be registered BEFORE all API routes.
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.CLIENT_URL?.trim().replace(/\/$/, ""),
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin not allowed by CORS")
      );
    },
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  }),
);

app.get("/", (req, res) => {
  return res.json({
    message: "EquipRent API is running",
  });
});

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});

const startServer = async () => {
  try {
    await connectDB();

    const auth = createAuth();
    const authHandler = toNodeHandler(auth);

    // Better Auth endpoints
    app.all("/api/auth/*splat", async (req, res, next) => {
      try {
        await authHandler(req, res, next);
      } catch (error) {
        console.error(
          "Better Auth request handler failed:",
          error.message,
        );

        if (!res.headersSent) {
          return res.status(500).json({
            success: false,
            message:
              "Authentication service is temporarily unavailable",
          });
        }

        res.destroy(error);
      }
    });

    // Stripe webhook requires the raw request body.
    // Keep this route BEFORE express.json().
    app.post(
      "/api/stripe/webhook",
      express.raw({
        type: "application/json",
      }),
      handleStripeWebhook,
    );

    app.use(express.json());

    // Equipment and Favorites
    app.use("/api/equipment", equipmentRoutes);

    // Bookings and Payments
    app.use("/api/bookings", bookingRoutes);
    app.use("/api/payments", paymentRoutes);

    // Analytics
    app.use("/api/analytics", analyticsRoutes);

    // Shared Customer / Owner / Admin Profile
    app.use("/api/profile", profileRoutes);

    // Admin Management
    app.use("/api/admin", adminManagementRoutes);

    // General protected route
    app.get("/api/protected", verifyToken, (req, res) => {
      return res.status(200).json({
        success: true,
        message: "You have accessed a protected route",
        userId: req.auth.userId,
      });
    });

    // Customer test
    app.get(
      "/api/customer/test",
      verifyToken,
      verifyCustomer,
      (req, res) => {
        return res.status(200).json({
          success: true,
          message: "Customer access granted",
          userId: req.auth.userId,
          role: req.auth.role,
        });
      },
    );

    // Owner test
    app.get(
      "/api/owner/test",
      verifyToken,
      verifyOwner,
      (req, res) => {
        return res.status(200).json({
          success: true,
          message: "Owner access granted",
          userId: req.auth.userId,
          role: req.auth.role,
        });
      },
    );

    // Admin test
    app.get(
      "/api/admin/test",
      verifyToken,
      verifyAdmin,
      (req, res) => {
        return res.status(200).json({
          success: true,
          message: "Admin access granted",
          userId: req.auth.userId,
          role: req.auth.role,
        });
      },
    );

    app.listen(PORT, () => {
      console.log(
        `EquipRent server running on http://localhost:${PORT}`,
      );

      console.log("Better Auth routes initialized");
      console.log("Stripe Webhook route initialized");
      console.log("Equipment API routes initialized");
      console.log("Booking API routes initialized");
      console.log("Payment Checkout API routes initialized");
      console.log("Analytics API routes initialized");
      console.log("Profile API routes initialized");
      console.log("Admin Management API routes initialized");
      console.log("Protected API routes initialized");

      if (
        process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
      ) {
        const reconciliationTimer = setInterval(() => {
          reconcileStripeReservations().catch((error) => {
            console.error(
              "Stripe reconciliation job failed:",
              error.message,
            );
          });
        }, 60 * 1000);

        reconciliationTimer.unref();
      }
    });
  } catch (error) {
    console.error(
      "Failed to start server:",
      error.message,
    );

    process.exit(1);
  }
};

startServer();