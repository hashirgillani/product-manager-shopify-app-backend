import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "../config/shopify.js";
import { Product } from "../models/Product.models.js";

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

export const createProduct = async (req, res) => {
  try {
    const session = res.locals.shopify.session;

    const { title, description, price, status } = req.body ?? {};

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const input = { title };
    if (description) input.descriptionHtml = description;
    if (price) input.variants = [{ price: String(price) }];
    if (status) input.status = status;

    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.query({
      data: CREATE_PRODUCT_MUTATION,
      variables: { input },
    });

    const { productCreate } = response.body.data;

    if (productCreate.userErrors.length > 0) {
      return res.status(400).json({ userErrors: productCreate.userErrors });
    }

    const product = await Product.create({
      title,
      description: description ?? "",
      price: Number(productCreate.product.variants.nodes[0]?.price) || 0,
      status: status ?? "ACTIVE",
      shopId: session.shop,
      shopifyProductId: productCreate.product.id.split("/").pop(),
    });

    return res.status(201).json({ data: product });
  } catch (error) {
    if (
      error instanceof GraphqlQueryError &&
      error.response?.body?.errors?.length
    ) {
      return res.status(400).json({ userErrors: error.response.body.errors });
    }
    console.error("Error creating product:", error);
    return res.status(500).json({ error: "Failed to create product" });
  }
};