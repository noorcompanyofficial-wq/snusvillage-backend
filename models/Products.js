const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },

    description: {
      type: String,
      required: true,
    },

    strength: {
      type: String,
      enum: ["LOW", "MEDIUM", "STRONG", "X-STRONG", "EXTREME"],
      required: true,
    },
    nicotine: {
      type: String,
      require: true,
    },

    pouchesPerCan: {
      type: Number,
      default: 20,
      min: 0,
    },

    price: {
      type: Number,
      required: true,
    },

    discountPrice: {
      type: Number,
      default: 0,
    },

    images: [String],

    brand: {
      type: String,
      required: true,
    },

    flavour: {
      type: String,
    },

    category: {
      type: String,
      default: "general",
    },

    format: {
      type: String,
      enum: ["", "All White", "Original", "Slim", "Mini"],
      default: "",
    },

    sku: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    barcode: {
      type: String,
      default: "",
      trim: true,
    },

    supplier: {
      type: String,
      default: "",
      trim: true,
    },

    supplierCode: {
      type: String,
      default: "",
      trim: true,
    },

    costPrice: {
      type: Number,
      default: 0,
    },

    stock: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isFeatured: {
      type: Boolean,
      default: false,
    },

    isBestSeller: {
      type: Boolean,
      default: false,
    },

    showSaleBadge: {
      type: Boolean,
      default: false,
    },

    seoTitle: {
      type: String,
      default: "",
      trim: true,
    },

    seoDescription: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
