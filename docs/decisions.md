# Architectural Decision Records (ADR)

## ADR-01: Modular Monolith Over Microservices
- **Context**: The application requires high reliability for appointment bookings, doctor leave conflicts, and notification retries while maintaining minimal deployment complexity and zero free-tier infrastructure overhead.
- **Decision**: Build a clean **Modular Monolith** in Next.js (App Router). Domain logic is cleanly segregated into modules (`booking`, `doctors`, `notifications`, `ai`, `calendar`), communicating via internal TypeScript interfaces.
- **Consequences**: Easy local testing, instant zero-latency in-memory transactional guarantees, no network latency overhead between services, simple free-tier deployment.

---

## ADR-02: Database Transactional Outbox for Notifications
- **Context**: External API calls (SMTP email providers, Google Calendar API) can fail or time out. Rolling back an appointment booking because an email failed degrades user experience.
- **Decision**: Implement a **Transactional Outbox Pattern** using a database table (`NotificationLog`). Outbox entries are written inside the appointment booking transaction. An asynchronous worker picks up and retries jobs with exponential backoff.
- **Consequences**: Guarantees appointment booking atomicity while delivering resilient notification retries without requiring external message brokers (Redis/RabbitMQ).

---

## ADR-03: Two-Phase Slot Reservation (Temporary Hold + Atomic Lock)
- **Context**: High-demand doctors can receive simultaneous booking requests for the exact same slot.
- **Decision**: 
  1. When a user selects a slot, create a 5-minute `SlotHold`.
  2. When the user confirms booking, run a Prisma `$transaction` that verifies slot availability, asserts no overlapping confirmed appointments or active holds exist, and converts the hold into a `CONFIRMED` appointment atomically.
- **Consequences**: Completely eliminates race conditions and double-bookings.

---

## ADR-04: Multi-Model AI Architecture & Fallback Strategy
- **Context**: LLM calls for symptom intake or post-visit notes may encounter rate limits, network timeouts, or schema mismatches.
- **Decision**: Enforce server-side execution with strict 5-second timeouts, Zod JSON parsing, and a deterministic fallback summary mode (`LLM_PROVIDER=mock`).
- **Consequences**: System remains 100% operational even if external AI providers fail.
