const { randomUUID } = require("crypto");

let cachedToken = null;
let tokenExpiresAt = 0;

function getConfig() {
  const sandbox = String(process.env.PARCEL2GO_SANDBOX || "true").toLowerCase() !== "false";
  const origin = sandbox ? "https://sandbox.parcel2go.com" : "https://www.parcel2go.com";

  return {
    apiBaseUrl: String(process.env.PARCEL2GO_API_BASE_URL || `${origin}/api`).replace(/\/$/, ""),
    tokenUrl: process.env.PARCEL2GO_TOKEN_URL || `${origin}/auth/connect/token`,
    clientId: process.env.PARCEL2GO_CLIENT_ID || "",
    clientSecret: process.env.PARCEL2GO_CLIENT_SECRET || "",
    service: process.env.PARCEL2GO_SERVICE_SLUG || "",
    collectionDate: process.env.PARCEL2GO_COLLECTION_DATE || "",
    weight: Number(process.env.PARCEL2GO_PACKAGE_WEIGHT_KG || 0.25),
    length: Number(process.env.PARCEL2GO_PACKAGE_LENGTH_CM || 20),
    width: Number(process.env.PARCEL2GO_PACKAGE_WIDTH_CM || 15),
    height: Number(process.env.PARCEL2GO_PACKAGE_HEIGHT_CM || 10),
    sender: {
      contactName: process.env.PARCEL2GO_SENDER_CONTACT || "Snus Village",
      organisation: process.env.PARCEL2GO_SENDER_ORGANISATION || "Snus Village",
      email: process.env.PARCEL2GO_SENDER_EMAIL || process.env.EMAIL_FROM || "",
      phone: process.env.PARCEL2GO_SENDER_PHONE || "",
      property: process.env.PARCEL2GO_SENDER_PROPERTY || "",
      street: process.env.PARCEL2GO_SENDER_STREET || "",
      town: process.env.PARCEL2GO_SENDER_TOWN || "London",
      county: process.env.PARCEL2GO_SENDER_COUNTY || "",
      postcode: process.env.PARCEL2GO_SENDER_POSTCODE || "",
    },
  };
}

function hasParcel2GoConfig() {
  const config = getConfig();
  return Boolean(config.clientId && config.clientSecret && config.service && config.sender.postcode);
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function errorMessage(data, fallback) {
  if (typeof data === "string") return data;
  if (Array.isArray(data?.Errors) && data.Errors.length) {
    return data.Errors.map((entry) => entry.Error || entry.Message).filter(Boolean).join(", ");
  }
  if (data?.Message || data?.message) return String(data.Message || data.message);
  if (data?.ModelState) return JSON.stringify(data.ModelState);
  return fallback;
}

function splitUkAddress(value) {
  const address = String(value || "").trim();
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const firstLine = parts.shift() || address;
  const numberedProperty = firstLine.match(/^(\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?)\s+(.+)$/i);

  if (numberedProperty) {
    return {
      property: numberedProperty[1],
      street: [numberedProperty[2], ...parts].join(", "),
    };
  }

  return {
    property: firstLine,
    street: parts.join(", ") || firstLine,
  };
}

async function getAccessToken() {
  const config = getConfig();
  if (!config.clientId || !config.clientSecret) throw new Error("Parcel2Go API credentials are missing");
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "public-api payment",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const data = await readResponse(response);
  if (!response.ok || !data?.access_token) throw new Error(errorMessage(data, "Parcel2Go authentication failed"));

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(30, Number(data.expires_in || 7200) - 60) * 1000;
  return cachedToken;
}

async function request(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${getConfig().apiBaseUrl}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(options.headers || {}) },
  });
  const data = await readResponse(response);
  if (!response.ok) {
    const error = new Error(errorMessage(data, `Parcel2Go request failed (${response.status})`));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function orderReference(order) {
  return order._id.toString().slice(-12).toUpperCase();
}

function buildOrderPayload(order) {
  const config = getConfig();
  const fullName = `${order.customer?.firstName || ""} ${order.customer?.lastName || ""}`.trim();
  const deliveryLines = splitUkAddress(order.delivery?.address);
  const deliveryAddress = {
    ContactName: fullName,
    Email: order.customer?.email || "",
    Phone: order.customer?.phone || "",
    Property: deliveryLines.property,
    Street: deliveryLines.street,
    Town: order.delivery?.city || "",
    Postcode: order.delivery?.postcode || "",
    CountryIsoCode: "GBR",
  };
  const collectionAddress = {
    ContactName: config.sender.contactName,
    Organisation: config.sender.organisation,
    Email: config.sender.email,
    Phone: config.sender.phone,
    Property: config.sender.property,
    Street: config.sender.street,
    Town: config.sender.town,
    County: config.sender.county,
    Postcode: config.sender.postcode,
    CountryIsoCode: "GBR",
  };

  const item = {
    Id: randomUUID(),
    OriginCountry: "GBR",
    VatStatus: "Individual",
    RecipientVatStatus: "Individual",
    Service: config.service,
    Reference: orderReference(order),
    CollectionAddress: collectionAddress,
    Parcels: [{
      Id: randomUUID(),
      Height: config.height,
      Length: config.length,
      Width: config.width,
      Weight: config.weight,
      EstimatedValue: Number(order.subtotal || 0),
      DeliveryAddress: deliveryAddress,
      ContentsSummary: "Nicotine pouches",
    }],
  };
  if (config.collectionDate) item.CollectionDate = config.collectionDate;

  return {
    Items: [item],
    CustomerDetails: {
      Email: order.customer?.email || "",
      Forename: order.customer?.firstName || "Customer",
      Surname: order.customer?.lastName || "Customer",
      Reference: orderReference(order),
    },
  };
}

async function createAndPayOrder(order) {
  if (!hasParcel2GoConfig()) return { ok: false, skipped: true, message: "Parcel2Go configuration is incomplete" };
  try {
    const created = await request("/orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildOrderPayload(order)),
    });
    const orderId = created?.OrderId;
    if (!orderId) return { ok: false, message: "Parcel2Go did not return an order ID", data: created };
    const paid = await request(`/orders/${encodeURIComponent(orderId)}/paywithprepay?hash=${encodeURIComponent(created.Hash || "")}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    const line = created.OrderlineIdMap?.[0] || {};
    return { ok: true, data: created, payment: paid, orderId: String(orderId), hash: created.Hash || "", orderLineId: String(line.OrderLineId || ""), orderLineHash: line.Hash || "" };
  } catch (error) {
    return { ok: false, status: error.status, data: error.data, message: error.message };
  }
}

async function getLabel(reference, hash = "") {
  try {
    const params = new URLSearchParams({ referenceType: "OrderId", detailLevel: "Labels", labelMedia: "A4", labelFormat: "PDF" });
    if (hash) params.set("hash", hash);
    const data = await request(`/labels/${encodeURIComponent(reference)}?${params}`);
    const encoded = data?.Base64EncodedLabels?.[0];
    if (!encoded) return { ok: false, message: "Parcel2Go did not return a label", data };
    return { ok: true, buffer: Buffer.from(encoded, "base64") };
  } catch (error) {
    return { ok: false, status: error.status, message: error.message };
  }
}

async function verifyConnection() {
  const config = getConfig();
  if (!hasParcel2GoConfig()) {
    return { ok: false, authentication: false, quote: false };
  }

  try {
    const data = await request("/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Service: config.service,
        CollectionAddress: {
          Country: "GBR",
          Property: config.sender.property,
          Postcode: config.sender.postcode,
          Town: config.sender.town,
          VatStatus: "Individual",
        },
        DeliveryAddress: {
          Country: "GBR",
          Property: "10",
          Postcode: "SW1A 1AA",
          Town: "London",
          VatStatus: "Individual",
        },
        Parcels: [{
          Value: 20,
          Weight: config.weight,
          Length: config.length,
          Width: config.width,
          Height: config.height,
        }],
      }),
    });
    const quotes = Array.isArray(data?.Quotes) ? data.Quotes : [];
    return { ok: quotes.length > 0, authentication: true, quote: quotes.length > 0 };
  } catch (error) {
    return { ok: false, authentication: error.status !== 401, quote: false };
  }
}

module.exports = { getConfig, hasParcel2GoConfig, splitUkAddress, buildOrderPayload, createAndPayOrder, getLabel, verifyConnection };
