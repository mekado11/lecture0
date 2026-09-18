# Workspace and engine verification inventory

This inventory separates code-level, browser-fixture, real local-emulator and live-service evidence. No live customer manuscript is a fixture.

| User-visible claim / control | Functional check | Visual state / evidence |
|---|---|---|
| Quiet, useful header | Existing action IDs retained; Tools and Account open/close; Escape returns focus | Desktop long title; mobile 375px; tablet; light theme |
| Save and Library | Save, snapshot, navigation flush; failed write blocks navigation | Saved / Not saved status, explicit failure reason and mobile-fit export guidance; unchanged open draft on failure |
| Export | Export immediately after typing | Download contains new text before analysis debounce |
| Genre | Fiction/nonfiction round trip; text unchanged | Concepts/Evidence instead of fictional-character tabs |
| Intelligence | Open, close, source navigation, question with retrieved evidence | Drawer open and settled closed; no header occlusion |
| Optional checks | Consent; authenticated mock requests; scores exactly unchanged | Advice appears separately; errors remain visible |
| Typing and undo | Input, undo, redo, undo | Text restored, no added pagination text |
| Imports | Real TXT, DOCX and text-PDF parsing | Manuscript visible with correct headings |
| Long book | 30 chapters / 76,963 synthetic words; worker, render and cloud round trip | Opening remains responsive; genre switches preserve text |
| Whole-book coverage | Opening, middle and final anchors; strict context budget | Explicit sampled-context disclosure, not exhaustive-reading claim |
| Legacy migration | Download archive then explicit removal; no startup purge | Authenticated recovery dialog; unknown owner cannot export |
| Versions | Preview, queued restore, safety snapshot of unsaved edits, duplicate-restore rejection, lock released on failure | Editing locked only while restoring; export remains available during a stalled restore; previous text unchanged on failure |
| Context freshness | Genre/context change invalidates an in-flight answer even when text is identical | Old answers and restore context do not carry into another manuscript |
| Integrity | Same-length draft/snapshot corruption, missing digests, malformed/uncommitted parts, ambiguous acknowledgement | Corruption rejected; published generation never deleted by failure cleanup; older drafts still readable |
| Homepage/supporting pages | Navigation, themes, auth modal, CDN failure | Desktop/mobile homepage and supporting-page smoke screenshots |

## Exploratory and failure checks

- Rapid edit or genre change must invalidate older worker results; timeout must terminate and allow retry.
- Cloud failure must retain the tab's text, show Not saved, and prevent Library navigation.
- Long titles and opened menus must fit 375px without hiding the writing area.
- Old local data is never silently imported into another account; recovery copies require an explicit removal decision.

## Explicit exclusions

The eleven checks documented in `scripts/emulator/README.md` now exercise real local Auth/Firestore services and repository Rules: sign-in/reset/revocation, ownership, multi-part saves, snapshots, concurrent clients, missing parts, same-length corruption, offline stale edits, deletion conflicts and current AI access. The client SDK is pinned to the version used by the app. This closes the earlier mocked-only Rules/transaction evidence gap, not live-service acceptance.

No separate Firebase project is required for this local work. Later live acceptance must use explicitly authorized synthetic accounts and scoped operations; no other user project is repurposed.

Live Firebase Auth, deployed IAM/Rules, Google OAuth, real email delivery, actual multi-browser/device offline recovery, paid-provider editorial quality, production Redis, Stripe test-mode lifecycle, Safari/Firefox, full accessibility conformance, and a representative human-reviewed scoring corpus remain uncertified. Billing was excluded from this continuation, not marked complete.
