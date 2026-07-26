const express = require("express");
const router = express.Router();
const Product = require("../models/Products");
const SearchAnalytics = require("../models/SearchAnalytics");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const flavourKeywordGroups = {
  berry: ["berry", "berries", "blueberry", "raspberry", "strawberry", "blackberry", "blackcurrant"],
  berries: ["berry", "berries", "blueberry", "raspberry", "strawberry", "blackberry", "blackcurrant"],
  fruit: [
    "apple", "banana", "berry", "berries", "blackcurrant", "blueberry", "cherry", "grape",
    "kiwi", "lemon", "lime", "mango", "melon", "orange", "peach", "pineapple", "raspberry",
    "strawberry", "watermelon",
  ],
  tropical: ["banana", "kiwi", "mango", "melon", "peach", "pineapple", "watermelon"],
  mint: ["mint", "menthol", "peppermint", "spearmint", "cool", "ice", "icy", "frost"],
  "ice mint": ["ice", "icy", "mint", "menthol", "cool", "frost"],
};

function getFlavourKeywords(value) {
  const normalised = String(value || "").trim().toLowerCase();
  if (!normalised) return [];

  return Array.from(
    new Set([normalised, normalised.replace(/s$/, ""), ...(flavourKeywordGroups[normalised] || [])].filter(Boolean))
  );
}

function buildFlavourFilter(value) {
  const keywords = getFlavourKeywords(value);
  if (!keywords.length) return null;

  return {
    $or: keywords.flatMap((keyword) => {
      const regex = { $regex: escapeRegex(keyword), $options: "i" };
      return [{ flavour: regex }, { name: regex }];
    }),
  };
}

// Curated flavour categories shown as sidebar pills. Each product is tagged
// with every category whose keywords match its flavour/name text, so a
// product can appear under more than one pill (e.g. "Cherry Cola").
const FLAVOUR_PILLS = [
  { key: "mint", label: "Mint", keywords: ["mint", "menthol", "peppermint", "spearmint"] },
  { key: "berry", label: "Berry", keywords: ["berry", "berries", "blueberry", "raspberry", "strawberry", "blackcurrant"] },
  { key: "citrus", label: "Citrus", keywords: ["citrus", "lemon", "lime", "orange"] },
  { key: "apple", label: "Apple", keywords: ["apple"] },
  { key: "grape", label: "Grape", keywords: ["grape"] },
  { key: "watermelon", label: "Watermelon", keywords: ["watermelon"] },
  { key: "cola", label: "Cola", keywords: ["cola"] },
  { key: "tropical", label: "Tropical", keywords: ["mango", "pineapple", "peach", "banana", "kiwi"] },
];

function getFlavourTags(product) {
  const haystack = `${product.flavour || ""} ${product.name || ""}`.toLowerCase();
  return FLAVOUR_PILLS.filter((pill) => pill.keywords.some((kw) => haystack.includes(kw))).map((pill) => pill.key);
}

const STRENGTHS = ["LOW", "MEDIUM", "STRONG", "X-STRONG", "EXTREME"];
const FORMATS = ["All White", "Original", "Slim", "Mini"];

router.get("/", async (req, res) => {
  try {
    const { brand, strength, flavour, search, category } = req.query;

    if (Product.db.readyState !== 1) {
      return res.render("shop/shop", {
        title: "Shop Nicotine Pouches UK | Snus Village",
        description:
          "Shop premium nicotine pouches in the UK from Snus Village. Browse trusted brands, mint and fruit flavours, strengths and UK delivery options.",
        canonical: "https://www.snusvillage.com/shop",
        products: [],
        totalProducts: 0,
        catalogueTotals: { products: 0, brands: 0, strengths: STRENGTHS.length },
        facets: { brands: [], strengths: [], flavours: [], formats: [] },
        priceRange: { min: 0, max: 20 },
        wishlistIds: [],
        flavourPills: FLAVOUR_PILLS,
        query: req.query,
      });
    }

    const filter = {
      isActive: { $ne: false },
      category: { $not: /^vapes?$/i },
    };

    const advancedFilters = [];

    if (brand) filter.brand = { $regex: `^${escapeRegex(brand)}$`, $options: "i" };
    if (strength) filter.strength = { $regex: `^${escapeRegex(strength)}$`, $options: "i" };
    if (category) filter.category = { $regex: escapeRegex(category), $options: "i" };
    if (flavour) advancedFilters.push(buildFlavourFilter(flavour));

    if (search) {
      advancedFilters.push({
        $or: [
          { name: { $regex: escapeRegex(search), $options: "i" } },
          { brand: { $regex: escapeRegex(search), $options: "i" } },
          { flavour: { $regex: escapeRegex(search), $options: "i" } },
          { description: { $regex: escapeRegex(search), $options: "i" } },
        ],
      });
    }

    if (advancedFilters.length) filter.$and = advancedFilters;

    const [products, catalogueProductCount, catalogueBrands] = await Promise.all([
      Product.find(filter)
        .select("name slug description strength nicotine price discountPrice images brand flavour format category stock isActive isFeatured isBestSeller showSaleBadge createdAt updatedAt")
        .sort({ createdAt: -1 })
        .lean(),
      Product.countDocuments({ isActive: { $ne: false }, category: { $not: /^vapes?$/i } }),
      Product.distinct("brand", { isActive: { $ne: false }, category: { $not: /^vapes?$/i } }),
    ]);

    // Facet counts are computed from the current (already query-param-filtered)
    // result set, so the sidebar reflects what's actually on the page and lets
    // the customer refine further client-side without another round trip.
    const brandCounts = new Map();
    const strengthCounts = new Map();
    const flavourCounts = new Map();
    const formatCounts = new Map();
    let priceMin = Infinity;
    let priceMax = 0;

    products.forEach((p) => {
      const brandName = String(p.brand || "").trim();
      if (brandName) brandCounts.set(brandName, (brandCounts.get(brandName) || 0) + 1);

      if (p.strength) strengthCounts.set(p.strength, (strengthCounts.get(p.strength) || 0) + 1);

      if (p.format) formatCounts.set(p.format, (formatCounts.get(p.format) || 0) + 1);

      p.flavourTags = getFlavourTags(p);
      p.flavourTags.forEach((tag) => flavourCounts.set(tag, (flavourCounts.get(tag) || 0) + 1));

      const finalPrice = p.discountPrice && p.discountPrice > 0 ? p.discountPrice : p.price;
      if (Number.isFinite(finalPrice)) {
        priceMin = Math.min(priceMin, finalPrice);
        priceMax = Math.max(priceMax, finalPrice);
      }
    });

    const facets = {
      brands: Array.from(brandCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
      strengths: STRENGTHS.filter((s) => strengthCounts.has(s)).map((name) => ({ name, count: strengthCounts.get(name) })),
      flavours: FLAVOUR_PILLS.filter((pill) => flavourCounts.has(pill.key)).map((pill) => ({ ...pill, count: flavourCounts.get(pill.key) })),
      formats: FORMATS.filter((f) => formatCounts.has(f)).map((name) => ({ name, count: formatCounts.get(name) })),
    };

    if (priceMin === Infinity) priceMin = 0;

    let wishlistIds = [];
    if (req.session?.user?.wishlist) {
      wishlistIds = req.session.user.wishlist.map((id) => String(id));
    }

    if (search && String(search).trim().length >= 2) {
      SearchAnalytics.create({
        term: String(search).trim().toLowerCase(),
        originalTerm: String(search).trim(),
        resultCount: products.length,
        hadResults: products.length > 0,
        filters: { brand: brand || "", strength: strength || "", flavour: flavour || "" },
        sessionId: req.sessionID || "",
        user: req.session?.user?._id || null,
        ip: req.ip || req.headers["x-forwarded-for"] || "",
      }).catch((analyticsErr) => {
        console.log("Search analytics save failed:", analyticsErr.message);
      });
    }

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ products, totalProducts: products.length, facets });
    }

    let metaTitle = "Shop Nicotine Pouches UK | Snus Village";
    let metaDesc = "Shop premium nicotine pouches in the UK from Snus Village. Browse trusted brands, mint and fruit flavours, strengths and UK delivery options.";
    let metaCanonical = "https://www.snusvillage.com/shop";

    if (brand) {
      metaTitle = brand + " Nicotine Pouches UK | Snus Village";
      metaDesc = "Buy " + brand + " nicotine pouches in the UK. Fast UK delivery from Snus Village London.";
      metaCanonical = "https://www.snusvillage.com/shop?brand=" + encodeURIComponent(brand);
    } else if (strength) {
      metaTitle = strength + " Nicotine Pouches UK | Snus Village";
      metaDesc = "Shop " + strength.toLowerCase() + " strength nicotine pouches at Snus Village London. Fast UK delivery.";
      metaCanonical = "https://www.snusvillage.com/shop?strength=" + encodeURIComponent(strength);
    } else if (flavour) {
      metaTitle = flavour + " Flavour Nicotine Pouches UK | Snus Village";
      metaDesc = "Buy " + flavour + " flavour nicotine pouches in the UK from Snus Village.";
      metaCanonical = "https://www.snusvillage.com/shop?flavour=" + encodeURIComponent(flavour);
    }

    res.render("shop/shop", {
      title: metaTitle,
      description: metaDesc,
      canonical: metaCanonical,
      products,
      totalProducts: products.length,
      catalogueTotals: {
        products: catalogueProductCount,
        brands: catalogueBrands.filter(Boolean).length,
        strengths: STRENGTHS.length,
      },
      facets,
      priceRange: { min: Math.floor(priceMin), max: Math.ceil(priceMax) },
      wishlistIds,
      flavourPills: FLAVOUR_PILLS,
      query: req.query,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error loading shop");
  }
});

module.exports = router;
