const express = require("express");
const mongoose = require("mongoose");
const NewsletterSubscriber = require("../models/NewsletterSubscriber");
const transporter = require("../config/mailer");
const { newsletterLimiter } = require("../middleware/rateLimit");

const router = express.Router();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function redirectBack(req, status) {
  const fallback = `/?newsletter=${status}#newsletter`;
  const host = req.get("host");
  const referrer = req.get("referer");

  if (!referrer || !host) return fallback;

  try {
    const url = new URL(referrer, `${req.protocol}://${host}`);
    if (url.host !== host) return fallback;

    url.searchParams.set("newsletter", status);
    url.hash = "newsletter";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (error) {
    return fallback;
  }
}

async function sendWelcomeEmail(email) {
  const mailConfig = transporter.snusMailConfig || {};
  const fromEmail = mailConfig.emailFrom || mailConfig.emailUser || process.env.EMAIL_USER;

  if (!mailConfig.hasEmailUser || !mailConfig.hasEmailPass || !fromEmail) {
    return false;
  }

  await transporter.sendMail({
    from: `"Snus Village" <${fromEmail}>`,
    to: email,
    subject: "You are subscribed to Snus Village updates",
    html: `
      <div style="font-family: Arial, sans-serif; color: #0b1430; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">Welcome to Snus Village updates</h2>
        <p>Thanks for joining our newsletter for new stock, product drops and service updates.</p>
        <p>Products are intended for adults aged 18+ only. Age verification may be required at checkout.</p>
        <p style="margin-top: 20px;">Snus Village<br>89 Edgware Road, London, W2 2HX</p>
      </div>
    `,
  });

  return true;
}

router.post("/subscribe", newsletterLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const hasConsent = req.body.marketingConsent === "on" || req.body.marketingConsent === "true";

    if (!isValidEmail(email)) {
      return res.redirect(redirectBack(req, "invalid"));
    }

    if (!hasConsent) {
      return res.redirect(redirectBack(req, "consent"));
    }

    if (mongoose.connection.readyState !== 1) {
      return res.redirect(redirectBack(req, "error"));
    }

    const existing = await NewsletterSubscriber.findOne({ email }).lean();

    const subscriber = await NewsletterSubscriber.findOneAndUpdate(
      { email },
      {
        $set: {
          isActive: true,
          source: "footer",
          consentAt: new Date(),
          unsubscribedAt: null,
          ip: String(req.headers["x-forwarded-for"] || req.ip || ""),
          userAgent: String(req.headers["user-agent"] || ""),
        },
        $setOnInsert: {
          email,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (!existing || existing.isActive === false) {
      try {
        const sent = await sendWelcomeEmail(email);
        if (sent) {
          subscriber.lastWelcomeEmailAt = new Date();
          await subscriber.save();
        }
      } catch (emailError) {
        console.log("Newsletter welcome email failed:", emailError.message);
      }
    }

    return res.redirect(redirectBack(req, existing?.isActive ? "already" : "joined"));
  } catch (error) {
    console.log("Newsletter signup failed:", error.message);
    return res.redirect(redirectBack(req, "error"));
  }
});

module.exports = router;
