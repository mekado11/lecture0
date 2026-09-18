# AuthorScrolls release-readiness review

Prepared September 18, 2026 for the scroll redesign and application stabilization PR. This is a substantial remediation pass, not a claim that every feature or production integration has been certified.

## Decision

**Ready for design and code review. Not cleared for production rollout.**

The homepage and principal manuscript workflows have been implemented and tested locally. Live authentication, billing, Firestore rules, cloud deployment, cross-device editing and delivery operations still need staging acceptance. No production data was edited, no purchase was made, and no production deployment or merge was performed.

## Implemented

- **Scroll homepage:** realistic parchment and wood rollers, a quiet library setting, real selectable text, a custom brand mark, mobile-specific crop, dark/light themes and keyboard-closeable sign-in dialog. Navigation works even if the auth CDN fails.
- **Editor layout:** repaired malformed panel markup, removed conflicting mobile collapse behavior and preserved useful manuscript space on small screens.
- **Imports and export:** updated/self-hosted DOCX, ZIP and PDF libraries, PDF worker support, clear rejection of image-only PDFs, and export of the current editor text instead of stale analysis text.
- **Saving and versions:** per-document in-tab save queues, transactional stale-device rejection, generation-based publication after chunks are written, read retries when a generation changes, Unicode byte limits, duplicate-filename separation, legacy read support, local recovery, corruption checks, snapshot preview/restore and a safety snapshot of unsaved text before restoration.
- **Book intelligence:** repaired syntax and regex failures, shared the intelligence construction pipeline, restored chapter/character/thread/review navigation, and ensured Ask Book sends retrieved passages to the provider. Evidence quotes in that interface must match source chapters.
- **Optional analysis:** removed automatic provider calls on manuscript open, added an explicit disclosure/confirmation, protected callbacks against stale drafts and serialized issue-list mutations. Provider-generated advice still requires author review.
- **Accounts and security:** authenticated grammar and invite operations, server-side invite redemption, recent-auth account deletion, billing cancellation before recursive data deletion, client entitlement-write restrictions, UID-based server administration and private local-data clearing on account changes.
- **Billing:** strict plan validation, one pending checkout lease per account, provider idempotency keys, existing-subscription protection, subscription metadata, signed raw-body webhook parsing, retryable failures and transactional checks for duplicate/older events. Added Billing Portal access and deletion tombstones that prevent delayed events from recreating profiles.
- **Reminders:** retired the duplicate Firebase model proxy, moved to Node 22, removed trust in client-written recipient identities, required current opt-in and verified email, and removed manuscript details from reminder text.
- **Build and maintenance:** public-only static bundle, protected local server, lockfiles, modular Firebase Admin compatibility, dependency audits and a pull-request verification workflow. Removed a redundant sampled-text AI cache wrapper that discarded options.

## Verification performed

| Check | Local result | Scope |
|---|---|---|
| Clean root dependency installation | Passed | Node 22, committed lockfile |
| Reminder dependency installation and runtime import | Passed | Actual installed SDKs, no cloud operations |
| `npm run build` | Passed | Public `dist` excludes tests, server source, dependency trees and credentials |
| `npm run check` | Passed | 55 JavaScript files, zero syntax failures |
| `npm test` | Passed | 37 Node test results, including original intelligence suites and transactional save/billing regressions |
| Root `npm audit` | Passed | Zero reported vulnerabilities at time of testing |
| Reminder `npm audit` | Passed | Zero reported vulnerabilities at time of testing |
| Chromium browser workflow suite | Passed | Desktop 1440px and mobile 375px |
| Visual inspection | Performed | Homepage desktop/mobile/light theme and editor desktop/mobile |

The browser suite uses actual document parsers, a real analysis worker and actual DOM interactions. It mocks authentication, Firestore and paid provider responses. Passing it does not validate production IAM, Firebase rule enforcement, Stripe delivery, provider output quality or real payment processing.

Covered browser flows: navigation, theme switch, responsive menu, auth dialog open/Escape, CDN-failure isolation, TXT/DOCX/PDF import, local analysis, intelligence tabs, retrieved-context question, save, immediate export after editing, snapshot restore, unsaved-text safety snapshot, library navigation flush, same-name drafts, mobile editing space, supporting-page rendering and zero uncaught page exceptions.

Supporting pages were smoke-tested for rendering, not exhaustively accepted for every control or marketing statement. PDF testing uses a simple text fixture, not a complete publishing-layout corpus. Accessibility checking here is limited to implemented semantics, focus behavior and visual inspection; it is not a full audit.

## Launch gates

### Must resolve before production

- **Cloud authorization:** run Firebase Auth and Firestore Emulator tests for owner isolation, entitlement protection, beta-code access, revocation and fresh authentication. Test Google/email/reset flows on the real staging domain.
- **Cross-device saves:** transaction-based conflict rejection and generation-change retries are implemented and fixture-tested. Exercise these with real Firestore, multiple devices, offline recovery and delete-while-editing races. Conflicts need manual reconciliation; there is no collaborative merge interface.
- **Migration and recovery:** back up real data, rehearse schema-3 migration on copies, inspect corrupted legacy documents, set snapshot retention and orphan-chunk cleanup policy, and validate a schema-compatible rollback.
- **Billing acceptance:** migrate existing active subscriptions to verified user/plan metadata; test checkout leases, provider idempotency, existing duplicate subscriptions, plan changes, late/retried events, cancellation and deletion in Stripe test mode. Confirm the Billing Portal configuration supports the intended managed-upgrade policy.
- **Deletion races:** verify deletion retries, partial failure recovery and in-flight webhook behavior against real services. Tombstones block recreation in code; define their retention period, support handling and billing reconciliation.
- **Deployment:** confirm Vercel routes root API functions with the new `dist` output and receives unparsed webhook bodies. Test security headers and provider timeouts on staging. The private visual preview is not a live full-stack acceptance environment.
- **Product truth:** align public quotas, claims, privacy language and actual entitlements. Scores and entity extraction are heuristic; factual continuity and suggested rewrites need a curated manuscript benchmark, not just synthetic regression fixtures.

### Before enabling reminders or broad scale

- **Delivery:** verify SMTP/VAPID setup, public-key matching, opt-out behavior, verified-email onboarding, idempotency, bounded queues and actual browser notification behavior. No reminders were sent during this work.
- **Performance:** test long manuscripts near the upload limit, memory pressure, many snapshots and large libraries. The current browser pipeline still has CPU-intensive work, and `app.js` remains a large module.
- **Accessibility and devices:** run keyboard-only, screen-reader, zoom, reduced-motion and contrast audits, plus Safari/iOS, Firefox and Android acceptance.
- **Operations:** establish monitoring, error reporting without manuscript content, alert ownership, backup restores and rollback drills.

## Refactoring boundaries

This pass consolidates duplicate intelligence construction, removes an unsafe cache layer and duplicate model backend, modernizes storage publication, and creates a repeatable test/build boundary. It deliberately does not replace the application framework or rewrite every analysis algorithm at once.

Further extraction of the editor, library, provider orchestration and account UI from the large existing scripts should be incremental and protected by these tests. Removing features merely to reduce line count would not improve author workflows.

## Reviewer sequence

1. Review the homepage preview and manuscript-first mobile layout.
2. Inspect `storage.js`, `api/`, `firestore.rules` and the schema/rollback notes first.
3. Run the committed verification workflow on the PR.
4. Resolve the launch gates on isolated staging data and record evidence.
5. Approve merge and production rollout separately.
