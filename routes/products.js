const express = require("express");
const router = express.Router();
const Product = require("../models/Products");
const mongoose = require("mongoose");

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function productUrl(product) {
  return `/products/${product.slug || product._id}`;
}

function buildProductSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function truncateSentence(value, maxLength = 155) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;

  const clipped = text.slice(0, maxLength - 1);
  const lastStop = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf("!"), clipped.lastIndexOf("?"));

  if (lastStop > 80) {
    return clipped.slice(0, lastStop + 1);
  }

  return clipped.replace(/\s+\S*$/, "") + ".";
}

function buildProductSeo(product) {
  const name = cleanText(product.name);
  const brand = cleanText(product.brand || "Snus Village");
  const flavour = cleanText(product.flavour);
  const strength = cleanText(product.strength);
  const nicotine = cleanText(product.nicotine);
  const category = cleanText(product.category || "nicotine pouch");

  const title = cleanText(product.seoTitle) || `${name} | ${brand} | Snus Village`;

  const details = [
    brand && `brand ${brand}`,
    flavour && `${flavour} flavour`,
    strength && `${strength} strength`,
    nicotine && `${nicotine}mg nicotine`,
  ].filter(Boolean);

  const fallbackDescription =
    `Shop ${name} from Snus Village. ${details.length ? "Features " + details.join(", ") + ". " : ""}` +
    `Premium ${category} for adult customers with age verification and UK delivery options.`;

  const description = truncateSentence(product.seoDescription || fallbackDescription);
  const canonical = `https://www.snusvillage.com${productUrl(product)}`;

  return { title, description, canonical };
}

// PRODUCT DETAILS PAGE
router.get("/:id", async (req, res) => {
  try {
    const normalisedSlug = buildProductSlug(req.params.id);
    const lookup = mongoose.Types.ObjectId.isValid(req.params.id)
      ? { $or: [{ _id: req.params.id }, { slug: req.params.id }] }
      : { $or: [{ slug: req.params.id }, { slug: normalisedSlug }] };

    const product = await Product.findOne(lookup);

    if (!product) {
      return res.status(404).send("Product not found");
    }

    if (product.slug && req.params.id !== product.slug) {
      return res.redirect(301, productUrl(product));
    }

    const related = await Product.find({
      brand: product.brand,
      _id: { $ne: product._id },
      isActive: { $ne: false },
    })
      .sort({ isBestSeller: -1, isFeatured: -1, updatedAt: -1 })
      .limit(10)
      .lean();

    const seo = buildProductSeo(product);

    res.render("products/products", {
      title: seo.title,
      description: seo.description,
      canonical: seo.canonical,
      product,
      related,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
