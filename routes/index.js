const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("index/index", { title: "Home - SNUS VILLAGE" });
});

module.exports = router;
