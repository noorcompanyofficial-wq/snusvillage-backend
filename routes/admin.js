const fs = require("fs");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Product = require("../models/Products");
const User = require("../models/User");
const Order = require("../models/order");
const WholesaleApplication = require("../models/WholesaleApplication");
const Trader = require("../models/Trader");
const Contact = require("../models/contact");
const isAdmin = require("../middleware/isAdmin");
const upload = require("../middleware/upload");
const wholesaleApplicationStore = require("../utils/wholesaleApplicationStore");
const transporter = require("../config/mailer");

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function orderItemsText(order) {
  return (order.items || [])
    .map((item) => `${item.quantity} x ${item.name} (£${Number(item.price || 0).toFixed(2)})`)
    .join(" | ");
}

async function getAdminStats() {
  if (mongoose.connection.readyState !== 1) {
    const applications = await wholesaleApplicationStore.findAll();
    return {
      totalProducts: 0,
      inStock: 0,
      lowStock: 0,
      totalUsers: 0,
      approvedTraders: 0,
      pendingWholesale: applications.filter((app) => app.status === "pending").length,
      unreadMessages: 0,
    };
  }

  const [
    totalProducts,
    inStock,
    lowStock,
    totalUsers,
    approvedTraders,
    pendingWholesale,
    unreadMessages,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ stock: { $gt: 0 } }),
    Product.countDocuments({ stock: { $gt: 0, $lte: 5 } }),
    User.countDocuments(),
    Trader.countDocuments({ status: "approved" }),
    WholesaleApplication.countDocuments({ status: "pending" }),
    Contact.countDocuments({ isRead: false }),
  ]);

  return {
    totalProducts,
    inStock,
    lowStock,
    totalUsers,
    approvedTraders,
    pendingWholesale,
    unreadMessages,
  };
}

router.get("/", isAdmin, (req, res) => {
  res.redirect("/admin/dashboard");
});

router.get("/dashboard", isAdmin, async (req, res) => {
  const stats = await getAdminStats();
  const recentProducts =
    mongoose.connection.readyState === 1
      ? await Product.find().sort({ createdAt: -1 }).limit(5).lean()
      : [];

  res.render("admin/dashboard", {
    layout: "layouts/admin-layout",
    stats,
    recentProducts,
  });
});

router.get("/orders/export/csv", isAdmin, async (req, res) => {
  try {
    const orders =
      mongoose.connection.readyState === 1 ? await Order.find().sort({ createdAt: -1 }).lean() : [];

    const headers = [
      "Order ID",
      "Short Order ID",
      "Date",
      "Payment Status",
      "Order Status",
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Address",
      "City",
      "Postcode",
      "Country",
      "Items",
      "Subtotal",
      "Shipping",
      "Total",
      "Tracking Number",
      "Royal Mail Reference",
    ];

    const rows = orders.map((order) => [
      order._id,
      order._id.toString().slice(-6).toUpperCase(),
      order.createdAt ? new Date(order.createdAt).toLocaleString("en-GB") : "",
      order.paymentStatus || "",
      order.orderStatus || "",
      order.customer?.firstName || "",
      order.customer?.lastName || "",
      order.customer?.email || "",
      order.customer?.phone || "",
      order.delivery?.address || "",
      order.delivery?.city || "",
      order.delivery?.postcode || "",
      order.delivery?.country || "United Kingdom",
      orderItemsText(order),
      Number(order.subtotal || 0).toFixed(2),
      Number(order.shipping || 0).toFixed(2),
      Number(order.total || 0).toFixed(2),
      order.royalMail?.trackingNumber || "",
      order.royalMail?.orderReference || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=snus-village-orders.csv");
    res.send(csv);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to export orders");
    res.redirect("/admin/orders");
  }
});

router.get("/orders", isAdmin, async (req, res) => {
  try {
    const orders =
      mongoose.connection.readyState === 1 ? await Order.find().sort({ createdAt: -1 }).lean() : [];

    res.render("admin/orders", {
      layout: "layouts/admin-layout",
      orders,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load orders");
    res.redirect("/admin/dashboard");
  }
});

router.post("/orders/:id/status", isAdmin, async (req, res) => {
  try {
    const { orderStatus, paymentStatus } = req.body;

    const allowedOrderStatuses = ["new", "processing", "packed", "shipped", "completed", "cancelled"];
    const allowedPaymentStatuses = ["pending", "paid", "failed"];

    const update = {};

    if (allowedOrderStatuses.includes(orderStatus)) {
      update.orderStatus = orderStatus;
    }

    if (allowedPaymentStatuses.includes(paymentStatus)) {
      update.paymentStatus = paymentStatus;
    }

    await Order.findByIdAndUpdate(req.params.id, update);

    res.redirect("/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to update order status");
    res.redirect("/admin/orders");
  }
});

router.get("/users", isAdmin, async (req, res) => {
  try {
    const [users, traders] =
      mongoose.connection.readyState === 1
        ? await Promise.all([
            User.find().sort({ createdAt: -1 }).limit(50).lean(),
            Trader.find().sort({ updatedAt: -1 }).limit(50).lean(),
          ])
        : [[], []];

    res.render("admin/users", {
      layout: "layouts/admin-layout",
      users,
      traders,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load users");
    res.redirect("/admin/dashboard");
  }
});

router.get("/security", isAdmin, async (req, res) => {
  try {
    const users =
      mongoose.connection.readyState === 1
        ? await User.find({
            $or: [
              { loginAttempts: { $gt: 0 } },
              { lockUntil: { $ne: null } },
              { "suspiciousIPs.0": { $exists: true } },
              { "blockedIPs.0": { $exists: true } },
            ],
          })
            .sort({ updatedAt: -1 })
            .limit(50)
            .lean()
        : [];

    res.render("admin/security", {
      layout: "layouts/admin-layout",
      users,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load security data");
    res.redirect("/admin/dashboard");
  }
});

router.get("/email-test", isAdmin, (req, res) => {
  const mailConfig = transporter.snusMailConfig || {};

  res.render("admin/email-test", {
    layout: "layouts/admin-layout",
    mailConfig: {
      emailUser: mailConfig.emailUser || "",
      hasEmailUser: Boolean(mailConfig.hasEmailUser),
      hasEmailPass: Boolean(mailConfig.hasEmailPass),
      timeout: Number(process.env.EMAIL_TIMEOUT_MS || 5000),
    },
    result: req.flash("emailTestResult")[0] || null,
  });
});

router.post("/email-test", isAdmin, async (req, res) => {
  const to = String(req.body.to || "").trim();
  const mailConfig = transporter.snusMailConfig || {};
  const fromEmail = mailConfig.emailUser || process.env.EMAIL_USER;

  if (!to || !to.includes("@")) {
    req.flash("error", "Enter a valid test email address.");
    return res.redirect("/admin/email-test");
  }

  if (!mailConfig.hasEmailUser || !mailConfig.hasEmailPass) {
    req.flash(
      "emailTestResult",
      JSON.stringify({
        ok: false,
        message: "Email username or password is missing on this server.",
        hasEmailUser: Boolean(mailConfig.hasEmailUser),
        hasEmailPass: Boolean(mailConfig.hasEmailPass),
      })
    );
    return res.redirect("/admin/email-test");
  }

  try {
    const info = await transporter.sendMail({
      from: `"Snus Village" <${fromEmail}>`,
      replyTo: process.env.EMAIL_REPLY_TO || fromEmail,
      to,
      subject: "Snus Village email test",
      text: "This is a test email from the Snus Village Render server.",
    });

    req.flash(
      "emailTestResult",
      JSON.stringify({
        ok: true,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      })
    );
  } catch (err) {
    console.log("Admin email test failed:", err.message);
    req.flash(
      "emailTestResult",
      JSON.stringify({
        ok: false,
        code: err.code || err.name,
        message: err.message,
        command: err.command,
        responseCode: err.responseCode,
      })
    );
  }

  res.redirect("/admin/email-test");
});

router.get("/wholesale", isAdmin, async (req, res) => {
  try {
    const applications =
      mongoose.connection.readyState === 1
        ? await WholesaleApplication.find().sort({ createdAt: -1 }).lean()
        : await wholesaleApplicationStore.findAll();

    res.render("admin/wholesale-applications", {
      layout: "layouts/admin-layout",
      applications,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load wholesale applications");
    res.redirect("/admin/dashboard");
  }
});

router.post("/wholesale/:id/approve", isAdmin, async (req, res) => {
  try {
    const application =
      mongoose.connection.readyState === 1
        ? await WholesaleApplication.findById(req.params.id)
        : await wholesaleApplicationStore.updateStatus(
            req.params.id,
            "approved",
            req.session.user._id
          );

    if (!application) {
      req.flash("error", "Wholesale application not found");
      return res.redirect("/admin/wholesale");
    }

    if (mongoose.connection.readyState === 1) {
      application.status = "approved";
      application.reviewedAt = new Date();
      application.reviewedBy = req.session.user._id;
      await application.save();

      await Trader.findOneAndUpdate(
        { email: application.email },
        {
          businessName: application.businessName,
          contactName: application.contactName,
          email: application.email,
          phone: application.phone,
          status: "approved",
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    req.flash("success", "Trader approved. They can now create their wholesale login.");
    res.redirect("/admin/wholesale");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to approve trader");
    res.redirect("/admin/wholesale");
  }
});

router.post("/wholesale/:id/reject", isAdmin, async (req, res) => {
  try {
    const application =
      mongoose.connection.readyState === 1
        ? await WholesaleApplication.findById(req.params.id)
        : await wholesaleApplicationStore.updateStatus(
            req.params.id,
            "rejected",
            req.session.user._id
          );

    if (!application) {
      req.flash("error", "Wholesale application not found");
      return res.redirect("/admin/wholesale");
    }

    if (mongoose.connection.readyState === 1) {
      application.status = "rejected";
      application.reviewedAt = new Date();
      application.reviewedBy = req.session.user._id;
      await application.save();

      await User.findOneAndUpdate({ email: application.email }, { traderStatus: "rejected" });

      await Trader.findOneAndUpdate({ email: application.email }, { status: "suspended" });
    }

    req.flash("success", "Trader application rejected");
    res.redirect("/admin/wholesale");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to reject trader");
    res.redirect("/admin/wholesale");
  }
});

//  Add Product Page
router.get("/products/add", isAdmin, (req, res) => {
  res.render("admin/add-product", {
    layout: "layouts/admin-layout",
  });
});

// Get All products
router.get("/products", isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;

    // ===== FILTERS =====
    let filter = {};

    // BRAND FILTER (SUPER FIXED)
    if (req.query.brand && req.query.brand !== "") {
      const cleanBrand = req.query.brand.toLowerCase().replace(/\s+/g, "");

      filter.$expr = {
        $regexMatch: {
          input: {
            $replaceAll: {
              input: { $toLower: "$brand" },
              find: " ",
              replacement: "",
            },
          },
          regex: cleanBrand,
        },
      };
    }

    if (req.query.strength && req.query.strength !== "") {
      filter.strength = req.query.strength;
    }

    if (req.query.stock === "in") {
      filter.stock = { $gt: 0 };
    }

    if (req.query.stock === "out") {
      filter.stock = 0;
    }

    let sort = { createdAt: -1 };

    if (req.query.sort === "price-low") sort = { price: 1 };
    if (req.query.sort === "price-high") sort = { price: -1 };
    if (req.query.sort === "name") sort = { name: 1 };

    // ===== QUERY =====
    const products = await Product.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Product.countDocuments(filter);

    // ===== STATS =====
    const totalProducts = await Product.countDocuments();
    const inStock = await Product.countDocuments({ stock: { $gt: 0 } });
    const outStock = await Product.countDocuments({ stock: 0 });

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        products,
        hasMore: page * limit < total,
      });
    }

    res.render("admin/products", {
      layout: "layouts/admin-layout",
      products,
      hasMore: page * limit < total,
      nextPage: page + 1,

      totalProducts,
      inStock,
      outStock,

      query: req.query,
    });
  } catch (err) {
    console.log(err);
    res.send("Error loading products");
  }
});

//  Create Product

router.post("/products/add", isAdmin, upload.array("images", 5), async (req, res) => {
  try {
    const {
      name,
      price,
      discountPrice,
      description,
      strength,
      nicotine,
      brand,
      flavour,
      category,
      stock,
    } = req.body;

    const parsedPrice = parseFloat(price);
    const parsedDiscount = discountPrice ? parseFloat(discountPrice) : 0;

    const slug = name
      .toLowerCase()
      .replace(/ /g, "-")
      .replace(/[^\w-]+/g, "");

    const images = req.files.map((file) => "/uploads/" + file.filename);

    await Product.create({
      name,
      slug,
      price: parsedPrice,
      discountPrice: parsedDiscount,
      description,
      strength,
      nicotine,
      brand,
      flavour,
      category,
      stock,
      images,
    });

    req.flash("success", "Product added successfully!");
    res.redirect("/admin/products");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error creating product");
    res.redirect("/admin/products/add");
  }
});

// Delete Product
router.post("/products/delete/:id", isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);

    req.flash("success", "Product deleted!");
    res.redirect("/admin/products");
  } catch (err) {
    req.flash("error", "Delete failed");
    res.redirect("/admin/products");
  }
});

/* Edit Product */
router.get("/products/edit/:id", isAdmin, async (req, res) => {
  const product = await Product.findById(req.params.id);

  res.render("admin/edit-product", {
    layout: "layouts/admin-layout",
    product,
  });
});

router.post("/products/edit/:id", isAdmin, upload.array("images", 5), async (req, res) => {
  try {
    const { name, price, discountPrice, description, strength, nicotine, category, stock } =
      req.body;

    const product = await Product.findById(req.params.id);

    const updatedData = {
      name,
      price: parseFloat(price),
      discountPrice: discountPrice ? parseFloat(discountPrice) : 0,
      description,
      strength,
      nicotine,
      category,
      stock,
    };

    let images = product.images || [];

    if (req.body.removeImages) {
      const removeList = Array.isArray(req.body.removeImages)
        ? req.body.removeImages
        : [req.body.removeImages];

      images = images.filter((img) => !removeList.includes(img));
    }

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file) => "/uploads/" + file.filename);

      images = [...images, ...newImages];
    }

    updatedData.images = images;

    await Product.findByIdAndUpdate(req.params.id, updatedData);

    req.flash("success", "Product updated!");
    res.redirect("/admin/products");
  } catch (err) {
    console.log(err);
    req.flash("error", "Update failed");
    res.redirect("/admin/products");
  }
});


router.post("/orders/:id/send-royal-mail", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/admin/orders");
    }

    if (order.royalMail && order.royalMail.syncStatus === "sent") {
      req.flash("error", "This order has already been sent to Royal Mail");
      return res.redirect("/admin/orders");
    }

    const { sendOrderToRoyalMail } = require("../utils/royalMail");
    const royalMailResult = await sendOrderToRoyalMail(order);

    if (royalMailResult.ok) {
      const createdOrder =
        royalMailResult.data?.createdOrders?.[0] ||
        royalMailResult.data?.orders?.[0] ||
        null;

      if (createdOrder?.orderIdentifier) {
        order.royalMail = {
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
          synced: false,
          orderIdentifier: "",
          orderReference: "",
          trackingNumber: "",
          syncStatus: "failed",
          syncError: "Royal Mail did not return an order identifier.",
          syncedAt: null,
        };
      }
    } else {
      order.royalMail = {
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

    res.redirect("/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to send order to Royal Mail");
    res.redirect("/admin/orders");
  }
});



router.post("/orders/:id/generate-label", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/admin/orders");
    }

    if (!order.royalMail || order.royalMail.syncStatus !== "sent") {
      req.flash("error", "Order must be sent to Royal Mail before generating a label");
      return res.redirect("/admin/orders");
    }

    if (!order.royalMail.orderIdentifier) {
      req.flash("error", "Royal Mail order identifier is missing");
      return res.redirect("/admin/orders");
    }

    const { getRoyalMailLabel } = require("../utils/royalMail");
    const labelResult = await getRoyalMailLabel(order.royalMail.orderIdentifier);

    if (!labelResult.ok) {
      order.royalMail.labelGenerated = false;
      order.royalMail.labelError = labelResult.message || "Unable to generate Royal Mail label";
      await order.save();

      req.flash("error", order.royalMail.labelError);
      return res.redirect("/admin/orders");
    }

    const labelsDir = path.join(__dirname, "..", "private", "labels");

    if (!fs.existsSync(labelsDir)) {
      fs.mkdirSync(labelsDir, { recursive: true });
    }

    const fileName = `royal-mail-label-${order._id}.pdf`;
    const filePath = path.join(labelsDir, fileName);

    fs.writeFileSync(filePath, labelResult.buffer);

    order.royalMail.labelGenerated = true;
    order.royalMail.labelPath = filePath;
    order.royalMail.labelGeneratedAt = new Date();
    order.royalMail.labelError = "";

    await order.save();

    res.redirect("/admin/orders");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to generate Royal Mail label");
    res.redirect("/admin/orders");
  }
});

router.get("/orders/:id/download-label", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order || !order.royalMail || !order.royalMail.labelPath) {
      req.flash("error", "Label not found");
      return res.redirect("/admin/orders");
    }

    if (!fs.existsSync(order.royalMail.labelPath)) {
      req.flash("error", "Label file is missing");
      return res.redirect("/admin/orders");
    }

    res.download(order.royalMail.labelPath, `royal-mail-label-${order._id}.pdf`);
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to download label");
    res.redirect("/admin/orders");
  }
});



router.get("/orders/:id", isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/admin/orders");
    }

    res.render("admin/order-detail", {
      layout: "layouts/admin-layout",
      order,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to load order");
    res.redirect("/admin/orders");
  }
});


module.exports = router;
