# Top 5% Candidate Execution Plan

This plan details the systematic engineering strategy to elevate CarePulse into a distinctive, production-grade candidate submission.

## 1. Core Objectives
- **Security & Authorization**: Enforce strict server-side role boundaries. Disallow client-driven role escalation (registration defaults strictly to `PATIENT` on the server). Validate all ownership (`patientId === session.userId`, `doctorId === session.doctorId`).
- **Database & Concurrency Integrity**: Dual database architecture. SQLite for local zero-config demonstration and PostgreSQL for production deployments with a dedicated GiST exclusion constraint migration file (`prisma/migrations/20260821000000_postgresql_gist_exclusion/migration.sql`).
- **Resilient Outbox Engine**: Atomic job claiming, 5-minute stale processing lease recovery, claim-token guarded status updates, and adapter-level idempotency key enforcement.
- **Clinical Product UI/UX**: Shift from generic dark glassmorphism to a calm, editorial "care coordination desk" aesthetic. Warm off-white background (`#f8fafc`), deep ink text (`#0f172a`), crisp typography, compact data tables, and high-clarity status badges.
- **Authentic Copy**: Replace marketing buzzwords ("enterprise-grade", "seamless", "AI-powered") with evidence-based, grounded clinical copy ("Visit preparation", "Clinical summary", "This slot was reserved by another patient").

---

## 2. Milestone Roadmap & Commit Strategy

| Commit # | Commit Message | Key Changes & Focus |
| :--- | :--- | :--- |
| **1** | `docs: add top-percent audit and verification plan` | Add `top-5-percent-plan.md`, `security-audit.md`, `ui-design-system.md`, `verification-matrix.md`. |
| **2** | `fix(auth): enforce server-side role boundaries` | Server-controlled role assignment during registration (reject client `role` override), HTTP-only signed session cookies, demo login credentials. |
| **3** | `fix(api): validate ownership and request inputs` | Zod validation for all API bodies/queries. Enforce `patientId === session.userId` and `doctorId === session.doctorId` in all handlers. |
| **4** | `feat(db): add PostgreSQL production migration and constraints` | Dual DB strategy: SQLite local config + PostgreSQL schema migration file with GiST `EXCLUDE` constraint on overlapping appointments. |
| **5** | `fix(outbox): harden lease recovery and idempotent adapters` | 5-min stale job lease recovery, claim-token guarded status updates, `X-Idempotency-Key` headers for Email and Google Calendar event deduplication. |
| **6** | `test(security): cover role escalation and cross-user access` | Automated tests for privilege escalation rejection, cross-patient data access blocking, and unauthorized admin actions. |
| **7** | `feat(ui): add CarePulse visual design system` | Implement calm clinical design system in `globals.css` (warm off-white background, deep ink text, crisp typography, subtle borders). |
| **8** | `feat(ui): redesign patient booking workflow` | Redesign `DoctorDirectory` and `SymptomTriageWizard` as a clear care coordination desk with visit prep summaries. |
| **9** | `feat(ui): redesign doctor operations portal` | Redesign `DoctorPortal` focusing on today's schedule, patient prep notes, leave management, and post-visit clinical documentation. |
| **10** | `feat(ui): redesign admin queue console` | Redesign `AdminOutboxConsole` with compact queue health tables, DLQ inspection, worker trigger, and leave conflict logs. |
| **11** | `test(e2e): verify portals and failure states` | Comprehensive automated test suite covering authentication, authorization, booking conflicts, outbox retries, LLM fallbacks, and E2E flows. |
| **12** | `docs: update deployment and evaluator walkthrough` | Update `README.md` (< 800 words system design, 5-min evaluator setup, env vars, DB mode, LLM prompts) and `walkthrough.md`. |
| **13** | `chore: final submission cleanup` | Final typecheck, build verification, and clean submission zip archive generation. |
