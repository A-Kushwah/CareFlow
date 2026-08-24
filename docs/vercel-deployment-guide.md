# CarePulse — Step-by-Step Vercel Deployment Guide

This guide provides complete instructions for deploying the CarePulse Healthcare Appointment System to **Vercel** with a managed **PostgreSQL database** (e.g. Vercel Postgres, Supabase, or Neon), **Google OAuth 2.0 per-user calendar sync**, **OpenAI clinical summaries**, and **Prisma ORM migrations**.

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure you have:
1. A **GitHub account** with access to your repository ([A-Kushwah/unthinkable-healthcare-appointment](https://github.com/A-Kushwah/unthinkable-healthcare-appointment)).
2. A **Vercel account** ([vercel.com](https://vercel.com)).
3. A managed **PostgreSQL database URL** (e.g. Vercel Postgres, Supabase, Neon, or Railway).
4. An **OpenAI API Key** (`sk-proj-...`).
5. A **Google Cloud OAuth 2.0 Client ID & Secret**.

---

## Step 1: Set Up Managed PostgreSQL Database

CarePulse uses SQLite locally (`dev.db`) and **PostgreSQL** in production (`prisma/schema.prisma`).

### Option A: Vercel Postgres (Recommended)
1. Go to your Vercel Dashboard > **Storage** > **Create Database** > **Postgres**.
2. Select a region close to your users and click **Create**.
3. Copy the `POSTGRES_PRISMA_URL` or `POSTGRES_URL` (format: `postgres://...` or `postgresql://...`).

### Option B: Supabase / Neon / Railway
1. Create a PostgreSQL project on [Supabase](https://supabase.com) or [Neon](https://neon.tech).
2. Copy the Connection String:
   `postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres?sslmode=require`

---

## Step 2: Run Production Database Migrations

Run Prisma migrations against your production PostgreSQL database before or during Vercel build:

```bash
# 1. Set your remote PostgreSQL URL in local terminal
export DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"

# 2. Deploy canonical PostgreSQL migrations to the production database
npx prisma migrate deploy --schema=prisma/schema.prisma

# 3. (Optional) Seed initial admin user into PostgreSQL
npx prisma db seed --schema=prisma/schema.prisma
```

---

## Step 3: Deploy Project to Vercel

1. Open [Vercel Dashboard](https://vercel.com/new).
2. Click **Add New... > Project**.
3. Select your repository: `A-Kushwah/unthinkable-healthcare-appointment`.
4. Configure Framework: Select **Next.js**.
5. Set **Build and Output Settings**:
   - **Build Command**: `prisma generate --schema=prisma/schema.prisma && next build`
   - **Install Command**: `npm install`
   - **Output Directory**: `.next` (default)

---

## Step 4: Configure Environment Variables in Vercel

Under **Settings > Environment Variables** in your Vercel project dashboard, add the following variables for **Production**, **Preview**, and **Development**:

| Environment Variable | Recommended Value | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production security guards & PBKDF2 pass checks |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname?sslmode=require` | PostgreSQL production connection string |
| `JWT_SECRET` | `generate-a-random-64-character-secret-key-string-here` | Session cookie signing secret |
| `LLM_PROVIDER` | `groq` | Live Groq / Grok AI provider |
| `GROQ_API_KEY` | `gsk_xxx...` | Server-side Groq / Grok API key |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Clinical post-visit summary & triage model |
| `EMAIL_PROVIDER` | `smtp` (or `console` if testing) | Enforces live SMTP delivery |
| `SMTP_HOST` | `smtp.sendgrid.net` (or Mailgun/AWS SES) | Transactional email server host |
| `SMTP_PORT` | `587` | Email server port |
| `SMTP_USER` | `apikey` | SMTP username |
| `SMTP_PASS` | `SG.xxx...` | SMTP password / API key |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google Cloud OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxx` | Google Cloud OAuth Client Secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://your-app-name.vercel.app/api/integrations/google-calendar/callback` | OAuth redirect URI |
| `GOOGLE_OAUTH_STATE_SECRET` | `generate-a-random-64-character-state-secret` | HMAC state signature secret |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | `generate-a-random-32-character-key` | AES-256-GCM token encryption secret |

---

## Step 5: Configure Google Cloud OAuth Redirect URIs

Once Vercel assigns your production domain (e.g. `https://carepulse.vercel.app`):

1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Edit your **OAuth 2.0 Web Application Client**.
3. Add to **Authorized JavaScript origins**:
   - `https://your-app-name.vercel.app`
4. Add to **Authorized redirect URIs**:
   - `https://your-app-name.vercel.app/api/integrations/google-calendar/callback`
5. Save changes in Google Cloud Console.

---

## Step 6: Trigger Vercel Deployment & Verify

1. Click **Deploy** in Vercel (or push a commit to `main`).
2. Once build completes, open your live Vercel URL.
3. Test production health endpoints:

```bash
# Verify System & Database Status
curl -s https://your-app-name.vercel.app/api/health

# Output:
# {"status":"HEALTHY","environment":"production","database":"CONNECTED","timestamp":"..."}

# Verify Integrations Status (No secrets exposed)
curl -s https://your-app-name.vercel.app/api/health/integrations

# Output:
# {"status":"HEALTHY","integrations":{"openai":true,"googleCalendar":true,"emailProvider":"smtp"}}
```

---

## 🔒 Security Best Practices for Production

1. **Never commit `.env` or production API keys** to GitHub.
2. **Keep `DATABASE_URL` SSL enabled** (`sslmode=require`).
3. **Use unique `JWT_SECRET` and `GOOGLE_TOKEN_ENCRYPTION_KEY`** secrets in production.
4. **Deploy database migrations via `prisma migrate deploy`**, not `prisma db push`.
