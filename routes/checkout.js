const express = require("express");
const router = express.Router();

const Cart = require("../models/cart");
const Order = require("../models/order");
const Product = require("../models/Products");
const { sendOrderToRoyalMail } = require("../utils/royalMail");
const { sendOrderEmails } = require("../utils/orderEmails");
const { createHostedCheckout, getCheckoutStatus } = require("../utils/sumup");

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
  await syncOrderToRoyalMail(order);

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
      sessionId: req.session?.cartId || "",
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
