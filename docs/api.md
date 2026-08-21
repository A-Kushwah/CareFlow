# API Documentation & Endpoint Reference

CarePulse provides a RESTful API layer built with Next.js App Router route handlers. All protected routes require session authentication via HTTP-only signed cookies.

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
| `/api/appointments` | `GET`, `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Patients restricted to `patientId === session.userId`. |
| `/api/appointments/hold` | `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Authenticated session required to create 5-min slot hold. |
| `/api/ai/pre-visit` | `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Authenticated session required for symptom intake triage. |
| `/api/ai/post-visit` | `POST` | `DOCTOR_ONLY` / `ADMIN_ONLY` | Clinical staff session required for post-visit summary generation. |
| `/api/calendar/sync` | `POST` | `ADMIN_ONLY` / `INTERNAL_WORKER` | Admin session or `Bearer ${CRON_SECRET}` header required. |
| `/api/notifications/logs` | `GET` | `ADMIN_ONLY` | Admin role required. |
| `/api/notifications/process` | `POST` | `ADMIN_ONLY` / `INTERNAL_WORKER` | Admin session or `Bearer ${CRON_SECRET}` header required. |
| `/api/reminders` | `GET`, `POST` | `PATIENT_ONLY` / `DOCTOR_ONLY` / `ADMIN_ONLY` | Patients restricted to `patientId === session.userId`. |
| `/api/reminders/process` | `POST` | `ADMIN_ONLY` / `INTERNAL_WORKER` | Admin session or `Bearer ${CRON_SECRET}` header required. |
| `/api/admin/metrics` | `GET` | `ADMIN_ONLY` | Admin role required. |
| `/api/admin/retry-dlq` | `POST` | `ADMIN_ONLY` | Admin role required. Re-queues DLQ notification job. |

---

## 2. Key Endpoint Details

### Authentication: `/api/auth/register` (`POST`)
- **Payload**:
  ```json
  {
    "name": "Alex Rivera",
    "email": "alex.rivera@example.com",
    "password": "password123"
  }
  ```
- **Behavior**: Ignores any client-supplied `role` parameter and hardcodes `role: "PATIENT"`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "user_id_123",
      "email": "alex.rivera@example.com",
      "role": "PATIENT",
      "name": "Alex Rivera"
    }
  }
  ```

---

### Slot Hold: `/api/appointments/hold` (`POST`)
- **Payload**:
  ```json
  {
    "doctorId": "doc_profile_id_1",
    "startTime": "2026-09-14T09:00:00.000Z",
    "endTime": "2026-09-14T09:30:00.000Z"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "hold": {
      "id": "hold_id_abc",
      "doctorId": "doc_profile_id_1",
      "patientId": "user_id_123",
      "expiresAt": "2026-09-14T09:05:00.000Z"
    }
  }
  ```
- **Error (409 Conflict)**:
  ```json
  {
    "error": "This slot was reserved by another patient"
  }
  ```

---

### Appointment Confirmation: `/api/appointments` (`POST`)
- **Payload**:
  ```json
  {
    "holdId": "hold_id_abc",
    "patientId": "user_id_123",
    "symptoms": "Persistent dry cough and mild headache for 3 days"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "appointment": {
      "id": "appt_id_999",
      "status": "CONFIRMED",
      "startTime": "2026-09-14T09:00:00.000Z",
      "endTime": "2026-09-14T09:30:00.000Z"
    }
  }
  ```

---

### AI Pre-Visit Triage: `/api/ai/pre-visit` (`POST`)
- **Payload**:
  ```json
  {
    "symptoms": "Intermittent chest tightness and shortness of breath"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "summary": {
      "urgencyLevel": "High",
      "chiefComplaint": "Cardiovascular / Respiratory Discomfort",
      "suggestedQuestions": [
        "When did the chest pressure start?",
        "Do you feel pain radiating to your arm or back?"
      ],
      "summary": "Prompt: Analyse these symptoms...",
      "disclaimer": "IMPORTANT MEDICAL NOTICE: This AI-generated summary is for clinical organization assistance only..."
    }
  }
  ```

---

### Outbox Processing: `/api/notifications/process` (`POST`)
- **Headers**: `Authorization: Bearer <CRON_SECRET>` or active `ADMIN` session cookie.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "result": {
      "processedCount": 3,
      "successes": 3,
      "failures": 0,
      "dlqCount": 0,
      "preemptedCount": 0
    }
  }
  ```
