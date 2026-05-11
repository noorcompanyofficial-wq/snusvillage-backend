const express = require("express");
const router = express.Router();
const Cart = require("../models/cart");
const Product = require("../models/Products");

function databaseReady(res) {
  if (Cart.db.readyState === 1) return true;

  res.status(503).render("500", {
    title: "Cart Unavailable",
  });

  return false;
}

async function getCart(req) {
  return Cart.findOne({
    $or: [{ user: req.session?.user?._id }, { sessionId: req.session.cartId }],
  }).populate("items.product");
}

function getCartProductId(item) {
  if (!item || !item.product) return "";
  return String(item.product._id || item.product);
}

// GET CART PAGE
router.get("/", async (req, res, next) => {
  try {
    if (!databaseReady(res)) return;

    const cart = await getCart(req);

    res.render("cart/cart", {
      title: "Your Cart",
      cart: cart || { items: [] },
    });
  } catch (error) {
    next(error);
  }
});

// ADD TO CART
router.post("/add/:productId", async (req, res, next) => {
  try {
    if (!databaseReady(res)) return;

    const productId = req.params.productId;
    const quantity = Math.max(parseInt(req.body.quantity || "1", 10), 1);

    const product = await Product.findById(productId);

    if (!product || product.stock <= 0) {
      req.flash("error", "This product is out of stock.");
      return res.redirect("/shop");
    }

    const finalPrice =
      product.discountPrice && product.discountPrice > 0 ? product.discountPrice : product.price;

    let cart = await getCart(req);

    if (!cart) {
      cart = new Cart({
        user: req.session?.user?._id || null,
        sessionId: req.session.cartId,
        expiresAt: req.session?.user ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }

    const itemIndex = cart.items.findIndex((i) => getCartProductId(i) === productId);

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = Math.min(
        cart.items[itemIndex].quantity + quantity,
        product.stock
      );
    } else {
      cart.items.push({
        product: productId,
        quantity,
        priceAtTime: finalPrice,
      });
    }

    await cart.save();

    res.redirect("/cart");
  } catch (error) {
    next(error);
  }
});

// UPDATE CART
router.post("/update", async (req, res, next) => {
  try {
    if (!databaseReady(res)) return;

    const { productId, action } = req.body;
    const cart = await getCart(req);

    if (!cart) return res.redirect("/cart");

    const item = cart.items.find((i) => getCartProductId(i) === productId);

    if (!item) return res.redirect("/cart");

    if (action === "plus") {
      const freshProduct = await Product.findById(productId);

      if (!freshProduct || freshProduct.stock <= 0) {
        req.flash("error", "This product is currently out of stock.");
        return res.redirect("/cart");
      }

      if (item.quantity >= freshProduct.stock) {
        req.flash("error", `Only ${freshProduct.stock} available in stock.`);
        return res.redirect("/cart");
      }

      item.quantity += 1;
    }

    if (action === "minus" && item.quantity > 1) item.quantity -= 1;

    await cart.save();

    res.redirect("/cart");
  } catch (error) {
    next(error);
  }
});

// REMOVE FROM CART
router.post("/remove", async (req, res, next) => {
  try {
    if (!databaseReady(res)) return;

    const { productId } = req.body;
    const cart = await getCart(req);

    if (!cart) return res.redirect("/cart");

    cart.items = cart.items.filter((i) => getCartProductId(i) !== productId);

    await cart.save();

    res.redirect("/cart");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
