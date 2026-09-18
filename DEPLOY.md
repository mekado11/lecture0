# AuthorScrolls deployment guide

## Release status

This branch is a release candidate, not a production certification. Read `RELEASE_READINESS.md` before merging or deploying. No production services, billing records, cloud data, rules, or scheduled jobs were changed during development.

## Supported architecture

- **Vercel:** primary website and the sole supported application API under `api/`.
- **Firebase:** authentication, Firestore and optional scheduled reminders.
- **Firebase Hosting:** static preview only, built from `dist`. It is not a full application fallback because it does not host the Vercel API.
- **Legacy Firebase model proxy:** retained as an HTTP 410 retirement endpoint. Deploying this branch's functions replaces the old proxy; the old deployed endpoint remains unchanged until that deployment happens.

The repository's default branch is `gh-pages`. Check the Vercel project's production branch setting rather than assuming a push to `main` deploys anything. GitHub Pages alone cannot host the authenticated API.

## Local setup and tests

Use Node.js 22:

```sh
npm ci
npm ci --prefix functions
npm run build
npm run verify
node -e "require('./functions/index')"
npx playwright install --with-deps chromium
npm run test:browser
npm audit --audit-level=high
npm audit --prefix functions --audit-level=high
npm start
```

Open `http://localhost:3000`. The server binds to loopback and routes APIs through the same authenticated handlers as Vercel. It does not bypass authentication or entitlement checks.

Browser tests use generated TXT, DOCX and PDF files, actual parsers and actual Chromium. They replace Firebase and provider responses with test fixtures. Never include `scripts/firebase-fixture.js` in a deployed bundle.

## Environment

Set secrets in the hosting platform, never in tracked files.

| Variable | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON service-account credential for server-side Firestore and Auth administration. Grant only the required permissions. |
| `FIREBASE_PROJECT_ID` | Project ID when using Application Default Credentials. ID alone does not authorize revocation checks or database access. |
| `ADMIN_UIDS` | Optional comma-separated Firebase UIDs with developer model access. Email addresses do not grant server privileges. |
| `OPENAI_API_KEY` | Provider credential for permitted OpenAI routes. |
| `CLAUDE_API_KEY` | Provider credential for permitted Claude routes. |
| `UPSTASH_REDIS_REST_URL` | Persistent quota storage endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Persistent quota storage credential. Required with URL for production model, grammar and invite operations. |
| `STRIPE_SECRET_KEY` | Stripe test-mode credential for staging; live-mode only after acceptance. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the exact environment's webhook endpoint. |
| `CRON_SECRET` | Optional internal push endpoint secret, if that endpoint is used. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Optional server push credentials. Public key must match the client configuration. |

Firebase reminder secrets are `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`. Reminder recipients must opt in through their current profile; email recipients must have a verified Firebase Auth email.

The browser's Firebase configuration and VAPID public key are public configuration, not server secrets. Verify they reference the intended staging project. The existing frontend contains a production project configuration; do not use it for destructive staging tests.

## Staging sequence

1. Review the PR without merging. Provision separate staging Firebase, Stripe test mode, Redis and provider limits.
2. Build `dist`; verify Vercel recognizes the root `api/` functions while serving static output from `dist`. Check `/api/account` and signed, raw-body `/api/webhook` explicitly.
3. Add the staging domain to Firebase Auth's authorized domains and test email/password, Google popup, reset, sign-out and reauthentication. Several billing return URLs intentionally remain fixed to `authorscrolls.com`; make staging-specific changes before a full billing rehearsal.
4. Export/backup Firestore and test the supplied rules with the emulator before deploying them. Verify root profile entitlement fields cannot be written by a browser, and a user cannot read any other user's documents.
5. Migrate existing Stripe subscriptions to server-owned `metadata.userId` and `metadata.plan` (`starter` or `premium`) after inspecting each account. Do not infer plans from arbitrary client fields. Existing active subscriptions without plan metadata cause retryable webhook failures until migrated.
6. Configure Stripe Billing Portal and webhook delivery for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`.
7. Run checkout, failed payment, upgrade/downgrade, cancellation, duplicate/reordered event and deletion scenarios in test mode. Verify entitlement changes and portal return behavior.
8. Rehearse schema-v3 manuscript saves, legacy reads, restore and rollback on copied data. Do not switch old clients back onto v3 documents without a compatibility plan.
9. Test real provider responses and errors, quota exhaustion, Redis outage and slow responses. Review manuscript disclosure and provider retention language.
10. Only after approval, deploy selected services explicitly. Do not run an unqualified `firebase deploy` as a shortcut.

Example commands for an already-reviewed staging project:

```sh
npm run build
firebase deploy --only firestore:rules --project YOUR_STAGING_PROJECT
firebase deploy --only functions --project YOUR_STAGING_PROJECT
```

There is no automatic live deployment command in this document. Confirm the target project and production gates first.

## Data migration and rollback

Schema 3 writes immutable text chunks to a new generation, then publishes the manuscript's generation pointer. Legacy inline and schema-2 chunked documents remain readable by the new client. Derived intelligence is rebuilt instead of repeatedly duplicating it into subcollections.

Do not deploy an old client against newly written schema-3 manuscripts. Keep Firestore exports and a reviewed schema-compatible rollback build. Snapshot restores preserve the current working text as a safety snapshot. Failed writes may leave unreferenced chunks, which need a separately reviewed retention/cleanup policy.

Saves use generation comparisons in a Firestore transaction to reject stale-device overwrites. On conflict, preserve/export the local recovery, reload the cloud draft and reconcile deliberately; no automatic merge is attempted. Reads retry a changed generation rather than silently loading truncated text. Validate this behavior against real Firestore and multiple devices before broad production release.

Account deletion writes a server-only `accountDeletions/{uid}` tombstone before cancelling billing and removing data. Rules deny client access for tombstoned accounts; webhooks ignore them. Failed deletion attempts leave the tombstone in place so the operation can be retried or investigated safely. Define the minimal-record retention period and support recovery process before launch.

## Operational checks

Monitor webhook 5xx responses, failed saves, authentication failures, provider timeouts, quota-store outages and reminder delivery failures without logging manuscript text or credentials. Establish backup restore tests, alert ownership and a rollback owner.

Scheduled reminder delivery can duplicate when delivery succeeds but the subsequent acknowledgement fails. Large recipient lists may exceed the function timeout despite pagination. A durable delivery queue/idempotency design and unsubscribe/compliance review are required before enabling reminders at scale.
