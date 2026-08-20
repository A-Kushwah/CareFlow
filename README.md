# Healthcare Appointment & Follow-up Manager

> **Status**: Work-in-Progress (Initial Repository Initialization & Architecture Setup)

## Assignment Purpose
A production-grade, highly reliable **Healthcare Appointment & Follow-up Management System** built as a modular monolith. Designed to eliminate double-bookings, respect doctor leave schedules dynamically, guarantee notification delivery via database-backed retries, provide structured AI pre/post-visit summaries, and synchronize seamlessly with external adapters (Email & Google Calendar).

## Planned Technology Stack
- **Framework**: Next.js 14+ (App Router, Server Actions & API Routes)
- **Language**: TypeScript (Strict Mode)
- **Database & ORM**: PostgreSQL / SQLite with Prisma ORM
- **Styling**: Tailwind CSS & Vanilla CSS (Glassmorphism & Healthcare Design System)
- **Background Jobs & Queue**: Database-backed transactional outbox pattern with exponential backoff retry worker
- **Integrations**:
  - **Email Adapter**: Configurable SMTP / Nodemailer with fallback logger
  - **Google Calendar Adapter**: OAuth & API synchronization engine
  - **AI LLM Adapter**: Structured pre-visit triage & post-visit summarizer with deterministic mock provider fallback
- **Validation**: Zod schema validation
- **Testing**: Node test runner / Vitest unit & concurrency tests, browser e2e verification

## Key System Principles
1. **Zero Double-Bookings**: Atomic transactional locks & database-level availability checks.
2. **Doctor Leave Protection**: Dynamic slot exclusion and automated rescheduling workflows on leave creation.
3. **Resilient Notifications**: Outbox pattern with exponential backoff retries and Dead Letter Queue (DLQ).
4. **LLM Safety**: Server-side validation, prompt versioning, strict fallbacks, and explicit non-diagnostic medical disclaimer.
5. **Free-Tier Operational Mode**: Out-of-the-box local operation using `EMAIL_PROVIDER=console`, `LLM_PROVIDER=mock`, `CALENDAR_ENABLED=false`.

---

*Project initial draft developed as part of Senior Engineering assignment.*
