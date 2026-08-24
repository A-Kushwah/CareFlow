# API Documentation & Endpoint Reference

CareFlow provides a RESTful API layer built with Next.js App Router route handlers. All protected routes require session authentication via HTTP-only signed cookies.

---

## 1. Route Classification & Authorization Matrix

| Endpoint Route | HTTP Method | Classification | Allowed Roles / Auth |
| :--- | :--- | :--- | :--- |
| `/api/auth/register` | `POST` | `PUBLIC` | Open. Hardcodes `Role.PATIENT` on the server. |
| `/api/auth/login` | `POST` | `PUBLIC` | Open. Verifies credentials and sets HTTP-only session cookie. |
| `/api/auth/logout` | `POST` | `PUBLIC` | Open. Clears session cookie. |
| `/api/auth/me` | `GET` | `PUBLIC` | Returns current session user payload or `null`. |
| `/api/doctors` | `GET` | `PUBLIC` | Open doctor catalog search. |
| `/api/doctors/slots` | `GET` | `PUBLIC` | Open slot availability calculation by doctor and date. |
| `/api/doctors/[id]` | `GET` | `PUBLIC` | Open doctor profile detail retrieval. |
| `/api/doctors/leave` | `POST` | `DOCTOR_ONLY` / `ADMIN_ONLY` | Doctors restricted to their own doctor profile ID. |
| `/api/admin/doctors` | `GET`, `POST` | `ADMIN_ONLY` | Admin role required. Create & list doctor profiles with working hours. |
| `/api/admin/doctors/[id]` | `PATCH`, `DELETE` | `ADMIN_ONLY` | Admin role required. Edit profile, toggle publish status, archive. |
| `/api/admin/doctors/[id]/working-hours` | `PUT` | `ADMIN_ONLY` | Admin role required. Replace doctor working hours schedule. |
| `/api/admin/doctors/[id]/leave` | `POST` | `ADMIN_ONLY` | Admin role required. Submit doctor leave & cancel conflicts. |
| `/api/appointments` | `GET`, `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Patients restricted to `patientId === session.userId`. |
| `/api/appointments/[id]/cancel` | `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Cancel appointment, save reason, enqueue dual emails & calendar delete. |
| `/api/appointments/[id]/reschedule` | `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Reschedule appointment slot with leave, working hours & overlap checks. |
| `/api/appointments/hold` | `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Authenticated session required to create 5-min slot hold. |
| `/api/ai/pre-visit` | `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Authenticated session required for symptom intake triage. |
| `/api/ai/post-visit` | `POST` | `DOCTOR_ONLY` / `ADMIN_ONLY` | Clinical staff session required for post-visit summary generation. |
| `/api/patients/[id]/history` | `GET` | `DOCTOR_ONLY` / `ADMIN_ONLY` | Requires active appointment relationship between doctor & patient. |
| `/api/calendar/sync` | `POST` | `ADMIN_ONLY` / `INTERNAL_WORKER` | Admin session or `Bearer ${CRON_SECRET}` header required. |
| `/api/notifications/logs` | `GET` | `ADMIN_ONLY` | Admin role required. |
| `/api/notifications/process` | `POST` | `ADMIN_ONLY` / `INTERNAL_WORKER` | Admin session or `Bearer ${CRON_SECRET}` header required. |
| `/api/reminders` | `GET`, `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Patients restricted to `patientId === session.userId`. |
| `/api/reminders/process` | `POST` | `ADMIN_ONLY` / `INTERNAL_WORKER` | Admin session or `Bearer ${CRON_SECRET}` header required. |
| `/api/admin/metrics` | `GET` | `ADMIN_ONLY` | Admin role required. |
| `/api/admin/retry-dlq` | `POST` | `ADMIN_ONLY` | Admin role required. Re-queues DLQ notification job. |

---

## 2. Key Endpoint Details

### Admin Doctor Creation: `/api/admin/doctors` (`POST`)
- **Headers**: Signed admin session cookie (`careflow_session`).
- **Payload**:
  ```json
  {
    "name": "Dr. Sarah Jenkins",
    "email": "sarah.jenkins@careflow.com",
    "password": "doctorPassword123",
    "specialty": "Cardiology",
    "consultFee": 150,
    "slotDurationMin": 30,
    "bufferTimeMin": 10,
    "isPublished": true
  }
  ```
- **Behavior**: Atomically creates User with `ROLE_DOCTOR`, DoctorProfile, and default working hours inside a transaction.

---

### Appointment Cancellation: `/api/appointments/[id]/cancel` (`POST`)
- **Payload**:
  ```json
  {
    "reason": "Schedule conflict with business trip"
  }
  ```
- **Behavior**: Validates ownership, updates status to `CANCELLED`, enqueues role-specific patient and doctor cancellation emails, and enqueues Google Calendar deletion event idempotently.

---

### Appointment Rescheduling: `/api/appointments/[id]/reschedule` (`POST`)
- **Payload**:
  ```json
  {
    "newStartTime": "2026-09-28T14:00:00.000Z",
    "newEndTime": "2026-09-28T14:30:00.000Z",
    "reason": "Requested earlier morning slot"
  }
  ```
- **Behavior**: Validates doctor working hours, doctor leave, and slot overlap. Updates appointment timing and enqueues patient email, doctor email, and Google Calendar update event idempotently.
