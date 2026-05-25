const mongoose = require("mongoose");

const pageViewSchema = new mongoose.Schema(
  {
    path: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    fullPath: {
      type: String,
      default: "",
      trim: true,
    },

    visitorId: {
      type: String,
      default: "",
      index: true,
    },

    sessionId: {
      type: String,
      default: "",
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    referrer: {
      type: String,
      default: "",
      trim: true,
    },

    userAgent: {
      type: String,
      default: "",
      trim: true,
    },

    ipHash: {
      type: String,
      default: "",
      index: true,
    },
  },
  { timestamps: true }
);

pageViewSchema.index({ createdAt: -1 });
pageViewSchema.index({ path: 1, createdAt: -1 });

module.exports =
  mongoose.models.PageView ||
  mongoose.model("PageView", pageViewSchema);
