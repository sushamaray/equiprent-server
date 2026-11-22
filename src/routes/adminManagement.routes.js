
import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { verifyAdmin } from "../middleware/verifyRole.js";

import {
  getAllUsers,
  changeUserRole,
  getAllAdminEquipment,
  adminDeleteEquipment,
  getAllAdminRentals,
} from "../controllers/adminManagement.controller.js";

const router = Router();

router.use(verifyToken, verifyAdmin);

router.get("/users", getAllUsers);
router.patch("/users/:id/role", changeUserRole);

router.get("/equipment", getAllAdminEquipment);
router.delete("/equipment/:id", adminDeleteEquipment);

router.get("/rentals", getAllAdminRentals);

export default router;