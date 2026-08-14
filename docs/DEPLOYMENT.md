# Deployment guide

This is the full, step-by-step guide to running a Flappies **tenant** on your own server — written so someone who has **never touched this project** can go from a blank VPS to a working, logged-in POS system.

If you just want to poke around the code locally, see [Local development](../README.md#local-development) in the main README instead. If you're deploying to Kubernetes instead of a single VPS, see the [Kubernetes guide](KUBERNETES.md) — the two-tier architecture and support boundary described below apply identically there.

## Table of contents

- [Two-tier architecture](#two-tier-architecture)
- [Deploy on a VPS (step by step)](#deploy-on-a-vps-step-by-step)
- [First login](#first-login)
- [Updating the deployment](#updating-the-deployment)
- [Enabling HTTPS with a real domain](#enabling-https-with-a-real-domain)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)

See also: [Manual QA checklist](MANUAL_QA.md) for testing the observability, support-form, and audit-log features end to end once a stack is running.

---

## Two-tier architecture

Flappies is deployed in two layers:

1. **Central/company infrastructure** — shared across every tenant, set up **once** by whoever runs Flappies as a service:
   - A **ZITADEL instance** for identity, with one Organization + Project per tenant (see [Tenant onboarding](#tenant-onboarding-central-zitadel))
   - Optionally, a **Prometheus Pushgateway**, **Loki**, and an **SMTP** relay for observability and the admin "Support / feature request" form
2. **Per-tenant application stack** — deployed **once per customer** (this guide): just Postgres, the API, and the frontend. It does not self-host ZITADEL, Prometheus, Loki, or SMTP — it only *connects out* to whichever of those the central infrastructure provides.

```
                         CENTRAL / COMPANY INFRASTRUCTURE (shared, run once)
                         ────────────────────────────────────────────────
                         ┌───────────┐  ┌──────────────┐  ┌──────┐  ┌──────┐
                         │  ZITADEL  │  │ Prometheus   │  │ Loki │  │ SMTP │
                         │ (per-     │  │ Pushgateway  │  │      │  │      │
                         │  tenant   │  │ (optional)   │  │(opt.)│  │(opt.)│
                         │  Org/     │  └──────▲───────┘  └───▲──┘  └───▲──┘
                         │  Project) │         │              │         │
                         └─────▲─────┘         │              │         │
                               │ OIDC           │ metrics push │ logs    │ SMTP
                               │                │              │         │
                 ┌─────────────┴────────────────┴──────────────┴─────────┴───┐
                 │                    TENANT STACK (this guide)               │
                 │                                                            │
                 │  ┌───────────┐   REST   ┌───────────┐         ┌─────────┐ │
                 │  │ Frontend  │ ────────►│    API    │ ───────►│ Postgres│ │
                 │  │ (Next.js) │          │ (Express) │         │ (app)   │ │
                 │  └───────────┘          └───────────┘         └─────────┘ │
                 └────────────────────────────────────────────────────────────┘
```

Everything in the tenant stack runs in Docker containers, built by GitHub Actions and pulled from a private GitHub Container Registry (GHCR). The VPS never needs to build anything — this keeps it usable on a **1 GB RAM** Proxmox LXC / small VPS.

> **Support boundary:** Flappies (this project) is only responsible for the connection between the tenant app and ZITADEL/Prometheus/Loki/SMTP — request timeouts, retries, graceful degradation if one is unreachable, and correct tenant labeling (`TENANT_ID`) on metrics/logs. Running, scaling, and troubleshooting those services themselves (or picking/paying for a managed provider) is the company's/self-hoster's own responsibility, not something this app's maintainers support.

### Tenant onboarding (central ZITADEL)

Before deploying a tenant's app stack, that tenant needs an Organization, Project, OIDC application, and service user in the **central** ZITADEL instance. Do this once per tenant, against the central instance (not the tenant's own VPS):

```bash
export ZITADEL_URL=https://auth.company.example.com   # central instance
export ZITADEL_IAM_PAT=<instance-admin PAT>            # one-off, never stored in the tenant deployment
export TENANT_SLUG=acme-corp
export TENANT_FRONTEND_URL=https://acme.flappies.example.com
export TENANT_ADMIN_EMAIL=admin@acme-corp.example.com
export TENANT_ADMIN_PASSWORD='Str0ng-Initial-Password!'

./deploy/scripts/provision-tenant-zitadel.sh
```

This creates the Organization, the `flappies` Project with the `admin`/`manager`/`cashier` roles, an OIDC application, a service (machine) user for password-login impersonation, and the tenant's first admin user — then prints the `ZITADEL_*` values you paste into that tenant's `deploy/.env` (see [Step 4](#step-4--create-and-edit-your-env) below) or Helm `secrets.zitadel*` values.

The script covers the ZITADEL Management/Auth v2 API calls it knows about; ZITADEL's HTTP API has changed shape across versions, so double check the printed values against your instance's version. If it fails partway through or you'd rather do it by hand, the equivalent manual console steps are:

<details>
<summary>Manual ZITADEL console steps (only needed if the script doesn't work for your ZITADEL version)</summary>

1. **Organizations** → create one for the tenant (e.g. `acme-corp`)
2. Inside that org, **Projects** → create `flappies`, then **Project → Roles** → add `admin`, `manager`, `cashier`
3. **Applications** → **New** → **Web** → **Code** (a confidential client with a client secret — **not** "User Agent"/PKCE, the API needs a secret for token exchange)
   - Redirect URIs: `<tenant frontend URL>/callback`
   - Post-logout redirect URIs: `<tenant frontend URL>/`
   - Grant types: **Authorization Code**, **Refresh Token**, and **Token Exchange** (easy to miss, required for password login)
   - Save, then copy the **Client ID**, **Client Secret**, and the project's **Project ID**
4. **Users → Service Users → New** to create a machine user (e.g. `flappies-service`), then:
   - **Keys / Client credentials** → generate a Client ID + Secret
   - **Personal Access Tokens** → create a PAT
5. Grant that service user the **Instance Login Client** role (`IAM_LOGIN_CLIENT`) at `<ZITADEL_URL>/ui/console/instance/members` — required for password login via the Session API
6. Enable **Allow Impersonation** under Instance → Security Settings (`<ZITADEL_URL>/ui/console/instance?id=security`) — required for the token-exchange step after password verification
7. Grant the service user the **Org End User Impersonator** role (`ORG_END_USER_IMPERSONATOR`) at the org level, and enough authorization-management permission (e.g. **Org Owner**) to assign/update the `admin`/`manager`/`cashier` project role from the app's own admin panel later
8. Create the tenant's first human user and grant them the project's **`admin`** role under **Projects → flappies → Authorizations**

Once the first tenant admin can log in, all further role management (creating cashiers/managers, promoting/demoting) is done from the app's own **Admin → Users** panel — it calls the ZITADEL Authorization v2 API on your behalf, so you shouldn't need to touch **Authorizations** in the ZITADEL console again for this tenant.

</details>

---

## Deploy on a VPS (step by step)

### What you need before starting

- A VPS or LXC container with **Docker** and **Docker Compose v2** installed (`docker compose version` should work)
- At least **1 GB RAM** (2 GB+ recommended; add swap on 1 GB boxes — see [Troubleshooting](#troubleshooting))
- The server's public IP address or a domain name pointed at it
- A **GitHub Personal Access Token (PAT)** with `read:packages` scope, to pull the private images
- Ports **3001** and **3002** reachable from wherever your users/browsers are (open them in your firewall / router) — there is no local ZITADEL port to open, since it lives on the central infrastructure
- This tenant already provisioned in the **central ZITADEL** (see [Tenant onboarding](#tenant-onboarding-central-zitadel) above) — you'll need the `ZITADEL_URL`, client ID/secret, project ID, and impersonator PAT/credentials it prints
- (Optional) URLs/credentials for the company's Prometheus Pushgateway, Loki, and an SMTP relay, if you want metrics, log shipping, and the support-request form

### Step 1 — Publish the images (once, from GitHub)

Images are built by `.github/workflows/docker-publish.yml`. It runs automatically on every push to `main` (using the workflow's defaults), but you should run it manually **once per tenant** with that tenant's actual public host and ZITADEL details, because the frontend bakes URLs in at build time.

1. On GitHub, go to **Actions** → **Publish Docker images** → **Run workflow**
2. Fill in:
   - `public_host`: this tenant's server IP or domain (e.g. `10.61.2.101` or `acme.flappies.example.com`)
   - `api_port`: `3001` (default)
   - `frontend_port`: `3002` (default)
   - `zitadel_url`: the **central** ZITADEL's base URL (e.g. `https://auth.company.example.com`) — from [Tenant onboarding](#tenant-onboarding-central-zitadel)
   - `zitadel_client_id`: the Client ID printed by `provision-tenant-zitadel.sh` for this tenant (defaults to `flappies`)
3. Run it and wait for it to finish (green check)

This publishes two private images (already wired up in `deploy/docker-compose.prod.yml`):

- `ghcr.io/outcastsbv/flappies-api`
- `ghcr.io/outcastsbv/flappies-frontend`

> Forking this repo under a different GitHub org/user? Update the image names in `deploy/docker-compose.prod.yml` and `env.API_IMAGE` / `env.FRONTEND_IMAGE` in `.github/workflows/docker-publish.yml` to match.

> If you change the public host/domain or the ZITADEL URL/client ID later, **re-run this workflow** with the new values — they're compiled into the frontend image, not read at container start.

### Step 2 — Clone the repo on the VPS

```bash
git clone https://github.com/OutcastsBV/Flappies.git
cd Flappies
```

### Step 3 — Log in to GHCR on the VPS

```bash
echo YOUR_GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

If pulling fails with "denied", make sure the packages are linked to this repo: on GitHub, go to the package (**your profile/org → Packages → flappies-api**) → **Package settings** → **Manage Actions access**, and confirm your PAT's account/org has read access (or make the packages public if that's acceptable for you).

### Step 4 — Create and edit your `.env`

```bash
cp deploy/.env.production.example deploy/.env
nano deploy/.env    # or vim / your editor of choice
```

Edit these values at minimum:

| Variable | Set to |
|----------|--------|
| `PUBLIC_HOST` | This tenant's server IP or domain (must match what you used in Step 1) |
| `POSTGRES_PASSWORD` | A strong random password |
| `CONFIG_ENCRYPTION_KEY` | A random 32-byte string (used to encrypt Stripe/SumUp API keys at rest) — generate with `openssl rand -base64 32` |
| `ZITADEL_URL`, `ZITADEL_CLIENT_ID`, `ZITADEL_CLIENT_SECRET`, `ZITADEL_PROJECT_ID`, `ZITADEL_IMPERSONATOR_PAT`, `ZITADEL_IMPERSONATOR_CLIENT_ID`, `ZITADEL_IMPERSONATOR_CLIENT_SECRET`, `ZITADEL_ORG_ID` | The values printed by [`provision-tenant-zitadel.sh`](#tenant-onboarding-central-zitadel) for this tenant |
| `TENANT_ID` | A short, unique slug for this tenant (same as `TENANT_SLUG` used during onboarding) — tags every metric/log line so a shared Prometheus/Loki can filter by tenant |

> **CORS / redirect URLs:** `deploy/.env.production.example` already sets `CORS_ORIGIN`, `FRONTEND_URL`, and `ZITADEL_REDIRECT_URI` based on `PUBLIC_HOST`. Double-check they use the same host/IP you picked in Step 1.

Optionally, also fill in (all are safe to leave blank/commented — each feature degrades gracefully rather than blocking core POS operations when unset or unreachable):

| Variable(s) | Enables |
|-------------|---------|
| `PROMETHEUS_PUSHGATEWAY_URL`, `PROMETHEUS_PUSH_INTERVAL_MS`, `METRICS_TOKEN` | Pushing technical (HTTP errors, etc.) and business (items sold, transactions, revenue, corrections) metrics — labeled with `TENANT_ID` — to the company's shared Prometheus, via a Pushgateway |
| `LOKI_URL`, `LOKI_USERNAME`, `LOKI_PASSWORD` | Shipping structured logs (also labeled with `TENANT_ID`) to the company's shared Loki |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SUPPORT_EMAIL_TO` | The admin panel's "Support / feature request" form, which emails `SUPPORT_EMAIL_TO` (defaults to `support@flappies.shop`) over SMTP. Works with any SMTP-capable provider, including Microsoft 365 — see the comments in `deploy/.env.production.example` if the mail provider changes later, it's just a config change |

### Step 5 — Deploy

```bash
chmod +x deploy/scripts/*.sh
./deploy/scripts/deploy-pull.sh
```

This script:

1. Validates that the required ZITADEL/Postgres/encryption-key variables are set in `.env`
2. Pulls all images (Postgres, API, frontend)
3. Starts the app stack
4. Waits for the API to become ready
5. Prints the URLs and the exact next step to link an app admin

At this point the app is **fully configured** — ZITADEL login already works, because this tenant was provisioned in the central instance before the images were even built. What's still missing is a **row in the app database** for the admin user, so they're allowed into the app itself. That's the next section.

---

## First login

ZITADEL authentication succeeding is not enough — every user must also have a row in the **app database**, linked by their ZITADEL user ID.

### 1. Link the tenant admin into the app database

`provision-tenant-zitadel.sh` already created the tenant's first admin user in ZITADEL and printed their user ID. Link it into this VPS's app database:

```bash
./deploy/scripts/bootstrap-app-admin.sh <zitadel-user-uuid> <username> <email>
```

Example:

```bash
./deploy/scripts/bootstrap-app-admin.sh 315294810293847561 admin admin@acme-corp.example.com
```

This inserts (or updates) a row in the app's `user` table with that ZITADEL ID and the `admin` role. Run it with no arguments for a reminder of where to find the ZITADEL user ID.

### 2. Log in

Open `http://<PUBLIC_HOST>:3002/login` and sign in with:

- **Username:** the ZITADEL login name (shown on the user's profile as **Preferred Login Name**) or the user's email
- **Password:** the password you set for that ZITADEL user

You should land on the dashboard. If something fails here, see [Troubleshooting](#troubleshooting) — the error message from the API logs (`docker logs flappies_api`) tells you exactly which step above to revisit.

### 3. Create cashiers and managers

Once logged in as admin, use the app's own **Admin → Users** panel to create manager and cashier accounts — no further ZITADEL console work is needed, the API manages ZITADEL project role grants on your behalf from there.

---

## Updating the deployment

### Code changed (new features, bug fixes)

1. Push to `main` (or manually re-run the **Publish Docker images** workflow if you need this tenant's specific host/ZITADEL values)
2. On the VPS:

   ```bash
   cd Flappies
   git pull
   ./deploy/scripts/deploy-pull.sh
   ```

`deploy-pull.sh` always pulls the `latest` tag and restarts changed containers; database data is untouched (it lives in a Docker volume).

### Only restarting (no new images)

```bash
./deploy/scripts/restart-prod.sh
```

### Checking stack health at any time

```bash
./deploy/scripts/check-stack.sh
```

Prints container status, port reachability, recent API logs, and the current app-database users.

---

## Enabling HTTPS with a real domain

The setup above uses plain HTTP and an IP address, which is fine for a closed/internal deployment. For a public domain, put a reverse proxy in front of the API and frontend and terminate TLS there — both keep running on plain HTTP internally.

Example using [Caddy](https://caddyserver.com/) (automatic HTTPS via Let's Encrypt):

```caddy
api.example.com {
    reverse_proxy localhost:3001
}

flappies.example.com {
    reverse_proxy localhost:3002
}
```

Then:

1. Point DNS records for both subdomains at your server
2. Update `deploy/.env`:
   ```env
   PUBLIC_HOST=flappies.example.com   # used for reference only once you're using distinct hostnames
   ZITADEL_REDIRECT_URI=https://flappies.example.com/callback
   CORS_ORIGIN=https://flappies.example.com
   FRONTEND_URL=https://flappies.example.com
   COOKIE_SECURE=true
   ```
3. Re-run the **Publish Docker images** workflow with the new `public_host`/URLs so the frontend bakes in the HTTPS URLs
4. Update this tenant's OIDC application redirect URIs in the central ZITADEL console to the HTTPS URLs
5. `./deploy/scripts/deploy-pull.sh`

---

## Backups

The app database lives in a named Docker volume (`postgres_data`). Back it up regularly — it's the source of truth for users, products, and transactions:

```bash
docker exec flappies_postgres pg_dump -U flappies flappies > backup-$(date +%F).sql
```

Restore:

```bash
cat backup-2026-01-01.sql | docker exec -i flappies_postgres psql -U flappies -d flappies
```

There is no ZITADEL database to back up here — user/role data for this tenant lives in the central ZITADEL instance, which the team running that shared infrastructure is responsible for backing up.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `docker compose` not found | Old Docker install | Install Docker Compose v2 plugin, or use `docker-compose` (v1 syntax) |
| Pulling images fails with "denied" | GHCR PAT lacks access | `docker login ghcr.io` with a PAT that has `read:packages`; check package's **Manage Actions access** |
| `deploy-pull.sh` fails with "X is not set in .env" | Tenant not (fully) provisioned in the central ZITADEL yet | Run `./deploy/scripts/provision-tenant-zitadel.sh` against the central instance and fill in the printed values |
| API logs `Authentication service (ZITADEL JWKS) unreachable` / requests return `503` | Central ZITADEL is temporarily unreachable from this VPS | Transient — the API returns `503` instead of crashing so cashiers see a clear "temporarily unavailable" instead of a broken app; check network/firewall to `ZITADEL_URL` if it persists |
| Login redirect fails / blank callback page | Redirect URI mismatch | The tenant's OIDC application redirect URI in ZITADEL must exactly match `ZITADEL_REDIRECT_URI` (scheme + host + port + path) |
| Password login: `User could not be found` | Wrong login name format | Use the ZITADEL **Preferred Login Name** or the user's email, not an arbitrary username |
| Password login: `membership not found` | Service user missing **Instance Login Client** | Central ZITADEL console → Instance → Members → grant `IAM_LOGIN_CLIENT` to the service user; restart the API |
| Password login: `token-exchange ... not allowed` | OIDC app missing **Token Exchange** grant | Edit the app → enable Token Exchange grant type; must be a Web/Code client with a secret |
| Password login: `Impersonation.PolicyDisabled` | Instance-wide impersonation is off | Central ZITADEL console → Instance → **Security Settings** → enable **Allow Impersonation** |
| Login succeeds but app says "User not allowed in this application" | No matching row in app DB | Run `./deploy/scripts/bootstrap-app-admin.sh <zitadel-user-id> <username> <email>` with the correct user ID |
| Creating/editing a user's role fails | Missing `ZITADEL_PROJECT_ID`, or service user lacks authorization-management permission | Re-check [Tenant onboarding](#tenant-onboarding-central-zitadel) — the service user needs org-level authorization-management rights |
| CORS errors in the browser console | Frontend/API origin mismatch | `CORS_ORIGIN` in `deploy/.env` must exactly match the URL the browser uses for the frontend |
| Frontend shows old URLs after changing `.env` | Frontend URLs are baked in at build time | Re-run the **Publish Docker images** workflow with the new values, then `./deploy/scripts/deploy-pull.sh` |
| Metrics not showing up in the master Prometheus | `PROMETHEUS_PUSHGATEWAY_URL` unset, unreachable, or `TENANT_ID` not unique | Check `deploy/.env`; the push loop logs (but does not crash on) failed pushes — `docker logs flappies_api \| grep -i pushgateway` |
| Logs not showing up in Loki | `LOKI_URL`/credentials unset or wrong | Check `deploy/.env`; the app keeps logging to stdout regardless, so `docker logs flappies_api` always works even if Loki shipping is broken |
| Support form submission fails | `SMTP_HOST` unset or SMTP credentials wrong | The API returns a clear "support form is not configured" error when `SMTP_HOST` is unset; check `docker logs flappies_api` for the SMTP error otherwise |
| Out of memory on a 1 GB VPS | Postgres + API + frontend under memory pressure | Add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` (persist in `/etc/fstab`) |

For anything else, `./deploy/scripts/check-stack.sh` prints container status, recent logs, and app-database contents in one shot.
