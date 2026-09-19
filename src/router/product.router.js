import { Router } from "express";
import {
  createProduct,
  getAllProduct,
} from "../controllers/product.controller.js";

const router = Router();
router.get("/api/products", getAllProduct);

export default router;