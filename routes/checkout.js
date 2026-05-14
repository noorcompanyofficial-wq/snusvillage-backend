const express = require("express");
const router = express.Router();

const Cart = require("../models/cart");
const Order = require("../models/order");
const Product = require("../models/Products");
const User = require("../models/User");
const DiscountCode = require("../models/DiscountCode");
const { sendOrderToRoyalMail } = require("../utils/royalMail");
const { sendOrderEmails } = require("../utils/orderEmails");
const { createHostedCheckout, getCheckoutStatus } = require("../utils/sumup");

function getUserId(req) {
  return req.session?.user?._id || req.user?._id || null;
}

function sessionIsAgeVerified(req) {
  return req.session?.diditVerified === true || req.session?.isAgeVerified === true;
}

function userIsAgeVerified(user) {
  return Boolean(user && (user.isAgeVerified || user.didit?.verified));
}

async function getCheckoutUser(req) {
  const userId = getUserId(req);
  if (!userId) return null;
  return User.findById(userId).lean();
}

async function checkoutVerificationRequired(req) {
  const user = await getCheckoutUser(req);

  if (getUserId(req) && !user) {
    return { missingUser: true, required: true };
  }

  return {
    missingUser: false,
    required: !(userIsAgeVerified(user) || sessionIsAgeVerified(req)),
    user,
  };
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

function productMatchesDiscount(item, discount) {
  const product = item.product;
  if (!product) return false;

  const appliesToBrand = String(discount.appliesToBrand || "").trim().toLowerCase();
  const appliesToCategory = String(discount.appliesToCategory || "").trim().toLowerCase();

  if (appliesToBrand && String(product.brand || "").trim().toLowerCase() !== appliesToBrand) {
    return false;
  }

  if (appliesToCategory && String(product.category || "").trim().toLowerCase() !== appliesToCategory) {
    return false;
  }

  return true;
}

async function calculateDiscountForCart(cart, code) {
  const cleanCode = String(code || "").trim().toUpperCase();

  if (!cleanCode) {
    return {
      ok: true,
      code: "",
      discount: null,
      discountAmount: 0,
      message: "",
    };
  }

  const subtotal = cart.items.reduce((sum, item) => {
    const price = item.priceAtTime || item.product?.price || 0;
    return sum + price * item.quantity;
  }, 0);

  const discount = await DiscountCode.findOne({ code: cleanCode }).lean();

  if (!discount) {
    return {
      ok: false,
      code: cleanCode,
      discount: null,
      discountAmount: 0,
      message: "Discount code was not found.",
    };
  }

  if (!discount.isActive) {
    return {
      ok: false,
      code: cleanCode,
      discount,
      discountAmount: 0,
      message: "Discount code is not active.",
    };
  }

  if (discount.expiresAt && new Date(discount.expiresAt) < new Date()) {
    return {
      ok: false,
      code: cleanCode,
      discount,
      discountAmount: 0,
      message: "Discount code has expired.",
    };
  }

  if (discount.usageLimit > 0 && discount.usedCount >= discount.usageLimit) {
    return {
      ok: false,
      code: cleanCode,
      discount,
      discountAmount: 0,
      message: "Discount code usage limit has been reached.",
    };
  }

  if (subtotal < Number(discount.minimumSpend || 0)) {
    return {
      ok: false,
      code: cleanCode,
      discount,
      discountAmount: 0,
      message: `Minimum spend for this code is £${Number(discount.minimumSpend || 0).toFixed(2)}.`,
    };
  }

  const restricted = Boolean(discount.appliesToBrand || discount.appliesToCategory);

  const discountableSubtotal = cart.items.reduce((sum, item) => {
    if (restricted && !productMatchesDiscount(item, discount)) {
      return sum;
    }

    const price = item.priceAtTime || item.product?.price || 0;
    return sum + price * item.quantity;
  }, 0);

  if (restricted && discountableSubtotal <= 0) {
    return {
      ok: false,
      code: cleanCode,
      discount,
      discountAmount: 0,
      message: "This discount does not apply to the products in your cart.",
    };
  }

  let discountAmount = 0;

  if (discount.type === "percentage") {
    discountAmount = discountableSubtotal * (Number(discount.value || 0) / 100);
  } else {
    discountAmount = Math.min(Number(discount.value || 0), discountableSubtotal);
  }

  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));

  return {
    ok: true,
    code: cleanCode,
    discount,
    discountAmount,
    message: "Discount applied.",
  };
}

async function calculateCheckoutTotals(req, cart) {
  const { subtotal, shipping } = calculateCartTotals(cart);
  const discountResult = await calculateDiscountForCart(cart, req.session.checkoutDiscountCode);

  if (!discountResult.ok) {
    req.session.checkoutDiscountCode = "";
  }

  const discountAmount = discountResult.ok ? discountResult.discountAmount : 0;
  const total = Math.max(0, subtotal + shipping - discountAmount);

  return {
    subtotal,
    shipping,
    discountAmount,
    total,
    discountResult,
  };
}

function extractRoyalMailError(data) {
  const failedOrder = data?.failedOrders?.[0];

  if (failedOrder?.errors?.length) {
    return failedOrder.errors
      .map((err) => err.errorMessage || err.message || JSON.stringify(err))
      .join(", ");
  }

  if (data?.message) {
    return data.message;
  }

  if (data?.errors?.length) {
    return data.errors
      .map((err) => err.errorMessage || err.message || JSON.stringify(err))
      .join(", ");
  }

  return "Royal Mail did not return an order identifier.";
}

async function syncOrderToRoyalMail(order) {
  try {
    const royalMailResult = await sendOrderToRoyalMail(order);

    console.log("Royal Mail result:", JSON.stringify(royalMailResult, null, 2));

    if (royalMailResult.ok) {
      const createdOrder =
        royalMailResult.data?.createdOrders?.[0] ||
        royalMailResult.data?.orders?.[0] ||
        null;

      if (createdOrder?.orderIdentifier) {
        order.royalMail = {
          ...order.royalMail,
          synced: true,
          orderIdentifier: String(createdOrder.orderIdentifier),
          orderReference: createdOrder.orderReference || "",
          trackingNumber: createdOrder.trackingNumber || "",
          syncStatus: "sent",
          syncError: "",
          syncedAt: new Date(),
        };
      } else {
        order.royalMail = {
          ...order.royalMail,
          synced: false,
          orderIdentifier: "",
          orderReference: "",
          trackingNumber: "",
          syncStatus: "failed",
          syncError: extractRoyalMailError(royalMailResult.data),
          syncedAt: null,
        };
      }
    } else {
      order.royalMail = {
        ...order.royalMail,
        synced: false,
        orderIdentifier: "",
        orderReference: "",
        trackingNumber: "",
        syncStatus: royalMailResult.skipped ? "not_sent" : "failed",
        syncError: royalMailResult.message || "Royal Mail sync failed",
        syncedAt: null,
      };
    }

    await order.save();
  } catch (royalMailError) {
    order.royalMail = {
      ...order.royalMail,
      synced: false,
      orderIdentifier: "",
      orderReference: "",
      trackingNumber: "",
      syncStatus: "failed",
      syncError: royalMailError.message,
      syncedAt: null,
    };

    await order.save();
  }
}

async function reduceStockForPaidOrder(order) {
  for (const item of order.items) {
    if (item.product) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity },
      });
    }
  }
}

async function clearCartForPaidOrder(order) {
  if (!order.user && !order.sessionId) return;

  const cart = await Cart.findOne({
    $or: [{ user: order.user }, { sessionId: order.sessionId }],
  });

  if (cart) {
    cart.items = [];
    await cart.save();
  }
}

async function finalisePaidOrder(order) {
  if (order.sumup?.fulfilmentFinalised) {
    return order;
  }

  order.paymentStatus = "paid";
  order.orderStatus = order.orderStatus === "new" ? "processing" : order.orderStatus;
  order.sumup = {
    ...order.sumup,
    status: "PAID",
    paidAt: order.sumup?.paidAt || new Date(),
    error: "",
  };

  await order.save();

  await reduceStockForPaidOrder(order);

  if (order.discount?.code) {
    await DiscountCode.findOneAndUpdate(
      { code: order.discount.code },
      { $inc: { usedCount: 1 } }
    );
  }

  if (order.fulfilment?.method === "click_collect") {
    order.royalMail = {
      ...order.royalMail,
      synced: false,
      orderIdentifier: "",
      orderReference: "",
      trackingNumber: "",
      syncStatus: "not_sent",
      syncError: "Click & Collect order - Royal Mail not required.",
      syncedAt: null,
    };

    await order.save();
  } else {
    await syncOrderToRoyalMail(order);
  }

  try {
    const emailResults = await sendOrderEmails(order);
    console.log("Order email results:", JSON.stringify(emailResults, null, 2));
  } catch (emailError) {
    console.log("Order email error:", emailError.message);
  }

  await clearCartForPaidOrder(order);

  order.sumup = {
    ...order.sumup,
    fulfilmentFinalised: true,
  };

  await order.save();

  return order;
}

router.get("/", async (req, res, next) => {
  try {
    const cart = await getCart(req);

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    const { subtotal, shipping, discountAmount, total, discountResult } =
      await calculateCheckoutTotals(req, cart);

    const verification = await checkoutVerificationRequired(req);

    if (verification.missingUser) {
      req.flash("error", "Please log in again before checkout.");
      return res.redirect("/auth/login");
    }

    const verificationRequired = verification.required;

    res.render("checkout/checkout", {
      layout: "layouts/checkout-layout",
      title: "Checkout",
      cart,
      subtotal,
      shipping,
      discountAmount,
      total,
      discountResult,
      appliedDiscountCode: req.session.checkoutDiscountCode || "",
      verificationRequired,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/apply-discount", async (req, res, next) => {
  try {
    const cart = await getCart(req);

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    const code = String(req.body.discountCode || "").trim().toUpperCase();

    if (!code) {
      req.flash("error", "Please enter a discount code.");
      return res.redirect("/checkout");
    }

    const discountResult = await calculateDiscountForCart(cart, code);

    if (!discountResult.ok) {
      req.session.checkoutDiscountCode = "";
      req.flash("error", discountResult.message);
      return res.redirect("/checkout");
    }

    req.session.checkoutDiscountCode = code;
    req.flash("success", `Discount code ${code} applied.`);
    res.redirect("/checkout");
  } catch (error) {
    next(error);
  }
});

router.post("/remove-discount", (req, res) => {
  req.session.checkoutDiscountCode = "";
  req.flash("success", "Discount code removed.");
  res.redirect("/checkout");
});

router.post("/place-order", async (req, res, next) => {
  try {
    const cart = await getCart(req);

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    const verification = await checkoutVerificationRequired(req);

    if (verification.missingUser) {
      req.flash("error", "Please log in again before checkout.");
      return res.redirect("/auth/login");
    }

    if (verification.required) {
      req.flash("error", "Age verification is required before checkout.");
      return res.redirect("/checkout");
    }

    if (req.body.ageConfirm !== "yes") {
      req.flash("error", "You must confirm you are 18+ before placing an order.");
      return res.redirect("/checkout");
    }

    for (const item of cart.items) {
      if (!item.product || !item.product._id) {
        req.flash("error", "One of your cart items is no longer available.");
        return res.redirect("/cart");
      }

      const freshProduct = await Product.findById(item.product._id);

      if (!freshProduct || freshProduct.stock < item.quantity) {
        req.flash("error", "One of your cart items is out of stock.");
        return res.redirect("/cart");
      }
    }

    const { subtotal, shipping, discountAmount, total, discountResult } =
      await calculateCheckoutTotals(req, cart);

    const fulfilmentMethod =
      req.body.fulfilmentMethod === "click_collect" ? "click_collect" : "delivery";

    const isClickCollect = fulfilmentMethod === "click_collect";

    if (!isClickCollect) {
      if (!req.body.address || !req.body.city || !req.body.postcode) {
        req.flash("error", "Please enter your delivery address.");
        return res.redirect("/checkout");
      }
    }

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
      sessionId: req.session?.cartId || "",
      customer: {
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
      },
      delivery: {
        country: "United Kingdom",
        address: isClickCollect ? "SNUS VILLAGE, EDGWARE ROAD, TYBURNIA, London, W2 2HX" : req.body.address,
        city: isClickCollect ? "London" : req.body.city,
        postcode: isClickCollect ? "W2 2HX" : req.body.postcode,
      },
      fulfilment: {
        method: fulfilmentMethod,
        collectionBranch: isClickCollect ? "Edgware Road" : "",
        collectionAddress: isClickCollect ? "SNUS VILLAGE, EDGWARE ROAD, TYBURNIA, London, W2 2HX" : "",
      },
      items: orderItems,
      subtotal,
      shipping,
      discount: {
        code: discountResult.ok && discountResult.discount ? discountResult.code : "",
        type: discountResult.ok && discountResult.discount ? discountResult.discount.type : "",
        value: discountResult.ok && discountResult.discount ? discountResult.discount.value : 0,
        amount: discountAmount,
      },
      total,
      paymentStatus: "pending",
      orderStatus: "new",
    });

    try {
      const sumupResult = await createHostedCheckout(order, req);
      const checkout = sumupResult.data;

      order.sumup = {
        checkoutId: checkout.id || "",
        checkoutReference: sumupResult.checkoutReference,
        checkoutUrl: checkout.hosted_checkout_url || "",
        status: checkout.status || "PENDING",
        paidAt: null,
        error: "",
        fulfilmentFinalised: false,
      };

      await order.save();

      return res.redirect(checkout.hosted_checkout_url);
    } catch (sumupError) {
      order.paymentStatus = "failed";
      order.sumup = {
        ...order.sumup,
        status: "failed",
        error: sumupError.message,
        fulfilmentFinalised: false,
      };

      await order.save();

      console.log("SumUp checkout error:", sumupError.message);
      req.flash("error", "Payment could not be started. Please try again.");
      return res.redirect("/checkout");
    }
  } catch (error) {
    next(error);
  }
});

router.get("/sumup/return/:orderId", async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.redirect("/shop");
    }

    if (!order.sumup?.checkoutId) {
      req.flash("error", "Payment checkout was not found for this order.");
      return res.redirect("/checkout");
    }

    const checkoutStatus = await getCheckoutStatus(order.sumup.checkoutId);
    const status = checkoutStatus.status || "";

    order.sumup = {
      ...order.sumup,
      status,
      error: status === "PAID" ? "" : `Payment status: ${status || "unknown"}`,
    };

    if (status === "PAID") {
      await order.save();
      await finalisePaidOrder(order);
      return res.redirect(`/checkout/success/${order._id}`);
    }

    order.paymentStatus = status === "FAILED" || status === "EXPIRED" ? "failed" : "pending";
    await order.save();

    return res.redirect(`/checkout/payment-pending/${order._id}`);
  } catch (error) {
    next(error);
  }
});

router.get("/payment-pending/:orderId", async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId).lean();

    if (!order) {
      return res.redirect("/shop");
    }

    res.render("checkout/success", {
      layout: "layouts/checkout-layout",
      title: "Payment Pending",
      order,
      paymentPending: true,
    });
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
