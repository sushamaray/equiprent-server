
import { Router } from "express";

import { verifyToken } from "../middleware/verifyToken.js";

import {
  verifyOwner,
  verifyAdmin,
} from "../middleware/verifyRole.js";

import {
  getAdminAnalytics,
  getOwnerAnalytics,
} from "../controllers/analytics.controller.js";

const router = Router();

router.get(
  "/admin",
  verifyToken,
  verifyAdmin,
  getAdminAnalytics,
);

router.get(
  "/owner",
  verifyToken,
  verifyOwner,
  getOwnerAnalytics,
);

export default router;