const nodemailer = require("nodemailer");

const emailUser = process.env.EMAIL_USER || process.env.USER_EMAIL || process.env.GMAIL_USER;
const emailPass = process.env.EMAIL_PASS || process.env.USER_PASS || process.env.GMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: emailUser,
    pass: emailPass,
  },
  connectionTimeout: Number(process.env.EMAIL_TIMEOUT_MS || 5000),
  greetingTimeout: Number(process.env.EMAIL_TIMEOUT_MS || 5000),
  socketTimeout: Number(process.env.EMAIL_TIMEOUT_MS || 5000),
  tls: {
    rejectUnauthorized: false,
  },
});

transporter.snusMailConfig = {
  emailUser,
  hasEmailUser: Boolean(emailUser),
  hasEmailPass: Boolean(emailPass),
};

module.exports = transporter;
