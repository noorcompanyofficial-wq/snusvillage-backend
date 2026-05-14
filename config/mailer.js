const nodemailer = require("nodemailer");

const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER || process.env.USER_EMAIL;
const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.USER_PASS;
const emailFrom = process.env.EMAIL_FROM || emailUser;
const smtpHost = process.env.SMTP_HOST || "smtp.office365.com";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const timeout = Number(process.env.EMAIL_TIMEOUT_MS || 10000);

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  requireTLS: true,
  auth: {
    user: emailUser,
    pass: emailPass,
  },
  connectionTimeout: timeout,
  greetingTimeout: timeout,
  socketTimeout: timeout,
  tls: {
    rejectUnauthorized: false,
  },
});

transporter.snusMailConfig = {
  emailUser,
  emailFrom,
  smtpHost,
  smtpPort,
  smtpSecure,
  timeout,
  hasEmailUser: Boolean(emailUser),
  hasEmailPass: Boolean(emailPass),
};

module.exports = transporter;
