const mongoose = require("mongoose");

const adminAuditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    adminEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    adminRole: {
      type: String,
      default: "",
      trim: true,
    },

    action: {
      type: String,
      required: true,
      trim: true,
    },

    targetType: {
      type: String,
      default: "",
      trim: true,
    },

    targetId: {
      type: String,
      default: "",
      trim: true,
    },

    summary: {
      type: String,
      default: "",
      trim: true,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ip: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.AdminAuditLog ||
  mongoose.model("AdminAuditLog", adminAuditLogSchema);
