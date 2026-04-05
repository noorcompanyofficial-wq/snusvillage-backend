const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("checkout/checkout", { title: "Checkout - SNUS VILLAGE" });
});

module.exports = router;
