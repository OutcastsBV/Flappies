const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const { getConfig, updateConfig, isHappyHourActive } = require("../services/config.service");

const router = express.Router();

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

router.get("/shop", authenticate, requireUser, async (req, res) => {
  const config = await getConfig();
  res.json({
    operation_mode: config.operation_mode,
    payment_methods: config.payment_methods,
    top_up_enabled: config.top_up_enabled,
    top_up_methods: config.top_up_methods,
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
    operation_mode = current.operation_mode,
    top_up_epc_enabled = current.top_up_epc_enabled,
    top_up_stripe_enabled = current.top_up_stripe_enabled,
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

  if (
    operation_mode != null &&
    !["self_service", "pos"].includes(operation_mode)
  ) {
    return res.status(400).json({ error: "Invalid operation_mode" });
  }

  if (
    top_up_epc_enabled != null &&
    typeof top_up_epc_enabled !== "boolean"
  ) {
    return res.status(400).json({ error: "top_up_epc_enabled must be a boolean" });
  }

  if (
    top_up_stripe_enabled != null &&
    typeof top_up_stripe_enabled !== "boolean"
  ) {
    return res.status(400).json({ error: "top_up_stripe_enabled must be a boolean" });
  }

  const config = await updateConfig({
    happy_hour_days: happy_hour_days ?? [],
    happy_hour_start_time: happy_hour_start_time ?? null,
    happy_hour_end_time: happy_hour_end_time ?? null,
    operation_mode: operation_mode ?? null,
    top_up_epc_enabled: top_up_epc_enabled ?? null,
    top_up_stripe_enabled: top_up_stripe_enabled ?? null,
  });

  res.json(config);
});

module.exports = router;
