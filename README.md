# Flappies

A self-hosted point-of-sale system built for clubs, non-profits, and small venues that want a simple wallet-based kiosk: members top up a balance, then pay for drinks/snacks with a password, an OAuth login, or by tapping an RFID card.

It's a Next.js frontend, a Node.js/Express API, a PostgreSQL database, and [ZITADEL](https://zitadel.com/) for authentication — all shipped as Docker images so it runs comfortably on a small VPS or a Raspberry Pi-class box behind the counter.

---

## Features

- **Point-of-sale checkout** — fast product grid, cart, and wallet-balance checkout for kiosk use
- **Three ways to log in** — username/password, OAuth redirect, or tap an RFID card (all backed by ZITADEL)
- **Wallet top-ups** — manual admin top-up today, with EPC QR and Stripe/Mollie support ready to enable (see [`docs/PAYMENTS.md`](docs/PAYMENTS.md))
- **Admin dashboard** — manage products, inventory, users, and view sales reports
- **Auto-logout session security** — idle and absolute session timeouts so a shared kiosk screen can't be used by the wrong person after someone walks away
- **Runs anywhere** — a handful of Docker containers; no external services required beyond what's bundled

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | [Next.js](https://nextjs.org/) (App Router), TypeScript |
| API | [Express](https://expressjs.com/) on Node.js, WebSocket for RFID |
| Database | PostgreSQL |
| Identity | [ZITADEL](https://zitadel.com/) (OIDC) |
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
        │ REST + WebSocket                   │
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

Optional: ESP32 RFID scanner → WebSocket → API (/ws/rfid)
```

| Component | Default port | Purpose |
|-----------|-------------|---------|
| Frontend | 3002 | POS UI, login, admin |
| API | 3001 | REST API, auth, RFID WebSocket |
| ZITADEL | 8080 | Identity provider (OIDC) |
| App PostgreSQL | internal only | Users, products, transactions |
| ZITADEL PostgreSQL | internal only | ZITADEL's own data |

---

## Getting started

Want to deploy this for real, on a VPS? Jump straight to the **[deployment guide](docs/DEPLOYMENT.md)** — it walks through publishing images, configuring ZITADEL, and going live, step by step.

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
psql -U kassa -d kassasysteem -f db_migrations/db_init.sql
psql -U kassa -d kassasysteem -f db_migrations/db_patch_1.sql
# … continue through the highest-numbered db_patch_*.sql
```

Or use the bundled test Postgres container: `npm run test:db:up` (maps to `localhost:5434`).

### 3. Configure ZITADEL

Follow [Configure ZITADEL for login](docs/DEPLOYMENT.md#configure-zitadel-for-login) in the deployment guide, substituting `localhost` for `<PUBLIC_HOST>`.

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
├── api/                          Express API (REST + RFID WebSocket)
│   ├── config/                   Env/config loading (auth.js, payments.js, ...)
│   ├── db/                       Postgres connection pool
│   ├── lib/                      Cookies, logger, RFID code helpers
│   ├── middleware/                JWT auth, role checks, token store
│   ├── payments/                  EPC QR / wallet payment helpers
│   ├── routes/                    auth, cart, product, inventory, transaction, report, topup, user, config
│   ├── services/                  Business logic (checkout, ZITADEL, users, receipts, ...)
│   ├── scripts/                   migrate.js, run-tests.js
│   ├── tests/                     unit/, http/, e2e/, helpers/
│   ├── Dockerfile
│   └── .env.example              Local API environment template
│
├── frontend/                     Next.js POS + admin UI
│   ├── app/                       Routes: /, /login, /callback, /dashboard, /admin
│   ├── components/                 UI components (admin panels, modals, SessionMonitor)
│   ├── lib/                        api.ts, auth.ts, session.ts, config.ts, types.ts
│   ├── tests/                      unit/ (Vitest), e2e/ (Playwright)
│   ├── Dockerfile
│   └── .env.example               Local frontend environment template
│
├── deploy/                       Everything needed to run the stack on a VPS
│   ├── docker-compose.prod.yml    Production stack (pull-only, GHCR images)
│   ├── docker-compose.test.yml    Throwaway Postgres for local test runs
│   ├── .env.production.example    VPS environment template → copy to deploy/.env
│   └── scripts/
│       ├── deploy-pull.sh         Pull latest images + start/update the full stack
│       ├── restart-prod.sh        Restart without pulling new images
│       ├── check-stack.sh         Container status, ports, logs, app DB contents
│       └── bootstrap-app-admin.sh Link a ZITADEL user into the app database
│
├── docker_infra/                 Docker Compose for local dev infrastructure
│   ├── docker-compose.yml         ZITADEL + Postgres + Redis/MinIO/Vault/Unleash/Prometheus/Grafana
│   ├── app-db-init/                run-migrations.sh
│   ├── prometheus/ , alertmanager/ Metrics/alerting config
│   └── .env.example
│
├── db_migrations/                 SQL schema: db_init.sql, db_patch_1.sql … db_patch_8.sql
├── scanner_utils/read_ws/         ESP32 RFID → WebSocket test bridge
├── load-tests/                    k6 load test (api-health.js)
├── docs/                          DEPLOYMENT.md (VPS setup), PAYMENTS.md (top-up options)
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
