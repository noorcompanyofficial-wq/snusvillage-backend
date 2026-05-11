const nodemailer = require("nodemailer");

function getEmailTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function formatMoney(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function getAdminEmails() {
  const raw =
    process.env.ADMIN_ORDER_EMAILS ||
    process.env.USER_EMAIL ||
    process.env.EMAIL_USER ||
    "";

  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function getOrderNumber(order) {
  return order._id.toString().slice(-6).toUpperCase();
}

function isClickCollect(order) {
  return order.fulfilment?.method === "click_collect";
}

function buildItemsText(order) {
  return order.items
    .map((item) => {
      return `- ${item.name} x ${item.quantity} = ${formatMoney(item.price * item.quantity)}`;
    })
    .join("\n");
}

function buildDeliveryText(order) {
  if (isClickCollect(order)) {
    return `
Fulfilment:
CLICK & COLLECT

Collection branch:
${order.fulfilment?.collectionBranch || "Edgware Road"}

Collection address:
${order.fulfilment?.collectionAddress || "SNUS VILLAGE, EDGWARE ROAD, TYBURNIA, London, W2 2HX"}

Collection note:
This is a Click & Collect order. Please bring your order confirmation and valid ID when collecting.
`.trim();
  }

  return `
Delivery:
${order.delivery?.address || ""}
${order.delivery?.city || ""}
${order.delivery?.postcode || ""}
${order.delivery?.country || ""}
`.trim();
}

async function sendCustomerOrderEmail(order) {
  const transporter = getEmailTransporter();

  if (!transporter || !order.customer?.email) {
    return { ok: false, skipped: true, message: "Email credentials or customer email missing" };
  }

  const orderNumber = getOrderNumber(order);
  const clickCollect = isClickCollect(order);

  const intro = clickCollect
    ? `Thank you for your order with Snus Village. Your Click & Collect order has been confirmed.`
    : `Thank you for your order with Snus Village. Your delivery order has been confirmed.`;

  const fulfilmentMessage = clickCollect
    ? `
Collection details:
Your order is being prepared for collection at SNUS VILLAGE, EDGWARE ROAD, TYBURNIA, London, W2 2HX.

Please bring your order confirmation and valid ID when collecting. Products are age restricted and collection is for customers aged 18+ only.
`.trim()
    : `
Delivery details:
Your order has been received and will be processed for delivery. You will be contacted if any extra information is needed.
`.trim();

  const text = `
Hi ${order.customer.firstName || "Customer"},

${intro}

Order #${orderNumber}

Items:
${buildItemsText(order)}

Subtotal: ${formatMoney(order.subtotal)}
Shipping: ${formatMoney(order.shipping)}
Total: ${formatMoney(order.total)}

Payment status: ${order.paymentStatus}
Order status: ${order.orderStatus}

${fulfilmentMessage}

${buildDeliveryText(order)}

Snus Village
`.trim();

  const adminEmails = getAdminEmails();

  await transporter.sendMail({
    from: `"Snus Village" <${process.env.EMAIL_USER}>`,
    to: order.customer.email,
    bcc: adminEmails.length ? adminEmails.join(",") : undefined,
    subject: clickCollect
      ? `Click & Collect Order Confirmed #${orderNumber}`
      : `Snus Village Order Confirmed #${orderNumber}`,
    text,
  });

  return { ok: true };
}

async function sendAdminOrderEmail(order) {
  const transporter = getEmailTransporter();

  const adminEmails = getAdminEmails();

  if (!transporter || !adminEmails.length) {
    return { ok: false, skipped: true, message: "Email credentials or admin email missing" };
  }

  const orderNumber = getOrderNumber(order);
  const clickCollect = isClickCollect(order);

  const adminWarning = clickCollect
    ? `
IMPORTANT:
CLICK & COLLECT ORDER.
DO NOT SEND TO ROYAL MAIL.
CUSTOMER COLLECTS FROM EDGWARE ROAD ONLY.
`.trim()
    : `
Delivery order.
Royal Mail fulfilment applies.
`.trim();

  const text = `
New B2C order received.

${adminWarning}

Order #${orderNumber}

Customer:
${order.customer?.firstName || ""} ${order.customer?.lastName || ""}
${order.customer?.email || ""}
${order.customer?.phone || ""}

${buildDeliveryText(order)}

Items:
${buildItemsText(order)}

Subtotal: ${formatMoney(order.subtotal)}
Shipping: ${formatMoney(order.shipping)}
Total: ${formatMoney(order.total)}

Payment status: ${order.paymentStatus}
Order status: ${order.orderStatus}

SumUp:
Status: ${order.sumup?.status || "N/A"}
Checkout ID: ${order.sumup?.checkoutId || "N/A"}
Reference: ${order.sumup?.checkoutReference || "N/A"}
Paid at: ${order.sumup?.paidAt ? new Date(order.sumup.paidAt).toLocaleString("en-GB") : "N/A"}

Royal Mail:
Status: ${order.royalMail?.syncStatus || "not_sent"}
ID: ${order.royalMail?.orderIdentifier || "N/A"}
Reference: ${order.royalMail?.orderReference || "N/A"}
Error: ${order.royalMail?.syncError || "N/A"}
`.trim();

  await transporter.sendMail({
    from: `"Snus Village Website" <${process.env.EMAIL_USER}>`,
    to: adminEmails.join(","),
    subject: clickCollect
      ? `CLICK & COLLECT Order #${orderNumber}`
      : `New Delivery Order #${orderNumber}`,
    text,
  });

  return { ok: true };
}

async function sendOrderEmails(order) {
  const results = {
    customer: null,
    admin: null,
  };

  try {
    results.customer = await sendCustomerOrderEmail(order);
  } catch (err) {
    results.customer = { ok: false, message: err.message };
  }

  try {
    results.admin = await sendAdminOrderEmail(order);
  } catch (err) {
    results.admin = { ok: false, message: err.message };
  }

  return results;
}

module.exports = {
  sendCustomerOrderEmail,
  sendAdminOrderEmail,
  sendOrderEmails,
};
