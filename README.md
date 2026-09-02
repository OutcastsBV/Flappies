# Flappies

A self-hosted cash register system built for clubs, non-profits, and small venues: cashiers open a till with a starting cash float, ring up sales with cash, Stripe, SumUp, or Wero (Payconiq), and log corrections (refunds, bad prices, bad items) against past sales, all with role-based staff accounts.

It's a Next.js frontend, a Node.js/Express API, a PostgreSQL database, and [ZITADEL](https://zitadel.com/) for authentication — all shipped as Docker images so it runs comfortably on a small VPS or a Raspberry Pi-class box behind the counter.

---

## Features

- **Cashier POS checkout** — fast product grid, cart, and a charge modal supporting cash (with tendered/change-due) or any enabled card provider
- **Register (till) sessions** — cashiers open a register with a starting cash amount and close it with a counted-cash reconciliation; expected vs. counted cash variance is tracked per session
- **Corrections** — log a refund, bad price, bad item, or other adjustment against any past transaction, with a reason and running net total
- **Modular payment methods** — Cash, Stripe, SumUp, and Wero (Payconiq) can each be enabled/disabled and configured (API keys) independently from the admin dashboard. The hosting owner can hide a method entirely per tenant with `PAYMENT_<METHOD>_AVAILABLE=false`. Wero shows a live Payconiq QR at checkout; SumUp sends the amount to a paired Solo terminal; Stripe is recorded only (payment is taken on Stripe's own terminal/app)
- **Role-based staff accounts** — Admin (full control incl. config), Manager (everything except managing other managers/admins or changing config), and Cashier (POS + corrections)
- **Happy hour** — a configurable discount window flags and badges affected sales, and reports/transactions can filter by it
- **Admin dashboard** — manage products, inventory, users/roles, payment methods, register session history, and sales reports (including a breakdown by payment method)
- **Read-only audit log** — every sensitive admin/manager action (user/role changes, config edits, payment method changes, register open/close, corrections) is recorded and can never be edited or deleted, even by an admin, even via direct SQL
- **Observability** — optional Prometheus metrics (via a Pushgateway) and Loki log shipping, both tagged with a `TENANT_ID` for a shared, company-run monitoring stack; brief outages of either never block checkout or login
- **Support / feature request form** — admins/managers can email the support team straight from the admin panel
- **Auto-logout session security** — idle and absolute session timeouts so a shared register screen can't be used by the wrong person after someone walks away
- **Runs anywhere** — a handful of Docker containers; no required external services beyond ZITADEL (Prometheus/Loki/SMTP are all optional)

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | [Next.js](https://nextjs.org/) (App Router), TypeScript |
| API | [Express](https://expressjs.com/) on Node.js |
| Database | PostgreSQL |
| Identity | [ZITADEL](https://zitadel.com/) (OIDC), roles synced via the Authorization v2 API |
| Packaging | Docker + Docker Compose |
| Testing | Vitest, Playwright, and a small Node test runner |

## Architecture

```
Browser / POS terminal
        │
        ▼
┌───────────────┐     OAuth/OIDC      ┌─────────────┐
│   Frontend    │ ◄──────────────────►│   ZITADEL   │
│  (Next.js)    │                     │   :8080     │
└───────┬───────┘                     └──────┬──────┘
        │ REST                               │
        ▼                                    ▼
┌───────────────┐                     ┌─────────────┐
│     API       │ ◄──────────────────►│ ZITADEL DB  │
│  (Express)    │     PostgreSQL      │ (postgres)  │
└───────┬───────┘                     └─────────────┘
        │
        ▼
┌───────────────┐
│   App DB      │
│ (postgres)    │
└───────────────┘
```

| Component | Default port | Purpose |
|-----------|-------------|---------|
| Frontend | 3002 | POS UI, login, admin |
| API | 3001 | REST API, auth |
| ZITADEL | 8080 | Identity provider (OIDC) |
| App PostgreSQL | internal only | Users, products, transactions, registers, corrections |
| ZITADEL PostgreSQL | internal only | ZITADEL's own data |

---

## Getting started

Want to deploy this for real? Jump straight to the **[VPS deployment guide](docs/DEPLOYMENT.md)** (Docker Compose) or the **[Kubernetes guide](docs/KUBERNETES.md)** (Helm chart) — both walk through publishing images, configuring ZITADEL, and going live, step by step. Testing observability/support/audit features by hand? See the **[Manual QA checklist](docs/MANUAL_QA.md)**.

The rest of this section is for running the app locally to develop or try it out.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) 22+
- PostgreSQL 16 (local or in Docker)

### 1. Start ZITADEL and supporting infra

```bash
cd docker_infra
cp .env.example .env
docker compose up -d
```

Open ZITADEL at **http://localhost:8080** (default admin: `admin` / `Admin123!`).

### 2. Set up the application database

```bash
psql -U flappies -d flappies -f db_migrations/db_init.sql
psql -U flappies -d flappies -f db_migrations/db_patch_1.sql
# … continue through the highest-numbered db_patch_*.sql
```

Or use the bundled test Postgres container: `npm run test:db:up` (maps to `localhost:5434`).

### 3. Configure ZITADEL

Follow [Tenant onboarding (central ZITADEL)](docs/DEPLOYMENT.md#tenant-onboarding-central-zitadel) in the deployment guide, substituting `localhost` for the tenant frontend URL — or its manual-console fallback if you'd rather click through it by hand.

### 4. Run the API

```bash
cd api
cp .env.example .env   # fill in values from ZITADEL
npm install
npm start
```

### 5. Run the frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev -- -p 3002
```

Open **http://localhost:3002**.

### ZITADEL "Instance not found" on LAN IPs

If you browse to ZITADEL via a LAN IP instead of `localhost` and see `Instance not found`, ZITADEL was initialized with a different `ZITADEL_EXTERNALDOMAIN`. Either always use `localhost`, or set `ZITADEL_EXTERNALDOMAIN` to your LAN IP **before** the first boot (wipe the `docker_infra` ZITADEL Postgres volume if you need to change it after the fact).

### Infrastructure services (docker_infra)

`docker_infra/docker-compose.yml` also runs supporting services for local development:

| Service | Host port | Notes |
|---------|-----------|-------|
| Redis | 6379 | Caching / future use |
| MinIO | 9002 (API), 9001 (console) | Object storage |
| Vault | 8200 | Dev-mode secrets store |
| Unleash | 4242 | Feature flags |
| Prometheus | 9090 | Metrics |
| Grafana | 3000 | Dashboards |

Stop and remove volumes (destructive): `docker compose down -v`.

---

## Running tests

From the repo root:

```bash
npm run install:all
npm run test:unit          # API + frontend unit tests
npm run test:e2e           # API e2e (needs Postgres) + Playwright
npm run test:load          # k6 load test against /health
```

API e2e tests expect Postgres with the default test credentials. Use `npm run test:db:up` (maps to **localhost:5434**) and set `PGPORT=5434` when running e2e locally.

---

## Project layout

```
Flappies/
├── api/                          Express API (REST)
│   ├── config/                   Env/config loading (auth.js, app.js, ...)
│   ├── db/                       Postgres connection pool
│   ├── lib/                      Cookies, logger, config encryption (crypto.js)
│   ├── middleware/                JWT auth, role checks (requireRole)
│   ├── payments/                  Cash, Wero/Payconiq QR, SumUp terminal, record-only Stripe, method registry
│   ├── routes/                    auth, cart, product, inventory, transaction, report, register, corrections, payment-methods, wero, user, config
│   ├── services/                  Business logic (checkout, register, corrections, ZITADEL, users, receipts, ...)
│   ├── scripts/                   migrate.js, run-tests.js
│   ├── tests/                     unit/, http/, e2e/, helpers/
│   ├── Dockerfile
│   └── .env.example              Local API environment template
│
├── frontend/                     Next.js POS + admin UI
│   ├── app/                       Routes: /, /login, /callback, /dashboard (POS), /admin
│   ├── components/                 UI components (admin panels, modals, SessionMonitor)
│   ├── lib/                        api.ts, auth.ts, session.ts, config.ts, types.ts
│   ├── tests/                      unit/ (Vitest), e2e/ (Playwright)
│   ├── Dockerfile
│   └── .env.example               Local frontend environment template
│
├── deploy/                       Everything needed to run the stack on a VPS or Kubernetes
│   ├── docker-compose.prod.yml    Production stack (pull-only, GHCR images)
│   ├── docker-compose.test.yml    Throwaway Postgres for local test runs
│   ├── .env.production.example    VPS environment template → copy to deploy/.env
│   ├── helm/flappies/             Helm chart (see docs/KUBERNETES.md)
│   └── scripts/
│       ├── deploy-pull.sh              Pull latest images + start/update the full stack
│       ├── restart-prod.sh             Restart without pulling new images
│       ├── check-stack.sh              Container status, ports, logs, app DB contents
│       ├── bootstrap-app-admin.sh      Link a ZITADEL user into the app database
│       ├── provision-tenant-zitadel.sh Provision a new tenant in the central ZITADEL
│       └── seed-test-accounts.sh       Create manager/cashier test accounts (see docs/MANUAL_QA.md)
│
├── docker_infra/                 Docker Compose for local dev infrastructure
│   ├── docker-compose.yml         ZITADEL + Postgres + Redis/MinIO/Vault/Unleash/Prometheus/Grafana
│   ├── app-db-init/                run-migrations.sh
│   ├── prometheus/ , alertmanager/ Metrics/alerting config
│   └── .env.example
│
├── db_migrations/                 SQL schema: db_init.sql, db_patch_1.sql … db_patch_12.sql
├── load-tests/                    k6 load test (api-health.js)
├── docs/                          DEPLOYMENT.md (VPS setup), KUBERNETES.md (Helm chart setup), MANUAL_QA.md (test checklist)
├── .github/workflows/             ci.yml (tests), docker-publish.yml (build + push images)
├── package.json                   Root scripts: install:all, test:unit, test:e2e, test:load
└── README.md
```

---

## Contributing

Issues and pull requests are welcome. If you're planning a larger change (new payment provider, auth flow, etc.), please open an issue first to discuss the approach.

1. Fork the repo and create a feature branch
2. Make your changes, adding tests where it makes sense
3. Run `npm run install:all && npm run test:unit && npm run test:e2e` before opening a PR

## License

No license has been published for this repository yet. Please reach out to the repository owner before reusing the code.
