const express = require("express");
const path = require("path");
const ejsLayouts = require("express-ejs-layouts");
/* const mongoose = require("mongoose");
 */
const app = express();

require("dotenv").config();

// ====== Routes ======
const indexRoutes = require("./routes/index");
const shopRoutes = require("./routes/shop");

// ====== Database connection ======
/* mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));
 */
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

// ====== Start Server ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
