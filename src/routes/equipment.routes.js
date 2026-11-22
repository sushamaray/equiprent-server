
import { Router } from "express";

import { verifyToken } from "../middleware/verifyToken.js";

import {
  verifyOwner,
  verifyAdmin,
} from "../middleware/verifyRole.js";

import {
  createEquipment,
  getAllEquipment,
  getEquipmentById,
  getMyEquipment,
  updateEquipment,
  deleteEquipment,
  approveEquipment,
  rejectEquipment,
} from "../controllers/equipment.controller.js";

import {
  receiveEquipmentImage,
} from "../middleware/equipmentImageUpload.js";

import {
  uploadEquipmentImage,
} from "../controllers/equipmentImage.controller.js";

const router = Router();

// Public: View approved and available equipment
router.get("/", getAllEquipment);

// Protected: Owners can view their own equipment
router.get(
  "/my",
  verifyToken,
  verifyOwner,
  getMyEquipment
);

// Protected: Owners can upload equipment images
router.post(
  "/upload-image",
  verifyToken,
  verifyOwner,
  receiveEquipmentImage,
  uploadEquipmentImage
);

// Public: View approved equipment details
router.get("/:id", getEquipmentById);

// Protected: Only Owners can create equipment
router.post(
  "/",
  verifyToken,
  verifyOwner,
  createEquipment
);

// Protected: Only the actual Owner can update equipment
router.patch(
  "/:id",
  verifyToken,
  verifyOwner,
  updateEquipment
);

// Protected: Only the actual Owner can soft-delete equipment
router.delete(
  "/:id",
  verifyToken,
  verifyOwner,
  deleteEquipment
);

// Protected: Only Admins can approve equipment
router.patch(
  "/:id/approve",
  verifyToken,
  verifyAdmin,
  approveEquipment
);

// Protected: Only Admins can reject equipment
router.patch(
  "/:id/reject",
  verifyToken,
  verifyAdmin,
  rejectEquipment
);

export default router;