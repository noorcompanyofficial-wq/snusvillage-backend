const express = require("express");
const router = express.Router();
const Contact = require("../models/contact");
const { Query } = require("mongoose");

router.get("/", (req, res) => {
  res.render("contact/contact", {
    layout: "layouts/contact-layout",
    query: req.query,
  });
});

router.post("/", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.send("All required fields must be filled");
    }

    await Contact.create({
      name,
      email,
      phone,
      subject,
      message,
    });

    res.redirect("/contact?success=1");
  } catch (err) {
    console.log(err);
    res.send("Something went wrong");
  }
});

module.exports = router;
