const mongoose = require("mongoose");

const searchAnalyticsSchema = new mongoose.Schema(
  {
    term: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    originalTerm: {
      type: String,
      default: "",
      trim: true,
    },

    resultCount: {
      type: Number,
      default: 0,
    },

    hadResults: {
      type: Boolean,
      default: false,
      index: true,
    },

    filters: {
      brand: String,
      strength: String,
      flavour: String,
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

    ip: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.SearchAnalytics ||
  mongoose.model("SearchAnalytics", searchAnalyticsSchema);
