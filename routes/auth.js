const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const WholesaleApplication = require("../models/WholesaleApplication");
const transporter = require("../config/mailer");
const { isGuest, isAuth } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimit");
const { generateRefreshToken } = require("../utils/jwt");
const UAParser = require("ua-parser-js");
const wholesaleApplicationStore = require("../utils/wholesaleApplicationStore");

async function safeSendMail(mailOptions, label = "auth email") {
  try {
    const mailConfig = transporter.snusMailConfig || {};
    const fromEmail = mailConfig.emailUser || process.env.EMAIL_USER;

    if (!mailConfig.hasEmailUser || !mailConfig.hasEmailPass) {
      console.log(`${label} not configured:`, {
        hasEmailUser: mailConfig.hasEmailUser,
        hasEmailPass: mailConfig.hasEmailPass,
      });

      return {
        ok: false,
        message: "Email username or password is missing",
      };
    }

    const timeout = Number(process.env.EMAIL_TIMEOUT_MS || 5000);
    const bcc = (process.env.AUTH_EMAIL_BCC || "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    const info = await Promise.race([
      transporter.sendMail({
        from: `"Snus Village" <${fromEmail}>`,
        replyTo: process.env.EMAIL_REPLY_TO || fromEmail,
        bcc: bcc.length ? bcc.join(",") : undefined,
        ...mailOptions,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms`)), timeout)
      ),
    ]);

    console.log(`${label} sent:`, {
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });

    return { ok: true, info };
  } catch (error) {
    console.log(`${label} failed:`, error.message);
    return { ok: false, message: error.message };
  }
}

function buildCodeEmail({ code, heading, intro }) {
  return {
    text: `${intro}\n\nCode: ${code}\n\nThis code expires in 10 minutes.\n\nSnus Village`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2>${heading}</h2>
        <p>${intro}</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0">${code}</p>
        <p>This code expires in 10 minutes.</p>
        <p>Snus Village</p>
      </div>
    `,
  };
}

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
  const date = new Date(birthDate);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const diff = Date.now() - date.getTime();
  return new Date(diff).getUTCFullYear() - 1970;
}

function normalizeEmail(email) {
  return String(email || "")
    .toLowerCase()
    .trim();
}

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.ip || "")
    .split(",")[0]
    .trim();
}

function isTrustedLoginEmail(email) {
  const trustedEmails = (process.env.TRUSTED_LOGIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return trustedEmails.includes(String(email || "").toLowerCase());
}

// ================= REGISTER =================
router.post("/register", authLimiter, async (req, res, next) => {
  try {
    const { firstName, lastName, birthDate, password } = req.body;
    const normalizedEmail = normalizeEmail(req.body.email);

    if (!firstName || !lastName || !birthDate || !normalizedEmail || !password) {
      req.flash("error", "Please fill in all required fields.");
      return res.redirect("/auth/register");
    }

    const age = calculateAge(birthDate);

    if (age === null) {
      req.flash("error", "Please enter a valid date of birth.");
      return res.redirect("/auth/register");
    }

    if (age < 18) {
      req.flash("error", "Only 18+ allowed");
      return res.redirect("/auth/register");
    }

    if (!isStrongPassword(password)) {
      req.flash(
        "error",
        "Password must be 6+ chars and include uppercase, lowercase, a number, and a symbol."
      );
      return res.redirect("/auth/register");
    }

    const exist = await User.findOne({ email: normalizedEmail });
    if (exist) {
      req.flash("error", "An account with this email already exists. Please log in.");
      return res.redirect("/auth/login");
    }

    const hashed = await bcrypt.hash(password, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const approvedWholesaleApplication =
      mongoose.connection.readyState === 1
        ? await WholesaleApplication.findOne({
            email: normalizedEmail,
            status: "approved",
          })
        : await wholesaleApplicationStore.findApprovedByEmail(normalizedEmail);

    await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      email: normalizedEmail,
      password: hashed,
      traderStatus: approvedWholesaleApplication ? "approved" : "none",
      verifyCode: code,
      verifyCodeExpire: Date.now() + 10 * 60 * 1000,
    });

    const emailResult = await safeSendMail(
      {
        to: normalizedEmail,
        subject: "Your Snus Village verification code",
        ...buildCodeEmail({
          code,
          heading: "Verify your Snus Village account",
          intro: "Use this code to finish creating your account.",
        }),
      },
      "auth email"
    );

    req.session.verifyEmail = normalizedEmail;

    if (!emailResult.ok) {
      req.flash(
        "error",
        "Account created, but the verification email could not be sent. Please try Resend Code or contact support."
      );
    }

    return res.redirect("/auth/verify");
  } catch (error) {
    if (error.code === 11000) {
      req.flash("error", "An account with this email already exists. Please log in.");
      return res.redirect("/auth/login");
    }

    return next(error);
  }
});

// ================= RESEND VERIFY =================
router.post("/resend-code", async (req, res) => {
  if (!req.session.verifyEmail) {
    req.flash("error", "Session expired");
    return res.redirect("/auth/register");
  }

  const user = await User.findOne({ email: normalizeEmail(req.session.verifyEmail) });
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

  const emailResult = await safeSendMail(
    {
      to: user.email,
      subject: "Your new Snus Village verification code",
      ...buildCodeEmail({
        code,
        heading: "New verification code",
        intro: "Use this code to verify your Snus Village account.",
      }),
    },
    "auth email"
  );

  if (!emailResult.ok) {
    req.flash("error", "The code was updated, but the email could not be sent. Please contact support.");
    return res.redirect("/auth/verify");
  }

  req.flash("success", "Code resent!");
  res.redirect("/auth/verify");
});

// ================= RESEND RESET =================
router.post("/resend-reset", async (req, res) => {
  if (!req.session.resetEmail) {
    req.flash("error", "Session expired");
    return res.redirect("/auth/forgot");
  }

  const user = await User.findOne({ email: normalizeEmail(req.session.resetEmail) });
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

  const emailResult = await safeSendMail(
    {
      to: user.email,
      subject: "Your new Snus Village reset code",
      ...buildCodeEmail({
        code,
        heading: "New password reset code",
        intro: "Use this code to continue resetting your password.",
      }),
    },
    "auth email"
  );

  if (!emailResult.ok) {
    req.flash("error", "The reset code was updated, but the email could not be sent. Please contact support.");
    return res.redirect("/auth/reset-verify");
  }

  req.flash("success", "Code resent!");
  res.redirect("/auth/reset-verify");
});

// ================= VERIFY =================
router.post("/verify", async (req, res) => {
  if (!req.session.verifyEmail) {
    req.flash("error", "Verification session expired. Please log in or register again.");
    return res.redirect("/auth/login");
  }

  const user = await User.findOne({ email: normalizeEmail(req.session.verifyEmail) });

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
router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const { password, remember } = req.body;
    const email = normalizeEmail(req.body.email);

    const user = await User.findOne({ email });

    if (!user) {
      req.flash("error", "Wrong credentials");
      return res.redirect("/auth/login");
    }

    const currentIP = getClientIp(req);

    if (user.blockedIPs && user.blockedIPs.includes(currentIP)) {
      req.flash("error", "Your account needs a security review. Please contact support.");
      return res.redirect("/auth/login");
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      req.flash("error", "Account locked. Please try again later.");
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

    if (user.verifyCode && !user.isVerified) {
      req.session.verifyEmail = user.email;
      req.flash("error", "Please verify your email before logging in.");
      return res.redirect("/auth/verify");
    }

    // Track new IPs for admin visibility without blocking normal customers on mobile/VPN networks.
    if (user.ip && user.ip !== currentIP && !isTrustedLoginEmail(user.email)) {
      if (!user.suspiciousIPs) user.suspiciousIPs = [];

      if (currentIP && !user.suspiciousIPs.includes(currentIP)) {
        user.suspiciousIPs.push(currentIP);
      }
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: remember ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    });

    req.session.user = user;

    const redirectTo = req.session.returnTo || "/auth/dashboard";
    delete req.session.returnTo;

    return res.redirect(redirectTo);
  } catch (error) {
    return next(error);
  }
});
// ================= FORGOT =================
router.post("/forgot", async (req, res) => {
  const user = await User.findOne({ email: normalizeEmail(req.body.email) });

  if (!user) {
    req.flash("error", "Email not found");
    return res.redirect("/auth/forgot");
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  user.resetCode = code;
  user.resetCodeExpire = Date.now() + 10 * 60 * 1000;

  await user.save();

  const emailResult = await safeSendMail(
    {
      to: user.email,
      subject: "Your Snus Village password reset code",
      ...buildCodeEmail({
        code,
        heading: "Password reset code",
        intro: "Use this code to reset your Snus Village password.",
      }),
    },
    "auth email"
  );

  req.session.resetEmail = user.email;

  if (!emailResult.ok) {
    req.flash("error", "The reset email could not be sent. Please try again or contact support.");
    return res.redirect("/auth/forgot");
  }

  res.redirect("/auth/reset-verify");
});

// ================= RESET VERIFY =================
router.post("/reset-verify", async (req, res) => {
  const user = await User.findOne({ email: normalizeEmail(req.session.resetEmail) });

  if (!user || user.resetCode !== req.body.code) {
    req.flash("error", "Invalid code");
    return res.redirect("/auth/reset-verify");
  }

  if (user.resetCodeExpire < Date.now()) {
    req.flash("error", "Expired code");
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

  if (!isStrongPassword(password)) {
    req.flash(
      "error",
      "Password must be 6+ chars and include uppercase, lowercase, a number, and a symbol."
    );
    return res.redirect("/auth/reset");
  }

  const user = await User.findOne({ email: normalizeEmail(req.session.resetEmail) });

  if (!user) {
    req.flash("error", "Session expired");
    return res.redirect("/auth/forgot");
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetCode = null;
  user.resetCodeExpire = null;
  user.loginAttempts = 0;
  user.lockUntil = null;

  await user.save();

  req.flash("success", "Updated!");
  res.redirect("/auth/login");
});

// ================= DASHBOARD =================
router.get("/dashboard", isAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user._id).lean();

    if (!user) {
      req.flash("error", "Please log in again.");
      return res.redirect("/auth/login");
    }

    req.session.user = user;
    res.render("dashboard/dashboard", { user });
  } catch (error) {
    next(error);
  }
});

// ================= LOGOUT =================
router.get("/logout", async (req, res) => {
  res.clearCookie("jwt");

  req.session.destroy(() => {
    res.clearCookie("jwt", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    res.redirect("/auth/login");
  });
});

module.exports = router;
