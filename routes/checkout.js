const express = require("express");
const router = express.Router();

const Cart = require("../models/cart");
const Order = require("../models/order");

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

function calculateCartTotals(cart) {
  const subtotal = cart.items.reduce((sum, item) => {
    const price = item.priceAtTime || item.product?.price || 0;
    return sum + price * item.quantity;
  }, 0);

  const shipping = 0;
  const total = subtotal + shipping;

  return { subtotal, shipping, total };
}

router.get("/", async (req, res, next) => {
  try {
    const cart = await getCart(req);

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    const { subtotal, shipping, total } = calculateCartTotals(cart);

    res.render("checkout/checkout", {
      layout: "layouts/checkout-layout",
      title: "Checkout",
      cart,
      subtotal,
      shipping,
      total,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/place-order", async (req, res, next) => {
  try {
    const cart = await getCart(req);

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    const { subtotal, shipping, total } = calculateCartTotals(cart);

    const orderItems = cart.items
      .filter((item) => item.product)
      .map((item) => {
        const price = item.priceAtTime || item.product.price || 0;

        return {
          product: item.product._id,
          name: item.product.name,
          brand: item.product.brand,
          image:
            item.product.images && item.product.images.length > 0
              ? item.product.images[0]
              : "",
          quantity: item.quantity,
          price,
        };
      });

    const order = await Order.create({
      user: getUserId(req),
      customer: {
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
      },
      delivery: {
        country: req.body.country,
        address: req.body.address,
        city: req.body.city,
        postcode: req.body.postcode,
      },
      items: orderItems,
      subtotal,
      shipping,
      total,
      paymentStatus: "pending",
      orderStatus: "new",
    });

    cart.items = [];
    await cart.save();

    res.redirect(`/checkout/success/${order._id}`);
  } catch (error) {
    next(error);
  }
});

router.get("/success/:orderId", async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId).lean();

    if (!order) {
      return res.redirect("/shop");
    }

    res.render("checkout/success", {
      layout: "layouts/checkout-layout",
      title: "Order Confirmed",
      order,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;