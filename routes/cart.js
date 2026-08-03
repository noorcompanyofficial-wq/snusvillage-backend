const express = require("express");
const router = express.Router();
const Cart = require("../models/cart");
const Product = require("../models/Products");

function databaseReady(res) {
  if (Cart.db.readyState === 1) return true;
  res.status(503).render("500", { title: "Cart Unavailable" });
  return false;
}

// Fixed: split user vs guest lookup so we never match another user's cart
async function getCart(req) {
  const userId = req.session?.user?._id;
  const query = userId
    ? { user: userId }
    : { sessionId: req.session.cartId };
  return Cart.findOne(query).populate("items.product");
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
      sumupPublicKey: process.env.SUMUP_PUBLIC_KEY || "",
      googlePayMerchantId: process.env.GOOGLE_PAY_MERCHANT_ID || "",
    });
  } catch (error) {
    next(error);
  }
});

// GET CART ITEMS AS JSON (for sidebar)
router.get("/items", async (req, res, next) => {
  try {
    if (!databaseReady(res)) return;
    const cart = await getCart(req);
    const items = (cart?.items || [])
      .filter((i) => i.product)
      .map((i) => ({
        product: {
          _id: i.product._id,
          name: i.product.name,
          images: i.product.images || [],
          price: i.product.price,
          discountPrice: i.product.discountPrice,
        },
        quantity: i.quantity,
        priceAtTime: i.priceAtTime,
      }));
    res.json({ items });
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
      product.discountPrice && product.discountPrice > 0
        ? product.discountPrice
        : product.price;

    let cart = await getCart(req);

    if (!cart) {
      cart = new Cart({
        user: req.session?.user?._id || null,
        sessionId: req.session.cartId,
        expiresAt: req.session?.user ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }

    const itemIndex = cart.items.findIndex((i) => getCartProductId(i) === productId);
    const alreadyInCart = itemIndex > -1 ? cart.items[itemIndex].quantity : 0;
    const availableToAdd = Math.max(0, product.stock - alreadyInCart);
    const isWantsJson = req.headers.accept && req.headers.accept.includes("application/json");

    if (availableToAdd <= 0) {
      const message = `You already have the maximum available quantity (${product.stock}) of this product in your cart.`;
      if (isWantsJson) {
        return res.status(409).json({ ok: false, message, addedQuantity: 0, requestedQuantity: quantity });
      }
      req.flash("error", message);
      return res.redirect("/cart");
    }

    const addedQuantity = Math.min(quantity, availableToAdd);

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = alreadyInCart + addedQuantity;
    } else {
      cart.items.push({ product: productId, quantity: addedQuantity, priceAtTime: finalPrice });
    }

    await cart.save();

    const wasCapped = addedQuantity < quantity;
    const message = wasCapped
      ? `Only ${addedQuantity} more of this product ${addedQuantity === 1 ? "was" : "were"} in stock, so we added ${addedQuantity} instead of ${quantity}.`
      : "";

    // JSON response for fetch calls (sidebar), redirect for form submits
    if (isWantsJson) {
      return res.json({ ok: true, addedQuantity, requestedQuantity: quantity, capped: wasCapped, message });
    }

    if (wasCapped) {
      req.flash("error", message);
    }
    res.redirect("/cart");
  } catch (error) {
    next(error);
  }
});

// UPDATE CART (qty +/-)
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

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ ok: true });
    }
    res.redirect("/cart");
  } catch (error) {
    next(error);
  }
});

// REMOVE SINGLE ITEM
router.post("/remove", async (req, res, next) => {
  try {
    if (!databaseReady(res)) return;

    const { productId } = req.body;
    const cart = await getCart(req);

    if (!cart) return res.redirect("/cart");

    cart.items = cart.items.filter((i) => getCartProductId(i) !== productId);
    await cart.save();

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ ok: true });
    }
    res.redirect("/cart");
  } catch (error) {
    next(error);
  }
});

// CLEAR ENTIRE CART
router.post("/clear", async (req, res, next) => {
  try {
    if (!databaseReady(res)) return;

    const cart = await getCart(req);
    if (cart) {
      cart.items = [];
      await cart.save();
    }

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ ok: true });
    }
    res.redirect("/cart");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
