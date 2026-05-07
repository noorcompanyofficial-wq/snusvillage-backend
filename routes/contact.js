const express = require("express");
const router = express.Router();
const Contact = require("../models/contact");
const Joi = require("joi");
const axios = require("axios");
const mongoose = require("mongoose");

const { contactLimiter } = require("../middleware/rateLimit");
const { sendEmail } = require("../utils/mailer");

const captchaEnabled = () => Boolean(process.env.RECAPTCHA_SITE && process.env.RECAPTCHA_SECRET);

// validation
const schema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  phone: Joi.string().allow(""),
  subject: Joi.string().required(),
  message: Joi.string().required(),
  token: Joi.string().allow(""),
});

// GET
router.get("/", (req, res) => {
  res.render("contact/contact", {
    query: req.query,
    siteKey: process.env.RECAPTCHA_SITE || "",
    captchaEnabled: captchaEnabled(),
  });
});

// POST
router.post("/contact", contactLimiter, async (req, res) => {
  try {
    // validation
    const { error } = schema.validate(req.body);
    if (error) return res.redirect("/contact?error=validation");

    // recaptcha
    if (captchaEnabled()) {
      if (!req.body.token) {
        return res.redirect("/contact?error=captcha");
      }

      const verify = await axios.post("https://www.google.com/recaptcha/api/siteverify", null, {
        params: {
          secret: process.env.RECAPTCHA_SECRET,
          response: req.body.token,
        },
      });

      if (!verify.data.success) {
        return res.redirect("/contact?error=captcha");
      }
    }

    if (mongoose.connection.readyState !== 1) {
      return res.redirect("/contact?error=database");
    }

    // save DB
    const newMessage = await Contact.create(req.body);

    // send email
    try {
      await sendEmail(newMessage);
    } catch (mailError) {
      console.log("Contact email failed:", mailError.message);
    }

    res.redirect("/contact?success=1");
  } catch (err) {
    console.log(err);
    res.redirect("/contact?error=server");
  }
});

module.exports = router;
