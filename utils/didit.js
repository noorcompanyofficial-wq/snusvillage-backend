const axios = require("axios");
const crypto = require("crypto");

const DIDIT_API_BASE_URL = "https://verification.didit.me";

function getBaseUrl(req) {
  const configured = process.env.BASE_URL || "";
  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return configured.replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

function getDiditClient() {
  if (!process.env.DIDIT_API_KEY) {
    throw new Error("DIDIT_API_KEY is not configured.");
  }

  return axios.create({
    baseURL: DIDIT_API_BASE_URL,
    headers: {
      "x-api-key": process.env.DIDIT_API_KEY,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

async function createVerificationSession(user, req) {
  if (!process.env.DIDIT_WORKFLOW_ID) {
    throw new Error("DIDIT_WORKFLOW_ID is not configured.");
  }

  const baseUrl = getBaseUrl(req);
  const client = getDiditClient();
  const { data } = await client.post("/v3/session/", {
    workflow_id: process.env.DIDIT_WORKFLOW_ID,
    vendor_data: String(user._id),
    callback: `${baseUrl}/auth/dashboard`,
    metadata: {
      email: user.email,
      source: "snusvillage-web",
    },
  });

  return data;
}

function shortenFloats(value) {
  if (Array.isArray(value)) return value.map(shortenFloats);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, shortenFloats(nestedValue)])
    );
  }

  if (typeof value === "number" && !Number.isInteger(value) && value % 1 === 0) {
    return Math.trunc(value);
  }

  return value;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortKeys(value[key]);
        return sorted;
      }, {});
  }

  return value;
}

function verifyWebhookSignature({ body, signature, timestamp }) {
  if (!process.env.DIDIT_WEBHOOK_SECRET) {
    throw new Error("DIDIT_WEBHOOK_SECRET is not configured.");
  }

  const timestampNumber = Number(timestamp);
  if (!timestampNumber || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
    return { ok: false, reason: "stale" };
  }

  if (!signature) {
    return { ok: false, reason: "missing signature" };
  }

  const canonical = JSON.stringify(sortKeys(shortenFloats(body)));
  const expected = crypto
    .createHmac("sha256", process.env.DIDIT_WEBHOOK_SECRET)
    .update(canonical, "utf8")
    .digest("hex");

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return { ok: false, reason: "bad signature" };
  }

  return { ok: true };
}

module.exports = {
  createVerificationSession,
  verifyWebhookSignature,
};
