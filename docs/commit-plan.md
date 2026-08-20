# Granular Commit Plan

This commit plan outlines the 15 focused commits required to build, test, document, and deploy the Healthcare Appointment System.

| Commit # | Commit Message | Scope & Description |
| :--- | :--- | :--- |
| **1** | `chore: initialize repository and project plan` | Initial git repository setup, `.gitignore`, initial `README.md`, and planning docs (`requirements-matrix.md`, `architecture.md`, `commit-plan.md`, `decisions.md`). |
| **2** | `chore: scaffold application foundation` | Next.js configuration, TypeScript setup, Tailwind CSS configuration, and basic layout template. |
| **3** | `feat(db): add core schema and seed data` | Prisma schema setup, database migration, and seed script containing demo doctors, working hours, and sample patients. |
| **4** | `feat(auth): add role-based authentication` | User registration, login, role guard middleware (`ADMIN`, `DOCTOR`, `PATIENT`), and session token handling. |
| **5** | `feat(doctors): add profiles, schedules, and leave management` | Doctor CRUD endpoints, working hours definition, break management, and doctor leave application API. |
| **6** | `feat(appointments): add availability and transactional slot holds` | Conflict-free availability calculation engine, 5-minute temporary slot hold reservations, and transactional booking locks. |
| **7** | `test(appointments): cover booking conflicts and hold expiry` | Automated test suite for simultaneous booking attempts, race condition isolation, slot hold expiration, and leave collisions. |
| **8** | `feat(ai): add validated pre-visit and post-visit summaries` | Server-side LLM adapter integration, Zod schema validation, prompt versioning, timeout handling, fallback summaries, and disclaimers. |
| **9** | `feat(notifications): add outbox jobs and retry processing` | Database outbox queue, background worker for email delivery, exponential backoff, jitter, and DLQ handling. |
| **10** | `feat(calendar): add Google Calendar OAuth and event synchronization` | Google Calendar API adapter, asynchronous sync via outbox, mock mode fallback, and event cancellation logic. |
| **11** | `feat(reminders): add medication reminder processing` | Medication reminder scheduler, patient follow-up notifications, and deduplication guard. |
| **12** | `feat(admin): add job and notification visibility` | Admin console UI for monitoring outbox jobs, failed notifications, DLQ manual retry, and doctor leave logs. |
| **13** | `test(e2e): cover the primary patient-doctor workflow` | Integration and browser e2e verification testing full workflow from doctor creation to booking, consultation, and post-summary. |
| **14** | `docs: complete setup, API, schema, prompts, and system design` | Final system documentation update, setup guide, API specs, schema details, and design writeup under 800 words. |
| **15** | `chore: prepare production deployment and submission cleanup` | Final build verification, lint check, submission report, and deployment configuration. |
