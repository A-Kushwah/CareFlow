# CarePulse — Healthcare Appointment & Follow-up Manager

> **GitHub Repository**: [https://github.com/A-Kushwah/unthinkable-healthcare-appointment](https://github.com/A-Kushwah/unthinkable-healthcare-appointment)

CarePulse is a healthcare appointment system built with **Next.js 14 (App Router), TypeScript, Prisma ORM, Tailwind CSS, SQLite for local development, and PostgreSQL for production**. It includes appointment booking, double-booking concurrency protection, doctor leave management, transactional outbox retries, Google Calendar synchronization, and **Live OpenAI AI-assisted clinical post-visit preparation using strict JSON Schema Structured Outputs**.

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

### 3. Doctor-Authored Prescriptions & AI Post-Visit Workflow
- **Clinician Authority**: Prescriptions (medication, dosage, frequency, duration, instructions) are authored exclusively by the doctor. The AI model is strictly prohibited from inventing, altering, or omitting any medication.
- **Strict JSON Schema Structured Outputs**: Uses OpenAI SDK (`gpt-4o-mini`) with `response_format: { type: "json_schema", json_schema: ... }` to format patient-friendly explanations without altering doctor instructions.
- **Transactional Idempotency**: Consultation records update `Appointment` and create `MedicationReminder` records in a Prisma transaction. Resubmitting consultation notes updates existing reminders without creating duplicate records.
- **Non-Fallback Failure Guard**: When `LLM_PROVIDER=openai`, if the OpenAI API call fails or `OPENAI_API_KEY` is missing, the system NEVER falls back to mock data. Clinician-entered notes and prescriptions are saved safely, and an explicit review banner is presented to the user with a retry action.

### 4. Transactional Outbox & Job Lease Recovery
To prevent external API failures (SMTP email servers, Google Calendar REST API) from rolling back successful appointment bookings:
- Notification jobs are written to `NotificationLog` inside the booking transaction with unique `idempotencyKey` fields (`appt_email_confirmed_${id}`, `appt_calendar_create_${id}`).
- **Atomic Job Claiming & Lease Recovery**: Worker nodes claim pending jobs or stale `PROCESSING` jobs (`claimedAt <= NOW() - 5 minutes`) using a unique `claimToken` in an atomic database update step.

---

## 5-Minute Evaluator Quickstart

```bash
# 1. Clone repository & install dependencies
git clone https://github.com/A-Kushwah/unthinkable-healthcare-appointment.git
cd unthinkable-healthcare-appointment
npm install

# 2. Setup SQLite database & seed demo accounts
npm run db:generate:local
npm run db:push
npm run db:seed:local

# 3. Execute automated test suite (33+ tests)
npm test

# 4. Start Next.js development server
npm run dev
```

Open `http://localhost:3000` to launch the application.

---

## Live Provider Setup & Environment Variables (`.env`)

To configure live OpenAI generation:

```env
LLM_PROVIDER="openai"
OPENAI_API_KEY="sk-proj-your-openai-api-key-here"
OPENAI_MODEL="gpt-4o-mini"
OPENAI_TIMEOUT_MS="10000"
```

> [!NOTE]
> Live API usage requires a valid `OPENAI_API_KEY` and will incur standard OpenAI API usage costs per request. Never expose your `OPENAI_API_KEY` in client-side code or public repositories.

| Variable Name | Default / Configured Value | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `"file:./dev.db"` | Database connection string (SQLite file path or PostgreSQL URI). |
| `LLM_PROVIDER` | `"openai"` | AI adapter mode (`openai` for live API, `test` for automated tests, `mock` for offline dev). |
| `OPENAI_API_KEY` | `""` | Official OpenAI API key for live structured outputs (Server-side only). |
| `OPENAI_MODEL` | `"gpt-4o-mini"` | OpenAI model name for clinical generation. |
| `OPENAI_TIMEOUT_MS` | `"10000"` | Request timeout limit in milliseconds. |
| `JWT_SECRET` | `"carepulse-local-secret-key"` | HMAC-SHA256 secret for signed session cookies. |

---

## Demo Accounts

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@carepulse.com` | `admin123` | Full Admin Operations & Outbox Console |
| **Doctor** | `sarah.jenkins@carepulse.com` | `admin123` | Doctor Consultation Queue, Prescription Form & Leave Manager |
| **Patient** | `alex.rivera@example.com` | `patient123` | Patient Slot Search, Booking & Prescriptions Dashboard |

---

## Production Deployment Checklist

- [x] Live OpenAI SDK integration with strict JSON Schema Structured Outputs.
- [x] Audit record logging (`AiGenerationLog`) with latency, request ID, and token tracking.
- [x] Doctor-authored prescription authority with atomic database transactions.
- [x] Non-fallback failure recovery policy when live AI provider is unavailable.
- [ ] Deploy managed PostgreSQL database and run `npm run db:migrate:deploy`.
- [ ] Set production environment variables (`LLM_PROVIDER=openai`, `OPENAI_API_KEY`).
