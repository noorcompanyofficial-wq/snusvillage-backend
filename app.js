const express = require("express");
const path = require("path");
const ejsLayouts = require("express-ejs-layouts");
const session = require("express-session");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const flash = require("connect-flash");

require("dotenv").config();

const app = express();

// ====== Routes ======
const indexRoutes = require("./routes/index");
const checkoutRoutes = require("./routes/checkout");

const shopRoutes = require("./routes/shop");
const productsRoutes = require("./routes/products");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");

// ====== Database connection ======
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("mongodb connected"))
  .catch((err) => console.error(err));

// ====== Trust Proxy (for real IP) ======
app.set("trust proxy", true);

// ====== Basic Middleware ======
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(cookieParser());

// ====== Session ======
app.use(
  session({
    secret: "secret123",
    resave: false,
    saveUninitialized: false,
  }),
);

// ====== Flash ======
app.use(flash());

// ====== Auto Login via JWT  ======
app.use(async (req, res, next) => {
  try {
    if (!req.session?.user && req.cookies?.jwt) {
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
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  next();
});

// ====== EJS setup ======
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/layout");

app.use(ejsLayouts);

// ====== Routes ======
app.use("/", indexRoutes);
app.use("/shop", shopRoutes);
app.use("/products", productsRoutes);
app.use("/auth", authRoutes);
app.use("/checkout", checkoutRoutes);

app.use("/admin", adminRoutes);

// ====== Start Server ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
