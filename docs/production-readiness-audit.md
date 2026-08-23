# CarePulse — Production Readiness Audit Report

This audit evaluates CarePulse against real-world production readiness requirements for multi-user healthcare appointment management, per-user OAuth 2.0 calendar integration, authentication hardening, PostgreSQL database integrity, notification outbox reliability, and HIPAA-aware data security.

---

## Audit Items & System Classification

| Category | Audit Item | Description & Location | Current Classification | Remediation Plan |
| :--- | :--- | :--- | :--- | :--- |
| **Integrations** | Global `GOOGLE_REFRESH_TOKEN` | Single clinic-wide refresh token in `.env`. | **Unsafe for production** | Replace with per-user Google OAuth 2.0 flow (`GoogleCalendarConnection`). |
| **Integrations** | `LLM_PROVIDER=mock` Fallback | Local mock LLM mode in development. | **Partially Implemented** | Require live `LLM_PROVIDER=openai` in production; reject `mock` in `NODE_ENV=production`. |
| **Integrations** | `EMAIL_PROVIDER=console` | Outbox worker logging emails to console. | **Partially Implemented** | Require live SMTP in production; reject `console` in `NODE_ENV=production`. |
| **Authentication** | Demo Password Bypass | `$2a$` / `$2b$` prefix checking `password === 'admin123'`. | **Unsafe for production** | Disable string bypass in production; use timing-safe PBKDF2 salted hash verification across all environments. |
| **Authentication** | Hardcoded Demo Accounts | `admin@carepulse.com`, `alex.rivera@example.com` in seed data. | **Partially Implemented** | Seed accounts restricted to dev/test database; disabled in production startup. |
| **Authorization** | Self-Registration Role | Public registration endpoint (`/api/auth/register`). | **Implemented** | Server strictly forces `Role.PATIENT`. Admin/Doctor creation requires `ADMIN_ONLY` route. |
| **Authorization** | Doctor-Patient Relationship Check | Accessing `/api/patients/[id]/history`. | **Implemented** | Rejects requests if doctor has no confirmed/past appointments with target patient. |
| **Authorization** | Patient Ownership Enforcement | Accessing appointments and reminders. | **Implemented** | Server verifies `patientId === session.userId` using HTTP-only signed cookies. |
| **Database** | PostgreSQL Canonical Schema | `prisma/schema.prisma` (`provider = "postgresql"`). | **Implemented** | Version-controlled migrations in `prisma/migrations/` with GiST double-booking constraint. |
| **Database** | Per-User Calendar Models | `GoogleCalendarConnection` & `AppointmentCalendarEvent`. | **Missing** | Add Prisma models with AES-256-GCM token encryption and unique constraints. |
| **Database** | SQLite Local Dev | `prisma/schema.sqlite.prisma` for local testing. | **Implemented** | Separate local generator (`npm run db:generate:local`) and local seed script. |
| **Security** | Health Data Logging | Output in console or AI generation logs. | **Implemented** | Patient symptoms & AI output logged only in structured audit logs (`AiGenerationLog`); PHI omitted from URLs/subjects. |
| **Security** | Token Leakage Prevention | Google access/refresh tokens in memory or DB. | **Unsafe for production** | Encrypt tokens at rest (`AES-256-GCM`); never return tokens in client responses or API logs. |
| **Security** | Health Check Endpoints | `/api/health` and `/api/health/integrations`. | **Missing** | Implement status endpoints exposing dependency health without leaking secrets. |
| **UI** | User Account Integrations | Google Calendar connect/disconnect UI in Patient/Doctor settings. | **Missing** | Add Integrations section in `PatientDashboard` & `DoctorPortal` displaying account status & OAuth trigger. |

---

## Key Security & Architecture Findings

1. **OAuth 2.0 Architecture**:
   - CarePulse must transition from a static, single-tenant `GOOGLE_REFRESH_TOKEN` to per-user OAuth 2.0 authorization code flow.
   - Each user (patient or doctor) connects their own Google Calendar via a short-lived, signed state binding.

2. **Data Encryption at Rest**:
   - Access and refresh tokens must be encrypted using `AES-256-GCM` with a server-side `GOOGLE_TOKEN_ENCRYPTION_KEY`. Plaintext tokens must never touch the database disk.

3. **Production Provider Startup Guards**:
   - In production mode (`NODE_ENV=production`), application startup must immediately fail if mock or console adapters are configured (`LLM_PROVIDER=mock`, `EMAIL_PROVIDER=console`, `CALENDAR_ENABLED=false`) unless an explicit `DEVELOPMENT_MODE=true` bypass is declared.
