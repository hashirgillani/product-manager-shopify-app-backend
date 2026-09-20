import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "../config/shopify.js";
import { Product } from "../models/Product.models.js";
import uploadOnCloudinary from "../utils/cloudinary.js";

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
        featuredImage {
          url
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
    featuredImage {
      url
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

const UPDATE_PRODUCT_QUERY = `mutation productUpdate($product: ProductInput!) {
  productUpdate(product: $product) {
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

const MEDIA_CREATE_QUERY = `mutation mediaCreate($productId: ID!, $media: [CreateMediaInput!]!) {
  mediaCreate(productId: $productId, media: $media) {
    media {
      id
      alt
      image {
        url
      }
    }
    mediaUserErrors {
      field
      message
    }
  }
}`;

export const updateProduct = async (req, res) => {
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
    } = req.body;

    let featuredImageUrl = req.body.featuredImage;

    if (req.file) {
      const uploaded = await uploadOnCloudinary(req.file.path);
      if (!uploaded) {
        return res.status(500).json({ error: "Failed to upload image" });
      }
      featuredImageUrl = uploaded.secure_url ?? uploaded.url;
    }

    const productInput = { id: productId };
    if (title !== undefined) productInput.title = title;
    if (vendor !== undefined) productInput.vendor = vendor;
    if (productType !== undefined) productInput.productType = productType;
    if (status !== undefined) productInput.status = status.toUpperCase();
    if (body_html !== undefined) productInput.bodyHtml = body_html;
    if (tags !== undefined) {
      productInput.tags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    const updateResponse = await client.request(UPDATE_PRODUCT_QUERY, {
      variables: { product: productInput },
    });

    const updateErrors = updateResponse.data.productUpdate.userErrors;
    if (updateErrors.length) {
      return res.status(400).json({ userErrors: updateErrors });
    }

    if (featuredImageUrl) {
      const mediaResponse = await client.request(MEDIA_CREATE_QUERY, {
        variables: {
          productId,
          media: [
            {
              mediaContentType: "IMAGE",
              originalSource: featuredImageUrl,
              alt: title ?? "",
            },
          ],
        },
      });

      const mediaErrors = mediaResponse.data.mediaCreate.mediaUserErrors;
      if (mediaErrors.length) {
        return res.status(400).json({ userErrors: mediaErrors });
      }
    }

    const updated = await Product.findOneAndUpdate(
      { shopifyProductId: productId },
      {
        $set: {
          title: title ?? "",
          description: body_html ?? "",
          price:
            req.body.price !== undefined ? Number(req.body.price) : 0,
          featuredImage: featuredImageUrl ?? "",
          status: status ? status.toUpperCase() : "ACTIVE",
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      data: { product: updated },
    });
  } catch (error) {
    if (
      error instanceof GraphqlQueryError &&
      error.response?.body?.errors?.length
    ) {
      return res.status(400).json({ userErrors: error.response.body.errors });
    }
    console.error("Error updating product:", error);
    return res.status(500).json({ error: "Failed to update product" });
  }
};