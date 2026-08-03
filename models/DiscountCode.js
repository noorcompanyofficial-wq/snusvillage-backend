const mongoose = require("mongoose");

const discountCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    type: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
      default: "percentage",
    },

    value: {
      type: Number,
      required: true,
      min: 0,
    },

    minimumSpend: {
      type: Number,
      default: 0,
      min: 0,
    },

    usageLimit: {
      type: Number,
      default: 0,
      min: 0,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    appliesToBrand: {
      type: String,
      default: "",
      trim: true,
    },

    appliesToCategory: {
      type: String,
      default: "",
      trim: true,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // The one code the homepage welcome popup advertises — only one code
    // should ever have this set, enforced in the admin route, not here.
    isWelcomeDiscount: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

discountCodeSchema.pre("save", function () {
  if (this.code) {
    this.code = String(this.code).trim().toUpperCase();
  }
});

module.exports =
  mongoose.models.DiscountCode ||
  mongoose.model("DiscountCode", discountCodeSchema);
