# CarePulse — Healthcare Appointment & Follow-up Manager

> **GitHub Repository**: [https://github.com/A-Kushwah/unthinkable-healthcare-appointment](https://github.com/A-Kushwah/unthinkable-healthcare-appointment)

CarePulse is a healthcare appointment prototype built with **Next.js 14 (App Router), TypeScript, Prisma ORM, Tailwind CSS, SQLite for local development, and optional PostgreSQL deployment**. It includes appointment booking, double-booking concurrency protection, doctor leave management, transactional outbox retries, Google Calendar synchronization, and **Live OpenAI AI-assisted visit preparation using strict JSON Schema Structured Outputs**.

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
CarePulse uses a modular monolith pattern. Domain modules (`booking`, `doctors`, `notifications`, `ai`, `calendar`, `reminders`) live in separate modules within a single Next.js application instance. This eliminates microservice networking overhead, enables zero-cost hosting, and provides in-memory transactional guarantees.

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

### 4. Transactional Outbox & Job Lease Recovery
To prevent external API failures (SMTP email servers, Google Calendar REST API) from rolling back successful appointment bookings:
- Notification jobs are written to `NotificationLog` inside the booking transaction with unique `idempotencyKey` fields (`appt_email_confirmed_${id}`, `appt_calendar_create_${id}`).
- **Atomic Job Claiming & Lease Recovery**: Worker nodes claim pending jobs or stale `PROCESSING` jobs (`claimedAt <= NOW() - 5 minutes`) using a unique `claimToken` in an atomic database update step.
- **Adapter Boundary Idempotency**: Email adapter transmits `X-Idempotency-Key` headers; Google Calendar adapter formats event IDs with `idempotencyKey` and handles HTTP 409 duplicate responses.

### 5. Live OpenAI Integration & Clinical Safety Architecture
- **Strict JSON Schema Structured Outputs**: Uses OpenAI SDK (`gpt-4o-mini`) with `response_format: { type: "json_schema", json_schema: ... }` to enforce exact schema compliance on AI summaries.
- **Audit Persistence (`AiGenerationLog`)**: Every AI invocation persists `appointmentId`, `patientId`, `doctorId`, `provider`, `model`, `promptVersion`, `status`, `requestId`, `latencyMs`, `promptTokens`, `completionTokens`, `inputHash`, and `outputJson`.
- **Safety Controls**: Server-only execution, configurable timeout (`OPENAI_TIMEOUT_MS`), PHI log redaction (`[REDACTED_EMAIL]`, `[REDACTED_PHONE]`), persistent rate limiting (10 req/min), doctor ownership verification, and mandatory non-diagnostic medical disclaimers.

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

# 3. Execute automated test suite (28 tests)
npm test

# 4. Start Next.js development server
npm run dev
```

Open `http://localhost:3000` to launch the application.

---

## Live Provider Setup & Environment Variables (`.env`)

To switch from local `mock` mode to live OpenAI generation:

```env
LLM_PROVIDER="openai"
OPENAI_API_KEY="sk-proj-your-openai-api-key-here"
OPENAI_MODEL="gpt-4o-mini"
OPENAI_TIMEOUT_MS="10000"
```

| Variable Name | Default / Demo Value | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `"file:./dev.db"` | Database connection string (SQLite file path or PostgreSQL URI). |
| `LLM_PROVIDER` | `"mock"` | AI adapter mode (`mock` for offline dev, `openai` for live API, `test` for automated tests). |
| `OPENAI_API_KEY` | `""` | Official OpenAI API key for live structured outputs. |
| `OPENAI_MODEL` | `"gpt-4o-mini"` | OpenAI model name for clinical generation. |
| `OPENAI_TIMEOUT_MS` | `"10000"` | Request timeout limit in milliseconds. |
| `JWT_SECRET` | `"carepulse-local-secret-key"` | HMAC-SHA256 secret for signed session cookies. |
| `CRON_SECRET` | `"carepulse-worker-key"` | Authorization bearer key for worker trigger endpoints. |

---

## Demo Accounts

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@carepulse.com` | `admin123` | Full Admin Operations & Outbox Console |
| **Doctor** | `sarah.jenkins@carepulse.com` | `admin123` | Doctor Consultation Queue & Leave Manager |
| **Patient** | `alex.rivera@example.com` | `patient123` | Patient Slot Search, Booking & Visit Preparation |

---

## Production Deployment Checklist

To graduate from prototype to full production deployment:
- [x] Live OpenAI SDK integration with strict JSON Schema Structured Outputs.
- [x] Audit record logging (`AiGenerationLog`) with latency and token tracking.
- [x] Server-side role authorization & doctor/patient ownership enforcement.
- [ ] Deploy managed PostgreSQL database and run `prisma migrate deploy`.
- [ ] Configure production environment variables (`LLM_PROVIDER=openai`, `OPENAI_API_KEY`).
- [ ] Connect Redis/Upstash for distributed rate limiting across serverless instances.
- [ ] Enable HTTPS-only secure cookie policies in production.

---

## Test & Build Results

- **Automated Test Suite**: **28/28 Passed** (`npm test`)
- **TypeScript Typecheck**: **0 Errors** (`npx tsc --noEmit`)
- **Next.js Production Build**: `✓ Compiled successfully (22/22 static pages)`
