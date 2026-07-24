const crypto = require("crypto");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function ensureCsrfToken(req, res, next) {
  if (!req.session) return next();

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyCsrfToken(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const sessionToken = req.session?.csrfToken;
  const suppliedToken = (req.body && req.body._csrf) || req.get("x-csrf-token");

  if (!sessionToken || !suppliedToken || suppliedToken !== sessionToken) {
    return res.status(403).render("500", { title: "Session Expired" });
  }

  next();
}

module.exports = { ensureCsrfToken, verifyCsrfToken };
