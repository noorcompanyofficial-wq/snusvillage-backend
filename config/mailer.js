const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: Number(process.env.EMAIL_TIMEOUT_MS || 5000),
  greetingTimeout: Number(process.env.EMAIL_TIMEOUT_MS || 5000),
  socketTimeout: Number(process.env.EMAIL_TIMEOUT_MS || 5000),
  tls: {
    rejectUnauthorized: false,
  },
});

module.exports = transporter;
