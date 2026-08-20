# Requirements Verification Matrix

This matrix maps every assignment requirement to its technical implementation, automated test file, and documentation reference.

---

## Requirements Mapping Table

| ID | Assignment Requirement | Technical Implementation | Automated Test File | Documentation Reference |
| :--- | :--- | :--- | :--- | :--- |
| **REQ-01** | **Role-Based Auth (Patient / Doctor / Admin)** | Password PBKDF2 hashing, HTTP-only JWT sessions, server-controlled role assignment | `tests/e2e.test.ts` | `docs/security-audit.md` |
| **REQ-02** | **Doctor Management** | Doctor profile, specialization, working hours, slot duration, leave schedule | `tests/appointments.test.ts` | `docs/architecture.md` |
| **REQ-03** | **Slot Search & Booking** | Calculated slots filtering working hours, breaks, approved leaves, and active holds | `tests/appointments.test.ts` | `docs/architecture.md` |
| **REQ-04** | **Double-Booking Prevention** | 5-minute `SlotHold` + interactive `$transaction` lock in SQLite; PostgreSQL GiST `EXCLUDE` constraint in production migration | `tests/appointments.test.ts` | `README.md` (System Design §2) |
| **REQ-05** | **Doctor Leave Conflict Management** | Auto-cancellation of future overlapping appointments & transactional outbox notification enqueueing | `tests/appointments.test.ts` | `README.md` (System Design §3) |
| **REQ-06** | **AI Pre-Visit Intake** | Urgency level (`Low`/`Medium`/`High`), chief complaint, 3 suggested questions, 2000-char truncation, 5s timeout, Zod validation | `tests/ai.test.ts` | `README.md` (System Design §5) |
| **REQ-07** | **AI Post-Visit Summary** | Patient summary, medication schedule, follow-up steps, Zod schema parsing | `tests/ai.test.ts` | `README.md` (System Design §5) |
| **REQ-08** | **Medication Reminders** | Daily schedule calculator with 24-hour deduplication guard | `tests/reminders.test.ts` | `docs/architecture.md` |
| **REQ-09** | **Notification Outbox & Retries** | Unique `idempotencyKey`, `claimToken` atomic updates, 5-min stale lease recovery, exponential backoff + jitter, DLQ transition | `tests/notifications.test.ts`, `tests/idempotency.test.ts` | `README.md` (System Design §4) |
| **REQ-10** | **Email Integration** | Pluggable `EmailAdapter` (Console / Nodemailer SMTP) with `X-Idempotency-Key` headers | `tests/notifications.test.ts` | `README.md` (§ Email Setup) |
| **REQ-11** | **Google Calendar API** | OAuth v3 REST sync, event creation/deletion, HTTP 409 duplicate event handling | `tests/calendar.test.ts` | `README.md` (§ Calendar Setup) |

---

## Execution Verification Status

- **Unit & Integration Test Suite**: 16/16 Passed (`npm test`)
- **TypeScript Typecheck**: 0 Errors (`npx tsc --noEmit`)
- **Next.js Production Build**: 22/22 Pages Compiled Successfully (`npm run build`)
