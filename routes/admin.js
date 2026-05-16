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
const DiscountCode = require("../models/DiscountCode");
const StoreSettings = require("../models/StoreSettings");
const isAdmin = require("../middleware/isAdmin");
const upload = require("../middleware/upload");
const videoUpload = require("../middleware/videoUpload");
const wholesaleApplicationStore = require("../utils/wholesaleApplicationStore");
const transporter = require("../config/mailer");
const { storeProductImages } = require("../utils/productImages");
const { storeHomepageVideo, storeHomepageImage } = require("../utils/homepageMedia");

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


router.post(
  "/homepage/hero-distro",
  isAdmin,
  upload.fields([
    { name: "heroImage1", maxCount: 1 },
    { name: "heroImage2", maxCount: 1 },
    { name: "heroImage3", maxCount: 1 },
    { name: "distroImage1", maxCount: 1 },
    { name: "distroImage2", maxCount: 1 },
    { name: "distroImage3", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const body = req.body || {};
      const files = req.files || {};

      async function imagePath(fieldName, fallbackPath) {
        const file = files?.[fieldName]?.[0];

        if (!file) {
          return String(fallbackPath || "").trim();
        }

        const [storedPath] = await storeProductImages([file]);
        return storedPath || String(fallbackPath || "").trim();
      }

      const heroSlides = await Promise.all(
        [1, 2, 3].map(async (number) => ({
          kicker: String(body[`heroKicker${number}`] || "").trim(),
          title: String(body[`heroTitle${number}`] || "").trim(),
          buttonText: String(body[`heroButtonText${number}`] || "").trim(),
          buttonLink: String(body[`heroButtonLink${number}`] || "").trim(),
          imageSrc: await imagePath(
            `heroImage${number}`,
            body[`heroImageSrc${number}`]
          ),
        }))
      );

      const distroImages = await Promise.all(
        [1, 2, 3].map(async (number) => ({
          imageSrc: await imagePath(
            `distroImage${number}`,
            body[`distroImageSrc${number}`]
          ),
          alt: String(body[`distroImageAlt${number}`] || "").trim(),
        }))
      );

      const badges = String(body.distroBadges || "")
        .split(",")
        .map((badge) => badge.trim())
        .filter(Boolean);

      await HomepageContent.findOneAndUpdate(
        { key: "homepage" },
        {
          $set: {
            key: "homepage",
            "hero.slides": heroSlides,
            "distro.kicker": String(body.distroKicker || "").trim(),
            "distro.title": String(body.distroTitle || "").trim(),
            "distro.address": String(body.distroAddress || "").trim(),
            "distro.description": String(body.distroDescription || "").trim(),
            "distro.buttonText": String(body.distroButtonText || "").trim(),
            "distro.buttonLink": String(body.distroButtonLink || "").trim(),
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
      req.flash("error", "Unable to update homepage hero and distro section: " + err.message);
      res.redirect("/admin/homepage");
    }
  }
);


router.post(
  "/homepage/social",
  isAdmin,
  videoUpload.fields([
    { name: "socialVideo1", maxCount: 1 },
    { name: "socialVideo2", maxCount: 1 },
    { name: "socialVideo3", maxCount: 1 },
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

        const storedPath = await storeHomepageImage(file);
        return storedPath || String(fallbackPath || "").trim();
      }

      function videoPath(fieldName, fallbackPath) {
        const file = req.files?.[fieldName]?.[0];

        if (!file) {
          return String(fallbackPath || "").trim();
        }

        return storeHomepageVideo(file) || String(fallbackPath || "").trim();
      }

      const slides = await Promise.all(
        [1, 2, 3].map(async (number) => ({
          videoSrc: videoPath(
            `socialVideo${number}`,
            req.body[`videoSrc${number}`]
          ),
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

  const [
    recentProducts,
    recentOrders,
    abandonedCarts,
    lowStockProducts,
    outOfStockProducts,
    failedPaymentOrders,
    royalMailFailedOrders,
    unreadContactMessages,
    pendingWholesaleApplications,
  ] =
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
          Product.find({ stock: { $gt: 0, $lte: 5 } }).sort({ stock: 1 }).limit(5).lean(),
          Product.find({ stock: 0 }).sort({ updatedAt: -1 }).limit(5).lean(),
          Order.find({ paymentStatus: "failed" }).sort({ updatedAt: -1 }).limit(5).lean(),
          Order.find({ "royalMail.syncStatus": "failed" }).sort({ updatedAt: -1 }).limit(5).lean(),
          Contact.find({ isRead: false }).sort({ createdAt: -1 }).limit(5).lean(),
          WholesaleApplication.find({ status: "pending" }).sort({ createdAt: -1 }).limit(5).lean(),
        ])
      : [[], [], [], [], [], [], [], [], []];

  res.render("admin/dashboard", {
    layout: "layouts/admin-layout",
    stats,
    recentProducts,
    recentOrders,
    abandonedCarts,
    dashboardAlerts: {
      lowStockProducts,
      outOfStockProducts,
      failedPaymentOrders,
      royalMailFailedOrders,
      unreadContactMessages,
      pendingWholesaleApplications,
    },
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
    res.redirect(req.get("Referrer") || "/admin/orders");
  }
});




router.get("/messages", isAdmin, async (req, res) => {
  try {
    const filter = {};

    if (req.query.status === "unread") {
      filter.isRead = false;
    }

    if (req.query.status === "read") {
      filter.isRead = true;
    }

    const messages =
      mongoose.connection.readyState === 1
        ? await Contact.find(filter).sort({ createdAt: -1 }).lean()
        : [];

    const [totalMessages, unreadMessages, readMessages] =
      mongoose.connection.readyState === 1
        ? await Promise.all([
            Contact.countDocuments(),
            Contact.countDocuments({ isRead: false }),
            Contact.countDocuments({ isRead: true }),
          ])
        : [0, 0, 0];

    res.render("admin/messages", {
      layout: "layouts/admin-layout",
      messages,
      totalMessages,
      unreadMessages,
      readMessages,
      query: req.query,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load messages");
    res.redirect("/admin/dashboard");
  }
});

router.get("/messages/:id", isAdmin, async (req, res) => {
  try {
    const message = await Contact.findById(req.params.id).lean();

    if (!message) {
      req.flash("error", "Message not found");
      return res.redirect("/admin/messages");
    }

    if (!message.isRead) {
      await Contact.findByIdAndUpdate(req.params.id, { isRead: true });
      message.isRead = true;
    }

    res.render("admin/message-detail", {
      layout: "layouts/admin-layout",
      message,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load message");
    res.redirect("/admin/messages");
  }
});


router.post("/messages/:id/reply", isAdmin, async (req, res) => {
  try {
    const replyBody = String(req.body.replyBody || "").trim();

    if (!replyBody) {
      req.flash("error", "Reply message cannot be empty");
      return res.redirect(`/admin/messages/${req.params.id}`);
    }

    const message = await Contact.findById(req.params.id);

    if (!message) {
      req.flash("error", "Message not found");
      return res.redirect("/admin/messages");
    }

    const mailConfig = transporter.snusMailConfig || {};
    const fromEmail = mailConfig.emailFrom || mailConfig.emailUser || process.env.EMAIL_USER;

    if (!mailConfig.hasEmailUser || !mailConfig.hasEmailPass || !fromEmail) {
      req.flash("error", "Email sending is not configured on this server");
      return res.redirect(`/admin/messages/${req.params.id}`);
    }

    await transporter.sendMail({
      from: `"Snus Village" <${fromEmail}>`,
      replyTo: process.env.EMAIL_REPLY_TO || fromEmail,
      to: message.email,
      subject: `Re: ${message.subject}`,
      text: replyBody,
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
          <p>${replyBody.replace(/\n/g, "<br>")}</p>
          <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#64748b;font-size:13px;">
            Original enquiry from ${message.name}:<br>
            ${message.message.replace(/\n/g, "<br>")}
          </p>
        </div>
      `,
    });

    message.isRead = true;
    message.isReplied = true;
    message.repliedAt = new Date();
    message.replies.push({
      body: replyBody,
      sentAt: new Date(),
      sentBy: req.session?.user?._id || null,
    });

    await message.save();

    req.flash("success", "Reply sent to customer");
    res.redirect(`/admin/messages/${req.params.id}`);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to send reply: " + err.message);
    res.redirect(`/admin/messages/${req.params.id}`);
  }
});


router.post("/messages/:id/read", isAdmin, async (req, res) => {
  try {
    await Contact.findByIdAndUpdate(req.params.id, { isRead: true });
    req.flash("success", "Message marked as read");
    res.redirect(req.get("Referrer") || "/admin/messages");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update message");
    res.redirect("/admin/messages");
  }
});

router.post("/messages/:id/unread", isAdmin, async (req, res) => {
  try {
    await Contact.findByIdAndUpdate(req.params.id, { isRead: false });
    req.flash("success", "Message marked as unread");
    res.redirect(req.get("Referrer") || "/admin/messages");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update message");
    res.redirect("/admin/messages");
  }
});

router.post("/messages/:id/delete", isAdmin, async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    req.flash("success", "Message deleted");
    res.redirect("/admin/messages");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to delete message");
    res.redirect("/admin/messages");
  }
});


router.get("/settings", isAdmin, async (req, res) => {
  try {
    const settings =
      mongoose.connection.readyState === 1
        ? await StoreSettings.findOneAndUpdate(
            { key: "store" },
            { $setOnInsert: { key: "store" } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          ).lean()
        : null;

    res.render("admin/settings", {
      layout: "layouts/admin-layout",
      settings,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load store settings");
    res.redirect("/admin/dashboard");
  }
});

router.post("/settings", isAdmin, async (req, res) => {
  try {
    await StoreSettings.findOneAndUpdate(
      { key: "store" },
      {
        key: "store",
        storeName: String(req.body.storeName || "").trim(),
        storeEmail: String(req.body.storeEmail || "").trim(),
        storePhone: String(req.body.storePhone || "").trim(),
        instagramUrl: String(req.body.instagramUrl || "").trim(),
        deliveryPrice: Math.max(0, Number(req.body.deliveryPrice || 0)),
        freeDeliveryThreshold: Math.max(0, Number(req.body.freeDeliveryThreshold || 0)),
        checkoutNotice: String(req.body.checkoutNotice || "").trim(),
        ageGateMessage: String(req.body.ageGateMessage || "").trim(),
        clickCollectBranch: String(req.body.clickCollectBranch || "").trim(),
        clickCollectAddress: String(req.body.clickCollectAddress || "").trim(),
        clickCollectCity: String(req.body.clickCollectCity || "").trim(),
        clickCollectPostcode: String(req.body.clickCollectPostcode || "").trim(),
        maintenanceMode: req.body.maintenanceMode === "on",
        maintenanceMessage: String(req.body.maintenanceMessage || "").trim(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    req.flash("success", "Store settings updated");
    res.redirect("/admin/settings");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update store settings");
    res.redirect("/admin/settings");
  }
});


router.get("/discounts", isAdmin, async (req, res) => {
  try {
    const discounts =
      mongoose.connection.readyState === 1
        ? await DiscountCode.find().sort({ createdAt: -1 }).lean()
        : [];

    res.render("admin/discounts", {
      layout: "layouts/admin-layout",
      discounts,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load discount codes");
    res.redirect("/admin/dashboard");
  }
});

router.post("/discounts", isAdmin, async (req, res) => {
  try {
    const code = String(req.body.code || "").trim().toUpperCase();

    if (!code) {
      req.flash("error", "Discount code is required");
      return res.redirect("/admin/discounts");
    }

    const type = String(req.body.type || "percentage");

    const value = Math.max(0, Number(req.body.value || 0));
    const minimumSpend = Math.max(0, Number(req.body.minimumSpend || 0));
    const usageLimit = Math.max(0, Number.parseInt(req.body.usageLimit || "0", 10));

    if (type === "percentage" && value > 100) {
      req.flash("error", "Percentage discount cannot be more than 100%");
      return res.redirect("/admin/discounts");
    }

    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

    await DiscountCode.create({
      code,
      description: String(req.body.description || "").trim(),
      type,
      value,
      minimumSpend,
      usageLimit,
      appliesToBrand: String(req.body.appliesToBrand || "").trim(),
      appliesToCategory: String(req.body.appliesToCategory || "").trim(),
      expiresAt,
      isActive: req.body.isActive === "on",
    });

    req.flash("success", "Discount code created");
    res.redirect("/admin/discounts");
  } catch (err) {
    console.log(err);

    if (err.code === 11000) {
      req.flash("error", "That discount code already exists");
    } else {
      req.flash("error", "Unable to create discount code: " + err.message);
    }

    res.redirect("/admin/discounts");
  }
});

router.post("/discounts/:id/toggle", isAdmin, async (req, res) => {
  try {
    const discount = await DiscountCode.findById(req.params.id);

    if (!discount) {
      req.flash("error", "Discount code not found");
      return res.redirect("/admin/discounts");
    }

    discount.isActive = !discount.isActive;
    await discount.save();

    req.flash("success", `Discount code ${discount.isActive ? "enabled" : "disabled"}`);
    res.redirect("/admin/discounts");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update discount code");
    res.redirect("/admin/discounts");
  }
});

router.post("/discounts/:id/delete", isAdmin, async (req, res) => {
  try {
    await DiscountCode.findByIdAndDelete(req.params.id);

    req.flash("success", "Discount code deleted");
    res.redirect("/admin/discounts");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to delete discount code");
    res.redirect("/admin/discounts");
  }
});


router.get("/orders", isAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = 20;
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const paymentStatus = String(req.query.paymentStatus || "").trim();
    const orderStatus = String(req.query.orderStatus || "").trim();
    const fulfilmentMethod = String(req.query.fulfilmentMethod || "").trim();
    const royalMailStatus = String(req.query.royalMailStatus || "").trim();
    const sort = String(req.query.sort || "newest").trim();

    const filter = {};

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(safeSearch, "i");

      filter.$or = [
        { "customer.email": searchRegex },
        { "customer.firstName": searchRegex },
        { "customer.lastName": searchRegex },
        { "customer.phone": searchRegex },
        { "sumup.checkoutReference": searchRegex },
      ];

      if (mongoose.Types.ObjectId.isValid(search)) {
        filter.$or.push({ _id: search });
      }
    }

    if (["pending", "paid", "failed"].includes(paymentStatus)) {
      filter.paymentStatus = paymentStatus;
    }

    if (["new", "processing", "packed", "shipped", "completed", "cancelled"].includes(orderStatus)) {
      filter.orderStatus = orderStatus;
    }

    if (["delivery", "click_collect"].includes(fulfilmentMethod)) {
      filter["fulfilment.method"] = fulfilmentMethod;
    }

    if (["not_sent", "sent", "failed"].includes(royalMailStatus)) {
      filter["royalMail.syncStatus"] = royalMailStatus;
    }

    let sortOption = { createdAt: -1 };

    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "total-high") sortOption = { total: -1 };
    if (sort === "total-low") sortOption = { total: 1 };

    const [orders, totalOrders, stats] =
      mongoose.connection.readyState === 1
        ? await Promise.all([
            Order.find(filter).sort(sortOption).skip(skip).limit(limit).lean(),
            Order.countDocuments(filter),
            Promise.all([
              Order.countDocuments(),
              Order.countDocuments({ paymentStatus: "paid" }),
              Order.countDocuments({ paymentStatus: "pending" }),
              Order.countDocuments({ orderStatus: { $in: ["new", "processing", "packed"] } }),
              Order.countDocuments({ "fulfilment.method": "click_collect" }),
              Order.countDocuments({ "royalMail.syncStatus": "failed" }),
            ]),
          ])
        : [[], 0, [0, 0, 0, 0, 0, 0]];

    const totalPages = Math.max(1, Math.ceil(totalOrders / limit));

    res.render("admin/orders", {
      layout: "layouts/admin-layout",
      orders,
      query: req.query,
      pagination: {
        page,
        limit,
        totalOrders,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
      stats: {
        total: stats[0],
        paid: stats[1],
        pending: stats[2],
        active: stats[3],
        clickCollect: stats[4],
        royalMailFailed: stats[5],
      },
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

    res.redirect(req.get("Referrer") || "/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update order status");
    res.redirect(req.get("Referrer") || "/admin/orders");
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
    const filter = {};
    const search = String(req.query.search || "").trim();

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(safeSearch, "i");

      filter.$or = [
        { name: searchRegex },
        { brand: searchRegex },
        { flavour: searchRegex },
        { nicotine: searchRegex },
        { category: searchRegex },
        { sku: searchRegex },
        { barcode: searchRegex },
        { supplier: searchRegex },
        { supplierCode: searchRegex },
        { description: searchRegex },
      ];
    }

    // BRAND FILTER
    if (req.query.brand && req.query.brand !== "") {
      const cleanBrand = String(req.query.brand).toLowerCase().replace(/\s+/g, "");

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

    if (req.query.visibility === "active") {
      filter.isActive = { $ne: false };
    }

    if (req.query.visibility === "hidden") {
      filter.isActive = false;
    }

    if (req.query.featured === "yes") {
      filter.isFeatured = true;
    }

    if (req.query.bestSeller === "yes") {
      filter.isBestSeller = true;
    }

    if (req.query.saleBadge === "yes") {
      filter.showSaleBadge = true;
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
    const hiddenProducts = await Product.countDocuments({ isActive: false });
    const featuredProducts = await Product.countDocuments({ isFeatured: true });
    const bestSellerProducts = await Product.countDocuments({ isBestSeller: true });

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
      hiddenProducts,
      featuredProducts,
      bestSellerProducts,

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
      sku,
      barcode,
      supplier,
      supplierCode,
      costPrice,
      stock,
      seoTitle,
      seoDescription,
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
      sku: String(sku || "").trim().toUpperCase(),
      barcode: String(barcode || "").trim(),
      supplier: String(supplier || "").trim(),
      supplierCode: String(supplierCode || "").trim(),
      costPrice: Number(costPrice || 0),
      stock,
      images,
      isActive: req.body.isActive === "on",
      isFeatured: req.body.isFeatured === "on",
      isBestSeller: req.body.isBestSeller === "on",
      showSaleBadge: req.body.showSaleBadge === "on",
      seoTitle: String(seoTitle || "").trim(),
      seoDescription: String(seoDescription || "").trim(),
    });

    req.flash("success", "Product added successfully!");
    res.redirect("/admin/products");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error creating product");
    res.redirect("/admin/products/add");
  }
});


router.post("/products/:id/toggle-active", isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      req.flash("error", "Product not found");
      return res.redirect("/admin/products");
    }

    product.isActive = product.isActive === false;
    await product.save();

    req.flash("success", product.isActive ? "Product is now active" : "Product is now hidden");
    res.redirect(req.get("Referrer") || "/admin/products");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update product visibility");
    res.redirect("/admin/products");
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
      sku,
      barcode,
      supplier,
      supplierCode,
      costPrice,
      stock,
      seoTitle,
      seoDescription,
    } = req.body;

    const product = await Product.findById(req.params.id);

    const updatedData = {
      name,
      price: parseFloat(price),
      discountPrice: discountPrice ? parseFloat(discountPrice) : 0,
      description,
      strength,
      nicotine,
      brand,
      flavour,
      category,
      sku: String(sku || "").trim().toUpperCase(),
      barcode: String(barcode || "").trim(),
      supplier: String(supplier || "").trim(),
      supplierCode: String(supplierCode || "").trim(),
      costPrice: Number(costPrice || 0),
      stock,
      isActive: req.body.isActive === "on",
      isFeatured: req.body.isFeatured === "on",
      isBestSeller: req.body.isBestSeller === "on",
      showSaleBadge: req.body.showSaleBadge === "on",
      seoTitle: String(seoTitle || "").trim(),
      seoDescription: String(seoDescription || "").trim(),
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
      return res.redirect(req.get("Referrer") || "/admin/orders");
    }

    if (order.royalMail && order.royalMail.syncStatus === "sent") {
      req.flash("error", "This order has already been sent to Royal Mail");
      return res.redirect(req.get("Referrer") || "/admin/orders");
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

    res.redirect(req.get("Referrer") || "/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to send order to Royal Mail");
    res.redirect(req.get("Referrer") || "/admin/orders");
  }
});



router.post("/orders/:id/generate-label", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect(req.get("Referrer") || "/admin/orders");
    }

    if (!order.royalMail || order.royalMail.syncStatus !== "sent") {
      req.flash("error", "Order must be sent to Royal Mail before generating a label");
      return res.redirect(req.get("Referrer") || "/admin/orders");
    }

    if (!order.royalMail.orderIdentifier) {
      req.flash("error", "Royal Mail order identifier is missing");
      return res.redirect(req.get("Referrer") || "/admin/orders");
    }

    const { getRoyalMailLabel } = require("../utils/royalMail");
    const labelResult = await getRoyalMailLabel(order.royalMail.orderIdentifier);

    if (!labelResult.ok) {
      order.royalMail.labelGenerated = false;
      order.royalMail.labelError = labelResult.message || "Unable to generate Royal Mail label";
      await order.save();

      req.flash("error", order.royalMail.labelError);
      return res.redirect(req.get("Referrer") || "/admin/orders");
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

    res.redirect(req.get("Referrer") || "/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to generate Royal Mail label");
    res.redirect(req.get("Referrer") || "/admin/orders");
  }
});

router.get("/orders/:id/download-label", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order || !order.royalMail || !order.royalMail.labelPath) {
      req.flash("error", "Label not found");
      return res.redirect(req.get("Referrer") || "/admin/orders");
    }

    if (!fs.existsSync(order.royalMail.labelPath)) {
      req.flash("error", "Label file is missing");
      return res.redirect(req.get("Referrer") || "/admin/orders");
    }

    res.download(order.royalMail.labelPath, `royal-mail-label-${order._id}.pdf`);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to download label");
    res.redirect(req.get("Referrer") || "/admin/orders");
  }
});




router.post("/orders/:id/admin-update", isAdmin, async (req, res) => {
  try {
    const checklist = {
      paymentChecked: req.body.paymentChecked === "on",
      stockChecked: req.body.stockChecked === "on",
      packed: req.body.packed === "on",
      labelReady: req.body.labelReady === "on",
      customerNotified: req.body.customerNotified === "on",
    };

    await Order.findByIdAndUpdate(req.params.id, {
      adminNotes: String(req.body.adminNotes || "").trim(),
      fulfilmentChecklist: checklist,
    });

    req.flash("success", "Order admin notes updated");
    res.redirect(`/admin/orders/${req.params.id}`);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update order admin notes");
    res.redirect(`/admin/orders/${req.params.id}`);
  }
});


router.get("/orders/:id", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect(req.get("Referrer") || "/admin/orders");
    }

    res.render("admin/order-detail", {
      layout: "layouts/admin-layout",
      order,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load order");
    res.redirect(req.get("Referrer") || "/admin/orders");
  }
});


module.exports = router;
