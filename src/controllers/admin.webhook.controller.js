import { DeliveryMethod } from "@shopify/shopify-api";
import { Product } from "../models/Product.models.js";
import { ProductLog } from "../models/ProductLog.models.js";

const normalizeTags = (tags) =>
  (Array.isArray(tags) ? tags.join(",") : String(tags ?? ""))
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(", ");

const buildSnapshotFields = (payload) => {
  const firstVariant = payload.variants?.[0];
  const imageUrls = (payload.images ?? [])
    .map((image) => image?.src ?? "")
    .filter(Boolean);
  return {
    title: payload.title ?? "",
    description: payload.body_html ?? "",
    tags: normalizeTags(payload.tags),
    vendor: payload.vendor ?? "",
    productType: payload.product_type ?? "",
    handle: payload.handle ?? "",
    price: Number(firstVariant?.price ?? 0),
    featuredImage: payload.image?.src || imageUrls[0] || "",
    media: imageUrls,
    status: String(payload.status ?? "ACTIVE").toUpperCase(),
  };
};

const stringify = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const buildWebhookChanges = (payload, snapshot) => {
  const changes = [];
  const next = buildSnapshotFields(payload);

  const push = (field, label, before, after) => {
    if (stringify(before) === stringify(after)) return;
    changes.push({ field, label, before: before ?? null, after: after ?? null });
  };

  push("title", "Title", snapshot.title, next.title);
  push("handle", "Handle", snapshot.handle, next.handle);
  push("description", "Description", snapshot.description, next.description);
  push("tags", "Tags", snapshot.tags, next.tags);
  push("vendor", "Vendor", snapshot.vendor, next.vendor);
  push("productType", "Product type", snapshot.productType, next.productType);
  push("status", "Status", snapshot.status, next.status);
  push("price", "Price", snapshot.price, next.price);

  const beforeMedia = [...(snapshot.media ?? [])].sort();
  const afterMedia = [...(next.media ?? [])].sort();
  if (afterMedia.length || beforeMedia.length) {
    push(
      "media",
      "Images",
      beforeMedia.length ? beforeMedia.join(", ") : null,
      afterMedia.length ? afterMedia.join(", ") : null
    );
  }

  return changes;
};

export default {
  PRODUCTS_UPDATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      try {
        const payload = JSON.parse(body);
        if (!payload?.id) return;

        const shopifyProductId =
          payload.admin_graphql_api_id || `gid://shopify/Product/${payload.id}`;

        if (webhookId) {
          const existing = await ProductLog.findOne({ webhookId, shopId: shop });
          if (existing) return;
        }

        const snapshot = await Product.findOne({
          shopId: shop,
          shopifyProductId,
        });

        if (!snapshot) {
          await Product.create({
            shopId: shop,
            shopifyProductId,
            productId: String(payload.id),
            ...buildSnapshotFields(payload),
          });
          await ProductLog.create({
            shopId: shop,
            shopifyProductId,
            productId: String(payload.id),
            productTitle: payload.title ?? "",
            source: "shopify",
            webhookId,
            changes: [
              {
                field: "update",
                label: "Updated from Shopify Admin",
                before: null,
                after: null,
              },
            ],
          });
          return;
        }

        const changes = buildWebhookChanges(payload, snapshot);
        if (changes.length) {
          await ProductLog.create({
            shopId: shop,
            shopifyProductId,
            productId: String(payload.id),
            productTitle: payload.title ?? snapshot.title ?? "",
            source: "shopify",
            webhookId,
            changes,
          });
        }

        await Product.updateOne(
          { shopId: shop, shopifyProductId },
          { $set: buildSnapshotFields(payload) }
        );
      } catch (error) {
        console.error("Error handling PRODUCTS_UPDATE webhook:", error);
      }
    },
  },
};