const express = require("express");
const router = express.Router();
const Product = require("../models/Products");

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildProductSeo(product) {
  const name = cleanText(product.name);
  const brand = cleanText(product.brand || "Snus Village");
  const flavour = cleanText(product.flavour);
  const strength = cleanText(product.strength);
  const nicotine = cleanText(product.nicotine);
  const category = cleanText(product.category || "nicotine pouch");

  const title = `${name} | ${brand} | Snus Village`;

  const details = [
    brand && `brand ${brand}`,
    flavour && `${flavour} flavour`,
    strength && `${strength} strength`,
    nicotine && `${nicotine}mg nicotine`,
  ].filter(Boolean);

  const description = cleanText(
    `Shop ${name} from Snus Village. ${details.length ? "Features " + details.join(", ") + "." : ""} Premium ${category} for adult customers with age verification and UK delivery options.`
  ).slice(0, 158);

  const canonical = `https://www.snusvillage.com/products/${product._id}`;

  return { title, description, canonical };
}

// PRODUCT DETAILS PAGE
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).send("Product not found");
    }

    const related = await Product.find({
      brand: product.brand,
      _id: { $ne: product._id },
    }).limit(4);

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
