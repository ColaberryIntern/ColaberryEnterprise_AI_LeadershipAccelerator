# Session CC-20261115-w8q3 — Enterprise site v5 model intake

Branch: `workstream/enterprise-home-demo-pilot`
Worktree: `C:\Users\ali_m\acc-ent-pricing-wt`

## Context

Ali: "Look in my downloads folder and get this file colaberry-enterprise-site".

## What landed

- [x] Install the v5 site model under version control
  - Date: 2026-11-15
  - Session: CC-20261115-w8q3
  - What changed: added `docs/enterprise-site-v5/index.html` (byte-identical to Ali's
    download, md5 `8fc9d341ff16009f3c29be510b3bf901`) and `README.md` recording
    provenance, the measured route table, the artifact's own site map, and where its
    assumptions diverge from this repo's real route tree.
  - Verification: md5 match against the source file in Downloads; all 11 hash routes
    rendered via Playwright (`channel: msedge`) with **0 page errors, 0 horizontal
    overflow, 8/8 images loaded on every route**; live "before" pages captured from
    enterprise.colaberry.ai, all HTTP 200.
  - Notes: no application code touched this session. Variant A for the home band
    remains uncommitted in this worktree (4 modified files), still awaiting Ali's letter.

## Findings worth keeping

1. **v5 supersedes v4 in scope.** v4 is a single-page (home) model; v5 is the whole
   site — 10 pages plus a site-map page that is itself an instruction list
   (13 marketing pages → 10, with required 301 redirects).

2. **The "5 service pages → 3" merge is cheaper than the artifact implies.** Those five
   are data rows in `frontend/src/config/v2Services.ts` behind one dynamic route
   `/services/:slug` → `ServiceDetailV2`. Only `/accelerator` and `/lab` are real
   separate page components that a merge would retire.

3. **`/pricing` conflicts with what shipped yesterday.** PR #4043 (merged `482675229`)
   kept the license ladder on `/pricing` because `pricing.team` and `pricing.department`
   are approved in the claim registry for that route only. The v5 pricing page has no
   prices at all ("Why are there no prices on this page?"). Adopting it removes approved
   prices from the site. Raised to Ali, not resolved here.

4. **PR #4043 is deployed, not merely merged.** Live `/pricing` returns H1 "Three
   services. Simple terms for each." — that is the merged copy. An earlier note in this
   workstream recorded it as merged-but-not-deployed; that was wrong.

5. **Variant A is corroborated.** The home band built as variant A, "Three steps. No
   big-bang project.", appears verbatim in the v5 home page at position 4.

## Measured gap, live vs model (1280px, 2026-11-15)

| Page | Live | Model |
|---|---|---|
| Home | 12 sections, 10,100px | 7 sections, 7,713px |
| Services | 2 sections, 5,896px | 5 sections, 4,978px |
| How it works | 4 sections, 2,442px | 6 sections, 5,675px |
| Platform | 12 sections, 14,450px | 4 sections, 5,863px |
| Pricing | 6 sections, 7,045px | 5 sections, 3,960px |

## Review artifact

`C:\Users\ali_m\AppData\Local\Temp\claude\73401440dc0fb885\c1bb14de-8903-465a-a8ad-17543f0a94a9\scratchpad\site\V5_REVIEW.html`
— before/after for all 10 changed pages, validated in-browser (16/16 images decode,
0 errors, 0 overflow), opened for Ali.

## Decided

Ali, 2026-11-15: **adopt everything except `/pricing`.** Take the ten-page structure,
the Build/Guide/Train merges, the new Book and Book-a-demo-pilot pages, and the 301
redirects. `/pricing` stays exactly as PR #4043 shipped it, license ladder intact.

## Hard constraints on the adoption

1. **`/proof` is not to be touched.** Ali, 2026-11-15: "Make sure you don't copy over
   Proof page". The v5 model agrees ("Keep as is, per your instruction"), but the model
   is not the authority here, Ali is. `/proof` keeps rendering `StoriesV2` and keeps its
   nav, home and footer links. This gets a route guard test rather than a note, because
   a note does not fail a build.
2. **`/pricing` is out of scope** for the whole adoption, per the decision above.
3. Also untouched: `/free-workspace`, `/try`, `/demo`, `/privacy`. Segment pages
   (`/higher-education`, `/enterprise`, `/workforce`, `/ecosystem`) are phase 2 in the
   model's own plan and are not in this round.

## Phase plan (one PR per phase)

| Phase | Scope |
|---|---|
| 1 | Ship the home demo-pilot band (variant A), already built and corroborated by v5 |
| 2 | Services: merge 5 `v2Services.ts` slugs into Build/Guide/Train, rewrite the `/services` chooser, 301 the old slugs and `/accelerator` |
| 3 | `/book` — new page |
| 4 | `/demo-pilot` — new page replacing `/contact` and `/lab`, repoint primary CTAs, 301s |
| 5 | Home rewrite, 12 sections to 7 |
| 6 | `/platform` rewrite, 12 sections to 4 |
| 7 | `/how-it-works` rewrite |
