import { Router } from "express";
import shopify from "../config/shopify.js";

const router = Router();

router.get(shopify.config.auth.path, shopify.auth.begin());
router.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

export default router;