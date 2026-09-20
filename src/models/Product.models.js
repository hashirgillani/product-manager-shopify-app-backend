import mongoose from "mongoose";

const ProductSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    tags: {
      type: String,
      default: "",
    },
    vendor: {
      type: String,
      default: "",
    },
    productType: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      default: 0,
    },
    handle: {
      type: String,
      default: "",
    },
    seoTitle: {
      type: String,
      default: "",
    },
    seoDescription: {
      type: String,
      default: "",
    },
    featuredImage: {
      type: String,
      default: "",
    },
    media: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DRAFT", "ARCHIVED"],
      default: "ACTIVE",
    },
    shopId: {
      type: String, 
      required: true,
      index: true,
    },
    shopifyProductId: {
      type: String, 
    },
  },
  { timestamps: true }
);

export const Product = mongoose.model("Product", ProductSchema);