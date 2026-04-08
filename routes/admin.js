const express = require("express");
const router = express.Router();

const Product = require("../models/Products");
const isAdmin = require("../middleware/isAdmin");
const upload = require("../middleware/upload");

router.get("/dashboard", isAdmin, (req, res) => {
  res.render("admin/dashboard", {
    layout: "layouts/admin-layout",
  });
});

//  Add Product Page
router.get("/products/add", isAdmin, (req, res) => {
  res.render("admin/add-product", {
    layout: "layouts/admin-layout",
  });
});

//  Create Product

router.get("/products", isAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 8;

  const products = await Product.find()
    .skip((page - 1) * limit)
    .limit(limit);

  const total = await Product.countDocuments();
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.json({
      products,
      hasMore: page * limit < total,
    });
  }

  res.render("admin/products", {
    layout: "layouts/admin-layout",
    products,
    hasMore: page * limit < total,
    nextPage: page + 1,
    totalProducts: total,
  });
});

router.post(
  "/products/add",
  isAdmin,
  upload.array("images", 5),
  async (req, res) => {
    try {
      const {
        name,
        price,
        discountPrice,
        description,
        strength,
        nicotine,
        brand,
        flavour,
        category,
        stock,
      } = req.body;

      const parsedPrice = parseFloat(price);
      const parsedDiscount = discountPrice ? parseFloat(discountPrice) : 0;

      const slug = name
        .toLowerCase()
        .replace(/ /g, "-")
        .replace(/[^\w-]+/g, "");

      const images = req.files.map((file) => "/uploads/" + file.filename);

      await Product.create({
        name,
        slug,
        price: parsedPrice,
        discountPrice: parsedDiscount,
        description,
        strength,
        nicotine,
        brand,
        flavour,
        category,
        stock,
        images,
      });

      req.flash("success", "Product added successfully!");
      res.redirect("/admin/products");
    } catch (err) {
      console.log(err);
      req.flash("error", "Error creating product");
      res.redirect("/admin/products/add");
    }
  },
);

// Delete Product
router.post("/products/delete/:id", isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);

    req.flash("success", "Product deleted!");
    res.redirect("/admin/products");
  } catch (err) {
    req.flash("error", "Delete failed");
    res.redirect("/admin/products");
  }
});

/* Edit Product */
router.get("/products/edit/:id", isAdmin, async (req, res) => {
  const product = await Product.findById(req.params.id);

  res.render("admin/edit-product", {
    layout: "layouts/admin-layout",
    product,
  });
});

router.post(
  "/products/edit/:id",
  isAdmin,
  upload.array("images", 5),
  async (req, res) => {
    try {
      const {
        name,
        price,
        discountPrice,
        description,
        strength,
        nicotine,
        category,
        stock,
      } = req.body;

      const product = await Product.findById(req.params.id);

      const updatedData = {
        name,
        price: parseFloat(price),
        discountPrice: discountPrice ? parseFloat(discountPrice) : 0,
        description,
        strength,
        nicotine,
        category,
        stock,
      };

      let images = product.images || [];

      if (req.body.removeImages) {
        const removeList = Array.isArray(req.body.removeImages)
          ? req.body.removeImages
          : [req.body.removeImages];

        images = images.filter((img) => !removeList.includes(img));
      }

      if (req.files && req.files.length > 0) {
        const newImages = req.files.map((file) => "/uploads/" + file.filename);

        images = [...images, ...newImages];
      }

      updatedData.images = images;

      await Product.findByIdAndUpdate(req.params.id, updatedData);

      req.flash("success", "Product updated!");
      res.redirect("/admin/products");
    } catch (err) {
      console.log(err);
      req.flash("error", "Update failed");
      res.redirect("/admin/products");
    }
  },
);

module.exports = router;
