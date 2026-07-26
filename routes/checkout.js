const express = require("express");
const router = express.Router();

const Cart = require("../models/cart");
const Order = require("../models/order");
const Product = require("../models/Products");
const DiscountCode = require("../models/DiscountCode");
const StoreSettings = require("../models/StoreSettings");
const { sendOrderToRoyalMail } = require("../utils/royalMail");
const { sendOrderEmails } = require("../utils/orderEmails");
const {
  createHostedCheckout,
  createExpressCheckout,
  getCheckoutStatus,
} = require("../utils/sumup");

const defaultCheckoutSettings = {
  deliveryPrice: 0,
  freeDeliveryThreshold: 0,
  checkoutNotice: "You Will Be Redirected To SumUp To Complete Your Card Payment Securely.",
  clickCollectBranch: "Edgware Road",
  clickCollectAddress: "SNUS VILLAGE, EDGWARE ROAD, TYBURNIA, London, W2 2HX",
  clickCollectCity: "London",
  clickCollectPostcode: "W2 2HX",
};

async function getCheckoutStoreSettings() {
  if (StoreSettings.db.readyState !== 1) {
    return defaultCheckoutSettings;
  }

  const settings = await StoreSettings.findOne({ key: "store" }).lean();

  return {
    ...defaultCheckoutSettings,
    ...(settings || {}),
  };
}

function getUserId(req) {
  return req.session?.user?._id || req.user?._id || null;
}

async function getCart(req) {
  const userId = getUserId(req);
  const sessionId = req.session?.cartId;

  if (!userId && !sessionId) {
    return null;
  }

  const query = userId ? { user: userId } : { sessionId };

  return Cart.findOne(query).populate("items.product");
}

function getFreeShippingThreshold() {
  return Number(process.env.FREE_SHIPPING_THRESHOLD || 10);
}

function getStandardShippingFee() {
  return Number(process.env.STANDARD_SHIPPING_FEE || 1.99);
}

function getNextDayShippingFee() {
  return Number(process.env.NEXT_DAY_SHIPPING_FEE || 4.99);
}

function getNextDayDeliveryCutoff() {
  return process.env.NEXT_DAY_DELIVERY_CUTOFF || "4:30pm";
}

function getDeliveryServiceLabel(fulfilmentMethod, deliveryService) {
  if (fulfilmentMethod === "click_collect") return "Click & Collect";
  return deliveryService === "next_day" ? "Royal Mail Next Day" : "Standard Delivery";
}

function calculateCartTotals(cart, fulfilmentMethod = "delivery", deliveryService = "standard") {
  const subtotal = cart.items.reduce((sum, item) => {
    const price = item.priceAtTime || item.product?.price || 0;
    return sum + price * item.quantity;
  }, 0);

  const freeShippingThreshold = getFreeShippingThreshold();
  const standardShippingFee = getStandardShippingFee();
  const nextDayShippingFee = getNextDayShippingFee();

  let shipping = 0;

  if (fulfilmentMethod !== "click_collect") {
    shipping =
      deliveryService === "next_day"
        ? nextDayShippingFee
        : subtotal >= freeShippingThreshold
          ? 0
          : standardShippingFee;
  }

  const total = subtotal + shipping;

  return {
    subtotal,
    shipping,
    total,
    freeShippingThreshold,
    standardShippingFee,
    nextDayShippingFee,
    nextDayDeliveryCutoff: getNextDayDeliveryCutoff(),
  };
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

async function calculateCheckoutTotals(req, cart, fulfilmentMethod = "delivery", deliveryService = "standard") {
  const { subtotal, shipping, freeShippingThreshold, standardShippingFee, nextDayShippingFee, nextDayDeliveryCutoff } =
    calculateCartTotals(cart, fulfilmentMethod, deliveryService);
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
    freeShippingThreshold,
    standardShippingFee,
    nextDayShippingFee,
    nextDayDeliveryCutoff,
  };
}

async function refreshCartForExpressCheckout(cart) {
  for (const item of cart.items) {
    if (!item.product?._id) {
      throw new CheckoutError("One of your cart items is no longer available.", 409, "/cart");
    }

    const freshProduct = await Product.findById(item.product._id);

    if (!freshProduct || freshProduct.stock < item.quantity) {
      throw new CheckoutError("One of your cart items is out of stock.", 409, "/cart");
    }

    item.product = freshProduct;
    item.priceAtTime =
      freshProduct.discountPrice && freshProduct.discountPrice > 0
        ? freshProduct.discountPrice
        : freshProduct.price;
  }

  return cart;
}

async function createExpressQuote(
  req,
  deliveryService = "standard",
  productId = "",
  requestedQuantity = 1
) {
  if (!["standard", "next_day"].includes(deliveryService)) {
    throw new CheckoutError("Please select a valid delivery service.");
  }

  let cart;
  let totals;

  if (productId) {
    const product = await Product.findById(productId);
    const quantity = Number.parseInt(requestedQuantity, 10);

    if (!product || product.isActive === false) {
      throw new CheckoutError("This product is no longer available.", 409);
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > product.stock) {
      throw new CheckoutError("The selected quantity is no longer available.", 409);
    }

    const price =
      product.discountPrice && product.discountPrice > 0
        ? product.discountPrice
        : product.price;
    cart = { items: [{ product, quantity, priceAtTime: price }] };
    const cartTotals = calculateCartTotals(cart, "delivery", deliveryService);
    totals = {
      ...cartTotals,
      discountAmount: 0,
      discountResult: {
        ok: true,
        code: "",
        discount: null,
        discountAmount: 0,
      },
    };
  } else {
    cart = await getCart(req);

    if (!cart?.items?.length) {
      throw new CheckoutError("Your cart is empty.", 409, "/cart");
    }

    await refreshCartForExpressCheckout(cart);
    totals = await calculateCheckoutTotals(req, cart, "delivery", deliveryService);
  }

  if (!totals.discountResult.ok) {
    throw new CheckoutError(totals.discountResult.message);
  }

  const standardShipping =
    totals.subtotal >= totals.freeShippingThreshold ? 0 : totals.standardShippingFee;
  const baseAfterDiscount = Math.max(0, totals.subtotal - totals.discountAmount);
  const shippingOptions = [
    {
      id: "standard",
      label: "Standard delivery",
      description: standardShipping === 0 ? "Free UK delivery" : "Standard UK delivery",
      amount: { currency: "GBP", value: standardShipping.toFixed(2) },
      selected: deliveryService === "standard",
    },
    {
      id: "next_day",
      label: "Royal Mail Next Day",
      description: `Order before ${totals.nextDayDeliveryCutoff}`,
      amount: { currency: "GBP", value: totals.nextDayShippingFee.toFixed(2) },
      selected: deliveryService === "next_day",
    },
  ];

  return {
    cart,
    totals,
    deliveryService,
    response: {
      success: true,
      currency: "GBP",
      subtotal: totals.subtotal.toFixed(2),
      discount: totals.discountAmount.toFixed(2),
      shippingOptions,
      total: {
        label: "Snus Village",
        amount: {
          currency: "GBP",
          value: (
            baseAfterDiscount +
            (deliveryService === "next_day"
              ? totals.nextDayShippingFee
              : standardShipping)
          ).toFixed(2),
        },
      },
    },
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

  const cart = await Cart.findOne(
    order.user ? { user: order.user } : { sessionId: order.sessionId }
  );

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

    order.emailNotifications = {
      ...order.emailNotifications,
      orderConfirmationSent: Boolean(emailResults.customer?.ok),
      orderConfirmationSentAt: emailResults.customer?.ok ? new Date() : order.emailNotifications?.orderConfirmationSentAt || null,
      lastOrderEmailError: emailResults.customer?.ok ? "" : emailResults.customer?.message || "",
    };

    await order.save();
  } catch (emailError) {
    console.log("Order email error:", emailError.message);
    order.emailNotifications = {
      ...order.emailNotifications,
      lastOrderEmailError: emailError.message,
    };
    await order.save();
  }

  if (order.sumup?.clearCartOnPayment !== false) {
    await clearCartForPaidOrder(order);
  }

  order.sumup = {
    ...order.sumup,
    fulfilmentFinalised: true,
  };

  await order.save();

  return order;
}

class CheckoutError extends Error {
  constructor(message, status = 400, redirectTo = "/checkout") {
    super(message);
    this.status = status;
    this.redirectTo = redirectTo;
  }
}

function requireCheckoutField(value, message) {
  if (!String(value || "").trim()) {
    throw new CheckoutError(message);
  }
}

async function prepareOrder(req) {
  const cart = await getCart(req);

  if (!cart || !cart.items || cart.items.length === 0) {
    throw new CheckoutError("Your cart is empty.", 409, "/cart");
  }

  if (req.body.ageConfirm !== "yes") {
    throw new CheckoutError("You must confirm you are 18+ before placing an order.");
  }

  requireCheckoutField(req.body.email, "Please enter your email address.");
  requireCheckoutField(req.body.firstName, "Please enter your first name.");
  requireCheckoutField(req.body.lastName, "Please enter your last name.");
  requireCheckoutField(req.body.phone, "Please enter your phone number.");

  for (const item of cart.items) {
    if (!item.product || !item.product._id) {
      throw new CheckoutError("One of your cart items is no longer available.", 409, "/cart");
    }

    const freshProduct = await Product.findById(item.product._id);

    if (!freshProduct || freshProduct.stock < item.quantity) {
      throw new CheckoutError("One of your cart items is out of stock.", 409, "/cart");
    }
  }

  if (!["delivery", "click_collect"].includes(req.body.fulfilmentMethod)) {
    throw new CheckoutError("Please select a valid fulfilment method.");
  }

  const fulfilmentMethod = req.body.fulfilmentMethod;
  const isClickCollect = fulfilmentMethod === "click_collect";

  if (!isClickCollect && !["standard", "next_day"].includes(req.body.deliveryService)) {
    throw new CheckoutError("Please select a valid delivery service.");
  }

  const deliveryService = isClickCollect ? "standard" : req.body.deliveryService;
  const settings = await getCheckoutStoreSettings();
  const { subtotal, shipping, discountAmount, total, discountResult } =
    await calculateCheckoutTotals(req, cart, fulfilmentMethod, deliveryService);

  if (!discountResult.ok) {
    throw new CheckoutError(discountResult.message);
  }

  if (!isClickCollect) {
    requireCheckoutField(req.body.address, "Please enter your delivery address.");
    requireCheckoutField(req.body.city, "Please enter your delivery city.");
    requireCheckoutField(req.body.postcode, "Please enter your delivery postcode.");
  }

  const orderItems = cart.items
    .filter((item) => item.product)
    .map((item) => {
      const price = item.priceAtTime || item.product.price || 0;

      return {
        product: item.product._id,
        name: item.product.name,
        brand: item.product.brand,
        image: item.product.images?.[0] || "",
        quantity: item.quantity,
        price,
      };
    });

  return Order.create({
    user: getUserId(req),
    sessionId: req.session?.cartId || "",
    customer: {
      email: String(req.body.email).trim(),
      firstName: String(req.body.firstName).trim(),
      lastName: String(req.body.lastName).trim(),
      phone: String(req.body.phone).trim(),
    },
    delivery: {
      country: "United Kingdom",
      address: isClickCollect ? settings.clickCollectAddress : String(req.body.address).trim(),
      city: isClickCollect ? settings.clickCollectCity : String(req.body.city).trim(),
      postcode: isClickCollect ? settings.clickCollectPostcode : String(req.body.postcode).trim(),
    },
    fulfilment: {
      method: fulfilmentMethod,
      deliveryService: isClickCollect ? "collection" : deliveryService,
      deliveryServiceLabel: getDeliveryServiceLabel(fulfilmentMethod, deliveryService),
      deliveryCutoff: deliveryService === "next_day" ? getNextDayDeliveryCutoff() : "",
      collectionBranch: isClickCollect ? settings.clickCollectBranch : "",
      collectionAddress: isClickCollect ? settings.clickCollectAddress : "",
    },
    items: orderItems,
    subtotal,
    shipping,
    discount: {
      code: discountResult.discount ? discountResult.code : "",
      type: discountResult.discount ? discountResult.discount.type : "",
      value: discountResult.discount ? discountResult.discount.value : 0,
      amount: discountAmount,
    },
    total,
    paymentStatus: "pending",
    orderStatus: "new",
  });
}

router.get("/", async (req, res, next) => {
  try {
    const cart = await getCart(req);

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    const settings = await getCheckoutStoreSettings();
    const { subtotal, shipping, discountAmount, total, discountResult, freeShippingThreshold, standardShippingFee, nextDayShippingFee, nextDayDeliveryCutoff } =
      await calculateCheckoutTotals(req, cart, "delivery");

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
      checkoutSettings: settings,
      freeShippingThreshold,
      standardShippingFee,
      nextDayShippingFee,
      nextDayDeliveryCutoff,
      sumupPublicKey: process.env.SUMUP_PUBLIC_KEY || "",
      googlePayMerchantId: process.env.GOOGLE_PAY_MERCHANT_ID || "",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/apply-discount", async (req, res, next) => {
  const wantsJson = (req.get("Accept") || "").includes("application/json");

  try {
    const cart = await getCart(req);

    if (!cart || !cart.items || cart.items.length === 0) {
      if (wantsJson) return res.status(409).json({ success: false, message: "Your cart is empty." });
      return res.redirect("/cart");
    }

    const code = String(req.body.discountCode || "").trim().toUpperCase();

    if (!code) {
      if (wantsJson) return res.status(400).json({ success: false, message: "Please enter a discount code." });
      req.flash("error", "Please enter a discount code.");
      return res.redirect("/checkout");
    }

    const discountResult = await calculateDiscountForCart(cart, code);

    if (!discountResult.ok) {
      req.session.checkoutDiscountCode = "";
      if (wantsJson) return res.json({ success: false, message: discountResult.message });
      req.flash("error", discountResult.message);
      return res.redirect("/checkout");
    }

    req.session.checkoutDiscountCode = code;

    if (wantsJson) {
      return res.json({
        success: true,
        message: `Discount code ${code} applied.`,
        appliedDiscountCode: code,
        discountAmount: discountResult.discountAmount,
      });
    }

    req.flash("success", `Discount code ${code} applied.`);
    res.redirect("/checkout");
  } catch (error) {
    if (wantsJson) {
      return res.status(500).json({ success: false, message: "Something went wrong applying the discount code." });
    }
    next(error);
  }
});

router.post("/remove-discount", (req, res) => {
  req.session.checkoutDiscountCode = "";

  if ((req.get("Accept") || "").includes("application/json")) {
    return res.json({ success: true, message: "Discount code removed." });
  }

  req.flash("success", "Discount code removed.");
  res.redirect("/checkout");
});

router.post("/express/quote", async (req, res) => {
  try {
    const countryCode = String(req.body.countryCode || "GB").toUpperCase();

    if (!["GB", "GBR"].includes(countryCode)) {
      throw new CheckoutError("Express delivery is currently available only in the United Kingdom.");
    }

    const quote = await createExpressQuote(
      req,
      req.body.deliveryService || "standard",
      req.body.productId || "",
      req.body.quantity || 1
    );
    return res.json(quote.response);
  } catch (error) {
    console.log("Express checkout quote error:", error.message);
    return res.status(error.status || 500).json({
      success: false,
      message:
        error instanceof CheckoutError
          ? error.message
          : "The cart total could not be calculated. Please continue to checkout.",
    });
  }
});

router.post("/express/create-order", async (req, res) => {
  let order;

  try {
    if (!process.env.SUMUP_PUBLIC_KEY) {
      throw new CheckoutError("Express checkout is not configured.", 503);
    }

    const customer = req.body.customer || {};
    const delivery = req.body.delivery || {};
    const countryCode = String(delivery.countryCode || "").toUpperCase();

    requireCheckoutField(customer.email, "Your wallet did not provide an email address.");
    requireCheckoutField(customer.firstName, "Your wallet did not provide a first name.");
    requireCheckoutField(customer.lastName, "Your wallet did not provide a last name.");
    requireCheckoutField(customer.phone, "Your wallet did not provide a telephone number.");
    requireCheckoutField(delivery.address, "Your wallet did not provide a delivery address.");
    requireCheckoutField(delivery.city, "Your wallet did not provide a delivery city.");
    requireCheckoutField(delivery.postcode, "Your wallet did not provide a delivery postcode.");

    if (!["GB", "GBR"].includes(countryCode)) {
      throw new CheckoutError("Express delivery is currently available only in the United Kingdom.");
    }

    const productId = String(req.body.productId || "").trim();
    const quote = await createExpressQuote(
      req,
      req.body.deliveryService || "standard",
      productId,
      req.body.quantity || 1
    );
    const { cart, totals, deliveryService } = quote;
    const attemptId = String(req.body.attemptId || "").trim();

    if (!/^[a-zA-Z0-9-]{16,80}$/.test(attemptId)) {
      throw new CheckoutError("The express checkout attempt was invalid.");
    }

    const existingOrder = await Order.findOne({
      "sumup.expressAttemptId": attemptId,
      paymentStatus: "pending",
    });

    if (existingOrder?.sumup?.checkoutId) {
      return res.json({
        success: true,
        checkoutId: existingOrder.sumup.checkoutId,
        orderId: existingOrder._id.toString(),
        returnUrl: `/checkout/sumup/return/${existingOrder._id}`,
      });
    }

    const orderItems = cart.items.map((item) => ({
      product: item.product._id,
      name: item.product.name,
      brand: item.product.brand,
      image: item.product.images?.[0] || "",
      quantity: item.quantity,
      price: item.priceAtTime,
    }));

    order = await Order.create({
      user: getUserId(req),
      sessionId: req.session?.cartId || "",
      customer: {
        email: String(customer.email).trim(),
        firstName: String(customer.firstName).trim(),
        lastName: String(customer.lastName).trim(),
        phone: String(customer.phone).trim(),
      },
      delivery: {
        country: "United Kingdom",
        address: String(delivery.address).trim(),
        city: String(delivery.city).trim(),
        postcode: String(delivery.postcode).trim(),
      },
      fulfilment: {
        method: "delivery",
        deliveryService,
        deliveryServiceLabel: getDeliveryServiceLabel("delivery", deliveryService),
        deliveryCutoff: deliveryService === "next_day" ? getNextDayDeliveryCutoff() : "",
      },
      items: orderItems,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      discount: {
        code: totals.discountResult.discount ? totals.discountResult.code : "",
        type: totals.discountResult.discount ? totals.discountResult.discount.type : "",
        value: totals.discountResult.discount ? totals.discountResult.discount.value : 0,
        amount: totals.discountAmount,
      },
      total: totals.total,
      paymentStatus: "pending",
      orderStatus: "new",
      sumup: {
        expressAttemptId: attemptId,
        clearCartOnPayment: !productId,
        fulfilmentFinalised: false,
      },
    });

    const sumupResult = await createExpressCheckout(order, req);
    const checkout = sumupResult.data;

    order.sumup = {
      ...order.sumup,
      checkoutId: checkout.id || "",
      checkoutReference: sumupResult.checkoutReference,
      checkoutUrl: "",
      status: checkout.status || "PENDING",
      error: "",
    };
    await order.save();

    return res.status(201).json({
      success: true,
      checkoutId: checkout.id,
      orderId: order._id.toString(),
      returnUrl: `/checkout/sumup/return/${order._id}`,
    });
  } catch (error) {
    if (order && !order.sumup?.checkoutId) {
      order.paymentStatus = "failed";
      order.sumup = {
        ...order.sumup,
        status: "failed",
        error: error.message,
      };
      await order.save();
    }

    console.log("Express order error:", error.message);
    return res.status(error.status || 502).json({
      success: false,
      message:
        error instanceof CheckoutError
          ? `${error.message} Please continue to checkout.`
          : "Express payment could not be started. Please continue to checkout.",
    });
  }
});

router.post("/place-order", async (req, res, next) => {
  const isWallet = req.body.paymentFlow === "wallet";
  let order;

  try {
    if (isWallet && !process.env.SUMUP_PUBLIC_KEY) {
      throw new CheckoutError("Express checkout is not configured. Please pay securely by card.", 503);
    }

    order = await prepareOrder(req);
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

    if (isWallet) {
      return res.status(201).json({
        success: true,
        checkoutId: checkout.id,
        orderId: order._id.toString(),
        returnUrl: `/checkout/sumup/return/${order._id}`,
      });
    }

    return res.redirect(checkout.hosted_checkout_url);
  } catch (error) {
    if (order && !order.sumup?.checkoutId) {
      order.paymentStatus = "failed";
      order.sumup = {
        ...order.sumup,
        status: "failed",
        error: error.message,
        fulfilmentFinalised: false,
      };
      await order.save();
    }

    console.log("SumUp checkout error:", error.message);

    if (isWallet) {
      return res.status(error.status || 502).json({
        success: false,
        message: error instanceof CheckoutError
          ? error.message
          : "Payment could not be started. Please try again.",
      });
    }

    if (error instanceof CheckoutError) {
      req.flash("error", error.message);
      return res.redirect(error.redirectTo);
    }

    req.flash("error", "Payment could not be started. Please try again.");
    return res.redirect("/checkout");
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
