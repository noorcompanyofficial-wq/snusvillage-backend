const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("about/about", {
    title: "About Snus Village | London Nicotine Pouch Specialist",
    description:
      "Learn about Snus Village, a London nicotine pouch specialist offering premium smokeless nicotine products for adult customers.",
    canonical: "https://www.snusvillage.com/about",
  });
});

module.exports = router;
