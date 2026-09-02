# Running Flappies on Kubernetes

This guide covers deploying a Flappies **tenant's** application stack (frontend, API, and its PostgreSQL database) to a Kubernetes cluster, as an alternative to the [VPS/Docker Compose deployment](DEPLOYMENT.md).

Like the VPS guide, this chart deploys **only the per-tenant app stack**. It does not self-host ZITADEL, Prometheus, Loki, or SMTP — those are shared/central company infrastructure that this tenant's stack connects out to. See [Two-tier architecture](DEPLOYMENT.md#two-tier-architecture) in the deployment guide for the full picture and the self-host/support boundary, and [Tenant onboarding](DEPLOYMENT.md#tenant-onboarding-central-zitadel) for provisioning this tenant in the central ZITADEL before you start below.

## Table of contents

- [Helm or something else?](#helm-or-something-else)
- [What's in the chart](#whats-in-the-chart)
- [Prerequisites](#prerequisites)
- [Step 1 — Cluster add-ons](#step-1--cluster-add-ons)
- [Step 2 — GHCR image pull secret](#step-2--ghcr-image-pull-secret)
- [Step 3 — Provision this tenant in the central ZITADEL](#step-3--provision-this-tenant-in-the-central-zitadel)
- [Step 4 — Configure values](#step-4--configure-values)
- [Step 5 — Install the chart](#step-5--install-the-chart)
- [Step 6 — DNS + TLS](#step-6--dns--tls)
- [Step 7 — Create the first app admin](#step-7--create-the-first-app-admin)
- [Upgrading](#upgrading)
- [Backups](#backups)
- [Scaling and high availability](#scaling-and-high-availability)
- [Troubleshooting](#troubleshooting)
- [Alternative: plain manifests / Kustomize](#alternative-plain-manifests--kustomize)

---

## Helm or something else?

**Use Helm.** A chart is provided at [`deploy/helm/flappies`](../deploy/helm/flappies).

Why Helm over raw `kubectl apply` manifests or Kustomize here specifically:

- **This app is already "one config, many environments."** `deploy/docker-compose.prod.yml` is one file full of `${VAR:-default}` substitutions read from `deploy/.env`. That is exactly the problem Helm's `values.yaml` + Go templates solve, and the mapping is nearly 1:1 (see [`values.yaml`](../deploy/helm/flappies/values.yaml)).
- **Per-tenant installs with a lot of required secrets.** Helm's single `helm upgrade --install` (with `--atomic` on failure rollback) per tenant/namespace is a much better fit than hand-sequencing `kubectl apply` for a Postgres StatefulSet, the API, and the frontend, all of which reference the same Secret/ConfigMap.
- **Built-in release lifecycle.** `helm rollback`, `helm history`, and `helm uninstall` give you out-of-the-box upgrade/rollback semantics that plain manifests don't; Kustomize doesn't manage releases at all, it only renders YAML.
- **It matches how the images are already published.** The GitHub Actions workflow (`.github/workflows/docker-publish.yml`) already produces versioned GHCR images; a chart `values.yaml` with `images.api.tag` / `images.frontend.tag` slots straight into that, the same way `FLAPPIES_IMAGE_TAG` does in the Compose file today.

Kustomize is a reasonable choice if you strongly prefer "just YAML, no templating language," but you'd end up re-inventing values-file substitution with patches and component overlays for very little benefit on a project this size. If you outgrow this chart (need a values schema, want it in an internal chart repo/OCI registry), Helm scales up cleanly too. See [Alternative: plain manifests / Kustomize](#alternative-plain-manifests--kustomize) if you'd rather go that route anyway — the resources the chart renders are ordinary Kubernetes YAML, so translating is straightforward.

---

## What's in the chart

```
deploy/helm/flappies/
├── Chart.yaml
├── values.yaml                     # defaults — safe for a local/test cluster, NOT for prod secrets
├── values-production.example.yaml  # copy to values-production.yaml and fill in
└── templates/
    ├── secrets.yaml         # one Secret with every credential (or bring your own via secrets.existingSecret)
    ├── configmap.yaml       # non-secret config (URLs, ports, feature flags)
    ├── postgres-app.yaml    # StatefulSet + headless Service — app data (users, products, transactions)
    ├── api.yaml             # Deployment + Service (Express API)
    ├── frontend.yaml        # Deployment + Service (Next.js)
    ├── ingress.yaml         # one Ingress, two hostnames (frontend / api)
    └── NOTES.txt            # printed after `helm install`/`upgrade`
```

This chart deploys **only the tenant's application stack**: one Postgres `StatefulSet`, the API, and the frontend. It intentionally does not include ZITADEL, Prometheus/Grafana, Loki, or an SMTP relay — those run once as shared company infrastructure (or a managed provider), not per tenant. See [Two-tier architecture](DEPLOYMENT.md#two-tier-architecture). It also leaves out the `docker_infra` dev-only extras (Redis, MinIO, Vault, Unleash) since those aren't required to run the app at all.

---

## Prerequisites

- A Kubernetes cluster (1.26+) you can reach with `kubectl` — a small managed cluster (GKE/EKS/AKS/DOKS) or even a single-node `k3s`/`kubeadm` box works fine for this app's footprint
- [`helm`](https://helm.sh/docs/intro/install/) v3 and `kubectl` installed locally
- An **Ingress controller** (e.g. [ingress-nginx](https://kubernetes.github.io/ingress-nginx/deploy/)) — required, the chart's `Ingress` assumes one is present
- A **default `StorageClass`** that supports `ReadWriteOnce` volumes, for the Postgres `StatefulSet`
- (Recommended) [cert-manager](https://cert-manager.io/docs/installation/) if you want automatic HTTPS certificates
- A GitHub PAT with `read:packages` scope to pull the private `ghcr.io/outcastsbv/flappies-*` images (same requirement as the [VPS deployment](DEPLOYMENT.md#step-3--log-in-to-ghcr-on-the-vps))
- DNS control over the domain(s) you'll point at the cluster's Ingress IP
- Access to a **central ZITADEL instance** (shared company infrastructure — this chart does not deploy one) with an instance-admin PAT, to provision this tenant in [Step 3](#step-3--provision-this-tenant-in-the-central-zitadel)
- (Optional) URLs/credentials for a shared Prometheus Pushgateway, Loki, and an SMTP relay, if you want metrics, log shipping, and the admin support-request form for this tenant

> Just want to try it locally first? `kind create cluster` or `minikube start`, install `ingress-nginx` for that platform, and use `nip.io`/`sslip.io` hostnames (e.g. `flappies.127.0.0.1.nip.io`) instead of real DNS — everything else below is identical. For a from-scratch local ZITADEL to test against, `docker_infra/docker-compose.yml` runs one alongside the rest of local dev (see the [README](../README.md#local-development)).

---

## Step 1 — Cluster add-ons

Install an ingress controller (skip if your cluster already has one):

```bash
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

Optionally install cert-manager for automatic TLS certificates:

```bash
helm upgrade --install cert-manager cert-manager \
  --repo https://charts.jetstack.io \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true
```

Then create a `ClusterIssuer` for Let's Encrypt (adjust the email):

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: you@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

```bash
kubectl apply -f cluster-issuer.yaml
```

---

## Step 2 — GHCR image pull secret

```bash
kubectl create namespace flappies-<tenant-slug>

kubectl -n flappies-<tenant-slug> create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=<your-github-username> \
  --docker-password=<your-github-pat-with-read:packages> \
  --docker-email=<your-email>
```

Reference it from `values-production.yaml` (see below) via `imagePullSecrets`. Using a per-tenant namespace (e.g. `flappies-acme-corp`) keeps multiple tenants isolated in the same cluster — each gets its own `helm install` release, namespace, Postgres, and Secret.

---

## Step 3 — Provision this tenant in the central ZITADEL

This is the same one-time-per-tenant step as the [VPS guide's tenant onboarding](DEPLOYMENT.md#tenant-onboarding-central-zitadel), run against the **central/shared** ZITADEL instance — not anything inside this Kubernetes cluster:

```bash
export ZITADEL_URL=https://auth.company.example.com   # central instance
export ZITADEL_IAM_PAT=<instance-admin PAT>
export TENANT_SLUG=acme-corp
export TENANT_FRONTEND_URL=https://flappies.example.com   # this tenant's frontendHost, from Step 4
export TENANT_ADMIN_EMAIL=admin@acme-corp.example.com
export TENANT_ADMIN_PASSWORD='Str0ng-Initial-Password!'

./deploy/scripts/provision-tenant-zitadel.sh
```

Keep the printed `ZITADEL_*` values and the admin user ID handy — you'll need them in [Step 4](#step-4--configure-values) and [Step 7](#step-7--create-the-first-app-admin). If you'd rather do this by hand, see the manual console steps in the [deployment guide](DEPLOYMENT.md#tenant-onboarding-central-zitadel).

---

## Step 4 — Configure values

```bash
cp deploy/helm/flappies/values-production.example.yaml deploy/helm/flappies/values-production.yaml
```

Edit `values-production.yaml`:

| Key | Set to |
|-----|--------|
| `global.frontendHost` / `global.apiHost` | The two hostnames you'll point DNS at for this tenant (e.g. `flappies.example.com`, `api.flappies.example.com`) |
| `global.zitadelUrl` | The **central** ZITADEL's base URL (shared company infrastructure — not deployed by this chart) |
| `global.tenantId` | A short, unique slug for this tenant (same as `TENANT_SLUG` from Step 3) — tags every metric/log line so a shared Prometheus/Loki can filter by tenant |
| `payments.cash` / `payments.stripe` / `payments.sumup` / `payments.wero` | Host-level payment modules. `false` hides that method from Config and checkout for this tenant |
| `global.tlsEnabled` | `true` once cert-manager (or your own TLS secret) is in place |
| `imagePullSecrets` | `[{name: ghcr-pull-secret}]` from Step 2 |
| `secrets.postgresPassword` | A strong random password |
| `secrets.configEncryptionKey` | Random 32-byte string — `openssl rand -base64 32` (encrypts Stripe/SumUp/Wero API keys at rest) |
| `secrets.zitadelOrgId`, `secrets.zitadelClientId`, `secrets.zitadelClientSecret`, `secrets.zitadelProjectId`, `secrets.zitadelImpersonatorPat`, `secrets.zitadelImpersonatorClientId`, `secrets.zitadelImpersonatorClientSecret` | The values printed by `provision-tenant-zitadel.sh` in [Step 3](#step-3--provision-this-tenant-in-the-central-zitadel) |
| `observability.metrics.pushgatewayUrl`, `observability.logging.lokiUrl` | (Optional) the shared Prometheus Pushgateway / Loki URLs, if this deployment has one |
| `support.smtp.*`, `support.emailTo`, `secrets.smtpUser`, `secrets.smtpPassword` | (Optional) SMTP relay details, to enable the admin "Support / feature request" form |

Since this tenant is already provisioned in ZITADEL from Step 3, there are no post-install "come back and fill this in" secrets left, unlike the old self-hosted flow — everything ZITADEL-related can go in on the very first `helm install`.

> **Frontend URLs are baked in at build time**, exactly like the Docker Compose deployment — `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ZITADEL_URL`, etc. are compiled into the `flappies-frontend` image when it's built (`frontend/Dockerfile` build args), not read at container start. If your `global.*Host` or `global.zitadelUrl` values don't match what the frontend image was built with, **rebuild the frontend image** with matching build args (re-run `docker-publish.yml` with this tenant's `public_host`, `zitadel_url`, and `zitadel_client_id`) rather than expecting a `helm upgrade` to change them. The chart's `configmap.yaml` still renders `NEXT_PUBLIC_*` for reference/consistency, but changing them there alone won't do anything for an already-built image.

> For anything beyond a quick test, don't put real secrets in a values file at all — create the Secret out-of-band (vault, sealed-secrets, SOPS, your CI's secret store) with the same keys as [`templates/secrets.yaml`](../deploy/helm/flappies/templates/secrets.yaml), and set `secrets.existingSecret: <name>` instead.

---

## Step 5 — Install the chart

```bash
helm upgrade --install flappies-<tenant-slug> ./deploy/helm/flappies \
  --namespace flappies-<tenant-slug> \
  -f deploy/helm/flappies/values-production.yaml \
  --atomic --timeout 5m
```

`--atomic` rolls the release back automatically if something fails to come up. Watch it come up:

```bash
kubectl -n flappies-<tenant-slug> get pods -w
```

Unlike the previous self-hosted-ZITADEL setup, there's no first-boot migration wait here — the API and frontend come up as soon as Postgres is ready, typically well under a minute.

---

## Step 6 — DNS + TLS

Point both hostnames at your Ingress controller's external IP/hostname:

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller
```

Create `A`/`CNAME` records for `global.frontendHost` and `global.apiHost` pointing at that address. Once cert-manager has issued the certificate (`kubectl -n flappies-<tenant-slug> get certificate`), re-deploy with `global.tlsEnabled: true` if you hadn't already:

```bash
helm upgrade flappies-<tenant-slug> ./deploy/helm/flappies \
  --namespace flappies-<tenant-slug> \
  -f deploy/helm/flappies/values-production.yaml
```

At this point the frontend is reachable over HTTPS and ZITADEL login already works end-to-end (this tenant was provisioned in Step 3 before anything was deployed) — same checkpoint as [the VPS guide reaches after `deploy-pull.sh`](DEPLOYMENT.md#step-5--deploy). What's still missing is a row for the admin user in the app database — that's the next step.

---

## Step 7 — Create the first app admin

Same requirement as Compose: ZITADEL auth succeeding isn't enough, the user also needs a row in the app's `user` table. There's no Kubernetes Job for this yet, so run it via `psql` against the in-cluster Postgres, using the admin user ID printed by `provision-tenant-zitadel.sh` in [Step 3](#step-3--provision-this-tenant-in-the-central-zitadel):

```bash
kubectl -n flappies-<tenant-slug> port-forward statefulset/flappies-<tenant-slug>-postgres-app 5432:5432
```

In another terminal:

```bash
PGPASSWORD=<secrets.postgresPassword> psql -h localhost -U flappies -d flappies -c \
  "INSERT INTO \"user\" (keycloak_id, username, email, role, is_active) VALUES ('<zitadel-admin-user-id>', '<username>', '<email>', 'admin', true);"
```

(This is the same insert `deploy/scripts/bootstrap-app-admin.sh` runs against the Compose Postgres container.) Once this admin can log in, use the app's own **Admin → Users** panel to create managers and cashiers — no further ZITADEL console work needed.

---

## Upgrading

```bash
helm upgrade flappies-<tenant-slug> ./deploy/helm/flappies \
  --namespace flappies-<tenant-slug> \
  -f deploy/helm/flappies/values-production.yaml \
  --set images.api.tag=<new-tag> \
  --set images.frontend.tag=<new-tag>
```

Roll back if a release goes bad:

```bash
helm history flappies-<tenant-slug> -n flappies-<tenant-slug>
helm rollback flappies-<tenant-slug> <revision> -n flappies-<tenant-slug>
```

Database data lives in the `PersistentVolumeClaim` created by the `postgres-app` StatefulSet (`data-flappies-<tenant-slug>-postgres-app-0`) and is untouched by upgrades/rollbacks of the Deployments.

---

## Backups

```bash
kubectl -n flappies-<tenant-slug> exec statefulset/flappies-<tenant-slug>-postgres-app -- \
  pg_dump -U flappies flappies > backup-$(date +%F).sql
```

Restore:

```bash
kubectl -n flappies-<tenant-slug> exec -i statefulset/flappies-<tenant-slug>-postgres-app -- \
  psql -U flappies -d flappies < backup-2026-01-01.sql
```

There is no ZITADEL database to back up per tenant — that lives in the central ZITADEL instance, backed up by whoever runs that shared infrastructure. For production clusters, prefer a scheduled `CronJob` running the same `pg_dump` command to object storage (or a managed Postgres with automated backups — see [Scaling and high availability](#scaling-and-high-availability)) over manual dumps.

---

## Scaling and high availability

This chart mirrors the Compose topology (single Postgres instance) for simplicity, matching the "small tenant" scale this app was designed for. If you need more:

- **API and frontend are stateless** — bump `api.replicaCount` / `frontend.replicaCount` freely; both already have `Service`s in front of them.
- **PostgreSQL** is a single-replica `StatefulSet` here, matching Compose. For real HA, swap it for a managed Postgres (RDS/Cloud SQL/etc.) or an operator like [CloudNativePG](https://cloudnative-pg.io/); either way, point `PGHOST` at the new endpoint via `values.yaml` instead of the bundled `StatefulSet`.
- **ZITADEL scaling** is out of scope for this chart entirely — it's the central infrastructure team's concern, see [ZITADEL's own scaling docs](https://zitadel.com/docs/self-hosting/manage/production) if you also run that instance.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `ImagePullBackOff` on api/frontend | Missing/incorrect `imagePullSecrets` | Recheck the Secret from [Step 2](#step-2--ghcr-image-pull-secret) and that it's referenced in `values-production.yaml` |
| `postgres-app-0` stuck `Pending` | No default `StorageClass`, or `storageClassName` typo | `kubectl get storageclass`; set `postgresApp.storageClassName` explicitly |
| `api` pod fails readiness (`/ready` 503) | API can't reach Postgres, or can't reach the central ZITADEL's JWKS endpoint | Check the Postgres StatefulSet is `Running`/`Ready` first; `kubectl -n flappies-<tenant-slug> logs deploy/flappies-<tenant-slug>-api` — the API returns `503` (not a crash) when ZITADEL is temporarily unreachable, so it should recover on its own once connectivity is restored |
| Ingress returns 404 for both hosts | Wrong `ingressClassName`, or DNS not pointed at the controller yet | `kubectl get ingress -n flappies-<tenant-slug> -o wide`; confirm `global.ingressClassName` matches your controller (`kubectl get ingressclass`) |
| `Certificate` stuck `False`/pending | HTTP-01 challenge can't reach the pod (DNS not propagated, or Ingress misconfigured) | `kubectl -n flappies-<tenant-slug> describe certificate`; `kubectl -n flappies-<tenant-slug> describe challenge` |
| Metrics not showing up in the master Prometheus | `observability.metrics.pushgatewayUrl` unset/unreachable, or `global.tenantId` not unique across tenants | `kubectl -n flappies-<tenant-slug> logs deploy/flappies-<tenant-slug>-api \| grep -i pushgateway` |
| Logs not showing up in Loki | `observability.logging.lokiUrl`/credentials wrong | The app still logs to stdout regardless, so `kubectl logs` always works even if Loki shipping is broken |
| Support form submission fails | `support.smtp.host` unset or SMTP credentials wrong | The API returns a clear "not configured" error when SMTP isn't set up; check pod logs for the SMTP error otherwise |
| Same ZITADEL login errors as Compose (`Instance not found`, `membership not found`, `token-exchange not allowed`, etc.) | ZITADEL configuration on the central instance, not Kubernetes | See the [Troubleshooting table in the deployment guide](DEPLOYMENT.md#troubleshooting) — these are all ZITADEL-side and apply identically here |

---

## Alternative: plain manifests / Kustomize

If you'd rather avoid Helm entirely: `helm template flappies-<tenant-slug> ./deploy/helm/flappies -f deploy/helm/flappies/values-production.yaml > flappies.yaml` renders the exact same chart down to static YAML you can `kubectl apply -f` directly, or check into a `kustomize` base and layer environment-specific overlays/patches on top (e.g. `images:`, `replicas:`, and `configMapGenerator`/`secretGenerator` in place of `values.yaml`). The Kubernetes objects themselves — StatefulSet, Deployments, Services, ConfigMap, Secret, Ingress — don't change; only how you template/parameterize them does.
