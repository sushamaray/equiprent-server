
import { Router } from "express";

import { verifyToken } from "../middleware/verifyToken.js";
import { verifyOwner } from "../middleware/verifyRole.js";

import {
  createEquipment,
  getAllEquipment,
  getEquipmentById,
  getMyEquipment,
  updateEquipment,
  deleteEquipment,
} from "../controllers/equipment.controller.js";

const router = Router();

// Public: View available equipment
router.get("/", getAllEquipment);

// Protected: Owners can view only their own equipment
router.get(
  "/my",
  verifyToken,
  verifyOwner,
  getMyEquipment
);

// Public: View single equipment details
router.get("/:id", getEquipmentById);

// Protected: Only Owners can create equipment
router.post(
  "/",
  verifyToken,
  verifyOwner,
  createEquipment
);

// Protected: Only the equipment Owner can update it
router.patch(
  "/:id",
  verifyToken,
  verifyOwner,
  updateEquipment
);

// Protected: Only the equipment Owner can delete it
router.delete(
  "/:id",
  verifyToken,
  verifyOwner,
  deleteEquipment
);

export default router;