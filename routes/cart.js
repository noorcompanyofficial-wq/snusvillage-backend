const express = require("express");
const router = express.Router();
const Cart = require("../models/cart");
const Product = require("../models/Products");

function databaseReady(res) {
  if (Cart.db.readyState === 1) return true;
  res.status(503).json({
    items: [],
    message: "Cart is unavailable until MongoDB is connected.",
  });
  return false;
}

// GET CART
router.get("/", async (req, res) => {
  if (!databaseReady(res)) return;

  const cart = await Cart.findOne({
    $or: [{ user: req.user?._id }, { sessionId: req.session.cartId }],
  }).populate("items.product");

  res.json(cart || { items: [] });
});

router.post("/add", async (req, res) => {
  if (!databaseReady(res)) return;

  const { productId } = req.body;

  const product = await Product.findById(productId);

  if (!product || product.stock <= 0) {
    return res.status(400).json({ message: "Out of stock" });
  }

  const finalPrice =
    product.discountPrice && product.discountPrice > 0
      ? product.discountPrice
      : product.price;

  let cart = await Cart.findOne({
    $or: [{ user: req.user?._id }, { sessionId: req.session.cartId }],
  });

  if (!cart) {
    cart = new Cart({
      user: req.user?._id || null,
      sessionId: req.session.cartId,
      expiresAt: req.user
        ? null
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  const itemIndex = cart.items.findIndex(
    (i) => i.product.toString() === productId,
  );

  if (itemIndex > -1) {
    if (cart.items[itemIndex].quantity < product.stock) {
      cart.items[itemIndex].quantity++;
    }
  } else {
    cart.items.push({
      product: productId,
      quantity: 1,
      priceAtTime: finalPrice,
    });
  }

  await cart.save();
  res.json(cart);
});

router.post("/update", async (req, res) => {
  if (!databaseReady(res)) return;

  const { productId, action } = req.body;

  const cart = await Cart.findOne({
    $or: [{ user: req.user?._id }, { sessionId: req.session.cartId }],
  });

  const item = cart.items.find((i) => i.product.toString() === productId);

  if (!item) return res.json(cart);

  if (action === "plus") item.quantity++;
  if (action === "minus" && item.quantity > 1) item.quantity--;

  await cart.save();
  res.json(cart);
});

router.post("/remove", async (req, res) => {
  if (!databaseReady(res)) return;

  const { productId } = req.body;

  const cart = await Cart.findOne({
    $or: [{ user: req.user?._id }, { sessionId: req.session.cartId }],
  });

  cart.items = cart.items.filter((i) => i.product.toString() !== productId);

  await cart.save();
  res.json(cart);
});

module.exports = router;
