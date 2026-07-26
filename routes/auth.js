const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const WholesaleApplication = require("../models/WholesaleApplication");
const Order = require("../models/order");
const Cart = require("../models/cart");
const Product = require("../models/Products");
const Address = require("../models/Address");
const NewsletterSubscriber = require("../models/NewsletterSubscriber");
const transporter = require("../config/mailer");
const { isGuest, isAuth } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimit");
const { generateRefreshToken } = require("../utils/jwt");
const UAParser = require("ua-parser-js");
const wholesaleApplicationStore = require("../utils/wholesaleApplicationStore");

function dashboardLayout(req) {
  return req.get("X-Dashboard-Spa") === "1" ? false : "layouts/dashboard-layout";
}

function orderStageInfo(order) {
  const isClickCollect = order.fulfilment?.method === "click_collect";
  const status = order.orderStatus || "new";

  if (status === "cancelled") {
    return { cancelled: true, stages: [] };
  }

  const stageDefs = isClickCollect
    ? [
        { key: "placed", label: "Order\nPlaced", icon: "fa-check" },
        { key: "paid", label: "Payment\nConfirmed", icon: "fa-check" },
        { key: "packed", label: "Packed", icon: "fa-box" },
        { key: "ready", label: "Ready For\nCollection", icon: "fa-store" },
        { key: "collected", label: "Collected", icon: "fa-house" },
      ]
    : [
        { key: "placed", label: "Order\nPlaced", icon: "fa-check" },
        { key: "paid", label: "Payment\nConfirmed", icon: "fa-check" },
        { key: "packed", label: "Packed &\nDispatched", icon: "fa-box" },
        { key: "shipped", label: "In\nTransit", icon: "fa-truck" },
        { key: "delivered", label: "Delivered", icon: "fa-house" },
      ];

  const doneOrder = ["placed", "paid", "packed", isClickCollect ? "ready" : "shipped", isClickCollect ? "collected" : "delivered"];
  const isPaid = order.paymentStatus === "paid";
  const isPackedOrLater = ["packed", "shipped", "completed"].includes(status);
  const isShippedOrLater = status === "shipped" || status === "completed" || order.royalMail?.syncStatus === "sent";
  const isDelivered = status === "completed";

  const doneMap = { placed: true, paid: isPaid, packed: isPackedOrLater, shipped: isShippedOrLater, ready: isShippedOrLater, collected: isDelivered, delivered: isDelivered };

  let currentIndex = stageDefs.findIndex((s) => !doneMap[s.key]);
  if (currentIndex === -1) currentIndex = stageDefs.length - 1;

  const stages = stageDefs.map((s, i) => ({
    ...s,
    done: doneMap[s.key] && i !== currentIndex,
    current: i === currentIndex && !doneMap[s.key],
  }));

  // if everything is done, mark the last stage as done (not "current")
  if (doneMap[stageDefs[stageDefs.length - 1].key]) {
    stages[stages.length - 1].done = true;
    stages[stages.length - 1].current = false;
  }

  return { cancelled: false, stages };
}

async function getCustomerOrderQuery(req) {
  const userId = req.session.user._id;
  const email = String(req.session.user.email || "").toLowerCase();
  return { $or: [{ user: userId }, { "customer.email": email }] };
}

function orderPillInfo(order) {
  if (order.orderStatus === "cancelled") return { cls: "dsh-p-canc", label: "Cancelled" };
  if (order.orderStatus === "completed") return { cls: "dsh-p-del", label: "Delivered" };
  if (order.orderStatus === "shipped") return { cls: "dsh-p-ship", label: "In Transit" };
  if (order.paymentStatus === "pending") return { cls: "dsh-p-pend", label: "Payment Pending" };
  if (order.paymentStatus === "failed") return { cls: "dsh-p-canc", label: "Payment Failed" };
  return { cls: "dsh-p-ship", label: "Processing" };
}

function orderItemsSummary(order) {
  return (order.items || []).map((item) => `${item.name} ×${item.quantity}`).join(", ");
}

async function safeSendMail(mailOptions, label = "auth email") {
  try {
    const mailConfig = transporter.snusMailConfig || {};
    const fromEmail = mailConfig.emailFrom || mailConfig.emailUser || process.env.EMAIL_USER;

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
function generateSixDigitCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

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
  return getRequestIps(req)[0] || "";
}

function getRequestIps(req) {
  const forwardedIps = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const directIp = String(req.ip || "").trim();
  const ips = [...forwardedIps, directIp].filter(Boolean);

  return [...new Set(ips)];
}

function hasBlockedIp(user, req) {
  const blockedIps = new Set(user.blockedIPs || []);

  return getRequestIps(req).some((ip) => blockedIps.has(ip));
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
    const code = generateSixDigitCode();

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
router.post("/resend-code", authLimiter, async (req, res) => {
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

  const code = generateSixDigitCode();

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
router.post("/resend-reset", authLimiter, async (req, res) => {
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

  const code = generateSixDigitCode();

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
router.post("/verify", authLimiter, async (req, res) => {
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

    if (user.role !== "admin" && hasBlockedIp(user, req)) {
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
router.post("/forgot", authLimiter, async (req, res) => {
  const user = await User.findOne({ email: normalizeEmail(req.body.email) });

  if (!user) {
    req.flash("error", "Email not found");
    return res.redirect("/auth/forgot");
  }

  const code = generateSixDigitCode();

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
router.post("/reset-verify", authLimiter, async (req, res) => {
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
router.post("/reset-password", authLimiter, async (req, res) => {
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
router.use("/dashboard", isAuth, async (req, res, next) => {
  try {
    const orderQuery = await getCustomerOrderQuery(req);
    const [activeOrders, wishlistCount] = await Promise.all([
      Order.countDocuments({ ...orderQuery, orderStatus: { $nin: ["completed", "cancelled"] } }),
      User.findById(req.session.user._id).select("wishlist").lean().then((u) => (u?.wishlist || []).length),
    ]);
    res.locals.dashboardActiveOrders = activeOrders;
    res.locals.dashboardWishlistCount = wishlistCount;
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard", isAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user._id).lean();

    if (!user) {
      req.flash("error", "Please log in again.");
      return res.redirect("/auth/login");
    }

    req.session.user = user;

    const orderQuery = await getCustomerOrderQuery(req);
    const allOrders = await Order.find(orderQuery).sort({ createdAt: -1 }).lean();
    const paidOrders = allOrders.filter((o) => o.paymentStatus === "paid");

    const stats = {
      totalOrders: allOrders.length,
      totalSpent: paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
      activeOrders: allOrders.filter((o) => !["completed", "cancelled"].includes(o.orderStatus)).length,
    };

    const brandCounts = new Map();
    const productCounts = new Map();
    paidOrders.forEach((order) => {
      const brandsInOrder = new Set();
      const productsInOrder = new Set();
      (order.items || []).forEach((item) => {
        if (item.brand && !brandsInOrder.has(item.brand)) {
          brandsInOrder.add(item.brand);
          brandCounts.set(item.brand, (brandCounts.get(item.brand) || 0) + 1);
        }
        const key = String(item.product || item.name);
        if (!productsInOrder.has(key)) {
          productsInOrder.add(key);
          const existing = productCounts.get(key) || { name: item.name, brand: item.brand, image: item.image, product: item.product, count: 0 };
          existing.count += 1;
          productCounts.set(key, existing);
        }
      });
    });

    let favouriteBrand = null;
    brandCounts.forEach((count, brand) => {
      if (!favouriteBrand || count > favouriteBrand.count) favouriteBrand = { brand, count };
    });

    let usualProduct = null;
    productCounts.forEach((entry) => {
      if (!usualProduct || entry.count > usualProduct.count) usualProduct = entry;
    });

    if (usualProduct?.product) {
      const liveProduct = await Product.findById(usualProduct.product).select("price discountPrice strength nicotine stock slug images").lean();
      if (liveProduct) usualProduct.live = liveProduct;
    }

    // Real, order-derived activity feed (no invented events/timestamps)
    const activity = [];
    allOrders.slice(0, 6).forEach((order) => {
      const shortId = order._id.toString().slice(-6).toUpperCase();
      activity.push({ icon: "fa-check", tone: "ok", text: `Order #${shortId} placed`, time: order.createdAt, amount: order.total });
      if (order.paymentStatus === "paid") {
        activity.push({ icon: "fa-check", tone: "ok", text: `Order #${shortId} payment confirmed`, time: order.updatedAt });
      }
      if (order.royalMail?.syncedAt) {
        activity.push({ icon: "fa-truck", tone: "blue", text: `Order #${shortId} dispatched`, time: order.royalMail.syncedAt });
      }
      if (order.orderStatus === "completed") {
        activity.push({ icon: "fa-box", tone: "ok", text: `Order #${shortId} delivered`, time: order.updatedAt });
      }
      if (order.orderStatus === "cancelled") {
        activity.push({ icon: "fa-xmark", tone: "muted", text: `Order #${shortId} cancelled`, time: order.updatedAt });
      }
    });
    activity.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.render("dashboard/dashboard", {
      layout: dashboardLayout(req),
      user,
      stats,
      favouriteBrand,
      usualProduct,
      recentOrders: allOrders.slice(0, 4).map((order) => ({ ...order, pill: orderPillInfo(order), itemsSummary: orderItemsSummary(order) })),
      activity: activity.slice(0, 6),
      memberSince: user._id.getTimestamp(),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/orders", isAuth, async (req, res, next) => {
  try {
    const orderQuery = await getCustomerOrderQuery(req);
    const orders = await Order.find(orderQuery).sort({ createdAt: -1 }).lean();
    const withStages = orders.map((order) => ({
      ...order,
      stageInfo: orderStageInfo(order),
      pill: orderPillInfo(order),
    }));

    res.render("dashboard/orders", {
      layout: dashboardLayout(req),
      user: req.session.user,
      orders: withStages,
      stats: {
        total: orders.length,
        active: orders.filter((o) => !["completed", "cancelled"].includes(o.orderStatus)).length,
        delivered: orders.filter((o) => o.orderStatus === "completed").length,
        cancelled: orders.filter((o) => o.orderStatus === "cancelled").length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/orders/:id/reorder", isAuth, async (req, res, next) => {
  try {
    const orderQuery = await getCustomerOrderQuery(req);
    const order = await Order.findOne({ _id: req.params.id, ...orderQuery }).lean();

    if (!order) {
      req.flash("error", "Order not found.");
      return res.redirect("/auth/dashboard/orders");
    }

    const userId = req.session.user._id;
    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = new Cart({ user: userId, sessionId: req.session.cartId });

    let addedCount = 0;
    let skippedCount = 0;

    for (const item of order.items || []) {
      if (!item.product) { skippedCount++; continue; }
      const product = await Product.findById(item.product);
      if (!product || product.isActive === false || product.stock <= 0) { skippedCount++; continue; }

      const finalPrice = product.discountPrice && product.discountPrice > 0 ? product.discountPrice : product.price;
      const quantity = Math.min(item.quantity, product.stock);
      const existingIndex = cart.items.findIndex((i) => String(i.product) === String(product._id));

      if (existingIndex > -1) {
        cart.items[existingIndex].quantity = Math.min(cart.items[existingIndex].quantity + quantity, product.stock);
      } else {
        cart.items.push({ product: product._id, quantity, priceAtTime: finalPrice });
      }
      addedCount++;
    }

    await cart.save();

    if (addedCount === 0) {
      req.flash("error", "None of the items from that order are available to reorder right now.");
    } else if (skippedCount > 0) {
      req.flash("success", `Added ${addedCount} item(s) to your cart. ${skippedCount} item(s) were unavailable and skipped.`);
    } else {
      req.flash("success", `Added ${addedCount} item(s) to your cart.`);
    }

    res.redirect("/cart");
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/wishlist", isAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user._id).populate("wishlist").lean();
    res.render("dashboard/wishlist", {
      layout: dashboardLayout(req),
      user: req.session.user,
      products: (user?.wishlist || []).filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/addresses", isAuth, async (req, res, next) => {
  try {
    const addresses = await Address.find({ user: req.session.user._id }).sort({ isDefault: -1, createdAt: -1 }).lean();
    res.render("dashboard/addresses", { layout: dashboardLayout(req), user: req.session.user, addresses });
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/addresses", isAuth, async (req, res, next) => {
  try {
    const { label, firstName, lastName, phone, addressLine1, addressLine2, city, postcode, country } = req.body;

    if (!firstName || !lastName || !addressLine1 || !city || !postcode) {
      req.flash("error", "Please fill in all required address fields.");
      return res.redirect("/auth/dashboard/addresses");
    }

    const existingCount = await Address.countDocuments({ user: req.session.user._id });

    await Address.create({
      user: req.session.user._id,
      label: String(label || "Home").trim(),
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      phone: String(phone || "").trim(),
      addressLine1: String(addressLine1).trim(),
      addressLine2: String(addressLine2 || "").trim(),
      city: String(city).trim(),
      postcode: String(postcode).trim(),
      country: String(country || "United Kingdom").trim(),
      isDefault: existingCount === 0,
    });

    req.flash("success", "Address added.");
    res.redirect("/auth/dashboard/addresses");
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/addresses/:id", isAuth, async (req, res, next) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, user: req.session.user._id });
    if (!address) {
      req.flash("error", "Address not found.");
      return res.redirect("/auth/dashboard/addresses");
    }

    const { label, firstName, lastName, phone, addressLine1, addressLine2, city, postcode, country } = req.body;
    Object.assign(address, {
      label: String(label || address.label).trim(),
      firstName: String(firstName || address.firstName).trim(),
      lastName: String(lastName || address.lastName).trim(),
      phone: String(phone || "").trim(),
      addressLine1: String(addressLine1 || address.addressLine1).trim(),
      addressLine2: String(addressLine2 || "").trim(),
      city: String(city || address.city).trim(),
      postcode: String(postcode || address.postcode).trim(),
      country: String(country || address.country).trim(),
    });
    await address.save();

    req.flash("success", "Address updated.");
    res.redirect("/auth/dashboard/addresses");
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/addresses/:id/delete", isAuth, async (req, res, next) => {
  try {
    const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.session.user._id });

    if (address?.isDefault) {
      const nextDefault = await Address.findOne({ user: req.session.user._id }).sort({ createdAt: 1 });
      if (nextDefault) {
        nextDefault.isDefault = true;
        await nextDefault.save();
      }
    }

    req.flash("success", "Address removed.");
    res.redirect("/auth/dashboard/addresses");
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/addresses/:id/default", isAuth, async (req, res, next) => {
  try {
    await Address.updateMany({ user: req.session.user._id }, { $set: { isDefault: false } });
    await Address.updateOne({ _id: req.params.id, user: req.session.user._id }, { $set: { isDefault: true } });
    req.flash("success", "Default address updated.");
    res.redirect("/auth/dashboard/addresses");
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/profile", isAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user._id).lean();
    const orderQuery = await getCustomerOrderQuery(req);
    const orders = await Order.find(orderQuery).lean();
    const paidOrders = orders.filter((o) => o.paymentStatus === "paid");

    res.render("dashboard/profile", {
      layout: dashboardLayout(req),
      user,
      stats: {
        totalOrders: orders.length,
        totalSpent: paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
      },
      memberSince: user._id.getTimestamp(),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/profile", isAuth, async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    const user = await User.findById(req.session.user._id);

    if (!user) {
      req.flash("error", "Please log in again.");
      return res.redirect("/auth/login");
    }

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (cleanEmail && cleanEmail !== user.email) {
      const existing = await User.findOne({ email: cleanEmail, _id: { $ne: user._id } });
      if (existing) {
        req.flash("error", "That email address is already in use.");
        return res.redirect("/auth/dashboard/profile");
      }
      user.email = cleanEmail;
    }

    if (firstName) user.firstName = String(firstName).trim();
    if (lastName) user.lastName = String(lastName).trim();
    user.phone = String(phone || "").trim();

    await user.save();
    req.session.user = user;

    req.flash("success", "Profile updated.");
    res.redirect("/auth/dashboard/profile");
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/password", isAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findById(req.session.user._id);

    if (!user?.password) {
      req.flash("error", "Password change is not available for this account.");
      return res.redirect("/auth/dashboard/profile");
    }

    const matches = await bcrypt.compare(String(currentPassword || ""), user.password);
    if (!matches) {
      req.flash("error", "Your current password is incorrect.");
      return res.redirect("/auth/dashboard/profile");
    }

    if (!newPassword || newPassword.length < 8) {
      req.flash("error", "New password must be at least 8 characters.");
      return res.redirect("/auth/dashboard/profile");
    }

    if (newPassword !== confirmPassword) {
      req.flash("error", "New passwords do not match.");
      return res.redirect("/auth/dashboard/profile");
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    req.flash("success", "Password updated.");
    res.redirect("/auth/dashboard/profile");
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/delete-request", isAuth, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.session.user._id, { deletionRequestedAt: new Date() });
    req.flash("success", "Your account deletion request has been submitted. Our team will action it and confirm by email.");
    res.redirect("/auth/dashboard/profile");
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/preferences", isAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user._id).lean();
    const subscriber = await NewsletterSubscriber.findOne({ email: String(user.email || "").toLowerCase() }).lean();

    res.render("dashboard/preferences", {
      layout: dashboardLayout(req),
      user,
      orderUpdates: user.notificationPrefs?.orderUpdates !== false,
      marketingEmails: Boolean(subscriber?.isActive),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/preferences", isAuth, async (req, res, next) => {
  try {
    const orderUpdates = req.body.orderUpdates === "on";
    const marketingEmails = req.body.marketingEmails === "on";

    const user = await User.findById(req.session.user._id);
    user.notificationPrefs = { orderUpdates, marketingEmails };
    await user.save();
    req.session.user = user;

    const email = String(user.email || "").toLowerCase();
    const existingSub = await NewsletterSubscriber.findOne({ email });

    if (marketingEmails) {
      if (existingSub) {
        existingSub.isActive = true;
        existingSub.unsubscribedAt = null;
        await existingSub.save();
      } else {
        await NewsletterSubscriber.create({ email, isActive: true, source: "account", consentAt: new Date(), ip: req.ip || "" });
      }
    } else if (existingSub && existingSub.isActive) {
      existingSub.isActive = false;
      existingSub.unsubscribedAt = new Date();
      await existingSub.save();
    }

    req.flash("success", "Preferences saved.");
    res.redirect("/auth/dashboard/preferences");
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
