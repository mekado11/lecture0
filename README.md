# AuthorScrolls

Manuscript analysis SaaS for fiction writers. Upload a `.txt`, `.docx`, or `.pdf` and get instant scoring across plot, pacing, clarity, and dialogue — plus AI-powered deep critique, query letter generation, and beta reader simulation for paid tiers.

**Live:** [authorscrolls.com](https://authorscrolls.com)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS, Firebase Auth, Firestore |
| Static hosting + API proxy | Vercel (serverless, `api/`) |
| AI proxy + CRON reminders | Firebase Cloud Functions (`functions/`) |
| Payments | Stripe (webhook-verified) |
| Rate limiting | Upstash Redis (with in-memory dev fallback) |
| Push notifications | Web Push / VAPID |

---

## Project structure

```
├── app.html            # Main editor
├── index.html          # Landing page
├── pricing.html        # Pricing page
├── profile.html        # User profile
├── legal.html          # Terms + privacy
├── app.js              # Editor UI + Firebase integration
├── analyzer.js         # Local heuristic analysis engine (runs in browser)
├── ai-engine.js        # AI feature orchestration (calls api/claude proxy)
├── storage.js          # Firestore read/write helpers
├── styles.css          # Main stylesheet
├── styles-mobile.css   # Mobile overrides (≤700px, ≤600px, ≤480px)
├── mobile-panels.js    # Mobile panel collapse behavior
├── sw.js               # Service worker (PWA + push)
├── firebase-config.js  # Firebase project config (public keys only)
│
├── api/                # Vercel serverless functions
│   ├── _auth.js        # Firebase Admin token verification
│   ├── _ratelimit.js   # Upstash Redis rate limiting
│   ├── claude.js       # AI proxy (Claude + OpenAI, tier-gated)
│   ├── checkout.js     # Stripe checkout session
│   ├── webhook.js      # Stripe webhook handler
│   └── notify.js       # Push subscription management
│
├── functions/          # Firebase Cloud Functions
│   └── index.js        # claude proxy + push/email CRON reminders
│
├── vercel.json         # Vercel routes + security headers
├── firebase.json       # Firebase Hosting + Functions config
├── .firebaserc         # Firebase project alias (writers-manuscript)
├── firestore.rules     # Firestore security rules
└── DEPLOY.md           # Deployment instructions + env var reference
```

---

## Local development

```bash
node server.js
# Open http://localhost:3000
```

Set `CLAUDE_API_KEY` (and optionally `OPENAI_API_KEY`) in your environment. All other API keys are only needed for production deploys.

---

## Tiers

| Tier | Price | AI calls/day |
|------|-------|-------------|
| Free | $0 | 0 (local analysis only) |
| Starter | $5/mo | 1 |
| Premium | $15/mo | 5 |

---

## Deploy

See [DEPLOY.md](./DEPLOY.md) for full instructions and required environment variables.
