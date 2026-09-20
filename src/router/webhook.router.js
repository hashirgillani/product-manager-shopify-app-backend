import { Router } from "express";
import shopify from "../config/shopify.js";
import PrivacyWebhookHandlers from "../controllers/privacy.controller.js";
import AdminWebhookHandlers from "../controllers/admin.webhook.controller.js";

const router = Router();

router.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({
    webhookHandlers: { ...PrivacyWebhookHandlers, ...AdminWebhookHandlers },
  })
);

export default router;