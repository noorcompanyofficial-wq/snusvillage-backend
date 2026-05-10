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

function buildItemsText(order) {
  return order.items
    .map((item) => {
      return `- ${item.name} x ${item.quantity} = ${formatMoney(item.price * item.quantity)}`;
    })
    .join("\n");
}

async function sendCustomerOrderEmail(order) {
  const transporter = getEmailTransporter();

  if (!transporter || !order.customer?.email) {
    return { ok: false, skipped: true, message: "Email credentials or customer email missing" };
  }

  const orderNumber = order._id.toString().slice(-6).toUpperCase();

  const text = `
Hi ${order.customer.firstName || "Customer"},

Thank you for your order with Snus Village.

Order #${orderNumber}

Items:
${buildItemsText(order)}

Subtotal: ${formatMoney(order.subtotal)}
Shipping: ${formatMoney(order.shipping)}
Total: ${formatMoney(order.total)}

Payment status: ${order.paymentStatus}
Order status: ${order.orderStatus}

Your order has been received. If payment is still pending, our team will contact you or process it once payment is confirmed.

Snus Village
`.trim();

  await transporter.sendMail({
    from: `"Snus Village" <${process.env.EMAIL_USER}>`,
    to: order.customer.email,
    subject: `Snus Village Order Received #${orderNumber}`,
    text,
  });

  return { ok: true };
}

async function sendAdminOrderEmail(order) {
  const transporter = getEmailTransporter();

  const adminEmail = process.env.USER_EMAIL || process.env.EMAIL_USER;

  if (!transporter || !adminEmail) {
    return { ok: false, skipped: true, message: "Email credentials or admin email missing" };
  }

  const orderNumber = order._id.toString().slice(-6).toUpperCase();

  const text = `
New B2C order received.

Order #${orderNumber}

Customer:
${order.customer?.firstName || ""} ${order.customer?.lastName || ""}
${order.customer?.email || ""}
${order.customer?.phone || ""}

Delivery:
${order.delivery?.address || ""}
${order.delivery?.city || ""}
${order.delivery?.postcode || ""}
${order.delivery?.country || ""}

Items:
${buildItemsText(order)}

Subtotal: ${formatMoney(order.subtotal)}
Shipping: ${formatMoney(order.shipping)}
Total: ${formatMoney(order.total)}

Payment status: ${order.paymentStatus}
Order status: ${order.orderStatus}

Royal Mail:
Status: ${order.royalMail?.syncStatus || "not_sent"}
ID: ${order.royalMail?.orderIdentifier || "N/A"}
Reference: ${order.royalMail?.orderReference || "N/A"}
`.trim();

  await transporter.sendMail({
    from: `"Snus Village Website" <${process.env.EMAIL_USER}>`,
    to: adminEmail,
    subject: `New B2C Order #${orderNumber}`,
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
