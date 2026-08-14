const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const {
  getAllUsers,
  getUserById,
  updateUser,
  createUser,
} = require("../services/user.service");
const {
  createZitadelUser,
  deleteZitadelUser,
  setUserProjectRole,
} = require("../services/zitadel.service");
const { logAudit } = require("../services/audit.service");
const logger = require("../lib/logger");

const router = express.Router();

const ROLES = ["admin", "manager", "cashier"];

function toPublicUser(user) {
  if (!user) return user;
  const { keycloak_id, ...rest } = user;
  return rest;
}

// Managers can fully manage cashier accounts but cannot create or edit
// manager/admin accounts — only admins can do that.
function managerCanTarget(role) {
  return role === "cashier";
}

router.get("/me", authenticate, requireUser, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(toPublicUser(user));
});

router.get(
  "/",
  authenticate,
  requireRole(["admin", "manager"]),
  requireUser,
  async (req, res) => {
    const users = await getAllUsers();
    res.json(users.map(toPublicUser));
  }
);

router.post(
  "/",
  authenticate,
  requireRole(["admin", "manager"]),
  requireUser,
  async (req, res) => {
    const {
      username,
      email,
      password,
      given_name: givenName,
      family_name: familyName,
      role = "cashier",
      is_active: isActive = true,
    } = req.body || {};

    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Username is required" });
    }
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password is required (min 8 characters)" });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "Invalid is_active value" });
    }
    if (req.user.role === "manager" && !managerCanTarget(role)) {
      return res
        .status(403)
        .json({ error: "Managers can only create cashier accounts" });
    }

    let zitadelUserId;
    try {
      const created = await createZitadelUser({
        username: username.trim(),
        email: email.trim(),
        password,
        givenName: givenName?.trim(),
        familyName: familyName?.trim(),
      });
      zitadelUserId = created.userId;

      await setUserProjectRole(zitadelUserId, role);

      const user = await createUser({
        username: username.trim(),
        email: email.trim(),
        keycloakId: zitadelUserId,
        role,
        isActive,
      });

      await logAudit(null, {
        actorUserId: req.user.id,
        actorUsername: req.user.username,
        action: "user.create",
        entityType: "user",
        entityId: user.id,
        details: { username: user.username, email: user.email, role: user.role },
      });

      res.status(201).json(toPublicUser(user));
    } catch (err) {
      logger.error({ err: err.message, details: err.details }, "Create user failed");

      if (zitadelUserId) {
        try {
          await deleteZitadelUser(zitadelUserId);
        } catch (cleanupErr) {
          logger.error(
            { err: cleanupErr.message, zitadelUserId },
            "Failed to roll back ZITADEL user"
          );
        }
      }

      if (err.code === "23505") {
        return res.status(409).json({ error: "Username or email already exists" });
      }

      const status = err.status || 500;
      res.status(status).json({
        error: status < 500 ? err.message : "Failed to create user",
      });
    }
  }
);

router.get(
  "/:id",
  authenticate,
  requireRole(["admin", "manager"]),
  requireUser,
  async (req, res) => {
    const userId = req.params.id;
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(toPublicUser(user));
  }
);

router.put(
  "/:id",
  authenticate,
  requireRole(["admin", "manager"]),
  requireUser,
  async (req, res) => {
    const { username, email, role, is_active } = req.body;

    if (role !== undefined && !ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    if (is_active !== undefined && typeof is_active !== "boolean") {
      return res.status(400).json({ error: "Invalid is_active value" });
    }

    const target = await getUserById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    if (req.user.role === "manager") {
      if (!managerCanTarget(target.role)) {
        return res.status(403).json({ error: "Managers cannot edit manager or admin accounts" });
      }
      if (role !== undefined && !managerCanTarget(role)) {
        return res.status(403).json({ error: "Managers can only assign the cashier role" });
      }
    }

    if (role !== undefined && role !== target.role) {
      try {
        await setUserProjectRole(target.keycloak_id, role);
      } catch (err) {
        logger.error({ err: err.message }, "Failed to update ZITADEL role");
        const status = err.status || 500;
        return res.status(status).json({
          error: status < 500 ? err.message : "Failed to update role",
        });
      }
    }

    const user = await updateUser(req.params.id, {
      username,
      email,
      role,
      is_active,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const changes = {};
    if (username !== undefined) changes.username = username;
    if (email !== undefined) changes.email = email;
    if (role !== undefined && role !== target.role) {
      changes.role = { from: target.role, to: role };
    }
    if (is_active !== undefined) changes.is_active = is_active;

    if (Object.keys(changes).length > 0) {
      await logAudit(null, {
        actorUserId: req.user.id,
        actorUsername: req.user.username,
        action: "user.update",
        entityType: "user",
        entityId: user.id,
        details: changes,
      });
    }

    res.json(toPublicUser(user));
  }
);

module.exports = router;
