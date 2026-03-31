const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("shop/shop", { title: "Shop - SNUS VILLAGE" });
});

module.exports = router;
