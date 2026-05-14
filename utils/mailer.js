const transporter = require("../config/mailer");

function getAdminInbox() {
  return process.env.CONTACT_EMAIL_TO || process.env.ADMIN_ORDER_EMAILS || transporter.snusMailConfig?.emailFrom;
}

exports.sendEmail = async (data) => {
  const mailConfig = transporter.snusMailConfig || {};
  const fromEmail = mailConfig.emailFrom || mailConfig.emailUser || process.env.EMAIL_USER;
  const to = getAdminInbox();

  if (!mailConfig.hasEmailUser || !mailConfig.hasEmailPass || !to) {
    throw new Error("Contact email is not configured");
  }

  await transporter.sendMail({
    from: `"Snus Village Website" <${fromEmail}>`,
    replyTo: data.email,
    to,
    subject: data.subject,
    html: `
      <h3>New Contact</h3>
      <p><b>Name:</b> ${data.name}</p>
      <p><b>Email:</b> ${data.email}</p>
      <p><b>Message:</b> ${data.message}</p>
    `,
  });
};
