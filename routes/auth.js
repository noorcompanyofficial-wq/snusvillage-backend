const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const transporter = require("../config/mailer");
const { isGuest, isAuth } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimit");
const { generateRefreshToken } = require("../utils/jwt");
const UAParser = require("ua-parser-js");

// ================= GET =================
router.get("/register", isGuest, (req, res) => res.render("auth/register"));
router.get("/login", isGuest, (req, res) => res.render("auth/login"));
router.get("/verify", (req, res) => res.render("auth/verify"));
router.get("/forgot", (req, res) => res.render("auth/forgot"));
router.get("/reset-verify", (req, res) => res.render("auth/reset-verify"));
router.get("/reset", (req, res) => res.render("auth/reset"));

// ================= HELPERS =================
function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{6,}$/.test(password);
}

function calculateAge(birthDate) {
  const diff = Date.now() - new Date(birthDate).getTime();
  return new Date(diff).getUTCFullYear() - 1970;
}

// ================= REGISTER =================
router.post("/register", async (req, res) => {
  const { firstName, lastName, birthDate, email, password } = req.body;

  const age = calculateAge(birthDate);

  if (age < 18) {
    req.flash("error", "Only 18+ allowed");
    return res.redirect("/auth/register");
  }

  if (!isStrongPassword(password)) {
    req.flash(
      "error",
      "Password must be 6+ chars and include uppercase, lowercase number and symbol",
    );
    return res.redirect("/auth/register");
  }

  const exist = await User.findOne({ email });
  if (exist) {
    req.flash("error", "Email exists");
    return res.redirect("/auth/register");
  }

  const hashed = await bcrypt.hash(password, 10);
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  await User.create({
    firstName,
    lastName,
    birthDate,
    email,
    password: hashed,
    verifyCode: code,
    verifyCodeExpire: Date.now() + 10 * 60 * 1000,
  });

  await transporter.sendMail({
    to: email,
    subject: "Verify Code",
    text: `Code: ${code}`,
  });

  req.session.verifyEmail = email;
  res.redirect("/auth/verify");
});

// ================= RESEND VERIFY =================
router.post("/resend-code", async (req, res) => {
  if (!req.session.verifyEmail) {
    req.flash("error", "Session expired");
    return res.redirect("/auth/register");
  }

  const user = await User.findOne({ email: req.session.verifyEmail });
  if (!user) return res.redirect("/auth/register");

  //  cooldown
  if (user.lastResend && Date.now() - user.lastResend < 60000) {
    req.flash("error", "Wait 60 seconds");
    return res.redirect("/auth/verify");
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  user.verifyCode = code;
  user.verifyCodeExpire = Date.now() + 10 * 60 * 1000;
  user.lastResend = Date.now();

  await user.save();

  await transporter.sendMail({
    to: user.email,
    subject: "New Code",
    text: `Code: ${code}`,
  });

  req.flash("success", "Code resent!");
  res.redirect("/auth/verify");
});

// ================= RESEND RESET =================
router.post("/resend-reset", async (req, res) => {
  if (!req.session.resetEmail) {
    req.flash("error", "Session expired");
    return res.redirect("/auth/forgot");
  }

  const user = await User.findOne({ email: req.session.resetEmail });
  if (!user) return res.redirect("/auth/forgot");

  //  cooldown
  if (user.lastResend && Date.now() - user.lastResend < 60000) {
    req.flash("error", "Wait 60 seconds");
    return res.redirect("/auth/reset-verify");
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  user.resetCode = code;
  user.resetCodeExpire = Date.now() + 10 * 60 * 1000;
  user.lastResend = Date.now();

  await user.save();

  await transporter.sendMail({
    to: user.email,
    subject: "New Reset Code",
    text: `Code: ${code}`,
  });

  req.flash("success", "Code resent!");
  res.redirect("/auth/reset-verify");
});

// ================= VERIFY =================
router.post("/verify", async (req, res) => {
  const user = await User.findOne({ email: req.session.verifyEmail });

  if (!user || user.verifyCode !== req.body.code) {
    req.flash("error", "Invalid code");
    return res.redirect("/auth/verify");
  }

  if (user.verifyCodeExpire < Date.now()) {
    req.flash("error", "Expired code");
    return res.redirect("/auth/verify");
  }

  user.isVerified = true;
  user.verifyCode = null;

  await user.save();

  req.flash("success", "Verified!");
  res.redirect("/auth/login");
});

// ================= LOGIN =================
router.post("/login", authLimiter, async (req, res) => {
  const { email, password, remember } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    req.flash("error", "Wrong credentials");
    return res.redirect("/auth/login");
  }

  const currentIP = req.headers["x-forwarded-for"] || req.ip;

  if (user.blockedIPs && user.blockedIPs.includes(currentIP)) {
    req.flash("error", "🚫 Your IP is blocked due to suspicious activity!");
    return res.redirect("/auth/login");
  }

  if (user.lockUntil && user.lockUntil > Date.now()) {
    req.flash("error", "Account locked! Try later.");
    return res.redirect("/auth/login");
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    user.loginAttempts += 1;

    if (user.loginAttempts >= 5) {
      user.lockUntil = Date.now() + 15 * 60 * 1000;
    }

    await user.save();

    req.flash("error", "Wrong credentials");
    return res.redirect("/auth/login");
  }

  // ================= FRAUD DETECTION PRO =================
  if (user.ip && user.ip !== currentIP) {
    console.log("⚠️ Suspicious login detected!");

    if (!user.suspiciousIPs) user.suspiciousIPs = [];
    if (!user.blockedIPs) user.blockedIPs = [];

    if (!user.suspiciousIPs.includes(currentIP)) {
      user.suspiciousIPs.push(currentIP);
    }

    if (user.suspiciousIPs.length >= 2) {
      user.blockedIPs.push(currentIP);

      await transporter.sendMail({
        to: user.email,
        subject: "🚨 Security Alert",
        text: `We detected multiple suspicious login attempts.
IP: ${currentIP}
Your account has been protected.`,
      });

      await user.save();

      req.flash("error", "🚨 Suspicious activity! Your IP has been blocked.");
      return res.redirect("/auth/login");
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    user.verifyCode = code;
    user.verifyCodeExpire = Date.now() + 10 * 60 * 1000;

    await transporter.sendMail({
      to: user.email,
      subject: "New Login Verification",
      text: `New login detected. Code: ${code}`,
    });

    await user.save();

    req.session.verifyEmail = user.email;

    req.flash("error", "⚠️ New device/IP detected. Verify your login.");
    return res.redirect("/auth/verify");
  }

  // ================= SUCCESS LOGIN =================
  user.loginAttempts = 0;
  user.lockUntil = null;

  const parser = new UAParser(req.headers["user-agent"]);
  user.device = parser.getResult().browser.name;
  user.ip = currentIP;

  const refreshToken = generateRefreshToken(user);
  user.refreshToken = refreshToken;

  await user.save();

  res.cookie("jwt", refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: remember ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
  });

  req.session.user = user;

  res.redirect("/auth/dashboard");
});
// ================= FORGOT =================
router.post("/forgot", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    req.flash("error", "Email not found");
    return res.redirect("/auth/forgot");
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  user.resetCode = code;
  user.resetCodeExpire = Date.now() + 10 * 60 * 1000;

  await user.save();

  await transporter.sendMail({
    to: user.email,
    subject: "Reset Code",
    text: `Code: ${code}`,
  });

  req.session.resetEmail = user.email;

  res.redirect("/auth/reset-verify");
});

// ================= RESET VERIFY =================
router.post("/reset-verify", async (req, res) => {
  const user = await User.findOne({ email: req.session.resetEmail });

  if (!user || user.resetCode !== req.body.code) {
    req.flash("error", "Invalid code");
    return res.redirect("/auth/reset-verify");
  }

  res.redirect("/auth/reset");
});

// ================= RESET =================
router.post("/reset-password", async (req, res) => {
  const { password, confirm } = req.body;

  if (password !== confirm) {
    req.flash("error", "Mismatch");
    return res.redirect("/auth/reset");
  }

  const user = await User.findOne({ email: req.session.resetEmail });

  user.password = await bcrypt.hash(password, 10);
  user.resetCode = null;

  await user.save();

  req.flash("success", "Updated!");
  res.redirect("/auth/login");
});

// ================= DASHBOARD =================
router.get("/dashboard", isAuth, (req, res) => {
  res.render("dashboard/dashboard", { user: req.session.user });
});

// ================= LOGOUT =================
router.get("/logout", async (req, res) => {
  res.clearCookie("jwt");

  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
});

module.exports = router;
