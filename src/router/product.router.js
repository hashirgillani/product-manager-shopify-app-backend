import { Router } from "express";
import {
  getAllProduct,
  getProduct,
} from "../controllers/product.controller.js";

const router = Router();

router.get("/api/products", getAllProduct);
router.get("/api/products/:id", getProduct);

export default router;