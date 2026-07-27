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
      return_url: `${baseUrl}/checkout/sumup/webhook`,
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

async function refundCheckout(checkoutId, amount) {
  const { apiKey } = requireSumUpConfig();

  if (!checkoutId) {
    throw new Error("No SumUp checkout ID on this order.");
  }

  // Refunds are issued against the transaction, not the checkout, so look
  // up the transaction ID tied to this checkout first.
  const checkout = await getCheckoutStatus(checkoutId);

  if (checkout.status !== "PAID") {
    throw new Error(
      `SumUp checkout is not in a PAID state (status: ${checkout.status || "unknown"}), cannot refund.`
    );
  }

  const transactionId = checkout.transaction_id || checkout.transactions?.[0]?.id;

  if (!transactionId) {
    throw new Error("Could not find a SumUp transaction ID for this checkout.");
  }

  const body = {};
  if (amount != null) {
    body.amount = Number(amount);
  }

  const response = await fetch(`${SUMUP_API_BASE}/v0.1/me/refund/${transactionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 204) {
    return { ok: true, transactionId, transactionCode: checkout.transaction_code || "", data: null };
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.detail ||
      JSON.stringify(data) ||
      "Unable to refund SumUp transaction"
    );
  }

  return { ok: true, transactionId, transactionCode: checkout.transaction_code || "", data };
}

module.exports = {
  createHostedCheckout,
  createExpressCheckout,
  getCheckoutStatus,
  refundCheckout,
};
