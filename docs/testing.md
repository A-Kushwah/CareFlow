# Quality Assurance & Test Verification

CarePulse includes a test suite built with Node.js native runner (`node:test`) and TypeScript (`tsx`). The test suite validates core domain logic, race condition safety, outbox worker recovery, security boundaries, and end-to-end workflows.

---

## 1. Test Suite Commands

```bash
# Execute entire automated test suite sequentially
npm test

# Run TypeScript typechecking
npx tsc --noEmit

# Execute Next.js production build compilation
npm run build
```

---

## 2. Test File Structure & Coverage

| Test File | Focus Area | Key Scenarios Verified |
| :--- | :--- | :--- |
| [`tests/admin_doctors.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/admin_doctors.test.ts) | Admin Management | Create/read/update/archive doctor profiles, working hours, and leave records with ADMIN authorization. |
| [`tests/ai.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/ai.test.ts) | Clinical AI Pre-Visit | Pre-visit Zod schema validation, 2000-char input truncation limit, emergency urgency classification. |
| [`tests/ai_post_visit.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/ai_post_visit.test.ts) | AI Post-Visit | 2-stage decoupled prescription workflow, structured outputs, non-fallback review banner on API failure. |
| [`tests/appointments.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/appointments.test.ts) | Booking & Concurrency | Concurrent booking conflict handling, 5-min `SlotHold` expiration release, doctor leave slot exclusion. |
| [`tests/calendar.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/calendar.test.ts) | Calendar Sync | Google Calendar mock event creation, event deletion sync, adapter idempotency key propagation. |
| [`tests/cancellation_reschedule.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/cancellation_reschedule.test.ts) | Lifecycle Workflows | Appointment cancellation, rescheduling with working hours & leave validation, dual email notification enqueueing. |
| [`tests/e2e.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/e2e.test.ts) | Integration Workflow | Complete end-to-end journey: Doctor setup -> Patient slot search -> Hold creation -> Confirmation -> Doctor consultation -> Leave application -> Outbox processing. |
| [`tests/e2e/booking.spec.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/e2e/booking.spec.ts) | Playwright E2E | Browser UI integration tests for triage wizard, slot selection, and booking confirmation. |
| [`tests/google_oauth.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/google_oauth.test.ts) | OAuth 2.0 Security | Signed OAuth state nonces, single-use replay protection, AES-256-GCM token encryption at rest, disconnect API. |
| [`tests/idempotency.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/idempotency.test.ts) | Outbox Engine | Schema `@unique` idempotency key duplicate rejection, atomic multi-worker claiming race condition safety, 5-minute stale worker lease recovery. |
| [`tests/isolation.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/isolation.test.ts) | Test Data Isolation | Verifies test fixture cleanup hooks never purge real user production doctors or patient records. |
| [`tests/notifications.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/notifications.test.ts) | Retry Processor | Outbox status transitions (`QUEUED` -> `SENT`), exponential backoff formula calculation, DLQ transition after 5 max attempts. |
| [`tests/production_security.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/production_security.test.ts) | Production Hardening | Startup environment guard validation, timing-safe PBKDF2 password verification, production health endpoints. |
| [`tests/reminders.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/reminders.test.ts) | Medication Reminders | Medication schedule creation, 24-hour deduplication guard on notification dispatch. |
| [`tests/security.test.ts`](file:///a:/Projects/Unthinkable%20-%20Healthcare%20Appointment/tests/security.test.ts) | Auth & Security | Registration forcing `Role.PATIENT`, cross-patient appointment data isolation, unauthenticated & unauthorized API route rejection. |

---

## 3. Test Execution Results

```text
ℹ tests 65
ℹ pass 65
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

