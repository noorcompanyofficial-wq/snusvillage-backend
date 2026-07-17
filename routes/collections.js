const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Products");

const router = express.Router();

const fallbackCollections = [
  {
    key: "ice-mint",
    title: "Ice Mint",
    type: "flavour",
    value: "Mint",
    count: 0,
    image:
      "https://images.unsplash.com/photo-1516822003754-cca485356ecb?auto=format&fit=crop&w=1200&q=80",
    description: "Clean, cold profiles for customers who want a crisp finish.",
  },
  {
    key: "strong",
    title: "Strong",
    type: "strength",
    value: "STRONG",
    count: 0,
    image:
      "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80",
    description: "Higher-strength products grouped for quick restocking.",
  },
  {
    key: "new-stock",
    title: "New Stock",
    type: "sort",
    value: "newest",
    count: 0,
    image:
      "https://images.unsplash.com/photo-1556741533-6e6a62bd8b49?auto=format&fit=crop&w=1200&q=80",
    description: "Fresh arrivals and recently added products in one place.",
  },
];

function productImage(value) {
  return value?.image || value?.images?.[0] || fallbackCollections[0].image;
}


router.get("/vapes", async (req, res) => {
  try {
    if (!res.locals.storeSettings || res.locals.storeSettings.hideVapesCategory !== false) {
      req.flash("error", "Vapes are not available yet.");
      return res.redirect("/shop");
    }

    const { brand, flavour, search, sort } = req.query;

    function safeRegex(value) {
      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    const filter = {
      isActive: { $ne: false },
      category: { $regex: "^(vape|vapes)$", $options: "i" },
    };

    if (brand) {
      filter.brand = {
        $regex: "^" + safeRegex(brand) + "$",
        $options: "i",
      };
    }

    if (flavour) {
      filter.flavour = {
        $regex: safeRegex(flavour),
        $options: "i",
      };
    }

    if (search) {
      const searchRegex = new RegExp(safeRegex(search), "i");

      filter.$or = [
        { name: searchRegex },
        { brand: searchRegex },
        { flavour: searchRegex },
        { description: searchRegex },
        { nicotine: searchRegex },
      ];
    }

    let sortOption = { createdAt: -1 };

    if (sort === "price-low") sortOption = { price: 1 };
    if (sort === "price-high") sortOption = { price: -1 };
    if (sort === "name") sortOption = { name: 1 };

    const [products, brands, flavours] =
      Product.db.readyState === 1
        ? await Promise.all([
            Product.find(filter).sort(sortOption).lean(),
            Product.distinct("brand", {
              isActive: { $ne: false },
              category: { $regex: "^(vape|vapes)$", $options: "i" },
            }),
            Product.distinct("flavour", {
              isActive: { $ne: false },
              category: { $regex: "^(vape|vapes)$", $options: "i" },
            }),
          ])
        : [[], [], []];

    res.render("collections/vapes", {
      products,
      brands: brands.filter(Boolean).sort(),
      flavours: flavours.filter(Boolean).sort(),
      query: req.query,
      totalProducts: products.length,
    });
  } catch (err) {
    console.log("Vapes collection error:", err.message);
    res.status(500).send("Error loading vapes collection");
  }
});


router.get("/", async (req, res) => {
  let collections = fallbackCollections;
  let featuredProducts = [];
  let stats = {
    totalProducts: 0,
    totalBrands: 0,
    totalFlavours: 0,
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const [brandGroups, flavourGroups, products, totalProducts] = await Promise.all([
        Product.aggregate([
          { $match: { brand: { $nin: [null, ""] } } },
          {
            $group: {
              _id: "$brand",
              count: { $sum: 1 },
              image: { $first: { $arrayElemAt: ["$images", 0] } },
            },
          },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 6 },
        ]),
        Product.aggregate([
          { $match: { flavour: { $nin: [null, ""] } } },
          {
            $group: {
              _id: "$flavour",
              count: { $sum: 1 },
              image: { $first: { $arrayElemAt: ["$images", 0] } },
            },
          },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 6 },
        ]),
        Product.find({ isActive: { $ne: false } })
          .sort({ createdAt: -1 })
          .limit(6)
          .lean(),
        Product.countDocuments({ isActive: { $ne: false } }),
      ]);

      const brandCards = brandGroups.map((brand) => ({
        key: `brand-${brand._id}`,
        title: brand._id,
        type: "brand",
        value: brand._id,
        count: brand.count,
        image: brand.image || fallbackCollections[1].image,
        description: `Browse ${brand._id} stock, prices, and availability.`,
      }));

      const flavourCards = flavourGroups.map((flavour) => ({
        key: `flavour-${flavour._id}`,
        title: flavour._id,
        type: "flavour",
        value: flavour._id,
        count: flavour.count,
        image: flavour.image || fallbackCollections[0].image,
        description: `${flavour._id} products grouped for faster shopping.`,
      }));

      collections =
        brandCards.length || flavourCards.length
          ? [...brandCards, ...flavourCards].slice(0, 9)
          : fallbackCollections;

      featuredProducts = products.map((product) => ({
        ...product,
        image: productImage(product),
      }));

      stats = {
        totalProducts,
        totalBrands: brandGroups.length,
        totalFlavours: flavourGroups.length,
      };
    }
  } catch (err) {
    console.log("Collections page error:", err.message);
  }

  res.render("collections/collections", {
    collections,
    featuredProducts,
    stats,
  });
});

module.exports = router;
