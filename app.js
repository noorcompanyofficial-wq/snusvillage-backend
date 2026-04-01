const express = require("express");
const path = require("path");
const ejsLayouts = require("express-ejs-layouts");
const session = require("express-session");

const app = express();

require("dotenv").config();

// ====== Routes ======
const indexRoutes = require("./routes/index");
const shopRoutes = require("./routes/shop");
const productsRoutes = require("./routes/products");
const authRoutes = require("./routes/auth");

// ====== Database connection ======

// ====== Middleware ======
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ====== EJS setup ======

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/layout");

app.use(ejsLayouts);

// Use Routes
app.use("/", indexRoutes);
app.use("/shop", shopRoutes);
app.use("/products", productsRoutes);
app.use("/auth", authRoutes);

// ====== Start Server ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
