import { Router } from "express";
import { createProduct } from "../controllers/product.controller.js";

const router = Router();

router.post("/api/products", createProduct);

export default router;