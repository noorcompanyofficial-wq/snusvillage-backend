function getRoyalMailConfig() {
  return {
    baseUrl: process.env.ROYAL_MAIL_API_BASE_URL,
    token: process.env.ROYAL_MAIL_API_TOKEN,
    defaultWeight: Number(
      process.env.ROYAL_MAIL_DEFAULT_PACKAGE_WEIGHT_GRAMS || 250,
    ),
    defaultPackageFormat:
      process.env.ROYAL_MAIL_DEFAULT_PACKAGE_FORMAT || "smallParcel",
  };
}

function hasRoyalMailConfig() {
  const config = getRoyalMailConfig();
  return Boolean(config.baseUrl && config.token);
}

function buildRoyalMailOrderPayload(order) {
  const config = getRoyalMailConfig();

  const fullName =
    `${order.customer?.firstName || ""} ${order.customer?.lastName || ""}`.trim();

  return {
    items: [
      {
        orderReference: order._id.toString().slice(-12).toUpperCase(),
        recipient: {
          address: {
            fullName: fullName || "Customer",
            addressLine1: order.delivery?.address || "",
            city: order.delivery?.city || "",
            postcode: order.delivery?.postcode || "",
            countryCode: "GB",
          },
          emailAddress: order.customer?.email || "",
          phoneNumber: order.customer?.phone || "",
        },
        packages: [
          {
            weightInGrams: config.defaultWeight,
            packageFormatIdentifier: config.defaultPackageFormat,
            contents: order.items.map((item) => ({
              name: item.name || "Product",
              SKU: item.product ? item.product.toString() : "",
              quantity: item.quantity,
              unitValue: item.price,
            })),
          },
        ],
        orderDate: order.createdAt || new Date().toISOString(),
        subtotal: Number(order.subtotal || 0),
        shippingCostCharged: Number(order.shipping || 0),
        total: Number(order.total || 0),
        currencyCode: "GBP",
      },
    ],
  };
}

async function sendOrderToRoyalMail(order) {
  const config = getRoyalMailConfig();

  if (!hasRoyalMailConfig()) {
    return {
      ok: false,
      skipped: true,
      message: "Royal Mail API credentials are missing",
    };
  }

  const payload = buildRoyalMailOrderPayload(order);

  const response = await fetch(`${config.baseUrl}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
      message: "Royal Mail order sync failed",
    };
  }

  return {
    ok: true,
    data,
  };
}

module.exports = {
  hasRoyalMailConfig,
  buildRoyalMailOrderPayload,
  sendOrderToRoyalMail,
};
