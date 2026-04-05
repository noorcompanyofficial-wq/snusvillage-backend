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

  isVerified: { type: Boolean, default: false },

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
