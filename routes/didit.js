const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");

const User = require("../models/User");
const {
  createVerificationSession,
  getVerificationDecision,
  verifyWebhookSignature,
} = require("../utils/didit");

const router = express.Router();

function getDiditRedirectUrl(session) {
  return session?.url || session?.verification_url || session?.session_url || "";
}

function normaliseStatus(status) {
  return String(status || "").trim() || "not_started";
}

function isApprovedStatus(status) {
  const cleaned = String(status || "").trim().toLowerCase();
  return cleaned === "approved";
}

function getUserId(req) {
  return req.session?.user?._id || req.user?._id || null;
}

function ensureGuestDiditId(req) {
  if (!req.session.diditGuestId) {
    const base = req.session.cartId || req.sessionID || crypto.randomUUID();
    req.session.diditGuestId = `guest:${base}:${crypto.randomBytes(8).toString("hex")}`;
  }

  return req.session.diditGuestId;
}

async function markLoggedInUserFromDecision(req, decision) {
  const userId = getUserId(req);
  if (!userId) return null;

  const status = normaliseStatus(decision.status);
  const update = {
    diditStatus: status,
    diditSessionId: decision.session_id || req.session.diditSessionId || null,
    "didit.sessionId": decision.session_id || req.session.diditSessionId || null,
    "didit.workflowId": decision.workflow_id || process.env.DIDIT_WORKFLOW_ID,
    "didit.status": status,
    "didit.lastWebhookAt": new Date(),
    "didit.metadata": decision.metadata || {},
  };

  if (decision.decision) {
    update["didit.decision"] = decision.decision;
  }

  if (isApprovedStatus(status)) {
    update.isAgeVerified = true;
    update.ageVerifiedAt = new Date();
    update["didit.verified"] = true;
    update["didit.verifiedAt"] = new Date();
    update["didit.declinedAt"] = null;
  }

  if (String(status).toLowerCase() === "declined") {
    update.isAgeVerified = false;
    update["didit.verified"] = false;
    update["didit.declinedAt"] = new Date();
  }

  const user = await User.findByIdAndUpdate(userId, { $set: update }, { returnDocument: "after" });
  if (user) req.session.user = user;
  return user;
}

async function startDiditSession(req, res) {
  try {
    if (req.session.diditVerified === true || req.session.isAgeVerified === true) {
      return res.redirect("/checkout");
    }

    if (!process.env.DIDIT_API_KEY || !process.env.DIDIT_WORKFLOW_ID) {
      req.flash("error", "Age verification is not configured yet. Please contact support.");
      return res.redirect("/checkout");
    }

    const userId = getUserId(req);
    let subject;
    let vendorData;

    if (userId) {
      const user = await User.findById(userId);

      if (!user) {
        req.flash("error", "Please log in again before starting verification.");
        return res.redirect("/auth/login");
      }

      if (user.isAgeVerified || user.didit?.verified) {
        req.session.diditVerified = true;
        req.session.isAgeVerified = true;
        return res.redirect("/checkout");
      }

      subject = user;
      vendorData = String(user._id);
    } else {
      vendorData = ensureGuestDiditId(req);
      subject = {
        vendorData,
        email: null,
      };
    }

    req.session.returnToAfterVerification = "/checkout";

    const session = await createVerificationSession(subject, req, {
      callbackPath: "/didit/complete",
      vendorData,
      metadata: {
        website: "Snus Village",
        purpose: "checkout-age-verification",
        source: userId ? "logged-in-checkout" : "guest-checkout",
      },
    });

    const redirectUrl = getDiditRedirectUrl(session);

    if (!redirectUrl) {
      req.flash("error", "Age verification could not be started. Please try again.");
      return res.redirect("/checkout");
    }

    req.session.diditSessionId = session.session_id || null;
    req.session.diditStatus = normaliseStatus(session.status || "started");
    req.session.diditVendorData = vendorData;

    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        user.diditSessionId = session.session_id || null;
        user.diditStatus = normaliseStatus(session.status || "started");
        user.set("didit.sessionId", session.session_id || null);
        user.set("didit.workflowId", session.workflow_id || process.env.DIDIT_WORKFLOW_ID);
        user.set("didit.status", session.status || "In Progress");

        await user.save();
        req.session.user = user;
      }
    }

    return res.redirect(redirectUrl);
  } catch (error) {
    console.log("Didit start error:", error.message);
    req.flash("error", "Age verification could not be started. Please try again.");
    return res.redirect("/checkout");
  }
}

router.post("/start", startDiditSession);
router.get("/checkout-start", startDiditSession);

router.get("/complete", async (req, res) => {
  const redirectTo = req.session.returnToAfterVerification || "/checkout";
  delete req.session.returnToAfterVerification;

  try {
    const sessionId =
      req.query.session_id ||
      req.query.sessionId ||
      req.session.diditSessionId;

    if (!sessionId) {
      req.flash("error", "Verification session was not found. Please try again.");
      return res.redirect(redirectTo);
    }

    const decision = await getVerificationDecision(sessionId);
    const status = normaliseStatus(decision.status);

    req.session.diditStatus = status;
    req.session.diditSessionId = decision.session_id || sessionId;

    if (isApprovedStatus(status)) {
      req.session.diditVerified = true;
      req.session.isAgeVerified = true;
      req.session.ageVerifiedAt = new Date();

      await markLoggedInUserFromDecision(req, decision);

      req.flash("success", "Age verification approved. You can now complete checkout.");
      return res.redirect(redirectTo);
    }

    await markLoggedInUserFromDecision(req, decision);

    req.flash("error", "Age verification is not approved yet. Please complete verification before checkout.");
    return res.redirect(redirectTo);
  } catch (error) {
    console.log("Didit complete error:", error.message);
    req.flash("error", "Could not confirm verification yet. Please try again in a moment.");
    return res.redirect(redirectTo);
  }
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
      console.log("Didit webhook received for guest/non-user session.");
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

    if (isApprovedStatus(status)) {
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
