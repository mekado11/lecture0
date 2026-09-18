# Isolated Firebase integration checks

These are real Firebase Authentication and Firestore emulators, not the in-memory browser fixture. They execute the repository Rules, real browser-compatible SDK calls, the application's `Storage` implementation, and the actual Admin token verifier and AI endpoint.

## Run

From the repository root, with Node 22 and Java 21 or newer:

```sh
npm ci
npm ci --prefix scripts/emulator
npm test --prefix scripts/emulator
```

The test-only package and lockfile are separate from the application's dependencies. They are excluded from the public build. `firebase-client` deliberately aliases Firebase **10.12.0**, matching `app.html`; the newer `firebase` dependency is used only by the Rules-test helper.

The dedicated `firebase-emulators` CI job runs the same commands. It needs no GitHub secrets, Firebase login, paid-provider credentials, Stripe keys or real manuscript.

## Isolation

- Explicit demo project: `demo-authorscrolls-staging`. The command never uses `.firebaserc`'s default live project.
- Auth: `127.0.0.1:9099`. Firestore: `127.0.0.1:8080`.
- Startup assertions reject mismatched hosts/projects and live service-account/provider credentials.
- Cloud metadata discovery is disabled. No deployment, real email delivery, checkout, webhook, provider call, or live manuscript write is performed.
- Test accounts use reserved `example.test` addresses. All book text is synthetic.
- Firebase shuts down the emulators after the run. A 90-second test-process deadline prevents hung clients from leaving acceptance checks running indefinitely.
- Rules-denied operations intentionally produce `PERMISSION_DENIED` log messages; their assertions must pass.

## Eleven integration checks

- Email/password sign-in, bad-password rejection, token verification and sign-out.
- Password reset through emulator out-of-band codes, changed credentials and single-use reset codes.
- Admin verification rejects revoked tokens and disabled accounts.
- Owner-only manuscript and nested snapshot access; anonymous/cross-owner rejection; protected profile fields; deletion tombstones.
- Exact multi-part Unicode source round-trip and snapshot restore with an unsaved-text safety copy.
- Competing saves from separate authenticated SDK clients publish only one winner.
- Missing manuscript/snapshot parts are rejected rather than opened as partial text.
- Same-length manuscript and snapshot corruption is rejected by schema-4 SHA-256 integrity checks.
- Offline edits cannot silently overwrite a newer online draft after reconnect.
- Stale edits cannot resurrect an already deleted manuscript.
- AI access removal is immediate, missing providers fail closed, and deletion tombstones apply to Admin-backed AI access.

Four additional lightweight `ai-access.test.js` cases run in the normal Node suite: unavailable access authority, privileged-account deletion, invalid/missing profile tiers, and provider/rate-limit failure without fallback.

## Evidence limits

These tests do not certify deployed IAM/Rules, signed production JWT verification, Google OAuth redirects/popups, real email delivery, browser persistence across physical devices, real provider availability/answer quality, or production Redis. The Auth emulator intentionally uses emulator tokens, not production signing infrastructure.

The offline case accepts either a pending write that later conflicts or an SDK-level offline-read rejection. Both must fail without overwriting the newer draft. This is not durable offline recovery: unsaved text remains in the browser tab and needs an explicit export before closing it.

The Rules checks assert that billing-related profile fields cannot be forged by clients; they do not exercise billing. Stripe implementation and live billing acceptance are out of scope for this continuation.

## Live acceptance prerequisites

The repository currently names `writers-manuscript` as its only Firebase project. A Vercel preview is not evidence of a separate data environment.

A separate Firebase project is optional; the user declined creating one. Before real-service acceptance, confirm frontend config, server Admin credentials, authorized Auth domains and deployed Rules belong to the explicitly approved project. Obtain Vercel access to `mekado11s-projects` and authorization for narrowly scoped disposable accounts and synthetic manuscripts, with clear cleanup boundaries. Verify provider/rate-limit configuration without exposing secret values. Google sign-in, real reset delivery, account revocation, save/reload on two browsers and grounded provider responses remain live acceptance gates. This emulator suite never targets the existing cloud project.
