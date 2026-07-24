const SUMUP_API_BASE = "https://api.sumup.com";

function getBaseUrl(req) {
  const envBaseUrl = process.env.BASE_URL;

  if (envBaseUrl) {
    return envBaseUrl.replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

function requireSumUpConfig() {
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!apiKey) {
    throw new Error("SUMUP_API_KEY is missing from .env");
  }

  if (!merchantCode) {
    throw new Error("SUMUP_MERCHANT_CODE is missing from .env");
  }

  return { apiKey, merchantCode };
}

async function createCheckout(order, req, { hosted = false } = {}) {
  const { apiKey, merchantCode } = requireSumUpConfig();

  const baseUrl = getBaseUrl(req);
  const checkoutReference = `SV-${order._id.toString()}`;

  const response = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      checkout_reference: checkoutReference,
      amount: Number(order.total.toFixed(2)),
      currency: "GBP",
      merchant_code: merchantCode,
      description: `Snus Village Order ${order._id.toString().slice(-6).toUpperCase()}`,
      redirect_url: `${baseUrl}/checkout/sumup/return/${order._id}`,
      ...(hosted ? { hosted_checkout: { enabled: true } } : {}),
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.detail ||
      JSON.stringify(data) ||
      "Unable to create SumUp checkout"
    );
  }

  if (hosted && !data.hosted_checkout_url) {
    throw new Error("SumUp did not return hosted_checkout_url");
  }

  return {
    ok: true,
    data,
    checkoutReference,
  };
}

async function createHostedCheckout(order, req) {
  return createCheckout(order, req, { hosted: true });
}

async function createExpressCheckout(order, req) {
  return createCheckout(order, req);
}

async function getCheckoutStatus(checkoutId) {
  const { apiKey } = requireSumUpConfig();

  const response = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkoutId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.detail ||
      JSON.stringify(data) ||
      "Unable to check SumUp checkout status"
    );
  }

  return data;
}

module.exports = {
  createHostedCheckout,
  createExpressCheckout,
  getCheckoutStatus,
};
