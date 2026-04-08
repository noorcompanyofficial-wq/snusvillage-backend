const express = require("express");
const router = express.Router();
const Product = require("../models/Products");

router.get("/", async (req, res) => {
  try {
    const { brand, strength, flavour, page = 1 } = req.query;

    const limit = 12;
    const skip = (page - 1) * limit;

    let filter = {};

    if (brand) filter.brand = brand;
    if (strength) filter.strength = strength;
    if (flavour) filter.flavour = flavour;

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments(filter);

    if (req.headers.accept.includes("application/json")) {
      return res.json({
        products,
        hasMore: skip + products.length < total,
      });
    }

    res.render("shop/shop", {
      products,
      hasMore: skip + products.length < total,
    });
  } catch (err) {
    console.log(err);
  }
});

module.exports = router;
