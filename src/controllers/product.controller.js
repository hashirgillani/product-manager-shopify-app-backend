import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "../config/shopify.js";
import { Product } from "../models/Product.models.js";
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