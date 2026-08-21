# Deployment & Environment Setup Guide

This guide covers local development setup, environment variable configuration, and production hosting instructions for CarePulse.

---

## 1. Local Development Setup (SQLite)

### Prerequisites
- Node.js `v18.0.0` or higher (tested on `v24.11.0`)
- npm `v9.0.0` or higher

### Step-by-Step Instructions

```bash
# 1. Clone repository & install dependencies
git clone https://github.com/A-Kushwah/unthinkable-healthcare-appointment.git
cd unthinkable-healthcare-appointment
npm install

# 2. Configure environment file
cp .env.example .env

# 3. Generate Prisma client & push SQLite schema
npx prisma generate
npx prisma db push --accept-data-loss

# 4. Seed demo accounts & doctor schedules
node prisma/seed.js

# 5. Run test suite to verify installation
npm test

# 6. Start local development server
npm run dev
```

Open `http://localhost:3000` to launch the application.

---

## 2. Environment Variables Configuration (`.env`)

| Variable Name | Default / Demo Value | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `"file:./dev.db"` | Prisma database connection string (SQLite file path or PostgreSQL URI). |
| `EMAIL_PROVIDER` | `"console"` | Email delivery adapter mode (`console` for local logging, `smtp` for Nodemailer). |
| `LLM_PROVIDER` | `"mock"` | AI adapter mode (`mock` for deterministic fallback, `openai` / `gemini` for live API). |
| `CALENDAR_ENABLED` | `"false"` | Google Calendar sync toggle (`false` for mock mode, `true` for live OAuth API). |
| `JWT_SECRET` | `"carepulse-jwt-secret"` | HMAC-SHA256 secret for signing HTTP-only session cookies. |
| `CRON_SECRET` | `"carepulse-worker-key"` | Authorization bearer key for trigger endpoints (`/api/notifications/process`). |
| `SMTP_HOST` | `""` | SMTP server host (e.g., `smtp.gmail.com` or `smtp.mailgun.org`). |
| `SMTP_PORT` | `"587"` | SMTP server port. |
| `SMTP_USER` | `""` | SMTP authentication username. |
| `SMTP_PASS` | `""` | SMTP authentication password. |
| `GOOGLE_CLIENT_ID` | `""` | Google Cloud OAuth Client ID for Calendar API v3. |
| `GOOGLE_CLIENT_SECRET` | `""` | Google Cloud OAuth Client Secret. |
| `GOOGLE_REFRESH_TOKEN` | `""` | Google OAuth Refresh Token. |
| `OPENAI_API_KEY` | `""` | OpenAI API Key (optional). |

---

## 3. Production Deployment Guide (PostgreSQL + Vercel / Render)

### A. Managed PostgreSQL Database Setup
1. Provision a PostgreSQL database instance on Render, Railway, Neon, or Supabase.
2. Update `DATABASE_URL` in your production environment variables to your PostgreSQL connection string:
   ```env
   DATABASE_URL="postgresql://user:password@ep-host.postgresql.service.com:5432/carepulse?sslmode=require"
   ```
3. Update `prisma/schema.prisma` datasource provider from `"sqlite"` to `"postgresql"`.
4. Apply Prisma migrations and execute the GiST exclusion constraint migration:
   ```bash
   npx prisma migrate deploy
   ```

### B. Web Server Deployment (Vercel / Render)
1. Push repository code to your GitHub account (`main` branch).
2. Connect repository to Vercel or Render Web Services.
3. Configure Environment Variables in deployment project dashboard.
4. Deployment Build Command: `npm run build`
5. Deployment Start Command: `npm start`

### C. Outbox Worker Trigger Setup (Cron Job)
To trigger asynchronous outbox notification processing in production:
1. Setup a free scheduled cron job (e.g., via Vercel Cron Jobs, GitHub Actions, or cron-job.org).
2. Configure cron job to invoke `POST https://your-app-domain.com/api/notifications/process` every minute.
3. Add request header: `Authorization: Bearer <CRON_SECRET>`
