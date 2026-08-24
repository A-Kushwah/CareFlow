# CarePulse Healthcare System — Production Deployment Guide

This document details step-by-step procedures for deploying CarePulse to a production cloud environment (e.g. Vercel + Managed PostgreSQL), configuring per-user Google OAuth 2.0 calendar synchronization, enforcing production environment guards, and performing post-deployment validation.

---

## 1. Environment Variables & Secret Configuration

Configure the following production environment variables in your deployment dashboard (e.g. Vercel Environment Variables):

| Environment Variable | Required Value / Format | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production mode and security guards. |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/carepulse?sslmode=require` | PostgreSQL production database connection string. |
| `JWT_SECRET` | 64+ char random string | Session cookie signing key. |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google Cloud OAuth 2.0 Client ID. |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxx` | Google Cloud OAuth 2.0 Client Secret. |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://your-domain.com/api/integrations/google-calendar/callback` | Authorized Google OAuth callback URL. |
| `GOOGLE_OAUTH_STATE_SECRET` | 64+ char random string | HMAC secret for signing OAuth state parameters. |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | 32+ char random key | AES-256-GCM secret key for encrypting Google tokens at rest. |
| `EMAIL_PROVIDER` | `smtp` | Enforces live SMTP delivery (console/mock rejected in production). |
| `SMTP_HOST` | `smtp.sendgrid.net` / `smtp.mailgun.org` | Transactional email server host. |
| `SMTP_PORT` | `587` | Transactional email port. |
| `SMTP_USER` | `apikey` | SMTP account username. |
| `SMTP_PASS` | `SG.xxx` | SMTP account password / API key. |
| `LLM_PROVIDER` | `groq` | Live Groq / Grok provider (mock mode rejected in production). |
| `GROQ_API_KEY` | `gsk_xxx` | Groq / Grok server-side API key. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Model for clinical post-visit summaries & triage. |

---

## 2. Google OAuth 2.0 Console Setup

1. **Create Google Cloud Project**: Navigate to [Google Cloud Console](https://console.cloud.google.com/) and create a project named `CarePulse Healthcare`.
2. **Enable Google Calendar API**: Go to **APIs & Services > Library**, search for `Google Calendar API`, and click **Enable**.
3. **Configure OAuth Consent Screen**:
   - User Type: **External** (or Internal for Google Workspace users).
   - App Name: `CarePulse Healthcare Appointment System`.
   - Support Email: `support@carepulse.com`.
   - Scopes: Add `https://www.googleapis.com/auth/calendar.events` (**Least Privilege**: Permits creating, updating, and deleting consultation events on the user's primary calendar).
4. **Create OAuth 2.0 Web Client**:
   - Application Type: **Web application**.
   - Authorized Javascript Origins: `https://your-domain.com`.
   - Authorized Redirect URIs: `https://your-domain.com/api/integrations/google-calendar/callback`.
5. Copy `Client ID` and `Client Secret` into deployment environment variables.

---

## 3. Database Migration & Deployment Commands

Run production migrations against your managed PostgreSQL database:

```bash
# 1. Generate canonical PostgreSQL client
npx prisma generate --schema=prisma/schema.prisma

# 2. Deploy all PostgreSQL migrations in order
npx prisma migrate deploy --schema=prisma/schema.prisma

# 3. Verify Next.js production build
npm run build
```

---

## 4. Post-Deployment Verification

Check system health endpoints using cURL or HTTP client:

```bash
# General System & Database Health
curl -s https://your-domain.com/api/health | jq .

# Integrations Health (No secrets exposed)
curl -s https://your-domain.com/api/health/integrations | jq .
```
