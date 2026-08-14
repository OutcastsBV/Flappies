const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const { getConfig, updateConfig, isHappyHourActive } = require("../services/config.service");
const { logAudit } = require("../services/audit.service");

const router = express.Router();

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

router.get("/shop", authenticate, requireUser, async (req, res) => {
  const config = await getConfig();
  res.json({
    happy_hour_active: isHappyHourActive(config),
  });
});

router.get("/", authenticate, requireRole("admin"), requireUser, async (req, res) => {
  const config = await getConfig();
  res.json(config);
});

router.put("/", authenticate, requireRole("admin"), requireUser, async (req, res) => {
  const current = await getConfig();
  const {
    happy_hour_days = current.happy_hour_days,
    happy_hour_start_time = current.happy_hour_start_time,
    happy_hour_end_time = current.happy_hour_end_time,
  } = req.body;

  if (happy_hour_days != null) {
    if (!Array.isArray(happy_hour_days)) {
      return res.status(400).json({ error: "happy_hour_days must be an array" });
    }

    if (happy_hour_days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      return res.status(400).json({ error: "happy_hour_days must contain values 0-6" });
    }
  }

  if (happy_hour_start_time != null && !isValidTime(happy_hour_start_time)) {
    return res.status(400).json({ error: "Invalid happy_hour_start_time" });
  }

  if (happy_hour_end_time != null && !isValidTime(happy_hour_end_time)) {
    return res.status(400).json({ error: "Invalid happy_hour_end_time" });
  }

  const hasSchedule =
    happy_hour_days?.length &&
    happy_hour_start_time &&
    happy_hour_end_time;

  if (hasSchedule && happy_hour_start_time === happy_hour_end_time) {
    return res.status(400).json({ error: "End time must differ from start time" });
  }

  const config = await updateConfig({
    happy_hour_days: happy_hour_days ?? [],
    happy_hour_start_time: happy_hour_start_time ?? null,
    happy_hour_end_time: happy_hour_end_time ?? null,
  });

  await logAudit(null, {
    actorUserId: req.user.id,
    actorUsername: req.user.username,
    action: "config.update",
    entityType: "shop_config",
    details: config,
  });

  res.json(config);
});

module.exports = router;
