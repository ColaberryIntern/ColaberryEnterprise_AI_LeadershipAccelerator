# CC-20261116-v5r2: every remaining public page rebuilt to the model

Ticket: W14, Basecamp list 10515008393 (bucket 47502609); follows W12 (Home, PR #4127).
Asked by Ali on 2026-11-16: "Continue with all the pages". Mid-way: "Something is off about the
services page. Do an audit on that. Also build, guide, train are old pages."

## Scope

/services, /services/build, /services/guide, /services/train, /how-it-works, /platform, /book,
/demo-pilot, /pricing. Pricing is layout and styling only, because W4 (pricing) is still open.
It has no price, term, plan name or offer wording changed.

## Method (same as Home)

`handoff-enterprise-site-v5/review/audit.js` pairs every part of a model page with its live
counterpart and compares computed style. It runs on a local production build
(`LIVE=http://localhost:4191`), then on all ten pages, and reports a check that passed before and
fails after as a regression.

The work ran in three groups on one branch, each read as images at 1440 and 390.

`breaks.js` is new. It compares where every h1/h2 breaks its lines, model against build. The
audit's 12% width tolerance had hidden a site-wide difference, described below.

## Measured (local production build against the model)

| Page | Production | This branch |
|---|---|---|
| Home | 1,789 / 1,799 | 1,789 / 1,799 |
| Services | 479 / 645 | 811 / 817 |
| Build | 489 / 684 | 1,057 / 1,057 |
| Guide | 475 / 669 | 1,081 / 1,081 |
| Train | 336 / 491 | 866 / 868 |
| How it works | 663 / 792 | 1,266 / 1,269 |
| Platform | 370 / 504 | 812 / 814 |
| The book | 286 / 356 | 535 / 537 |
| Demo pilot | 210 / 238 | 261 / 262 |
| Pricing (layout only) | 230 / 294 | 444 / 483 |

Regressions: none on any page in any group. The /pricing button-shadow regression from #4127 is fixed.

Line breaks: 35 of 35 shared titles break where the model breaks them, at 1440 and at 390.

## "Something is off about the services page"

Most of it was that Ali was looking at production, which is still the old site. The rebuild is on
this branch only.

The line-break check then found a real, site-wide difference:
- The content column was 1,232px (1280 max, 24px sides); the model's is 1,144px (1200 max, 28px
  sides).
- Titles were set to `text-wrap: balance`; the model never balances.
- The home hero split 1.05/.95 against the model's 1.15/.85, with tracking -.045em against -.035em.

All of this is fixed in the shared layer and held by `publicModelMeasure.test.ts`.

The other public pages were checked after the width change and show no sideways scroll and no page
errors: proof, stories, a story, accelerator, demo, lab, workspace, contact and privacy.

## Shared pieces added

`fidelityV5.css` gained these sections:
- heroes (light chooser, light page hero, dark service hero, dark platform hero), breadcrumb and
  labels;
- comparison table, FAQ cards, step cards and timeline;
- the contrast pair, other-services links, the rollout board, surfaces, the book page, the demo
  pilot form and the pricing layout.

New components: `ModelGlyph.tsx`, `FaqCardsV5.tsx`, `ServiceVisualsV5.tsx`.

Deleted: `bookV2.css`, `demoPilotV2.css`.

## Deliberate misses

- No "$0 to start" or "$0 to get started" anywhere (no prices on service pages; "$0" is "free").
- Train's button keeps "Create a free account" (model: "Start free").
- "Sample data" rather than the model's "Illustrative" wording.
- The book's bare "95% of AI pilots fail" stays out (claims registry).
- Pricing W4 copy: the "$0" tags, "What you are paying for", "About the numbers", the model's
  FAQ answers.
- The closing band uses a comma where the model has an em dash (house style).

## Decisions for Ali (flagged, not changed)

1. Service card wording: keep today's longer copy, or use the model's shorter wording on Home,
   Services and Pricing?
2. How it works keeps the five-stage list (Learn to Manage), which the model does not have.
3. Detail pages lose their photos, and Train loses its FAQ, because the model has neither.
4. Platform loses the "workspace is free" band, and the "See Build/Guide/Train" links in its dark
   band.
5. The book page's "Get your copy" card offers the book to leaders who book a demo pilot (model
   copy). Is that offer real?
6. "Your role" on the demo pilot form is collected but not sent with the lead (already so before).

## Found, out of scope

/try and /start scroll sideways on a phone (584px at 390). It is the same on production; this
branch does not touch it.

## Verification

- Public-site suites: 825 tests. `governmentHeaderParity` fails locally only, because this checkout
  gave the government file Windows line endings. It passes 8/8 with Unix endings.
- Backend copy lints: 334/334.
- `CI=true` build: no warnings.
- tsc: checked with a planted control error.
- Demo pilot form, with every write stubbed: the same keys post to `/api/leads`, and empty-submit
  errors are unchanged.
