import { Router } from "express";
import {
  getAllProduct,
  getProduct,
  getProductLogs,
  updateProduct,
} from "../controllers/product.controller.js";
import { upload } from "../middleware/multer.middleware.js";

const router = Router();

router.get("/api/products/logs", getProductLogs);
router.get("/api/products", getAllProduct);
router.get("/api/products/:id", getProduct);
router
  .route("/api/products/:id")
  .patch(upload.array("media", 10), updateProduct);

export default router;