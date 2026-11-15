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

---

# Adoption executed, 2026-11-15

Ali: "Let me know when it's done - don't want to do the back and forth."

One branch, one commit per phase, one PR. Six PRs off main would all have
edited `App.tsx` routes and conflicted with each other, which is more back and
forth, not less.

| Phase | Commit | What landed |
|---|---|---|
| 1 | `949ab3991` | Home demo-pilot band (variant A) + v5 model installed. **Merged via PR #4051.** |
| 2 | `5f3179bc4` | Five engagements become Build/Guide/Train; redirects; `/proof` guard |
| 3 | `3a9da587b` | `/book` |
| 4 | `8c398b879` | `/demo-pilot` replaces `/contact` and `/lab`; CTAs repointed |
| 5 | `c30e153b0` | Home rewrite, 12 sections to 10 |
| 6 | `523c65767` | `/platform`, 12 sections to 9 |
| 7 | `2417dd1d7` | `/how-it-works`, the one page the model grows |

## Measured, every route, in a real browser (1280px)

All 17 routes checked: **0 page errors, 0 horizontal overflow, every redirect
landing on its intended page.**

| Page | Before | After | Model |
|---|---|---|---|
| Home | 12 sec / 10,100px | 10 / 7,853px | 7 / 7,713px |
| Services | 2 / 5,896px | 4 / 3,556px | 5 / 4,978px |
| How it works | 4 / 2,442px | 8 / 6,306px | 6 / 5,675px |
| Platform | 12 / 14,450px | 9 / 11,825px | 4 / 5,863px |
| Pricing | 6 / 7,045px | 6 / 7,004px | out of scope |

Redirects confirmed live: `/contact` and `/lab` to `/demo-pilot`,
`/accelerator` to `/services/train`, all five retired service slugs to their
absorbing service.

## Deviations from the model, each deliberate

1. **`/pricing` untouched**, per Ali. Only one word changed on it: "the five
   engagements" became "the three services", because the services merge made
   that sentence false on a page that links straight to the three. No price,
   claim or offer touched.
2. **`/proof` untouched**, per Ali, and now guarded by a mutation-tested route
   test rather than an intention.
3. **Segment doors kept on the home page.** The model drops them and defers the
   segment pages to a later phase, but `/higher-education` is the C2.5
   beachhead and removing its only entry point would orphan it. This is why
   home is ten sections and the model's is seven.
4. **`/platform` does not reach the model's 5,863px.** The model draws its
   surfaces as small mock screenshots; three of the four already existed here
   carrying governed, claim-reviewed content. The structure is the model's; the
   substance stays.
5. **The five-stage band stays on `/how-it-works`.** The C2.2 audit found two of
   the five have no platform capability and each says so. The model has no
   equivalent; dropping it would retire an audited honesty.
6. **Consent carried onto `/demo-pilot`.** The model's form has none. `/contact`
   always required it. Pinned by test: present, labelled, bound to its input,
   never pre-ticked.
7. **The "95% of AI pilots fail" statistic is never stated bare.** The model
   uses it as a standalone subtitle; the registry's `research.95pct` is
   NEEDS_VERIFICATION with no approved routes. `/book` renders the VERIFIED
   attributed form through `<Claim>` instead.
8. **"Start Free" kept in the nav** though the model's nav omits it: it is the
   only entry point that costs a visitor nothing.

## Two guards that were silently broken, now fixed

- **The home demo-pilot band's no-figure test** sliced from its own heading to
  `cbv2-services-title`. Replacing the five-engagement band removed that
  anchor, `indexOf` returned -1, and `slice(start, -1)` widened the slice to the
  rest of the page, so the guard was reading the book citation's "95%" as if it
  were in the band. Now bounded by the band's own closing tag, with assertions
  on both edges.
- **C5.1's "exactly one path to enquiry"** matched on `/contact` and so found
  zero once CTAs were repointed. Rewritten to its intent: at least one enquiry
  link, and no enquiry link pointing anywhere but `/demo-pilot`.

## Still outstanding

- **`/book` needs two inputs from Ali**: Ram's two-to-three sentence bio from
  approved materials, and the purchase or download link. The model has literal
  placeholders for both. Neither was invented.
- Components unrouted but not deleted: `EngineModel`, `CapabilityOS`,
  `TwoExperiences`, `ArchitectExperience`, `BuildPipelineSection`,
  `HeroServicesV8`, `AcceleratorV2`, `ContactPage`, `OpportunityLabV2`. Check
  what else imports each before removing the files.
- `publicNextOpenHouseJs.test.ts` fails in this branch and in its base. It is
  OH-3's own test, from another workstream, and CI's jest config excludes it
  (PR #4051 passed Frontend unit tests with it present). Not fixed here.

## A note on how this shipped

PR #4051 was opened for phase 1 and Ali merged it while phases 2 to 7 were
still being built. The later commits were pushed to the same branch after that
merge, which is how work goes missing: the branch carries them, the merged PR
does not, and nothing tracks them. They were rebased onto current main and
opened as a separate PR. Phase 1 is already on main.
