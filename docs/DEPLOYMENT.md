# Deployment guide

This is the full, step-by-step guide to running Flappies on your own server — written so someone who has **never touched this project** can go from a blank VPS to a working, logged-in POS system.

If you just want to poke around the code locally, see [Local development](../README.md#local-development) in the main README instead.

## Table of contents

- [Architecture recap](#architecture-recap)
- [Deploy on a VPS (step by step)](#deploy-on-a-vps-step-by-step)
- [Configure ZITADEL for login](#configure-zitadel-for-login)
- [First login](#first-login)
- [Updating the deployment](#updating-the-deployment)
- [Enabling HTTPS with a real domain](#enabling-https-with-a-real-domain)
- [Backups](#backups)
- [RFID card login (optional)](#rfid-card-login-optional)
- [Troubleshooting](#troubleshooting)

---

## Architecture recap

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

Everything runs in Docker containers, built by GitHub Actions and pulled from a private GitHub Container Registry (GHCR). The VPS never needs to build anything — this keeps it usable on a **1 GB RAM** Proxmox LXC / small VPS.

---

## Deploy on a VPS (step by step)

### What you need before starting

- A VPS or LXC container with **Docker** and **Docker Compose v2** installed (`docker compose version` should work)
- At least **1 GB RAM** (2 GB+ recommended; add swap on 1 GB boxes — see [Troubleshooting](#troubleshooting))
- The server's public IP address or a domain name pointed at it
- A **GitHub Personal Access Token (PAT)** with `read:packages` scope, to pull the private images
- Ports **3001**, **3002**, and **8080** reachable from wherever your users/browsers are (open them in your firewall / router)

### Step 1 — Publish the images (once, from GitHub)

Images are built by `.github/workflows/docker-publish.yml`. It runs automatically on every push to `main`, but you should run it manually **once** with your server's actual public IP or domain, because the frontend bakes URLs in at build time.

1. On GitHub, go to **Actions** → **Publish Docker images** → **Run workflow**
2. Fill in:
   - `public_host`: your server's IP or domain (e.g. `10.61.2.101` or `flappies.example.com`)
   - `api_port`: `3001` (default)
   - `frontend_port`: `3002` (default)
   - `zitadel_port`: `8080` (default)
3. Run it and wait for it to finish (green check)

This publishes two private images (already wired up in `deploy/docker-compose.prod.yml`):

- `ghcr.io/outcastsbv/kassasysteem-api`
- `ghcr.io/outcastsbv/kassasysteem-frontend`

> Forking this repo under a different GitHub org/user? Update the image names in `deploy/docker-compose.prod.yml` and `env.API_IMAGE` / `env.FRONTEND_IMAGE` in `.github/workflows/docker-publish.yml` to match.

> If you change the public host/domain later, **re-run this workflow** with the new value — the frontend image must be rebuilt because its API/ZITADEL URLs are compiled in.

### Step 2 — Clone the repo on the VPS

```bash
git clone https://github.com/OutcastsBV/Flappies.git
cd Flappies
```

### Step 3 — Log in to GHCR on the VPS

```bash
echo YOUR_GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

If pulling fails with "denied", make sure the packages are linked to this repo: on GitHub, go to the package (**your profile/org → Packages → kassasysteem-api**) → **Package settings** → **Manage Actions access**, and confirm your PAT's account/org has read access (or make the packages public if that's acceptable for you).

### Step 4 — Create and edit your `.env`

```bash
cp deploy/.env.production.example deploy/.env
nano deploy/.env    # or vim / your editor of choice
```

Edit these values at minimum:

| Variable | Set to |
|----------|--------|
| `PUBLIC_HOST` | Your server's IP or domain (must match what you used in Step 1) |
| `POSTGRES_PASSWORD` | A strong random password |
| `ZITADEL_MASTERKEY` | Exactly **32 characters** — generate with `tr -dc A-Za-z0-9 </dev/urandom \| head -c 32` |
| `ZITADEL_DB_PASSWORD` | A strong random password |
| `ZITADEL_ADMIN_PASSWORD` | A password with upper + lower case + a digit (used to create the ZITADEL console admin on first boot) |
| `RFID_WS_SECRET` | A random string (only matters if you use RFID card login) |

Leave `ZITADEL_CLIENT_SECRET`, `ZITADEL_IMPERSONATOR_PAT`, `ZITADEL_IMPERSONATOR_CLIENT_ID`, and `ZITADEL_IMPERSONATOR_CLIENT_SECRET` as the placeholder values for now — you'll fill these in during [Configure ZITADEL for login](#configure-zitadel-for-login) after the stack is running.

> **CORS / redirect URLs:** `deploy/.env.production.example` already sets `CORS_ORIGIN`, `FRONTEND_URL`, `ZITADEL_URL`, and `ZITADEL_REDIRECT_URI` based on `PUBLIC_HOST`. Double-check they use the same host/IP you picked in Step 1.

### Step 5 — Deploy

```bash
chmod +x deploy/scripts/*.sh
./deploy/scripts/deploy-pull.sh
```

This script:

1. Validates `ZITADEL_MASTERKEY` length and `ZITADEL_ADMIN_PASSWORD` complexity
2. Pulls all images (Postgres ×2, ZITADEL, API, frontend)
3. Starts the full stack
4. Waits for ZITADEL to come up (can take 1–3 minutes on first boot)
5. Prints the URLs and the exact next steps to configure ZITADEL

At this point the **frontend and ZITADEL console are reachable**, but login will not work yet — you still need to create an OAuth application and a service user in ZITADEL. That's the next section.

---

## Configure ZITADEL for login

This is the part that trips people up, so follow it exactly. All of this is a **one-time setup** done in the ZITADEL web console at `http://<PUBLIC_HOST>:8080`.

### 1. Sign in to the ZITADEL console

Open `http://<PUBLIC_HOST>:8080` and sign in with:

- **Username:** value of `ZITADEL_ADMIN_USER` in `deploy/.env` (default `admin`)
- **Password:** value of `ZITADEL_ADMIN_PASSWORD` in `deploy/.env`

### 2. Create the OAuth application

1. **Projects** → create a new project (e.g. `flappies`) or open an existing one
2. **Applications** → **New**
3. Type: **Web** → **Code** (a confidential client with a client secret — **not** "User Agent"/PKCE, the API needs a secret for token exchange)
4. Name: `flappies` (or whatever you called the project)
5. **Redirect URIs**: `http://<PUBLIC_HOST>:3002/callback`
6. **Post-logout redirect URIs**: `http://<PUBLIC_HOST>:3002/`
7. Under **Grant types**, enable:
   - **Authorization Code**
   - **Refresh Token**
   - **Token Exchange** ← easy to miss, required for password login and RFID login
8. Save, then copy the **Client ID** and **Client Secret**

Put them in `deploy/.env`:

```env
ZITADEL_CLIENT_ID=<client id from step above>
ZITADEL_CLIENT_SECRET=<client secret from step above>
```

### 3. Create a service (machine) user

This account lets the API verify passwords and impersonate users after login.

1. **Users** → **Service Users** → **New**
2. Give it a name, e.g. `flappies-service`
3. Open the new user → **Keys** / **Client credentials** → generate a **Client ID + Client Secret** pair, put them in `deploy/.env`:

   ```env
   ZITADEL_IMPERSONATOR_CLIENT_ID=<client id>
   ZITADEL_IMPERSONATOR_CLIENT_SECRET=<client secret>
   ```

4. On the same user → **Personal Access Tokens** → create a **PAT**, put it in `deploy/.env`:

   ```env
   ZITADEL_IMPERSONATOR_PAT=<the PAT>
   ```

### 4. Grant instance-level roles to the service user

Password login uses ZITADEL's Session API, which requires the service user to have the **Instance Login Client** role at the instance level (not project or org level).

1. Go to `http://<PUBLIC_HOST>:8080/ui/console/instance/members`
2. **Add** → select your service user → role **Instance Login Client** (`IAM_LOGIN_CLIENT`)
3. Save

### 5. Enable impersonation

Token exchange (used to turn a verified password/RFID login into an access token) is blocked by default.

1. Go to `http://<PUBLIC_HOST>:8080/ui/console/instance?id=security` (Instance → **Security Settings**)
2. Enable **Allow Impersonation**
3. Save

### 6. Grant org-level impersonator role to the service user

1. Go to **Organization → Members** (or `http://<PUBLIC_HOST>:8080/ui/console/org/members`)
2. **Add** → select your service user → role **Org End User Impersonator** (`ORG_END_USER_IMPERSONATOR`)
3. Save

### 7. Restart the API to pick up the new secrets

```bash
docker compose -f deploy/docker-compose.prod.yml up -d api
```

At this point password login, OAuth redirect login, and RFID login (if you use it) should all work against ZITADEL. What's still missing: **a user that's allowed into the app itself** — that's the next section.

---

## First login

ZITADEL authentication succeeding is not enough — every user must also have a row in the **app database**, linked by their ZITADEL user ID.

### 1. Create (or reuse) a ZITADEL human user

If you want a dedicated admin user rather than reusing the instance bootstrap admin:

1. **Users** → **New** (a human user, not the service user from before)
2. Set a username, email, and password
3. Copy that user's **User ID** (shown on their profile page)

### 2. Give the user the `admin` project role

1. **Projects** → your project → **Authorizations**
2. Add the user → assign the **`admin`** role (**lowercase**, this is the app's own role name, not a ZITADEL system role)

### 3. Link the user into the app database

```bash
./deploy/scripts/bootstrap-app-admin.sh <zitadel-user-id> <username> <email>
```

Example:

```bash
./deploy/scripts/bootstrap-app-admin.sh 315294810293847561 admin admin@example.com
```

This inserts (or updates) a row in the app's `user` table with that ZITADEL ID.

### 4. Log in

Open `http://<PUBLIC_HOST>:3002/login` and sign in with:

- **Username:** the ZITADEL login name (shown on the user's profile as **Preferred Login Name**, e.g. `admin@<PUBLIC_HOST>`) or the user's email
- **Password:** the password you set for that ZITADEL user

You should land on the dashboard. If something fails here, see [Troubleshooting](#troubleshooting) — the error message from the API logs (`docker logs kassa_api`) tells you exactly which step above to revisit.

---

## Updating the deployment

### Code changed (new features, bug fixes)

1. Push to `main` (or manually re-run the **Publish Docker images** workflow if you need a specific public host)
2. On the VPS:

   ```bash
   cd Flappies
   git pull
   ./deploy/scripts/deploy-pull.sh
   ```

`deploy-pull.sh` always pulls the `latest` tag and restarts changed containers; database data is untouched (it lives in Docker volumes).

### Only restarting (no new images)

```bash
./deploy/scripts/restart-prod.sh
```

### Checking stack health at any time

```bash
./deploy/scripts/check-stack.sh
```

Prints container status, port reachability, recent ZITADEL/API logs, and the current app-database users.

---

## Enabling HTTPS with a real domain

The setup above uses plain HTTP and an IP address, which is fine for a closed/internal deployment. For a public domain, put a reverse proxy in front of all three services and terminate TLS there — ZITADEL, the API, and the frontend all keep running on plain HTTP internally.

Example using [Caddy](https://caddyserver.com/) (automatic HTTPS via Let's Encrypt):

```caddy
auth.example.com {
    reverse_proxy localhost:8080
}

api.example.com {
    reverse_proxy localhost:3001
}

flappies.example.com {
    reverse_proxy localhost:3002
}
```

Then:

1. Point DNS records for all three subdomains at your server
2. Update `deploy/.env`:
   ```env
   PUBLIC_HOST=flappies.example.com   # used for reference only once you're using distinct hostnames
   ZITADEL_URL=https://auth.example.com
   ZITADEL_EXTERNALDOMAIN=auth.example.com
   ZITADEL_EXTERNALPORT=443
   ZITADEL_EXTERNALSECURE=true
   ZITADEL_REDIRECT_URI=https://flappies.example.com/callback
   CORS_ORIGIN=https://flappies.example.com
   FRONTEND_URL=https://flappies.example.com
   COOKIE_SECURE=true
   ```
3. Re-run the **Publish Docker images** workflow with the new `public_host`/URLs so the frontend bakes in the HTTPS URLs
4. Update the OAuth app's redirect URIs in ZITADEL to the HTTPS URLs
5. `./deploy/scripts/deploy-pull.sh`

> Since `ZITADEL_EXTERNALDOMAIN` changes, ZITADEL must be re-initialized on a fresh volume (see the domain-mismatch note in [Troubleshooting](#troubleshooting)) unless you set the final domain **before** the very first boot.

---

## Backups

Both databases live in named Docker volumes (`postgres_data`, `postgres_zitadel_data`). Back up the app database regularly — it's the source of truth for users, products, and transactions:

```bash
docker exec kassa_postgres pg_dump -U kassa kassasysteem > backup-$(date +%F).sql
```

Restore:

```bash
cat backup-2026-01-01.sql | docker exec -i kassa_postgres psql -U kassa -d kassasysteem
```

The ZITADEL database (`kassa_postgres_zitadel`) can be backed up the same way if you want to preserve users/roles without redoing the ZITADEL setup steps.

---

## RFID card login (optional)

RFID login reuses the same ZITADEL token exchange configured above (impersonation), so if you completed [Configure ZITADEL for login](#configure-zitadel-for-login), the only remaining steps are:

1. Link each app user's `keycloak_id` column to their ZITADEL user ID (`deploy/scripts/bootstrap-app-admin.sh` does this, or use the admin UI's user editor)
2. Point your ESP32 RFID reader at the API's WebSocket endpoint, `/ws/rfid` (see [`scanner_utils/README.md`](../scanner_utils/README.md) for the message format and a local test bridge)
3. Make sure each user has a `card_uid` set in the app database (via the admin panel)

When a known card is scanned, the API exchanges that user's ZITADEL ID for a short-lived access token (`api/services/zitadel.service.js`) and logs the browser in automatically.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `docker compose` not found | Old Docker install | Install Docker Compose v2 plugin, or use `docker-compose` (v1 syntax) |
| Pulling images fails with "denied" | GHCR PAT lacks access | `docker login ghcr.io` with a PAT that has `read:packages`; check package's **Manage Actions access** |
| ZITADEL container keeps restarting on a 1 GB VPS | Out of memory (OOM-killed) | Add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` (persist in `/etc/fstab`) |
| ZITADEL "Instance not found" | Browser/API host ≠ `ZITADEL_EXTERNALDOMAIN` | Make sure you access ZITADEL via the exact host in `deploy/.env`; if you changed it after first boot, wipe the ZITADEL Postgres volume and re-init |
| Login redirect fails / blank callback page | Redirect URI mismatch | Redirect URI in the ZITADEL app must exactly match `ZITADEL_REDIRECT_URI` (scheme + host + port + path) |
| Password login: `User could not be found` | Wrong login name format | Use the ZITADEL **Preferred Login Name** (e.g. `admin@10.61.2.101`) or the user's email, not an arbitrary username |
| Password login: `membership not found` | Service user missing **Instance Login Client** | `http://<HOST>:8080/ui/console/instance/members` → grant `IAM_LOGIN_CLIENT` to the service user; restart the API |
| Password login: `token-exchange ... not allowed` | OAuth app missing **Token Exchange** grant | Edit the app → enable Token Exchange grant type; must be a Web/Code client with a secret |
| Password login: `Impersonation.PolicyDisabled` | Instance-wide impersonation is off | Instance → **Security Settings** → enable **Allow Impersonation** |
| Login succeeds but app says "User not allowed in this application" | No matching row in app DB | Run `./deploy/scripts/bootstrap-app-admin.sh <zitadel-user-id>` with the correct user ID |
| RFID login fails | Missing PAT, client credentials, or impersonator role | Re-check steps 3–6 in [Configure ZITADEL for login](#configure-zitadel-for-login) |
| CORS errors in the browser console | Frontend/API origin mismatch | `CORS_ORIGIN` in `deploy/.env` must exactly match the URL the browser uses for the frontend |
| Frontend shows old URLs after changing `.env` | Frontend URLs are baked in at build time | Re-run the **Publish Docker images** workflow with the new `public_host`, then `./deploy/scripts/deploy-pull.sh` |

For anything else, `./deploy/scripts/check-stack.sh` prints container status, recent logs, and app-database contents in one shot.
