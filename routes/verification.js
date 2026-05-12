const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/User");
const DiditWebhookEvent = require("../models/DiditWebhookEvent");
const { isAuth } = require("../middleware/authMiddleware");
const { createVerificationSession, verifyWebhookSignature } = require("../utils/didit");

const router = express.Router();

function wantsJson(req) {
  return req.xhr || req.get("accept")?.includes("application/json");
}

function normaliseStatus(status) {
  const allowed = new Set([
    "Not Started",
    "In Progress",
    "Awaiting User",
    "In Review",
    "Approved",
    "Declined",
    "Resubmitted",
    "Abandoned",
    "Expired",
    "Kyc Expired",
  ]);

  return allowed.has(status) ? status : "In Review";
}

async function applyDiditDecision(event) {
  if (!event.vendor_data) return null;

  const update = {
    diditSessionId: event.session_id,
    diditStatus: normaliseStatus(event.status),
    "didit.sessionId": event.session_id,
    "didit.workflowId": event.workflow_id,
    "didit.status": normaliseStatus(event.status),
    "didit.lastWebhookAt": new Date(),
    "didit.metadata": event.metadata || {},
  };

  if (event.decision) {
    update["didit.decision"] = event.decision;
  }

  switch (event.status) {
    case "Approved":
      update.isAgeVerified = true;
      update.ageVerifiedAt = new Date();
      update["didit.verified"] = true;
      update["didit.verifiedAt"] = new Date();
      update["didit.declinedAt"] = null;
      break;
    case "Declined":
      update.isAgeVerified = false;
      update["didit.verified"] = false;
      update["didit.declinedAt"] = new Date();
      break;
    case "Kyc Expired":
      update.isAgeVerified = false;
      update.ageVerifiedAt = null;
      update["didit.verified"] = false;
      update["didit.verifiedAt"] = null;
      break;
    default:
      break;
  }

  if (!mongoose.Types.ObjectId.isValid(event.vendor_data)) {
    return null;
  }

  return User.findByIdAndUpdate(event.vendor_data, { $set: update }, { new: true });
}

router.post("/session", isAuth, async (req, res, next) => {
  try {
    if (req.body.consent !== "yes") {
      const message = "Please confirm your consent before starting identity verification.";

      if (wantsJson(req)) {
        return res.status(400).json({ error: message });
      }

      req.flash("error", message);
      return res.redirect("/auth/dashboard");
    }

    const user = await User.findById(req.session.user._id);

    if (!user) {
      req.flash("error", "Please log in again before starting verification.");
      return res.redirect("/auth/login");
    }

    const session = await createVerificationSession(user, req, {
      callbackPath: "/auth/dashboard",
      metadata: {
        email: user.email,
        source: "snusvillage-web",
      },
    });

    user.set("didit.sessionId", session.session_id);
    user.set("didit.workflowId", session.workflow_id);
    user.set("didit.status", session.status || "Not Started");
    user.set("didit.verified", user.didit?.verified || false);

    await user.save();
    req.session.user = user;

    if (wantsJson(req)) {
      return res.status(201).json({
        session_id: session.session_id,
        url: session.url,
        status: session.status,
      });
    }

    return res.redirect(session.url);
  } catch (error) {
    if (wantsJson(req)) {
      return res.status(500).json({ error: error.message });
    }

    req.flash("error", "Verification could not be started. Please try again.");
    return res.redirect("/auth/dashboard");
  }
});

router.post("/webhooks/didit", async (req, res) => {
  try {
    const verification = verifyWebhookSignature({
      body: req.body,
      signature: req.get("x-signature-v2") || "",
      timestamp: req.get("x-timestamp"),
    });

    if (!verification.ok) {
      return res.status(401).send(verification.reason);
    }

    const event = req.body || {};

    try {
      await DiditWebhookEvent.create({
        sessionId: event.session_id,
        webhookType: event.webhook_type,
        timestamp: Number(event.timestamp),
        status: event.status,
        vendorData: event.vendor_data,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(200).send("ok");
      }

      throw error;
    }

    await applyDiditDecision(event);

    return res.status(200).send("ok");
  } catch (error) {
    console.log("Didit webhook error:", error.message);
    return res.status(200).send("ok");
  }
});

module.exports = router;
