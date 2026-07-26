const express = require("express");
const router = express.Router();
const User = require("../models/User");

function requireLogin(req, res) {
  if (req.session?.user?._id) return true;

  if (req.headers.accept && req.headers.accept.includes("application/json")) {
    res.status(401).json({ ok: false, needsLogin: true });
  } else {
    req.session.returnTo = req.originalUrl;
    res.redirect("/auth/login");
  }

  return false;
}

router.get("/", async (req, res, next) => {
  try {
    if (!requireLogin(req, res)) return;

    const user = await User.findById(req.session.user._id).populate("wishlist").lean();
    const products = (user?.wishlist || []).filter(Boolean);

    res.render("wishlist/wishlist", {
      title: "Your Wishlist | Snus Village",
      products,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/toggle/:productId", async (req, res, next) => {
  try {
    if (!requireLogin(req, res)) return;

    const { productId } = req.params;
    const user = await User.findById(req.session.user._id);

    if (!user) {
      return res.status(401).json({ ok: false, needsLogin: true });
    }

    const existingIndex = user.wishlist.findIndex((id) => String(id) === productId);
    let wishlisted;

    if (existingIndex > -1) {
      user.wishlist.splice(existingIndex, 1);
      wishlisted = false;
    } else {
      user.wishlist.push(productId);
      wishlisted = true;
    }

    await user.save();
    req.session.user = user;

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ ok: true, wishlisted });
    }

    res.redirect(req.get("referer") || "/shop");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
