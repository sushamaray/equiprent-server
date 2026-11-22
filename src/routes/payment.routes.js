
import { Router } from "express";

import {
  verifyToken,
} from "../middleware/verifyToken.js";

import {
  verifyCustomer,
} from "../middleware/verifyRole.js";

import {
  createCheckoutSession,
  getCheckoutStatus,
} from "../controllers/payment.controller.js";

const router = Router();

// Customer creates a hosted Stripe Checkout Session.
// Authentication and Customer role are required.
//
// The final paid booking and payment record
// will be created by the verified Stripe webhook,
// not by this endpoint.
router.post(
  "/checkout-session",
  verifyToken,
  verifyCustomer,
  createCheckoutSession
);

router.get(
  "/checkout-session/:sessionId",
  verifyToken,
  verifyCustomer,
  getCheckoutStatus,
);

export default router;
