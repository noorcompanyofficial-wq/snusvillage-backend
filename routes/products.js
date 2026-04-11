const express = require("express");
const router = express.Router();
const Product = require("../models/products");

// PRODUCT DETAILS PAGE
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).send("Product not found");
    }

    // related products (same brand مثلا)
    const related = await Product.find({
      brand: product.brand,
      _id: { $ne: product._id },
    }).limit(4);

    res.render("products/products", {
      title: product.name,
      product,
      related,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
