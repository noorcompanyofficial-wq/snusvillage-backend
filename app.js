const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const ejsLayouts = require("express-ejs-layouts");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const flash = require("connect-flash");
const fs = require("fs");
const StoreSettings = require("./models/StoreSettings");
const DiscountCode = require("./models/DiscountCode");
const pageViewTracker = require("./middleware/pageViewTracker");

require("dotenv").config();

const app = express();
const applePayAssociationFile = path.join(
  __dirname,
  "public",
  ".well-known",
  "apple-developer-merchantid-domain-association"
);

const defaultStoreSettings = {
  storeName: "Snus Village",
  storeEmail: "info@snusvillage.co.uk",
  storePhone: "+44 7777 222771",
  instagramUrl: "https://www.instagram.com/snusvillage.uk/",
  deliveryPrice: 0,
  freeDeliveryThreshold: 0,
  checkoutNotice: "You Will Be Redirected To SumUp To Complete Your Card Payment Securely.",
  ageGateMessage: "You Must Be 18+ To Enter This Website.",
  clickCollectBranch: "Edgware Road",
  clickCollectAddress: "SNUS VILLAGE, EDGWARE ROAD, TYBURNIA, London, W2 2HX",
  clickCollectCity: "London",
  clickCollectPostcode: "W2 2HX",
  maintenanceMode: false,
  hideVapesCategory: true,
  maintenanceMessage: "Snus Village is currently updating the website. Please check back soon.",
  promoPopupEnabled: true,
  promoPopupDelaySeconds: 20,
  promoPopupHeading: "Welcome to Snus Village!",
  promoPopupBody: "Enjoy 10% off your first order, on us.",
  promoPopupCode: "WELCOME10",
  promoPopupButtonText: "Shop Now",
  promoPopupButtonLink: "/shop",
};

let cachedStoreSettings = defaultStoreSettings;
let cachedStoreSettingsAt = 0;
const STORE_SETTINGS_CACHE_MS = 60 * 1000;

async function getCachedStoreSettings() {
  const cacheAge = Date.now() - cachedStoreSettingsAt;
  const cacheBustAt = Number(global.__snusStoreSettingsCacheBust || 0);

  if (cacheAge < STORE_SETTINGS_CACHE_MS && cacheBustAt <= cachedStoreSettingsAt) {
    return cachedStoreSettings;
  }

  if (mongoose.connection.readyState !== 1) {
    cachedStoreSettings = defaultStoreSettings;
    cachedStoreSettingsAt = Date.now();
    return cachedStoreSettings;
  }

  try {
    const settings = await StoreSettings.findOneAndUpdate(
      { key: "store" },
      { $setOnInsert: { key: "store", ...defaultStoreSettings } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();

    cachedStoreSettings = settings || defaultStoreSettings;
    cachedStoreSettingsAt = Date.now();
    return cachedStoreSettings;
  } catch (err) {
    console.log("Store settings load failed:", err.message);
    return cachedStoreSettings || defaultStoreSettings;
  }
}

let cachedWelcomeDiscount = null;
let cachedWelcomeDiscountAt = 0;
const WELCOME_DISCOUNT_CACHE_MS = 60 * 1000;

// The homepage popup must never advertise a code that doesn't actually
// work, so it's driven directly by whichever real DiscountCode an admin
// has flagged as the welcome discount (managed on the Discounts page),
// not by free-text settings fields.
async function getCachedWelcomeDiscount() {
  const cacheAge = Date.now() - cachedWelcomeDiscountAt;
  const cacheBustAt = Number(global.__snusWelcomeDiscountCacheBust || 0);

  if (cacheAge < WELCOME_DISCOUNT_CACHE_MS && cacheBustAt <= cachedWelcomeDiscountAt) {
    return cachedWelcomeDiscount;
  }

  if (mongoose.connection.readyState !== 1) {
    return cachedWelcomeDiscount;
  }

  try {
    const discount = await DiscountCode.findOne({ isWelcomeDiscount: true, isActive: true }).lean();
    const isExpired = discount?.expiresAt && new Date(discount.expiresAt) < new Date();
    const usageFinished = discount?.usageLimit > 0 && discount.usedCount >= discount.usageLimit;

    cachedWelcomeDiscount = discount && !isExpired && !usageFinished ? discount : null;
    cachedWelcomeDiscountAt = Date.now();
    return cachedWelcomeDiscount;
  } catch (err) {
    console.log("Welcome discount load failed:", err.message);
    return cachedWelcomeDiscount;
  }
}

function isMaintenanceBypass(req) {
  const allowedPrefixes = [
    "/admin",
    "/auth",
    "/css",
    "/js",
    "/images",
    "/uploads",
    "/api",
  ];

  return (
    req.path === "/maintenance" ||
    req.path === "/health" ||
    req.path === "/health/db" ||
    req.path === "/favicon.ico" ||
    allowedPrefixes.some((prefix) => req.path.startsWith(prefix))
  );
}



// ====== Security Headers ======
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// ====== Cart Middlware ====
const cartSession = require("./middleware/cartSession");

// ====== Routes ======
const indexRoutes = require("./routes/index");
const aboutRoutes = require("./routes/about");

const contactRouter = require("./routes/contact");

const checkoutRoutes = require("./routes/checkout");

const shopRoutes = require("./routes/shop");
const collectionsRoutes = require("./routes/collections");
const productsRoutes = require("./routes/products");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const cartRoutes = require("./routes/cart");
const Product = require("./models/Products");
const legalRoutes = require("./routes/legal");
const newsletterRoutes = require("./routes/newsletter");

const wholesaleRoutes = require("./routes/wholesale");
const wishlistRoutes = require("./routes/wishlist");

// ====== Database connection ======

// ====== Trust Proxy (for real IP) ======
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ====== Compression ======
app.use(compression());

// ====== Basic Middleware ======
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

app.get("/sitemap.xml", async (req, res) => {
  try {
    const baseUrl = (process.env.APP_URL || "https://www.snusvillage.com").replace(/\/$/, "");

    const staticUrls = [
      { loc: "/", priority: "1.0" },
      { loc: "/shop", priority: "0.9" },
      { loc: "/about", priority: "0.6" },
      { loc: "/contact", priority: "0.6" },
      { loc: "/wholesale", priority: "0.7" },
      { loc: "/terms-and-conditions", priority: "0.4" },
      { loc: "/privacy-policy", priority: "0.4" },
      { loc: "/shipping-policy", priority: "0.4" },
      { loc: "/cookies-policy", priority: "0.4" },
    ];

    const products = await Product.find({ isActive: true })
      .select("_id slug updatedAt createdAt")
      .sort({ updatedAt: -1 })
      .lean();

    const urls = [
      ...staticUrls.map((page) => ({
        loc: `${baseUrl}${page.loc}`,
        lastmod: new Date().toISOString(),
        changefreq: page.loc === "/" || page.loc === "/shop" ? "daily" : "monthly",
        priority: page.priority,
      })),
      ...products.map((product) => ({
        loc: `${baseUrl}/products/${product.slug || product._id}`,
        lastmod: new Date(product.updatedAt || product.createdAt || Date.now()).toISOString(),
        changefreq: "weekly",
        priority: "0.8",
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${escapeXml(url.lastmod)}</lastmod>
    <changefreq>${escapeXml(url.changefreq)}</changefreq>
    <priority>${escapeXml(url.priority)}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    res.type("application/xml");
    return res.send(xml);
  } catch (error) {
    console.log("Sitemap error:", error.message);
    res.type("application/xml");
    return res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
  }
});

app.get(
  "/.well-known/apple-developer-merchantid-domain-association",
  (req, res, next) => {
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.sendFile(
      applePayAssociationFile,
      { dotfiles: "allow" },
      (error) => {
        if (error) return next(error);
      }
    );
  }
);

app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "30d",
    etag: true,
    lastModified: true,
  })
);

app.use(cookieParser());

// ====== Session ======
if (!process.env.MONGO_URI) {
  console.warn(
    "MONGO_URI is missing. Falling back to the in-memory session store (not suitable for production)."
  );
}

const sessionStore = process.env.MONGO_URI
  ? MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 14 * 24 * 60 * 60, // 14 days
      autoRemove: "native",
    })
  : undefined;

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_fallback_secret_change_later",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// ====== Cart Session
app.use(cartSession);

// ====== Flash ======
app.use(flash());

// ====== CSRF token issuance ======
const { ensureCsrfToken, verifyCsrfToken } = require("./middleware/csrf");
app.use(ensureCsrfToken);

// ====== Website View Analytics ======
app.use(pageViewTracker);

// ====== Auto Login via JWT  ======
app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState === 1 && !req.session?.user && req.cookies?.jwt) {
      const User = require("./models/User");

      const user = await User.findOne({
        refreshToken: req.cookies.jwt,
      });

      if (user) {
        req.session.user = user;
      }
    }
  } catch (err) {
    console.log("Auto login error:", err.message);
  }

  next();
});


function optimiseImageUrl(url, options = {}) {
  const imageUrl = String(url || "").trim();

  if (!imageUrl) return "";

  const width = Number(options.width || 600);
  const quality = options.quality || "auto:good";
  const crop = options.crop || "c_limit";

  const localWebpMap = {
    "/images/delivery/delivery.jpg": "/images/delivery/delivery.webp",
    "/images/header/h-2.jpeg": "/images/header/h-2.webp",
  };

  if (localWebpMap[imageUrl]) {
    return localWebpMap[imageUrl];
  }

  if (imageUrl.includes("res.cloudinary.com") && imageUrl.includes("/image/upload/")) {
    if (
      imageUrl.includes("/f_auto,") ||
      imageUrl.includes("/q_auto,") ||
      imageUrl.includes("/w_")
    ) {
      return imageUrl;
    }

    return imageUrl.replace(
      "/image/upload/",
      `/image/upload/f_auto,q_${quality},w_${width},${crop}/`
    );
  }

  return imageUrl;
}

function relTime(date) {
  if (!date) return "";
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;

  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ====== Global Variables ======
app.use(async (req, res, next) => {
  const siteUrl = (process.env.APP_URL || "https://www.snusvillage.com").replace(/\/$/, "");
  const cleanPath = req.path === "/" ? "" : req.path;
  const storeSettings = await getCachedStoreSettings();
  const welcomeDiscount = await getCachedWelcomeDiscount();

  res.locals.user = req.session?.user || null;
  res.locals.currentPath = req.path;
  res.locals.canonical = `${siteUrl}${cleanPath}`;
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  res.locals.query = req.query || {};
  res.locals.optimiseImageUrl = optimiseImageUrl;
  res.locals.relTime = relTime;
  res.locals.storeSettings = storeSettings;
  res.locals.welcomeDiscount = welcomeDiscount;
  next();
});

// ====== EJS setup ======
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/layout");

app.use(ejsLayouts);

// ====== CSRF token verification (after res.locals + ejsLayouts so a 403 render gets the full site layout) ======
app.use(verifyCsrfToken);

app.get("/maintenance", async (req, res) => {
  const settings = await getCachedStoreSettings();

  res.status(settings.maintenanceMode ? 503 : 200).render("maintenance/maintenance", {
    layout: false,
    title: "Snus Village Maintenance",
    settings,
  });
});

app.use((req, res, next) => {
  const settings = res.locals.storeSettings || cachedStoreSettings;

  if (settings?.maintenanceMode && !isMaintenanceBypass(req)) {
    return res.status(503).render("maintenance/maintenance", {
      layout: false,
      title: "Snus Village Maintenance",
      settings,
    });
  }

  next();
});

// ====== Health Check ======
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Snus Village backend is running",
    timestamp: new Date().toISOString(),
  });
});
app.get("/health/db", (req, res) => {
  const mongoState = mongoose.connection.readyState;

  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  res.status(mongoState === 1 ? 200 : 503).json({
    status: mongoState === 1 ? "ok" : "error",
    database: states[mongoState] || "unknown",
    timestamp: new Date().toISOString(),
  });
});

// ====== Routes ======
app.use("/", indexRoutes);
app.use("/about", aboutRoutes);

app.use("/contact", contactRouter);

app.use("/shop", shopRoutes);
app.use("/collections", collectionsRoutes);
app.use("/products", productsRoutes);
app.use("/auth", authRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/admin", adminRoutes);
app.use("/newsletter", newsletterRoutes);
app.use("/", legalRoutes);

app.use("/cart", cartRoutes);

app.use("/wholesale", wholesaleRoutes);
app.use("/wishlist", wishlistRoutes);

app.use((req, res) => {
  res.status(404).render("404", {
    title: "Page Not Found",
  });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(500).render("500", {
    title: "Server Error",
  });
});

// ====== Start Server ======
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    if (fs.existsSync(applePayAssociationFile)) {
      console.log(`Apple Pay association file found: ${applePayAssociationFile}`);
    } else {
      console.warn(`WARNING: Apple Pay association file is missing: ${applePayAssociationFile}`);
    }

    if (!process.env.MONGO_URI) {
      console.warn("MONGO_URI is missing. Database-backed features will not save.");
    } else {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("MongoDB connected");
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
  }
}

startServer();
