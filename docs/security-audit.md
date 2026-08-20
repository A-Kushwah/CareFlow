# Security Audit & Risk Matrix

This document records the security review findings, vulnerability risk classifications, and mitigation measures implemented across the CarePulse application.

## Risk Assessment Matrix

| ID | Finding Description | Risk Level | Original Vector | Mitigation Implemented |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Unrestricted Client Role Assignment** | **High** | Client could send `role: "ADMIN"` or `role: "DOCTOR"` during public `/api/auth/register`. | Server forces public registration to `Role.PATIENT`. Doctor and Admin account creation restricted to authenticated Admin role. |
| **SEC-02** | **Cross-User Data Access (BBA)** | **Critical** | Client could send arbitrary `patientId` or `doctorId` parameters in `/api/appointments` query/POST. | All API routes verify HTTP-only session identity. Patients only access appointments where `patientId === session.userId`. Doctors only access `doctorId === session.doctorId`. |
| **SEC-03** | **Unvalidated Input Payloads** | **High** | Malformed dates, oversized strings, or invalid enum statuses in API requests. | Implemented Zod schema validation across all POST/PUT/GET API route handlers. |
| **SEC-04** | **Session Cookie Security** | **Medium** | Exposure of session token to client JS or CSRF attacks. | Session tokens issued with `HttpOnly`, `SameSite=Lax`, `Path=/`, and HMAC-SHA256 signature verification. |
| **SEC-05** | **Password Hash Standard** | **High** | Insecure plaintext or weak hashing algorithms. | Passwords hashed using PBKDF2 with SHA-512 and unique salt iterations. |
| **SEC-06** | **Outbox Worker Preemption** | **Medium** | Parallel workers overwriting processing status on stale jobs. | Atomic job claiming using unique `claimToken` and claim-token matched status updates. |

---

## Authorization Boundaries by Role

### 1. Patient Role (`PATIENT`)
- **Permitted**: View specialist doctor catalog, query available slots, create temporary slot hold, confirm own appointment (`patientId === session.userId`), view own medical appointment history & post-visit summaries, create own medication reminders.
- **Forbidden**: View other patients' appointments, complete consultation notes, submit doctor leave, access admin outbox metrics or DLQ actions, create doctor profiles.

### 2. Doctor Role (`DOCTOR`)
- **Permitted**: View assigned consultation queue (`doctorId === session.doctorId`), complete consultation notes and trigger AI post-visit summary generation, submit own doctor leave dates.
- **Forbidden**: Access other doctors' patient queues, access admin outbox job console or DLQ manual retries, modify system-wide user credentials.

### 3. Admin Role (`ADMIN`)
- **Permitted**: View system metrics, monitor transactional outbox status, trigger manual outbox worker runs, inspect DLQ logs, re-queue DLQ jobs, register new doctor profiles.
- **Forbidden**: None.
