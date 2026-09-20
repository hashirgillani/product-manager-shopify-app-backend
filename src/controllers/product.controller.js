import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "../config/shopify.js";
import { Product } from "../models/Product.models.js";
import { ProductLog } from "../models/ProductLog.models.js";
import uploadOnCloudinary, { deleteFile } from "../utils/cloudinary.js";

const GET_PRODUCTS_QUERY = `query GetProducts($first: Int!, $after: String, $query: String) {
  products(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        title
        status
        handle
        vendor
        productType
        seo {
          title
          description
        }
        featuredImage {
          url
        }
        media(first: 10) {
          nodes {
            id
            ... on MediaImage {
              image {
                url
              }
            }
          }
        }
        variants(first: 1) {
          nodes {
            id
            title
            price
            sku
            inventoryQuantity
          }
        }
        createdAt
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

const GET_PRODUCT_QUERY = `query GetProduct($id: ID!) {
  product(id: $id) {
    id
    title
    status
    handle
    vendor
    productType
    descriptionHtml
    tags
    seo {
      title
      description
    }
    featuredImage {
      url
    }
    media(first: 10) {
      nodes {
        id
        alt
        ... on MediaImage {
          image {
            url
          }
        }
      }
    }
    variants(first: 1) {
      nodes {
        id
        title
        price
        sku
        inventoryQuantity
      }
    }
    createdAt
  }
}`;

export const getProduct = async (req, res) => {
  try {
    const session = res.locals.shopify.session;

    const id = req.params.id;
    const variables = { id: `gid://shopify/Product/${id}` };

    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.request(GET_PRODUCT_QUERY, { variables });

    const { product } = response.data;

    return res.status(200).json({
      data: { product },
    });
  } catch (error) {
    if (
      error instanceof GraphqlQueryError &&
      error.response?.body?.errors?.length
    ) {
      return res.status(400).json({ userErrors: error.response.body.errors });
    }
    console.error("Error fetching product:", error);
    return res.status(500).json({ error: "Failed to fetch product" });
  }
};

const FIELD_DEFS = {
  title: {
    label: "Title",
    before: (product) => product?.title ?? "",
    after: (body) => body.title,
  },
  vendor: {
    label: "Vendor",
    before: (product) => product?.vendor ?? "",
    after: (body) => body.vendor,
  },
  productType: {
    label: "Product type",
    before: (product) => product?.productType ?? "",
    after: (body) => body.productType,
  },
  status: {
    label: "Status",
    before: (product) => materialize(product?.status),
    after: (body) => materialize(body.status).toUpperCase(),
  },
  body_html: {
    label: "Description",
    before: (product) => product?.descriptionHtml ?? "",
    after: (body) => body.body_html,
  },
  handle: {
    label: "Handle",
    before: (product) => product?.handle ?? "",
    after: (body) => body.handle,
  },
  seoTitle: {
    label: "SEO title",
    before: (product) => product?.seo?.title ?? "",
    after: (body) => body.seoTitle,
  },
  seoDescription: {
    label: "SEO description",
    before: (product) => product?.seo?.description ?? "",
    after: (body) => body.seoDescription,
  },
  tags: {
    label: "Tags",
    before: (product) => (product?.tags ?? []).join(", "),
    after: (body) =>
      (body.tags ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .join(", "),
  },
  price: {
    label: "Price",
    before: (product) =>
      String(Number(product?.variants?.nodes?.[0]?.price ?? 0)),
    after: (body) => String(Number(body.price)),
  },
};

const materialize = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const buildChanges = (body, beforeProduct) => {
  const changes = [];
  for (const key of Object.keys(FIELD_DEFS)) {
    if (body[key] === undefined) continue;
    const definition = FIELD_DEFS[key];
    const before = materialize(definition.before(beforeProduct));
    const after = materialize(definition.after(body));
    if (before === after) continue;
    changes.push({
      field: key,
      label: definition.label,
      before: beforeProduct ? definition.before(beforeProduct) : null,
      after: definition.after(body),
    });
  }
  return changes;
};

export const getProductLogs = async (req, res) => {
  try {
    const { shop } = res.locals.shopify.session;

    let limit = parseInt(req.query.limit, 10);
    if (Number.isNaN(limit) || limit < 1) limit = 10;
    limit = Math.min(limit, 100);

    let page = parseInt(req.query.page, 10);
    if (Number.isNaN(page) || page < 1) page = 1;

    const filter = { shopId: shop };
    const total = await ProductLog.countDocuments(filter);
    const logs = await ProductLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      data: {
        logs,
        pageInfo: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching product logs:", error);
    return res.status(500).json({ error: "Failed to fetch product logs" });
  }
};

export const getAllProduct = async (req, res) => {
  try {
    const session = res.locals.shopify.session;

    let limit = parseInt(req.query.limit, 10);
    if (Number.isNaN(limit) || limit < 1) limit = 10;
    limit = Math.min(limit, 250);

    const after = req.query.cursor || null;
    const status = req.query.status;

    const variables = {
      first: limit,
      after,
      query: status ? `status:${status.toUpperCase()}` : null,
    };

    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.request(GET_PRODUCTS_QUERY, { variables });

    const { products } = response.data;

    return res.status(200).json({
      data: {
        products: products.edges.map((edge) => edge.node),
        pageInfo: products.pageInfo,
      },
    });
  } catch (error) {
    if (
      error instanceof GraphqlQueryError &&
      error.response?.body?.errors?.length
    ) {
      return res.status(400).json({ userErrors: error.response.body.errors });
    }
    console.error("Error fetching products:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
};

const UPDATE_PRODUCT_QUERY = `mutation productUpdate(
  $product: ProductUpdateInput!
  $media: [CreateMediaInput!]
) {
  productUpdate(product: $product, media: $media) {
    product {
      id
      title
      status
      handle
      vendor
      productType
    }
    userErrors {
      field
      message
    }
  }
}`;

const DELETE_MEDIA_QUERY = `mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
  productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
    mediaUserErrors {
      field
      message
    }
  }
}`;

const REORDER_MEDIA_QUERY = `mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
  productReorderMedia(id: $id, moves: $moves) {
    job {
      id
    }
    mediaUserErrors {
      field
      message
    }
  }
}`;

const getProductMedia = async (client, productId) => {
  const response = await client.request(GET_PRODUCT_QUERY, {
    variables: { id: productId },
  });
  const nodes = response.data.product?.media?.nodes ?? [];
  return nodes
    .map((node) => ({ id: node.id, url: node.image?.url ?? "" }))
    .filter((item) => item.url);
};

const urlToIdMap = (items) => new Map(items.map((item) => [item.url, item.id]));

export const updateProduct = async (req, res) => {
  const readGraphQLErrors = (error) => {
    const candidates = [
      error?.body?.errors,
      error?.body,
      error?.response?.body,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (Array.isArray(candidate?.graphQLErrors)) return candidate.graphQLErrors;
      if (Array.isArray(candidate?.errors)) return candidate.errors;
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  };

  try {
    const session = res.locals.shopify.session;
    const productId = `gid://shopify/Product/${req.params.id}`;
    const client = new shopify.api.clients.Graphql({ session });

    const {
      title,
      vendor,
      productType,
      status,
      body_html,
      tags,
      handle,
      seoTitle,
      seoDescription,
    } = req.body;

    const files = req.files ?? [];
    const removedMedia = JSON.parse(req.body.removedMedia || "[]");
    const mediaOrder = JSON.parse(req.body.mediaOrder || "[]");
    const featuredImage = req.body.featuredImage || "";

    let beforeProduct = null;
    try {
      const beforeResponse = await client.request(GET_PRODUCT_QUERY, {
        variables: { id: productId },
      });
      beforeProduct = beforeResponse.data.product;
    } catch {
      beforeProduct = null;
    }

    const newUrls = [];
    for (const file of files) {
      const uploaded = await uploadOnCloudinary(file.path);
      if (!uploaded) {
        return res.status(500).json({ error: "Failed to upload image" });
      }
      newUrls.push(uploaded.secure_url ?? uploaded.url);
    }

    const currentMedia = await getProductMedia(client, productId);
    const currentUrlToId = urlToIdMap(currentMedia);

    const removedIds = removedMedia
      .map((item) => currentUrlToId.get(item.url))
      .filter(Boolean);

    if (removedIds.length) {
      for (const item of removedMedia) {
        const url = item.url;
        if (url) {
          try {
            await deleteFile(url);
          } catch {
            // best-effort cleanup on Cloudinary
          }
        }
      }

      const deleteResponse = await client.request(DELETE_MEDIA_QUERY, {
        variables: { productId, mediaIds: removedIds },
      });
      const deleteErrors = deleteResponse.data.productDeleteMedia.mediaUserErrors;
      if (deleteErrors.length) {
        return res.status(400).json({ userErrors: deleteErrors });
      }
    }

    const productInput = { id: productId };
    if (title !== undefined) productInput.title = title;
    if (vendor !== undefined) productInput.vendor = vendor;
    if (productType !== undefined) productInput.productType = productType;
    if (status !== undefined) productInput.status = status.toUpperCase();
    if (body_html !== undefined) productInput.descriptionHtml = body_html;
    if (handle !== undefined) {
      productInput.handle = handle;
      productInput.redirectNewHandle = true;
    }
    if (seoTitle !== undefined || seoDescription !== undefined) {
      productInput.seo = {};
      if (seoTitle !== undefined) productInput.seo.title = seoTitle;
      if (seoDescription !== undefined) productInput.seo.description = seoDescription;
    }
    if (tags !== undefined) {
      productInput.tags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    const variables = { product: productInput };
    if (newUrls.length) {
      variables.media = newUrls.map((url) => ({
        mediaContentType: "IMAGE",
        originalSource: url,
        alt: title ?? "",
      }));
    }

    const updateResponse = await client.request(UPDATE_PRODUCT_QUERY, {
      variables,
    });
    const updateErrors = updateResponse.data.productUpdate.userErrors;
    if (updateErrors.length) {
      return res.status(400).json({ userErrors: updateErrors });
    }

    const refreshedMedia = await getProductMedia(client, productId);
    const refreshedUrlToId = urlToIdMap(refreshedMedia);

    const desiredOrder = [...mediaOrder, ...newUrls];
    const moves = desiredOrder
      .map((url, index) => ({
        id: refreshedUrlToId.get(url),
        newPosition: String(index),
      }))
      .filter((move) => Boolean(move.id));

    if (moves.length > 1) {
      const reorderResponse = await client.request(REORDER_MEDIA_QUERY, {
        variables: { id: productId, moves },
      });
      const reorderErrors = reorderResponse.data.productReorderMedia.mediaUserErrors;
      if (reorderErrors.length) {
        return res.status(400).json({ userErrors: reorderErrors });
      }
    }

    const featured = featuredImage || desiredOrder[0] || "";
    const updated = await Product.findOneAndUpdate(
      { shopifyProductId: productId },
      {
        $set: {
          title: title ?? "",
          description: body_html ?? "",
          handle: handle ?? "",
          seoTitle: seoTitle ?? "",
          seoDescription: seoDescription ?? "",
          price:
            req.body.price !== undefined ? Number(req.body.price) : 0,
          featuredImage: featured,
          media: desiredOrder,
          status: status ? status.toUpperCase() : "ACTIVE",
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    const mediaChanges = [];
    for (const item of removedMedia) {
      mediaChanges.push({
        field: "media",
        label: "Image removed",
        before: item.url || null,
        after: null,
      });
    }
    for (const url of newUrls) {
      mediaChanges.push({
        field: "media",
        label: "Image added",
        before: null,
        after: url,
      });
    }

    const changes = [...buildChanges(req.body, beforeProduct), ...mediaChanges];

    if (changes.length) {
      try {
        await ProductLog.create({
          shopId: session.shop,
          shopifyProductId: productId,
          productId: req.params.id,
          productTitle: title ?? beforeProduct?.title ?? "",
          changes,
        });
      } catch (logError) {
        console.error("Error saving product log:", logError);
      }
    }

    return res.status(200).json({
      data: { product: updated },
    });
  } catch (error) {
    const graphQLErrors = readGraphQLErrors(error);
    if (graphQLErrors.length) {
      const messages = graphQLErrors.map((e) => e.message ?? e);
      console.error("Shopify GraphQL errors:", messages);
      return res.status(400).json({ userErrors: messages });
    }
    console.error("Error updating product:", error);
    return res.status(500).json({ error: "Failed to update product" });
  }
};