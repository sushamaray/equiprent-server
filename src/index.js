
import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
}));

app.use(express.json());

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

// Start server
app.listen(PORT, () => {
  console.log(`EquipRent server running on http://localhost:${PORT}`);
});
