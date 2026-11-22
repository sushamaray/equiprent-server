
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
import { reconcileStripeReservations } from "./services/stripeReconciliation.service.js";

import {
  handleStripeWebhook,
} from "./controllers/stripeWebhook.controller.js";

import analyticsRoutes from "./routes/analytics.routes.js";

const app = express();

const PORT = process.env.PORT || 5000;

// CORS middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "EquipRent API is running",
  });
});

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});

// Start the application
const startServer = async () => {
  try {
    // Connect to MongoDB first
    await connectDB();

    // Initialize Better Auth
    const auth = createAuth();

    // Better Auth routes must come before express.json()
    const authHandler = toNodeHandler(auth);
    app.all("/api/auth/*splat", async (req, res, next) => {
      try {
        await authHandler(req, res, next);
      } catch (error) {
        console.error("Better Auth request handler failed:", error.message);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Authentication service is temporarily unavailable",
          });
        } else {
          res.destroy(error);
        }
      }
    });

    // IMPORTANT:
    // Stripe webhooks require the original raw body.
    // Register this route BEFORE express.json().
    //
    // Stripe signature verification happens inside
    // handleStripeWebhook.
    app.post(
      "/api/stripe/webhook",
      express.raw({
        type: "application/json",
      }),
      handleStripeWebhook,
    );

    // Parse JSON requests after Better Auth
    // and the Stripe webhook route.
    app.use(express.json());

    // Equipment API routes
    app.use("/api/equipment", equipmentRoutes);

    // Booking API routes
    app.use("/api/bookings", bookingRoutes);

    // Customer Stripe Checkout API routes
    app.use("/api/payments", paymentRoutes);
    app.use("/api/analytics", analyticsRoutes);

    // Protected test route
    app.get("/api/protected", verifyToken, (req, res) => {
      res.status(200).json({
        success: true,
        message: "You have accessed a protected route",
        userId: req.auth.userId,
      });
    });

    // Customer-only test route
    app.get(
      "/api/customer/test",
      verifyToken,
      verifyCustomer,
      (req, res) => {
        res.status(200).json({
          success: true,
          message: "Customer access granted",
          userId: req.auth.userId,
          role: req.auth.role,
        });
      },
    );

    // Owner-only test route
    app.get(
      "/api/owner/test",
      verifyToken,
      verifyOwner,
      (req, res) => {
        res.status(200).json({
          success: true,
          message: "Owner access granted",
          userId: req.auth.userId,
          role: req.auth.role,
        });
      },
    );

    // Admin-only test route
    app.get(
      "/api/admin/test",
      verifyToken,
      verifyAdmin,
      (req, res) => {
        res.status(200).json({
          success: true,
          message: "Admin access granted",
          userId: req.auth.userId,
          role: req.auth.role,
        });
      },
    );

    // Start Express server
    app.listen(PORT, () => {
      console.log(
        `EquipRent server running on http://localhost:${PORT}`,
      );

      console.log("Better Auth routes initialized");
      console.log("Stripe Webhook route initialized");
      console.log("Equipment API routes initialized");
      console.log("Booking API routes initialized");
      console.log("Payment Checkout API routes initialized");
      console.log("Protected API routes initialized");

      if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
        const reconciliationTimer = setInterval(() => {
          reconcileStripeReservations().catch((error) => {
            console.error("Stripe reconciliation job failed:", error.message);
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
