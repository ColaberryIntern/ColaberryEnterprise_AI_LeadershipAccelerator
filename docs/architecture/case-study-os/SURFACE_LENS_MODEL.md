# SURFACE_LENS_MODEL

**How one canonical Case Study record reads differently on four surfaces, as configuration
rather than four implementations.**

Status: DESIGN. Checkpoint A. No feature code was written to produce this document. Every
structural claim carries a `file:line`. Anything unverified is marked UNVERIFIED.

Companion: `STORY_FORMAT_V1.md` (the band grammar). This document is about *framing*.

---

## 1. The decision this document is built on

**Surfaces share the canonical narrative body. Only framing varies.**

Framing means: title, standfirst, section order, section headings, emphasis, CTA, and which
assets lead. Per-surface prose is explicitly deferred and **is not designed here**. There
are not four narratives; there is one record and four lenses over it.

This is not only an editorial decision, it is the decision the codebase already made. The
projection reads one snapshot and one publication row and produces one body
(`backend/src/services/caseStudy/caseStudyPublicProjection.ts:194-251`). The only
per-surface inputs it takes are the profile and two publication override columns. Designing
four narratives would mean four snapshots, and the snapshot is content-hashed and
version-pinned specifically so that "what was published" is a single identifiable thing
(`caseStudySnapshotStore.ts:48-56`; `models/CaseStudyPublication.ts:53`).

**Consequence to hold onto:** a lens can reorder, rename, re-emphasise and re-CTA. A lens
can never make a claim the record does not already carry. Section 5 turns that from a
principle into a mechanism.

---

## 2. What varies per surface today, field by field

All four profiles are constructed by one helper, `profile()`
(`caseStudySurfaceProfiles.ts:36-56`), and the table is frozen at `:58-125`. The wire shape
delivered to the client is `PublicSurfaceView`, built field by field at
`backend/src/routes/publicCaseStudyRoutes.ts:143-163` and mirrored at
`frontend/src/services/caseStudyPublicTypes.ts:344-353`.

`publishable` and `defaultFilters` are deliberately withheld from the wire
(`publicCaseStudyRoutes.ts:142`).

| Field | Differs across the 4 profiles? | Consumed by the detail page? | Evidence |
|---|---|---|---|
| `key` | Yes | Yes — tracking dimension only | `StoryDetailV2.tsx:117` |
| `brandLabel` | Yes | Yes — **one use**: the JSON-LD publisher name | `storyDetailV2Model.ts:295` |
| `hero.eyebrow` | Yes | Yes | `StoryDetailV2.tsx:296` |
| `hero.title` | Yes | **No** — index only | `StoriesV2.tsx:199` |
| `hero.description` | Yes | **No** — index only | `StoriesV2.tsx:199` |
| `cta` | Yes | Indirectly — the detail page reads `record.cta`, which the projection copies from the profile | `caseStudyPublicProjection.ts:237-241`; `StoryDetailV2.tsx:359` |
| `sectionOrder` | **No** — identical for all four | Yes | hardcoded `SECTION_ORDER` at `caseStudySurfaceProfiles.ts:51`, consumed `storyDetailV2Model.ts:139` |
| `hiddenSections` | **No** — `[]` for all four | Yes | `caseStudySurfaceProfiles.ts:52`, consumed `storyDetailV2Model.ts:140` |
| `emphasis` | Yes | **No — zero consumers anywhere in `frontend/src`** | declared `caseStudyFilters.ts:133-138`; grep for consumers returns only comments |
| `defaultSort` | **No** — `'featured'` for all four | Index only | `caseStudySurfaceProfiles.ts:50` |

**So, truthfully: today a surface varies by five strings and a CTA.** Two of those five
(`hero.title`, `hero.description`) never reach the detail page. `emphasis` — the field whose
docstring says it is "what this surface leads with" — is dead data on the wire.
`sectionOrder` and `hiddenSections`, the two fields that could actually change how a record
reads, carry identical values in all four profiles.

The **mechanism** for per-surface ordering exists and is correct. It has simply never been
given different values.

### 2.1 Per-publication overrides: wired, applied, and unwritable

`case_study_publications.surface_title_override` and `surface_summary_override` exist:

- DDL — `backend/src/db/ensureCaseStudySchema.ts:307-308`
- Model — `backend/src/models/CaseStudyPublication.ts:33-34`, `:58-59`, `:81-82`
- Read — `caseStudyPublicStore.ts:140-141`
- **Applied** — `caseStudyPublicProjection.ts:145-146`:
  `title: text(publication.titleOverride) || text(content?.identity?.title)`

**No application code writes either column.** The only three writes to
`case_study_publications` are `caseStudyPublicationService.ts:302-308`, `:324-331` and
`:406`, and none names an override. No admin route accepts them: `updateBody`
(`caseStudyAdminRoutes.ts:105-121`) covers `case_studies` editorial fields, `publishBody`
(`:140`) is `{surfaceKey?, snapshotId?}`. **There is no publication editor.** The columns
can only become non-null by direct SQL.

Two consequences worth recording:

1. The admin preview deliberately blinds itself to them —
   `caseStudyAdminPreview.ts:61-62` hardcodes both to `null`, with the rationale at `:36-38`
   that an override "belongs to the publication editor". That editor does not exist, so the
   preview is faithful to production by accident rather than by design.
2. The operator is `||`, not `??`. An override set to an empty or whitespace string falls
   through to the snapshot value, because `text()` trims. **"Blank it out to hide the
   title" is not expressible**, and any publication editor must therefore treat "clear the
   override" as writing `NULL`, not `''`.

### 2.2 Surface selection is hardcoded, and the read path does not gate on it

```
publicCaseStudyRoutes.ts:124-126
export function resolveRequestSurface(_req: Request): CaseStudySurfaceKey {
  return 'enterprise';
}
```

The parameter is `_req`. Nothing on the request is consulted; call sites are `:260`,
`:336`, `:364`. There is no `?surface=` param, no route prefix, no header. Unknown query
keys are ignored rather than rejected (`schemas/publicCaseStudySchema.ts:13-15`), so
`?surface=training` today is silently dropped — neither honoured nor 400'd.

**Safety finding that must survive into implementation.** The read-time visibility gate does
**not** consult `publishable`:

```
caseStudyFilterService.ts:200-209
if (candidate.surfaceKey !== surfaceKey) return false;
if (candidate.publicationStatus !== 'published') return false;
if (!candidate.hasApprovedSnapshot) return false;
if (candidate.archived) return false;
```

`publishable: false` protects the **write** path only — `ruleSurface`
(`caseStudyPublishRules.ts:179-185`), first rule run at `caseStudyPublishGate.ts:162`,
against `PUBLISHABLE_SURFACE_KEYS = ['enterprise']`
(`backend/src/types/caseStudy.ts:518`). The reason a non-enterprise record cannot be read
today is that none can be created, not that reading is refused.

Therefore: **if `resolveRequestSurface` is ever changed to honour a request parameter, any
published non-enterprise record becomes publicly readable in the same commit.** That is
acceptable when it is intended and dangerous when it is a side effect of building a preview.
Section 6 keeps the preview entirely off the public route for this reason.

I found no non-test consumer of `profile.publishable` at all — `surfaceView()` strips it
(`publicCaseStudyRoutes.ts:142`). Negative grep, not a formal proof: UNVERIFIED as
exhaustive.

---

## 3. The four lenses

Each lens is defined by the question its reader arrived with, the angle that answers it
truthfully, and the false claim it must not make.

### 3.1 Enterprise — "Can you help my organization respond to this change?"

| | |
|---|---|
| **Leads with** | the situation, then what changed |
| **Order** | `situation` -> `measurement` -> `architecture` -> `roadmap` -> proof |
| **CTA** | "Map an opportunity" -> `/lab` (`caseStudySurfaceProfiles.ts:71-77`) |
| **Truth risk** | low — this is the surface the record was authored for |

The buyer's question is about *transferability*, so the band that has to land is
`measurement` and the band that makes it credible is `limitations`. This lens should lead
with the problem and the change, and treat architecture as evidence rather than as the
subject.

### 3.2 Training — "Will this prepare me for the work AI is creating?"

| | |
|---|---|
| **Leads with** | who built it, and what the build consisted of |
| **Order** | `situation` -> `contributors` -> `build` -> `artifacts` -> `architecture` |
| **CTA** | "See the program" -> `/programs` (`caseStudySurfaceProfiles.ts:86-92`) |
| **Truth risk** | **medium — the highest of the four** |

The learner's question is about *themselves*, so the two bands that answer it are
`contributors` (who did this, and were they like me) and `build` (what did the work actually
consist of).

**The truth risk is structural, and it is worth naming even though the brief did not.** The
pilot record's `builtBy` is `colaberry_team`, verified live on 2026-08-25. A Training lens
that leads with "what our learners built"
(`caseStudySurfaceProfiles.ts:85`) over a record built by staff makes a false implication
using nothing but section order. The mechanism in section 5.4 is what prevents it: the
`builtBy` hero fact (`storyDetailV2Model.ts:218`) is attribution and may never be hidden by
a lens.

Note also that on the pilot record `contributors` is `[]` and `anonymousContributorCount` is
`0` (verified live), so the band the Training lens most needs **does not render at all** on
the flagship record. A Training lens over that record would lead with an absence. This is a
content problem, not an architecture problem, and it should be surfaced to the product owner
before Training is enabled.

### 3.3 AI Flotation — "Can you actually design and deliver sophisticated AI-native systems?"

| | |
|---|---|
| **Leads with** | the architecture and the production evidence |
| **Order** | `architecture` -> `build` -> `repositories` -> `measurement` -> `situation` |
| **CTA** | "Start a conversation" -> `/contact` (`caseStudySurfaceProfiles.ts:101-107`) |
| **Truth risk** | **high — named by the product owner** |

The delivery buyer's question is about *capability*, so the bands that answer it are
`architecture` (was this designed or assembled) and `repositories` (can I read the source).
This lens is the strongest argument for the `repositories` band leading rather than closing.

**Constraint: AI Flotation must not imply it originally built this platform.**

The record itself already refuses the claim. `builtBy` on the pilot is `colaberry_team` and
`organizationLabel` is `Colaberry` (verified live). `CaseStudyBuiltByType` carries
`ai_flotation_team` as a distinct member (`config/caseStudySurfaces.ts:169-176`), so the data
model can already tell the two apart at the record level and at the contributor level
(`PublicCaseStudyContributor.kind`, `caseStudyPublicTypes.ts:209-222`).

The truthful angle is therefore **not** a copy problem. It is: *publish the record with its
attribution intact, and let the surface CTA carry the offer.* "Talk to the team that shipped
it" (`caseStudySurfaceProfiles.ts:105`) is already careful — it points at a conversation,
not at authorship. The failure mode is a lens that hides `contributors` or drops the
"Built by" hero fact and then leads with an architecture band under an AI Flotation
masthead. Nothing today prevents that; section 5.4 proposes the field that does.

### 3.4 Refactored — "How was this build architected, governed and verified?"

| | |
|---|---|
| **Leads with** | the timeline and the provenance |
| **Order** | `build` -> `architecture` -> `repositories` -> `artifacts` -> `roadmap` |
| **CTA** | "Explore Refactored" -> `/refactored` (`caseStudySurfaceProfiles.ts:116-122`) |
| **Truth risk** | **high — named by the product owner** |

This reader wants *method*, so the bands are `build` (chronology, sourced from repository
evidence — `TIMELINE_SOURCE_LABELS`, `config/caseStudySurfaces.ts:257-263`) and
`repositories`.

**Constraint: Refactored must not imply it governed work predating it.**

Unlike the AI Flotation case, the record carries no field that dates the governance
relationship. `builtBy` says who built; nothing says who *governed*, and the timeline entries
carry a `sourceKind` (`repository | delivery | artifact | milestone`) but not a governing
system.

So the honest expression here is narrower than a lens, and it is a sentence rather than a
field: **Refactored's claim is about the record, not about the work.** What Refactored can
truthfully say is that the timeline shown was assembled from repository evidence and the
provenance shown was resolved by the platform — both of which are true of the *record*
whenever it was produced, regardless of when the work happened. The existing profile copy
already gets this right: "Project records assembled from platform facts and repository
evidence" (`caseStudySurfaceProfiles.ts:115`) is a claim about assembly, not about
oversight.

**Design rule that follows:** the Refactored eyebrow and CTA may describe how the *record*
was produced. They may not use governance verbs ("we governed", "built under", "delivered
by") about the *project*. If a future field records when a project came under platform
governance, this constraint can become mechanical; today it is an editorial rule on two
strings, and it should be written into the profile as a comment beside them so it is not
lost.

Recommendation: because both high-risk constraints live in copy that only a human can judge,
`publishable` should stay `false` for `ai-flotation` and `refactored`
(`caseStudySurfaceProfiles.ts:96`, `:111`) until the profile copy for each has been reviewed
by the product owner and the attribution floor in 5.4 exists.

---

## 4. What the four lenses need that today's profile shape cannot express

| # | Need | Expressible today? | Why not |
|---|---|---|---|
| 1 | Rename a band per surface ("The shift" vs "The situation") | **No** | Headings are a client-side constant map (`storyDetailV2Model.ts:64-75`) plus one hardcoded server string (`caseStudyPublicSections.ts:264`) |
| 2 | Lead with a different band | **Yes, unused** | `sectionOrder` works (`storyDetailV2Model.ts:139`) but is identical in all four profiles (`caseStudySurfaceProfiles.ts:51`) |
| 3 | Suppress a band for one surface | **Yes, unused, and unguarded** | `hiddenSections` works (`:140`) but nothing stops it hiding attribution |
| 4 | Lead with different assets (a screenshot on Training, a diagram on AI Flotation) | **No** | `artifacts[]` is projected whole; placement is computed by `placeStoryFigures` with no surface input (`storyFigurePlacement.ts:96-127`) |
| 5 | Make `emphasis` do anything | **No** | Zero consumers in `frontend/src` |
| 6 | A per-audience title / standfirst | **No (write side)** | Applied at `caseStudyPublicProjection.ts:145-146`, written nowhere. See 2.1 |
| 7 | Serve a second surface at all | **No** | `resolveRequestSurface` hardcodes `'enterprise'` (`publicCaseStudyRoutes.ts:124-126`), and the read gate does not check `publishable` (2.2) |
| 8 | Guarantee a lens cannot make a false claim | **No** | No constraint on `hiddenSections`; see 3.3 |

---

## 5. The minimum extension

Five changes. Four are data. None adds a component, and none creates per-surface prose.

### 5.1 `sectionHeadings` on the profile — the highest-value single field

```
readonly sectionHeadings: Partial<Record<CaseStudySectionKey, string>>;
```

Added to `CaseStudySurfaceProfile` (`backend/src/types/caseStudyFilters.ts:119-139`),
populated per profile in `caseStudySurfaceProfiles.ts`, emitted by `surfaceView()`
(`publicCaseStudyRoutes.ts:143-163`), mirrored on `PublicSurfaceView`
(`caseStudyPublicTypes.ts:344-353`), and consumed in `StorySectionList.tsx:71-75` as the
first choice ahead of `SECTION_HEADINGS`.

`Partial` is deliberate: an unset key falls back to the existing constant, so adding the
field changes nothing until a profile opts in. This single field delivers "THE SHIFT" on
Training and "What changed" on Enterprise with **no component change and no content
change**.

It also retires a dead code path. `StorySectionList.tsx:72-74` already prefers
`record.situation.heading`, but the server hardcodes `'The situation'`
(`caseStudyPublicSections.ts:264`), so the override can never differ. Once headings come
from the profile, the per-record heading should be removed rather than left as a second,
never-varying mechanism.

### 5.2 Give the four profiles different `sectionOrder` values

Data only. No schema change, no code change — `profile()` currently passes the same
`SECTION_ORDER` constant to all four (`caseStudySurfaceProfiles.ts:51`); it becomes a
parameter. The orders proposed in section 3 are the starting values.

### 5.3 Asset emphasis that orders but never filters

```
readonly leadArtifactTypes: readonly CaseStudyArtifactType[];
```

Consumed by `placeStoryFigures` (`storyFigurePlacement.ts:96-127`) as a **sort key applied
before allocation**, so an AI Flotation lens meets the architecture diagram first and a
Training lens meets a screenshot first — out of the same artifact list.

**It must order, never filter.** A lens that can drop artifacts can drop the inconvenient
one, and the whole point of the module is that a record's evidence is not audience-dependent.
The existing rules stay in force above it: `figureAllowedAfter` (`:75-79`) and the
constrained-kind-first pass (`:123-124`) are not overridable by a profile.

This is the one extension that touches placement logic rather than data alone, and it is
worth doing only after `STORY_FORMAT_V1.md` Band 3's authored placement hint, because the
two interact.

### 5.4 `requiredSections` — the attribution floor

```
readonly requiredSections: readonly CaseStudySectionKey[];
```

Enforced in `visibleSections` (`storyDetailV2Model.ts:135-149`) by subtracting
`requiredSections` from `hiddenSections` before the walk, so **a profile cannot hide a band
on the floor**, whatever it puts in `hiddenSections`.

Floor for all four surfaces: `['contributors', 'repositories', 'cta']`. Plus the "Built by"
hero fact (`storyDetailV2Model.ts:218`) must not become surface-conditional.

This is the mechanism that turns section 3's truthfulness constraints from editorial
intentions into a property of the system. It is the difference between "AI Flotation should
not imply it built this" and "AI Flotation *cannot* hide who did".

A band still hides when the **record** has nothing to say — `isSectionSupported`
(`storyDetailV2Model.ts:100-128`) is unchanged and still authoritative. The floor constrains
the lens, never the data. That distinction is the whole design: **a lens may not choose to
be silent about attribution, but a record with no contributors is still allowed to be
quiet.**

### 5.5 Retire `emphasis`, or wire it

`emphasis` is on the wire with zero consumers. Leaving a field whose docstring claims it
governs "what this surface leads with" (`caseStudyFilters.ts:133-137`) while
`sectionOrder` actually does is a trap for the next reader.

Either delete it from `PublicSurfaceView` (`publicCaseStudyRoutes.ts:160`;
`caseStudyPublicTypes.ts:351`) and keep it server-side as editorial notes, or make it the
`leadArtifactTypes` of 5.3. **Recommend deletion from the wire.** Ordering is
`sectionOrder`'s job and now `leadArtifactTypes`'; a third ordering concept invites drift.

### 5.6 Deferred, and deliberately

- **A publication editor** to write the two override columns (2.1). Needed before
  per-audience titles are real. It is a route plus a form, not a design problem — but note
  the `||` semantics: clearing must write `NULL`.
- **Honouring a surface parameter on the public API** (2.2). Not until a second surface is
  genuinely publishable, because the read gate does not check `publishable` and the change
  is one line away from exposing anything published to a non-enterprise surface.
- **Per-surface prose.** Explicitly out of scope per the product owner.

---

## 6. The admin surface preview switcher

### 6.1 What already exists

More than expected. **The per-surface projection pipeline is already complete end to end.**

- `GET /api/admin/case-studies/:id/preview` — `caseStudyAdminRoutes.ts:357-367`.
- It **already accepts all four surface keys**: `previewQuery`
  (`caseStudyAdminRoutes.ts:139`) and `previewSchema`
  (`caseStudyAdminReview.ts:182-187`) both use `z.enum(CASE_STUDY_SURFACE_KEYS)`.
- It returns `{ surfaceKey, snapshot, source, decision, readiness, projection }`
  (`caseStudyAdminReview.ts:488-495`), where `projection` is a full `PublicCaseStudyDetail`
  produced by **the same** `projectPublicDetail` the public API uses
  (`caseStudyAdminPreview.ts:53`), pinned by deep-equality in
  `caseStudyAdminPreview.test.ts` (UNVERIFIED — read from the module header at `:21`, not
  from a run).
- `decision` is the **real** gate verdict (`caseStudyAdminReview.ts:460-468`), so previewing
  `training` renders the projection while `decision.allowed === false` carries
  `surface_not_publishable`.

**This is already the only code path in the system that renders a non-enterprise surface,
and it is admin-authorized.** It is the correct foundation and it needs no new endpoint.

The only thing hardcoding one surface is the client:

```
frontend/src/pages/admin/AdminCaseStudyDetailPage.tsx:39
const SURFACE = 'enterprise' as const;
```
used at `:145` (publish), `:166` (preview), `:193` (publication lookup), `:313` (unpublish).

### 6.2 The one field the preview is missing

To render the **real page** rather than a JSON dump, the switcher needs a `PublicSurfaceView`
alongside the `PublicCaseStudyDetail`. `StorySectionList` and `visibleSections` both require
it (`storyDetailV2Model.ts:135-149`).

The preview returns `surfaceKey` (a string) but **not** the surface view. So:

> **Minimum server change: add `surface: PublicSurfaceView` to `CaseStudySurfacePreview`
> (`caseStudyAdminReview.ts:97-104`), built by the same `surfaceView()` helper the public
> route uses (`publicCaseStudyRoutes.ts:143-163`).**

One field, one existing helper, no new endpoint, no duplicated projection. That is the whole
gap between what ships today and a visual four-lens preview.

Second, smaller gap: the preview hardcodes both overrides to `null`
(`caseStudyAdminPreview.ts:61-62`). Once a publication editor exists (5.6), the preview must
read the real publication row for the selected surface or it will show a title that
production will not.

### 6.3 The draft change count

Nothing in the repository computes one. No code compares
`publication.published_snapshot_id` against `latestSnapshot.id`, and no code diffs two
snapshots' `content_hash`.

The operands, however, are already on the same payload. `GET /api/admin/case-studies/:id`
returns `latestSnapshot`, `approvedSnapshot` and `publications[]`
(`caseStudyAdminStore.ts:132-133`; `caseStudyAdminService.ts:207-208`, `:227-241`), and the
admin UI already renders the two version labels side by side without comparing them
(`CaseStudyPreviewPanel` renders JSON; `CaseStudyPublishPanel.tsx:60-69` shows the labels).

**Recommendation: report a state, not a number.** A count implies a field-level diff that
nothing computes, and snapshots are content-hashed wholes
(`caseStudySnapshotStore.ts:48-56`) rather than tracked field edits. An invented count would
be the exact failure this module exists to prevent. Derive instead:

| Condition | Status line reads |
|---|---|
| no publication row for this surface | `not published` |
| `published_snapshot_id === latestSnapshot.id` | `live matches draft` |
| `published_snapshot_id !== latestSnapshot.id` | `draft is ahead: v{latest} vs live v{published}` |
| no snapshot at all | `nothing to publish` |

Versions are already carried (`preview.snapshot.version`, rendered today at
`CaseStudyPreviewPanel.tsx:117`), and `preview.source`
(`'approved_snapshot' | 'latest_draft' | 'none'`, `caseStudyAdminReview.ts:456-458`) already
says which snapshot the reader is looking at. If a true count is wanted later, it should be
a counted diff of snapshot content paths — the same path vocabulary
`caseStudyPublishClaimScan.ts:70-71` already walks — and not a guess.

### 6.4 The control

Segmented tabs, not a slider. Four discrete lenses are not a continuum, and a slider implies
interpolation between two surfaces, which is meaningless here.

```
+--------------------------------------------------------------+
| [ ENTERPRISE ] [ TRAINING ] [ AI FLOTATION ] [ REFACTORED ]   |
+--------------------------------------------------------------+
| canonical truth   Colaberry team - verified (repo) - shipped  |
| surface lens      Training                                    |
| publication       not published - gate: would refuse          |
|                   (surface_not_publishable)                   |
| draft state       draft is ahead: v7 vs live v5               |
+--------------------------------------------------------------+
```

**Status line, and where each value comes from:**

| Line | Source |
|---|---|
| canonical truth | `projection.builtBy`, `verificationClass`, `verificationMethod`, `productionStatus`, `organizationLabel` — from `CaseStudySurfacePreview.projection` |
| surface lens | `preview.surfaceKey` (`caseStudyAdminReview.ts:488`) |
| publication state | `detail.publications.find(p => p.surfaceKey === key)` plus `preview.decision.allowed` and `decision.codes` (`caseStudyAdminReview.ts:460-468`) |
| draft state | derived per 6.3 |

**Why "canonical truth" is the first line and not the last.** It is the line that proves the
lens did not change the facts. Those five values are read off the projection and must be
**identical across all four tabs** — they come from the snapshot, not the profile. If
switching tabs changes any of them, the lens model has been violated and the operator sees
it immediately rather than discovering it after publish. That property is worth an assertion
in the test suite, not only a rendering.

**Behaviour**

- Switching a tab refires `previewCaseStudy(id, { surfaceKey })`
  (`frontend/src/services/caseStudyAdminApi.ts:96-101`). The endpoint writes nothing
  (`caseStudyAdminRoutes.ts:355`), so switching is free and repeatable.
- A refusing gate does **not** block the preview. Training and the other two will render the
  projection with `decision.allowed === false`. That is the point: an operator needs to see
  what a lens would look like before deciding whether to make it publishable.
- Publish and unpublish keep using the surface the operator is actually publishing to. The
  existing `SURFACE` constant at `AdminCaseStudyDetailPage.tsx:39` should be split: preview
  follows the tab, publish follows an explicit choice. **Silently binding publish to the
  preview tab is the one dangerous version of this feature** — an operator idly exploring
  the Training lens must not be one click from publishing to it.

**Accessibility**

- `role="tablist"` with four `role="tab"` controls and arrow-key navigation; the preview
  region is the `tabpanel`. A tab list is correct because the tabs select which view of one
  object is shown.
- Minimum 44x44px targets and visible focus rings, per `frontend/CLAUDE.md`.
- The status line is a `<dl>` in a `aria-live="polite"` region so a change of lens is
  announced rather than silently repainted.
- The active lens must be readable without colour — the same rule the roadmap glyphs already
  follow (`config/caseStudySurfaces.ts:187-199`).

**Styling.** If the switcher lives in the admin desk (6.5), it is Bootstrap, matching every
other panel (`CaseStudyPreviewPanel.tsx:92-98`). If it ever renders story presentation
components, those bring `cbv2-` classes and the tokens rule of `STORY_FORMAT_V1.md` 1.3
applies to anything new around them.

### 6.5 Where it lives, and the trap to avoid

**Recommended: the admin desk** — `AdminCaseStudyDetailPage.tsx`, replacing the `SURFACE`
constant with state and upgrading `CaseStudyPreviewPanel` to render the projection through
the story presentation instead of `JSON.stringify` (`CaseStudyPreviewPanel.tsx:157`,
`:197`).

**Rejected: rendering the switcher on the public `/stories/:slug` route for admins.** Three
reasons:

1. It would require the public page to call an admin endpoint, putting admin logic in the
   public bundle.
2. The temptation to gate it in CSS or on a client-side role check is exactly the
   authorization failure this must not have.
3. It buys nothing. The preview already runs the identical projection
   (`caseStudyAdminPreview.ts:53`), so the only difference is surrounding page chrome.

If the real chrome is genuinely wanted, the honest form is a **separate admin-only route**
(e.g. `/admin/case-studies/:id/preview/:surfaceKey`) that renders the presentation
components against the preview payload. It stays server-authorized and it never touches
`resolveRequestSurface`, so the exposure risk in 2.2 is never created.

### 6.6 Authorization: server-side, role-based, no personal identifier

The existing endpoint is already guarded correctly and **needs no new auth surface**:

- `requireAdmin` on the route — `caseStudyAdminRoutes.ts:356`.
- Middleware — `backend/src/middlewares/authMiddleware.ts:58-78`: Bearer required
  (`:60-63`), `jwt.verify` (`:67`), **role check at `:68`** against
  `ADMIN_ROLES = new Set(['admin','super_admin'])` (`:55`).
- Section RBAC — `backend/src/middlewares/mgmtSectionGate.ts:41` maps
  `/api/admin/case-studies` -> `program`.

Rules to carry into implementation:

1. **No CSS hiding, and no client-side role check as the gate.** The server refuses; the
   client merely does not draw a control it cannot use. If the control leaks into the DOM,
   pressing it must produce a 403, not a preview.
2. **No hardcoded personal identifier.** No email allowlist, no user-id constant, no
   `ali@colaberry.com` in any branch. The check is role-based and stays role-based. An
   identifier in a conditional is a permission that cannot be granted, revoked or audited.
3. **`requireAdmin` per route, never `router.use(requireAdmin)`.** Admin sub-routers mount
   with no path prefix, so an unscoped guard applies to every later router. This has caused
   a production outage in this repository — recorded at `caseStudyAdminRoutes.ts:35-39`.
4. The preview endpoint writes nothing (`caseStudyAdminRoutes.ts:355`) and must stay that
   way, so a switcher cannot mutate a record by being clicked.

---

## 7. What this model genuinely cannot express

1. **A different narrative per surface.** By design, and the deferral is correct.
   Re-enabling it later means per-publication snapshots, which would break the
   one-record-one-hash property (`caseStudySnapshotStore.ts:48-56`).
2. **A per-surface metric or artifact selection.** Ordering is proposed (5.3); filtering is
   refused. A record's evidence is not audience-dependent.
3. **A surface-specific verification claim.** `verificationClass` / `verificationMethod` are
   resolved from the record's own evidence (`caseStudyPublicSections.ts:125-145`) and are
   deliberately not reachable from a profile.
4. **A per-audience title today.** The column is applied but unwritable (2.1).
5. **Anything about when governance began.** No field records it, which is why the
   Refactored constraint (3.4) is an editorial rule on two strings rather than a mechanism.
6. **A true field-level draft diff.** Snapshots are content-hashed wholes; only a
   snapshot-level ahead/behind is honestly derivable today (6.3).
7. **Serving a second surface publicly.** One line away, and that line also removes a read
   protection (2.2). It should be a deliberate, separately reviewed change.

---

## 8. Recommended sequence

| # | Change | Cost | Unblocks |
|---|---|---|---|
| 1 | Add `surface: PublicSurfaceView` to the preview response | one field, existing helper | the whole switcher |
| 2 | Segmented control + status line in the admin desk; split preview surface from publish surface | client only | four-lens review |
| 3 | Derive draft ahead/behind from operands already on the payload | client only | the status line |
| 4 | `sectionHeadings` on the profile (5.1) | 4 files, no content change | per-lens band names |
| 5 | Differentiate `sectionOrder` across the four profiles (5.2) | data only | per-lens rhythm |
| 6 | `requiredSections` attribution floor (5.4) | 1 field, 1 predicate | the truthfulness guarantees in 3.3 / 3.4 |
| 7 | Remove `emphasis` from the wire (5.5) | deletion | removes a decoy |
| 8 | `leadArtifactTypes` (5.3) | placement change | per-lens asset lead |
| 9 | Publication editor for the two override columns (5.6) | route + form | per-audience titles |
| 10 | Honour a surface param on the public API (2.2) | one line, plus a read-gate review | a second public surface |

Items 1 through 3 deliver the switcher the product owner asked for. Items 4 through 6
deliver the lens model itself and are all data or predicates. Items 9 and 10 are the two
that change what the public can reach and should be reviewed on their own.

---

## 9. Cross-references

> **Amendment, recorded after this document and `STORY_FORMAT_V1.md` were
> reconciled.** The two were written concurrently and contradict each other in four
> places. `STORY_STUDIO_PLAN.md` section 1 resolves them and is authoritative where
> they disagree. This document wins on **band order** (section 3) and on the
> **heading mechanism** (section 5.1); `STORY_FORMAT_V1.md` wins on **tone**.
>
> One addition this document should have carried: the Enterprise order proposed in
> section 3.1 leads with `measurement`, and on the pilot record `heroMetrics[0]` and
> `measurement.metrics[0]` are the same metric — verified live. That order therefore
> prints the same figure card twice inside one screen, and resolving the duplication
> is a precondition of adopting it. See `STORY_STUDIO_PLAN.md` C-1 and C-entry-2.

- `STORY_FORMAT_V1.md` — the band grammar these lenses reorder.
- `STORY_STUDIO_PLAN.md` — the reconciliation, and the staged plan B through E.
- `STORY_STUDIO_TEST_PLAN.md` — how each stage is proved.
- `STORY_STUDIO_CURRENT_STATE.md`, `STORY_ASSET_MODEL.md` — sibling workstream; backend
  mapping and asset model.
- `docs/case-study/CASE_STUDY_AUTHORING_TEMPLATE.json:139-146` — `_perSurface`, the
  authoring view of this model. Note it documents `surfaceTitleOverride` and
  `surfaceSummaryOverride` as fillable; per 2.1 there is no path to write them today, so an
  author filling them in will see no effect. That should be flagged in the template.
