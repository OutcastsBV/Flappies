const pool = require("../db");
const appConfig = require("../config/app");
const paymentConfig = require("../config/payments");
const { getAvailableMethods } = require("./topup.service");

function formatTimeValue(value) {
  if (!value) return null;
  const str = String(value);
  return str.length >= 5 ? str.slice(0, 5) : str;
}

function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = String(timeStr).split(":").map(Number);
  return hours * 60 + minutes;
}

async function getConfig() {
  const result = await pool.query(
    `
    SELECT
      happy_hour_days,
      happy_hour_start_time,
      happy_hour_end_time,
      operation_mode,
      top_up_epc_enabled,
      top_up_stripe_enabled
    FROM shop_config
    WHERE id = 1
    `
  );

  const row = result.rows[0] || {
    happy_hour_days: [],
    happy_hour_start_time: null,
    happy_hour_end_time: null,
    operation_mode: appConfig.operationMode,
    top_up_epc_enabled: false,
    top_up_stripe_enabled: false,
  };

  const topUpMethods = getAvailableMethods(row);

  return {
    happy_hour_days: row.happy_hour_days || [],
    happy_hour_start_time: formatTimeValue(row.happy_hour_start_time),
    happy_hour_end_time: formatTimeValue(row.happy_hour_end_time),
    operation_mode: row.operation_mode || appConfig.operationMode,
    top_up_enabled: topUpMethods.length > 0,
    top_up_methods: topUpMethods,
    top_up_epc_enabled: row.top_up_epc_enabled,
    top_up_stripe_enabled: row.top_up_stripe_enabled,
    top_up_epc_configured: paymentConfig.isEpcConfigured(),
    top_up_stripe_configured: paymentConfig.isStripeConfigured(),
    payment_methods:
      appConfig.paymentMethods[row.operation_mode || appConfig.operationMode] ||
      ["WALLET"],
  };
}

async function updateConfig({
  happy_hour_days,
  happy_hour_start_time,
  happy_hour_end_time,
  operation_mode,
  top_up_epc_enabled,
  top_up_stripe_enabled,
}) {
  const result = await pool.query(
    `
    UPDATE shop_config
    SET
      happy_hour_days = $1,
      happy_hour_start_time = $2,
      happy_hour_end_time = $3,
      operation_mode = COALESCE($4, operation_mode),
      top_up_epc_enabled = COALESCE($5, top_up_epc_enabled),
      top_up_stripe_enabled = COALESCE($6, top_up_stripe_enabled)
    WHERE id = 1
    RETURNING
      happy_hour_days,
      happy_hour_start_time,
      happy_hour_end_time,
      operation_mode,
      top_up_epc_enabled,
      top_up_stripe_enabled
    `,
    [
      happy_hour_days ?? [],
      happy_hour_start_time ?? null,
      happy_hour_end_time ?? null,
      operation_mode ?? null,
      top_up_epc_enabled ?? null,
      top_up_stripe_enabled ?? null,
    ]
  );

  const row = result.rows[0];
  const topUpMethods = getAvailableMethods(row);

  return {
    happy_hour_days: row.happy_hour_days || [],
    happy_hour_start_time: formatTimeValue(row.happy_hour_start_time),
    happy_hour_end_time: formatTimeValue(row.happy_hour_end_time),
    operation_mode: row.operation_mode,
    top_up_enabled: topUpMethods.length > 0,
    top_up_methods: topUpMethods,
    top_up_epc_enabled: row.top_up_epc_enabled,
    top_up_stripe_enabled: row.top_up_stripe_enabled,
    top_up_epc_configured: paymentConfig.isEpcConfigured(),
    top_up_stripe_configured: paymentConfig.isStripeConfigured(),
    payment_methods:
      appConfig.paymentMethods[row.operation_mode] || ["WALLET"],
  };
}

function isHappyHourActive(config, now = new Date()) {
  const days = config.happy_hour_days;
  const startTime = config.happy_hour_start_time;
  const endTime = config.happy_hour_end_time;

  if (!days?.length || !startTime || !endTime) {
    return false;
  }

  const day = now.getDay();
  if (!days.includes(day)) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function applyHappyHourPrice(price, config, now = new Date()) {
  if (!isHappyHourActive(config, now)) {
    return price;
  }

  return price / 2;
}

module.exports = {
  getConfig,
  updateConfig,
  isHappyHourActive,
  applyHappyHourPrice,
};
