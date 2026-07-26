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
const PageView = require("../models/PageView");
const HomepageContent = require("../models/HomepageContent");
const DiscountCode = require("../models/DiscountCode");
const StoreSettings = require("../models/StoreSettings");
const AdminAuditLog = require("../models/AdminAuditLog");
const isAdmin = require("../middleware/isAdmin");
const upload = require("../middleware/upload");
const videoUpload = require("../middleware/videoUpload");
const { verifyCsrfToken } = require("../middleware/csrf");
const wholesaleApplicationStore = require("../utils/wholesaleApplicationStore");
const transporter = require("../config/mailer");
const { sendOrderEmails, sendCustomerShippingEmail } = require("../utils/orderEmails");
const { refundCheckout } = require("../utils/sumup");
const { storeProductImages } = require("../utils/productImages");
const { storeHomepageVideo, storeHomepageImage } = require("../utils/homepageMedia");

function buildProductSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function requireAdminRole(allowedRoles = []) {
  return function (req, res, next) {
    const role = req.session?.user?.role || res.locals.user?.role || "user";

    if (!allowedRoles.includes(role)) {
      req.flash("error", "You do not have permission to access that admin area.");
      return res.redirect("/admin/dashboard");
    }

    next();
  };
}

const PERMISSIONS = {
  ownerAdmin: ["owner", "admin"],
  analytics: ["owner", "admin", "manager"],
  website: ["owner", "admin", "manager"],
  support: ["owner", "admin", "manager", "support"],
  orders: ["owner", "admin", "manager", "fulfilment"],
  products: ["owner", "admin", "manager", "product_manager"],
};

// The admin panel is a single-page shell (views/layouts/admin-layout.ejs).
// Direct URL loads render the full shell; in-app navigation fetches the same
// route with this header set and gets back just the page content, which the
// client swaps into #content without a full reload.
function adminLayout(req) {
  return req.get("X-Admin-Spa") === "1" ? false : "layouts/admin-layout";
}

async function getAdminGlance() {
  const fallback = { pendingOrders: 0, unreadMessages: 0, lowStock: 0, pendingWholesale: 0, activeCarts: 0 };

  if (mongoose.connection.readyState !== 1) return fallback;

  try {
    const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);

    const [pendingOrders, unreadMessages, lowStock, pendingWholesale, activeCarts] = await Promise.all([
      Order.countDocuments({ orderStatus: { $in: ["new", "processing"] } }),
      Contact.countDocuments({ isRead: false }),
      Product.countDocuments({ isActive: { $ne: false }, stock: { $gt: 0, $lte: 5 } }),
      WholesaleApplication.countDocuments({ status: "pending" }),
      Cart.countDocuments({ updatedAt: { $gte: staleCutoff }, "items.0": { $exists: true } }),
    ]);

    return { pendingOrders, unreadMessages, lowStock, pendingWholesale, activeCarts };
  } catch (err) {
    console.log("Admin glance stats failed:", err.message);
    return fallback;
  }
}

router.use(async (req, res, next) => {
  if (!req.session?.user) return next();
  res.locals.adminGlance = await getAdminGlance();
  next();
});

async function logAdminAction(req, action, options = {}) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return;
    }

    const admin = req.session?.user || {};

    await AdminAuditLog.create({
      admin: admin._id || null,
      adminEmail: admin.email || "",
      adminRole: admin.role || "",
      action,
      targetType: options.targetType || "",
      targetId: options.targetId ? String(options.targetId) : "",
      summary: options.summary || "",
      meta: options.meta || {},
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    });
  } catch (err) {
    console.log("Audit log failed:", err.message);
  }
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAdminProductFilter(source = {}) {
  const filter = {};
  const search = String(source.search || "").trim();

  if (search) {
    const searchRegex = new RegExp(escapeRegExp(search), "i");

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

  if (source.brand && source.brand !== "") {
    const cleanBrand = String(source.brand).toLowerCase().replace(/\s+/g, "");

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

  if (source.strength && source.strength !== "") {
    filter.strength = source.strength;
  }

  if (source.stock === "in") {
    filter.stock = { $gt: 0 };
  }

  if (source.stock === "out") {
    filter.stock = 0;
  }

  if (source.visibility === "active") {
    filter.isActive = { $ne: false };
  }

  if (source.visibility === "hidden") {
    filter.isActive = false;
  }

  if (source.featured === "yes") {
    filter.isFeatured = true;
  }

  if (source.bestSeller === "yes") {
    filter.isBestSeller = true;
  }

  if (source.saleBadge === "yes") {
    filter.showSaleBadge = true;
  }

  return filter;
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




router.get("/homepage", isAdmin, requireAdminRole(PERMISSIONS.website), async (req, res) => {
  try {
    let homepageContent = null;

    if (mongoose.connection.readyState === 1) {
      homepageContent = await HomepageContent.findOneAndUpdate(
        { key: "homepage" },
        { $setOnInsert: { key: "homepage" } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      ).lean();
    }

    res.render("admin/homepage", {
      layout: adminLayout(req),
      homepageContent,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load homepage controls");
    res.redirect("/admin/dashboard");
  }
});

router.get("/homepage/hero", isAdmin, requireAdminRole(PERMISSIONS.website), async (req, res) => {
  try {
    const homepageContent = await HomepageContent.findOneAndUpdate(
      { key: "homepage" },
      { $setOnInsert: { key: "homepage" } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    )
      .populate("hero.slides.product")
      .lean();

    const products = await Product.find({ isActive: { $ne: false } })
      .select("name brand images slug")
      .sort({ name: 1 })
      .lean();

    res.render("admin/homepage-hero", {
      layout: adminLayout(req),
      heroSlides: homepageContent?.hero?.slides || [],
      products,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load hero banner controls");
    res.redirect("/admin/homepage");
  }
});

router.post(
  "/homepage/hero/slides",
  isAdmin,
  requireAdminRole(PERMISSIONS.website),
  upload.single("bgImage"),
  verifyCsrfToken,
  async (req, res) => {
    try {
      const productId = String(req.body.product || "").trim();

      if (!productId) {
        req.flash("error", "Please choose a product for the new hero slide.");
        return res.redirect("/admin/homepage/hero");
      }

      const product = await Product.findById(productId).select("_id").lean();

      if (!product) {
        req.flash("error", "That product could not be found.");
        return res.redirect("/admin/homepage/hero");
      }

      if (!req.file) {
        req.flash("error", "Please upload a background image for this hero slide.");
        return res.redirect("/admin/homepage/hero");
      }

      const [bgImageSrc] = await storeProductImages([req.file]);

      await HomepageContent.findOneAndUpdate(
        { key: "homepage" },
        {
          $push: {
            "hero.slides": { product: product._id, bgImageSrc: bgImageSrc || "" },
          },
        },
        { upsert: true }
      );

      req.flash("success", "Hero slide added.");
      res.redirect("/admin/homepage/hero");
    } catch (err) {
      console.log(err);
      req.flash("error", "Unable to add hero slide: " + err.message);
      res.redirect("/admin/homepage/hero");
    }
  }
);

router.post(
  "/homepage/hero/slides/:slideId",
  isAdmin,
  requireAdminRole(PERMISSIONS.website),
  upload.single("bgImage"),
  verifyCsrfToken,
  async (req, res) => {
    try {
      const { slideId } = req.params;
      const productId = String(req.body.product || "").trim();

      if (!productId) {
        req.flash("error", "Please choose a product for this hero slide.");
        return res.redirect("/admin/homepage/hero");
      }

      const product = await Product.findById(productId).select("_id").lean();

      if (!product) {
        req.flash("error", "That product could not be found.");
        return res.redirect("/admin/homepage/hero");
      }

      const update = {
        "hero.slides.$.product": product._id,
      };

      if (req.file) {
        const [bgImageSrc] = await storeProductImages([req.file]);
        update["hero.slides.$.bgImageSrc"] = bgImageSrc || "";
      }

      await HomepageContent.updateOne(
        { key: "homepage", "hero.slides._id": slideId },
        { $set: update }
      );

      req.flash("success", "Hero slide updated.");
      res.redirect("/admin/homepage/hero");
    } catch (err) {
      console.log(err);
      req.flash("error", "Unable to update hero slide: " + err.message);
      res.redirect("/admin/homepage/hero");
    }
  }
);

router.post(
  "/homepage/hero/slides/:slideId/delete",
  isAdmin,
  requireAdminRole(PERMISSIONS.website),
  async (req, res) => {
    try {
      await HomepageContent.updateOne(
        { key: "homepage" },
        { $pull: { "hero.slides": { _id: req.params.slideId } } }
      );

      req.flash("success", "Hero slide removed.");
      res.redirect("/admin/homepage/hero");
    } catch (err) {
      console.log(err);
      req.flash("error", "Unable to remove hero slide: " + err.message);
      res.redirect("/admin/homepage/hero");
    }
  }
);

router.post(
  "/homepage/hero/slides/:slideId/move",
  isAdmin,
  requireAdminRole(PERMISSIONS.website),
  async (req, res) => {
    try {
      const direction = req.body.direction === "up" ? -1 : 1;
      const homepageContent = await HomepageContent.findOne({ key: "homepage" });

      if (!homepageContent) {
        return res.redirect("/admin/homepage/hero");
      }

      const slides = homepageContent.hero.slides;
      const index = slides.findIndex((slide) => String(slide._id) === req.params.slideId);
      const targetIndex = index + direction;

      if (index === -1 || targetIndex < 0 || targetIndex >= slides.length) {
        return res.redirect("/admin/homepage/hero");
      }

      const [moved] = slides.splice(index, 1);
      slides.splice(targetIndex, 0, moved);

      await homepageContent.save();

      res.redirect("/admin/homepage/hero");
    } catch (err) {
      console.log(err);
      req.flash("error", "Unable to reorder hero slides: " + err.message);
      res.redirect("/admin/homepage/hero");
    }
  }
);


router.post(
  "/homepage/hero-distro",
  isAdmin,
  requireAdminRole(PERMISSIONS.website),
  upload.fields([
    { name: "distroImage1", maxCount: 1 },
  ]),
  verifyCsrfToken,
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

      const distroImages = [
        {
          imageSrc: await imagePath("distroImage1", body.distroImageSrc1),
          alt: String(body.distroImageAlt1 || "").trim(),
        },
      ];

      const badges = String(body.distroBadges || "")
        .split(",")
        .map((badge) => badge.trim())
        .filter(Boolean);

      await HomepageContent.findOneAndUpdate(
        { key: "homepage" },
        {
          $set: {
            key: "homepage",
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
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      req.flash("success", "SVG Distro section updated");
      res.redirect("/admin/homepage");
    } catch (err) {
      console.log(err);
      req.flash("error", "Unable to update SVG Distro section: " + err.message);
      res.redirect("/admin/homepage");
    }
  }
);



router.post(
  "/homepage/collections",
  isAdmin,
  requireAdminRole(PERMISSIONS.website),
  upload.fields([
    { name: "collectionImage1", maxCount: 1 },
    { name: "collectionImage2", maxCount: 1 },
    { name: "collectionImage3", maxCount: 1 },
    { name: "collectionImage4", maxCount: 1 },
  ]),
  verifyCsrfToken,
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

      const cards = await Promise.all(
        [1, 2, 3, 4].map(async (number) => ({
          number: String(body[`collectionNumber${number}`] || "").trim(),
          title: String(body[`collectionTitle${number}`] || "").trim(),
          text: String(body[`collectionText${number}`] || "").trim(),
          linkText: String(body[`collectionLinkText${number}`] || "").trim(),
          linkUrl: String(body[`collectionLinkUrl${number}`] || "").trim(),
          imageSrc: await imagePath(
            `collectionImage${number}`,
            body[`collectionImageSrc${number}`]
          ),
          darkCard: body[`collectionDarkCard${number}`] === "on",
        }))
      );

      await HomepageContent.findOneAndUpdate(
        { key: "homepage" },
        {
          $set: {
            key: "homepage",
            "collections.eyebrow": String(body.collectionsEyebrow || "").trim(),
            "collections.heading": String(body.collectionsHeading || "").trim(),
            "collections.description": String(body.collectionsDescription || "").trim(),
            "collections.buttonText": String(body.collectionsButtonText || "").trim(),
            "collections.buttonLink": String(body.collectionsButtonLink || "").trim(),
            "collections.cards": cards,
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      req.flash("success", "Homepage collections section updated");
      res.redirect("/admin/homepage");
    } catch (err) {
      console.log(err);
      req.flash("error", "Unable to update homepage collections section: " + err.message);
      res.redirect("/admin/homepage");
    }
  }
);



router.post(
  "/homepage/locations",
  isAdmin,
  requireAdminRole(PERMISSIONS.website),
  async (req, res) => {
    try {
      const body = req.body || {};

      const cards = [1, 2, 3].map((number) => ({
        label: String(body[`locationLabel${number}`] || "").trim(),
        title: String(body[`locationTitle${number}`] || "").trim(),
        description: String(body[`locationDescription${number}`] || "").trim(),
        mapUrl: String(body[`locationMapUrl${number}`] || "").trim(),
        mapTitle: String(body[`locationMapTitle${number}`] || "").trim(),
        buttonText: String(body[`locationButtonText${number}`] || "").trim(),
        buttonLink: String(body[`locationButtonLink${number}`] || "").trim(),
      }));

      await HomepageContent.findOneAndUpdate(
        { key: "homepage" },
        {
          $set: {
            key: "homepage",
            "locations.eyebrow": String(body.locationsEyebrow || "").trim(),
            "locations.heading": String(body.locationsHeading || "").trim(),
            "locations.description": String(body.locationsDescription || "").trim(),
            "locations.buttonText": String(body.locationsButtonText || "").trim(),
            "locations.buttonLink": String(body.locationsButtonLink || "").trim(),
            "locations.cards": cards,
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );

      req.flash("success", "Homepage locations section updated");
      res.redirect("/admin/homepage");
    } catch (err) {
      console.log(err);
      req.flash("error", "Unable to update homepage locations section: " + err.message);
      res.redirect("/admin/homepage");
    }
  }
);


router.post(
  "/homepage/social",
  isAdmin,
  requireAdminRole(PERMISSIONS.website),
  videoUpload.fields([
    { name: "socialVideo1", maxCount: 1 },
    { name: "socialVideo2", maxCount: 1 },
    { name: "socialVideo3", maxCount: 1 },
    { name: "posterImage1", maxCount: 1 },
    { name: "posterImage2", maxCount: 1 },
    { name: "posterImage3", maxCount: 1 },
  ]),
  verifyCsrfToken,
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
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
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



router.get("/seo", isAdmin, requireAdminRole(PERMISSIONS.website), async (req, res) => {
  try {
    const issue = String(req.query.issue || "").trim();
    const search = String(req.query.search || "").trim();

    const filter = {};

    if (issue === "missingTitle") {
      filter.$or = [{ seoTitle: { $exists: false } }, { seoTitle: "" }];
    }

    if (issue === "missingDescription") {
      filter.$or = [{ seoDescription: { $exists: false } }, { seoDescription: "" }];
    }

    if (issue === "shortDescription") {
      filter.$expr = { $lt: [{ $strLenCP: { $ifNull: ["$description", ""] } }, 80] };
    }

    if (issue === "noImage") {
      filter.$or = [{ images: { $exists: false } }, { images: { $size: 0 } }];
    }

    if (issue === "hidden") {
      filter.isActive = false;
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(safeSearch, "i");

      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { name: searchRegex },
          { brand: searchRegex },
          { sku: searchRegex },
          { slug: searchRegex },
        ],
      });
    }

    const allProducts =
      mongoose.connection.readyState === 1
        ? await Product.find().lean()
        : [];

    const productsRaw =
      mongoose.connection.readyState === 1
        ? await Product.find(filter).sort({ updatedAt: -1 }).limit(150).lean()
        : [];

    function analyseProduct(product) {
      const issues = [];
      let score = 100;

      const seoTitle = String(product.seoTitle || "").trim();
      const seoDescription = String(product.seoDescription || "").trim();
      const description = String(product.description || "").trim();

      if (!seoTitle) {
        issues.push("Missing SEO Title");
        score -= 25;
      } else if (seoTitle.length < 35 || seoTitle.length > 70) {
        issues.push("SEO Title Length");
        score -= 10;
      }

      if (!seoDescription) {
        issues.push("Missing SEO Description");
        score -= 25;
      } else if (seoDescription.length < 80 || seoDescription.length > 170) {
        issues.push("SEO Description Length");
        score -= 10;
      }

      if (description.length < 80) {
        issues.push("Short Product Description");
        score -= 15;
      }

      if (!product.images || product.images.length === 0) {
        issues.push("No Image");
        score -= 15;
      }

      if (!product.slug) {
        issues.push("Missing Slug");
        score -= 10;
      }

      if (product.isActive === false) {
        issues.push("Hidden");
        score -= 5;
      }

      return {
        ...product,
        seoScore: Math.max(0, score),
        issues,
        seoTitleLength: seoTitle.length,
        seoDescriptionLength: seoDescription.length,
      };
    }

    const analysedAll = allProducts.map(analyseProduct);
    const products = productsRaw.map(analyseProduct);

    res.render("admin/seo", {
      layout: adminLayout(req),
      products,
      query: req.query,
      stats: {
        totalProducts: analysedAll.length,
        missingSeoTitle: analysedAll.filter((p) => !String(p.seoTitle || "").trim()).length,
        missingSeoDescription: analysedAll.filter((p) => !String(p.seoDescription || "").trim()).length,
        shortDescription: analysedAll.filter((p) => String(p.description || "").trim().length < 80).length,
        noImage: analysedAll.filter((p) => !p.images || p.images.length === 0).length,
        hiddenProducts: analysedAll.filter((p) => p.isActive === false).length,
      },
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load SEO dashboard");
    res.redirect("/admin/dashboard");
  }
});

router.get("/search-analytics", isAdmin, requireAdminRole(PERMISSIONS.analytics), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.render("admin/search-analytics", {
        layout: adminLayout(req),
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
      layout: adminLayout(req),
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


router.get("/analytics", isAdmin, requireAdminRole(PERMISSIONS.analytics), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.render("admin/analytics", {
        layout: adminLayout(req),
        stats: {
          totalRevenue: 0,
          todayRevenue: 0,
          totalOrders: 0,
          paidOrders: 0,
          failedPayments: 0,
          averageOrderValue: 0,
          todayPageViews: 0,
          sevenDayPageViews: 0,
          todayUniqueVisitors: 0,
          sevenDayUniqueVisitors: 0,
        },
        revenueByDay: [],
        pageViewsByDay: [],
        bestProducts: [],
        bestBrands: [],
        recentPaidOrders: [],
        popularPages: [],
        recentPageViews: [],
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
      pageViewsByDay,
      popularPages,
      recentPageViews,
      todayPageViews,
      sevenDayPageViews,
      todayUniqueVisitors,
      sevenDayUniqueVisitors,
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

      PageView.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              day: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                },
              },
              visitorId: "$visitorId",
            },
            views: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: "$_id.day",
            views: { $sum: "$views" },
            uniqueVisitors: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).allowDiskUse(true),

      PageView.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              path: "$path",
              visitorId: "$visitorId",
            },
            views: { $sum: 1 },
            lastViewedAt: { $max: "$createdAt" },
          },
        },
        {
          $group: {
            _id: "$_id.path",
            views: { $sum: "$views" },
            uniqueVisitors: { $sum: 1 },
            lastViewedAt: { $max: "$lastViewedAt" },
          },
        },
        { $sort: { views: -1, uniqueVisitors: -1 } },
        { $limit: 10 },
      ]).allowDiskUse(true),

      PageView.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      PageView.countDocuments({ createdAt: { $gte: todayStart } }),

      PageView.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),

      PageView.distinct("visitorId", {
        createdAt: { $gte: todayStart },
      }).then((visitors) => visitors.filter(Boolean).length),

      PageView.distinct("visitorId", {
        createdAt: { $gte: sevenDaysAgo },
      }).then((visitors) => visitors.filter(Boolean).length),

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
      layout: adminLayout(req),
      stats: {
        totalRevenue,
        todayRevenue,
        totalOrders,
        paidOrders,
        failedPayments,
        averageOrderValue,
        todayPageViews,
        sevenDayPageViews,
        todayUniqueVisitors,
        sevenDayUniqueVisitors,
      },
      revenueByDay,
      pageViewsByDay,
      popularPages,
      recentPageViews,
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
    layout: adminLayout(req),
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

router.get("/carts", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
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
      layout: adminLayout(req),
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

router.post("/carts/:id/delete", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
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

router.get("/orders/export/csv", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
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




router.get("/messages", isAdmin, requireAdminRole(PERMISSIONS.support), async (req, res) => {
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
      layout: adminLayout(req),
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

router.get("/messages/:id", isAdmin, requireAdminRole(PERMISSIONS.support), async (req, res) => {
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
      layout: adminLayout(req),
      message,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load message");
    res.redirect("/admin/messages");
  }
});


router.post("/messages/:id/reply", isAdmin, requireAdminRole(PERMISSIONS.support), async (req, res) => {
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


router.post("/messages/:id/read", isAdmin, requireAdminRole(PERMISSIONS.support), async (req, res) => {
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

router.post("/messages/:id/unread", isAdmin, requireAdminRole(PERMISSIONS.support), async (req, res) => {
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

router.post("/messages/:id/delete", isAdmin, requireAdminRole(PERMISSIONS.support), async (req, res) => {
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


router.get("/settings", isAdmin, requireAdminRole(PERMISSIONS.website), async (req, res) => {
  try {
    const settings =
      mongoose.connection.readyState === 1
        ? await StoreSettings.findOneAndUpdate(
            { key: "store" },
            { $setOnInsert: { key: "store" } },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
          ).lean()
        : null;

    res.render("admin/settings", {
      layout: adminLayout(req),
      settings,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load store settings");
    res.redirect("/admin/dashboard");
  }
});

router.post("/settings", isAdmin, requireAdminRole(PERMISSIONS.website), async (req, res) => {
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
        hideVapesCategory: req.body.hideVapesCategory === "on",
        maintenanceMessage: String(req.body.maintenanceMessage || "").trim(),
        promoPopupEnabled: req.body.promoPopupEnabled === "on",
        promoPopupDelaySeconds: Math.max(0, Number(req.body.promoPopupDelaySeconds || 20)),
        promoPopupHeading: String(req.body.promoPopupHeading || "").trim(),
        promoPopupBody: String(req.body.promoPopupBody || "").trim(),
        promoPopupCode: String(req.body.promoPopupCode || "").trim().toUpperCase(),
        promoPopupButtonText: String(req.body.promoPopupButtonText || "").trim(),
        promoPopupButtonLink: String(req.body.promoPopupButtonLink || "").trim() || "/shop",
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    global.__snusStoreSettingsCacheBust = Date.now();

    req.flash("success", "Store settings updated");
    res.redirect("/admin/settings");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update store settings");
    res.redirect("/admin/settings");
  }
});


router.get("/discounts", isAdmin, requireAdminRole(PERMISSIONS.website), async (req, res) => {
  try {
    const discounts =
      mongoose.connection.readyState === 1
        ? await DiscountCode.find().sort({ createdAt: -1 }).lean()
        : [];

    res.render("admin/discounts", {
      layout: adminLayout(req),
      discounts,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load discount codes");
    res.redirect("/admin/dashboard");
  }
});

router.post("/discounts", isAdmin, requireAdminRole(PERMISSIONS.website), async (req, res) => {
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

router.post("/discounts/:id/toggle", isAdmin, requireAdminRole(PERMISSIONS.website), async (req, res) => {
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

router.post("/discounts/:id/delete", isAdmin, requireAdminRole(PERMISSIONS.website), async (req, res) => {
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


router.get("/orders", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
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

    if (["pending", "paid", "failed", "refunded"].includes(paymentStatus)) {
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
      layout: adminLayout(req),
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

router.post("/orders/:id/status", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
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

    const oldOrder = await Order.findById(req.params.id).lean();

    const updatedOrder = await Order.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });

    const paymentChangedToPaid =
      oldOrder?.paymentStatus !== "paid" &&
      update.paymentStatus === "paid" &&
      updatedOrder &&
      !updatedOrder.emailNotifications?.orderConfirmationSent;

    if (paymentChangedToPaid) {
      try {
        const emailResults = await sendOrderEmails(updatedOrder);

        updatedOrder.emailNotifications = {
          ...updatedOrder.emailNotifications,
          orderConfirmationSent: Boolean(emailResults.customer?.ok),
          orderConfirmationSentAt: emailResults.customer?.ok
            ? new Date()
            : updatedOrder.emailNotifications?.orderConfirmationSentAt || null,
          lastOrderEmailError: emailResults.customer?.ok ? "" : emailResults.customer?.message || "",
        };

        await updatedOrder.save();
        console.log("Admin order email results:", JSON.stringify(emailResults, null, 2));
      } catch (emailError) {
        updatedOrder.emailNotifications = {
          ...updatedOrder.emailNotifications,
          lastOrderEmailError: emailError.message,
        };

        await updatedOrder.save();
        console.log("Admin order email error:", emailError.message);
      }
    }

    const orderChangedToShipped =
      oldOrder?.orderStatus !== "shipped" &&
      update.orderStatus === "shipped" &&
      updatedOrder &&
      !updatedOrder.emailNotifications?.shippingEmailSent;

    if (orderChangedToShipped) {
      try {
        const shippingEmailResult = await sendCustomerShippingEmail(updatedOrder);

        updatedOrder.emailNotifications = {
          ...updatedOrder.emailNotifications,
          shippingEmailSent: Boolean(shippingEmailResult.ok),
          shippingEmailSentAt: shippingEmailResult.ok
            ? new Date()
            : updatedOrder.emailNotifications?.shippingEmailSentAt || null,
          lastShippingEmailError: shippingEmailResult.ok ? "" : shippingEmailResult.message || "",
        };

        await updatedOrder.save();
        console.log("Admin shipping email result:", JSON.stringify(shippingEmailResult, null, 2));
      } catch (emailError) {
        updatedOrder.emailNotifications = {
          ...updatedOrder.emailNotifications,
          lastShippingEmailError: emailError.message,
        };

        await updatedOrder.save();
        console.log("Admin shipping email error:", emailError.message);
      }
    }

    await logAdminAction(req, "ORDER_STATUS_UPDATED", {
      targetType: "Order",
      targetId: req.params.id,
      summary: `Updated order status/payment status for order ${String(req.params.id).slice(-6).toUpperCase()}`,
      meta: {
        previousOrderStatus: oldOrder?.orderStatus || "",
        newOrderStatus: update.orderStatus || oldOrder?.orderStatus || "",
        previousPaymentStatus: oldOrder?.paymentStatus || "",
        newPaymentStatus: update.paymentStatus || oldOrder?.paymentStatus || "",
        update,
      },
    });

    res.redirect(req.get("Referrer") || "/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update order status");
    res.redirect(req.get("Referrer") || "/admin/orders");
  }
});

router.post("/orders/:id/cancel-refund", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
  const redirectTo = req.get("Referrer") || `/admin/orders/${req.params.id}`;

  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/admin/orders");
    }

    if (order.paymentStatus !== "paid") {
      req.flash("error", `Only paid orders can be cancelled and refunded (this order is "${order.paymentStatus}").`);
      return res.redirect(redirectTo);
    }

    if (order.sumup?.refunded) {
      req.flash("error", "This order has already been refunded.");
      return res.redirect(redirectTo);
    }

    let refundResult;

    try {
      refundResult = await refundCheckout(order.sumup?.checkoutId, null);
    } catch (refundError) {
      order.sumup = {
        ...order.sumup,
        refundError: refundError.message,
      };
      await order.save();

      await logAdminAction(req, "ORDER_REFUND_FAILED", {
        targetType: "Order",
        targetId: req.params.id,
        summary: `SumUp refund failed for order ${String(req.params.id).slice(-6).toUpperCase()}: ${refundError.message}`,
      });

      req.flash("error", `SumUp refund failed: ${refundError.message}`);
      return res.redirect(redirectTo);
    }

    // Refund succeeded with SumUp — now reflect it locally.
    order.paymentStatus = "refunded";
    order.orderStatus = "cancelled";
    order.sumup = {
      ...order.sumup,
      refunded: true,
      refundedAt: new Date(),
      refundAmount: order.total,
      refundTransactionId: refundResult.transactionId,
      refundError: "",
      refundedBy: req.session?.user?.email || "",
    };

    await order.save();

    // Return items to stock since the sale has been reversed.
    for (const item of order.items) {
      if (item.product) {
        await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
      }
    }

    await logAdminAction(req, "ORDER_CANCELLED_REFUNDED", {
      targetType: "Order",
      targetId: req.params.id,
      summary: `Cancelled and refunded order ${String(req.params.id).slice(-6).toUpperCase()} via SumUp (£${Number(order.total || 0).toFixed(2)})`,
      meta: {
        refundAmount: order.total,
        refundTransactionId: refundResult.transactionId,
        refundTransactionCode: refundResult.transactionCode,
      },
    });

    req.flash("success", `Order refunded via SumUp and cancelled. £${Number(order.total || 0).toFixed(2)} returned to the customer.`);
    res.redirect(redirectTo);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to cancel and refund this order");
    res.redirect(redirectTo);
  }
});

router.get("/users", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
  try {
    let users = [];
    let traders = [];
    let userOrderStats = {};

    if (mongoose.connection.readyState === 1) {
      [users, traders] = await Promise.all([
        User.find().sort({ createdAt: -1 }).limit(50).lean(),
        Trader.find().sort({ updatedAt: -1 }).limit(50).lean(),
      ]);

      const userEmails = users
        .map((user) => String(user.email || "").trim().toLowerCase())
        .filter(Boolean);

      const orderStats = userEmails.length
        ? await Order.aggregate([
            {
              $match: {
                "customer.email": { $in: userEmails },
              },
            },
            {
              $group: {
                _id: { $toLower: "$customer.email" },
                totalOrders: { $sum: 1 },
                paidOrders: {
                  $sum: {
                    $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0],
                  },
                },
                totalSpend: {
                  $sum: {
                    $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0],
                  },
                },
                lastOrderAt: { $max: "$createdAt" },
              },
            },
          ])
        : [];

      userOrderStats = orderStats.reduce((acc, item) => {
        acc[item._id] = {
          totalOrders: item.totalOrders || 0,
          paidOrders: item.paidOrders || 0,
          totalSpend: item.totalSpend || 0,
          lastOrderAt: item.lastOrderAt || null,
        };

        return acc;
      }, {});
    }

    res.render("admin/users", {
      layout: adminLayout(req),
      users,
      traders,
      userOrderStats,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load users");
    res.redirect("/admin/dashboard");
  }
});


router.get("/users/:id", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
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
      layout: adminLayout(req),
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




router.post("/users/:id/role", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
  try {
    const currentAdmin = req.session?.user;

    if (!currentAdmin || !["owner", "admin"].includes(currentAdmin.role)) {
      req.flash("error", "Only admin users can update staff roles");
      return res.redirect(`/admin/users/${req.params.id}`);
    }

    if (String(currentAdmin._id) === String(req.params.id)) {
      req.flash("error", "You cannot change your own role from here");
      return res.redirect(`/admin/users/${req.params.id}`);
    }

    const allowedRoles = [
      "user",
      "owner",
      "admin",
      "manager",
      "fulfilment",
      "support",
      "product_manager",
    ];

    const role = String(req.body.role || "user").trim();

    if (!allowedRoles.includes(role)) {
      req.flash("error", "Invalid role selected");
      return res.redirect(`/admin/users/${req.params.id}`);
    }

    const targetUser = await User.findById(req.params.id).lean();
    const oldRole = targetUser?.role || "user";

    await User.findByIdAndUpdate(req.params.id, { role });

    await logAdminAction(req, "USER_ROLE_UPDATED", {
      targetType: "User",
      targetId: req.params.id,
      summary: `Changed user role from ${oldRole} to ${role}`,
      meta: {
        oldRole,
        newRole: role,
        targetEmail: targetUser?.email || "",
      },
    });

    req.flash("success", "User role updated");
    res.redirect(`/admin/users/${req.params.id}`);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update user role");
    res.redirect(`/admin/users/${req.params.id}`);
  }
});

router.post("/users/:id/notes", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, {
      adminNotes: String(req.body.adminNotes || "").trim(),
    });

    req.flash("success", "Admin notes saved");
    res.redirect(`/admin/users/${req.params.id}`);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to save admin notes");
    res.redirect(`/admin/users/${req.params.id}`);
  }
});


router.get("/audit-logs", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
  try {
    const logs =
      mongoose.connection.readyState === 1
        ? await AdminAuditLog.find().sort({ createdAt: -1 }).limit(200).lean()
        : [];

    res.render("admin/audit-logs", {
      layout: adminLayout(req),
      logs,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load audit logs");
    res.redirect("/admin/dashboard");
  }
});

router.get("/security", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
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
      layout: adminLayout(req),
      users,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load security data");
    res.redirect("/admin/dashboard");
  }
});

router.get("/email-test", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), (req, res) => {
  const mailConfig = transporter.snusMailConfig || {};

  res.render("admin/email-test", {
    layout: adminLayout(req),
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

router.post("/email-test", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
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

router.get("/wholesale", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
  try {
    const applications =
      mongoose.connection.readyState === 1
        ? await WholesaleApplication.find().sort({ createdAt: -1 }).lean()
        : await wholesaleApplicationStore.findAll();

    res.render("admin/wholesale-applications", {
      layout: adminLayout(req),
      applications,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load wholesale applications");
    res.redirect("/admin/dashboard");
  }
});

router.post("/wholesale/:id/approve", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
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

router.post("/wholesale/:id/reject", isAdmin, requireAdminRole(PERMISSIONS.ownerAdmin), async (req, res) => {
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


router.get("/inventory", isAdmin, requireAdminRole(PERMISSIONS.products), async (req, res) => {
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
      layout: adminLayout(req),
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

router.post("/inventory/bulk-stock", isAdmin, requireAdminRole(PERMISSIONS.products), async (req, res) => {
  try {
    const bulkAction = String(req.body.bulkAction || "").trim();
    const selectedProducts = (Array.isArray(req.body.selectedProducts)
      ? req.body.selectedProducts
      : [req.body.selectedProducts]
    ).filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (bulkAction) {
      if (!selectedProducts.length) {
        req.flash("error", "Select at least one product first.");
        return res.redirect(req.get("Referrer") || "/admin/inventory");
      }

      let stock;

      if (bulkAction === "out_of_stock") {
        stock = 0;
      } else if (bulkAction === "set_stock") {
        const submittedStock = String(req.body.bulkStockValue ?? "").trim();

        if (!/^\d+$/.test(submittedStock)) {
          req.flash("error", "Enter a valid stock quantity for the selected products.");
          return res.redirect(req.get("Referrer") || "/admin/inventory");
        }

        stock = Number.parseInt(submittedStock, 10);
      } else {
        req.flash("error", "Unknown bulk stock action.");
        return res.redirect(req.get("Referrer") || "/admin/inventory");
      }

      const result = await Product.updateMany(
        { _id: { $in: selectedProducts } },
        { $set: { stock } }
      );
      const updatedCount = result.modifiedCount ?? result.matchedCount ?? 0;

      await logAdminAction(req, "PRODUCT_STOCK_BULK_UPDATED", {
        targetType: "Product",
        summary: `Set stock to ${stock} for ${selectedProducts.length} selected product${selectedProducts.length === 1 ? "" : "s"}`,
        meta: {
          selectedCount: selectedProducts.length,
          updatedCount,
          newStock: stock,
          productIds: selectedProducts,
        },
      });

      req.flash(
        "success",
        `${selectedProducts.length} selected product${selectedProducts.length === 1 ? "" : "s"} set to ${stock === 0 ? "out of stock" : `${stock} in stock`}.`
      );
      return res.redirect(req.get("Referrer") || "/admin/inventory");
    }

    const updates = req.body.updates || {};
    const entries = Object.entries(updates);

    if (!entries.length) {
      req.flash("error", "No stock values submitted.");
      return res.redirect("/admin/inventory");
    }

    const operations = entries.map(([id, stock]) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { stock: Math.max(0, Number.parseInt(stock, 10) || 0) } },
      },
    }));

    await Product.bulkWrite(operations);

    await logAdminAction(req, "PRODUCT_STOCK_BULK_UPDATED", {
      targetType: "Product",
      summary: `Bulk stock update for ${entries.length} product${entries.length === 1 ? "" : "s"}`,
      meta: { count: entries.length },
    });

    req.flash("success", `Stock saved for ${entries.length} product${entries.length === 1 ? "" : "s"}`);
    res.redirect(req.get("Referrer") || "/admin/inventory");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to save stock changes");
    res.redirect("/admin/inventory");
  }
});

router.post("/inventory/:id/stock", isAdmin, requireAdminRole(PERMISSIONS.products), async (req, res) => {
  try {
    const stock = Math.max(0, Number.parseInt(req.body.stock, 10) || 0);
    const product = await Product.findById(req.params.id).lean();
    const oldStock = Number(product?.stock || 0);

    await Product.findByIdAndUpdate(req.params.id, { stock });

    await logAdminAction(req, "PRODUCT_STOCK_UPDATED", {
      targetType: "Product",
      targetId: req.params.id,
      summary: `Updated stock for ${product?.name || "product"} from ${oldStock} to ${stock}`,
      meta: {
        productName: product?.name || "",
        sku: product?.sku || "",
        oldStock,
        newStock: stock,
      },
    });

    req.flash("success", "Stock updated");
    res.redirect(req.get("Referrer") || "/admin/inventory");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update stock");
    res.redirect("/admin/inventory");
  }
});



router.get("/products/export/csv", isAdmin, requireAdminRole(PERMISSIONS.products), async (req, res) => {
  try {
    const products =
      mongoose.connection.readyState === 1
        ? await Product.find().sort({ brand: 1, name: 1 }).lean()
        : [];

    const headers = [
      "ID",
      "Name",
      "Slug",
      "SKU",
      "Barcode",
      "Brand",
      "Flavour",
      "Category",
      "Strength",
      "Nicotine",
      "Price",
      "Discount Price",
      "Cost Price",
      "Stock",
      "Supplier",
      "Supplier Code",
      "Active",
      "Featured",
      "Best Seller",
      "Sale Badge",
      "SEO Title",
      "SEO Description",
      "Description",
      "Images",
      "Created At",
      "Updated At",
    ];

    const rows = products.map((product) => [
      product._id,
      product.name || "",
      product.slug || "",
      product.sku || "",
      product.barcode || "",
      product.brand || "",
      product.flavour || "",
      product.category || "",
      product.strength || "",
      product.nicotine || "",
      Number(product.price || 0).toFixed(2),
      Number(product.discountPrice || 0).toFixed(2),
      Number(product.costPrice || 0).toFixed(2),
      product.stock || 0,
      product.supplier || "",
      product.supplierCode || "",
      product.isActive === false ? "no" : "yes",
      product.isFeatured ? "yes" : "no",
      product.isBestSeller ? "yes" : "no",
      product.showSaleBadge ? "yes" : "no",
      product.seoTitle || "",
      product.seoDescription || "",
      product.description || "",
      Array.isArray(product.images) ? product.images.join(" | ") : "",
      product.createdAt ? new Date(product.createdAt).toISOString() : "",
      product.updatedAt ? new Date(product.updatedAt).toISOString() : "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

    await logAdminAction(req, "PRODUCTS_EXPORTED_CSV", {
      targetType: "Product",
      summary: `Exported ${products.length} products to CSV`,
      meta: {
        productCount: products.length,
      },
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=snus-village-products.csv");
    res.send(csv);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to export products");
    res.redirect("/admin/products");
  }
});

//  Add Product Page
router.get("/products/add", isAdmin, requireAdminRole(PERMISSIONS.products), (req, res) => {
  res.render("admin/add-product", {
    layout: adminLayout(req),
  });
});

// Get All products
router.get("/products", isAdmin, requireAdminRole(PERMISSIONS.products), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;

    // ===== FILTERS =====
    const filter = buildAdminProductFilter(req.query);

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
      layout: adminLayout(req),
      products,
      hasMore: page * limit < total,
      nextPage: page + 1,

      totalProducts,
      inStock,
      outStock,
      hiddenProducts,
      featuredProducts,
      bestSellerProducts,
      filteredTotal: total,

      query: req.query,
    });
  } catch (err) {
    console.log(err);
    res.send("Error loading products");
  }
});

router.post("/products/bulk-prices", isAdmin, requireAdminRole(PERMISSIONS.products), async (req, res) => {
  const backToProducts = () => {
    const params = new URLSearchParams();
    [
      "search",
      "brand",
      "strength",
      "sort",
      "stock",
      "visibility",
      "featured",
      "bestSeller",
      "saleBadge",
    ].forEach((key) => {
      if (req.body[key]) params.set(key, req.body[key]);
    });

    return "/admin/products" + (params.toString() ? "?" + params.toString() : "");
  };

  try {
    if (mongoose.connection.readyState !== 1) {
      req.flash("error", "Database is not connected. Bulk price update was not applied.");
      return res.redirect(backToProducts());
    }

    const confirmText = String(req.body.confirmText || "").trim().toUpperCase();
    if (confirmText !== "UPDATE") {
      req.flash("error", "Type UPDATE to confirm the bulk price change.");
      return res.redirect(backToProducts());
    }

    const rawPrice = String(req.body.price ?? "").trim();
    const rawDiscountPrice = String(req.body.discountPrice ?? "").trim();
    const setPrice = rawPrice !== "";
    const setDiscountPrice = rawDiscountPrice !== "";

    if (!setPrice && !setDiscountPrice) {
      req.flash("error", "Enter a new price and/or a new discount price to apply.");
      return res.redirect(backToProducts());
    }

    const priceValue = setPrice ? Number(rawPrice) : null;
    const discountPriceValue = setDiscountPrice ? Number(rawDiscountPrice) : null;

    if (setPrice && (!Number.isFinite(priceValue) || priceValue < 0)) {
      req.flash("error", "Enter a valid positive main price.");
      return res.redirect(backToProducts());
    }

    if (setDiscountPrice && (!Number.isFinite(discountPriceValue) || discountPriceValue < 0)) {
      req.flash("error", "Enter a valid positive discount price.");
      return res.redirect(backToProducts());
    }

    const filter = buildAdminProductFilter(req.body);
    const products = await Product.find(filter).select("_id").lean();

    if (!products.length) {
      req.flash("error", "No matching products found for bulk price update.");
      return res.redirect(backToProducts());
    }

    const update = {};
    if (setPrice) update.price = priceValue;
    if (setDiscountPrice) update.discountPrice = discountPriceValue;

    await Product.updateMany(
      { _id: { $in: products.map((product) => product._id) } },
      { $set: update }
    );

    await logAdminAction(req, "PRODUCT_BULK_PRICE_UPDATED", {
      targetType: "Product",
      summary: `Bulk updated ${products.length} product price(s)`,
      meta: {
        productCount: products.length,
        price: priceValue,
        discountPrice: discountPriceValue,
        filters: {
          search: req.body.search || "",
          brand: req.body.brand || "",
          strength: req.body.strength || "",
          stock: req.body.stock || "",
          visibility: req.body.visibility || "",
          featured: req.body.featured || "",
          bestSeller: req.body.bestSeller || "",
          saleBadge: req.body.saleBadge || "",
        },
      },
    });

    req.flash("success", `Updated ${products.length} product${products.length === 1 ? "" : "s"}.`);
    res.redirect(backToProducts());
  } catch (err) {
    console.log("Bulk price update failed:", err);
    req.flash("error", "Unable to apply bulk price update.");
    res.redirect(backToProducts());
  }
});

//  Create Product

router.post("/products/add", isAdmin, requireAdminRole(PERMISSIONS.products), upload.array("images", 5), verifyCsrfToken, async (req, res) => {
  try {
    const {
      name,
      price,
      discountPrice,
      description,
      strength,
      nicotine,
      pouchesPerCan,
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

    const slug = buildProductSlug(name);

    const images = await storeProductImages(req.files);

    await Product.create({
      name,
      slug,
      price: parsedPrice,
      discountPrice: parsedDiscount,
      description,
      strength,
      nicotine,
      pouchesPerCan: Number(pouchesPerCan || 20),
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


router.post("/products/:id/toggle-active", isAdmin, requireAdminRole(PERMISSIONS.products), async (req, res) => {
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
router.post("/products/delete/:id", isAdmin, requireAdminRole(PERMISSIONS.products), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();

    await Product.findByIdAndDelete(req.params.id);

    await logAdminAction(req, "PRODUCT_DELETED", {
      targetType: "Product",
      targetId: req.params.id,
      summary: `Deleted product ${product?.name || String(req.params.id)}`,
      meta: {
        productName: product?.name || "",
        sku: product?.sku || "",
        brand: product?.brand || "",
        price: product?.price || 0,
        stock: product?.stock || 0,
      },
    });

    req.flash("success", "Product deleted!");
    res.redirect("/admin/products");
  } catch (err) {
    req.flash("error", "Delete failed");
    res.redirect("/admin/products");
  }
});

/* Edit Product */
router.get("/products/edit/:id", isAdmin, requireAdminRole(PERMISSIONS.products), async (req, res) => {
  const product = await Product.findById(req.params.id);

  res.render("admin/edit-product", {
    layout: adminLayout(req),
    product,
  });
});

router.post("/products/edit/:id", isAdmin, requireAdminRole(PERMISSIONS.products), upload.array("images", 5), verifyCsrfToken, async (req, res) => {
  try {
    const {
      name,
      price,
      discountPrice,
      description,
      strength,
      nicotine,
      pouchesPerCan,
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
      slug: buildProductSlug(name),
      price: parseFloat(price),
      discountPrice: discountPrice ? parseFloat(discountPrice) : 0,
      description,
      strength,
      nicotine,
      pouchesPerCan: Number(pouchesPerCan || 20),
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


router.post("/orders/:id/send-royal-mail", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
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



router.post("/orders/:id/generate-label", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
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

router.get("/orders/:id/download-label", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
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




router.post("/orders/:id/admin-update", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
  try {
    const checklist = {
      paymentChecked: req.body.paymentChecked === "on",
      stockChecked: req.body.stockChecked === "on",
      packed: req.body.packed === "on",
      labelReady: req.body.labelReady === "on",
      customerNotified: req.body.customerNotified === "on",
    };

    const oldOrder = await Order.findById(req.params.id).lean();

    await Order.findByIdAndUpdate(req.params.id, {
      adminNotes: String(req.body.adminNotes || "").trim(),
      fulfilmentChecklist: checklist,
    });

    await logAdminAction(req, "ORDER_ADMIN_UPDATED", {
      targetType: "Order",
      targetId: req.params.id,
      summary: `Updated admin notes/checklist for order ${String(req.params.id).slice(-6).toUpperCase()}`,
      meta: {
        previousNotes: oldOrder?.adminNotes || "",
        newNotes: String(req.body.adminNotes || "").trim(),
        previousChecklist: oldOrder?.fulfilmentChecklist || {},
        newChecklist: checklist,
      },
    });

    req.flash("success", "Order admin notes updated");
    res.redirect(`/admin/orders/${req.params.id}`);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update order admin notes");
    res.redirect(`/admin/orders/${req.params.id}`);
  }
});


router.get("/orders/:id", isAdmin, requireAdminRole(PERMISSIONS.orders), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect(req.get("Referrer") || "/admin/orders");
    }

    res.render("admin/order-detail", {
      layout: adminLayout(req),
      order,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load order");
    res.redirect(req.get("Referrer") || "/admin/orders");
  }
});


module.exports = router;
