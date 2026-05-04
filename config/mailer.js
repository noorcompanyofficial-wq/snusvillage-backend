const nodemailer = require("nodemailer");

const emailUser = process.env.USER_EMAIL || process.env.EMAIL_USER;
const emailPass = process.env.USER_PASSWORD || process.env.EMAIL_PASS;

const smtpConfigured = Boolean(emailUser && emailPass);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    })
  : null;

module.exports = {
  async sendMail(options) {
    if (!transporter) {
      console.log("Email not sent because Gmail credentials are missing.");
      console.log("To:", options.to);
      console.log("Subject:", options.subject);
      console.log("Message:", options.text || options.html);
      return;
    }

    return transporter.sendMail({
      from: emailUser,
      ...options,
    });
  },
};
