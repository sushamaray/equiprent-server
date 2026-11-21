
import { Router } from "express";

import { verifyToken } from "../middleware/verifyToken.js";

import {
  verifyCustomer,
  verifyOwner,
} from "../middleware/verifyRole.js";

import {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  confirmBooking,
  cancelBooking,
} from "../controllers/booking.controller.js";

const router = Router();

// Customer creates a new equipment booking
router.post(
  "/",
  verifyToken,
  verifyCustomer,
  createBooking
);

// Customer views their own bookings
router.get(
  "/my",
  verifyToken,
  verifyCustomer,
  getMyBookings
);

// Owner views bookings for their own equipment
router.get(
  "/owner",
  verifyToken,
  verifyOwner,
  getOwnerBookings
);

// Owner confirms a pending booking for their equipment
router.patch(
  "/:id/confirm",
  verifyToken,
  verifyOwner,
  confirmBooking
);

// Customer cancels their own pending, unpaid booking
router.patch(
  "/:id/cancel",
  verifyToken,
  verifyCustomer,
  cancelBooking
);

export default router;