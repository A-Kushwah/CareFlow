# Skills & Tooling Audit (Phase 0)

| Requirement Domain | Selected Skill / Tool | Usage Description |
| :--- | :--- | :--- |
| **Full-Stack Development** | TypeScript, Next.js (App Router), React 18 | Codebase structure, API routes, Server Components, and UI layout. |
| **Database & ORM** | PostgreSQL / SQLite + Prisma ORM | Relational schema modeling, migrations, indexing, `$transaction` locks. |
| **Authentication & AuthZ** | Custom RBAC (`ADMIN`, `DOCTOR`, `PATIENT`) | Role verification middleware, password hashing, session tokens. |
| **API & Schema Validation** | Zod + Next.js API Routes | Input validation and server-side response typing. |
| **Testing & Concurrency** | Node Test Runner / Vitest | Automated concurrency testing, race condition checks, leave collision tests. |
| **Browser & E2E Verification**| `browser_subagent` IDE Tool | Interactive browser testing of patient booking, doctor portal, and admin views. |
| **Email & Calendar Adapters** | Nodemailer / OAuth API Adapters | Pluggable email sending and Google Calendar event sync adapters. |
| **AI LLM Integration** | Server-side LLM Adapter | Structured symptom intake & post-visit notes with fallback mock mode. |
| **Data Safety** | `accidental-data-loss-prevention` | Protection against accidental DB or file destruction. |
