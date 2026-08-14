const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const { getAuditLog, getAuditLogEntry } = require("../services/audit.service");

const router = express.Router();

// Read-only, admin/manager only. There are intentionally no POST/PUT/DELETE
// routes here — audit history can only ever grow, never be edited, deleted,
// or manually created via the API (see db_patch_11.sql for the DB-level
// enforcement of the same rule).

router.get(
  "/",
  authenticate,
  requireUser,
  requireRole(["admin", "manager"]),
  async (req, res) => {
    const { action, entity_type: entityType, from, to, limit, offset } = req.query;
    const entries = await getAuditLog({
      action: action || null,
      entity_type: entityType || null,
      from: from || null,
      to: to || null,
      limit,
      offset,
    });
    res.json(entries);
  }
);

router.get(
  "/:id",
  authenticate,
  requireUser,
  requireRole(["admin", "manager"]),
  async (req, res) => {
    const entry = await getAuditLogEntry(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: "Audit log entry not found" });
    }
    res.json(entry);
  }
);

module.exports = router;
