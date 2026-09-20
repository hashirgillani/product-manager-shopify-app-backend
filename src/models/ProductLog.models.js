import mongoose from "mongoose";

const ProductLogSchema = mongoose.Schema(
  {
    shopId: {
      type: String,
      required: true,
      index: true,
    },
    shopifyProductId: {
      type: String,
      required: true,
      index: true,
    },
    productId: {
      type: String,
    },
    productTitle: {
      type: String,
      default: "",
    },
    changes: [
      {
        field: {
          type: String,
          required: true,
        },
        label: {
          type: String,
          required: true,
        },
        before: {
          type: mongoose.Schema.Types.Mixed,
          default: null,
        },
        after: {
          type: mongoose.Schema.Types.Mixed,
          default: null,
        },
      },
    ],
  },
  { timestamps: true }
);

export const ProductLog = mongoose.model("ProductLog", ProductLogSchema);