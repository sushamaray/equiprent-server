
import { Router } from "express";

import { verifyToken } from "../middleware/verifyToken.js";
import { verifyCustomer } from "../middleware/verifyRole.js";

import {
  createBooking,
  getMyBookings,
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

// Customer cancels their own pending, unpaid booking
router.patch(
  "/:id/cancel",
  verifyToken,
  verifyCustomer,
  cancelBooking
);

export default router;