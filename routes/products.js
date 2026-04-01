const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("products/products", { title: "Product - SNUS VILLAGE" });
});

module.exports = router;
