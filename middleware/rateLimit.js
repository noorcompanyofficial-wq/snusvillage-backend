const rateLimit = require("express-rate-limit");

//  AUTH (login/register)
exports.authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 min
  max: 5,
  message: "Too many login attempts. Try again later.",
});

// Just For Contact
exports.contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many requests. Try again later.",
});
