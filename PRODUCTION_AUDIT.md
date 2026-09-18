# AuthorScrolls Production Audit

Status: active audit on PR #46. Do not merge while P0/P1 core-flow items remain unverified.

## Architecture target
Manuscript -> structural understanding -> deterministic editorial analysis -> manuscript intelligence -> AI reasoning -> evidence-backed editorial actions.

Deterministic scores are canonical. AI may explain, critique, retrieve, and suggest, but must not silently mutate the same manuscript's score.

## Confirmed findings

| Severity | Area | Finding | Status |
|---|---|---|---|
| P0 | AI API | api/claude.js contained literal escaped-newline corruption in executable JavaScript, breaking the server proxy | Fixed |
| P0 | Writer's Room | grounded retrieval context was built but _callClaude ignored contextOverride and sent only the first 15k manuscript characters | Fixed |
| P1 | AI scoring | running AI could mutate deterministic Document Health scores, making identical text score differently after AI | Fixed |
| P1 | Whole-book AI | several book-level features analyzed only the opening slice rather than whole-book structural context | Fixed; browser validation pending |
| P1 | Parsing | review/toolkit chapter labels could inflate top-level chapter structure | Fixed heuristically; golden-manuscript validation pending |
| P1 | Nonfiction | DNF analysis used fiction action/dialogue/tension proxies on nonfiction | Fixed foundation; calibration pending |
| P1 | Persistence | autosave created full version snapshots repeatedly | Fixed |
| P1 | Privacy | manuscript bodies and analysis were persisted in localStorage and restored from it | Fixed; cloud is manuscript source of truth |
| P1 | Privacy | enhanced grammar fell back from server proxy to direct third-party LanguageTool calls from the browser | Fixed; authenticated proxy only |
| P1 | API abuse | grammar proxy accepted unauthenticated manuscript text | Fixed |
| P1 | Security | signed-in clients could read beta-code documents; client profile deletion could remove entitlement/billing state | Fixed in rules; deploy/rules test pending |
| P1 | AI routing | OpenAI route silently fell back to Claude if OpenAI was unconfigured, violating route/tier semantics | Fixed; fail closed |
| P1 | External calls | AI, grammar, and checkout provider requests lacked explicit request timeouts | Fixed |
| P1 | Branch integration | audit branch is diverged from gh-pages and was four commits behind in latest comparison | Open; reconcile before merge |
| P2 | Storage | manuscript save/version writes are multi-step and non-atomic; interruption can leave partial state | Open |
| P2 | Storage | small manuscripts may use parent text while large manuscripts reconstruct from chapter parts, creating dual read paths | Open |
| P2 | Rate limits | missing Redis falls back to per-instance memory, unsuitable as production enforcement | Open |
| P2 | Rate limits | quota is request-count based, not token/cost weighted | Open |
| P2 | Billing | webhook tier derives checkout tier from amount_total and handles completed/deleted, but subscription update/payment failure lifecycle needs hardening | Open |
| P2 | Billing | checkout uses ad-hoc price_data rather than immutable Stripe Price IDs | Open |
| P2 | Maintainability | app.js and analyzer.js remain large monoliths with high regression surface | Open / redesign |
| P2 | Retrieval | keyword retrieval has no quality benchmark; whole-book overview was added but needs golden queries | Open |
| P2 | Scoring | score provenance does not yet reach exact evidence/rules for every component | Open |
| P2 | Document model | parser is a flat heuristic model rather than a formatting-aware hierarchical manuscript AST | Open / redesign |
| P2 | Deployment | Firebase hosting security headers are weaker/different from Vercel; production hosting source must be explicit | Open |
| P3 | Tier cache | nominal tier cache still performs Firestore reads while cache is fresh | Open efficiency issue |

## Golden manuscript requirements
Do not commit the user's manuscript. Use sanitized structural fixtures derived from observed patterns.

The nonfiction golden path must prove:
- introduction/front matter is not counted as a numbered chapter;
- recap/review headings do not inflate main chapter count;
- workbook/toolkit labels such as a later Chapter 1 do not reset the main book structure;
- concepts, claims, personal evidence, recommendations, reflection questions, and actions retain chapter/evidence provenance;
- Writer's Room can answer opening, middle, and ending questions with evidence from the correct locations;
- nonfiction never receives fiction-only dialogue/show-vs-tell scores as if they were applicable;
- score is identical before and after AI analysis;
- save/reopen and explicit version restore preserve exact manuscript text.

A separate fiction fixture must prove multi-POV, character, relationship, timeline, continuity, and momentum behavior so nonfiction fixes do not regress novels.

## Merge gate
PR #46 remains draft until:
1. syntax checks and executable unit tests pass;
2. upload -> extraction -> analysis -> editor -> Intelligence Window -> save/reopen -> Ask -> version/restore passes in a real browser;
3. large-manuscript save/reopen is verified;
4. Firestore rules and API authorization tests pass;
5. billing lifecycle is tested with Stripe test events;
6. branch is reconciled with gh-pages without dropping either side's fixes;
7. no P0/P1 core-flow defect remains open.
