# STORY_FORMAT_V1

**The locked visual grammar for a published Case Study record.**

Status: DESIGN. Checkpoint A. No feature code was written to produce this document, and
nothing here has been implemented. Every structural claim carries a `file:line`. Claims
that could not be verified from source are marked UNVERIFIED.

Scope: the detail surface at `/stories/:slug`, rendered by
`frontend/src/pages/publicV2/StoryDetailV2.tsx`. The index surface (`StoriesV2`) is out of
scope except where a band is shared.

Reference record: `https://enterprise.colaberry.ai/stories/ai-systems-architect-training-system`,
verified live against `GET /api/public/case-studies/ai-systems-architect-training-system`
on 2026-08-25.

---

## 1. The three rules that govern every proposal in this document

Before any band is discussed, the constraints that decide what a proposal is allowed to be.

### 1.1 `components/caseStudy/` is a closed set of exactly ten files

Asserted twice, in two different test files, so a change to the set breaks two contracts:

- `frontend/src/components/caseStudy/__tests__/caseStudyStyleContract.test.ts:55-64`
- `frontend/src/pages/publicV2/__tests__/storyDetailV2Contract.test.ts:132-146`

The ten: `CaseStudyArchitecture`, `CaseStudyArtifacts`, `CaseStudyCTA`, `CaseStudyCard`,
`CaseStudyFilters`, `CaseStudyLedger`, `CaseStudyMeasurement`, `CaseStudyRoadmap`,
`CaseStudyTimeline`, `CaseStudyVerificationBadge`.

**This document proposes no change to that set.** Every new rendering surface below is
page-local in `frontend/src/pages/publicV2/`, following the precedent already established
by `StoryDiagram`, `StoryFigure`, `StoryIndicators`, `StoryMediaCarousel`,
`StorySectionList` and `StoryHeroActions` — and stated as the reason in
`storyDetailV2Sections.tsx:31-35`.

A page-local file is not unchecked. `storyDetailV2Contract.test.ts:46-66` pins the
page-local list by name (`MEDIA_SOURCES`), and the comment at `:51-58` records that
extending that list was deliberate. **Adding a page-local component therefore means adding
one line to `MEDIA_SOURCES`** — a known, small, in-scope edit, not a contract breach.

### 1.2 A band is a `CaseStudySectionKey`, and the union is total

The section vocabulary is a closed union of ten keys, declared in two mirrored places:

- backend: `backend/src/types/caseStudy.ts` (consumed by `caseStudySurfaceProfiles.ts:23-26`)
- frontend: `frontend/src/services/caseStudyPublicTypes.ts:116-126`

Adding a key is cheap to reason about because the compiler enumerates the work.
`SECTION_HEADINGS` is `Readonly<Record<CaseStudySectionKey, string>>`
(`storyDetailV2Model.ts:64-75`), so a new key fails to compile until its heading exists.
The full list of sites a new key touches:

| Site | file:line |
|---|---|
| Backend key union | `backend/src/types/caseStudy.ts` (union decl) |
| Backend default order | `caseStudySurfaceProfiles.ts:23-26` |
| Frontend key union | `caseStudyPublicTypes.ts:116-126` |
| Frontend fallback order | `storyDetailV2Model.ts:55-58` |
| Heading map (total, forces the edit) | `storyDetailV2Model.ts:64-75` |
| Support predicate | `storyDetailV2Model.ts:100-128` |
| Body dispatcher | `storyDetailV2Sections.tsx:238-293` |
| Figure-gap eligibility | `storyFigurePlacement.ts:44-46` |
| Count noun map (partial, optional) | `storyIndicatorModel.ts:94-101` |

Nine sites, of which one (`SECTION_HEADINGS`) is compiler-enforced. This is the real price
of a new band and it is not large. What is expensive is a new *content field*, which is a
schema change plus a projection change plus new publish-gate coverage — see 4.2.

### 1.3 Tokens, namespace and the token that does not exist

- Token source: `frontend/src/colaberry/tokens/*.css` — five files
  (`base`, `colors`, `fonts`, `spacing`, `typography`), loaded globally via
  `frontend/src/colaberry/styles.css:6-10`.
- `frontend/src/styles/tokens.css` is a **second, older token system and is forbidden**.
  The rule is enforced by differencing the two files:
  `caseStudyTokens.test.ts:7-12`; `storyDetailV2Contract.test.ts:323-352`.
- The spacing scale is `0,1,2,3,4,5,6,8,10,12,16,20,24,32`
  (`frontend/src/colaberry/tokens/spacing.css:6-21`). **There is no `--space-7`.** A rule
  asking for one resolves to nothing at all — not a fallback, an absence. The trap is
  documented in-source at `storyDetailV2.css:5-12` and `caseStudy.css:10`, and pinned by
  `storyDetailV2Contract.test.ts:339-348`.
- No raw hex, no `rgba()`/`hsla()` in `storyDetailV2.css` or `caseStudy.css`
  (`storyDetailV2Contract.test.ts:381-384`; `caseStudyTokens.test.ts:112-118`), and none in
  the six page-local story sources either (`storyDetailV2Contract.test.ts:437-443`).
- Namespace: `cbv2-` everywhere, `cbv2-cs-` inside the component directory
  (`caseStudyStyleContract.test.ts`, the namespace describe block).

> **Conflict to record.** The `baseline-ui` skill
> (`.claude/skills/baseline-ui/SKILL.md:11-13`) names `frontend/src/styles/tokens.css` as
> "the source of truth". For the V2 public site that is **wrong and forbidden**. The skill
> predates the V2 system and has not been updated. Anyone generating UI for this surface
> must use `colaberry/tokens/*.css`. Same for `frontend/CLAUDE.md`, which describes a
> Bootstrap-first house style that the case-study module's own contract explicitly bans
> (`caseStudyStyleContract.test.ts`, the "uses no Bootstrap" test). Inside this subtree the
> module contract wins; Bootstrap remains correct in `pages/admin/`.

---

## 2. What the page already does, verified

This is the baseline the owner's proposed rhythm has to be evaluated against.

### 2.1 The existing rhythm

```
[ .cbv2-pagehero  - dark ]    hero: crumb, eyebrow, h1, standfirst, verification badge,
                              indicator rail, facts dl, hero metrics, CTA + repo buttons,
                              copy-link row                    StoryDetailV2.tsx:291-352

[ .cbv2-section   - light ]   one <section data-section={key}> per visible key, each with
[ figure band                 an h2, an optional count chip, its body; and after it, the
[ .cbv2-section   - light ]   figures placed in that gap        StorySectionList.tsx:56-90
[ figure band     ...     ]

[ .cbv2-section--inverse ]    CTA                              StoryDetailV2.tsx:356-362
```

Order comes from the server, never from the page: `visibleSections(record, surface)`
(`storyDetailV2Model.ts:135-149`) walks `surface.sectionOrder`, drops
`surface.hiddenSections`, de-duplicates, and then drops anything the record cannot support.

### 2.2 Emptiness is decided before anything mounts

`isSectionSupported` (`storyDetailV2Model.ts:100-128`) asks about the **data**, never about
a component's return value. This is why the page never prints a heading over a null
component. The module header states the intent at `StoryDetailV2.tsx:46-49`.

**Verified live.** The pilot record's `contributors` is `[]` and
`anonymousContributorCount` is `0` (confirmed against the live detail API on 2026-08-25).
`isSectionSupported(..., 'contributors')` returns false at `storyDetailV2Model.ts:119-120`,
so the "Who built it" band does not render on the live page at all — no heading, no empty
state. The claim in the brief that "the page already hides bands cleanly" is **confirmed**,
and confirmed on the pilot record specifically rather than on a fixture.

Belt and braces: six of the ten components carry their own `return null` guard as well
(Architecture `:91`, Artifacts `:63`, Filters `:82`, Measurement `:55`, Roadmap `:30`,
Timeline `:49`). Four always render by design — CTA, Card, Ledger, VerificationBadge — and
of those only CTA appears on this page, where it is intentionally unconditional.

### 2.3 The hero is already the heaviest thing on the page

Recorded in-source, from measurement rather than estimate
(`storyDetailV2.css:29-38`): the masthead was **1166px tall at 1440px and 2309px at 390px**
before it was scoped down — roughly two and a half phone screens of hero before the first
sentence of the story. The hero currently stacks eleven distinct elements.

**This is the single most important constraint on the proposed rhythm.** Any change that
adds to the hero is moving in the wrong direction. The productive moves are the reverse:
push the facts grid, the indicator rail or the metric block *out* of the hero and into
their own bands.

### 2.4 Pictures are already placed between sections, not gathered at the bottom

`placeStoryFigures` (`storyFigurePlacement.ts:96-127`) allocates approved images into the
gaps *after* narrative sections. Two frozen rules govern it:

- `FIGURE_GAP_SECTIONS` (`:44-46`) — a figure may follow `situation`, `build`,
  `architecture`, `measurement`, `roadmap`, `contributors`. Never `hero`, `cta`,
  `artifacts` or `repositories`; a picture after the artifacts list is a gallery again.
- `ATMOSPHERE_EXCLUDED_AFTER` (`:54-56`) — an atmosphere photograph may not sit after
  `architecture`, `measurement`, `roadmap` or `contributors`, because each of those ends on
  something the record claims to have proved and a photograph beneath one borrows its
  authority.

Allocation is constrained-kind-first (`:123-124`) so a photograph is never stranded, and
each gap takes at most one slide (`:106`, `:112`). Placed hrefs are subtracted from the
artifacts carousel (`:66`, consumed at `storyDetailV2Sections.tsx:280`) so no reader meets
the same image twice.

**A figure is a sibling of a section, never a child** — and that is a truth decision, not a
layout one (`storyFigurePlacement.ts:16-21`, restated at `StorySectionList.tsx:25-32`). A
figure inside "The measurement" is captioned by that heading whether or not anyone wrote a
caption.

### 2.5 The existing band-tone alphabet

Four section modifiers already exist across the V2 public site:
`--inverse`, `--sunken`, `--spot`, `--berry` (`homeV2.css:22-25`;
`cinematicV2.css:268-269`, `:409`, `:419-443`). The story page uses exactly one of them
(`--inverse`, on the CTA).

**The "premium, locked visual grammar" the owner is asking for is largely an alphabet that
already exists and is unused on this page.** Locking the grammar means deciding which
modifier each band carries, not authoring new ones.

> **Known coupling, already recorded** (`storyDetailV2.css:14-23`): `.cbv2-section`,
> `.cbv2-section--inverse`, `.cbv2-lede` and `.cbv2-wrap--narrow` are defined in
> `homeV2.css`; `.cbv2-pagehero` and `.cbv2-eyebrow--onDark` in `servicesV2.css`;
> `.cbv2-wrap`/`.cbv2-btn` in `publicV2.css`; `.cbv2-rv` in `cinematicV2.css`. These
> resolve only because `App.tsx` imports every V2 page statically. **If the format is to be
> "locked" and reusable, these shared primitives should move into `publicV2.css` first.**
> That is a prerequisite for any second surface getting its own route, and it is the
> cheapest structural improvement in this document.

---

## 3. The band map: 14 proposed onto 10 existing

The headline answer. Of the fourteen proposed bands, **ten already exist**, **two are
restatements of a band already on the page**, and **two are genuinely new content**.

| # | Proposed band | Verdict | Existing band / component |
|---|---|---|---|
| 1 | HERO | **EXTEND (subtract)** | `hero` — `StoryDetailV2.tsx:291-352` |
| 2 | THE SHIFT / SITUATION | **EXTEND (rename per lens)** | `situation` — `storyDetailV2Sections.tsx:239-246` |
| 3 | MAJOR VISUAL | **EXTEND (add authored placement)** | figure band — `StoryFigure.tsx:33-39` via `storyFigurePlacement.ts:96-127` |
| 4 | PULL QUOTE | **NEW** (page-local, gate-constrained) | nothing renders a quote today |
| 5 | THE DECISION | **EXTEND (project fields that already exist)** | `situation.constraints` / `.goals` — authored and gated but never projected |
| 6 | WHAT WE BUILT | **EXTEND** | `architecture` — heading is *already* "What was built" (`storyDetailV2Model.ts:70`) |
| 7 | ARCHITECTURE | **FOLD INTO 6** | same band; the split already exists inside it (`storyDetailV2Sections.tsx:253-258`) |
| 8 | PRODUCT / EXPERIENCE MEDIA | **EXTEND** | same mechanism as 3, plus `StoryMediaCarousel` in the artifacts band |
| 9 | HOW IT WORKS | **FOLD INTO 6** | `architecture.narrative` is the mechanism; `build` is the chronology |
| 10 | WHAT CHANGED | **EXTEND (rename per lens)** | `measurement` — `CaseStudyMeasurement` |
| 11 | SECOND QUOTE | **SAME BAND AS 4** | one repeatable band, not two |
| 12 | WHAT WE LEARNED / WHAT'S NEXT | **SPLIT: half exists, half is new** | "what's next" = `roadmap`; "what we learned" does not exist |
| 13 | PROOF / PROVENANCE | **EXTEND (keep as two)** | `artifacts` + `repositories` |
| 14 | SURFACE CTA | **EXTEND (already per-surface)** | `cta` — `CaseStudyCTA` |

Net new components proposed: **one** (`StoryQuote`, page-local).
Net new content fields proposed: **two** (`pullQuotes`, `lessons`) — plus **one projection
change that adds no field at all** (constraints/goals).

---

## 4. Band-by-band specification

Each band documents: the content field that feeds it, the component that renders it, what
happens when its data is absent, and whether it is required.

### Band 1 — HERO `hero`

| | |
|---|---|
| **Feeds from** | `title`, `standfirst`, `verificationClass`/`Method`, `heroMetrics`, plus derived `heroFacts()` (`storyDetailV2Model.ts:210-224`) and `storyIndicators()` (`storyIndicatorModel.ts:62-84`) |
| **Renders via** | inline in `StoryDetailV2.tsx:291-352`; `CaseStudyVerificationBadge` (`:302-306`), `StoryIndicatorRail`, `StoryHeroMetrics` (`storyDetailV2Sections.tsx:57-107`), `StoryHeroActions` |
| **When absent** | Cannot be absent. `isSectionSupported` returns `true` unconditionally (`storyDetailV2Model.ts:105-107`). Every *sub-element* hides independently: facts (`:315`), metrics (`:60`), indicators (`:39`) |
| **Required** | **Required** |

**Extension: subtract, do not add.** Per 2.3 the hero is measured at 1166px/2309px. The
locked grammar should move the facts grid and the indicator rail out of the dark masthead
into a light band immediately beneath it. That is a CSS and JSX-placement change with no
new component and no new field.

**Already correct and should stay:** a hero metric with no evidence context is dropped from
the hero but not from the page (`heroMetricsFor`, `storyDetailV2Model.ts:159-175`). This is
the rule that stops the hero printing a bare number at display size, which is the shape
that made the fabricated case studies persuasive.

### Band 2 — THE SHIFT / SITUATION `situation`

| | |
|---|---|
| **Feeds from** | `situation.body: string[]` — projected at `caseStudyPublicSections.ts:259-265` from `content.situation.narrative` |
| **Renders via** | `storyDetailV2Sections.tsx:239-246` — plain `<p>` per paragraph in `.cbv2-cs-arch__prose` |
| **When absent** | Hidden. `!detail.situation || body.length === 0` (`storyDetailV2Model.ts:108-110`). Also fails closed if verification is unreadable (`caseStudyPublicSections.ts:261`) |
| **Required** | Optional |

**Extension: make the heading lens-variable.** The wire already carries
`situation.heading`, and `StorySectionList.tsx:72-74` already prefers it over the constant.
But the server hardcodes `'The situation'` at `caseStudyPublicSections.ts:264`, so the
override can never differ. Making the surface profile supply that string is the entire cost
of "THE SHIFT" on Training and "The situation" on Enterprise — **no component change at
all**. See `SURFACE_LENS_MODEL.md` section 4.

### Band 3 — MAJOR VISUAL (figure band)

| | |
|---|---|
| **Feeds from** | `artifacts[]` filtered to open, image-typed, resolvable-URL slides (`storyMediaModel.ts:33-35`, `:65-71`) |
| **Renders via** | `StoryFigureBand` (`StoryFigure.tsx:33-39`), placed by `placeStoryFigures` |
| **When absent** | Hidden. `figures.length === 0` returns null (`StoryFigure.tsx:39`); the placer returns the frozen `EMPTY` when there are no slides (`storyFigurePlacement.ts:101`) or no eligible gaps (`:104`) |
| **Required** | Optional |

**This band already is the owner's MAJOR VISUAL.** The gap is authorship, not existence:
today the placer picks *which* gap, in record order. The proposed grammar wants a
deliberate hero-scale visual at a known position.

**Minimum extension — one optional field on the artifact, no new component:**
an authored placement hint, e.g. `placeAfter: CaseStudySectionKey | null`, honoured by
`placeStoryFigures` before its automatic pass and **still subject to
`figureAllowedAfter`** (`storyFigurePlacement.ts:75-79`) so an atmosphere photograph cannot
be hand-placed under a verified figure. Unplaceable hints fall back to automatic
allocation. A record with no hint behaves exactly as it does today.

A "full-bleed" treatment is a CSS modifier on the existing band
(`.cbv2-story-figure--major`), not a second component.

### Band 4 / 11 — PULL QUOTE and SECOND QUOTE

**One repeatable band, not two.** A record with one quote renders one; a record with none
renders nothing. Two hardcoded slots would guarantee an empty slot on most records.

| | |
|---|---|
| **Feeds from** | **Does not exist.** No quote field anywhere: not in `CaseStudySnapshotContent` (`backend/src/types/caseStudy.ts:486-498`), not in `PublicCaseStudyDetail` (`caseStudyPublicTypes.ts:302-335`) |
| **Renders via** | **Nothing.** No `<blockquote>`, no `<q>`, no pull-quote class anywhere in the case-study or publicV2 story surface |
| **When absent** | N/A — proposed as optional and hidden when the array is empty |
| **Required** | Optional |

`frontend/src/components/ExecutiveTestimonial.tsx` renders a `<blockquote>` at `:15` but is
**dead code** — zero imports in `frontend/src`. It is not a starting point.

**This band runs against an existing publish gate, and that gate exists because of a real
incident.** `frontend/src/config/v2Proof.ts:87` names the remediation: *"Case studies
containing invented client quotations."*

The gate, read precisely:

- `QUOTATION = /["“«]([^"”»]*\S\s+\S[^"”»]*\s+\S[^"”»]*)["”»]/`
  — `caseStudyPublishClaimScan.ts:110`. Three or more words in quote marks. One quoted word
  is a term of art, not a testimonial, hence the two required internal spaces (`:104-107`).
- `ruleQuotes` — `caseStudyPublishClaimScan.ts:229-241`. It blocks **only** when the
  field's effective provenance tier is `ai_draft` or `unknown` (`:234`). `unknown` fails
  closed on purpose (`:219-227`).
- `classifyAiForbiddenPath` — `caseStudyProvenance.ts:116-121`. Any path matching
  `/quote|testimonial|endorsement/` is one of the six absolute NOs for an AI draft.

**Read together, these define the band rather than forbid it.** A quotation is publishable
when a provenance entry attributes it to a human. So:

- The field **must** be named to match `/quote|testimonial|endorsement/` — e.g.
  `pullQuotes[].text`. Naming it that way automatically enrols it in the strictest
  provenance class. That is the feature, not a side effect.
- The band renders **only** entries whose provenance tier is human. A quote with `unknown`
  provenance blocks publication of the whole record today and must continue to.
- Attribution is not optional. A quote with no attributable speaker has nothing to render
  under it and should not be projected.

**Recommendation: build this band last.** It is the only proposed band that can
manufacture a false claim, and it is the only one whose failure mode is the exact incident
the module was built to remediate. Everything else in this document is a rearrangement of
facts the system already holds.

### Band 5 — THE DECISION

| | |
|---|---|
| **Feeds from** | `situation.constraints: string[]` and `situation.goals: string[]` — **already authored** (`backend/src/types/caseStudy.ts:338-339`), **already populated** (`caseStudyProjectSource.ts:340-344`), **already scanned by the publish gate** (`caseStudyPublishClaimScan.ts:70-71`) |
| **Renders via** | **Nothing. They are never projected.** `projectSituation` returns only `{ heading, body }` (`caseStudyPublicSections.ts:264`), and `PublicCaseStudyNarrative` has no room for them (`caseStudyPublicTypes.ts:146-149`) |
| **When absent** | Would hide — both are optional in the snapshot type |
| **Required** | Optional |

**This is the highest-value, lowest-cost finding in the document.** Two fields exist in the
schema, are filled by the sync pipeline, and can *block a publish on their wording* — yet
no reader can ever see them. A constraint that can veto publication but cannot be read is
the worst of both worlds.

"The decision" as the owner means it — the hard requirement, the road not taken — is
substantially what `constraints` and `goals` already hold. **Projecting two existing fields
is cheaper than inventing a decision schema, and it is honest, because the content was
written by whoever wrote the record rather than reverse-engineered for a narrative beat.**

Minimum change: widen `PublicCaseStudyNarrative` (or add a sibling shape), project the two
arrays, render them as two labelled lists inside the existing `situation` band. **No new
`CaseStudySectionKey`, no new component.** If it later deserves its own band, promoting a
rendered field to a section is a smaller step than schema work.

### Bands 6, 7, 9 — WHAT WE BUILT / ARCHITECTURE / HOW IT WORKS `architecture`

**These are one band, and it is already correctly internally split.**

| | |
|---|---|
| **Feeds from** | `architecture.{narrative, stack, capabilities, integrations, diagram, diagramSource}` (`caseStudyPublicTypes.ts:170-192`) |
| **Renders via** | `CaseStudyArchitecture` (verified lists, `headingLevel` 3\|4\|5 at `:34`, default 3 at `:77`) **then** `StoryDiagram` — in that order, deliberately (`storyDetailV2Sections.tsx:250-258`) |
| **When absent** | Hidden. `architectureHasContent()` (`storyDetailV2Model.ts:82-92`) checks **both** renderers — the `diagramSource` clause at `:91` is load-bearing: drop it and the band hides on exactly the records it exists for |
| **Required** | Optional |

The existing heading is already literally **"What was built"** (`storyDetailV2Model.ts:70`).
The reading order is already "verified lists first, the drawing second" so a reader meets
what the repository evidenced before what somebody sketched
(`storyDetailV2Sections.tsx:250-252`), and the drawn diagram is labelled
`"Diagram (drawn by the team)"` (`StoryDiagram.tsx:41`).

**"HOW IT WORKS" is `architecture.narrative`; "WHAT WE BUILT" is the stack/capability
lists; "ARCHITECTURE" is the diagram.** All three are present. Because
`CaseStudyArchitecture` already accepts `headingLevel`, giving them visible sub-headings
costs **no component change** — only sub-headings in the page-local dispatcher.

Splitting them into three top-level bands is possible but not recommended: on a thin record
it produces three headings over one paragraph, and `architectureHasContent` would have to be
split into three predicates that can each disagree.

### Band 8 — PRODUCT / EXPERIENCE MEDIA

Same mechanism as Band 3, differentiated by *placement*, not by component. There is also a
second media view already shipping: `StoryMediaCarousel` inside the artifacts band
(`storyDetailV2Sections.tsx:280`).

| | |
|---|---|
| **When absent** | Carousel hides below **two** slides — `CAROUSEL_MINIMUM_SLIDES = 2` (`storyMediaModel.ts:46`), applied at `:121`. A one-image record renders the list only. Arrow controls are *absent*, not disabled, when the track does not overflow (`StoryMediaCarousel.tsx:104`, `:191`) |
| **Required** | Optional |

No change proposed beyond the authored placement hint in Band 3.

### Band 10 — WHAT CHANGED `measurement`

| | |
|---|---|
| **Feeds from** | `measurement.narrative` + `measurement.metrics` (`caseStudyPublicTypes.ts:194-197`) |
| **Renders via** | `CaseStudyMeasurement` — no heading of its own by design, uses `<section aria-label={metric.label}>` so a screen reader does not say the label twice (`CaseStudyMeasurement.tsx:70-78`) |
| **When absent** | Hidden twice over: `storyDetailV2Model.ts:114-116` and `CaseStudyMeasurement.tsx:55` |
| **Required** | Optional |

Current heading is `'The measurement'` (`storyDetailV2Model.ts:69`). **"What changed" is the
better sentence for every lens** and costs a string. Same mechanism as Band 2.

### Band 12 — WHAT WE LEARNED / WHAT'S NEXT

**Half exists.** `roadmap` is "what's next" and is fully built; "what we learned" is not.

| | |
|---|---|
| **Feeds from** | `roadmap[]` — `{label, status, detail}` (`caseStudyPublicTypes.ts:199-203`) |
| **Renders via** | `CaseStudyRoadmap` (`:30` guard). Status carries a text label **and** a glyph, never colour alone (`caseStudySurfaces.ts:187-199`) |
| **When absent** | Hidden — `storyDetailV2Model.ts:117-118` and `CaseStudyRoadmap.tsx:30` |
| **Required** | Optional |

Existing heading: `'What happened next'` (`storyDetailV2Model.ts:71`).

For **"what we learned"** there are two honest routes, and I recommend the second:

1. A new `lessons: string[]` snapshot field. Real schema work, and it is free prose that
   the gate reads only through `caseStudyPublishClaimScan` — the template already warns
   that narrative arrays are "on your honour" (V-29,
   `CASE_STUDY_AUTHORING_TEMPLATE.json:13-14`).
2. **Re-present what the record already states it does not prove.** Every metric carries
   `limitations: string[]` (`caseStudyPublicTypes.ts:141`), already rendered inside the
   hero metric block (`storyDetailV2Sections.tsx:92-101`). A record that admits its own
   limits is already carrying the most credible "what we learned" content on the page, and
   the authoring template says so in as many words: *"Items admitting what is NOT solved
   are the most credible ones on the page"* (`CASE_STUDY_AUTHORING_TEMPLATE.json:108`).

Route 2 adds no field and no risk. Route 1 should wait until an author asks for it.

### Band 13 — PROOF / PROVENANCE `artifacts` + `repositories`

**Keep these as two bands.** An artifact and a repository are different objects with
different consent rules, and merging them would put a request-only deck next to a clickable
repo under one heading.

| | Artifacts | Repositories |
|---|---|---|
| **Feeds from** | `artifacts[]` | `repositories[]` + `privateRepositoryCount` |
| **Renders via** | `StoryMediaCarousel` + `CaseStudyArtifacts` (`storyDetailV2Sections.tsx:278-283`) | `StoryRepositories` (`storyDetailV2Sections.tsx:166-218`) |
| **When absent** | Hidden — `storyDetailV2Model.ts:121-122`; `CaseStudyArtifacts.tsx:63` | Hidden unless there is a withheld count to declare — `storyDetailV2Model.ts:123-124` |
| **Required** | Optional | Optional |

Two existing behaviours to preserve verbatim, because both are about truth rather than
layout:

- `request` is a **state, never a control** (`caseStudySurfaces.ts:218-227`). A fake
  download button is forbidden.
- A withheld repository says "not linked here", not "private", because the count collapses
  three different reasons (`storyDetailV2Model.ts:233-245`).

**Known, recorded deviation:** section headings are `h2` and `CaseStudyArtifacts` prints a
fixed `h4` (`CaseStudyArtifacts.tsx:83`), so this band skips `h3`. Documented at
`StoryDetailV2.tsx:64-68`. `CaseStudyArtifacts` is the only one of the ten with a hardcoded
heading tag; **adding `headingLevel` to it is the single cleanest fix available inside the
closed set** — a prop addition, no new file, no contract change.

### Band 14 — SURFACE CTA `cta`

| | |
|---|---|
| **Feeds from** | `record.cta`, which is the surface profile's CTA (`caseStudySurfaceProfiles.ts:53`) |
| **Renders via** | `CaseStudyCTA` in a `.cbv2-section--inverse` band (`StoryDetailV2.tsx:356-362`) |
| **When absent** | Never absent. `isSectionSupported` returns true unconditionally (`storyDetailV2Model.ts:105-107`) and `CaseStudyCTA` has no null guard — it returns `React.ReactElement`, not `\| null` (`CaseStudyCTA.tsx:37`) |
| **Required** | **Required** |

Already fully per-surface. No change proposed. See `SURFACE_LENS_MODEL.md`.

---

## 5. The locked rhythm

Combining the above. Bands marked `[existing]` need no new component.

| Order | Band | Key | Tone | Required |
|---|---|---|---|---|
| 1 | Hero (reduced) | `hero` | `--inverse` (pagehero) | Required |
| 2 | Context strip (facts + indicators, moved out of hero) | `hero` | default | Auto-hides |
| 3 | The shift | `situation` `[existing]` | default | Optional |
| 4 | Major visual | figure band `[existing]` | `--sunken` | Optional |
| 5 | The decision (constraints + goals) | inside `situation` | default | Optional |
| 6 | Pull quote | **new** page-local | `--sunken` | Optional |
| 7 | What we built / how it works / architecture | `architecture` `[existing]` | default | Optional |
| 8 | Product media | figure band + carousel `[existing]` | `--sunken` | Optional |
| 9 | The build (chronology) | `build` `[existing]` | default | Optional |
| 10 | What changed | `measurement` `[existing]` | default | Optional |
| 11 | Second quote | same band as 6 | `--sunken` | Optional |
| 12 | What's next | `roadmap` `[existing]` | default | Optional |
| 13 | Who built it | `contributors` `[existing]` | default | Optional |
| 14 | Artifacts | `artifacts` `[existing]` | default | Optional |
| 15 | Repositories and provenance | `repositories` `[existing]` | default | Optional |
| 16 | Surface CTA | `cta` `[existing]` | `--inverse` | Required |

**The tone rule that makes this a grammar rather than a list:** alternate `default` and
`--sunken` so that every *visual* band sits on sunken ground and every *prose* band sits on
default ground. A reader then learns in two screens that a change of ground means a change
of medium. This is one CSS class per band and no new modifier.

**The two invariants that must survive any reordering:**

1. A figure may only occupy a gap that `figureAllowedAfter` permits
   (`storyFigurePlacement.ts:75-79`). Atmosphere photography never follows a proof band.
2. Order comes from `surface.sectionOrder`, never from the page
   (`storyDetailV2Model.ts:139`). The rhythm above is therefore a **profile default**, not
   a hardcoded sequence — which is exactly what makes it reusable across the four lenses.

---

## 6. Consistency with `CASE_STUDY_AUTHORING_TEMPLATE.json`

Fields the template implies that the format **cannot render today**:

| Template field | Template line | Status |
|---|---|---|
| `situation.constraints` | `:47` | **Authored, gated, never projected.** Populated at `caseStudyProjectSource.ts:340-344`; scanned at `caseStudyPublishClaimScan.ts:70`; absent from `PublicCaseStudyNarrative` (`caseStudyPublicTypes.ts:146-149`). See Band 5 |
| `situation.goals` | `:48` | Same as above (`caseStudyPublishClaimScan.ts:71`) |
| `architecture.dataStores` | `:62` | **Authored, built, never projected.** Assembled at `caseStudySnapshotSections.ts:164`, `:177`; absent from `PublicCaseStudyArchitecture` (`caseStudyPublicTypes.ts:170-192`). Silently invisible |
| `taxonomy.deliverables` | `:36` | Projected onto the summary (`caseStudyPublicTypes.ts:290`) but **not onto the detail record** — a detail page cannot render deliverables |
| `identity.productionStatus.status` values `in_production \| pilot \| prototype` | `:26` | The public enum is `CaseStudyRoadmapStatus` = `shipped \| in_progress \| paused \| not_pursued \| unknown` (`caseStudySurfaces.ts:178-185`). **Three of the four documented values have no label.** UNVERIFIED whether a mapping exists upstream; I found none in the projection |
| `taxonomy.builtByType: "client \| partner"` | `:37` | `CaseStudyBuiltByType` is `learner \| intern \| client_team \| colaberry_team \| ai_flotation_team \| joint_team` (`caseStudySurfaces.ts:169-176`). `client` and `partner` are **not members** |
| `_verificationMethods` | `:137` | Lists five; the label map carries six — it also has `manual` -> "Reviewed" (`caseStudySurfaces.ts:158-167`). Template is missing one |

Things the format renders that the template **does not mention**:

| Rendered | Where | Template |
|---|---|---|
| `engagementDuration` (hero fact "Duration") | `storyDetailV2Model.ts:216` | absent |
| `programLabel` (hero fact "Program") | `storyDetailV2Model.ts:212` | absent |
| `buildTimeline` | `CaseStudySnapshotContent` `:490`; renders as the `build` band | absent — the template has no timeline section at all, yet "The build" is a shipping band |
| `contributors` | `:494`; `StoryContributors` | mentioned only as consent flags in `identity` |
| `repositories` | `:496`; `StoryRepositories` | absent |
| `metric.unit` | rendered in the evidence rows (`storyDetailV2Model.ts:186`) | absent from the metric block |

**Recommendation:** the template is the artefact the product owner will actually fill in, so
these gaps are user-facing. Two are corrections (`builtByType`, `productionStatus` enums are
simply wrong and will be rejected); three are missing sections (`buildTimeline`,
`repositories`, `contributors`) that produce silently thinner pages; three are fields that
will be filled in and never appear (`constraints`, `goals`, `dataStores`). The last group is
the most damaging, because the author has no way to discover the field did nothing.

---

## 7. What the current architecture genuinely cannot express

Honest list. These are not oversights to route around; they are things a proposal must
either accept or explicitly fund.

1. **A quote of any kind.** No field, no component, and a publish gate whose default answer
   is refusal (`caseStudyPublishClaimScan.ts:229-241`). Adding one is net-new capability
   running against a control built to remediate a specific incident.

2. **A "decision" or "lessons" narrative as such.** `CaseStudySectionKey` has ten members
   and none of them is a rationale or a retrospective
   (`caseStudyPublicTypes.ts:116-126`). The closest existing content is `constraints`,
   `goals` and `limitations`.

3. **Per-section headings that vary by surface.** The wire carries `situation.heading`, but
   the server hardcodes the string (`caseStudyPublicSections.ts:264`) and every other
   heading comes from a client-side constant map (`storyDetailV2Model.ts:64-75`). No
   surface can rename a band today.

4. **An authored position for any image.** Placement is entirely computed
   (`storyFigurePlacement.ts:96-127`). An author cannot say "this screenshot is the hero
   visual". This is the single biggest gap between "a template that never looks broken" and
   "a designed page".

5. **Anything richer than a paragraph inside a narrative band.** Prose is
   `readonly string[]` and the renderer decides markup, never the API
   (`caseStudyPublicTypes.ts:145-149`). No emphasis, no inline links, no lists inside
   prose. This is a deliberate anti-injection posture and **should not be relaxed**; if a
   band needs structure, it needs a typed field, not markup in a string.

6. **A band that renders on the strength of a component's return value.** Visibility is
   decided from data before mount (`storyDetailV2Model.ts:100-128`). Any new band must
   supply a data predicate, or it will print a heading over nothing.

7. **`deliverables` on a detail page.** Present on the summary projection, absent from the
   detail projection (`caseStudyPublicTypes.ts:290` vs `:302-335`).

8. **Lazy-loading this route.** The page depends on primitives defined in four other page
   stylesheets and resolves only because `App.tsx` imports every V2 page statically
   (`storyDetailV2.css:14-23`). Locking the grammar should start by moving those primitives
   into `publicV2.css`.

---

## 8. Recommended sequence

Ordered by value per unit of risk. Nothing here is implemented.

| # | Change | Cost | Touches new schema? |
|---|---|---|---|
| 1 | Move shared V2 primitives into `publicV2.css` | CSS only | No |
| 2 | Project `situation.constraints` + `.goals` (Band 5) | 1 type, 1 projector, 1 renderer | No — fields exist |
| 3 | Apply the tone alternation of section 5 | CSS only | No |
| 4 | Move facts + indicators out of the hero (Band 1) | JSX placement + CSS | No |
| 5 | Surface-supplied section headings (Bands 2, 10) | profile field + wire field | No new content |
| 6 | Add `headingLevel` to `CaseStudyArtifacts` | one prop | No |
| 7 | Authored figure placement hint (Band 3) | 1 optional field + placer change | Small |
| 8 | Project `architecture.dataStores` | 1 type + 1 projector | No — field exists |
| 9 | "What we learned" via `limitations` (Band 12, route 2) | renderer only | No |
| 10 | Pull-quote band (Bands 4/11) | new field, new component, provenance work, gate coverage | **Yes — do last** |

Items 1 through 6 add no content field at all and account for most of the visual change the
owner is asking for.

---

## 9. Cross-references

> **Amendment, recorded after this document and `SURFACE_LENS_MODEL.md` were
> reconciled.** The two were written concurrently and contradict each other in four
> places. `STORY_STUDIO_PLAN.md` section 1 resolves them and is authoritative where
> they disagree. The two resolutions that change how this document should be read:
>
> - **Section 5's table is a TONE grammar, not an order.** `SURFACE_LENS_MODEL.md`
>   section 3.1 is authoritative for band order, because order is a profile field
>   (`sectionOrder`) and this document's own second invariant defers to it.
> - **Section 4 Band 2's heading mechanism is superseded.** Per-band headings come
>   from a new profile field `sectionHeadings`, not from the per-record
>   `situation.heading`: a record field cannot vary by surface by construction.
>   See `SURFACE_LENS_MODEL.md` section 5.1.

- `SURFACE_LENS_MODEL.md` — how one record reads differently on four surfaces.
- `STORY_STUDIO_PLAN.md` — the reconciliation, and the staged plan B through E.
- `STORY_STUDIO_TEST_PLAN.md` — how each stage is proved.
- `STORY_STUDIO_CURRENT_STATE.md`, `STORY_ASSET_MODEL.md` — owned by a sibling workstream;
  backend mapping and asset model.
- `docs/case-study/CASE_STUDY_AUTHORING_TEMPLATE.json` — the authoring reference; see
  section 6 for the reconciliation.
