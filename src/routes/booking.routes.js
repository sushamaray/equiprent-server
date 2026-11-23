
import { Router } from "express";

import { verifyToken } from "../middleware/verifyToken.js";

import {
  verifyCustomer,
  verifyOwner,
} from "../middleware/verifyRole.js";

import {
  createBooking,
  getOwnerBookings,
  confirmBooking,
  rejectBooking,
  cancelBooking,
} from "../controllers/booking.controller.js";

import {
  getCustomerBookings,
} from "../controllers/customerBookings.controller.js";

const router = Router();

// Direct booking creation remains disabled.
// Customers must complete Stripe Checkout.
router.post(
  "/",
  verifyToken,
  verifyCustomer,
  createBooking,
);

// Customer views their own bookings
// with equipment names from MongoDB.
router.get(
  "/my",
  verifyToken,
  verifyCustomer,
  getCustomerBookings,
);

// Owner views bookings for their own equipment.
router.get(
  "/owner",
  verifyToken,
  verifyOwner,
  getOwnerBookings,
);

// Owner confirms a pending booking.
router.patch(
  "/:id/confirm",
  verifyToken,
  verifyOwner,
  confirmBooking,
);

// Owner rejects a pending, unpaid booking.
router.patch(
  "/:id/reject",
  verifyToken,
  verifyOwner,
  rejectBooking,
);

// Customer cancels their own pending,
// unpaid booking.
router.patch(
  "/:id/cancel",
  verifyToken,
  verifyCustomer,
  cancelBooking,
);

export default router;