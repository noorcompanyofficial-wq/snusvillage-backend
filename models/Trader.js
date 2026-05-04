const mongoose = require("mongoose");

const traderSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true },
    contactName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: String,
    phone: String,
    status: {
      type: String,
      enum: ["approved", "suspended"],
      default: "approved",
    },
    lastLoginAt: Date,
    lastLoginIp: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Trader", traderSchema);
