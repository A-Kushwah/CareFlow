# CareFlow — Healthcare Appointment & Follow-up Manager

> **GitHub Repository**: [https://github.com/A-Kushwah/unthinkable-healthcare-appointment](https://github.com/A-Kushwah/unthinkable-healthcare-appointment)

CareFlow is a healthcare appointment system built with **Next.js 14 (App Router), TypeScript, Prisma ORM, Vanilla CSS with clinical Neumorphic UI design system, SQLite for local development, and PostgreSQL for production**. It includes appointment booking, double-booking concurrency protection, admin doctor management, appointment cancellation & rescheduling workflows, doctor leave management, transactional outbox retries, Google Calendar synchronization, and **Live OpenAI AI-assisted clinical post-visit preparation using strict JSON Schema Structured Outputs**.

---

## Technical Documentation Index

- 📐 **[System Architecture](docs/architecture.md)** — Modular monolith pattern, double-booking protocol, outbox engine, and AI safeguards.
- 🔌 **[API Reference](docs/api.md)** — REST endpoints, request/response schemas, status codes, and role authorization matrix.
- 🗄️ **[Database Strategy](docs/database.md)** — Schema models, ER diagram, indexes, and PostgreSQL GiST exclusion constraint.
- 🧪 **[Quality & Verification Matrix](docs/verification-matrix.md)** — Comprehensive requirement breakdown, automated test suite, and build verification.
- 🚀 **[Deployment Guide](docs/deployment.md)** — Step-by-step local setup, environment variables, PostgreSQL migration, and production deployment.

---

## System Design Summary

### 1. Architecture Overview
CareFlow uses a modular monolith pattern. Domain modules (`booking`, `doctors`, `notifications`, `ai`, `calendar`, `reminders`) live in separate modules within a single Next.js application instance. This eliminates microservice networking overhead, enables zero-cost hosting, and provides in-memory transactional guarantees.

### 2. Double-Booking Concurrency Engine & Database Strategy
- **Local Demo (SQLite)**: Double-booking is protected by transactional overlap checks (`SlotHold` + Prisma `$transaction` interactive locks). The transaction queries active `Appointment` records and unexpired `SlotHold` entries for time overlap `(existingStart < requestedEnd AND existingEnd > requestedStart)`.
- **Production PostgreSQL Deployment**: A PostgreSQL GiST exclusion constraint is documented in `docs/database.md` and applied during PostgreSQL deployment to enforce concurrency at the database engine layer:
  ```sql
  ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_appointments"
  EXCLUDE USING gist ("doctorId" WITH =, tsrange("startTime", "endTime") WITH &&)
  WHERE (status IN ('CONFIRMED', 'HELD'));
  ```

### 3. Doctor-Authored Prescriptions & AI Post-Visit Workflow
- **Clinician Authority**: Prescriptions (medication, dosage, frequency, duration, instructions) are authored exclusively by the doctor in a dedicated `Prescription` database model with unique constraint `@@unique([appointmentId, medication, dosage, frequency, duration])`. The AI model is strictly prohibited from inventing, altering, or omitting any medication.
- **Strict JSON Schema Structured Outputs**: Uses OpenAI SDK (`gpt-4o-mini`) with `response_format: { type: "json_schema", json_schema: ... }` to format patient-friendly explanations without altering doctor instructions.
- **Transactional Idempotency**: Consultation records save `Appointment` and `Prescription` records in a Prisma transaction BEFORE any AI API call occurs.
- **Non-Fallback Failure Guard**: When `LLM_PROVIDER=openai`, if the OpenAI API call fails or `OPENAI_API_KEY` is missing, the system NEVER falls back to mock data. Clinician-entered notes and prescriptions are saved safely, and an explicit review banner is presented to the user with a retry action.

### 4. Admin Doctor Management & Appointment Lifecycle
- **Admin Doctor Control**: `POST /api/admin/doctors`, `GET /api/admin/doctors`, `PATCH /api/admin/doctors/[id]`, `DELETE /api/admin/doctors/[id]`, `PUT /api/admin/doctors/[id]/working-hours`, and `POST /api/admin/doctors/[id]/leave`. Every route enforces `ADMIN_ONLY` session authorization and Zod schema validation.
- **Dual Email Notifications**: Booking enqueues `appointment_confirmed_patient_${id}` and `appointment_confirmed_doctor_${id}` with role-specific templates.
- **Cancellation & Rescheduling**: `POST /api/appointments/[id]/cancel` and `POST /api/appointments/[id]/reschedule` enforce ownership, check doctor leave & working hours, and enqueue dual role-specific emails & Google Calendar lifecycle events (`CALENDAR_CREATE_EVENT`, `CALENDAR_UPDATE_EVENT`, `CALENDAR_DELETE_EVENT`) idempotently.

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

# 3. Execute automated test suite (46 tests)
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
| **System Admin** | `admin@carepulse.com` | `admin123` | Admin Doctor Management & Transactional Outbox Console |
| **Doctor** | `sarah.jenkins@carepulse.com` | `admin123` | Doctor Consultation Queue, Prescription Form, Patient History & Leave Manager |
| **Patient** | `alex.rivera@example.com` | `patient123` | Patient Workspace, Reschedule/Cancel Controls & Doctor Prescriptions Dashboard |

---

## Verification Summary

- [x] **TypeScript Compilation**: `npx tsc --noEmit` passed with 0 errors.
- [x] **Automated Tests**: `npm test` passed 46/46 test scenarios.
- [x] **Production Build**: `npm run build` compiled 24 page & API route bundles cleanly.
- [x] **Neumorphic Clinical UI**: Tactile clay surface, accessible typography, high-contrast badges, and interactive modals.
