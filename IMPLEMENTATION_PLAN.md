# FDR Portal - Implementation Plan

**Smart India Hackathon 2026 | PS 26265 | AICTE Security Deposit/FDR Portal**

---

## Executive Summary

This document translates the high-level FDR Portal specification into a detailed, sprint-by-sprint execution roadmap with specific tasks, dependencies, acceptance criteria, and resource allocation. The plan covers 12 sprints over approximately 12 weeks for a team of 6 engineers.

---

## Team Structure & Role Assignment

| Role | Member | Primary Ownership | Secondary Support |
|------|--------|-------------------|-------------------|
| **Backend Lead** | Member 1 | Foundation, FDR Registry, Risk Engine, Status Machine | Bank Verification, Alert Scheduler |
| **Backend Engineer** | Member 2 | Bank Verification, Tokens/OTP, Directory, Alert Scheduler | FDR Registry, Risk Engine |
| **Frontend Lead** | Member 3 | Institution Screens, Admin Screens | Officer Screens, Bank Pages |
| **Frontend Engineer** | Member 4 | Officer Screens, Bank Manager Pages, Nodal Officer Portal | Institution Screens, Admin Screens |
| **DevOps & Security** | Member 5 | CI/CD, Docker, Secrets, Monitoring, Security Tests, Load Tests | All infrastructure |
| **Product & QA** | Member 6 | Test Scenarios, UAT, Documentation, PPT, Q&A Prep | All testing |

---

## Sprint Breakdown

### **Sprint 0: Setup & Foundation (Week 1)**
**Goal**: Complete development environment, CI/CD pipeline, and core infrastructure

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S0-01 | Initialize monorepo structure (apps/web, apps/api, packages/shared) | Backend Lead | - | `npm install && npm run dev` starts all services |
| S0-02 | Configure TypeScript, ESLint, Prettier, Husky pre-commit hooks | Backend Lead | S0-01 | Lint passes on all packages |
| S0-03 | Set up Docker Compose for local dev (MongoDB replica set, Redis, MinIO/S3, API, Web) | DevOps | S0-01 | `docker compose up` brings up full stack |
| S0-04 | Configure MongoDB replica set with proper indexes | Backend Lead | S0-03 | Replica set status OK, indexes created |
| S0-05 | Set up GitHub Actions CI pipeline (lint, type-check, test, build, Docker image) | DevOps | S0-01 | Green pipeline on push to main |
| S0-06 | Configure environments (development, testing, staging, production) | DevOps | S0-03 | Separate env files, no secrets in repo |
| S0-07 | Set up shared package with types, constants, utilities, validation schemas | Backend Lead | S0-01 | Shared types imported by API and Web |
| S0-08 | Configure structured logging (Pino/Winston) and health check endpoints | Backend Lead | S0-01 | Logs in JSON format, `/health` returns 200 |
| S0-09 | Set up S3-compatible storage (MinIO local, AWS S3 prod) with encryption | DevOps | S0-03 | File upload/download works, encrypted at rest |
| S0-10 | Document developer onboarding guide (README, run commands, troubleshooting) | Product & QA | S0-01 to S0-09 | New dev can run project in <15 min |

#### Sprint 0 Deliverables
- [ ] Running monorepo with API + Web + Shared packages
- [ ] Docker Compose with all services
- [ ] CI/CD pipeline passing
- [ ] Developer onboarding documentation

---

### **Sprint 1: Foundation - Auth, Permissions, Audit, Notifications (Week 2)**
**Goal**: Core authentication, authorization, audit logging, and notification infrastructure

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S1-01 | Implement JWT authentication (access + refresh tokens, rotation, revocation) | Backend Lead | S0-07 | Login returns tokens, refresh works, logout revokes |
| S1-02 | Implement OIDC SSO integration (Keycloak/Auth0/Azure AD) | Backend Lead | S1-01 | SSO login works for all roles |
| S1-03 | Implement MFA (TOTP) for Officer, Admin, Nodal Officer roles | Backend Lead | S1-01 | MFA enrollment, verification, backup codes |
| S1-04 | Build permission matrix config + middleware (role + resource + action) | Backend Lead | S1-01 | 403 on unauthorized route access |
| S1-05 | Implement data isolation middleware (institutionId, bankId scoping) | Backend Lead | S1-04 | Cross-institution queries return empty/403 |
| S1-06 | Build audit log service (actor, action, entity, before, after, timestamp, hash chain) | Backend Lead | S1-01 | Every state change writes entry, chain verifies |
| S1-07 | Create audit log integrity verification endpoint | Backend Lead | S1-06 | Tampering detected, hash chain validation |
| S1-08 | Build notification adapter (Email + SMS) with templates, delivery log, retries | Backend Engineer | S0-07 | Send email/SMS, retry on failure, log delivery |
| S1-09 | Configure email infrastructure (SPF, DKIM, DMARC, fixed sender domain) | DevOps | S1-08 | Emails pass DMARC, no sensitive data in body |
| S1-10 | Build rules configuration service (CRUD for reminder days, wait hours, escalation, required docs) | Backend Engineer | S1-01 | Admin can change rules without deploy |
| S1-11 | Implement file storage service (type/size validation, malware scan, signed URLs) | Backend Engineer | S0-09 | Upload/download with auth, scan on upload |
| S1-12 | Create API versioning structure (`/api/v1`) with OpenAPI/Swagger setup | Backend Lead | S1-01 | Swagger UI accessible, versioned routes |
| S1-13 | Build login/logout UI for all roles with MFA flow | Frontend Lead | S1-01 | Login works for Institution, Officer, Admin, Nodal |
| S1-14 | Create shared UI components (Button, Input, Table, Modal, Toast, Layout, Sidebar) | Frontend Lead | S0-07 | Component library documented in Storybook |
| S1-15 | Implement role-based route guards and layout switching | Frontend Lead | S1-04 | Each role sees only their routes |

#### Sprint 1 Deliverables
- [ ] Full authentication system with SSO + MFA
- [ ] Permission matrix with middleware enforcement
- [ ] Data isolation working
- [ ] Audit logging with hash-chain integrity
- [ ] Notification adapter (email/SMS)
- [ ] Rules configuration service
- [ ] File storage with security controls
- [ ] Login UI for all roles
- [ ] Shared component library

---

### **Sprint 2: Institution Core - Profile, FDR Submit, Documents, OCR, Risk Checks (Week 3)**
**Goal**: Institution can submit FDRs with full validation, OCR, and risk pre-checks

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S2-01 | Design FDR data model (FDR, Document, JointHolder, Lien, Timeline, RiskFlag) | Backend Lead | S1-11 | MongoDB schemas with indexes |
| S2-02 | Build IFSC directory import (RBI master data → bank_directory collection) | Backend Engineer | S1-11 | Import script loads 150k+ records, searchable |
| S2-03 | Implement `GET /directory/ifsc/:code` lookup with auto-fill | Backend Engineer | S2-02 | Returns bank, branch, address; 404 on invalid |
| S2-04 | Build FDR submit API (`POST /fdrs`) with 5-step validation | Backend Lead | S2-01, S2-03 | All validations: amount>0, maturity>issue, AICTE in joint holders, PDF only, size limit |
| S2-05 | Implement draft save/resume (`PATCH /fdrs/:id`) | Backend Lead | S2-04 | Partial saves allowed, resume works |
| S2-06 | Build OCR service (PDF text extraction for amount, dates, FDR number) | Backend Engineer | S2-04 | Extracts key fields, confidence score |
| S2-07 | Implement file hash computation (SHA-256) and duplicate detection | Backend Engineer | S2-04 | Hash stored, FILE_REUSED flag on collision |
| S2-08 | Build risk check engine (all 9 flags from spec) | Backend Lead | S2-04, S2-06, S2-07 | Flags computed on submit, weighted score |
| S2-09 | Implement instant pre-check feedback in submit response | Backend Lead | S2-08 | Block/warning flags returned immediately |
| S2-10 | Build FDR timeline/history API (`GET /fdrs/:id/timeline`) | Backend Lead | S2-01 | All state transitions with timestamps |
| S2-11 | Build institution profile management (CRUD) | Backend Engineer | S1-05 | Profile scoped to institution |
| S2-12 | Create Institution Dashboard (count cards: active, expiring, flagged, drafts) | Frontend Lead | S2-04, S2-10 | Real-time counts, navigation to lists |
| S2-13 | Build "My FDRs" list with filters, pagination, status badges | Frontend Lead | S2-04, S2-10 | Sortable, filterable, paginated |
| S2-14 | Build 5-step FDR Submit Wizard (Bank → Details → Joint Holders/Lien → Upload → Review) | Frontend Lead | S2-03, S2-04, S2-06 | Step validation, draft save, pre-check display |
| S2-15 | Build FDR Detail view with timeline, documents, risk flags, OCR results | Frontend Lead | S2-10, S2-06, S2-08 | All info visible, download documents |
| S2-16 | Implement "Action Needed" screen (remarks response, document re-upload) | Frontend Lead | S2-04 | Edit permitted fields, create new version |
| S2-17 | Build Renew FDR flow (`POST /fdrs/:id/renew`) | Frontend Lead + Backend Lead | S2-04, S2-10 | Links to old FDR, same verification flow |
| S2-18 | Build Release Request flow (`POST /fdrs/:id/release-requests`) | Frontend Lead + Backend Lead | S2-04 | Only eligible FDRs, reason + docs, tracking |
| S2-19 | Implement institution notifications center (in-app + email) | Frontend Lead + Backend Engineer | S1-08, S2-04 | Real-time updates, mark read, email sent |
| S2-20 | Build receipt download (`GET /fdrs/:id/receipt`) | Frontend Lead + Backend Engineer | S2-04 | PDF acknowledgement with FDR details |

#### Sprint 2 Deliverables
- [ ] FDR data model with all relationships
- [ ] IFSC directory imported and searchable
- [ ] Complete FDR submission flow (5 steps)
- [ ] OCR extraction + file hashing
- [ ] Risk engine with 9 flags + scoring
- [ ] Draft save/resume
- [ ] Institution dashboard + My FDRs + Detail + Action Needed
- [ ] Renew and Release Request flows
- [ ] Notifications center
- [ ] Receipt generation

---

### **Sprint 3-4: Directory & Bank Verification - Secure Link, OTP, Bank Screens (Weeks 4-5)**
**Goal**: Bank verification via secure link (OTP) and nodal officer portal

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S3-01 | Design verification request model (token, FDR, channel, status, expiry, hash) | Backend Lead | S2-01 | Token = 256-bit random, stored as SHA-256 hash |
| S3-02 | Build verification token generation + email sending (to directory contact only) | Backend Lead | S3-01, S1-08 | Token created, email sent to verified contact |
| S3-03 | Implement `GET /bank-verify?token` landing page (no burn on load) | Backend Lead + Frontend Engineer | S3-01 | Page loads FDR details, token not consumed |
| S3-04 | Build OTP system (6-digit, hashed storage, 10-min expiry, 5-attempt lockout) | Backend Lead | S3-01 | OTP sent to directory contact, verified correctly |
| S3-05 | Implement `POST /bank-verify/otp` and `POST /bank-verify/submit` | Backend Lead | S3-03, S3-04 | OTP verified, submission accepted |
| S3-06 | Build bank manager review page (PDF, amount, dates, joint holders, lien) | Frontend Engineer | S3-03 | Shows all FDR data, instructions to compare with core banking |
| S3-07 | Build bank manager confirmation form (name, designation, emp ID, amount, dates, 3 confirmations) | Frontend Engineer | S3-06 | All fields required, reject requires reason |
| S3-08 | Implement comparison logic (bank-entered vs submitted) + atomic token burn | Backend Lead | S3-05, S3-07 | Match→Verified, Mismatch→Flagged, token burned |
| S3-09 | Build bank nodal officer login (MFA) + account creation (Admin only) | Backend Lead + Frontend Engineer | S1-02, S1-03 | Nodal officer can login with MFA |
| S3-10 | Build nodal officer dashboard (pending FDRs grouped by branch) | Frontend Engineer | S3-09 | `GET /bank/pending` returns scoped list |
| S3-11 | Build nodal officer per-FDR review (same 3 confirmations as secure link) | Frontend Engineer | S3-10 | `POST /bank/verify` with per-FDR confirmation |
| S3-12 | Build nodal officer history view (`GET /bank/history`) | Frontend Engineer | S3-11 | Past confirmations with timestamps |
| S3-13 | Implement reminder scheduler (24h, 48h) + officer alert (72h) + Admin escalation (5d) | Backend Engineer | S1-10, S3-02 | Jobs run hourly, notifications sent |
| S3-14 | Build verification request resend (to directory contact or nodal) | Backend Lead | S3-02, S3-13 | `POST /verification-requests/:id/resend` works |
| S3-15 | Define assurance levels (Nodal+MFA=Highest, SecureLink+OTP=High, Manual=Lower) | Backend Lead | S3-08, S3-11 | Level stored with verification result |
| S3-16 | Write integration tests for all verification flows (happy + edge cases) | Backend Lead + QA | S3-08, S3-11 | Token reuse, expiry, 5 wrong OTPs, mismatch all tested |

#### Sprint 3-4 Deliverables
- [ ] Secure verification link with token (hashed, 48h expiry)
- [ ] OTP system (6-digit, 10min, 5-attempt lockout)
- [ ] Bank manager review + confirmation flow
- [ ] Comparison logic + atomic token burn
- [ ] Nodal officer portal (MFA login, dashboard, per-FDR review, history)
- [ ] Reminder + escalation scheduler
- [ ] Assurance level tracking
- [ ] Comprehensive verification flow tests

---

### **Sprint 5: Officer Work Queue & Case Management (Week 6)**
**Goal**: Officer can review, verify, flag, and manage cases end-to-end

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S5-01 | Build officer work queue API (`GET /review-queue`) with risk score + age sorting | Backend Lead | S2-08, S3-08 | Returns paginated, sorted queue |
| S5-02 | Implement queue filters (status: new, pending bank, flagged, release requests) | Backend Lead | S5-01 | Filter params work correctly |
| S5-03 | Build officer case view API (`GET /fdrs/:id`) - full details + version history | Backend Lead | S2-01, S2-10 | All data: institution, FDR, docs, OCR, risk, bank result, history |
| S5-04 | Implement verify action (`POST /fdrs/:id/verify`) - only when bank result positive | Backend Lead | S3-08, S5-03 | 400 if bank not verified, audit logged |
| S5-05 | Implement flag action (`POST /fdrs/:id/flag`) with reason + category | Backend Lead | S5-03 | Creates flag, returns to Awaiting Bank, notifies institution |
| S5-06 | Build scrutiny remarks (`POST /fdrs/:id/remarks`) - institution-visible or internal | Backend Lead | S5-03 | Remarks stored, visible per config |
| S5-07 | Implement document requests (`POST /fdrs/:id/document-requests`) with due date | Backend Lead | S5-03 | Request created, institution notified |
| S5-08 | Build manual verification (`POST /fdrs/:id/manual-verify`) with evidence + reason | Backend Lead | S5-03 | Lower assurance level, requires evidence upload |
| S5-09 | Implement second-officer rule for manual override cases | Backend Lead | S5-08 | Same officer cannot verify their own manual override |
| S5-10 | Build expiry tracker API (`GET /fdrs?expiry=...`) with 60/30/15/7 day buckets | Backend Engineer | S2-01 | Filter by maturity date ranges |
| S5-11 | Build release recommendation (`POST /release-requests/:id/recommend`) with auto-checklist | Backend Lead | S2-18, S6-01 | Checklist evaluated, recommendation recorded |
| S5-12 | Implement search API (`GET /fdrs?q=...`) - institution, FDR#, bank, status, date range | Backend Engineer | S2-01 | Full-text + filtered search works |
| S5-13 | Create Officer Work Queue UI (sortable, filterable, risk score badges) | Frontend Engineer | S5-01, S5-02 | Real-time updates, keyboard navigation |
| S5-14 | Build Officer Case View (tabbed: Details, Documents, OCR, Risk, Bank Result, History) | Frontend Engineer | S5-03 | All tabs load, version diff visible |
| S5-15 | Create Verify/Flag panel (modal with reason, category, confirmation) | Frontend Engineer | S5-04, S5-05 | Cannot verify without bank result |
| S5-16 | Build Remarks UI (add internal/institution remarks, see history) | Frontend Engineer | S5-06 | Rich text, character limit, audit trail |
| S5-17 | Create Document Request UI (select docs, set due date, send) | Frontend Engineer | S5-07 | Institution gets notification |
| S5-18 | Build Manual Verification UI (evidence upload, reason, assurance label) | Frontend Engineer | S5-08 | Warning about lower assurance |
| S5-19 | Build Expiry Tracker screen (buckets, sortable, actions) | Frontend Engineer | S5-10 | Color-coded urgency, bulk actions |
| S5-20 | Build Release Review screen (checklist, recommendation, forward to Admin) | Frontend Engineer | S5-11 | Auto-checklist, recommend/reject |
| S5-21 | Build Search UI (advanced filters, saved searches, export) | Frontend Engineer | S5-12 | Complex queries, results table |

#### Sprint 5 Deliverables
- [ ] Work queue with risk-based sorting
- [ ] Complete case view with all data tabs
- [ ] Verify/Flag actions with validation
- [ ] Scrutiny remarks (internal + institution)
- [ ] Document requests with due dates
- [ ] Manual verification with evidence + second-officer rule
- [ ] Expiry tracker with buckets
- [ ] Release recommendation with auto-checklist
- [ ] Advanced search with export
- [ ] All officer UI screens

---

### **Sprint 6: Monitoring, Alerts, Renewal & Maturity Tracking (Week 7)**
**Goal**: Automated alerts, maturity tracking, renewal flow, escalation engine

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S6-01 | Build alert scheduler infrastructure (BullMQ/Redis queue, job definitions, idempotency) | Backend Engineer | S1-10 | Jobs queue, run safely twice, metrics exposed |
| S6-02 | Implement maturity reminders job (60, 30, 15, 7, 1 days before) | Backend Engineer | S6-01, S2-01 | Notifications sent to institution + officer |
| S6-03 | Implement bank reminder job (hourly, 24h/48h reminders) | Backend Engineer | S6-01, S3-13 | Reminders sent, tracked in delivery log |
| S6-04 | Implement bank no-reply escalation (72h→Officer, 5d→Admin) | Backend Engineer | S6-01, S3-13 | Escalation notifications sent, logged |
| S6-05 | Implement overdue renewal escalation (daily, after maturity no renewal) | Backend Engineer | S6-01, S2-17 | Admin notified, FDR marked overdue |
| S6-06 | Implement release SLA monitoring (hourly, stage time limits) | Backend Engineer | S6-01, S5-11 | SLA breaches alert officer + admin |
| S6-07 | Implement token/OTP cleanup job (daily, expire stale) | Backend Engineer | S6-01, S3-01 | Expired tokens/OTPs removed |
| S6-08 | Build renewal flow API (`POST /fdrs/:id/renew`) - link to old FDR, same verification | Backend Lead | S2-17, S3-08 | New FDR created, linked, verification triggered |
| S6-09 | Build maturity/expiry dashboard for officers (visual timeline, bulk actions) | Frontend Engineer | S5-10, S5-19 | Visual timeline, filter by region/institution |
| S6-10 | Build renewal tracking UI (show old→new link, status of new verification) | Frontend Engineer | S6-08 | Linked FDRs visible, verification status |
| S6-11 | Create Admin escalation dashboard (overdue, no-reply, SLA breaches) | Frontend Lead | S6-04, S6-05, S6-06 | Reassign officer, resend verification, bulk actions |
| S6-11 | Implement alert preferences (per user, per channel, frequency) | Backend Engineer | S1-08, S6-01 | Users configure notification channels |
| S6-12 | Add metrics endpoints for Prometheus (job duration, success/failure, queue depth) | DevOps | S6-01 | `/metrics` exposes job metrics |

#### Sprint 6 Deliverables
- [ ] Alert scheduler with idempotent jobs
- [ ] Maturity reminders (5 intervals)
- [ ] Bank reminders + no-reply escalation
- [ ] Overdue renewal escalation
- [ ] Release SLA monitoring
- [ ] Token/OTP cleanup
- [ ] Renewal API + linked FDR tracking
- [ ] Officer maturity dashboard
- [ ] Admin escalation dashboard
- [ ] User alert preferences
- [ ] Prometheus metrics for jobs

---

### **Sprint 7: Release Workflow (Week 8)**
**Goal**: Complete release request → checklist → officer recommendation → admin approval → released

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S7-01 | Design release request model (FDR, reason, documents, status, checklist, recommendation, approval) | Backend Lead | S2-18 | All fields, state machine |
| S7-02 | Implement release auto-checklist (verified, lien confirmed, conditions met, no open observations, docs present) | Backend Lead | S3-08, S2-18 | Checklist evaluated automatically |
| S7-03 | Build release request API (`POST /fdrs/:id/release-requests`) - eligibility check | Backend Lead | S7-01, S7-02 | Only eligible FDRs (Active, verified, lien confirmed) |
| S7-04 | Implement officer recommendation (`POST /release-requests/:id/recommend`) | Backend Lead | S5-11, S7-02 | Checklist reviewed, recommendation + comments |
| S7-05 | Implement admin final approval (`POST /release-requests/:id/approve`) - different person rule | Backend Lead | S7-04 | Approver ≠ recommender, audit logged |
| S7-06 | Implement release rejection (admin or officer) with reason | Backend Lead | S7-04, S7-05 | Reason required, status→Rejected, notified |
| S7-07 | Build SLA timer on each release stage (requested→recommended→approved) | Backend Engineer | S6-06, S7-01 | Timestamps recorded, SLA alerts fire |
| S7-08 | Build turnaround time calculation from audit timestamps | Backend Engineer | S1-06, S7-07 | Reportable metric per release |
| S7-09 | Create Institution Release Request UI (eligibility check, reason, documents, submit) | Frontend Lead | S2-18, S7-03 | Shows eligibility, blocks if not eligible |
| S7-10 | Build Officer Release Review UI (checklist, recommendation, comments) | Frontend Engineer | S5-20, S7-04 | Auto-checklist with manual override, recommend |
| S7-11 | Create Admin Release Approval UI (pending approvals, checklist, approve/reject, different person enforcement) | Frontend Lead | S7-05, S7-06 | Cannot approve own recommendation |
| S7-12 | Build release status tracking for institution (timeline, current stage, SLA) | Frontend Lead | S7-01, S7-07 | Visual progress, estimated completion |
| S7-13 | Implement release completion (status→Released, generate release certificate) | Backend Lead | S7-05 | Certificate PDF generated, downloadable |
| S7-14 | Write end-to-end release workflow tests (happy path, rejection, SLA breach, different person rule) | QA + Backend | S7-13 | All scenarios pass |

#### Sprint 7 Deliverables
- [ ] Release request with eligibility validation
- [ ] Auto-checklist evaluation
- [ ] Officer recommendation workflow
- [ ] Admin final approval (different person enforcement)
- [ ] Rejection with reason at any stage
- [ ] SLA timers + turnaround calculation
- [ ] Release certificate generation
- [ ] Complete release UI for all roles
- [ ] E2E release workflow tests

---

### **Sprint 8: Admin & Reports (Week 9)**
**Goal**: Admin dashboard, user management, directory management, rules, reports, audit viewer

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S8-01 | Build overview dashboard API (`GET /reports/overview`) - cached counts | Backend Lead | S1-10, S2-01 | Active, expiring, matured, renewed, released, pending |
| S8-02 | Build analytics API (`GET /reports/analytics`) - turnaround, pending/officer, bank response, state view | Backend Engineer | S1-06, S3-08 | Aggregated metrics, date range filters |
| S8-03 | Implement user management CRUD (`/users`) - create officers, institution users, nodal officers | Backend Lead | S1-04, S1-05 | Role assignment, MFA reset, deactivate |
| S8-04 | Build bank directory management (`/directory`) - import RBI IFSC, verify contacts, re-verification dates | Backend Engineer | S2-02, S3-01 | Import UI, contact verification workflow |
| S8-05 | Build rules management UI (`/rules`) - reminder days, wait hours, escalation chain, required docs, release conditions | Frontend Lead | S1-10 | All rules editable, immediate effect |
| S8-06 | Implement escalations API (`/escalations`) - overdue, unresolved, reassign officer | Backend Engineer | S6-04, S6-05 | List escalations, reassign with notification |
| S8-07 | Build reports API (`/reports`) - pending verifications, upcoming maturities, missing docs, intervention needed | Backend Engineer | S2-01, S4-07 | All report types, pagination, filters |
| S8-08 | Implement report export (PDF + Excel) | Backend Engineer | S8-07 | Download buttons, formatted output |
| S8-09 | Build audit log viewer API (`GET /audit`) - search, filter, hash chain integrity check | Backend Lead | S1-06, S1-07 | Full-text search, date/entity/actor filters, integrity run |
| S8-10 | Create Admin Overview Dashboard (count cards, charts, quick actions) | Frontend Lead | S8-01 | Real-time counts, trend charts |
| S8-11 | Build Analytics Dashboard (turnaround charts, officer workload, bank response heatmap, state map) | Frontend Lead | S8-02 | Interactive charts, date range, export |
| S8-12 | Create User Management UI (table, create/edit modal, role assign, MFA reset, deactivate) | Frontend Lead | S8-03 | Bulk actions, search, pagination |
| S8-13 | Build Directory Management UI (import RBI CSV, contact verification workflow, re-verification calendar) | Frontend Engineer | S8-04 | Drag-drop import, verification status, reminders |
| S8-14 | Create Rules Configuration UI (form per category, validation, immediate preview) | Frontend Lead | S8-05 | No deploy needed, audit logged |
| S8-15 | Build Escalations Dashboard (list, filter, reassign, bulk resolve) | Frontend Engineer | S8-06 | Officer reassignment with notification |
| S8-16 | Create Reports Center (tabbed reports, filters, scheduled exports, PDF/Excel download) | Frontend Lead | S8-07, S8-08 | All reports accessible, scheduled email |
| S8-17 | Build Audit Log Viewer UI (search, filter, timeline, integrity check button) | Frontend Engineer | S8-09 | Chain verification result displayed |
| S8-18 | Write admin integration tests (user lifecycle, rules change effect, report accuracy) | QA + Backend | S8-03 to S8-17 | All admin flows tested |

#### Sprint 8 Deliverables
- [ ] Overview dashboard with cached counts
- [ ] Analytics with charts and trends
- [ ] User management (CRUD, roles, MFA)
- [ ] Bank directory management (import, verify, re-verify)
- [ ] Rules configuration (no-deploy changes)
- [ ] Escalations dashboard with reassignment
- [ ] Reports center (5+ report types, PDF/Excel export)
- [ ] Audit log viewer with integrity check
- [ ] All admin UI screens

---

### **Sprint 9: Integration & Hardening (Week 10)**
**Goal**: OpenAPI docs, webhooks, SSO hardening, security fixes, API connector interface

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S9-01 | Publish complete OpenAPI 3.0 spec (versioned under `/api/v1`) | Backend Lead | S1-12 | Swagger UI + downloadable JSON/YAML |
| S9-02 | Implement webhook system (fdr.verified, fdr.flagged, fdr.expiring, release.approved) | Backend Engineer | S1-08, S3-08 | Signed payloads, retry with backoff, delivery log |
| S9-03 | Build webhook management UI (register, test, view deliveries, retry) | Frontend Engineer | S9-02 | CRUD webhooks, test button, delivery history |
| S9-04 | Harden SSO/OIDC (token validation, claim mapping, role sync, session management) | Backend Lead | S1-02 | SSO works end-to-end, roles synced |
| S9-05 | Implement API key management for system clients (scopes, rotation, expiry) | Backend Lead | S1-01 | Keys with scopes, audit on use |
| S9-06 | Build Bank API Connector interface + adapter framework | Backend Engineer | S3-08 | `verify(fdr)` interface, per-bank adapters |
| S9-07 | Implement secrets vault integration (HashiCorp Vault / AWS Secrets Manager) | DevOps | S9-06 | Bank API credentials in vault, not config |
| S9-08 | Add connector routing logic (adapter → nodal portal → secure link fallback) | Backend Engineer | S9-06, S3-08 | Priority order respected, logged |
| S9-09 | Implement connector failure handling (timeouts, retries, queue, escalation) | Backend Engineer | S9-08, S6-01 | Retries via queue, then escalate like no-reply |
| S9-10 | Security audit: input validation, output encoding, CSRF, secure headers, dependency scan | DevOps | All prior | No high/critical findings in scan |
| S9-11 | Penetration testing basics (auth bypass, IDOR, injection, token reuse) | DevOps + QA | S9-10 | All test cases pass |
| S9-12 | Implement rate limiting (per IP, per user, per endpoint) | Backend Lead | S1-01 | Configurable limits, 429 responses |
| S9-13 | Add request/response sanitization (no sensitive data in logs, PII masking) | Backend Lead | S1-06 | Logs clean, audit has before/after |
| S9-14 | Build AICTE bulk import tool (Excel validation report, dry-run, commit) | Backend Engineer | S2-01, S8-04 | Validates rows, reports errors, imports clean |
| S9-15 | Performance optimization (query indexes, caching strategy, connection pooling) | Backend Lead + DevOps | All prior | Load test targets met (see Sprint 9) |

#### Sprint 9 Deliverables
- [ ] Complete OpenAPI documentation
- [ ] Webhook system with 4 events + retry
- [ ] Webhook management UI
- [ ] Hardened SSO + API keys
- [ ] Bank API connector framework + 1 sample adapter
- [ ] Secrets vault integration
- [ ] Connector routing + fallback logic
- [ ] Security audit clean
- [ ] Rate limiting + sanitization
- [ ] AICTE bulk import tool
- [ ] Performance optimizations

---

### **Sprint 10: Testing, UAT & Release Prep (Weeks 11-12)**
**Goal**: Load testing, UAT, training materials, deployment, pitch preparation

#### Tasks

| ID | Task | Owner | Dependencies | Acceptance Criteria |
|----|------|-------|--------------|---------------------|
| S10-01 | Write k6 load test scripts (read APIs, FDR submit, 5MB upload, dashboard) | DevOps | S9-15 | Scripts cover all target endpoints |
| S10-02 | Execute load tests (smoke, load, stress, spike, soak) with synthetic data | DevOps | S10-01 | p95 targets: read<500ms, submit<1s, upload<3s, dashboard<1s, error<1% |
| S10-03 | Run daily alert job load test (100k FDRs, <5 min) | DevOps | S6-01, S10-02 | Job completes in <5 minutes |
| S10-04 | Fix performance bottlenecks identified in load testing | Backend Lead + DevOps | S10-02, S10-03 | All targets met |
| S10-05 | Security test execution (OWASP Top 10, auth, tokens, file upload) | DevOps + QA | S9-11 | No critical/high vulnerabilities |
| S10-06 | Prepare UAT test scripts (6 scenarios from problem statement) | QA | All prior | Scripts cover: new FDR, validity tracking, maturity, renewal, discrepancy, release |
| S10-07 | Conduct UAT with officer and institution users | QA + Product | S10-06 | Users sign off on all 6 scenarios |
| S10-08 | Fix UAT feedback (bugs, usability, missing features) | All | S10-07 | All blockers resolved |
| S10-09 | Create training materials (1-page guides per role, short videos) | Product & QA | All prior | 6 guides (Institution, Officer, Admin, Bank Manager, Nodal, Auditor) + 6 videos |
| S10-10 | Prepare deployment manifests (K8s/Helm/Docker Swarm for AICTE servers/gov cloud) | DevOps | S0-03, S9-15 | Deployable to target environment |
| S10-11 | Run production deployment dry-run (staging → prod) | DevOps | S10-10 | Zero-downtime deploy verified |
| S10-12 | Create SIH pitch materials (PPT, demo script, Q&A prep, architecture diagram) | Product & QA | All prior | 15-min pitch, 5-min demo, anticipated Q&A |
| S10-13 | Final code freeze, tag release, generate changelog | All | S10-08 | Release tag v1.0.0, changelog complete |
| S10-14 | Handover documentation (architecture, API, operations, troubleshooting) | All | All prior | Complete docs for AICTE team |

#### Sprint 10 Deliverables
- [ ] Load test results meeting all targets
- [ ] Security test pass
- [ ] UAT signed off on 6 scenarios
- [ ] Training guides + videos for all 6 roles
- [ ] Production deployment ready
- [ ] SIH pitch + demo materials
- [ ] Release v1.0.0 tagged
- [ ] Complete handover documentation

---

## Cross-Cutting Concerns (Ongoing Across All Sprints)

### Code Quality
- [ ] All PRs require 1 review + CI pass
- [ ] Unit test coverage >80% for business logic
- [ ] Integration tests for all API endpoints
- [ ] E2E tests for critical user flows (Cypress/Playwright)

### Security
- [ ] Dependency scanning on every PR (Dependabot/Snyk)
- [ ] Secret scanning (git-secrets/truffleHog)
- [ ] SAST/DAST in CI pipeline
- [ ] Penetration test before release

### Observability
- [ ] Structured logging (JSON) with correlation IDs
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Prometheus metrics + Grafana dashboards
- [ ] Alert rules for errors, latency, queue depth

### Documentation
- [ ] API docs (OpenAPI) always current
- [ ] Architecture decision records (ADRs)
- [ ] Runbooks for common operations
- [ ] Developer onboarding updated per sprint

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Bank API integration delays | High | Medium | Build fallback (nodal/link) first, add adapters incrementally |
| RBI IFSC data changes | Medium | Low | Automated re-import script, versioned directory |
| MFA adoption resistance | Medium | Medium | Provide backup codes, clear guides, admin reset |
| Performance at scale | Medium | High | Load test early (Sprint 5), optimize indexes, caching |
| Scope creep from stakeholders | High | Medium | Strict sprint boundaries, change control via Product |
| SIH deadline immovable | Certain | Critical | Buffer in Sprint 10, prioritize core flows, cut nice-to-haves |

---

## Definition of Done (Per Sprint)

A sprint is complete when:
1. All tasks marked ✅ with acceptance criteria verified
2. Code reviewed, merged, deployed to staging
3. Automated tests pass (unit, integration, E2E)
4. No critical/high security findings
5. Documentation updated
6. Product owner accepts demo

---

## Milestones

| Milestone | Target Week | Criteria |
|-----------|-------------|----------|
| **M1: Foundation Ready** | Week 2 | Auth, permissions, audit, notifications working |
| **M2: Institution Flow Complete** | Week 3 | Submit, track, renew, release-request end-to-end |
| **M3: Bank Verification Live** | Week 5 | Secure link + nodal portal functional |
| **M4: Officer Queue Operational** | Week 6 | Full case management working |
| **M5: Alerts & Renewals Automated** | Week 7 | Scheduler running, reminders firing |
| **M6: Release Workflow Complete** | Week 8 | Request→Recommend→Approve→Release |
| **M7: Admin & Reports Ready** | Week 9 | All admin screens, reports exporting |
| **M8: Integration Hardened** | Week 10 | OpenAPI, webhooks, SSO, security clean |
| **M9: Release Candidate** | Week 12 | Load test pass, UAT signed off, deploy ready |

---

## Resource Allocation Summary

| Sprint | Backend Lead | Backend Eng | Frontend Lead | Frontend Eng | DevOps | Product/QA |
|--------|--------------|-------------|---------------|--------------|--------|------------|
| S0 | 40% | 20% | 20% | 10% | 80% | 20% |
| S1 | 60% | 40% | 50% | 30% | 40% | 20% |
| S2 | 70% | 50% | 70% | 20% | 20% | 30% |
| S3 | 50% | 60% | 20% | 70% | 20% | 30% |
| S4 | 50% | 30% | 20% | 80% | 20% | 40% |
| S5 | 60% | 30% | 20% | 50% | 20% | 40% |
| S6 | 30% | 70% | 30% | 50% | 40% | 30% |
| S7 | 60% | 30% | 50% | 40% | 20% | 30% |
| S8 | 50% | 50% | 70% | 40% | 20% | 50% |
| S9 | 50% | 60% | 30% | 30% | 70% | 30% |
| S10 | 40% | 40% | 40% | 40% | 80% | 80% |

---

## Next Steps

1. **Kickoff**: Review this plan with team, adjust estimates
2. **Sprint 0 Planning**: Break down S0 tasks into daily tickets
3. **Environment Setup**: Provision cloud accounts (MongoDB Atlas, Redis, S3, Vault)
4. **Architecture Review**: Validate data models, API contracts before Sprint 1
5. **Weekly Cadence**: Sprint planning Mon, standups daily, review Fri, retro Fri