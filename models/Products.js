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

    stock: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Product", productSchema);
