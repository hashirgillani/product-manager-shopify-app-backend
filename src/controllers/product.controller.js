import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "../config/shopify.js";
import { Product } from "../models/Product.models.js";

;

const CREATE_PRODUCT_MUTATION = `mutation CreateProduct($input: ProductCreateInput!) {
  productCreate(product: $input) {
    product {
      id
      title
      status
      variants(first: 1) {
        nodes {
          id
          price
        }
      }
    }
    userErrors {
      field
      message
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

    const variables = { first: limit, after };
    if (status) {
      variables.query = `status:${status.toUpperCase()}`;
    }

    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.query({
      data: GET_PRODUCTS_QUERY,
      variables,
    });

    const { products } = response.body.data;

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