# CarePulse — Healthcare Appointment & Follow-up Manager

Enterprise-grade, highly reliable **Healthcare Appointment System** built as a modular monolith in **Next.js 14 (App Router), TypeScript, Prisma ORM, Tailwind CSS, PostgreSQL/SQLite**, Google Calendar Sync, and an AI Healthcare Assistant.

---

## System Design Summary (Under 800 Words)

### 1. Architecture Overview
CarePulse adopts a **Modular Monolith** pattern. Domain modules (`booking`, `doctors`, `notifications`, `ai`, `calendar`, `reminders`) share a single TypeScript codebase while maintaining decoupled boundaries. This eliminates microservice networking overhead, enables zero-cost free-tier hosting, and provides instant in-memory transactional guarantees.

### 2. Double-Booking Concurrency Engine
Double-booking is prevented at the database layer via a two-phase reservation protocol:
1. **Slot Hold Phase**: Selecting a slot creates a temporary `SlotHold` record valid for 5 minutes.
2. **Transactional Confirmation Phase**: Booking execution runs inside a Prisma `$transaction` with interactive locks. The transaction queries active `Appointment` records and unexpired `SlotHold` entries for time overlap `(existingStart < requestedEnd AND existingEnd > requestedStart)`. If an overlap is detected, the transaction aborts and returns an HTTP 409 Conflict error. Otherwise, the appointment status is set to `CONFIRMED`, the hold is deleted, and notification outbox records are inserted atomically.

### 3. Doctor Leave Management Engine
When a doctor submits leave dates (`startDate` to `endDate`), the system records the approved `DoctorLeave`. It queries all future active appointments falling within the leave range, marks them as `CANCELLED`, and atomically enqueues outbox notifications for patients and Google Calendar deletion sync events. Subsequent slot availability queries filter out approved leave days automatically.

### 4. Transactional Outbox Notification Retry System
To prevent external API failures (SMTP email servers, Google Calendar REST API) from rolling back successful appointment bookings:
- Notification jobs are written to the `NotificationLog` table inside the booking transaction.
- A background worker queries jobs where `status IN ('QUEUED', 'FAILED') AND nextRetryAt <= NOW()`.
- Failed jobs retry using **Exponential Backoff with Jitter**: `nextRetryAt = NOW() + (10s * 2^attempt) + jitter(0-2s)`.
- If `attempts >= maxAttempts` (bounded at 5), the job transitions to the **Dead Letter Queue (DLQ)**. Admins can inspect errors and trigger manual re-queuing via the Admin Console.

### 5. AI Healthcare Assistant & Safety Architecture
- **Pre-Visit Intake**: Summarizes patient symptoms and suggests clinical focus areas for doctors.
- **Post-Visit Notes**: Synthesizes consultation notes, patient instructions, and prescribed medications.
- **Safety Safeguards**: Server-side execution only, input truncation (2000 chars max), 5-second timeout wrappers, Zod schema validation, deterministic mock fallback summaries when offline, and mandatory non-diagnostic medical disclaimers on all AI outputs.

---

## Demo Accounts

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@carepulse.com` | `admin123` | Full Admin Outbox Console & DLQ Retry |
| **Doctor** | `sarah.jenkins@carepulse.com` | `admin123` | Doctor Consultation Queue & Leave Manager |
| **Patient** | `alex.rivera@example.com` | `patient123` | Patient Slot Booking & AI Symptom Intake |

---

## Free-Tier Operational Setup

The system operates out-of-the-box in **Free-Tier / Demo Mode** without requiring paid external API credentials:
- `EMAIL_PROVIDER=console` (Logs emails to console and outbox logs)
- `LLM_PROVIDER=mock` (Uses deterministic AI triage summarizer)
- `CALENDAR_ENABLED=false` (Mocks Google Calendar synchronization)

---

## Local Development Quickstart

1. **Clone & Install Dependencies**:
   ```bash
   npm install
   ```

2. **Database Initialization & Seeding**:
   ```bash
   npx prisma generate
   npx prisma db push
   node prisma/seed.js
   ```

3. **Run Automated Test Suite**:
   ```bash
   npm test
   ```

4. **Start Local Next.js Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## API Endpoints Reference

### Authentication
- `POST /api/auth/login`: Authenticate user & set HTTP-only session cookie.
- `POST /api/auth/register`: Create new user account.
- `GET /api/auth/me`: Fetch active session details.

### Doctors & Availability
- `GET /api/doctors`: Fetch specialist doctor catalog.
- `GET /api/doctors/slots?doctorId={id}&date={YYYY-MM-DD}`: Get conflict-free available slots.
- `POST /api/doctors/leave`: Apply doctor leave & trigger appointment auto-cancellation outbox notifications.

### Appointments & Concurrency
- `POST /api/appointments/hold`: Reserve 5-minute temporary slot hold.
- `POST /api/appointments`: Transactionally confirm booking.
- `GET /api/appointments`: List appointments.

### AI Integration
- `POST /api/ai/pre-visit`: Generate structured pre-visit symptom summary.
- `POST /api/ai/post-visit`: Complete consultation & generate post-visit notes.

### Notifications & Admin Console
- `POST /api/notifications/process`: Trigger outbox retry worker.
- `GET /api/admin/metrics`: View outbox counts, system health & DLQ exception logs.
- `POST /api/admin/retry-dlq`: Re-queue DLQ items.

---

## Environment Variables Configuration (`.env.example`)

```env
DATABASE_URL="file:./dev.db"
EMAIL_PROVIDER="console"
LLM_PROVIDER="mock"
CALENDAR_ENABLED="false"
JWT_SECRET="your-super-secret-key-here"

# Optional External API Keys for Production Mode
# GOOGLE_CLIENT_ID=""
# GOOGLE_CLIENT_SECRET=""
# GOOGLE_REFRESH_TOKEN=""
# OPENAI_API_KEY=""
# SMTP_HOST=""
# SMTP_PORT="587"
# SMTP_USER=""
# SMTP_PASS=""
```
