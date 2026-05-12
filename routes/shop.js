const express = require("express");
const router = express.Router();
const Product = require("../models/Products");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTitleCase(value) {
  return String(value || "Other")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getBrandName(product) {
  return String(product.brand || "Other").trim() || "Other";
}

function getBrandKey(product) {
  return getBrandName(product).toLowerCase();
}

function groupProductsByBrand(products) {
  const groups = new Map();

  products.forEach((product) => {
    const key = getBrandKey(product);
    const brandName = toTitleCase(getBrandName(product));

    if (!groups.has(key)) {
      groups.set(key, {
        brand: brandName,
        products: [],
        count: 0,
      });
    }

    groups.get(key).products.push(product);
    groups.get(key).count += 1;
  });

  return Array.from(groups.values()).sort((a, b) => a.brand.localeCompare(b.brand));
}

router.get("/", async (req, res) => {
  try {
    const { brand, strength, flavour, search } = req.query;

    if (Product.db.readyState !== 1) {
      return res.render("shop/shop", {
        products: [],
        brandSections: [],
        totalProducts: 0,
        query: req.query,
      });
    }

    const filter = {
      isActive: { $ne: false },
    };

    if (brand) filter.brand = { $regex: `^${escapeRegex(brand)}$`, $options: "i" };
    if (strength) filter.strength = { $regex: `^${escapeRegex(strength)}$`, $options: "i" };
    if (flavour) filter.flavour = { $regex: `^${escapeRegex(flavour)}$`, $options: "i" };

    if (search) {
      filter.$or = [
        { name: { $regex: escapeRegex(search), $options: "i" } },
        { brand: { $regex: escapeRegex(search), $options: "i" } },
        { flavour: { $regex: escapeRegex(search), $options: "i" } },
        { description: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    const products = await Product.find(filter).sort({
      brand: 1,
      createdAt: -1,
    });

    const brandSections = groupProductsByBrand(products);

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({
        products,
        brandSections,
        totalProducts: products.length,
      });
    }

    res.render("shop/shop", {
      products,
      brandSections,
      totalProducts: products.length,
      query: req.query,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error loading shop");
  }
});

module.exports = router;
