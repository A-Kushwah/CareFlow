# System Architecture & Technical Design

## 1. Overview & Modular Monolith Design
The system is built as a **Modular Monolith** using **Next.js (App Router)** and **TypeScript**, sharing a single codebase while enforcing strict architectural boundaries between modules.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Next.js UI & Controllers                      │
│        (Patient Portal | Doctor Dashboard | Admin Job Console)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                             Domain Layer                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Booking Engine   │  │ Leave Engine     │  │ AI Summary Engine    │  │
│  │ (Holds/Locks)    │  │ (Conflicts/Sync) │  │ (Triage/Post-visit) │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
└───────────┼─────────────────────┼───────────────────────┼──────────────┘
            │                     │                       │
┌───────────▼─────────────────────▼───────────────────────▼──────────────┐
│                    Adapters & Infrastructure Layer                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Notification     │  │ Calendar Adapter │  │ LLM Adapter          │  │
│  │ Outbox Worker    │  │ (Google / Mock)  │  │ (OpenAI / Mock)      │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
└───────────┼─────────────────────┼───────────────────────┼──────────────┘
            │                     │                       │
┌───────────▼─────────────────────▼───────────────────────▼──────────────┐
│                       Data Layer (Prisma ORM)                          │
│               PostgreSQL / SQLite Database Storage                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Application Modules

1. **Authentication & Authorization (`src/lib/auth`)**:
   - Manages User roles: `ADMIN`, `DOCTOR`, `PATIENT`.
   - Issues secure HTTP-only cookie session tokens with password hashing (Bcrypt/Argon2 abstraction).

2. **Doctor & Availability Module (`src/lib/doctors`)**:
   - Doctor profiles, consultation fees, default slot duration (e.g. 30 mins), and buffer time.
   - Working hours per weekday + daily break times.
   - Doctor leave requests & vacation management.

3. **Booking & Concurrency Engine (`src/lib/booking`)**:
   - Computes real-time available time slots for a doctor on a target date.
   - Creates 5-minute temporary **Slot Holds** to prevent race conditions during booking checkout.
   - Enforces transactional double-booking checks (`$transaction` interactive locks).

4. **Notification Outbox System (`src/lib/notifications`)**:
   - Transactional Outbox pattern storing outgoing jobs in `NotificationLog` table.
   - Background retry worker with exponential backoff (`delay = base * 2^attempt + jitter`).
   - Dead Letter Queue (`DLQ`) classification after 5 consecutive failures.

5. **AI Healthcare Assistant (`src/lib/ai`)**:
   - Pre-visit symptom intake summarization for doctors.
   - Post-visit consultation note synthesis and patient instructions.
   - Strict Zod output validation, prompt versioning, timeout safeguards, and mock fallbacks.

6. **Google Calendar Adapter (`src/lib/calendar`)**:
   - Asynchronously creates, updates, or deletes calendar events when appointments are booked/cancelled.
   - Supports pluggable production Google Calendar API & mock developer mode.

---

## 3. Database Schema Design

```prisma
model User {
  id           String        @id @default(uuid())
  email        String        @unique
  passwordHash String
  name         String
  role         Role          @default(PATIENT)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  doctorProfile DoctorProfile?
  patientAppointments Appointment[] @relation("PatientAppointments")
}

enum Role {
  ADMIN
  DOCTOR
  PATIENT
}

model DoctorProfile {
  id              String         @id @default(uuid())
  userId          String         @unique
  user            User           @relation(fields: [userId], references: [id])
  specialty       String
  consultFee      Float
  slotDurationMin Int            @default(30)
  bufferTimeMin   Int            @default(10)
  workingHours    WorkingHours[]
  leaves          DoctorLeave[]
  appointments    Appointment[]
}

model WorkingHours {
  id              String        @id @default(uuid())
  doctorId        String
  doctor          DoctorProfile @relation(fields: [doctorId], references: [id])
  dayOfWeek       Int           // 0=Sun, 1=Mon, ..., 6=Sat
  startTime       String        // "09:00"
  endTime         String        // "17:00"
  breakStartTime  String?       // "13:00"
  breakEndTime    String?       // "14:00"
}

model DoctorLeave {
  id          String        @id @default(uuid())
  doctorId    String
  doctor      DoctorProfile @relation(fields: [doctorId], references: [id])
  startDate   DateTime
  endDate     DateTime
  reason      String
  status      LeaveStatus   @default(APPROVED)
}

enum LeaveStatus {
  PENDING
  APPROVED
  CANCELLED
}

model SlotHold {
  id          String   @id @default(uuid())
  doctorId    String
  patientId   String
  startTime   DateTime
  endTime     DateTime
  expiresAt   DateTime
  createdAt   DateTime @default(now())
}

model Appointment {
  id             String            @id @default(uuid())
  patientId      String
  patient        User              @relation("PatientAppointments", fields: [patientId], references: [id])
  doctorId       String
  doctor         DoctorProfile     @relation(fields: [doctorId], references: [id])
  startTime      DateTime
  endTime        DateTime
  status         AppointmentStatus @default(CONFIRMED)
  symptoms       String?
  aiPreSummary   String?
  aiPostSummary  String?
  consultNotes   String?
  calendarEventId String?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  @@index([doctorId, startTime, endTime])
}

enum AppointmentStatus {
  HELD
  CONFIRMED
  CANCELLED
  COMPLETED
}

model NotificationLog {
  id          String             @id @default(uuid())
  recipient   String
  channel     NotificationChannel@default(EMAIL)
  template    String
  payload     String             // JSON string
  attempts    Int                @default(0)
  maxAttempts Int                @default(5)
  nextRetryAt DateTime           @default(now())
  status      NotificationStatus @default(QUEUED)
  lastError   String?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  @@index([status, nextRetryAt])
}

enum NotificationChannel {
  EMAIL
  SMS
  CALENDAR
}

enum NotificationStatus {
  QUEUED
  PROCESSING
  SENT
  FAILED
  DLQ
}
```

---

## 4. Key Execution Flows

### A. Appointment Booking & Double-Booking Prevention Flow
1. Patient selects a doctor, date, and available slot.
2. System creates a `SlotHold` with `expiresAt = currentTime + 5 mins`.
3. Patient completes symptom intake and clicks **Confirm Booking**.
4. In a Prisma `$transaction`:
   - Query existing active appointments & holds overlapping `[startTime, endTime]`.
   - If overlap exists -> Rollback transaction, return HTTP 409 Conflict ("Slot no longer available").
   - If clear -> Create `Appointment` record with status `CONFIRMED`, delete `SlotHold`.
   - Transactionally insert `NotificationLog` items for Email and Calendar sync into Outbox.
5. Response returned instantly (Sub-100ms response). Outbox background worker handles external API delivery asynchronously.

### B. Doctor Leave Conflict Flow
1. Doctor submits leave dates (`startDate` to `endDate`).
2. System queries all `Appointment` records for that doctor falling within the leave window.
3. For each affected appointment:
   - Status updated to `CANCELLED` (or marked for rescheduling).
   - `NotificationLog` created to notify patient via email.
   - `NotificationLog` created to remove/update Google Calendar event.

### C. Notification Retry & DLQ Flow
1. Background trigger queries `NotificationLog` where `status IN ('QUEUED', 'FAILED') AND nextRetryAt <= NOW()`.
2. Marks records as `PROCESSING`.
3. Invokes relevant Adapter (Email/Calendar).
4. **On Success**: Status updated to `SENT`.
5. **On Failure**: `attempts` incremented. If `attempts >= maxAttempts`, status updated to `DLQ`. Otherwise, `nextRetryAt = NOW() + (2^attempts * 10s) + jitter` and status reset to `FAILED`.

### D. LLM Failure & Safety Flow
1. Doctor/Patient triggers AI pre-visit or post-visit summary.
2. Server executes LLM Adapter call with strict 5-second timeout.
3. Response parsed against Zod JSON schema.
4. **If API times out, errors, or returns invalid JSON**: System smoothly catches error, logs incident, and injects clean deterministic fallback text:
   *"[Automated Fallback] Symptom intake recorded. Medical evaluation requires direct doctor consultation."*
5. All AI outputs display standard non-diagnostic medical disclaimers.

---

## 5. Free-Tier Deployment Architecture
- **App Hosting**: Vercel Free Tier / Netlify / Render Free Web Service.
- **Database**: Supabase Free Tier PostgreSQL / Render PostgreSQL / Local SQLite.
- **Cron Jobs**: Vercel Cron (`/api/notifications/process` triggered every 1-5 mins) or GitHub Actions scheduled workflow.
