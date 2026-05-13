const rateLimit = require("express-rate-limit");

//  AUTH (login/register)
exports.authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 min
  max: 5,
  handler: (req, res) => {
    req.flash("error", "Too many attempts. Please wait a minute and try again.");
    return res.redirect(req.originalUrl.includes("/register") ? "/auth/register" : "/auth/login");
  },
});

// Just For Contact
exports.contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many requests. Try again later.",
});
