const express = require("express");
const router = express.Router();
const HomepageContent = require("../models/HomepageContent");
const Product = require("../models/Products");

router.get("/", async (req, res) => {
  let homepageContent = null;
  let bestSellerProducts = [];
  let featuredProducts = [];

  try {
    if (HomepageContent.db.readyState === 1) {
      homepageContent = await HomepageContent.findOne({ key: "homepage" }).lean();

      bestSellerProducts = await Product.find({
        isActive: { $ne: false },
        isBestSeller: true,
      })
        .sort({ updatedAt: -1 })
        .limit(4)
        .lean();

      featuredProducts = await Product.find({
        isActive: { $ne: false },
        isFeatured: true,
      })
        .sort({ updatedAt: -1 })
        .limit(4)
        .lean();
    }
  } catch (err) {
    console.log("Homepage content/products load failed:", err.message);
  }

  res.render("index/index", {
    layout: false,
    title: "Snus Village | Premium Nicotine Pouches UK",
    description: "Shop premium nicotine pouches in the UK from Snus Village London. Trusted brands, age-verified checkout and fast UK delivery.",
    canonical: "https://www.snusvillage.com",
    homepageContent,
    bestSellerProducts,
    featuredProducts,
  });
});

module.exports = router;
