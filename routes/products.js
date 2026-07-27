const express = require("express");
const router = express.Router();
const Product = require("../models/Products");
const Review = require("../models/Review");
const Order = require("../models/order");
const mongoose = require("mongoose");
const { isAuth } = require("../middleware/authMiddleware");

const STRENGTH_ORDER = ["LOW", "MEDIUM", "STRONG", "X-STRONG", "EXTREME"];

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

    const reviews = await Review.find({ product: product._id }).sort({ createdAt: -1 }).limit(50).lean();

    const reviewStats = { count: reviews.length, average: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
    if (reviews.length) {
      let total = 0;
      reviews.forEach((r) => {
        total += r.rating;
        reviewStats.breakdown[r.rating] = (reviewStats.breakdown[r.rating] || 0) + 1;
      });
      reviewStats.average = total / reviews.length;
    }

    let canReview = false;
    let alreadyReviewed = false;

    if (req.session?.user?._id) {
      alreadyReviewed = reviews.some((r) => String(r.user) === String(req.session.user._id));

      if (!alreadyReviewed) {
        const purchase = await Order.findOne({
          user: req.session.user._id,
          paymentStatus: "paid",
          "items.product": product._id,
        }).lean();
        canReview = Boolean(purchase);
      }
    }

    const strengthIndex = Math.max(STRENGTH_ORDER.indexOf(product.strength), 0);
    const strengthPosition = strengthIndex * 20 + 10; // centre of that fifth of the spectrum

    const isWishlisted = (req.session?.user?.wishlist || []).some(
      (id) => String(id) === String(product._id)
    );

    const seo = buildProductSeo(product);
    const displayPrice = product.discountPrice || product.price || 0;
    const schema = JSON.stringify({
      '@context': 'https://schema.org/',
      '@type': 'Product',
      'name': cleanText(product.name),
      'image': (product.images && product.images[0]) || 'https://www.snusvillage.com/images/logo/snusvillage-logo.png',
      'description': seo.description,
      'brand': { '@type': 'Brand', 'name': cleanText(product.brand || 'Snus Village') },
      'offers': {
        '@type': 'Offer',
        'url': seo.canonical,
        'priceCurrency': 'GBP',
        'price': Number(displayPrice).toFixed(2),
        'availability': (product.stock > 0 || product.isActive !== false)
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock'
      },
      ...(reviewStats.count ? {
        'aggregateRating': {
          '@type': 'AggregateRating',
          'ratingValue': reviewStats.average.toFixed(1),
          'reviewCount': reviewStats.count
        }
      } : {})
    });
    res.render('products/products', {
      title: seo.title,
      description: seo.description,
      canonical: seo.canonical,
      schema,
      product,
      related,
      reviews,
      reviewStats,
      canReview,
      alreadyReviewed,
      strengthPosition,
      isWishlisted,
      standardShippingFee: Number(process.env.STANDARD_SHIPPING_FEE || 1.99),
      nextDayShippingFee: Number(process.env.NEXT_DAY_SHIPPING_FEE || 4.99),
      nextDayDeliveryCutoff: process.env.NEXT_DAY_DELIVERY_CUTOFF || "4:30pm",
      sumupPublicKey: process.env.SUMUP_PUBLIC_KEY || "",
      googlePayMerchantId: process.env.GOOGLE_PAY_MERCHANT_ID || "",
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server Error");
  }
});

router.post("/:id/reviews", isAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).send("Product not found");
    }

    const returnUrl = `${productUrl(product)}#reviews`;
    const rating = Math.max(1, Math.min(5, Math.round(Number(req.body.rating))));
    const body = cleanText(req.body.body).slice(0, 2000);

    if (!rating || !body) {
      req.flash("error", "Please add a star rating and a review.");
      return res.redirect(returnUrl);
    }

    const existing = await Review.findOne({ product: product._id, user: req.session.user._id });
    if (existing) {
      req.flash("error", "You've already reviewed this product.");
      return res.redirect(returnUrl);
    }

    const purchase = await Order.findOne({
      user: req.session.user._id,
      paymentStatus: "paid",
      "items.product": product._id,
    }).lean();

    if (!purchase) {
      req.flash("error", "Only customers who've purchased this product can leave a review.");
      return res.redirect(returnUrl);
    }

    const displayName = [req.session.user.firstName, req.session.user.lastName?.[0]]
      .filter(Boolean)
      .join(" ") + (req.session.user.lastName ? "." : "") || "Verified Customer";

    await Review.create({
      product: product._id,
      user: req.session.user._id,
      order: purchase._id,
      displayName,
      rating,
      body,
    });

    req.flash("success", "Thanks — your review has been posted.");
    res.redirect(returnUrl);
  } catch (error) {
    if (error.code === 11000) {
      req.flash("error", "You've already reviewed this product.");
    } else {
      console.log(error);
      req.flash("error", "Unable to post your review right now.");
    }
    res.redirect(`/products/${req.params.id}#reviews`);
  }
});

module.exports = router;
