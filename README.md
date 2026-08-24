# CarePulse — Healthcare Appointment & Follow-up Manager

> **GitHub Repository**: [https://github.com/A-Kushwah/CareFlow](https://github.com/A-Kushwah/CareFlow) | Mirror: [https://github.com/A-Kushwah/unthinkable-healthcare-appointment](https://github.com/A-Kushwah/unthinkable-healthcare-appointment)

CarePulse is a full-stack healthcare appointment platform built with **Next.js 14 (App Router), TypeScript, Prisma ORM, Neumorphic Clinical UI design system, SQLite for local development, and PostgreSQL for production**. It includes role-based access control for Patients, Doctors, and System Admins, double-booking concurrency protection, doctor leave management, transactional outbox retries, Google Calendar synchronization, and **AI-assisted clinical intake & post-visit summaries using OpenAI JSON Schema Structured Outputs**.

---

## Technical Documentation Index

- 📐 **[System Architecture](docs/architecture.md)** — Modular monolith pattern, double-booking protocol, outbox engine, and AI safeguards.
- 🔌 **[API Reference](docs/api.md)** — REST endpoints, request/response schemas, status codes, and role authorization matrix.
- 🗄️ **[Database Strategy](docs/database.md)** — Schema models, ER diagram, indexes, and PostgreSQL GiST exclusion constraint.
- 🧪 **[Quality & Verification Matrix](docs/verification-matrix.md)** — Requirement breakdown, 65 automated test cases, and build verification.
- 🚀 **[Deployment Guide](docs/deployment.md)** — Step-by-step local setup, environment variables, PostgreSQL migration, and production deployment.

---

## System Design & Architecture Summary

### 1. Architecture Overview
CarePulse follows a **Modular Monolith** architecture pattern. Domain modules (`booking`, `doctors`, `notifications`, `ai`, `calendar`, `reminders`) reside in decoupled modules within a single Next.js application instance. This eliminates microservice network overhead, simplifies hosting, and provides in-memory transactional consistency.

### 2. Double-Booking Concurrency Engine & Database Strategy
- **Local Development (SQLite)**: Double-booking is prevented using transactional overlap checks (`SlotHold` + Prisma `$transaction` interactive locks). The transaction queries active `Appointment` records and unexpired `SlotHold` entries for time overlap `(existingStart < requestedEnd AND existingEnd > requestedStart)`.
- **Production Deployment (PostgreSQL)**: Concurrency is additionally enforced at the database engine level via a GiST exclusion constraint on `(doctorId, tsrange(startTime, endTime))`:
  ```sql
  ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_appointments"
  EXCLUDE USING gist ("doctorId" WITH =, tsrange("startTime", "endTime") WITH &&)
  WHERE (status IN ('CONFIRMED', 'HELD'));
  ```

### 3. Doctor Leave Management Engine
When an admin or doctor registers leave dates (`startDate` to `endDate`):
1. An approved `DoctorLeave` record is created.
2. The engine identifies all active future appointments for that doctor falling within the leave range and transitions them to status `CANCELLED`.
3. Outbox notifications (`APPOINTMENT_CANCELLED`) for affected patients and Google Calendar deletion events are transactionally enqueued.
4. Future availability queries automatically exclude slots overlapping approved leave dates.

### 4. Transactional Outbox & Notification Processor
To prevent external API failures (SMTP servers, Google Calendar API) from rolling back database operations:
1. **Outbox Persistence**: Notifications are written to `NotificationLog` inside the primary database transaction with a unique `idempotencyKey`.
2. **Atomic Job Claiming**: Worker nodes claim candidate jobs (`QUEUED` or `FAILED` ready for retry) using a unique `claimToken` in an atomic database update step.
3. **Stale Lease Recovery**: Processing jobs stuck in `PROCESSING` past 5 minutes (`claimedAt <= NOW() - 5 minutes`) are reclaimed by active workers.
4. **Exponential Backoff & DLQ**: Failed jobs retry using `nextRetryAt = NOW() + (10s * 2^attempt) + jitter(0-2s)`. After 5 failed attempts, jobs transition to the Dead Letter Queue (DLQ).

---

## LLM Usage & Prompt Specifications

CarePulse integrates OpenAI (`gpt-4o-mini`) using **Strict JSON Schema Structured Outputs** to process pre-visit intake symptoms and format post-visit summaries safely.

### 1. Pre-Visit Symptom Summary Prompt
Used when a patient submits symptoms prior to booking:
> *"Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: `<symptoms>`"*

- **Output Structure**: `urgencyLevel`, `chiefComplaint`, `suggestedQuestions` (array of 3 strings), `redFlagsIdentified`, `summary`, and `disclaimer`.
- **Storage**: Saved directly in `Appointment.aiPreSummary` and rendered in the Doctor Portal consultation queue.

### 2. Post-Visit Summary & Prescription Prompt
Used after a doctor completes a consultation and authors prescriptions:
> *"Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: `<notes>`"*

- **Clinician Authority Guard**: Prescriptions are authored exclusively by the clinician and stored in the `Prescription` model. The AI is strictly prohibited from inventing, altering, or omitting any medication name, dosage, frequency, or duration.
- **Storage**: Saved in `Appointment.aiPostSummary` and displayed on the Patient Workspace dashboard.

---

## Google Calendar OAuth 2.0 Integration Setup

CarePulse provides direct per-user Google Calendar synchronization via OAuth 2.0:

1. **Create Google Cloud Project**: Navigate to [Google Cloud Console](https://console.cloud.google.com/) and create a project named `CarePulse Healthcare`.
2. **Enable Google Calendar API**: Under **APIs & Services > Library**, search for `Google Calendar API` and enable it.
3. **Configure OAuth Consent Screen**:
   - Scopes: `https://www.googleapis.com/auth/calendar.events`
4. **Create OAuth 2.0 Web Client Credentials**:
   - Application Type: **Web application**
   - Authorized Redirect URI: `https://your-domain.com/api/integrations/google-calendar/callback`
5. **Set Environment Variables**:
   ```env
   GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="GOCSPX-xxx"
   GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/api/integrations/google-calendar/callback"
   GOOGLE_OAUTH_STATE_SECRET="your-64-char-random-state-secret"
   GOOGLE_TOKEN_ENCRYPTION_KEY="your-32-char-aes-256-encryption-key"
   ```

---

## 5-Minute Evaluator Quickstart

```bash
# 1. Clone repository & install dependencies
git clone https://github.com/A-Kushwah/CareFlow.git
cd CareFlow
npm install

# 2. Setup local SQLite database & seed demo accounts
npm run db:generate:local
npm run db:push
npm run db:seed:local

# 3. Execute full automated test suite (65 tests)
npm test

# 4. Start Next.js development server
npm run dev
```

Open `http://localhost:3000` to launch the application.

---

## Live Provider Setup & Environment Variables (`.env`)

To configure live Groq / Grok AI generation:

```env
LLM_PROVIDER="groq"
GROQ_API_KEY="gsk_your-groq-api-key-here"
GROQ_MODEL="llama-3.3-70b-versatile"
GROQ_TIMEOUT_MS="10000"
```

| Variable Name | Default / Configured Value | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `"file:./dev.db"` | Database connection string (SQLite file path for local dev, PostgreSQL URI for production). |
| `LLM_PROVIDER` | `"groq"` | AI adapter mode (`groq` / `grok`, `openai` for live API; `test` for automated tests; `mock` for offline dev). |
| `GROQ_API_KEY` | `""` | Server-side Groq / Grok API key for fast AI clinical triage & post-visit summaries. |
| `GROQ_MODEL` | `"llama-3.3-70b-versatile"` | Groq AI model name. |
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
- [x] **Automated Test Suite**: `npm test` passed **65/65 test scenarios**.
- [x] **Production Build**: `npm run build` compiled 24 page & API route bundles cleanly.
- [x] **Neumorphic Clinical UI**: Tactile clay surface, accessible typography, high-contrast badges, and interactive modals.

