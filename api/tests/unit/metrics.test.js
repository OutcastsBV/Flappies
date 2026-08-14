const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.TENANT_ID = "unit-test-tenant";
delete process.env.PROMETHEUS_PUSHGATEWAY_URL;

const metrics = require("../../lib/metrics");

after(() => {
  metrics.stopMetricsPush();
});

describe("lib/metrics", () => {
  it("tags the registry with the configured tenant_id as a default label", async () => {
    assert.equal(metrics.tenantId, "unit-test-tenant");

    const output = await metrics.register.metrics();
    // Default labels only show up on series once at least one has been
    // recorded; collectDefaultMetrics() guarantees at least a process metric.
    assert.match(output, /tenant_id="unit-test-tenant"/);
  });

  it("increments technical counters (http requests, app errors)", async () => {
    metrics.httpRequestsTotal.inc({ method: "GET", route: "/health", status_code: 200 });
    metrics.appErrorsTotal.inc({ type: "unit_test" });

    const output = await metrics.register.metrics();
    assert.match(output, /http_requests_total\{[^}]*route="\/health"[^}]*\} 1/);
    assert.match(output, /app_errors_total\{[^}]*type="unit_test"[^}]*\} 1/);
  });

  it("increments business counters (items sold, transactions, revenue, corrections)", async () => {
    metrics.itemUnitsSoldTotal.inc({ product_name: "Cola" }, 3);
    metrics.transactionsTotal.inc({ payment_method: "CASH" });
    metrics.transactionRevenueTotal.inc({ payment_method: "CASH" }, 7.5);
    metrics.correctionsTotal.inc({ type: "REFUND" });

    const output = await metrics.register.metrics();
    assert.match(output, /pos_item_units_sold_total\{[^}]*product_name="Cola"[^}]*\} 3/);
    assert.match(output, /pos_transactions_total\{[^}]*payment_method="CASH"[^}]*\} 1/);
    assert.match(output, /pos_transaction_revenue_total\{[^}]*payment_method="CASH"[^}]*\} 7\.5/);
    assert.match(output, /pos_corrections_total\{[^}]*type="REFUND"[^}]*\} 1/);
  });

  it("does nothing when PROMETHEUS_PUSHGATEWAY_URL is unset", () => {
    delete process.env.PROMETHEUS_PUSHGATEWAY_URL;
    assert.doesNotThrow(() => metrics.startMetricsPush());
    metrics.stopMetricsPush();
  });

  it("guards the push loop against overlapping requests and tolerates a slow/erroring gateway", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    let requestCount = 0;

    const server = http.createServer((req, res) => {
      requestCount += 1;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);

      // Slower than the push interval below, so an in-flight guard is
      // required to prevent requests from piling up concurrently.
      setTimeout(() => {
        concurrent -= 1;
        res.writeHead(200);
        res.end();
      }, 150);
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    process.env.PROMETHEUS_PUSHGATEWAY_URL = `http://127.0.0.1:${port}`;
    process.env.PROMETHEUS_PUSH_INTERVAL_MS = "40";

    metrics.startMetricsPush();
    await new Promise((resolve) => setTimeout(resolve, 350));
    metrics.stopMetricsPush();

    await new Promise((resolve) => server.close(resolve));

    assert.ok(requestCount >= 1, "expected at least one push attempt");
    assert.equal(maxConcurrent, 1, "pushes must never overlap");
    // With a 150ms gateway and a 40ms tick, the in-flight guard should have
    // skipped several ticks rather than queuing ~8 concurrent requests.
    assert.ok(requestCount < 8, `expected skipped ticks, got ${requestCount} requests`);

    delete process.env.PROMETHEUS_PUSHGATEWAY_URL;
  });
});
