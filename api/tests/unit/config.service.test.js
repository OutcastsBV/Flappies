const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isHappyHourActive,
  applyHappyHourPrice,
} = require("../../services/config.service");

describe("config.service", () => {
  it("detects active happy hour on configured weekday and time", () => {
    const now = new Date("2026-07-15T14:00:00");
    const config = {
      happy_hour_days: [3],
      happy_hour_start_time: "13:00",
      happy_hour_end_time: "15:00",
    };

    assert.equal(isHappyHourActive(config, now), true);
    assert.equal(applyHappyHourPrice(10, config, now), 5);
  });

  it("returns regular price outside happy hour window", () => {
    const now = new Date("2026-07-15T16:00:00");
    const config = {
      happy_hour_days: [3],
      happy_hour_start_time: "13:00",
      happy_hour_end_time: "15:00",
    };

    assert.equal(isHappyHourActive(config, now), false);
    assert.equal(applyHappyHourPrice(10, config, now), 10);
  });

  it("returns regular price on unconfigured weekday", () => {
    const now = new Date("2026-07-16T14:00:00");
    const config = {
      happy_hour_days: [3],
      happy_hour_start_time: "13:00",
      happy_hour_end_time: "15:00",
    };

    assert.equal(isHappyHourActive(config, now), false);
  });

  it("treats missing happy hour config as inactive", () => {
    const config = {
      happy_hour_days: [],
      happy_hour_start_time: null,
      happy_hour_end_time: null,
    };
    assert.equal(isHappyHourActive(config), false);
    assert.equal(applyHappyHourPrice(4, config), 4);
  });
});
