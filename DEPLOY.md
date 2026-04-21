# AuthorScrolls — Deployment Guide

## Architecture

Two deployment targets, both served from the **project root**:

| Layer | Platform | What it serves |
|-------|----------|----------------|
| Static files + API proxy | **Vercel** | `app.html`, `index.html`, `api/` serverless routes |
| AI proxy (deep critique) + CRON reminders | **Firebase** | `functions/` Cloud Functions, Hosting static fallback |

Vercel is the primary host. Firebase Hosting is a fallback; Firebase Functions handles the scheduled push/email reminders and the `/api/claude` rewrite for the Firebase domain.

---

## Required environment variables

### Vercel dashboard
| Variable | Description |
|----------|-------------|
| `CLAUDE_API_KEY` | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI key for fast/cheap tasks |
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON of Firebase service account (stringified) |
| `STRIPE_SECRET_KEY` | `sk_live_...` or `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | From Stripe dashboard → Webhooks |
| `UPSTASH_REDIS_REST_URL` | From Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | From Upstash console |

### Firebase secrets (via CLI)
```bash
firebase functions:secrets:set CLAUDE_API_KEY
firebase functions:secrets:set VAPID_PUBLIC_KEY
firebase functions:secrets:set VAPID_PRIVATE_KEY
firebase functions:secrets:set SMTP_HOST
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
```

---

## One-time setup

```bash
# 1. Install Firebase CLI
npm install -g firebase-tools
firebase login

# 2. Install function dependencies
cd functions && npm install && cd ..

# 3. Link to Firebase project (writers-manuscript already in .firebaserc)
firebase use default
```

---

## Deploy

### Vercel (primary — static files + API routes)
Push to `main`. Vercel auto-deploys via git integration.

Or manually:
```bash
vercel --prod
```

### Firebase (functions + hosting fallback)
Run from the **project root**:
```bash
firebase deploy                        # everything
firebase deploy --only functions       # CRON reminders only
firebase deploy --only hosting         # static files only
```

---

## Local development

```bash
CLAUDE_API_KEY=sk-ant-xxx node server.js
# Open http://localhost:3000
```

---

## Live URLs
- Vercel: configured in Vercel dashboard (authorscrolls.com)
- Firebase Hosting: `https://writers-manuscript.web.app`
