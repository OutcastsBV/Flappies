const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../../db");
const { logAudit, getAuditLog, getAuditLogEntry } = require("../../services/audit.service");

afterEach(() => {
  mock.restoreAll();
});

describe("services/audit.service (insert-only)", () => {
  it("inserts a row via the pool by default", async () => {
    const query = mock.method(pool, "query", async () => ({ rows: [] }));

    await logAudit(null, {
      actorUserId: 1,
      actorUsername: "amy",
      action: "config.update",
      entityType: "shop_config",
      entityId: 5,
      details: { happy_hour_days: [1, 2] },
    });

    assert.equal(query.mock.callCount(), 1);
    const [sql, params] = query.mock.calls[0].arguments;
    assert.match(sql, /INSERT INTO audit_log/);
    assert.doesNotMatch(sql, /UPDATE|DELETE/i);
    assert.deepEqual(params, [
      1,
      "amy",
      "config.update",
      "shop_config",
      "5",
      JSON.stringify({ happy_hour_days: [1, 2] }),
    ]);
  });

  it("uses a provided client (e.g. an open transaction) instead of the default pool", async () => {
    const poolQuery = mock.method(pool, "query", async () => ({ rows: [] }));
    const clientQuery = mock.fn(async () => ({ rows: [] }));
    const client = { query: clientQuery };

    await logAudit(client, {
      action: "register.open",
      entityType: "register_session",
      entityId: 7,
    });

    assert.equal(clientQuery.mock.callCount(), 1);
    assert.equal(poolQuery.mock.callCount(), 0);
  });

  it("defaults actor fields, entityId, and details when omitted", async () => {
    const query = mock.method(pool, "query", async () => ({ rows: [] }));

    await logAudit(null, { action: "register.close", entityType: "register_session" });

    const [, params] = query.mock.calls[0].arguments;
    assert.deepEqual(params, [null, null, "register.close", "register_session", null, "{}"]);
  });

  it("requires an action and entityType, and never touches the database without them", async () => {
    const query = mock.method(pool, "query", async () => ({ rows: [] }));

    await assert.rejects(logAudit(null, { entityType: "user" }), /action and entityType/);
    await assert.rejects(logAudit(null, { action: "user.update" }), /action and entityType/);
    assert.equal(query.mock.callCount(), 0);
  });

  it("swallows write failures instead of throwing, so the audited action itself still succeeds", async () => {
    mock.method(pool, "query", async () => {
      throw new Error("connection reset");
    });

    await assert.doesNotReject(
      logAudit(null, { action: "user.update", entityType: "user", entityId: 1 })
    );
  });

  it("exposes no update/delete helpers at all", () => {
    const auditService = require("../../services/audit.service");
    assert.equal(auditService.updateAuditLog, undefined);
    assert.equal(auditService.deleteAuditLog, undefined);
  });
});

describe("services/audit.service getAuditLog (filter building)", () => {
  it("returns all rows unfiltered with default pagination", async () => {
    const query = mock.method(pool, "query", async () => ({ rows: [{ id: 1 }] }));

    const rows = await getAuditLog();

    assert.deepEqual(rows, [{ id: 1 }]);
    const [sql, params] = query.mock.calls[0].arguments;
    assert.doesNotMatch(sql, /WHERE/);
    assert.deepEqual(params, [100, 0]);
  });

  it("builds a WHERE clause combining action/entity_type/from/to filters", async () => {
    const query = mock.method(pool, "query", async () => ({ rows: [] }));

    await getAuditLog({
      action: "config.update",
      entity_type: "shop_config",
      from: "2026-01-01",
      to: "2026-01-31",
      limit: 10,
      offset: 20,
    });

    const [sql, params] = query.mock.calls[0].arguments;
    assert.match(sql, /WHERE action = \$1 AND entity_type = \$2 AND created_at >= \$3 AND created_at <= \$4/);
    assert.deepEqual(params, ["config.update", "shop_config", "2026-01-01", "2026-01-31", 10, 20]);
  });

  it("clamps limit between 1 and 500 and offset to a non-negative number", async () => {
    const query = mock.method(pool, "query", async () => ({ rows: [] }));

    await getAuditLog({ limit: 10000, offset: -5 });
    let [, params] = query.mock.calls[0].arguments;
    assert.deepEqual(params, [500, 0]);

    await getAuditLog({ limit: -5 });
    [, params] = query.mock.calls[1].arguments;
    assert.equal(params[0], 1);
  });

  it("fetches a single entry by id, returning null when not found", async () => {
    const query = mock.method(pool, "query", async (sql, params) => {
      assert.match(sql, /WHERE id = \$1/);
      assert.deepEqual(params, [42]);
      return { rows: [] };
    });

    const entry = await getAuditLogEntry(42);
    assert.equal(entry, null);
    assert.equal(query.mock.callCount(), 1);
  });
});
