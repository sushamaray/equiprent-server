
import { Router } from "express";

import { verifyToken } from "../middleware/verifyToken.js";

import {
  verifyOwner,
  verifyAdmin,
} from "../middleware/verifyRole.js";

import {
  createEquipment,
  getAllEquipment,
  getMyEquipment,
  updateEquipment,
  deleteEquipment,
  approveEquipment,
  rejectEquipment,
} from "../controllers/equipment.controller.js";

import {
  getEquipmentDetails,
} from "../controllers/equipmentDetails.controller.js";

import {
  receiveEquipmentImage,
} from "../middleware/equipmentImageUpload.js";

import {
  uploadEquipmentImage,
} from "../controllers/equipmentImage.controller.js";

import {
  getPendingEquipment,
} from "../controllers/adminEquipment.controller.js";

import favoriteRoutes from "./favorite.routes.js";

const router = Router();

// Public equipment catalog
router.get("/", getAllEquipment);

// Customer favorites
router.use("/favorites", favoriteRoutes);

// Owner equipment
router.get(
  "/my",
  verifyToken,
  verifyOwner,
  getMyEquipment,
);

// Admin pending equipment
router.get(
  "/admin/pending",
  verifyToken,
  verifyAdmin,
  getPendingEquipment,
);

// Owner image upload
router.post(
  "/upload-image",
  verifyToken,
  verifyOwner,
  receiveEquipmentImage,
  uploadEquipmentImage,
);

// Equipment details with owner name
router.get("/:id", getEquipmentDetails);

// Owner creates equipment
router.post(
  "/",
  verifyToken,
  verifyOwner,
  createEquipment,
);

// Owner updates equipment
router.patch(
  "/:id",
  verifyToken,
  verifyOwner,
  updateEquipment,
);

// Owner soft-deletes equipment
router.delete(
  "/:id",
  verifyToken,
  verifyOwner,
  deleteEquipment,
);

// Admin approves equipment
router.patch(
  "/:id/approve",
  verifyToken,
  verifyAdmin,
  approveEquipment,
);

// Admin rejects equipment
router.patch(
  "/:id/reject",
  verifyToken,
  verifyAdmin,
  rejectEquipment,
);

export default router;