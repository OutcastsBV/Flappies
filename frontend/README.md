# Flappies frontend

The Next.js application that powers the Flappies kiosk: the POS checkout screen, the login flows (password, OAuth, RFID), and the admin dashboard for managing products, inventory, users, and reports.

See the [repository README](../README.md) for the full picture of how this fits together with the API and ZITADEL, and the [deployment guide](../docs/DEPLOYMENT.md) for running it in production.

## Running locally

```bash
cp .env.example .env.local   # point at your local API + ZITADEL
npm install
npm run dev -- -p 3002
```

Open [http://localhost:3002](http://localhost:3002).

## Project structure

| Path | Purpose |
|------|---------|
| `app/` | Routes — `/` (redirect), `/login`, `/callback` (OAuth), `/dashboard` (POS), `/admin` |
| `components/` | Shared UI: modals, admin panels, `SessionMonitor` (auto-logout) |
| `lib/` | `api.ts` (fetch helpers), `auth.ts` (login/logout flows), `session.ts` (idle/expiry tracking), `config.ts`, `types.ts` |
| `tests/unit/` | Vitest unit tests |
| `tests/e2e/` | Playwright end-to-end tests |

## Scripts

```bash
npm run dev          # start the dev server
npm run build        # production build
npm run lint         # ESLint
npm run test:unit    # Vitest
npm run test:e2e     # Playwright
```

## Session security

The app enforces both an **idle timeout** (default 5 minutes of no activity, configurable via `NEXT_PUBLIC_SESSION_IDLE_SECONDS`) and the **absolute expiry** of the underlying access token, so a shared kiosk screen automatically logs out instead of staying open indefinitely. See `lib/session.ts` and `components/SessionMonitor.tsx`.
