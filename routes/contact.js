const express = require("express");
const router = express.Router();
const Contact = require("../models/contact");
const Joi = require("joi");
const axios = require("axios");

const { contactLimiter } = require("../middleware/rateLimit");
const { sendEmail } = require("../utils/mailer");

// validation
const schema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  phone: Joi.string().allow(""),
  subject: Joi.string().required(),
  message: Joi.string().required(),
  token: Joi.string().required(),
});

// GET
router.get("/", (req, res) => {
  res.render("contact/contact", {
    layout: "layouts/contact-layout",
    query: req.query,
    siteKey: process.env.RECAPTCHA_SITE,
  });
});

// POST
router.post("/contact", contactLimiter, async (req, res) => {
  try {
    // validation
    const { error } = schema.validate(req.body);
    if (error) return res.redirect("/contact?error=validation");

    // recaptcha
    const verify = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET,
          response: req.body.token,
        },
      },
    );

    if (!verify.data.success) {
      return res.redirect("/contact?error=captcha");
    }

    // save DB
    const newMessage = await Contact.create(req.body);

    // send email
    await sendEmail(newMessage);

    res.redirect("/contact?success=1");
  } catch (err) {
    console.log(err);
    res.redirect("/contact?error=server");
  }
});

module.exports = router;
