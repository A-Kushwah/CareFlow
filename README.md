# CarePulse — Healthcare Appointment & Follow-up Manager

> **GitHub Repository**: [https://github.com/A-Kushwah/unthinkable-healthcare-appointment](https://github.com/A-Kushwah/unthinkable-healthcare-appointment)

CarePulse is a healthcare appointment application built with **Next.js 14 (App Router), TypeScript, Prisma ORM, Tailwind CSS, SQLite for local development, and optional PostgreSQL deployment**. It includes appointment booking, double-booking prevention, doctor leave management, transactional notification retries, Google Calendar synchronization, and AI-assisted visit preparation.

---

## Technical Documentation Index

- 📐 **[System Architecture](docs/architecture.md)** — Modular monolith pattern, double-booking protocol, outbox engine, and AI safeguards.
- 🔌 **[API Reference](docs/api.md)** — REST endpoints, request/response schemas, status codes, and role authorization matrix.
- 🗄️ **[Database Strategy](docs/database.md)** — Schema models, ER diagram, indexes, and PostgreSQL GiST exclusion constraint.
- 🧪 **[Quality & Testing](docs/testing.md)** — Automated test suite commands, scenario coverage, and execution results.
- 🚀 **[Deployment Guide](docs/deployment.md)** — Step-by-step local setup, environment variables, PostgreSQL migration, and production deployment.

---

## System Design Summary (Under 800 Words)

### 1. Architecture Overview
CarePulse uses a modular monolith pattern. Domain modules (`booking`, `doctors`, `notifications`, `ai`, `calendar`, `reminders`) live in separate modules within a single Next.js application and database. This eliminates microservice networking overhead, enables zero-cost free-tier hosting, and provides in-memory transactional guarantees.

### 2. Double-Booking Concurrency Engine & Database Strategy
- **Local Demo (SQLite)**: Double-booking is protected by transactional overlap checks (`SlotHold` + Prisma `$transaction` interactive locks). The transaction queries active `Appointment` records and unexpired `SlotHold` entries for time overlap `(existingStart < requestedEnd AND existingEnd > requestedStart)`.
- **Production PostgreSQL Deployment**: A PostgreSQL GiST exclusion constraint is documented in `docs/database.md` and applied during PostgreSQL deployment to enforce concurrency at the database engine layer:
  ```sql
  ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_appointments"
  EXCLUDE USING gist ("doctorId" WITH =, tsrange("startTime", "endTime") WITH &&)
  WHERE (status IN ('CONFIRMED', 'HELD'));
  ```

### 3. Doctor Leave Management Engine
When a doctor submits leave dates (`startDate` to `endDate`), the system records the approved `DoctorLeave`. It queries all future active appointments falling within the leave range, marks them as `CANCELLED`, and atomically enqueues outbox notifications for patients and Google Calendar deletion sync events. Subsequent slot availability queries filter out approved leave days automatically.

### 4. Transactional Outbox, Atomic Job Claiming & Stale Lease Recovery
To prevent external API failures (SMTP email servers, Google Calendar REST API) from rolling back successful appointment bookings:
- Notification jobs are written to `NotificationLog` inside the booking transaction with unique `idempotencyKey` fields (`appt_email_confirmed_${id}`, `appt_calendar_create_${id}`).
- **Atomic Job Claiming & Lease Recovery**: Worker nodes claim pending jobs or stale `PROCESSING` jobs (`claimedAt <= NOW() - 5 minutes`) using a unique `claimToken` in an atomic database update step. This prevents worker race conditions, recovers crashed worker jobs, and blocks preempted workers from overwriting reclaimed results.
- **Adapter Boundary Idempotency**: Email adapter transmits `X-Idempotency-Key` headers; Google Calendar adapter formats event IDs with `idempotencyKey` and handles HTTP 409 duplicate responses gracefully.

### 5. AI Healthcare Assistant & Safety Architecture
- **Pre-Visit Intake**: Summarizes patient symptoms, identifies chief complaint, calculates urgency level (`Low`/`Medium`/`High`), and suggests clinical questions.
- **Post-Visit Notes**: Synthesizes consultation notes into patient-friendly summaries, medication schedules, and follow-up steps.
- **Safety Safeguards**: Server-side execution only, input truncation (2000 chars max), 5-second timeout wrappers, Zod schema validation, deterministic mock fallback summaries when offline, and mandatory non-diagnostic medical disclaimers on all AI outputs.

---

## 5-Minute Evaluator Quickstart

```bash
# 1. Clone repository & install dependencies
git clone https://github.com/A-Kushwah/unthinkable-healthcare-appointment.git
cd unthinkable-healthcare-appointment
npm install

# 2. Setup SQLite database & seed demo accounts
npx prisma generate
npx prisma db push --accept-data-loss
node prisma/seed.js

# 3. Execute automated test suite (21 tests)
npm test

# 4. Start Next.js development server
npm run dev
```

Open `http://localhost:3000` to launch the application.

---

## Demo Accounts

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@carepulse.com` | `admin123` | Full Admin Operations & Outbox Console |
| **Doctor** | `sarah.jenkins@carepulse.com` | `admin123` | Doctor Consultation Queue & Leave Manager |
| **Patient** | `alex.rivera@example.com` | `patient123` | Patient Slot Search, Booking & Visit Preparation |

---

## Environment Variables (`.env.example`)

```env
DATABASE_URL="file:./dev.db"
EMAIL_PROVIDER="console"
LLM_PROVIDER="mock"
CALENDAR_ENABLED="false"
JWT_SECRET="carepulse-local-secret-key"
CRON_SECRET="carepulse-worker-key"

GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REFRESH_TOKEN=""
OPENAI_API_KEY=""
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
```

---

## Test & Build Results

- **Node.js**: `v24.11.0`
- **npm**: `11.7.0`
- **Automated Test Suite**: 21/21 Passed (`npm test`)
- **TypeScript Typecheck**: 0 Errors (`npx tsc --noEmit`)
- **Next.js Production Build**: `✓ Compiled successfully (22/22 static pages)`
