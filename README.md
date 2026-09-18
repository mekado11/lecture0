# AuthorScrolls

A manuscript workspace for authors, with browser-based structural analysis and optional provider-backed writing assistance. The homepage uses a photographic parchment scroll with accessible live text rather than text embedded in an image.

## Development

Node.js 22 is required.

```sh
npm ci
npm ci --prefix functions
npm run build
npm run verify
npx playwright install --with-deps chromium
npm run test:browser
npm start
```

Open `http://localhost:3000`. Local development uses the real API authorization boundary; automated browser tests use isolated fixtures instead.

## Architecture

| Component | Location |
|---|---|
| Scroll homepage, responsive navigation, lazy-loaded sign-in | `index.html`, `landing.css`, `landing-init.js`, `assets/` |
| Editor and library | `app.html`, `app.js`, `styles.css`, `styles-mobile.css` |
| Shared evidence pipeline | `intelligence-pipeline.js`, `*-intelligence.js`, `manuscript-parser.js` |
| Contextual book navigator and snapshot interface | `intelligence-window.js` |
| Generation-based manuscript persistence | `storage.js` |
| Authenticated Vercel endpoints | `api/` |
| Firebase opt-in reminders and retired legacy proxy | `functions/` |
| Public-only build and regression scripts | `scripts/` |
| Pull-request checks | `.github/workflows/verify.yml` |

TXT, DOCX and text-based PDF imports are supported. Scanned PDFs need OCR before import; complex PDF reading order is not guaranteed. Heuristic scores and model suggestions are editorial aids, not factual or publication guarantees.

## Release review

See `RELEASE_READINESS.md` for implemented fixes, test scope and unresolved launch gates. See `DEPLOY.md` for environment configuration, staging, migration and rollback instructions.

The default branch is `gh-pages`. Vercel is the primary full application host; static hosting alone cannot provide authenticated APIs. Do not infer production readiness from a passing unit test suite.
