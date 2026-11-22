
import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";

import {
  getMyProfile,
  updateMyProfile,
} from "../controllers/profile.controller.js";

const router = Router();

router.get("/me", verifyToken, getMyProfile);
router.patch("/me", verifyToken, updateMyProfile);

export default router;