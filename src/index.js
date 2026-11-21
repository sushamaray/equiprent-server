
import express from "express";
import cors from "cors";
import "dotenv/config";

import { toNodeHandler } from "better-auth/node";

import { connectDB } from "./config/db.js";
import { createAuth } from "./config/auth.js";
import { verifyToken } from "./middleware/verifyToken.js";

const app = express();

const PORT = process.env.PORT || 5000;

// CORS middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
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

    // Better Auth routes (Express 5)
    app.all("/api/auth/*splat", toNodeHandler(auth));

    // JSON middleware must come after Better Auth
    app.use(express.json());

    // Protected test route
    app.get("/api/protected", verifyToken, (req, res) => {
      res.status(200).json({
        success: true,
        message: "You have accessed a protected route",
        userId: req.auth.userId,
      });
    });

    // Start Express server
    app.listen(PORT, () => {
      console.log(
        `EquipRent server running on http://localhost:${PORT}`
      );
      console.log("Better Auth routes initialized");
      console.log("Protected API route initialized");
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
