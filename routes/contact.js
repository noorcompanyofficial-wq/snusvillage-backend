const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("contact/contact", {
    layout: "layouts/contact-layout",
  });
});

module.exports = router;
