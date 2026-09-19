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
    price: {
      type: Number,
      default: 0,
    },
    featuredImage: {
      type: String, 
      default: "",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "ARCHIVED"],
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