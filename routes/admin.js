const fs = require("fs");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Product = require("../models/Products");
const User = require("../models/User");
const Order = require("../models/order");
const Cart = require("../models/cart");
const WholesaleApplication = require("../models/WholesaleApplication");
const Trader = require("../models/Trader");
const Contact = require("../models/contact");
const SearchAnalytics = require("../models/SearchAnalytics");
const HomepageContent = require("../models/HomepageContent");
const isAdmin = require("../middleware/isAdmin");
const upload = require("../middleware/upload");
const wholesaleApplicationStore = require("../utils/wholesaleApplicationStore");
const transporter = require("../config/mailer");
const { storeProductImages } = require("../utils/productImages");

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function orderItemsText(order) {
  return (order.items || [])
    .map((item) => `${item.quantity} x ${item.name} (£${Number(item.price || 0).toFixed(2)})`)
    .join(" | ");
}

async function getAdminStats() {
  if (mongoose.connection.readyState !== 1) {
    const applications = await wholesaleApplicationStore.findAll();
    return {
      totalProducts: 0,
      inStock: 0,
      lowStock: 0,
      totalUsers: 0,
      approvedTraders: 0,
      pendingWholesale: applications.filter((app) => app.status === "pending").length,
      unreadMessages: 0,
      todayOrders: 0,
      todayRevenue: 0,
      totalRevenue: 0,
      pendingOrders: 0,
      failedPayments: 0,
      activeCarts: 0,
      abandonedCarts: 0,
      abandonedCartValue: 0,
    };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const cartStaleCutoff = new Date(Date.now() - 60 * 60 * 1000);

  const [
    totalProducts,
    inStock,
    lowStock,
    totalUsers,
    approvedTraders,
    pendingWholesale,
    unreadMessages,
    todayOrders,
    pendingOrders,
    failedPayments,
    activeCarts,
    abandonedCarts,
    todayRevenueAgg,
    totalRevenueAgg,
    abandonedCartValueAgg,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ stock: { $gt: 0 } }),
    Product.countDocuments({ stock: { $gt: 0, $lte: 5 } }),
    User.countDocuments(),
    Trader.countDocuments({ status: "approved" }),
    WholesaleApplication.countDocuments({ status: "pending" }),
    Contact.countDocuments({ isRead: false }),

    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.countDocuments({ orderStatus: { $in: ["new", "processing", "packed"] } }),
    Order.countDocuments({ paymentStatus: "failed" }),

    Cart.countDocuments({
      "items.0": { $exists: true },
      updatedAt: { $gte: cartStaleCutoff },
    }),

    Cart.countDocuments({
      "items.0": { $exists: true },
      updatedAt: { $lt: cartStaleCutoff },
    }),

    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: todayStart },
          paymentStatus: "paid",
        },
      },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),

    Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),

    Cart.aggregate([
      {
        $match: {
          "items.0": { $exists: true },
          updatedAt: { $lt: cartStaleCutoff },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $multiply: ["$items.quantity", "$items.priceAtTime"],
            },
          },
        },
      },
    ]),
  ]);

  return {
    totalProducts,
    inStock,
    lowStock,
    totalUsers,
    approvedTraders,
    pendingWholesale,
    unreadMessages,
    todayOrders,
    todayRevenue: todayRevenueAgg[0]?.total || 0,
    totalRevenue: totalRevenueAgg[0]?.total || 0,
    pendingOrders,
    failedPayments,
    activeCarts,
    abandonedCarts,
    abandonedCartValue: abandonedCartValueAgg[0]?.total || 0,
  };
}

router.get("/", isAdmin, (req, res) => {
  res.redirect("/admin/dashboard");
});




router.get("/homepage", isAdmin, async (req, res) => {
  try {
    let homepageContent = null;

    if (mongoose.connection.readyState === 1) {
      homepageContent = await HomepageContent.findOneAndUpdate(
        { key: "homepage" },
        { $setOnInsert: { key: "homepage" } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
    }

    res.render("admin/homepage", {
      layout: "layouts/admin-layout",
      homepageContent,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load homepage controls");
    res.redirect("/admin/dashboard");
  }
});


router.post("/homepage/hero-distro", isAdmin, async (req, res) => {
  try {
    const heroSlides = [1, 2, 3].map((number) => ({
      kicker: String(req.body[`heroKicker${number}`] || "").trim(),
      title: String(req.body[`heroTitle${number}`] || "").trim(),
      buttonText: String(req.body[`heroButtonText${number}`] || "").trim(),
      buttonLink: String(req.body[`heroButtonLink${number}`] || "").trim(),
      imageSrc: String(req.body[`heroImageSrc${number}`] || "").trim(),
    }));

    const distroImages = [1, 2, 3].map((number) => ({
      imageSrc: String(req.body[`distroImageSrc${number}`] || "").trim(),
      alt: String(req.body[`distroImageAlt${number}`] || "").trim(),
    }));

    const badges = String(req.body.distroBadges || "")
      .split(",")
      .map((badge) => badge.trim())
      .filter(Boolean);

    await HomepageContent.findOneAndUpdate(
      { key: "homepage" },
      {
        $set: {
          key: "homepage",
          "hero.slides": heroSlides,
          "distro.kicker": String(req.body.distroKicker || "").trim(),
          "distro.title": String(req.body.distroTitle || "").trim(),
          "distro.address": String(req.body.distroAddress || "").trim(),
          "distro.description": String(req.body.distroDescription || "").trim(),
          "distro.buttonText": String(req.body.distroButtonText || "").trim(),
          "distro.buttonLink": String(req.body.distroButtonLink || "").trim(),
          "distro.badges": badges,
          "distro.images": distroImages,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    req.flash("success", "Homepage hero and SVG Distro section updated");
    res.redirect("/admin/homepage");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update homepage hero and distro section");
    res.redirect("/admin/homepage");
  }
});


router.post(
  "/homepage/social",
  isAdmin,
  upload.fields([
    { name: "posterImage1", maxCount: 1 },
    { name: "posterImage2", maxCount: 1 },
    { name: "posterImage3", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      async function imagePath(fieldName, fallbackPath) {
        const file = req.files?.[fieldName]?.[0];

        if (!file) {
          return String(fallbackPath || "").trim();
        }

        const [storedPath] = await storeProductImages([file]);
        return storedPath || String(fallbackPath || "").trim();
      }

      const slides = await Promise.all(
        [1, 2, 3].map(async (number) => ({
          videoSrc: String(req.body[`videoSrc${number}`] || "").trim(),
          posterSrc: await imagePath(
            `posterImage${number}`,
            req.body[`posterSrc${number}`]
          ),
          title: String(req.body[`title${number}`] || "").trim(),
          subtitle: String(req.body[`subtitle${number}`] || "").trim(),
        }))
      );

      await HomepageContent.findOneAndUpdate(
        { key: "homepage" },
        {
          key: "homepage",
          social: {
            eyebrow: String(req.body.eyebrow || "").trim(),
            heading: String(req.body.heading || "").trim(),
            description: String(req.body.description || "").trim(),
            instagramUrl: String(req.body.instagramUrl || "").trim(),
            cardTitle: String(req.body.cardTitle || "").trim(),
            cardText: String(req.body.cardText || "").trim(),
            slides,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      req.flash("success", "Homepage social section updated");
      res.redirect("/admin/homepage");
    } catch (err) {
      console.log(err);
      req.flash("error", "Unable to update homepage social section");
      res.redirect("/admin/homepage");
    }
  }
);


router.get("/search-analytics", isAdmin, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.render("admin/search-analytics", {
        layout: "layouts/admin-layout",
        stats: {
          totalSearches: 0,
          noResultSearches: 0,
          uniqueTerms: 0,
          todaySearches: 0,
        },
        topTerms: [],
        noResultTerms: [],
        recentSearches: [],
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalSearches,
      noResultSearches,
      uniqueTerms,
      todaySearches,
      topTerms,
      noResultTerms,
      recentSearches,
    ] = await Promise.all([
      SearchAnalytics.countDocuments(),
      SearchAnalytics.countDocuments({ hadResults: false }),
      SearchAnalytics.distinct("term").then((terms) => terms.length),
      SearchAnalytics.countDocuments({ createdAt: { $gte: todayStart } }),

      SearchAnalytics.aggregate([
        {
          $group: {
            _id: "$term",
            originalTerm: { $first: "$originalTerm" },
            count: { $sum: 1 },
            averageResults: { $avg: "$resultCount" },
            lastSearchedAt: { $max: "$createdAt" },
          },
        },
        { $sort: { count: -1, lastSearchedAt: -1 } },
        { $limit: 20 },
      ]),

      SearchAnalytics.aggregate([
        { $match: { hadResults: false } },
        {
          $group: {
            _id: "$term",
            originalTerm: { $first: "$originalTerm" },
            count: { $sum: 1 },
            lastSearchedAt: { $max: "$createdAt" },
          },
        },
        { $sort: { count: -1, lastSearchedAt: -1 } },
        { $limit: 20 },
      ]),

      SearchAnalytics.find()
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    res.render("admin/search-analytics", {
      layout: "layouts/admin-layout",
      stats: {
        totalSearches,
        noResultSearches,
        uniqueTerms,
        todaySearches,
      },
      topTerms,
      noResultTerms,
      recentSearches,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load search analytics");
    res.redirect("/admin/dashboard");
  }
});


router.get("/analytics", isAdmin, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.render("admin/analytics", {
        layout: "layouts/admin-layout",
        stats: {
          totalRevenue: 0,
          todayRevenue: 0,
          totalOrders: 0,
          paidOrders: 0,
          failedPayments: 0,
          averageOrderValue: 0,
        },
        revenueByDay: [],
        bestProducts: [],
        bestBrands: [],
        recentPaidOrders: [],
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      paidOrders,
      failedPayments,
      revenueAgg,
      todayRevenueAgg,
      revenueByDay,
      bestProducts,
      bestBrands,
      recentPaidOrders,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ paymentStatus: "paid" }),
      Order.countDocuments({ paymentStatus: "failed" }),

      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$total" },
            averageOrderValue: { $avg: "$total" },
          },
        },
      ]),

      Order.aggregate([
        {
          $match: {
            paymentStatus: "paid",
            createdAt: { $gte: todayStart },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$total" },
          },
        },
      ]),

      Order.aggregate([
        {
          $match: {
            paymentStatus: "paid",
            createdAt: { $gte: sevenDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
              },
            },
            revenue: { $sum: "$total" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            brand: { $first: "$items.brand" },
            quantity: { $sum: "$items.quantity" },
            revenue: {
              $sum: {
                $multiply: ["$items.quantity", "$items.price"],
              },
            },
          },
        },
        { $sort: { quantity: -1, revenue: -1 } },
        { $limit: 10 },
      ]),

      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: {
              $ifNull: ["$items.brand", "Unknown Brand"],
            },
            quantity: { $sum: "$items.quantity" },
            revenue: {
              $sum: {
                $multiply: ["$items.quantity", "$items.price"],
              },
            },
          },
        },
        { $sort: { revenue: -1, quantity: -1 } },
        { $limit: 10 },
      ]),

      Order.find({ paymentStatus: "paid" })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    const totalRevenue = revenueAgg[0]?.totalRevenue || 0;
    const averageOrderValue = revenueAgg[0]?.averageOrderValue || 0;
    const todayRevenue = todayRevenueAgg[0]?.totalRevenue || 0;

    res.render("admin/analytics", {
      layout: "layouts/admin-layout",
      stats: {
        totalRevenue,
        todayRevenue,
        totalOrders,
        paidOrders,
        failedPayments,
        averageOrderValue,
      },
      revenueByDay,
      bestProducts,
      bestBrands,
      recentPaidOrders,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load analytics");
    res.redirect("/admin/dashboard");
  }
});


router.get("/dashboard", isAdmin, async (req, res) => {
  const stats = await getAdminStats();

  const cartStaleCutoff = new Date(Date.now() - 60 * 60 * 1000);

  const [recentProducts, recentOrders, abandonedCarts] =
    mongoose.connection.readyState === 1
      ? await Promise.all([
          Product.find().sort({ createdAt: -1 }).limit(5).lean(),
          Order.find().sort({ createdAt: -1 }).limit(5).lean(),
          Cart.find({
            "items.0": { $exists: true },
            updatedAt: { $lt: cartStaleCutoff },
          })
            .populate("items.product")
            .sort({ updatedAt: -1 })
            .limit(5)
            .lean(),
        ])
      : [[], [], []];

  res.render("admin/dashboard", {
    layout: "layouts/admin-layout",
    stats,
    recentProducts,
    recentOrders,
    abandonedCarts,
  });
});

router.get("/carts", isAdmin, async (req, res) => {
  try {
    const cartStaleCutoff = new Date(Date.now() - 60 * 60 * 1000);
    const status = String(req.query.status || "all").toLowerCase();

    const filter = { "items.0": { $exists: true } };

    if (status === "active") {
      filter.updatedAt = { $gte: cartStaleCutoff };
    }

    if (status === "abandoned") {
      filter.updatedAt = { $lt: cartStaleCutoff };
    }

    const carts =
      mongoose.connection.readyState === 1
        ? await Cart.find(filter)
            .populate("user", "firstName lastName email phone")
            .populate("items.product")
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean()
        : [];

    res.render("admin/carts", {
      layout: "layouts/admin-layout",
      carts,
      cartStaleCutoff,
      status,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load carts");
    res.redirect("/admin/dashboard");
  }
});

router.post("/carts/:id/delete", isAdmin, async (req, res) => {
  try {
    await Cart.findByIdAndDelete(req.params.id);
    req.flash("success", "Cart removed");
    res.redirect("/admin/carts");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to remove cart");
    res.redirect("/admin/carts");
  }
});

router.get("/orders/export/csv", isAdmin, async (req, res) => {
  try {
    const orders =
      mongoose.connection.readyState === 1 ? await Order.find().sort({ createdAt: -1 }).lean() : [];

    const headers = [
      "Order ID",
      "Short Order ID",
      "Date",
      "Payment Status",
      "Order Status",
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Address",
      "City",
      "Postcode",
      "Country",
      "Items",
      "Subtotal",
      "Shipping",
      "Total",
      "Tracking Number",
      "Royal Mail Reference",
    ];

    const rows = orders.map((order) => [
      order._id,
      order._id.toString().slice(-6).toUpperCase(),
      order.createdAt ? new Date(order.createdAt).toLocaleString("en-GB") : "",
      order.paymentStatus || "",
      order.orderStatus || "",
      order.customer?.firstName || "",
      order.customer?.lastName || "",
      order.customer?.email || "",
      order.customer?.phone || "",
      order.delivery?.address || "",
      order.delivery?.city || "",
      order.delivery?.postcode || "",
      order.delivery?.country || "United Kingdom",
      orderItemsText(order),
      Number(order.subtotal || 0).toFixed(2),
      Number(order.shipping || 0).toFixed(2),
      Number(order.total || 0).toFixed(2),
      order.royalMail?.trackingNumber || "",
      order.royalMail?.orderReference || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=snus-village-orders.csv");
    res.send(csv);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to export orders");
    res.redirect("/admin/orders");
  }
});

router.get("/orders", isAdmin, async (req, res) => {
  try {
    const orders =
      mongoose.connection.readyState === 1 ? await Order.find().sort({ createdAt: -1 }).lean() : [];

    res.render("admin/orders", {
      layout: "layouts/admin-layout",
      orders,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load orders");
    res.redirect("/admin/dashboard");
  }
});

router.post("/orders/:id/status", isAdmin, async (req, res) => {
  try {
    const { orderStatus, paymentStatus } = req.body;

    const allowedOrderStatuses = ["new", "processing", "packed", "shipped", "completed", "cancelled"];
    const allowedPaymentStatuses = ["pending", "paid", "failed"];

    const update = {};

    if (allowedOrderStatuses.includes(orderStatus)) {
      update.orderStatus = orderStatus;
    }

    if (allowedPaymentStatuses.includes(paymentStatus)) {
      update.paymentStatus = paymentStatus;
    }

    await Order.findByIdAndUpdate(req.params.id, update);

    res.redirect("/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update order status");
    res.redirect("/admin/orders");
  }
});

router.get("/users", isAdmin, async (req, res) => {
  try {
    const [users, traders] =
      mongoose.connection.readyState === 1
        ? await Promise.all([
            User.find().sort({ createdAt: -1 }).limit(50).lean(),
            Trader.find().sort({ updatedAt: -1 }).limit(50).lean(),
          ])
        : [[], []];

    res.render("admin/users", {
      layout: "layouts/admin-layout",
      users,
      traders,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load users");
    res.redirect("/admin/dashboard");
  }
});


router.get("/users/:id", isAdmin, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      req.flash("error", "Database is not connected");
      return res.redirect("/admin/users");
    }

    const user = await User.findById(req.params.id).lean();

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/admin/users");
    }

    const [orders, carts, trader] = await Promise.all([
      Order.find({
        $or: [
          { user: user._id },
          { "customer.email": user.email },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),

      Cart.find({ user: user._id })
        .populate("items.product")
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),

      Trader.findOne({ email: user.email }).lean(),
    ]);

    const paidOrders = orders.filter((order) => order.paymentStatus === "paid");
    const totalSpend = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const lastOrder = orders[0] || null;

    res.render("admin/user-detail", {
      layout: "layouts/admin-layout",
      account: user,
      orders,
      carts,
      trader,
      stats: {
        totalOrders: orders.length,
        paidOrders: paidOrders.length,
        totalSpend,
        lastOrder,
      },
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load user details");
    res.redirect("/admin/users");
  }
});


router.get("/security", isAdmin, async (req, res) => {
  try {
    const users =
      mongoose.connection.readyState === 1
        ? await User.find({
            $or: [
              { loginAttempts: { $gt: 0 } },
              { lockUntil: { $ne: null } },
              { "suspiciousIPs.0": { $exists: true } },
              { "blockedIPs.0": { $exists: true } },
            ],
          })
            .sort({ updatedAt: -1 })
            .limit(50)
            .lean()
        : [];

    res.render("admin/security", {
      layout: "layouts/admin-layout",
      users,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load security data");
    res.redirect("/admin/dashboard");
  }
});

router.get("/email-test", isAdmin, (req, res) => {
  const mailConfig = transporter.snusMailConfig || {};

  res.render("admin/email-test", {
    layout: "layouts/admin-layout",
    mailConfig: {
      provider: mailConfig.provider || "smtp",
      emailUser: mailConfig.emailUser || "",
      emailFrom: mailConfig.emailFrom || "",
      smtpHost: mailConfig.smtpHost || "",
      smtpPort: mailConfig.smtpPort || "",
      smtpSecure: Boolean(mailConfig.smtpSecure),
      hasEmailUser: Boolean(mailConfig.hasEmailUser),
      hasEmailPass: Boolean(mailConfig.hasEmailPass),
      timeout: mailConfig.timeout || Number(process.env.EMAIL_TIMEOUT_MS || 10000),
    },
    result: req.flash("emailTestResult")[0] || null,
  });
});

router.post("/email-test", isAdmin, async (req, res) => {
  const to = String(req.body.to || "").trim();
  const mailConfig = transporter.snusMailConfig || {};
  const fromEmail = mailConfig.emailFrom || mailConfig.emailUser || process.env.EMAIL_USER;

  if (!to || !to.includes("@")) {
    req.flash("error", "Enter a valid test email address.");
    return res.redirect("/admin/email-test");
  }

  if (!mailConfig.hasEmailUser || !mailConfig.hasEmailPass) {
    req.flash(
      "emailTestResult",
      JSON.stringify({
        ok: false,
        message: "Email username or password is missing on this server.",
        hasEmailUser: Boolean(mailConfig.hasEmailUser),
        hasEmailPass: Boolean(mailConfig.hasEmailPass),
      })
    );
    return res.redirect("/admin/email-test");
  }

  try {
    const info = await transporter.sendMail({
      from: `"Snus Village" <${fromEmail}>`,
      replyTo: process.env.EMAIL_REPLY_TO || fromEmail,
      to,
      subject: "Snus Village email test",
      text: "This is a test email from the Snus Village Render server.",
    });

    req.flash(
      "emailTestResult",
      JSON.stringify({
        ok: true,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      })
    );
  } catch (err) {
    console.log("Admin email test failed:", err.message);
    req.flash(
      "emailTestResult",
      JSON.stringify({
        ok: false,
        code: err.code || err.name,
        message: err.message,
        command: err.command,
        responseCode: err.responseCode,
      })
    );
  }

  res.redirect("/admin/email-test");
});

router.get("/wholesale", isAdmin, async (req, res) => {
  try {
    const applications =
      mongoose.connection.readyState === 1
        ? await WholesaleApplication.find().sort({ createdAt: -1 }).lean()
        : await wholesaleApplicationStore.findAll();

    res.render("admin/wholesale-applications", {
      layout: "layouts/admin-layout",
      applications,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load wholesale applications");
    res.redirect("/admin/dashboard");
  }
});

router.post("/wholesale/:id/approve", isAdmin, async (req, res) => {
  try {
    const application =
      mongoose.connection.readyState === 1
        ? await WholesaleApplication.findById(req.params.id)
        : await wholesaleApplicationStore.updateStatus(
            req.params.id,
            "approved",
            req.session.user._id
          );

    if (!application) {
      req.flash("error", "Wholesale application not found");
      return res.redirect("/admin/wholesale");
    }

    if (mongoose.connection.readyState === 1) {
      application.status = "approved";
      application.reviewedAt = new Date();
      application.reviewedBy = req.session.user._id;
      await application.save();

      await Trader.findOneAndUpdate(
        { email: application.email },
        {
          businessName: application.businessName,
          contactName: application.contactName,
          email: application.email,
          phone: application.phone,
          status: "approved",
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    req.flash("success", "Trader approved. They can now create their wholesale login.");
    res.redirect("/admin/wholesale");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to approve trader");
    res.redirect("/admin/wholesale");
  }
});

router.post("/wholesale/:id/reject", isAdmin, async (req, res) => {
  try {
    const application =
      mongoose.connection.readyState === 1
        ? await WholesaleApplication.findById(req.params.id)
        : await wholesaleApplicationStore.updateStatus(
            req.params.id,
            "rejected",
            req.session.user._id
          );

    if (!application) {
      req.flash("error", "Wholesale application not found");
      return res.redirect("/admin/wholesale");
    }

    if (mongoose.connection.readyState === 1) {
      application.status = "rejected";
      application.reviewedAt = new Date();
      application.reviewedBy = req.session.user._id;
      await application.save();

      await User.findOneAndUpdate({ email: application.email }, { traderStatus: "rejected" });

      await Trader.findOneAndUpdate({ email: application.email }, { status: "suspended" });
    }

    req.flash("success", "Trader application rejected");
    res.redirect("/admin/wholesale");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to reject trader");
    res.redirect("/admin/wholesale");
  }
});


router.get("/inventory", isAdmin, async (req, res) => {
  try {
    const stock = String(req.query.stock || "all").toLowerCase();
    const brand = String(req.query.brand || "").trim();

    const filter = {};

    if (brand) {
      filter.brand = {
        $regex: "^" + brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
        $options: "i",
      };
    }

    if (stock === "low") {
      filter.stock = { $gt: 0, $lte: 5 };
    }

    if (stock === "out") {
      filter.stock = 0;
    }

    if (stock === "in") {
      filter.stock = { $gt: 0 };
    }

    const [
      products,
      totalProducts,
      inStockProducts,
      lowStockProducts,
      outStockProducts,
      stockUnitsAgg,
      stockValueAgg,
      brands,
    ] = await Promise.all([
      Product.find(filter).sort({ stock: 1, brand: 1, name: 1 }).lean(),
      Product.countDocuments(),
      Product.countDocuments({ stock: { $gt: 0 } }),
      Product.countDocuments({ stock: { $gt: 0, $lte: 5 } }),
      Product.countDocuments({ stock: 0 }),
      Product.aggregate([{ $group: { _id: null, units: { $sum: "$stock" } } }]),
      Product.aggregate([
        {
          $group: {
            _id: null,
            value: {
              $sum: {
                $multiply: [
                  "$stock",
                  {
                    $cond: [
                      { $gt: ["$discountPrice", 0] },
                      "$discountPrice",
                      "$price",
                    ],
                  },
                ],
              },
            },
          },
        },
      ]),
      Product.distinct("brand"),
    ]);

    res.render("admin/inventory", {
      layout: "layouts/admin-layout",
      products,
      brands: brands.filter(Boolean).sort(),
      query: req.query,
      stats: {
        totalProducts,
        inStockProducts,
        lowStockProducts,
        outStockProducts,
        totalStockUnits: stockUnitsAgg[0]?.units || 0,
        estimatedStockValue: stockValueAgg[0]?.value || 0,
      },
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load inventory");
    res.redirect("/admin/dashboard");
  }
});

router.post("/inventory/:id/stock", isAdmin, async (req, res) => {
  try {
    const stock = Math.max(0, Number.parseInt(req.body.stock, 10) || 0);

    await Product.findByIdAndUpdate(req.params.id, { stock });

    req.flash("success", "Stock updated");
    res.redirect(req.get("Referrer") || "/admin/inventory");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update stock");
    res.redirect("/admin/inventory");
  }
});


//  Add Product Page
router.get("/products/add", isAdmin, (req, res) => {
  res.render("admin/add-product", {
    layout: "layouts/admin-layout",
  });
});

// Get All products
router.get("/products", isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;

    // ===== FILTERS =====
    let filter = {};

    // BRAND FILTER (SUPER FIXED)
    if (req.query.brand && req.query.brand !== "") {
      const cleanBrand = req.query.brand.toLowerCase().replace(/\s+/g, "");

      filter.$expr = {
        $regexMatch: {
          input: {
            $replaceAll: {
              input: { $toLower: "$brand" },
              find: " ",
              replacement: "",
            },
          },
          regex: cleanBrand,
        },
      };
    }

    if (req.query.strength && req.query.strength !== "") {
      filter.strength = req.query.strength;
    }

    if (req.query.stock === "in") {
      filter.stock = { $gt: 0 };
    }

    if (req.query.stock === "out") {
      filter.stock = 0;
    }

    let sort = { createdAt: -1 };

    if (req.query.sort === "price-low") sort = { price: 1 };
    if (req.query.sort === "price-high") sort = { price: -1 };
    if (req.query.sort === "name") sort = { name: 1 };

    // ===== QUERY =====
    const products = await Product.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Product.countDocuments(filter);

    // ===== STATS =====
    const totalProducts = await Product.countDocuments();
    const inStock = await Product.countDocuments({ stock: { $gt: 0 } });
    const outStock = await Product.countDocuments({ stock: 0 });

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        products,
        hasMore: page * limit < total,
      });
    }

    res.render("admin/products", {
      layout: "layouts/admin-layout",
      products,
      hasMore: page * limit < total,
      nextPage: page + 1,

      totalProducts,
      inStock,
      outStock,

      query: req.query,
    });
  } catch (err) {
    console.log(err);
    res.send("Error loading products");
  }
});

//  Create Product

router.post("/products/add", isAdmin, upload.array("images", 5), async (req, res) => {
  try {
    const {
      name,
      price,
      discountPrice,
      description,
      strength,
      nicotine,
      brand,
      flavour,
      category,
      stock,
    } = req.body;

    const parsedPrice = parseFloat(price);
    const parsedDiscount = discountPrice ? parseFloat(discountPrice) : 0;

    const slug = name
      .toLowerCase()
      .replace(/ /g, "-")
      .replace(/[^\w-]+/g, "");

    const images = await storeProductImages(req.files);

    await Product.create({
      name,
      slug,
      price: parsedPrice,
      discountPrice: parsedDiscount,
      description,
      strength,
      nicotine,
      brand,
      flavour,
      category,
      stock,
      images,
    });

    req.flash("success", "Product added successfully!");
    res.redirect("/admin/products");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error creating product");
    res.redirect("/admin/products/add");
  }
});

// Delete Product
router.post("/products/delete/:id", isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);

    req.flash("success", "Product deleted!");
    res.redirect("/admin/products");
  } catch (err) {
    req.flash("error", "Delete failed");
    res.redirect("/admin/products");
  }
});

/* Edit Product */
router.get("/products/edit/:id", isAdmin, async (req, res) => {
  const product = await Product.findById(req.params.id);

  res.render("admin/edit-product", {
    layout: "layouts/admin-layout",
    product,
  });
});

router.post("/products/edit/:id", isAdmin, upload.array("images", 5), async (req, res) => {
  try {
    const { name, price, discountPrice, description, strength, nicotine, category, stock } =
      req.body;

    const product = await Product.findById(req.params.id);

    const updatedData = {
      name,
      price: parseFloat(price),
      discountPrice: discountPrice ? parseFloat(discountPrice) : 0,
      description,
      strength,
      nicotine,
      category,
      stock,
    };

    let images = product.images || [];

    if (req.body.removeImages) {
      const removeList = Array.isArray(req.body.removeImages)
        ? req.body.removeImages
        : [req.body.removeImages];

      images = images.filter((img) => !removeList.includes(img));
    }

    if (req.files && req.files.length > 0) {
      const newImages = await storeProductImages(req.files);

      images = [...images, ...newImages];
    }

    updatedData.images = images;

    await Product.findByIdAndUpdate(req.params.id, updatedData);

    req.flash("success", "Product updated!");
    res.redirect("/admin/products");
  } catch (err) {
    console.log(err);
    req.flash("error", "Update failed");
    res.redirect("/admin/products");
  }
});


router.post("/orders/:id/send-royal-mail", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/admin/orders");
    }

    if (order.royalMail && order.royalMail.syncStatus === "sent") {
      req.flash("error", "This order has already been sent to Royal Mail");
      return res.redirect("/admin/orders");
    }

    const { sendOrderToRoyalMail } = require("../utils/royalMail");
    const royalMailResult = await sendOrderToRoyalMail(order);

    if (royalMailResult.ok) {
      const createdOrder =
        royalMailResult.data?.createdOrders?.[0] ||
        royalMailResult.data?.orders?.[0] ||
        null;

      if (createdOrder?.orderIdentifier) {
        order.royalMail = {
          synced: true,
          orderIdentifier: String(createdOrder.orderIdentifier),
          orderReference: createdOrder.orderReference || "",
          trackingNumber: createdOrder.trackingNumber || "",
          syncStatus: "sent",
          syncError: "",
          syncedAt: new Date(),
        };
      } else {
        order.royalMail = {
          synced: false,
          orderIdentifier: "",
          orderReference: "",
          trackingNumber: "",
          syncStatus: "failed",
          syncError: "Royal Mail did not return an order identifier.",
          syncedAt: null,
        };
      }
    } else {
      order.royalMail = {
        synced: false,
        orderIdentifier: "",
        orderReference: "",
        trackingNumber: "",
        syncStatus: royalMailResult.skipped ? "not_sent" : "failed",
        syncError: royalMailResult.message || "Royal Mail sync failed",
        syncedAt: null,
      };
    }

    await order.save();

    res.redirect("/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to send order to Royal Mail");
    res.redirect("/admin/orders");
  }
});



router.post("/orders/:id/generate-label", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/admin/orders");
    }

    if (!order.royalMail || order.royalMail.syncStatus !== "sent") {
      req.flash("error", "Order must be sent to Royal Mail before generating a label");
      return res.redirect("/admin/orders");
    }

    if (!order.royalMail.orderIdentifier) {
      req.flash("error", "Royal Mail order identifier is missing");
      return res.redirect("/admin/orders");
    }

    const { getRoyalMailLabel } = require("../utils/royalMail");
    const labelResult = await getRoyalMailLabel(order.royalMail.orderIdentifier);

    if (!labelResult.ok) {
      order.royalMail.labelGenerated = false;
      order.royalMail.labelError = labelResult.message || "Unable to generate Royal Mail label";
      await order.save();

      req.flash("error", order.royalMail.labelError);
      return res.redirect("/admin/orders");
    }

    const labelsDir = path.join(__dirname, "..", "private", "labels");

    if (!fs.existsSync(labelsDir)) {
      fs.mkdirSync(labelsDir, { recursive: true });
    }

    const fileName = `royal-mail-label-${order._id}.pdf`;
    const filePath = path.join(labelsDir, fileName);

    fs.writeFileSync(filePath, labelResult.buffer);

    order.royalMail.labelGenerated = true;
    order.royalMail.labelPath = filePath;
    order.royalMail.labelGeneratedAt = new Date();
    order.royalMail.labelError = "";

    await order.save();

    res.redirect("/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to generate Royal Mail label");
    res.redirect("/admin/orders");
  }
});

router.get("/orders/:id/download-label", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order || !order.royalMail || !order.royalMail.labelPath) {
      req.flash("error", "Label not found");
      return res.redirect("/admin/orders");
    }

    if (!fs.existsSync(order.royalMail.labelPath)) {
      req.flash("error", "Label file is missing");
      return res.redirect("/admin/orders");
    }

    res.download(order.royalMail.labelPath, `royal-mail-label-${order._id}.pdf`);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to download label");
    res.redirect("/admin/orders");
  }
});



router.get("/orders/:id", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/admin/orders");
    }

    res.render("admin/order-detail", {
      layout: "layouts/admin-layout",
      order,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load order");
    res.redirect("/admin/orders");
  }
});


module.exports = router;
