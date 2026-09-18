# Workspace and engine verification inventory

This inventory separates code-level, browser-fixture and live-service evidence. No live customer manuscript is a fixture.

| User-visible claim / control | Functional check | Visual state / evidence |
|---|---|---|
| Quiet, useful header | Existing action IDs retained; Tools and Account open/close; Escape returns focus | Desktop long title; mobile 375px; tablet; light theme |
| Save and Library | Save, snapshot, navigation flush; failed write blocks navigation | Saved / Not saved status; unchanged open draft on failure |
| Export | Export immediately after typing | Download contains new text before analysis debounce |
| Genre | Fiction/nonfiction round trip; text unchanged | Concepts/Evidence instead of fictional-character tabs |
| Intelligence | Open, close, source navigation, question with retrieved evidence | Drawer open and settled closed; no header occlusion |
| Optional checks | Consent; authenticated mock requests; scores exactly unchanged | Advice appears separately; errors remain visible |
| Typing and undo | Input, undo, redo, undo | Text restored, no added pagination text |
| Imports | Real TXT, DOCX and text-PDF parsing | Manuscript visible with correct headings |
| Long book | 30 chapters / 76,963 synthetic words; worker, render and cloud round trip | Opening remains responsive; genre switches preserve text |
| Whole-book coverage | Opening, middle and final anchors; strict context budget | Explicit sampled-context disclosure, not exhaustive-reading claim |
| Legacy migration | Download archive then explicit removal; no startup purge | Authenticated recovery dialog; unknown owner cannot export |
| Versions | Preview, restore, safety snapshot of unsaved edits | Restored text and confirmation |
| Homepage/supporting pages | Navigation, themes, auth modal, CDN failure | Desktop/mobile homepage and supporting-page smoke screenshots |

## Exploratory and failure checks

- Rapid edit or genre change must invalidate older worker results; timeout must terminate and allow retry.
- Cloud failure must retain the tab's text, show Not saved, and prevent Library navigation.
- Long titles and opened menus must fit 375px without hiding the writing area.
- Old local data is never silently imported into another account; recovery copies require an explicit removal decision.

## Explicit exclusions

Live Firebase Auth, deployed Firestore Rules, real cross-device/offline transactions, paid-provider editorial quality, Stripe test-mode lifecycle, Safari/Firefox, full accessibility conformance, and a representative human-reviewed scoring corpus are not certified by browser fixtures. Preserve these as production gates.
