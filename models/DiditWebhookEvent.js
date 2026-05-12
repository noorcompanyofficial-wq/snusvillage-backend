const mongoose = require("mongoose");

const diditWebhookEventSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    webhookType: { type: String, required: true },
    timestamp: { type: Number, required: true },
    status: String,
    vendorData: String,
  },
  { timestamps: true }
);

diditWebhookEventSchema.index({ sessionId: 1, webhookType: 1, timestamp: 1 }, { unique: true });

module.exports = mongoose.model("DiditWebhookEvent", diditWebhookEventSchema);
