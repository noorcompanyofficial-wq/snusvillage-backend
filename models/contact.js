const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    subject: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    isReplied: { type: Boolean, default: false },
    repliedAt: { type: Date, default: null },
    replies: [
      {
        body: String,
        sentAt: {
          type: Date,
          default: Date.now,
        },
        sentBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", contactSchema);
