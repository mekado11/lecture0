# AuthorScrolls for iOS

A thin native shell around the web app. The web app at `https://authorscrolls.com` stays the
single source of truth; this project adds what a web view cannot do for itself: saving exported
files, opening outside links in an in-app Safari view, native alerts, an offline screen, and a
status bar that follows the page theme.

Generated with [XcodeGen](https://github.com/yonaskolb/XcodeGen) so the project file is
reproducible and never hand-edited.

## Build

```bash
brew install xcodegen          # once
cd ios
xcodegen generate              # writes AuthorScrolls.xcodeproj
open AuthorScrolls.xcodeproj
```

In Xcode, select the **AuthorScrolls** target → Signing & Capabilities → choose your team.
The bundle identifier is `com.authorscrolls.app` (change it in `project.yml` if that is taken).
Associated Domains (for opening `authorscrolls.com` links straight into the app) is listed in
`AuthorScrolls.entitlements`; it needs an `apple-app-site-association` file on the site before
it works, and can be removed from the entitlements until then.

Requirements: Xcode 16 or newer, iOS 17 deployment target. This was written on a machine
without Xcode, so the first build on your Mac is the first compile; the Swift is small and
deliberate, but expect to fix any warnings the current SDK raises.

## Devices

- **iPhone 12 and later**: the iOS 17 floor covers every one of them. Nothing in the code
  checks a model name or a screen size; the layout follows the size class and the safe area.
- **iPad** is allowed (`TARGETED_DEVICE_FAMILY 1,2`). It is also the best rehearsal for a
  folding phone (below).

### A folding phone

Nothing is written for a specific fold device, because the reliable facts are the general
ones: the window can change size and aspect while the app is running, a hinge may be
reported through the safe area, and the two halves may be surfaced to web content as two
viewport segments. The shell and the web app are built on those facts:

- No orientation lock, `UIRequiresFullScreen` off, every orientation listed. A fold, a
  rotation or a split-view resize arrives as a scene size change and Auto Layout re-lays the
  web view. No window or device dimension is cached anywhere.
- The web view is pinned to the safe-area layout guide, so a notch, the home indicator and any
  hinge inset the system reports stay outside the page. The window is painted the page's
  background colour (reported by the page itself), so those areas match the theme.
- The web app's panels follow media queries and a settled `resize`, so the three-pane
  workspace re-flows when the window changes without a reload. When the browser exposes two
  horizontal viewport segments, the navigator takes the left half and the manuscript the
  right, so the fold runs between panels rather than through text. Heights use `100dvh`.
- The share sheet is presented with a popover anchor, which a regular-width window requires.

Rehearse before you have the hardware: run on iPad in Split View and Stage Manager, drag the
divider while a manuscript is open, and rotate. Those are the same code paths a fold exercises.

## What the shell handles

| Web action | In Safari | In the shell |
|---|---|---|
| Export manuscript (.doc) | browser download | the page calls `AuthorScrollsNative.saveFile`, the shell writes a temp file and presents the share sheet |
| Link off `authorscrolls.com` (checkout, help) | same tab | in-app Safari view (`SFSafariViewController`) |
| `confirm()` / `alert()` / `prompt()` | browser dialogs | native alerts (the app uses `confirm` before AI calls) |
| Google sign-in | popup | hidden by CSS (`html[data-native=ios]`); popups cannot open in a web view. Email sign-in works unchanged. |
| Load failure / offline | browser error page | native offline screen with Retry |
| Page theme | n/a | page posts its background; status bar and window colour follow |

The bridge is `native-bridge.js` at the web root. It is inert in a browser.

## App Store notes

- **Guideline 4.2 (minimum functionality).** A web view shell can be rejected as "a website
  in a wrapper". What argues for this one: the analysis engine runs on-device in the web view
  (not a remote page of results), files are exported through the system share sheet, and the
  app works for reading and editing a saved manuscript. Say so in the review notes.
- **Privacy manifest** (`PrivacyInfo.xcprivacy`) declares no tracking and lists the data the
  account holds (email, user content). Review it against the privacy policy before submission.
- **Export compliance** is set to exempt (`ITSAppUsesNonExemptEncryption = false`): the app
  only uses HTTPS.
- **Sign in with Apple** is not required, because the shell offers only email sign-in
  (first-party). If Google sign-in is ever enabled in-app, Apple sign-in becomes mandatory.
- **Payments.** Checkout opens Stripe in the in-app Safari view. Subscriptions bought that way
  unlock features that are also sold on the web, which Apple reviews case by case for
  "reader" style apps; be ready to either justify it or hide the upgrade path in the shell.

## Test checklist

1. iPhone 12 mini simulator (375 pt, the narrowest supported): sign in, open the demo, scroll
   the three panels, export, run optional checks (expect the native confirm).
2. iPhone 15 Pro Max: rotate while a manuscript is open; the panels re-flow; no clipped header.
3. iPad: Split View at 1/3, 1/2, 2/3; Stage Manager resize while the editor is open.
4. Airplane mode on launch → offline screen → Retry after reconnecting.
5. Tap a Help link → in-app Safari view → Done returns to the manuscript unchanged.
6. Light and dark theme on the marketing pages: the status bar text flips with the page.
