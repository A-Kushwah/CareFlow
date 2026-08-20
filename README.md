# CarePulse — Healthcare Appointment & Follow-up Manager

> **GitHub Repository**: [https://github.com/A-Kushwah/unthinkable-healthcare-appointment](https://github.com/A-Kushwah/unthinkable-healthcare-appointment)

Enterprise-grade **Healthcare Appointment System** built as a modular monolith in **Next.js 14 (App Router), TypeScript, Prisma ORM, Tailwind CSS, PostgreSQL/SQLite**, Google Calendar Sync, and an AI Healthcare Assistant.

---

## System Design Summary (Under 800 Words)

### 1. Architecture Overview
CarePulse adopts a **Modular Monolith** pattern. Domain modules (`booking`, `doctors`, `notifications`, `ai`, `calendar`, `reminders`) share a single TypeScript codebase while maintaining decoupled boundaries. This eliminates microservice networking overhead, enables zero-cost free-tier hosting, and provides instant in-memory transactional guarantees.

### 2. Double-Booking Concurrency Engine & Database Strategy
- **Local Demo (SQLite)**: Double-booking is prevented via a two-phase reservation protocol (5-minute `SlotHold` + Prisma `$transaction` interactive locks). The transaction queries active `Appointment` records and unexpired `SlotHold` entries for time overlap `(existingStart < requestedEnd AND existingEnd > requestedStart)`.
- **Production PostgreSQL Deployment**: For production PostgreSQL deployments, concurrency is additionally enforced at the database engine layer via a GiST exclusion constraint:
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
- **Atomic Job Claiming & Lease Recovery**: Worker nodes claim pending jobs or stale `PROCESSING` jobs (`claimedAt < NOW() - 5 minutes`) using a unique `claimToken` in an atomic database update step. This prevents worker race conditions, recovers crashed worker jobs, and blocks preempted workers from overwriting reclaimed results.
- **Adapter Boundary Idempotency**: Email adapter transmits `X-Idempotency-Key` headers; Google Calendar adapter formats event IDs with `idempotencyKey` and handles HTTP 409 duplicate responses gracefully.
- **Exponential Backoff + Jitter**: `nextRetryAt = NOW() + (10s * 2^attempt) + jitter(0-2s)`. Bounded retries (5 max) transition jobs to the **Dead Letter Queue (DLQ)** for admin inspection and re-queuing.

### 5. AI Healthcare Assistant & Safety Architecture
- **Pre-Visit Intake**: Summarizes patient symptoms and suggests clinical focus areas for doctors.
- **Post-Visit Notes**: Synthesizes consultation notes, patient instructions, and prescribed medications.
- **Safety Safeguards**: Server-side execution only, input truncation (2000 chars max), 5-second timeout wrappers, Zod schema validation, deterministic mock fallback summaries when offline, and mandatory non-diagnostic medical disclaimers on all AI outputs.

---

## Environment Setup (`.env.example`)

A `.env.example` file is included with safe local placeholders:

```env
DATABASE_URL="file:./dev.db"
EMAIL_PROVIDER="console"
LLM_PROVIDER="mock"
CALENDAR_ENABLED="false"
JWT_SECRET="replace-with-a-local-secret"

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

## Demo Accounts

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@carepulse.com` | `admin123` | Full Admin Outbox Console & DLQ Retry |
| **Doctor** | `sarah.jenkins@carepulse.com` | `admin123` | Doctor Consultation Queue & Leave Manager |
| **Patient** | `alex.rivera@example.com` | `patient123` | Patient Slot Booking & AI Symptom Intake |

---

## Environment Version & Test Results

- **Node.js**: `v24.11.0`
- **npm**: `11.7.0`
- **Automated Test Suite**: 16/16 Passed (`npm test`)
- **Next.js Production Build**: `✓ Compiled successfully (22/22 static pages)`

---

## Local Development Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Setup SQLite database & seed demo data
npx prisma generate
npx prisma db push --accept-data-loss
node prisma/seed.js

# 3. Execute test suite
npm test

# 4. Start Next.js development server
npm run dev
```
Open `http://localhost:3000` to view the application.
