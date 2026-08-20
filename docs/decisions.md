# Architectural Decision Records (ADR)

## ADR-01: Modular Monolith Over Microservices
- **Context**: The application requires high reliability for appointment bookings, doctor leave conflicts, and notification retries while maintaining minimal deployment complexity and zero free-tier infrastructure overhead.
- **Decision**: Build a **modular monolith** in Next.js (App Router). Domain logic is grouped into modules (`booking`, `doctors`, `notifications`, `ai`, `calendar`) that communicate through internal TypeScript functions.
- **Consequences**: The app is easy to run locally, avoids service-to-service deployment overhead, and fits the free-tier deployment target.

---

## ADR-02: Database Transactional Outbox for Notifications
- **Context**: External API calls (SMTP email providers, Google Calendar API) can fail or time out. Rolling back an appointment booking because an email failed degrades user experience.
- **Decision**: Implement a **Transactional Outbox Pattern** using a database table (`NotificationLog`). Outbox entries are written inside the appointment booking transaction. An asynchronous worker picks up and retries jobs with exponential backoff.
- **Consequences**: Appointment changes and their notification jobs are committed together, while retries can run without Redis or another external message broker.

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
- **Consequences**: The booking and consultation flows still work when an external AI provider is unavailable, using the configured fallback response.
