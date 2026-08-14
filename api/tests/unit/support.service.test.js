const { describe, it, mock, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");
const support = require("../../services/support.service");

const ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "SUPPORT_EMAIL_TO",
];

const savedEnv = {};

function setSmtpEnv(overrides = {}) {
  const defaults = {
    SMTP_HOST: "smtp.example.com",
    SMTP_USER: "bot@example.com",
    SMTP_PASSWORD: "secret",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    process.env[key] = value;
  }
}

function clearSmtpEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

const fromUser = { username: "amy", email: "amy@example.com", role: "admin" };

describe("services/support.service", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    clearSmtpEnv();
    support.resetTransporter();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    mock.restoreAll();
    support.resetTransporter();
  });

  it("reports not configured until host/user/password are all present", () => {
    assert.equal(support.isConfigured(), false);

    process.env.SMTP_HOST = "smtp.example.com";
    assert.equal(support.isConfigured(), false);

    process.env.SMTP_USER = "bot@example.com";
    assert.equal(support.isConfigured(), false);

    process.env.SMTP_PASSWORD = "secret";
    assert.equal(support.isConfigured(), true);
  });

  it("rejects with a 503 when SMTP is not configured", async () => {
    await assert.rejects(
      support.sendSupportRequest({
        subject: "Broken button",
        message: "It doesn't work",
        category: "BUG",
        fromUser,
        tenantId: "acme",
      }),
      (err) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /not configured/);
        return true;
      }
    );
  });

  it("sends mail to SUPPORT_EMAIL_TO with replyTo/subject/category and tenant details in the body", async () => {
    setSmtpEnv({ SUPPORT_EMAIL_TO: "support@flappies.shop", SMTP_FROM: "noreply@flappies.shop" });

    const sendMail = mock.fn(async () => ({ messageId: "abc" }));
    mock.method(nodemailer, "createTransport", () => ({ sendMail }));

    await support.sendSupportRequest({
      subject: "Broken button",
      message: "It doesn't work",
      category: "BUG",
      fromUser,
      tenantId: "acme",
    });

    assert.equal(sendMail.mock.callCount(), 1);
    const [mail] = sendMail.mock.calls[0].arguments;
    assert.equal(mail.to, "support@flappies.shop");
    assert.equal(mail.from, "noreply@flappies.shop");
    assert.equal(mail.replyTo, "amy@example.com");
    assert.equal(mail.subject, "[Flappies BUG] Broken button");
    assert.match(mail.text, /Tenant: acme/);
    assert.match(mail.text, /amy <amy@example.com> \(admin\)/);
    assert.match(mail.text, /It doesn't work/);
  });

  it("defaults SUPPORT_EMAIL_TO to support@flappies.shop when unset", async () => {
    setSmtpEnv();

    const sendMail = mock.fn(async () => ({}));
    mock.method(nodemailer, "createTransport", () => ({ sendMail }));

    await support.sendSupportRequest({
      subject: "s",
      message: "m",
      category: "OTHER",
      fromUser,
      tenantId: "acme",
    });

    const [mail] = sendMail.mock.calls[0].arguments;
    assert.equal(mail.to, "support@flappies.shop");
  });

  it("reuses a single cached transporter across calls", async () => {
    setSmtpEnv();
    const sendMail = mock.fn(async () => ({}));
    const createTransport = mock.method(nodemailer, "createTransport", () => ({ sendMail }));

    await support.sendSupportRequest({ subject: "a", message: "b", category: "OTHER", fromUser, tenantId: "t" });
    await support.sendSupportRequest({ subject: "c", message: "d", category: "OTHER", fromUser, tenantId: "t" });

    assert.equal(createTransport.mock.callCount(), 1);
    assert.equal(sendMail.mock.callCount(), 2);
  });

  it("configures explicit connection/greeting/socket timeouts so a hung SMTP server fails fast", async () => {
    setSmtpEnv();
    const createTransport = mock.method(nodemailer, "createTransport", () => ({
      sendMail: mock.fn(async () => ({})),
    }));

    await support.sendSupportRequest({ subject: "a", message: "b", category: "OTHER", fromUser, tenantId: "t" });

    const [options] = createTransport.mock.calls[0].arguments;
    assert.equal(options.connectionTimeout, 10_000);
    assert.equal(options.greetingTimeout, 10_000);
    assert.equal(options.socketTimeout, 10_000);
  });

  it("wraps a failed send in a 502 error without leaking the raw SMTP error to callers", async () => {
    setSmtpEnv();
    mock.method(nodemailer, "createTransport", () => ({
      sendMail: mock.fn(async () => {
        throw new Error("connection timed out");
      }),
    }));

    await assert.rejects(
      support.sendSupportRequest({ subject: "a", message: "b", category: "OTHER", fromUser, tenantId: "t" }),
      (err) => {
        assert.equal(err.status, 502);
        assert.match(err.message, /Failed to send support request email/);
        assert.match(err.details, /connection timed out/);
        return true;
      }
    );
  });
});
