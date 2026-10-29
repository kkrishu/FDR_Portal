# FDR Portal — Security Deposit / FDR Management System

A production-grade platform for managing Fixed Deposit Receipts (FDRs) that AICTE-approved institutions lodge as security deposits. Institutions submit deposits, banks confirm them against their own records through expiring secure links, officers review and approve, and the deposit is tracked through renewals and release — all on one tamper-evident record.

**Stack**: Next.js 14 (App Router) · Express 4 · MongoDB (Prisma) · Redis (Upstash) · Cloudinary · JWT + TOTP MFA · SWR · Tailwind CSS

---

## Table of contents

- [The workflow](#the-workflow)
- [Features](#features)
  - [Institution](#institution)
  - [Reviewing officer](#reviewing-officer)
  - [Administrator](#administrator)
  - [Bank manager](#bank-manager)
  - [Nodal officer](#nodal-officer)
  - [Auditor](#auditor)
  - [Everyone](#everyone)
- [Automatic risk detection](#automatic-risk-detection)
- [Flag lifecycle](#flag-lifecycle)
- [Security model](#security-model)
- [Architecture](#architecture)
- [API surface](#api-surface)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## The workflow

One record, four stages, zero spreadsheets:

```
 Institution                 Bank branch                    Officer                      Lifecycle
┌──────────────┐   link    ┌──────────────┐   answer    ┌──────────────┐            ┌──────────────┐
│ Submit FDR   │ ────────► │ Confirm via  │ ──────────► │ Review risk, │ ─────────► │ Maturity     │
│ + documents  │  secure   │ expiring link│  verified / │ resolve      │            │ reminders,   │
│ (SHA-256     │  + OTP    │ + one-time   │  flagged    │ flags,       │            │ renewals,    │
│  hashed)     │           │  code        │             │ approve      │            │ releases     │
└──────────────┘           └──────────────┘             └──────────────┘            └──────────────┘
```

1. **Institution submits** — a five-step wizard records the deposit (bank, amount, dates, joint holders) and uploads the certificate, board resolution, and lien letter. Every file is fingerprinted with SHA-256.
2. **Bank confirms** — an officer sends a verification request; the branch receives a link that expires (default 48 h) and a one-time password by email. The branch confirms or disputes each field individually.
3. **Officer reviews** — the submission arrives in a risk-ordered queue with the bank's answer beside it. Flags raised by the system or the bank must be resolved before approval.
4. **Lifecycle** — maturity reminders fire automatically, renewals create a linked draft, and release requests flow through recommend → approve → released.

Every transition writes a timeline entry, notifies the right people, and appends to a hash-chained audit log.

---

## Features

### Institution

| Feature | What it does |
| --- | --- |
| Dashboard | Live KPIs (active, awaiting action, expiring, flagged) with total holdings, maturity outlook buckets, status composition, and recent activity — every number from `GET /dashboard/summary`, scoped to the institution |
| My FDRs | Full portfolio with server-side search, status chips, flagged-only filter, and pagination; renders as cards on phones |
| Submit wizard | Five steps (bank details with live IFSC lookup → deposit facts → joint holders → documents → review). Server-side interest calculation: `amount × rate × term ÷ 365`. Blocks submission until the FDR certificate and board resolution are attached |
| FDR detail | Facts card, chronological timeline ("read top to bottom"), documents with SHA-256 fingerprints and download, joint holders, lien, verification results with per-field match states |
| Release requests | Request release on verified deposits, watch the Requested → Recommended → Approved chain, SLA deadline display |
| Renewals | Deposits due within 90 days and already-expired deposits grouped by urgency; one-click renewal creates a linked draft carrying the rate |
| Notifications | Full inbox with unread filter, mark one/all read, deep links to the related record |
| Profile | Editable account name, Cloudinary profile photo, institution details (name, address, contacts, website) |

### Reviewing officer

| Feature | What it does |
| --- | --- |
| Review queue | All in-flight deposits ordered by risk score; filter by status and risk band; claim a case ("assign to me") so ownership is explicit |
| My cases | The officer's claimed cases, with release-back-to-queue |
| Case actions | Verify (approve), flag with category + severity, add scrutiny remarks, request additional documents with a due date, manual verify with second-officer enforcement (you cannot verify your own override) |
| Expiry tracker | Held deposits bucketed overdue / 7 / 15 / 30 / 60 days |
| Search | Full-corpus lookup by FDR number or bank, paginated, also wired into ⌘K |
| Release recommendation | Auto-evaluated checklist (bank verified, lien, conditions, observations, documents) — all pass → recommended; any fail → stays pending with the reason visible |

### Administrator

| Feature | What it does |
| --- | --- |
| Overview | System-wide KPIs, recent audit activity, portfolio composition |
| Users | Create accounts in any role (the **only** place an ADMIN can be minted — public sign-up refuses it), deactivate/reactivate, reset MFA |
| Institutions | Register and browse institutions with deposit/user counts |
| Bank directory | Banks and branches with verification state; add branches; IFSC lookup service |
| Rules | Editable thresholds that drive the whole system: reminder days, escalation windows, release SLAs, OTP lifetime, deposit limits, duplicate-detection window. Changes are audit-logged |
| Reports | Turnaround analytics, officer workload, portfolio composition for a date range, CSV export |
| Audit logs | Paginated trail with action filters and **Verify chain** — recomputes every row's hash and reports the first tampered entry |
| Webhooks | Register endpoints, subscribe to events (`fdr.submitted`, `fdr.verified`, `release.approved`, …), send test deliveries |
| Escalations | Overdue renewals, banks that never answered (72 h), release SLA breaches — grouped by cause, linked to the record |

### Bank manager

| Feature | What it does |
| --- | --- |
| Pending verification | Requests addressed to the bank's branches (scoped by bank), with expiry warnings |
| Verify FDR | Field-by-field confirmation (amount, dates, number, holders, lien) against branch records, OTP by email, assurance level recorded |
| History | Every confirmation and flag the branch has issued |

### Nodal officer

Same portal as the bank manager — confirm deposits on the bank's behalf when the branch cannot, with the nodal role recorded on the verification result.

### Auditor

Read-only assurance: the full deposit book, the audit trail with chain verification, and reports. Cannot mutate anything (`requireRole` guards on every write route).

### Everyone

- **Role-scoped dashboards** — one `GET /dashboard/summary` call returns whatever the caller is entitled to see; a tenant user with no institution/bank binding sees an empty book, never anyone else's records.
- **⌘K command palette** — fuzzy navigation across every page the role can reach, plus live FDR search for officers and admins, theme switching, keyboard-first.
- **Notification bell** — real unread count (hidden at zero), mark one/all read, deep links.
- **Guided tour** — role-based spotlight walkthrough, skippable at any point, replayable from the account menu.
- **Onboarding checklist** — role-specific tasks that tick off on *real* state (the profile task completes when the profile is actually filled; the submit task when an FDR exists).
- **Dark / light / system theme**, mobile-first layouts (tables become cards), reduced-motion support, toasts, skeletons, and empty states everywhere.
- **Self-service registration** — institutions register with their organisation name (a real institution record is provisioned; the portfolio starts empty), bank/nodal officers pick their bank from the live directory. ADMIN is excluded server-side.

---

## Automatic risk detection

On submission, `assessFdrRisk` runs the deposit through the admin-configured rules and raises flags that always state **what is wrong and what to do about it**. The risk score is the weighted sum (BLOCK 40 · WARNING 18 · INFO 6, capped at 100).

| Check | Severity | Trigger |
| --- | --- | --- |
| Expired deposit | BLOCK | Maturity date already past at submission |
| Term out of bounds | WARNING | Term < 7 or > 3650 days |
| Amount below minimum | BLOCK | Below `minimumFdrAmount` (default ₹10,000) |
| Amount above ceiling | WARNING | Above `maxFdrAmount` (default ₹10 Cr) |
| Interest rate sanity | INFO | Outside 2–12% (a misplaced decimal, usually) |
| Lien mismatch | BLOCK | Lien amount exceeds the deposit amount |
| Duplicate receipt | WARNING | Same FDR number at the same bank by another institution |
| Identical deposit split | INFO | 3+ deposits from one institution with the same bank + amount + maturity |
| Unverified branch | INFO | The IFSC is not verified in the bank directory — requests may go unanswered |

The same assessor runs over seeded history, so demo findings match what the API would produce. Lifecycle checks (expired, term) apply only at submission; data contradictions apply always.

## Flag lifecycle

```
            ┌────────────────── institution ──────────────────┐
            │        POST /fdrs/:id/flags/:flagId/respond     │
   OPEN ───►│   note recorded, officers notified              │─── OPEN (answered)
            └──────────────────────────────────────────────────┘
            ┌──────────────────── officer ────────────────────┐
            │  POST /officer/fdrs/:id/flags/:flagId/resolve   │ → RESOLVED
            │  POST /officer/fdrs/:id/flags/:flagId/dismiss   │ → RESOLVED (false positive)
            └──────────────────────────────────────────────────┘
```

Resolving the last open flag on a flagged deposit moves it back to `UNDER_REVIEW` — "flagged" is never a dead end. Every step writes a timeline entry, notifies the counterpart, and appends to the audit log.

---

## Security model

- **Authentication** — JWT access tokens (15 min) + httpOnly refresh cookie (7 d, rotating). Optional TOTP MFA per user with backup codes; MFA is enforced for officer/admin/nodal roles when enabled.
- **Tamper-evident audit log** — every entry's SHA-256 covers its content *plus the previous entry's hash*; `POST /audit/verify` recomputes the chain and names the first broken link.
- **Document integrity** — uploads are hashed over the original bytes before streaming to Cloudinary; the hash is unique-keyed in the database, so the file AICTE reviews is provably the file the institution uploaded.
- **Data isolation** — every query is scoped by institution/bank from the JWT, never from the request; a tenant user with no binding sees nothing. Cross-tenant writes are rejected with `DATA_ISOLATION_VIOLATION`.
- **Server-side role gating** — the permission matrix lives in middleware, not the UI; ADMIN cannot be self-registered; bank/nodal sign-ups bind to a validated directory entry.
- **Upload hardening** — 10 MB cap, PDF/JPEG/PNG allow-list, memory-only buffering, authentication required.
- **Rate limiting** — general 100/min plus a stricter auth budget (10/15 min; successful logins do not count) — both configurable.
- **Helmet + strict CORS** — origin allow-list with credentials; disallowed origins get no CORS headers rather than an error.

---

## Architecture

```
FDR_Portal/
├── backend/                     # Express 4 API (TypeScript)
│   ├── src/
│   │   ├── config/              # Env schema (zod), CORS allow-list, cookie + rate-limit policies
│   │   ├── lib/                 # Prisma client, Redis (ioredis), Pino logger
│   │   ├── middleware/          # auth (JWT, RBAC, data isolation), errors, request logs
│   │   ├── routes/              # auth, users, institutions, fdrs, verification,
│   │   │                        # officer, release, admin, notifications, webhooks,
│   │   │                        # directory, rules, audit, uploads, dashboard
│   │   └── services/            # authService, notificationService, auditService,
│   │                            # mailService, cloudinaryService, fdrRiskService
│   ├── prisma/                  # schema (MongoDB) + seed (full demo dataset)
│   └── docs/swagger.yaml        # OpenAPI 3 spec served at /api-docs
├── client/                      # Next.js 14 App Router (TypeScript)
│   └── src/
│       ├── app/
│       │   ├── (auth)/          # login (sign-in + register), forgot-password
│       │   ├── (dashboard)/     # every role's pages behind the app shell
│       │   └── verify/[token]/  # public bank-verification flow
│       ├── components/
│       │   ├── ui/              # shadcn-style primitives (button → sidebar, 24 files)
│       │   ├── fdr/             # shared FDR table (desktop table / mobile cards) + detail view
│       │   └── layout/          # shell, command palette, notification bell,
│       │                        # onboarding card, guided tour, scroll restoration
│       ├── config/navigation.tsx
│       └── lib/                 # api client, auth store, SWR hooks, token storage
├── packages/shared/             # zod schemas, types, constants, utils — the single
│                                # source of truth for validation on both sides
├── render.yaml                  # Render blueprint for the backend
└── docker-compose.yml           # local Mailhog only (Mongo/Redis/Cloudinary are hosted)
```

**Key design decisions**

- **Shared validation** — `packages/shared` owns every zod schema; the API rejects and the forms pre-validate against the *same* rules, so server errors map field-for-field onto the form.
- **Query-string coercion** — `fdrSearchFiltersSchema` normalises Express's string-only query params (numbers, booleans, comma-lists), so pagination and filtering cannot 400.
- **Token storage** — `client/src/lib/token-storage.ts` is the single source of truth for tokens; the zustand store and the axios client read the same keys, and sessions from older builds self-repair on rehydrate.
- **Envelope contract** — every API response is `{ success, data, meta }`; the axios client unwraps it, and `use-api.ts` carries the correct error shape (`error.response.error.message`) plus per-field error helpers.
- **Prisma env shim** — the Prisma CLI only reads `.env`, so all `db:*` scripts run through `backend/scripts/prisma-env.js`, which applies the same `.env.local` loading order and the `MONGODB_URI` → `DATABASE_URL` aliasing the server uses. No duplicated secrets.

---

## API surface

All routes live under `/api/v1` (interactive docs at `/api-docs`).

| Area | Endpoints (selection) |
| --- | --- |
| Auth | `POST /auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `GET/PATCH /auth/me`, MFA setup/verify/disable/backup-codes |
| FDRs | `GET/POST /fdrs`, `GET/PATCH /fdrs/:id`, `POST /fdrs/:id/submit`, `/renew`, `/release-requests`, flag `respond` |
| Verification | `POST /verification/request`, `GET /verification/bank-verify?token=`, `POST /verification/otp`, `/verify`, `/nodal-verify`, `GET /verification/bank/pending`, `/bank/history` |
| Officer | `GET /officer/queue`, `/officer/expiry`, `/officer/search`; verify / flag / remarks / document-requests / manual-verify; `POST /officer/fdrs/:id/assign` (claim) + unassign; flags `resolve` / `dismiss`; release recommend |
| Release | `POST /release/request`, `GET /release/requests`, recommend / approve / reject / complete |
| Admin | `GET /admin/overview`, `/admin/analytics`, `/admin/escalations`, `GET/PATCH /admin/rules`, `GET /admin/audit`, `POST /audit/verify` |
| Directory | `GET /directory/ifsc/:code`, `/banks`, `/branches`, branch CRUD + CSV import + verify |
| Users / Institutions | CRUD, `GET/PATCH /institutions/:id/profile`, MFA reset |
| Dashboard | `GET /dashboard/summary` (role-scoped KPIs) |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `/read-all`, `GET /notifications/unread-count` |
| Audit | `GET /audit`, `POST /audit/verify`, `GET /audit/stats` |
| Webhooks | CRUD + `POST /webhooks/:id/test`, retry delivery |
| Uploads | `POST /uploads` (multipart → Cloudinary + SHA-256), `GET /uploads/status` |
| Rules | `GET /rules`, `GET /rules/categories`, `POST /rules` |
| Health | `GET /health` (probes MongoDB + Redis) |

---

## Getting started

**Prerequisites**: Node ≥ 20, pnpm 9, a MongoDB Atlas cluster (free tier is fine) and optionally Cloudinary + Upstash Redis.

```bash
# 1. Install
pnpm install

# 2. Configure
cp backend/.env.example backend/.env.local    # fill DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
cp client/.env.example  client/.env.local     # fill NEXT_PUBLIC_API_URL

# 3. Sync the schema and load the demo dataset
pnpm --filter=backend db:push
pnpm --filter=backend db:seed

# 4. Run (or `pnpm dev` at the root for both)
pnpm --filter=backend dev      # API on :3000
pnpm --filter=client dev       # web on :3001
```

- Frontend: http://localhost:3001
- API: http://localhost:3000 · Health: http://localhost:3000/health · Docs: http://localhost:3000/api-docs

**Demo accounts** (all use `Password@123` — created by the seed):

| Email | Role | Sees |
| --- | --- | --- |
| `institution@fdrportal.local` | Institution | 10 deposits across every workflow state, a flagged case |
| `institution2@fdrportal.local` | Institution | 7 deposits incl. a release in progress |
| `institution3@fdrportal.local` | Institution | ICICI deposits incl. unverified-branch notices |
| `officer@fdrportal.local` | Officer | National review queue |
| `officer2@fdrportal.local` | Officer | Second officer for assignment demos |
| `admin@fdrportal.local` | Admin | Users, directory, rules, audit chain, webhooks |
| `bank@fdrportal.local` | Bank manager | SBI queue: pending + history |
| `nodal@fdrportal.local` | Nodal officer | HDFC scope |
| `auditor@fdrportal.local` | Auditor | Read-only everything |

The seed creates 24 FDRs spanning all 17 workflow states with joint holders, liens, documents, timelines, verification results, release requests, 15 notifications, a hash-chained audit log, live rules, and a webhook — every screen has real rows out of the box. Re-running is safe (upserts by natural key).

**Registration is self-service and immediate**: `POST /auth/register` creates the account `ACTIVE` and returns tokens in the same response. Institutions name their organisation (the server provisions the record); bank and nodal officers attach to a bank from the directory; ADMIN cannot self-register. Passwords require 8+ characters with upper, lower, number, and symbol — the form shows the rules live.

---

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Backend + frontend together (root script) |
| `pnpm --filter=backend dev` | API with hot reload (tsx watch) |
| `pnpm --filter=client dev` | Next.js dev server on :3001 |
| `pnpm --filter=backend build` | Compile to `dist/` (tsc + path aliases) |
| `pnpm --filter=client build` | Production Next.js build |
| `pnpm --filter=backend db:push` | Sync the Prisma schema and indexes to MongoDB |
| `pnpm --filter=backend db:seed` | Idempotent demo dataset |
| `pnpm --filter=backend db:studio` | Prisma Studio |
| `pnpm --filter=backend db:validate` | Validate the schema without touching the database |
| `pnpm --filter=shared test` | Shared-package test suite (64 tests) |
| `pnpm --filter=<pkg> lint` / `typecheck` | ESLint / tsc per package |
| `docker-compose up` | Local Mailhog only (:8025) — Mongo/Redis/Cloudinary are hosted services |

---

## Deployment

Intended topology: **frontend on Vercel, API on Render, MongoDB Atlas, Upstash Redis, Cloudinary**.

### 1. Backend on Render

The repo ships a blueprint (`render.yaml`) — *New → Blueprint* and select the repo, or configure manually:

- **Root directory** `backend` · **build** `corepack enable && pnpm install --frozen-lockfile && pnpm build` · **start** `pnpm start` · **health check** `/health`
- Environment variables (full list with comments in [`backend/.env.example`](backend/.env.example)):

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | MongoDB Atlas SRV string |
| `REDIS_URL` | Upstash `rediss://…` (optional but recommended) |
| `JWT_SECRET` | 48+ random bytes |
| `ENCRYPTION_KEY` | exactly 32 characters |
| `CORS_ORIGIN` | `https://<your-app>.vercel.app,https://<custom-domain>` (comma-separated; add preview URLs too) |
| `FRONTEND_URL` | `https://<your-app>.vercel.app` (used inside emails) |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` | `none` / `true` — **required for a cross-site deployment**, or the browser drops the refresh cookie and every session dies at the 15-minute access-token expiry |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | your Cloudinary account |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` / `_FROM` | production relay (SES, Postmark, Gmail) — Mailhog is dev-only |

- After the first deploy, push the schema and seed once (Render shell, or locally against Atlas): `pnpm db:push && pnpm db:seed`.
- Render is a long-running process, so a single Upstash connection is used — no serverless connection storms.

### 2. Frontend on Vercel

- **Root directory** `client`; framework preset Next.js (build = `next build`, nothing else to configure).
- Environment variables (from [`client/.env.example`](client/.env.example)):

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<your-render-service>.onrender.com/api/v1` |
| `NEXT_PUBLIC_APP_VERSION` | e.g. `1.0.0` |

- After both are deployed, add the exact Vercel URL(s) to the backend's `CORS_ORIGIN` and redeploy the API — with credentials, origins match exactly (scheme + host, no trailing slash).

### 3. Post-deploy checklist

- `GET https://<render-host>/health` → `{ "status": "ok" }` (probes DB + Redis).
- Sign in from the Vercel domain; the `refreshToken` cookie must show `SameSite=None; Secure` in devtools.
- Register a throw-away institution → it should land on an empty portfolio (no seed data) with the onboarding card and tour offer.
- Submit an FDR end to end; confirm the Cloudinary file URL and the audit entry.
- `POST /audit/verify` as admin → `isValid: true`.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Every authenticated call returns 401 in the browser | `NEXT_PUBLIC_API_URL` unset or pointing at the wrong host — the client must reach the API origin exactly |
| Sessions die after ~15 minutes on the deployed app | Refresh cookie dropped cross-site — set `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` on the backend |
| CORS errors from the deployed frontend | Add the exact origin (scheme + host, no trailing slash) to `CORS_ORIGIN`, comma-separated |
| `GET /fdrs?page=1` returns 400 | Stale shared-package output — `pnpm --filter=shared build` |
| Login returns 429 | Auth rate limit (10/15 min by default) — raise `AUTH_RATE_LIMIT_MAX` in `.env.local` or wait |
| `/api-docs` is empty | Swagger spec resolution is dist-aware; rebuild the backend so `dist/docs/swagger.yaml` exists |
| Next.js chunk errors after switching dev ↔ build | `rm -rf client/.next` and restart — the two modes share that folder |
| Prisma CLI can't find `DATABASE_URL` | The `db:*` scripts route through `backend/scripts/prisma-env.js`, which reads `.env.local` — run them via pnpm, not bare `prisma` |
| Disk near full on macOS | `pnpm store prune` and clear Homebrew caches |
| Registration works but the dashboard is empty | Expected — self-registered institutions start with their own empty portfolio; the onboarding card and tour start from there |

---

## Licence

Private / internal use — AICTE security-deposit management.
