
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

import {
  getPendingEquipment,
} from "../controllers/adminEquipment.controller.js";

const router = Router();

router.get("/", getAllEquipment);

router.get(
  "/my",
  verifyToken,
  verifyOwner,
  getMyEquipment
);

// Admin: View pending equipment
router.get(
  "/admin/pending",
  verifyToken,
  verifyAdmin,
  getPendingEquipment
);

// Owner: Upload equipment image
router.post(
  "/upload-image",
  verifyToken,
  verifyOwner,
  receiveEquipmentImage,
  uploadEquipmentImage
);

router.get("/:id", getEquipmentById);

router.post(
  "/",
  verifyToken,
  verifyOwner,
  createEquipment
);

router.patch(
  "/:id",
  verifyToken,
  verifyOwner,
  updateEquipment
);

router.delete(
  "/:id",
  verifyToken,
  verifyOwner,
  deleteEquipment
);

router.patch(
  "/:id/approve",
  verifyToken,
  verifyAdmin,
  approveEquipment
);

router.patch(
  "/:id/reject",
  verifyToken,
  verifyAdmin,
  rejectEquipment
);

export default router;