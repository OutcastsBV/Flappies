const nodemailer = require("nodemailer");

const CATEGORIES = ["BUG", "FEATURE", "OTHER"];

let cachedTransporter = null;

function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD
  );
}

function getTransporter() {
  if (!isConfigured()) {
    const err = new Error("SMTP is not configured");
    err.status = 503;
    throw err;
  }

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      // A slow/unreachable mail server must fail fast, not hang the request.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }

  return cachedTransporter;
}

/** Test-only hook to force a fresh transporter next time (SMTP config change). */
function resetTransporter() {
  cachedTransporter = null;
}

async function sendSupportRequest({ subject, message, category, fromUser, tenantId }) {
  const transporter = getTransporter();
  const to = process.env.SUPPORT_EMAIL_TO || "support@flappies.shop";
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const body = [
    `Category: ${category}`,
    `Tenant: ${tenantId || "default"}`,
    `From: ${fromUser.username} <${fromUser.email}> (${fromUser.role})`,
    `Sent: ${new Date().toISOString()}`,
    "",
    message,
  ].join("\n");

  try {
    await transporter.sendMail({
      to,
      from,
      replyTo: fromUser.email,
      subject: `[Flappies ${category}] ${subject}`,
      text: body,
    });
  } catch (err) {
    const wrapped = new Error("Failed to send support request email");
    wrapped.status = 502;
    wrapped.details = err.message;
    throw wrapped;
  }
}

module.exports = {
  CATEGORIES,
  isConfigured,
  sendSupportRequest,
  resetTransporter,
};
