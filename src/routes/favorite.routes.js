
import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { verifyCustomer } from "../middleware/verifyRole.js";

import {
  getMyFavorites,
  addFavorite,
  removeFavorite,
} from "../controllers/favorite.controller.js";

const router = Router();

router.use(verifyToken, verifyCustomer);

router.get("/", getMyFavorites);
router.post("/", addFavorite);
router.delete("/:equipmentId", removeFavorite);

export default router;