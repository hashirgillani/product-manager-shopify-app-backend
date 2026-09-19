import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "../config/shopify.js";

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