const express = require("express");
const router = express.Router();
const HomepageContent = require("../models/HomepageContent");

router.get("/", async (req, res) => {
  let homepageContent = null;

  try {
    if (HomepageContent.db.readyState === 1) {
      homepageContent = await HomepageContent.findOne({ key: "homepage" }).lean();
    }
  } catch (err) {
    console.log("Homepage content load failed:", err.message);
  }

  res.render("index/index", {
    layout: false,
    title: "Home - SNUS VILLAGE",
    homepageContent,
  });
});

module.exports = router;
