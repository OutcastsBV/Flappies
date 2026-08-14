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
} = require("../services/zitadel.service");
const logger = require("../lib/logger");

const router = express.Router();

router.get("/me", authenticate, requireUser, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});

router.get("/", authenticate, requireRole("admin"), requireUser, async (req, res) => {
  const users = await getAllUsers();
  res.json(users);
});

router.post("/", authenticate, requireRole("admin"), requireUser, async (req, res) => {
  const {
    username,
    email,
    password,
    given_name: givenName,
    family_name: familyName,
    balance = 0,
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
  if (typeof balance !== "number" || balance < 0) {
    return res.status(400).json({ error: "Invalid balance" });
  }
  if (typeof isActive !== "boolean") {
    return res.status(400).json({ error: "Invalid is_active value" });
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

    const user = await createUser({
      username: username.trim(),
      email: email.trim(),
      keycloakId: zitadelUserId,
      balance,
      isActive,
    });

    res.status(201).json(user);
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
});

router.get("/:id", authenticate, requireRole("admin"), requireUser, async (req, res) => {
  const userId = req.params.id;
  const user = await getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});

router.put("/:id", authenticate, requireRole("admin"), requireUser, async (req, res) => {
  const { username, email, balance, is_active } = req.body;

  if (balance !== undefined && (typeof balance !== "number" || balance < 0)) {
    return res.status(400).json({ error: "Invalid balance" });
  }

  if (is_active !== undefined && typeof is_active !== "boolean") {
    return res.status(400).json({ error: "Invalid is_active value" });
  }

  const user = await updateUser(req.params.id, {
    username,
    email,
    balance,
    is_active,
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user);
});

module.exports = router;
