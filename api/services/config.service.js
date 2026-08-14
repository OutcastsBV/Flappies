const pool = require("../db");

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
      happy_hour_end_time
    FROM shop_config
    WHERE id = 1
    `
  );

  const row = result.rows[0] || {
    happy_hour_days: [],
    happy_hour_start_time: null,
    happy_hour_end_time: null,
  };

  return {
    happy_hour_days: row.happy_hour_days || [],
    happy_hour_start_time: formatTimeValue(row.happy_hour_start_time),
    happy_hour_end_time: formatTimeValue(row.happy_hour_end_time),
  };
}

async function updateConfig({
  happy_hour_days,
  happy_hour_start_time,
  happy_hour_end_time,
}) {
  const result = await pool.query(
    `
    UPDATE shop_config
    SET
      happy_hour_days = $1,
      happy_hour_start_time = $2,
      happy_hour_end_time = $3
    WHERE id = 1
    RETURNING
      happy_hour_days,
      happy_hour_start_time,
      happy_hour_end_time
    `,
    [happy_hour_days ?? [], happy_hour_start_time ?? null, happy_hour_end_time ?? null]
  );

  const row = result.rows[0];

  return {
    happy_hour_days: row.happy_hour_days || [],
    happy_hour_start_time: formatTimeValue(row.happy_hour_start_time),
    happy_hour_end_time: formatTimeValue(row.happy_hour_end_time),
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
