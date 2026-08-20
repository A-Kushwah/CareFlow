# Requirements Matrix & Evaluation Criteria

## 1. Assignment Requirements vs. Technical Expectations

| Category | Requirement | Technical Expectation | Verification Method |
| :--- | :--- | :--- | :--- |
| **Concurrency** | Zero double-bookings | Database `$transaction` interactive locks, atomic slot holds, overlap query checks | Concurrent automated API test suite (`tests/concurrency.test.js`) |
| **Doctor Leave** | Respect leave & auto-cancel/reschedule | Filter slots against `DoctorLeave`, trigger outbox notification on new leave creation | Unit & integration tests (`tests/leave.test.js`) |
| **Notifications** | Guaranteed notification delivery | Database outbox queue, status (`QUEUED`, `SENT`, `FAILED`, `DLQ`), exponential backoff + jitter | Outbox processor test suite (`tests/outbox.test.js`) |
| **AI Integration** | Pre-visit & post-visit summaries | Server-side Zod validation, prompt versioning, fallback mock provider, medical disclaimer | Mock LLM adapter tests (`tests/ai.test.js`) |
| **Calendar Sync** | Google Calendar synchronization | Adapter pattern (`GoogleCalendarAdapter`), async sync via outbox, graceful failure handling | Calendar adapter integration test |
| **Security & Auth**| Role-based Access Control (RBAC) | Admin, Doctor, Patient roles; password hashing; session verification; input sanitization | API authorization tests |
| **Free-Tier Support**| Out-of-the-box local execution | Configurable adapters (`EMAIL_PROVIDER=console`, `LLM_PROVIDER=mock`, `CALENDAR_ENABLED=false`) | Zero external API key local execution check |

---

## 2. Primary Evaluation Criteria

1. **Slot Conflict & Double-Booking Prevention**: High concurrency tolerance, race condition handling, atomic transactional guarantees, hold expiry mechanism (5-minute temporary reservation window).
2. **Doctor Leave Management**: Dynamic schedule exclusion, pro-active collision detection, event cancellation, and patient notification dispatch upon doctor leave booking.
3. **Notification Reliability & Retries**: Transactional outbox pattern, durable state persistence, bounded retries (max 5), exponential backoff formula, DLQ inspection for admins.
4. **LLM Prompt Quality & Failure Handling**: Clear structured JSON schemas, strict server-side invocation, fallback handling on timeout/error, disclaimer enforcement.
5. **Database Schema Design**: Clean normalization, index strategy on `(doctorId, startTime, endTime)`, clear status enums, audit timestamps.
6. **API Design & Modular Architecture**: Clean separation of concerns (Domain Services, Adapters, Outbox, API Controllers, UI).
7. **Email & Google Calendar Integration**: Pluggable adapter interfaces with real/mock capabilities.
8. **Documentation Quality**: Comprehensive setup guide, architecture writeup, decision records, and clear commit history.

---

## 3. Assumptions & Out-of-Scope Features

### Assumptions
- Patients and Doctors access the platform via a web interface.
- Local development uses SQLite/PostgreSQL with zero external paid infrastructure requirements.
- Notification retries run via an internal scheduled trigger endpoint (`/api/notifications/process`) or background timer worker.

### Out-of-Scope Features (Speculative Features Excluded)
- Payment gateway / billing integration (not required by core scope).
- Video calling / Telehealth WebRTC streaming (out of assignment scope).
- Redis / Kafka / RabbitMQ external message brokers (kept as database-backed outbox for minimal dependencies & zero cost).

---

## 4. Acceptance Tests Summary

| ID | Test Name | Target Behavior | Expected Result |
| :--- | :--- | :--- | :--- |
| **AT-01** | Concurrent Slot Booking | 5 simultaneous requests for Doctor A at 10:00 AM | Exactly 1 success (201 Created), 4 rejected (409 Conflict) |
| **AT-02** | Hold Expiry Release | Slot reserved at 10:00 AM, hold expires after 5 mins | Slot becomes available again for new booking |
| **AT-03** | Leave Collision Detection | Doctor books leave for Aug 25; existing appointment exists | Appointment cancelled/rescheduled & notification queued |
| **AT-04** | Notification Retry & DLQ | Email provider fails 5 consecutive times | Job transitions to `DLQ` state with `lastError` logged |
| **AT-05** | LLM Fallback | LLM API timeout or error occurs during symptom triage | System gracefully returns structured fallback summary |
