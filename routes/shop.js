const express = require("express");
const router = express.Router();
const Product = require("../models/Products");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/", async (req, res) => {
  try {
    const { brand, strength, flavour, search, page = 1 } = req.query;

    const limit = 12;
    const skip = (page - 1) * limit;

    if (Product.db.readyState !== 1) {
      return res.render("shop/shop", {
        products: [],
        hasMore: false,
        query: req.query,
      });
    }

    let filter = {};

    if (brand) filter.brand = { $regex: `^${escapeRegex(brand)}$`, $options: "i" };
    if (strength) filter.strength = { $regex: `^${escapeRegex(strength)}$`, $options: "i" };
    if (flavour) filter.flavour = { $regex: `^${escapeRegex(flavour)}$`, $options: "i" };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
        { flavour: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

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
      query: req.query,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error loading shop");
  }
});

module.exports = router;
