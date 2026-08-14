const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const { CATEGORIES, sendSupportRequest } = require("../services/support.service");
const logger = require("../lib/logger");

const router = express.Router();

// POST /support — admin/manager only. Emails support@flappies.shop (or
// whatever SUPPORT_EMAIL_TO is set to) over SMTP.
router.post(
  "/",
  authenticate,
  requireRole(["admin", "manager"]),
  requireUser,
  async (req, res) => {
    const { subject, message, category = "OTHER" } = req.body || {};

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return res.status(400).json({ error: "subject is required" });
    }
    if (subject.trim().length > 200) {
      return res.status(400).json({ error: "subject is too long (max 200 characters)" });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }
    if (message.trim().length > 5000) {
      return res.status(400).json({ error: "message is too long (max 5000 characters)" });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(", ")}` });
    }

    try {
      await sendSupportRequest({
        subject: subject.trim(),
        message: message.trim(),
        category,
        fromUser: req.user,
        tenantId: process.env.TENANT_ID,
      });
      res.status(200).json({ message: "Support request sent" });
    } catch (err) {
      logger.error(
        { err: err.message, details: err.details },
        "Failed to send support request"
      );
      const status = err.status || 502;
      res.status(status).json({
        error:
          status === 503
            ? "Support email is not configured for this deployment"
            : "Failed to send support request. Please try again later.",
      });
    }
  }
);

module.exports = router;
