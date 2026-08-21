# Architecture & System Design

CarePulse is built as a **Modular Monolith** in Next.js 14 (App Router), TypeScript, Prisma ORM, and Tailwind CSS. The codebase organizes domain logic into explicit modules while running within a single Next.js application instance and database.

---

## 1. High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                 Next.js 14 App Router                             |
|                                                                                   |
|  +--------------------+   +---------------------+   +--------------------------+  |
|  |   Patient Portal   |   |   Doctor Schedule   |   |    Operations Console    |  |
|  +---------+----------+   +----------+----------+   +------------+-------------+  |
|            |                         |                           |                |
|            +-------------------------+---------------------------+                |
|                                      |                                            |
|                               v      v      v                                     |
|  +-----------------------------------------------------------------------------+  |
|  |                               Domain Modules                                |  |
|  |  [booking]       [doctors]     [notifications]   [ai]   [calendar]  [reminders]|  |
|  +---------------------------------------+-------------------------------------+  |
|                                          |                                        |
+------------------------------------------|----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                               Database Storage Layer                              |
|   Local: SQLite (dev.db)                                                          |
|   Production: PostgreSQL (with GiST exclusion constraint on overlapping appointments)|
+-----------------------------------------------------------------------------------+
```

---

## 2. Key Technical Subsystems

### A. Double-Booking Prevention & Concurrency Protocol
1. **Slot Hold Reservation**: When a patient selects an available appointment slot, a temporary `SlotHold` record is created with a 5-minute expiration (`expiresAt = NOW() + 5 minutes`).
2. **Interactive Transaction Lock**: During checkout confirmation, an interactive Prisma `$transaction` executes:
   - Queries all existing `Appointment` records with status `CONFIRMED` or `HELD` that overlap the requested range: `(existingStart < requestedEnd AND existingEnd > requestedStart)`.
   - Queries active unexpired `SlotHold` entries for the same doctor.
   - If an overlap exists, the transaction rolls back and returns an HTTP 409 Conflict error.
   - If clear, it creates the `Appointment` record with status `CONFIRMED`, deletes the temporary `SlotHold`, and transactionally writes outbox notifications to `NotificationLog`.
3. **Database Exclusion Constraint Strategy**: In production PostgreSQL deployments, concurrency is additionally enforced at the database engine level via a GiST exclusion constraint on `(doctorId, tsrange(startTime, endTime))`.

### B. Doctor Leave Management Engine
When a doctor registers leave dates (`startDate` to `endDate`):
1. An approved `DoctorLeave` record is created in the database.
2. The engine identifies all active future appointments for that doctor falling within the leave range.
3. Affected appointments transition to status `CANCELLED`.
4. Outbox notifications (`APPOINTMENT_CANCELLED`) for affected patients and Google Calendar deletion sync events are transactionally enqueued.
5. Availability queries filter out slots overlapping approved leave dates automatically.

### C. Transactional Outbox & Notification Processor
To prevent external API failures (SMTP servers, Google Calendar API) from rolling back database transactions:
1. **Outbox Persistence**: Notifications are written to `NotificationLog` inside the primary database transaction with a unique `idempotencyKey`.
2. **Atomic Job Claiming**: Worker nodes claim candidate jobs (`QUEUED` or `FAILED` ready for retry) using a unique `claimToken` in an atomic database update step.
3. **Stale Lease Recovery**: Processing jobs stuck in `PROCESSING` past 5 minutes (`claimedAt <= NOW() - 5 minutes`) are reclaimed by active workers.
4. **Claim-Token Guarded Status Writes**: Updates (`SENT`, `FAILED`, `DLQ`) match both `id` AND `claimToken` to prevent preempted workers from overwriting reclaimed records.
5. **Exponential Backoff & DLQ**: Failed jobs retry using `nextRetryAt = NOW() + (10s * 2^attempt) + jitter(0-2s)`. After 5 failed attempts, jobs transition to the Dead Letter Queue (DLQ).

### D. AI Clinical Assistant Safeguards
1. **Server-Side Execution**: All LLM calls execute strictly on the server-side API layer.
2. **Input Truncation**: Inputs are truncated to 2000 characters to prevent prompt injection and token overflow.
3. **Timeout Safeguards**: API calls are wrapped in 5-second timeout abort controllers.
4. **Schema Validation**: LLM JSON responses are parsed against Zod schemas (`PreVisitSummarySchema` and `PostVisitSummarySchema`).
5. **Deterministic Fallbacks**: If the LLM provider times out or fails, the adapter returns structured fallback summaries without disrupting the booking or consultation workflow.
6. **Non-Diagnostic Medical Disclaimer**: Every AI-generated output includes a mandatory non-diagnostic disclaimer.
