
import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { verifyAdmin } from "../middleware/verifyRole.js";

import {
  getAllUsers,
  changeUserRole,
  getAllAdminEquipment,
  adminUpdateEquipment,
  adminDeleteEquipment,
  getAllAdminRentals,
} from "../controllers/adminManagement.controller.js";

const router = Router();

router.use(verifyToken, verifyAdmin);

router.get("/users", getAllUsers);
router.patch("/users/:id/role", changeUserRole);

router.get("/equipment", getAllAdminEquipment);
router.patch("/equipment/:id", adminUpdateEquipment);
router.delete("/equipment/:id", adminDeleteEquipment);

router.get("/rentals", getAllAdminRentals);

export default router;