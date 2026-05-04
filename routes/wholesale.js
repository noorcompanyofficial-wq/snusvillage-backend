const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const router = express.Router();
const Trader = require("../models/Trader");
const WholesaleApplication = require("../models/WholesaleApplication");
const wholesaleApplicationStore = require("../utils/wholesaleApplicationStore");

router.get("/", async (req, res) => {
  let trader = req.session.trader || null;

  if (trader?._id && mongoose.connection.readyState === 1) {
    const freshTrader = await Trader.findById(trader._id);

    if (freshTrader && freshTrader.status === "approved") {
      req.session.trader = freshTrader;
      trader = freshTrader;
    } else {
      req.session.trader = null;
      trader = null;
    }
  }

  res.render("wholesale/wholesale", {
    title: "Wholesale - SNUS VILLAGE",
    trader,
    isApprovedTrader: Boolean(trader),
  });
});

router.get("/register", (req, res) => {
  res.render("wholesale/register", {
    title: "Create Trader Login - SNUS VILLAGE",
  });
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
      req.flash("error", "Please complete all fields.");
      return res.redirect("/wholesale/register");
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (password !== confirmPassword) {
      req.flash("error", "Passwords do not match.");
      return res.redirect("/wholesale/register");
    }

    if (mongoose.connection.readyState !== 1) {
      req.flash("error", "Trader login requires MongoDB to be connected.");
      return res.redirect("/wholesale/register");
    }

    let trader = await Trader.findOne({ email: normalizedEmail });

    if (!trader) {
      const approvedApplication = await WholesaleApplication.findOne({
        email: normalizedEmail,
        status: "approved",
      });

      if (approvedApplication) {
        trader = await Trader.create({
          businessName: approvedApplication.businessName,
          contactName: approvedApplication.contactName,
          email: approvedApplication.email,
          phone: approvedApplication.phone,
          status: "approved",
        });
      }
    }

    if (!trader || trader.status !== "approved") {
      req.flash("error", "This email has not been approved for wholesale.");
      return res.redirect("/wholesale/register");
    }

    trader.password = await bcrypt.hash(password, 10);
    await trader.save();

    req.flash("success", "Trader login created. You can now log in.");
    res.redirect("/wholesale/login");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to create trader login.");
    res.redirect("/wholesale/register");
  }
});

router.get("/login", (req, res) => {
  res.render("wholesale/login", {
    title: "Trader Login - SNUS VILLAGE",
  });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      req.flash("error", "Please enter your trader email and password.");
      return res.redirect("/wholesale/login");
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (mongoose.connection.readyState !== 1) {
      req.flash("error", "Trader login requires MongoDB to be connected.");
      return res.redirect("/wholesale/login");
    }

    const trader = await Trader.findOne({ email: normalizedEmail });

    if (!trader || trader.status !== "approved" || !trader.password) {
      req.flash("error", "Trader login not found or not set up.");
      return res.redirect("/wholesale/login");
    }

    const passwordMatches = await bcrypt.compare(password, trader.password);

    if (!passwordMatches) {
      req.flash("error", "Wrong trader credentials.");
      return res.redirect("/wholesale/login");
    }

    trader.lastLoginAt = new Date();
    trader.lastLoginIp = req.headers["x-forwarded-for"] || req.ip;
    await trader.save();

    req.session.trader = trader;
    res.redirect("/wholesale");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to log in as trader.");
    res.redirect("/wholesale/login");
  }
});

router.get("/logout", (req, res) => {
  req.session.trader = null;
  res.redirect("/wholesale");
});

router.post("/apply", async (req, res) => {
  try {
    const {
      businessName,
      contactName,
      email,
      phone,
      companyNumber,
      businessType,
      website,
      message,
    } = req.body;

    if (!businessName || !contactName || !email || !phone || !businessType || !message) {
      req.flash("error", "Please complete all required wholesale fields.");
      return res.redirect("/wholesale");
    }

    const normalizedEmail = email.toLowerCase().trim();

    const applicationData = {
      businessName,
      contactName,
      email: normalizedEmail,
      phone,
      companyNumber,
      businessType,
      website,
      message,
      status: "pending",
    };

    if (mongoose.connection.readyState === 1) {
      await WholesaleApplication.findOneAndUpdate(
        { email: normalizedEmail, status: "pending" },
        applicationData,
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
      );

    } else {
      await wholesaleApplicationStore.upsertPending(applicationData);
    }

    req.flash(
      "success",
      "Wholesale enquiry submitted. We will review your trader details before access is approved.",
    );
    res.redirect("/wholesale");
  } catch (err) {
    console.log(err);
    req.flash("error", "Unable to submit wholesale enquiry right now.");
    res.redirect("/wholesale");
  }
});

module.exports = router;
