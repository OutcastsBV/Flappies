# Manual QA: observability, happy-hour, support form, audit log

This is a manual test pass for the features that are hard (or not worth it) to
fully cover with automated tests: things that depend on wall-clock time, a
real ZITADEL login flow, a real mailbox, or a real Prometheus/Loki instance.
The full automated suite (`npm test` in both `api/` and `frontend/`) already
covers the logic paths — this checklist is about confirming the wiring works
end to end.

## 1. Set up a local environment with test accounts

### 1.1 Start the stack

```bash
cd docker_infra
cp .env.example .env
docker compose up -d
```

Then follow [Local development](../README.md#local-development) in the main
README (steps 2–5) to set up the app database, ZITADEL project, and start the
API + frontend. You should end up with:

- ZITADEL at `http://localhost:8080`
- The app at `http://localhost:3002`, with one **admin** account already
  working (per [First login](DEPLOYMENT.md#first-login))

### 1.2 Seed a manager + cashier test account

You need an org-scoped ZITADEL PAT to run the seed script. The quickest way to
get one locally: in the ZITADEL console (`http://localhost:8080`), go to
**Users → Service Users**, reuse (or create) a service user with **Org Owner**
permissions on the Flappies org, then **Personal Access Tokens → New**.

```bash
export ZITADEL_URL=http://localhost:8080
export ZITADEL_PAT=<the PAT you just created>
export ZITADEL_ORG_ID=<Flappies org ID — Console → Organizations>
export ZITADEL_PROJECT_ID=<same Project ID used in ZITADEL_PROJECT_ID in api/.env>

./deploy/scripts/seed-test-accounts.sh
```

This prints a manager and a cashier login (defaults: `test.manager@example.com`
/ `TestManager123!` and `test.cashier@example.com` / `TestCashier123!`),
already linked into the app database with the right role. Override
`MANAGER_EMAIL`/`MANAGER_PASSWORD`/`CASHIER_EMAIL`/`CASHIER_PASSWORD` if you'd
rather use your own.

### 1.3 (Optional) Point at local Pushgateway/Loki/SMTP for the observability scenarios

None of these are required to test the core app, and none of them are bundled
by `docker_infra` by default — spin up throwaway containers only if you want
to exercise sections 3–5 below, then set the matching env vars in `api/.env`
and restart the API:

```bash
docker run -d --name pushgateway -p 9091:9091 prom/pushgateway
docker run -d --name loki -p 3100:3100 grafana/loki:2.9.0 -config.file=/etc/loki/local-config.yaml
```

```
PROMETHEUS_PUSHGATEWAY_URL=http://localhost:9091
LOKI_URL=http://localhost:3100
SMTP_HOST=<any test SMTP relay you have, e.g. Mailtrap/Mailhog>
SMTP_USER=...
SMTP_PASSWORD=...
```

---

## 2. Core scenarios (happy hour, payment methods, audit)

1. **Happy-hour badge appears/filters correctly.**
   - As admin: **Admin → Config**, set the happy-hour window to cover the
     next few minutes (e.g. now → +10 min) on today's weekday, save.
   - As cashier: ring up a sale within that window.
   - Back as admin/manager: **Admin → Transactions** — the new sale shows a
     "Happy hour" badge; the dashboard's "Recent sales" list shows it too.
   - Use the "Happy hour only" / "Regular price" filter on the Transactions
     panel and confirm the sale appears/disappears as expected.

2. **Sales-by-payment-method report matches manual checkouts.**
   - As admin: **Payment methods**, enable Stripe (any placeholder secret key),
     SumUp, and Wero.
   - As cashier: ring up one Cash sale and one Stripe sale (with a reference
     note).
   - As admin: **Reports → Sales by payment method** — confirm the
     transaction count and revenue for CASH and STRIPE match what you rang up.

2b. **Wero (Payconiq) QR checkout (sandbox).**
   - As admin: **Config → Wero**, paste a Payconiq Instore Display API key,
     set Environment to `sandbox`, save, and enable Wero.
   - As cashier: add items, open Charge, choose **Wero**. A QR should appear
     (valid ~2 minutes). Scan it with the Payconiq/Wero sandbox app; the sale
     should record itself when the payment succeeds. Closing the modal before
     payment should cancel the QR.
   - Confirm a Wero sale cannot be completed without a successful Payconiq
     payment (no manual "Confirm payment" on that method).

2c. **SumUp Solo terminal checkout.**
   - As admin: **Config → SumUp**, paste the API key and merchant code from
     [me.sumup.com](https://me.sumup.com/settings/api-keys), save, pair the
     Solo with the code on the device (log out of the SumUp app first), then
     enable SumUp.
   - As cashier: Charge → **SumUp**. If several Solos are paired, pick the
     terminal first. The amount should appear on that device. After the
     customer pays, the sale records itself. Closing the modal before
     payment should cancel the terminal prompt.
   - Bluetooth-only Air/Plus readers cannot take this Cloud API payment.
   - Stripe (record-only) can be enabled alongside SumUp so cashiers choose
     Cash, Stripe, or a specific SumUp Solo on the same sale.

3. **Audit tab.**
   - As admin: change a config value (e.g. happy-hour window), toggle a
     payment method, open/close a register, and promote/demote a user's role.
   - As cashier: log a correction (refund/bad price/bad item).
   - As **manager**: open **Admin → Audit** — confirm entries exist for all of
     the above (correct actor, action, entity, and details), and confirm the
     manager can see this tab at all (not just admin).
   - Confirm there is **no** edit/delete/create control anywhere on the Audit
     tab — it's read-only by design.
   - As **cashier**: confirm the Audit tab isn't reachable at all.

---

## 3. Metrics (Prometheus)

Requires `PROMETHEUS_PUSHGATEWAY_URL` set (see 1.3) and the API restarted.

1. Ring up a checkout (cash), then check `curl http://localhost:3001/metrics`
   (or, if `METRICS_TOKEN` is set, `curl -H "Authorization: Bearer $METRICS_TOKEN" ...`)
   — confirm `pos_transactions_total`, `pos_transaction_revenue_total`, and
   `pos_item_units_sold_total` all increased, and every series carries a
   `tenant_id` label matching your `TENANT_ID`.
2. Trigger a 5xx (e.g. temporarily stop `postgres_app` and hit `/ready`) and
   confirm `app_errors_total` increments.
3. Watch the API logs for a line like `Prometheus Pushgateway push loop
   started`, then check the Pushgateway UI (`http://localhost:9091`) — your
   tenant's job/grouping should appear with the same counters.
4. Stop the Pushgateway container and confirm checkout/login keep working —
   the API should only log an occasional `warn`-level "Failed to push
   metrics" line, never a request failure.

## 4. Logging (Loki)

Requires `LOKI_URL` set (see 1.3) and the API restarted.

1. Ring up a checkout and tail the API's console output — every log line
   should include `tenant_id` and `service: "flappies-api"`.
2. Query Loki directly (or via a local Grafana Explore panel pointed at
   `http://localhost:3100`) for `{app="flappies-api"}` and confirm the same
   request-completed log lines arrive there.
3. Stop the Loki container and confirm checkout/login keep working — pino's
   worker-thread transport means a Loki outage should never block a request.

## 5. Support / feature request form

Requires SMTP env vars set (see 1.3) — any local test SMTP relay
(Mailhog/Mailtrap/smtp4dev) works fine, this doesn't need to be a real mailbox.

1. As **cashier**: confirm there is no "Support" button anywhere in the UI
   they can reach.
2. As **manager or admin**: click **Support**, submit a bug report — confirm
   a success message, and confirm the mail arrives at your test SMTP relay,
   addressed to `SUPPORT_EMAIL_TO` (`support@flappies.shop` by default), with
   `replyTo` set to the submitter's email and the tenant ID in the body.
3. Unset the SMTP env vars, restart the API, and submit again — confirm a
   friendly "Support email is not configured for this deployment" error
   (503), not a hang or a stack trace.

## 6. Resilience sanity checks

With Pushgateway/Loki/SMTP all stopped (or unconfigured) at once, and ZITADEL
briefly unreachable (e.g. `docker stop zitadel` for ~15 seconds then start it
again):

1. Confirm an **already-logged-in** cashier can still open the register, add
   items to cart, and check out during the ZITADEL outage (cached JWKS keys
   keep verifying already-issued tokens).
2. Confirm a **fresh login attempt** during the ZITADEL outage fails with a
   clear "temporarily unavailable, please retry" message (503) rather than
   looking like a bad password (401).
3. Confirm none of Pushgateway/Loki/SMTP being down/unconfigured blocks
   login, cart, checkout, or register open/close at any point.

---

## 7. Kubernetes chart sanity check (optional, if you also touch the Helm chart)

```bash
helm lint deploy/helm/flappies
helm template flappies deploy/helm/flappies -f deploy/helm/flappies/values-production.example.yaml \
  | grep -E '^kind:' | sort | uniq -c
```

Confirm the rendered resource kinds are limited to Postgres (app only),
API, frontend, and Ingress/Secret/ConfigMap — no ZITADEL or monitoring
templates should render.

Optionally, dry-run tenant provisioning against your local ZITADEL:

```bash
export ZITADEL_URL=http://localhost:8080
export ZITADEL_IAM_PAT=<instance admin PAT>
export TENANT_SLUG=qa-test
export TENANT_FRONTEND_URL=http://localhost:3002
export TENANT_ADMIN_EMAIL=qa-admin@example.com
export TENANT_ADMIN_PASSWORD='Str0ng-Initial-Password!'

./deploy/scripts/provision-tenant-zitadel.sh
```

Confirm it creates an Organization, Project (with the three roles), OIDC
application, service user, and admin user, and that the printed `ZITADEL_*`
values let a freshly pointed API/frontend log in as that admin.
