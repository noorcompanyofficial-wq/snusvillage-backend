const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  birthDate: Date,

  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
  },

  password: String,

  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },

  traderStatus: {
    type: String,
    enum: ["none", "pending", "approved", "rejected"],
    default: "none",
  },

  isVerified: { type: Boolean, default: false },

  // DIDIT KYC
  didit: {
    sessionId: String,
    workflowId: String,
    status: {
      type: String,
      enum: [
        "Not Started",
        "In Progress",
        "Awaiting User",
        "In Review",
        "Approved",
        "Declined",
        "Resubmitted",
        "Abandoned",
        "Expired",
        "Kyc Expired",
      ],
      default: "Not Started",
    },
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    declinedAt: Date,
    lastWebhookAt: Date,
    decision: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed,
  },

  //  VERIFY
  verifyCode: String,
  verifyCodeExpire: Date,

  //  RESET PASSWORD
  resetCode: String,
  resetCodeExpire: Date,

  //  SECURITY
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,

  //  AUTH
  refreshToken: String,

  //  DEVICE TRACKING
  device: String,
  ip: String,

  //  RESEND COOLDOWN
  suspiciousIPs: [String],
  blockedIPs: [String],
  lastResend: Date,
});

module.exports = mongoose.model("User", userSchema);
