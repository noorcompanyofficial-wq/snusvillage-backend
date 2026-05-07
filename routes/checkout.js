const express = require("express");
const router = express.Router();

const Cart = require("../models/cart");

function getUserId(req) {
  return req.session?.user?._id || req.user?._id || null;
}

async function getCart(req) {
  const userId = getUserId(req);
  const sessionId = req.session?.cartId;

  if (!userId && !sessionId) {
    return null;
  }

  return Cart.findOne({
    $or: [{ user: userId }, { sessionId }],
  }).populate("items.product");
}

router.get("/", async (req, res, next) => {
  try {
    const cart = await getCart(req);

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    const subtotal = cart.items.reduce((sum, item) => {
      const price = item.priceAtTime || item.product?.price || 0;
      return sum + price * item.quantity;
    }, 0);

    res.render("checkout/checkout", {
      layout: "layouts/checkout-layout",
      title: "Checkout",
      cart,
      subtotal,
      shipping: 0,
      total: subtotal,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;