# STORY_STUDIO_PLAN

**The staged plan from the Checkpoint A discovery to a packaged, repeatable Story System.**

Status: PLAN. Written at Checkpoint B, before any Checkpoint B code was written. This
document owns two jobs:

1. **Reconcile** `STORY_FORMAT_V1.md` and `SURFACE_LENS_MODEL.md`, which were written
   concurrently, overlap on the four-surface model, and contradict each other in four
   places (section 1).
2. **Sequence** the work through Checkpoints B, C, D and E, honouring the product owner's
   order: *make Enterprise beautiful -> prove the lens theory -> build Story Studio ->
   harden -> package as a skill* (sections 2 to 6).

It is a plan, not a specification. The specifications are the four Checkpoint A documents:
`STORY_STUDIO_CURRENT_STATE.md`, `STORY_ASSET_MODEL.md`, `STORY_FORMAT_V1.md`,
`SURFACE_LENS_MODEL.md`. Where this document and one of those disagree, section 1 says
which wins and why.

Companion: `STORY_STUDIO_TEST_PLAN.md`.

---

## 1. Reconciliation

Four genuine conflicts, plus two inherited from the sibling pair. Each is resolved, and the
resolution names the mechanism rather than splitting the difference.

### C-1 — Three different band orders are asserted for the Enterprise lens

| Source | Order after `hero` |
|---|---|
| **Shipped**, verified live 2026-08-26 against `GET /api/public/case-studies/ai-systems-architect-training-system` | `situation, build, architecture, measurement, roadmap, contributors, artifacts, repositories, cta` |
| `STORY_FORMAT_V1.md` §5 "The locked rhythm" | situation, figure, decision, quote, **architecture**, media, **build**, measurement, quote, roadmap, contributors, artifacts, repositories, cta |
| `SURFACE_LENS_MODEL.md` §3.1 Enterprise | situation, **measurement**, **architecture**, roadmap, proof |

Three orders, and no two agree on where `architecture`, `build` and `measurement` sit
relative to each other.

**Resolution. `SURFACE_LENS_MODEL.md` §3.1 is authoritative for order; `STORY_FORMAT_V1.md`
§5 is authoritative for tone.**

Order is by construction a property of the profile — `sectionOrder`
(`caseStudySurfaceProfiles.ts:51`), consumed at `storyDetailV2Model.ts:139`. Ordering is
therefore the lens layer's decision, and `STORY_FORMAT_V1.md` §5 says so itself in its own
second invariant: *"Order comes from `surface.sectionOrder`, never from the page. The rhythm
above is therefore a profile default, not a hardcoded sequence."* Read that way, §5's table
is a **tone grammar** — which ground each band sits on, alternating prose and visual — and
its column headed "Order" is illustrative. That is how this plan reads it, and section 2
implements only the tone half at Checkpoint B.

**Consequence, and it is a hard one: Checkpoint B changes no band order at all.** Two
reasons.

- `sectionOrder` is a single constant shared by all four profiles. Editing it edits four
  lenses at once, which is Checkpoint C work by definition.
- **The pilot record has a duplication that the LENS order would make worse.** Verified
  live: `heroMetrics[0]` and `measurement.metrics[0]` are the same metric — same label
  (*"AI architecture competencies, each verified separately"*), same `valueDisplay`, same
  `methodology`, same two `limitations`. That is not a defect, it is the deliberate
  invariant pinned by `storyDetailV2HeroInvariant.test.ts`: the hero list is a `filter` of
  the measurement list, so a suppressed hero figure always survives somewhere. But it means
  moving `measurement` directly beneath the hero prints the same metric card twice inside
  one screen. **Resolving the hero/measurement duplication is a precondition of the
  Enterprise order change, and it is recorded as C-2 in the Checkpoint C entry criteria.**

### C-2 — Two different mechanisms for a per-band heading

- `STORY_FORMAT_V1.md` §4 Band 2: *"The wire already carries `situation.heading`, and
  `StorySectionList.tsx:72-74` already prefers it over the constant... Making the surface
  profile supply that string is the entire cost."* This reads as: keep the per-record
  channel, have the server fill it from the profile.
- `SURFACE_LENS_MODEL.md` §5.1: add `sectionHeadings: Partial<Record<CaseStudySectionKey,
  string>>` to the profile, consume it in `StorySectionList` ahead of `SECTION_HEADINGS`,
  and *"the per-record heading should be removed rather than left as a second,
  never-varying mechanism."*

**Resolution. `SURFACE_LENS_MODEL.md` §5.1 wins.**

`situation.heading` is a field on the **record**. A record field cannot vary by surface —
one snapshot serves all four lenses, which is the founding decision of the lens model
(`SURFACE_LENS_MODEL.md` §1). Routing a surface-scoped string through a record-scoped field
would make the wire lie about what the value is scoped to, and would leave the next reader
unable to tell whether `situation.heading` means "this record's heading" or "this surface's
heading for this record". One heading channel, on the profile.

`STORY_FORMAT_V1.md` §4 Band 2's cost estimate survives intact — *"no component change at
all"* is true of the LENS mechanism too.

**Consequence for Checkpoint B: do not touch headings.** Leaving `situation.heading` exactly
as it is means Checkpoint B ends in a clean state rather than a half-migrated one, and
Checkpoint C deletes the dead path in one move.

### C-3 — Two disjoint "recommended sequences", each presented as the order of work

`STORY_FORMAT_V1.md` §8 lists ten items ordered by value per unit of risk, led by CSS and
projection work. `SURFACE_LENS_MODEL.md` §8 lists ten items led by the admin preview
switcher. They share three items and interleave differently. A builder following both does
the shared items twice, or does lens work believing it is format work.

**Resolution. They are not competing sequences; they are two checkpoints, and one item
belongs to neither.**

| Source item | Goes to |
|---|---|
| FORMAT §8 #1 move shared V2 primitives into `publicV2.css` | **B** |
| FORMAT §8 #2 project `situation.constraints` + `.goals` | **B** |
| FORMAT §8 #3 tone alternation | **B** |
| FORMAT §8 #4 move facts + indicators out of the hero | **B** |
| FORMAT §8 #6 `headingLevel` on `CaseStudyArtifacts` | **B** |
| FORMAT §8 #8 project `architecture.dataStores` | **B** |
| FORMAT §8 #9 "what we learned" via `limitations` | **B** |
| FORMAT §8 #5 surface-supplied section headings = LENS §8 #4 | **C** |
| LENS §8 #1-3 preview switcher, status line, draft ahead/behind | **C** |
| LENS §8 #5 differentiate `sectionOrder` | **C** |
| LENS §8 #6 `requiredSections` attribution floor | **C** |
| LENS §8 #7 remove `emphasis` from the wire | **C** |
| FORMAT §8 #7 authored figure placement = LENS §8 #8 `leadArtifactTypes` | **D** |
| FORMAT §8 #10 pull-quote band | **D** |
| LENS §8 #9 publication editor | **D** |
| LENS §8 #10 honour a surface param on the public API | **E** |

The two placement items (FORMAT #7, LENS #8) move to D rather than B or C because an
authored placement hint with no authoring surface is a field only direct SQL can write —
which is the exact condition `SURFACE_LENS_MODEL.md` §2.1 describes as the reason the two
publication override columns are useless today.

### C-4 — What a "lens" currently is

`STORY_FORMAT_V1.md` §5 invariant 2 describes the profile-default mechanism as *"exactly
what makes it reusable across the four lenses"*, which reads as though the lens layer
already carries structural difference. `SURFACE_LENS_MODEL.md` §2 measures it and reports
the opposite: `sectionOrder`, `hiddenSections` and `defaultSort` are **identical in all
four profiles**, `emphasis` has zero consumers in `frontend/src`, and *"today a surface
varies by five strings and a CTA"*.

**Resolution. `SURFACE_LENS_MODEL.md` §2 is the measured statement and is correct.
`STORY_FORMAT_V1.md` §5 is describing the target.** Both are true of different times. This
plan states it once, plainly, so that nobody reads FORMAT §5 as a description of today:

> **Today a lens is four CTA strings, a hero triple, a brand label and a dead `emphasis`
> array. Nothing structural varies. Checkpoint C is the checkpoint that makes the word
> "lens" mean something, and until it lands, any claim that the lens model is "proved" is
> a claim about a mechanism that has never been given two different values.**

### C-5 — Inherited: "three additions", four rows

`STORY_ASSET_MODEL.md` §4 is headed *"The three additions, in dependency order"* and §1 and
§5 both say three assets do not exist, but the table lists four numbered rows. Row 1
(artifact promotion) is simultaneously described as *"a gap, not a feature"*.

**Resolution. Artifact promotion is a prerequisite fix, not an addition.** The three
additions are quote, external reference and chart. The fix is item D-0 in section 5 and it
gates every image-bearing feature.

### C-6 — Inherited: a citation conflict about where artifacts are created

`STORY_STUDIO_CURRENT_STATE.md` §5 and `STORY_ASSET_MODEL.md` §2.6 place the single
`create` on `case_study_artifacts` at `caseStudySyncSources.ts:253`; appendix A-3 places it
at `caseStudyEvidenceSource.ts:369`.

**Resolved by reading the source. A-3 is right.** The only non-test `CaseStudyArtifactModel.
create(` in `backend/src/services/caseStudy/` is at
`backend/src/services/caseStudy/caseStudyEvidenceSource.ts:369`. The §5 / §2.6 citation is
wrong. The substantive claim both make — that there is exactly one `create` and no `update`
— is unaffected and stands.

---

## 2. Checkpoint B — make the Enterprise surface beautiful

**Goal.** One record, `/stories/ai-systems-architect-training-system`, reads as a designed
page rather than a template that never looks broken. No new content field, no new section
key, no lens semantics, no deploy.

**Governing constraint, from `STORY_FORMAT_V1.md` §2.3 and restated in-source at
`storyDetailV2.css:29-38`: the hero is already the heaviest band on the page — 1166px at
1440px, 2309px at 390px. Every Checkpoint B move must subtract from it or leave it alone.
Nothing may be added to it.**

| # | Item | Nature | Source |
|---|---|---|---|
| B-1 | Split `storyDetailV2.css` (549 lines, over CLAUDE.md's 500 hard ceiling) before changing it, and extend the source contract to cover the new file | refactor, forced by CLAUDE.md | Modular Composition Rule |
| B-2 | Project `situation.constraints` and `situation.goals` — authored, populated, publish-gated, never readable | projection | FORMAT §4 Band 5, §8 #2 |
| B-3 | Project `architecture.dataStores` — assembled at `caseStudySnapshotSections.ts:164`, absent from the public architecture shape | projection | FORMAT §6, §8 #8 |
| B-4 | Move the facts grid and the indicator rail out of the dark masthead into a light context band beneath it | JSX placement + CSS | FORMAT §4 Band 1, §8 #4 |
| B-5 | Tone alternation: prose bands on default ground, visual bands on sunken ground | CSS | FORMAT §5, §8 #3 |
| B-6 | `headingLevel` on `CaseStudyArtifacts`, closing the recorded h2 -> h4 skip | one prop | FORMAT §4 Band 13, §8 #6 |

**Explicitly out of scope at B**, and each for a stated reason:

- **Quotes.** `STORY_FORMAT_V1.md` §4 Band 4 recommends building them last, and the reason
  is not caution, it is history: `frontend/src/config/v2Proof.ts:87` names the remediation
  *"Case studies containing invented client quotations."* This is the only proposed band
  whose failure mode is the incident the module exists to prevent. **If no approved quote
  exists, render no quote block** — do not manufacture one to fill the band.
- **Charts.** They need a metric-key reference model (`STORY_ASSET_MODEL.md` §4, addition
  4: *"references metric keys only"*, blocked on metrics already being verified). **If the
  pilot has no verified metric to chart, use a process visual, not an invented number.**
- **External references.** No field, no table, no gate coverage.
- **Band order** — see C-1.
- **Section headings** — see C-2.
- **The three dead publication columns** (`section_order`, `hidden_sections`,
  `cta_profile_key`, G-8). Wiring them is per-publication ordering, which is lens
  behaviour. Checkpoint C.

**Exit criteria.** Full frontend jest suite green; `tsc --noEmit` clean on the local
TypeScript 5.9.3 in `frontend/node_modules/.bin` (never the root 4.9.5, which reports a
false clean); every new behaviour has a test that has been **mutated and watched go red**;
and the page has been **looked at in a real browser at 1440x1000 and 390x844**. The last
one is not optional: this surface has shipped three separate invisible-text contrast
failures (1.06:1, 1.03:1, 1.00:1) that every token check and unit test passed.

---

## 3. Checkpoint C — prove the lens theory

**Goal.** Make the word "lens" mean something structural, and prove it in a place where a
mistake cannot reach the public.

**Entry criteria — both must be true before C starts.**

- **C-entry-1. Checkpoint B is complete and looked at.**
- **C-entry-2. The hero/measurement metric duplication has a decision.** Per C-1, the
  Enterprise order change puts the same metric card twice in one screen on the pilot
  record. The options are: suppress the metric block in `measurement` when every one of its
  metrics is already in `heroMetrics`; or leave the order alone. **Whichever is chosen,
  `storyDetailV2HeroInvariant.test.ts` must still pass** — the subset relationship is what
  makes hero suppression safe and may not be weakened to solve a layout problem.

| # | Item | Nature |
|---|---|---|
| C-1 | `surface: PublicSurfaceView` added to the admin preview response, built by the existing `surfaceView()` helper | one field, one existing helper |
| C-2 | Segmented four-tab lens switcher in the admin desk, replacing `AdminCaseStudyDetailPage.tsx:39`'s `SURFACE` constant with state | client only |
| C-3 | **Split preview surface from publish surface.** Preview follows the tab; publish follows an explicit choice | client only, and it is the safety item |
| C-4 | Draft ahead/behind as a **state, not a count** | client only |
| C-5 | `sectionHeadings` on the profile; delete the dead per-record `situation.heading` path | 4 files |
| C-6 | Differentiate `sectionOrder` across the four profiles | data only |
| C-7 | `requiredSections` attribution floor, subtracted from `hiddenSections` before the walk | 1 field, 1 predicate |
| C-8 | Remove `emphasis` from the wire | deletion |
| C-9 | Wire the three dead publication columns as read sites only (G-8) — no DDL | read sites |

**The two rules that make C safe.**

1. **Nothing at C touches `resolveRequestSurface`.** `SURFACE_LENS_MODEL.md` §2.2 is
   explicit: the read-time visibility gate at `caseStudyFilterService.ts:200-209` does not
   consult `publishable`, so the moment that resolver honours a request parameter, every
   published non-enterprise record becomes publicly readable **in the same commit**. The
   whole of C runs behind `requireAdmin` on the existing preview endpoint. That is
   Checkpoint E, separately reviewed.
2. **C-7 before C-6.** The attribution floor must exist before any profile is given a
   different order, or there is a window in which a lens can reorder its way past
   attribution. `SURFACE_LENS_MODEL.md` §3.3 names the concrete failure: an AI Flotation
   masthead over an architecture-led record whose `builtBy` is `colaberry_team`.

**Exit criterion, and it is an assertion rather than a screenshot.** The five canonical
values — `builtBy`, `verificationClass`, `verificationMethod`, `productionStatus`,
`organizationLabel` — must be **identical across all four tabs**, asserted in the test
suite. They come from the snapshot, not the profile. If switching a tab changes any of
them, the lens model has been violated.

---

## 4. Checkpoint D — build Story Studio

**Goal.** An authoring surface. This is the first greenfield UI in the workstream: per
`STORY_STUDIO_CURRENT_STATE.md`, *"No `storyStudio` module exists"*, and neither Checkpoint
A document names a single admin-side frontend file for case studies. The backend it drives
is mature and disciplined; the UI is new.

**D-0 is a prerequisite, not a feature, and it gates everything visual.**

> **D-0. Give `case_study_artifacts` a promotion path.** The complete set of application
> writes to that table is two `findAll` and one `create` at
> `backend/src/services/caseStudy/caseStudyEvidenceSource.ts:369`, which hardcodes
> `status: 'candidate'`, `visibility: 'private'`, `public_url: null`, `preview_url: null`.
> There is no `update`, no `destroy`, no artifact route. **The entire hero, carousel and
> figure surface cannot populate through the application today** — the pilot record's three
> approved artifacts were promoted by direct SQL. Any Studio that shows images closes this
> first.
>
> One constraint on the shape: the Studio exposes **`artifact_type`, never `presentation`**.
> `presentation` is derived from the type (`caseStudyArtifactPresentation.ts:38-40`)
> precisely so that "is this evidence?" is not an editorial field.

| # | Item | Depends on |
|---|---|---|
| D-0 | Artifact promotion path (above) | — |
| D-1 | Make `projectDiagramSource` return a discriminated result rather than `null`. Both Checkpoint A docs name this as the first authoring seam: today a rejected Mermaid diagram is indistinguishable from a record that never had one | — |
| D-2 | Enumerable human-owned field list. The `updateCaseStudy` allowlist is duplicated with no shared constant (`caseStudyAdminService.ts:118` vs `caseStudyAdminRoutes.ts:105`) and is a Zod object rather than a `readonly string[]`, so **nothing can enumerate the human-owned fields programmatically** — which is precisely what a Studio form needs | — |
| D-3 | The Studio shell: snapshot picker, per-path override editor over `applyHumanOverride`, live gate verdict, live readiness band | D-1, D-2 |
| D-4 | Authored figure placement hint, honoured by `placeStoryFigures` before its automatic pass and **still subject to `figureAllowedAfter`** | D-0, D-3 |
| D-5 | `leadArtifactTypes` on the profile — **orders, never filters** | D-4 |
| D-6 | Publication editor for `surface_title_override` / `surface_summary_override`. Note the `\|\|` semantics at `caseStudyPublicProjection.ts:145-146`: clearing must write `NULL`, never `''` | C-9 |
| D-7 | Pull-quote band — field named to match `/quote\|testimonial\|endorsement/` so it auto-enrols in the strictest provenance class, renders only human-attributed entries, attribution not optional | D-3 |

**The one thing D must not do.** The readiness rubric is advisory and *"a score of 100
grants nothing"*. A Studio that renders readiness beside the gate verdict must make the
difference unmissable, because a percentage next to a refusal reads as progress toward
permission.

---

## 5. Checkpoint E — harden, then package as a skill

| # | Item |
|---|---|
| E-1 | Fix `env.publicAppUrl` defaulting to `https://enterprise.colaberry.ai` (`config/env.ts:350`). With `PUBLIC_APP_URL` unset, **every** `seo.canonicalUrl` points at the enterprise host regardless of surface — and `StoryDetailV2.tsx:204` copies that exact string to the clipboard. This is a hard blocker on a second public surface and is not on either doc's checklist |
| E-2 | Honour a surface parameter on the public API — and, in the same review, make the read gate consult `publishable`. These two are one change, not two |
| E-3 | Blocker-code registry, so a new publish rule stops needing two hand-synchronised literals to agree (`caseStudyPublishRules.ts:45` and `:58`) |
| E-4 | Surface `MAX_CARRIED_OVERRIDES` exhaustion and dropped override paths, both of which fail silently today |
| E-5 | Backend event-data allowlist, to match the frontend's. Today the backend has only the denylist and writes `event_data` to JSONB verbatim |
| E-6 | Circuit breaker in the GitHub read layer — a deferral recorded in-source at `caseStudyRepoReader.ts:26-31` |
| E-7 | Type-check the backend `__tests__` tree, currently excluded by `tsconfig.json` |
| E-8 | Package the whole thing as a skill: the band grammar, the lens rules, the closed-set and token constraints, the mutation-testing standard, and the browser-acceptance requirement |

**Two security items surfaced by discovery that are not Story System features but are in
this codebase and should not be lost in a plan document nobody re-reads:** the privilege
escalation into `super_admin` via HTTP-settable `mgmt_role='owner'`
(`routes/admin/communityMemberRoutes.ts:96-110` into `mgmtBridgeService.ts:87`), and the
`MGMT_ROLES` / DB CHECK constraint disagreement over `'mentor'`. Both are outside this
workstream's scope. **Both should be escalated separately rather than folded into E**, per
CLAUDE.md's Escalation Protocol — a security posture change is a governance boundary.

---

## 6. The deferred register

Everything this plan knowingly does not do, and where it went.

| Item | Deferred to | Why |
|---|---|---|
| Quotes | D-7 | Only band that can manufacture a false claim; the gate that blocks it exists because this repo shipped invented client quotations |
| Charts | after D | Need a metric-key reference model and verified metrics |
| External references | after D | No field, no table, no gate coverage |
| Band order changes | C-6 | Lens work; also blocked on the hero/measurement duplication |
| Per-surface section headings | C-5 | Lens work |
| Dead publication columns | C-9 | Per-publication ordering is lens behaviour |
| Moving shared V2 primitives into `publicV2.css` (FORMAT §8 #1) | B, best-effort; C if it grows | Cheapest structural improvement in either doc, but it edits four other pages' stylesheets and every V2 route is in its blast radius |
| Lazy-loading the story route | after E-1 | Depends on the primitives move |
| `deliverables` on the detail projection | unscheduled | Present on the summary, absent from the detail |
| Per-surface prose | never | Explicitly refused by the product owner and by `SURFACE_LENS_MODEL.md` §1 |
| `super_admin` escalation, `MGMT_ROLES` drift | separate escalation | Governance boundary; not this workstream |

---

## 7. Cross-references

- `STORY_FORMAT_V1.md` — the band grammar. Authoritative for **tone**; see C-1.
- `SURFACE_LENS_MODEL.md` — the four lenses. Authoritative for **order** and for the
  **heading mechanism**; see C-1 and C-2.
- `STORY_STUDIO_CURRENT_STATE.md` — the backend map and the gap list.
- `STORY_ASSET_MODEL.md` — the Class A / Class B asset model and the three additions.
- `STORY_STUDIO_TEST_PLAN.md` — how each of the above is proved.
