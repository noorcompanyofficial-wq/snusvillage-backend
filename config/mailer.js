const nodemailer = require("nodemailer");
const axios = require("axios");

const emailProvider = String(process.env.EMAIL_PROVIDER || "smtp").toLowerCase();
const resendApiKey = process.env.RESEND_API_KEY;
const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER || process.env.USER_EMAIL;
const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.USER_PASS;
const emailFrom = process.env.EMAIL_FROM || emailUser;
const smtpHost = process.env.SMTP_HOST || "smtp.office365.com";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const timeout = Number(process.env.EMAIL_TIMEOUT_MS || 10000);

function splitRecipients(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(splitRecipients);

  return String(value)
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function createResendTransporter() {
  return {
    snusMailConfig: {
      provider: "resend",
      emailUser: emailFrom,
      emailFrom,
      smtpHost: "api.resend.com",
      smtpPort: 443,
      smtpSecure: true,
      timeout,
      hasEmailUser: Boolean(emailFrom),
      hasEmailPass: Boolean(resendApiKey),
    },

    async sendMail(mailOptions) {
      if (!resendApiKey) {
        throw new Error("RESEND_API_KEY is missing");
      }

      if (!emailFrom) {
        throw new Error("EMAIL_FROM is required for Resend");
      }

      const response = await axios.post(
        "https://api.resend.com/emails",
        {
          from: mailOptions.from || `Snus Village <${emailFrom}>`,
          to: splitRecipients(mailOptions.to),
          bcc: splitRecipients(mailOptions.bcc),
          reply_to: mailOptions.replyTo || process.env.EMAIL_REPLY_TO || emailFrom,
          subject: mailOptions.subject,
          text: mailOptions.text,
          html: mailOptions.html,
        },
        {
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          timeout,
        }
      );

      return {
        accepted: splitRecipients(mailOptions.to),
        rejected: [],
        response: `Resend email id ${response.data.id}`,
        messageId: response.data.id,
      };
    },
  };
}

const transporter =
  emailProvider === "resend"
    ? createResendTransporter()
    : nodemailer.createTransport({
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

if (!transporter.snusMailConfig) {
  transporter.snusMailConfig = {
    provider: "smtp",
    emailUser,
    emailFrom,
    smtpHost,
    smtpPort,
    smtpSecure,
    timeout,
    hasEmailUser: Boolean(emailUser),
    hasEmailPass: Boolean(emailPass),
  };
}

module.exports = transporter;
