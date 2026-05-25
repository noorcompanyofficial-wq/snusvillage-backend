const express = require("express");
const helmet = require("helmet");
const path = require("path");
const ejsLayouts = require("express-ejs-layouts");
const session = require("express-session");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const flash = require("connect-flash");
const StoreSettings = require("./models/StoreSettings");
const pageViewTracker = require("./middleware/pageViewTracker");

require("dotenv").config();

const app = express();

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
  maintenanceMessage: "Snus Village is currently updating the website. Please check back soon.",
};

let cachedStoreSettings = defaultStoreSettings;
let cachedStoreSettingsAt = 0;

async function getCachedStoreSettings() {
  const cacheAge = Date.now() - cachedStoreSettingsAt;

  if (cacheAge < 60 * 1000) {
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
const verificationRoutes = require("./routes/verification");
const diditRoutes = require("./routes/didit");
const legalRoutes = require("./routes/legal");

const wholesaleRoutes = require("./routes/wholesale");

// ====== Database connection ======

// ====== Trust Proxy (for real IP) ======
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ====== Basic Middleware ======
app.use(
  express.json({
    verify: (req, res, buf) => {
      if (req.originalUrl === "/didit/webhook") {
        req.rawBody = Buffer.from(buf);
      }
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(cookieParser());

// ====== Session ======
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_fallback_secret_change_later",
    resave: false,
    saveUninitialized: false,
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

// ====== Global Variables ======
app.use(async (req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.currentPath = req.path;
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  res.locals.storeSettings = await getCachedStoreSettings();
  next();
});

// ====== EJS setup ======
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/layout");

app.use(ejsLayouts);

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
app.use("/api", verificationRoutes);
app.use("/didit", diditRoutes);
app.use("/", legalRoutes);

app.use("/cart", cartRoutes);

app.use("/wholesale", wholesaleRoutes);

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
