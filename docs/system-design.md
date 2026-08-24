# CareFlow System Design Write-Up

## Overview
CareFlow is a modular monolith healthcare appointment management platform built with Next.js 14, TypeScript, Prisma ORM, and PostgreSQL. It delivers real-time appointment booking, doctor schedule controls, transactional notifications, and AI clinical summaries while protecting database integrity under concurrent load.

---

## 1. Double-Booking Prevention & Concurrency Control
Concurrent booking requests for the same doctor and time window present a critical race condition. CareFlow addresses this with a multi-layered concurrency architecture:

1. **Transactional Overlap Checks**: Before confirming an appointment, an interactive Prisma database transaction (`$transaction`) executes an overlap query:
   ```sql
   WHERE doctorId = :doctorId 
     AND status IN ('CONFIRMED', 'HELD')
     AND startTime < :requestedEnd 
     AND endTime > :requestedStart
   ```
   If any overlapping record is found, the transaction aborts and returns an HTTP 409 Conflict.

2. **Database Engine Exclusion Constraint**: In production PostgreSQL deployments, double-booking is enforced natively at the engine level via a GiST exclusion constraint:
   ```sql
   ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_appointments"
   EXCLUDE USING gist ("doctorId" WITH =, tsrange("startTime", "endTime") WITH &&)
   WHERE (status IN ('CONFIRMED', 'HELD'));
   ```
   If two simultaneous requests bypass application-level checks, PostgreSQL rejects the second transaction with a unique/exclusion constraint violation, guaranteeing absolute zero double-bookings.

---

## 2. Slot Hold Reservation Mechanism
To prevent "cart hijacking" while a patient completes pre-visit symptom triage or payment details, CareFlow implements a short-lived reservation system:

1. **Hold Allocation**: Selecting an available slot creates a `SlotHold` record in the database bound to the `patientId` and `doctorId` with an explicit 5-minute expiration timestamp (`expiresAt = NOW() + 5 minutes`).
2. **Hold Conflict Guarding**: While active (`NOW() < expiresAt`), the slot is locked and excluded from slot searches for all other patients.
3. **Automatic Cleanup & Conversion**:
   - If the patient confirms within 5 minutes, the `SlotHold` is atomically converted to a `CONFIRMED` `Appointment` record within the primary transaction.
   - If the hold expires or is abandoned, background availability queries automatically ignore expired holds, restoring slot availability instantaneously without needing cron pollers.

---

## 3. Doctor Leave Conflict Handling
When a doctor or admin marks leave for a date range (`startDate` to `endDate`), existing bookings must be handled gracefully:

1. **Transactional Cancellation**: The leave submission triggers a database transaction that creates an approved `DoctorLeave` record and identifies all `CONFIRMED` or `HELD` appointments overlapping the leave window.
2. **Automated Patient Notification & Unbooking**: All affected appointments transition to status `CANCELLED` with the reason `"Doctor leave registered"`.
3. **Outbox Notification Dispatch**: For each cancelled appointment, the system transactionally enqueues role-specific patient cancellation emails (`APPOINTMENT_CANCELLED`) and Google Calendar deletion sync jobs.
4. **Availability Exclusion**: Subsequent slot availability calculations cross-reference `DoctorLeave` records, excluding all time ranges falling within approved leaves.

---

## 4. Notification Failure & Outbox Reliability
External integrations (SMTP email servers, Google Calendar API) are vulnerable to network latency, rate limits, and third-party outages. Executing external API calls inside database transactions causes catastrophic transaction locks or database rollbacks. CareFlow decouples notification delivery using a **Transactional Outbox Pattern**:

1. **Transactional Outbox Enqueue**: Email payloads and Google Calendar sync tasks are written to `NotificationLog` inside the same database transaction as the appointment status change, ensuring atomic persistence.
2. **Idempotency Key Protection**: Each job contains a unique `idempotencyKey` (e.g., `appointment_confirmed_patient_<appointmentId>`). Duplicate event triggers are rejected at the database schema level.
3. **Atomic Worker Claiming**: Background workers query candidate jobs (`QUEUED` or retryable `FAILED`) and execute an atomic update using a UUID `claimToken`:
   ```sql
   UPDATE "NotificationLog" 
   SET status = 'PROCESSING', claimToken = :token, claimedAt = NOW()
   WHERE id = :id AND status IN ('QUEUED', 'FAILED')
   ```
4. **Stale Lease Recovery**: If a worker process crashes while holding a job, leases older than 5 minutes (`claimedAt <= NOW() - 5 minutes`) are reclaimed automatically by active workers.
5. **Exponential Backoff & Dead Letter Queue (DLQ)**: Retries use exponential backoff (`nextRetryAt = NOW() + 10s * 2^attempt + jitter`). After 5 consecutive failures, the job transitions to `DLQ` for administrative inspection and manual replay via `/api/admin/retry-dlq`.
