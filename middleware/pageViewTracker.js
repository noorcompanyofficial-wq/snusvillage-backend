const crypto = require("crypto");
const mongoose = require("mongoose");
const PageView = require("../models/PageView");

const ignoredPrefixes = [
  "/admin",
  "/api",
  "/didit",
  "/health",
  "/auth/logout",
];

const ignoredExtensions = /\.(css|js|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp4|webm|pdf|csv)$/i;
const botPattern = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|monitor/i;

function hashValue(value) {
  if (!value) return "";
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function shouldTrack(req) {
  if (req.method !== "GET") return false;
  if (ignoredExtensions.test(req.path)) return false;
  if (ignoredPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) return false;

  const userAgent = req.get("user-agent") || "";
  if (botPattern.test(userAgent)) return false;

  const acceptsHtml = req.accepts(["html", "json"]) === "html" || req.get("accept")?.includes("*/*");
  return Boolean(acceptsHtml);
}

function pageViewTracker(req, res, next) {
  if (!shouldTrack(req) || mongoose.connection.readyState !== 1) {
    return next();
  }

  let visitorId = req.cookies?.sv_visitor_id;

  if (!visitorId) {
    visitorId = crypto.randomUUID();
    res.cookie("sv_visitor_id", visitorId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });
  }

  PageView.create({
    path: req.path || "/",
    fullPath: req.originalUrl || req.path || "/",
    visitorId,
    sessionId: req.sessionID || "",
    user: req.session?.user?._id || null,
    referrer: req.get("referer") || "",
    userAgent: (req.get("user-agent") || "").slice(0, 500),
    ipHash: hashValue(req.ip || req.headers["x-forwarded-for"] || ""),
  }).catch((err) => {
    console.log("Page view analytics failed:", err.message);
  });

  return next();
}

module.exports = pageViewTracker;
