const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/User");
const { isAuth } = require("../middleware/authMiddleware");
const { createVerificationSession, verifyWebhookSignature } = require("../utils/didit");

const router = express.Router();

function getDiditRedirectUrl(session) {
  return session?.url || session?.verification_url || "";
}

function normaliseStatus(status) {
  return String(status || "").trim() || "not_started";
}

async function startDiditSession(req, res) {
  try {
    const user = await User.findById(req.session.user._id);

    if (!user) {
      req.flash("error", "Please log in again before starting verification.");
      return res.redirect("/auth/login");
    }

    if (user.isAgeVerified || user.didit?.verified) {
      return res.redirect("/checkout");
    }

    if (!process.env.DIDIT_API_KEY || !process.env.DIDIT_WORKFLOW_ID) {
      req.flash("error", "Age verification is not configured yet. Please contact support.");
      return res.redirect("/checkout");
    }

    req.session.returnToAfterVerification = "/checkout";

    const session = await createVerificationSession(user, req);
    const redirectUrl = getDiditRedirectUrl(session);

    if (!redirectUrl) {
      req.flash("error", "Age verification could not be started. Please try again.");
      return res.redirect("/checkout");
    }

    user.diditSessionId = session.session_id || null;
    user.diditStatus = normaliseStatus(session.status || "started");
    user.set("didit.sessionId", session.session_id || null);
    user.set("didit.workflowId", session.workflow_id || process.env.DIDIT_WORKFLOW_ID);
    user.set("didit.status", session.status || "In Progress");

    await user.save();
    req.session.user = user;

    return res.redirect(redirectUrl);
  } catch (error) {
    console.log("Didit start error:", error.message);
    req.flash("error", "Age verification could not be started. Please try again.");
    return res.redirect("/checkout");
  }
}

router.post("/start", isAuth, startDiditSession);
router.get("/checkout-start", isAuth, startDiditSession);

router.get("/complete", isAuth, (req, res) => {
  const redirectTo = req.session.returnToAfterVerification || "/checkout";
  delete req.session.returnToAfterVerification;
  return res.redirect(redirectTo);
});

router.post("/webhook", async (req, res) => {
  try {
    const verification = verifyWebhookSignature({
      body: req.body || {},
      rawBody: req.rawBody,
      signature: req.get("x-signature-v2") || req.get("x-didit-signature") || "",
      timestamp: req.get("x-timestamp"),
    });

    if (!verification.ok) {
      console.log("Didit webhook signature failed:", verification.reason);
      return res.status(401).send("invalid signature");
    }

    const event = req.body || {};
    const userId = event.vendor_data;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.log("Didit webhook ignored: invalid vendor_data");
      return res.status(200).send("ok");
    }

    const status = normaliseStatus(event.status);
    const update = {
      diditStatus: status,
      diditSessionId: event.session_id || null,
      "didit.sessionId": event.session_id || null,
      "didit.workflowId": event.workflow_id || process.env.DIDIT_WORKFLOW_ID,
      "didit.status": status,
      "didit.lastWebhookAt": new Date(),
      "didit.metadata": event.metadata || {},
    };

    if (event.decision) {
      update["didit.decision"] = event.decision;
    }

    if (status.toLowerCase() === "approved") {
      update.isAgeVerified = true;
      update.ageVerifiedAt = new Date();
      update["didit.verified"] = true;
      update["didit.verifiedAt"] = new Date();
      update["didit.declinedAt"] = null;
    }

    if (status.toLowerCase() === "declined") {
      update.isAgeVerified = false;
      update["didit.verified"] = false;
      update["didit.declinedAt"] = new Date();
    }

    await User.findByIdAndUpdate(userId, { $set: update });

    return res.status(200).send("ok");
  } catch (error) {
    console.log("Didit webhook error:", error.message);
    return res.status(200).send("ok");
  }
});

module.exports = router;
