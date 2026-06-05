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

exports.newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  handler: (req, res) => {
    const referrer = req.get("referer");
    const host = req.get("host");

    try {
      const url = new URL(referrer || "/", `${req.protocol}://${host}`);
      if (url.host === host) {
        url.searchParams.set("newsletter", "limited");
        url.hash = "newsletter";
        return res.redirect(`${url.pathname}${url.search}${url.hash}`);
      }
    } catch (error) {
      // Fall through to a safe local redirect.
    }

    return res.redirect("/?newsletter=limited#newsletter");
  },
});
