# AuthorScrolls production audit

Updated September 18, 2026. Scope: header redesign, independent engine-claim verification, and integration of selected repairs onto `gh-pages` at `a4af5ee`.

## Release decision

**Suitable for code/design review and isolated staging acceptance. NOT cleared for production.**

Passing synthetic tests establishes repeatability and the exercised control flows, not literary accuracy, provider quality, complete manuscript comprehension, or live integration correctness. Do not merge or promote this branch solely because its build is green.

## Branch history and independent findings

[PR 46](https://github.com/mekado11/lecture0/pull/46) was merged at 2026-09-18 07:24:14 UTC; [PR 48](https://github.com/mekado11/lecture0/pull/48) was merged at 14:10:22 UTC. They are not still draft/unmerged PRs. This integration starts from their merged descendant, rather than replacing its newer storage and security code with an older branch.

The separate `authorscrolls-book-intelligence-v1` branch at `ed1db17` was audited in an isolated worktree. Its `node --test *.test.js` run failed all ten test-file entries: an undefined `REVIEW_RE`, syntax-invalid literal newline escapes in several test files, and intelligence expectation failures. “Zero of ten” describes that exact branch snapshot, not the merged production branch.

Source inspection additionally found a missing classifier signal yielding non-finite confidence, AI score-blending/filtering paths in the integration base, persistent manuscript/AI browser caches, and a Smart Scan cloud cache reusable for seven days without checking changed manuscript text. These are addressed in this branch.

## Claim-by-claim verification

| Claimed capability | Finding and implemented correction | Evidence / limitation |
|---|---|---|
| AI proxy and Writer's Room context | Retained the merged authenticated proxy. Writer's Room sends retrieved passages; whole-book requests additionally receive distributed structural samples. | Mock-provider payload assertions and real browser question flow. Live provider quality/auth not certified. |
| Book parsing | Repaired missing review regex and escaped matching; handles repeated chapter labels inside review/toolkit sections, front matter, chapter-number semantics, empty inputs, and normalized source reconstruction. | Parser fixtures pass. Table-of-contents ambiguity, unusual headings, poetry and complex PDF layouts still require a representative corpus. |
| Nonfiction intelligence | Author-selected genre wins over heuristics. Added concepts, attributed claims, personal evidence, reflection questions, actions and recommendations with chapter provenance. Blank lines after headings no longer suppress recommendations. | Synthetic extraction and browser Concepts/Evidence navigation pass. These are detected signals, not claim verification or a complete semantic model. |
| Whole-book understanding | Opening, middle and ending samples across up to 24 structural units, plus relevant passages, enter a bounded context packet. Smart Scan gets context surrounding the actual flagged issue, even late in a book. | 30-chapter / 76,963-word synthetic coverage test; complete packet budget assertions. Explicitly sampled, NOT every word or every chapter. |
| AI separated from deterministic scores | Removed score blending and AI calibration invocation. Grammar advice is stored separately. Smart Scan supplies optional suggestions without changing scores. Nonfiction fiction-only dimensions remain N/A. | Exact before/after browser score equality, static mutation guards, repeatability tests. Heuristic score validity remains unproven. |
| Storage integrity | Retained generation publication, serialized writes, stale-device rejection, snapshot safety copies and strict part/length checks. Added incomplete-state and legacy length rejection. Failed saves block Library navigation and sign-out. | Transaction/storage fixture tests and browser failure/retry tests. No cryptographic content digest; same-length corruption is not covered by length checks. Real Firestore/offline races remain open. |
| Browser manuscript privacy | No new manuscript-body or AI-result local/session storage writes in reviewed app paths. Removed title/chapter excerpt session telemetry. Cache is tab memory only. | Browser inspection and source guards. Preferences, document ID and operational metrics remain locally stored. Cloud manuscripts still intentionally persist. |
| Legacy privacy migration | Same-owner older drafts get an explicit recovery-archive download/removal dialog. Unknown-owner data is quarantined, not imported/exported. No automatic startup purge of a sole old draft. | Browser owned-recovery flow passes. “Leave untouched” deliberately retains older data pending a decision; the app does not promise that all historical local data vanishes automatically. |
| Security and grammar | Grammar uses authenticated proxy only; removed dormant direct provider fallback. Kept newer API auth, fail-closed routing, timeouts, production rate-limit configuration and account-deletion protection. | Existing API regression tests pass. Deployed IAM, Firebase Rules and provider configuration not certified. |
| Stripe and entitlement handling | Preserved merged plan validation, signed raw-body webhook handling, subscription metadata, idempotency, older-event handling and deletion tombstones. | Mocked API lifecycle regressions pass. No real checkout, webhook delivery or Billing Portal acceptance performed. |
| Editor reliability | Cancellable worker with timeout/retry cleanup; stale results invalidated on edits and genre changes; undo captures pre-input state and avoids full analysis clones. Removed pagination text from saved content. Immediate saves mark analysis metadata pending rather than saving old scores as current. | Real browser typing undo/redo, immediate export, genre round trip and exact no-edit source/save comparison; worker isolation tests. Rich formatting remains presentation-only in plain-text cloud storage. |
| Permanent audit | This document and `QA_INVENTORY.md` are committed engineering artifacts. | They supersede claims that PR 46 remains an open draft. |

## Header and product direction

- **Primary row:** identity and Library, manuscript title, Save, Intelligence, Tools, Account.
- **Secondary row:** selected genre, manuscript mode, word count and editing signals.
- **Tools menu:** export and optional external checks. **Account menu:** profile/preferences, plan/billing, help and sign-out.
- **Responsive behavior:** truncating long titles with full-title tooltip; mobile action row; keyboard/outside-click close; visible focus; light/dark styling. Existing control IDs and workflows are retained.
- **Authorship boundary:** analysis is advisory, selected genre is authoritative, and AI may not silently rewrite scoring. Prompts preserve intentional repetition, plain diction and genre-appropriate choices. No AutoCrit UI or proprietary engine was copied; superiority over AutoCrit has not been benchmarked.

## Verification performed

| Check | Result | Boundary |
|---|---|---|
| Syntax | 63 JavaScript files; zero failures | Application, API, functions, tests and tooling |
| Node suite | 47 passing test results; zero failures | Includes existing file-level suites; not 47 exhaustive feature certifications |
| Chromium workflow suite | Passed; zero uncaught page exceptions | Actual parsers, worker and DOM; mocked auth, Firestore and paid providers |
| Long-book browser path | 76,963 words / 30 chapters; exact text and cloud-fixture round trip | About 1.2 seconds on this sandbox in the final run; not a production SLA or representative literary benchmark |
| Whole-book retrieval | Beginning/middle/ending anchors and bounded context pass | Synthetic text, not a claim of exhaustive understanding |
| Visual review | Desktop 1440px, tablet 1024px, mobile 375px; light/dark; opened menus | Manual screenshots and interaction, not a complete accessibility certification |
| Build | Public bundle succeeds | Tests, fixtures, server/API source and private tooling excluded from normal production build |
| Dependency audits | Root and functions: zero reported vulnerabilities | Point-in-time npm audit, not a full security assessment |
| Functions import | Passes on Node 22 | Actual installed modules; no reminder delivery or cloud execution |

Browser flows include TXT/DOCX/text-PDF import, navigation tabs, grounded question, optional-check consent, score immutability, save, immediate export, snapshot restore, unsaved-text safety snapshot, failed-save navigation guard, recovery download, same-name drafts, long-book analysis, genre switching, mobile layout, homepage theme/navigation/auth modal and supporting-page rendering.

The optional `scripts/build-review-preview.js` creates an explicitly labeled Computer-only review entry using synthetic text and in-memory service fixtures. It is NOT part of `npm run build` or production CI deployment. Do not ship that preview entry or its fixture files to production.

## Outstanding priorities

### P0: release gates before promotion

- **Staging identity and authorization:** exercise actual email/Google/reset/revocation flows, owner isolation and protected entitlement fields against deployed Rules or an emulator. The current mocks do not execute Firestore Rules.
- **Billing/provider environment:** verify Stripe test-mode checkout, webhook signatures/retries/raw bodies, portal, cancellation/deletion, configured models, provider outages and production fail-closed rate limiting using isolated test accounts.
- **Data safety and rollback:** rehearse legacy migration on copies, actual cross-device conflicts, offline recovery, failed chunk publication, delete-while-editing and rollback. A failed cloud save leaves text only in the current tab; closing it can lose unsaved work. Export is the explicit fallback.

These are mandatory uncompleted acceptance checks, not claims that all these live services are currently broken.

### P1: product correctness before broad release

- **Scoring calibration:** build a consented, human-reviewed fiction/nonfiction corpus. Measure false positives, source offsets, genre suitability, repeatability and sensitivity to deliberate literary style. Scores such as insight, voice, reader buy-in and DNF risk must not be presented as validated measures of literary merit or real-reader probability.
- **Provider evaluation:** verify factual grounding, abstention, citation fidelity, prompt-injection resistance, whole-book coverage disclosure and voice preservation with real authorized provider responses. Model-call payload tests alone do not establish answer quality.
- **Format fidelity:** assess ToCs, unnumbered/multilingual chapters, review nesting, OCR rejection, footnotes, PDF reading order and real DOCX layouts. Rich-text styling is not currently a persistent document model; clarify that limitation before advertising a full word processor.
- **Device/accessibility acceptance:** keyboard-only, screen reader, zoom, contrast, reduced motion, Safari/iOS, Firefox and Android. Current screenshots and focus checks are not a full audit.
- **Performance envelope:** benchmark diverse 100k–200k-word manuscripts, the upload-size limit, many snapshots and large libraries. The synthetic 77k-word fixture is deliberately repetitive and does not approximate every author’s manuscript.

### P2: architecture and operability

- Extract editor state, cloud library, AI orchestration and renderer incrementally from the still-large `app.js`; move remaining synchronous open/restore/genre analysis onto the worker without losing state.
- Unify duplicate revision-summary and cloud-snapshot interfaces; remove dormant calibration and legacy-only branches after migration acceptance.
- Add cryptographic content digests, bounded snapshot retention and safe orphan-generation cleanup. Preserve backward compatibility and user-recoverable failure messages.
- Establish privacy-safe monitoring, backup restore drills, support reconciliation and clear deletion-tombstone retention policy.
- Replace heuristic entity/concept extraction gradually with evaluated, source-grounded components, not one unsupported whole-app rewrite.

### P3: refinement

- Continue simplifying the legacy sidebars and lower feature tabs around author tasks.
- Explain editing signals, N/A dimensions and detected-versus-missing evidence consistently across every view/export.
- Validate marketing, pricing, quota and privacy claims against the configured product before launch.

## Merge checklist

- [ ] Review this PR and its green independent CI result; do not merge automatically.
- [ ] Accept the header in the review preview and actual authenticated staging.
- [ ] Complete P0 staging gates with recorded evidence and rollback ownership.
- [ ] Approve a representative scoring/provider benchmark and honest product claims.
- [ ] Confirm normal production build does not contain review fixture entry files.
- [ ] Authorize merge separately from production promotion.

No live customer data was changed, no payment was made, and no production merge or promotion was performed as part of this audit.
