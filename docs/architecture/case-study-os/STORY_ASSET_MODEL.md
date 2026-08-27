# Story Asset Model — what a canonical asset library would look like, given what exists

**Status: discovery only.** This document proposes no schema and authorises no build. It answers one
question: if the Case Study OS grew a "story asset library", which assets already have a home, which
do not, and for each missing one, **what is the nearest existing pattern to extend** rather than a
greenfield design.

Companion document: `STORY_STUDIO_CURRENT_STATE.md` (the 20-point architecture map and the baseline
test results). Every claim here is cited `file:line` against the worktree at
`C:/Users/ali_m/casestudy-os-wt`, branch `workstream/case-study-os`.

---

## 0. The organising principle already in the code

Before naming individual assets, the important discovery: **the system already sorts every asset into
one of two classes**, and the class determines everything about how a new asset should be built.

### Class A — row-backed assets

A dedicated table. Linked to the Case Study by `case_study_id`. Read by the sync and *projected into*
the snapshot. Characterised by:

- a `status` or `publishable` column **defaulting to the closed state**
  (`case_study_metrics.publishable` defaults `false`, `backend/src/models/CaseStudyMetric.ts:92`;
  `case_study_artifacts.status` defaults `'candidate'`, `backend/src/db/ensureCaseStudySchema.ts:279`;
  `case_study_evidence.is_publicly_openable` defaults `false`, `CaseStudyEvidence.ts:71`)
- a `verification_class` defaulting to `'pending'` (`CaseStudyMetric.ts:81`, `CaseStudyEvidence.ts:70`)
- a **partial unique index** making the import idempotent, scoped `WHERE <source_id> IS NOT NULL` so
  manually-created rows stay unconstrained (`ensureCaseStudySchema.ts:255-257`, `:286-288`)

Members today: metrics, evidence, artifacts, repositories, repo collections, publications.

### Class B — snapshot-embedded assets

No table. Lives only inside `case_study_snapshots.content` (JSONB,
`ensureCaseStudySchema.ts:175`), typed by `CaseStudySnapshotContent`
(`backend/src/types/caseStudy.ts:486-498`). Characterised by:

- authored or corrected through `applyHumanOverride` at a dotted path
  (`backend/src/services/caseStudy/caseStudyAdminReview.ts:234`)
- attributed by one entry in the `provenance` JSONB keyed on that same path, at tier
  `human_override` (`caseStudySnapshotOverrides.ts:148-152`)
- surviving re-sync because the sync re-applies it: `overridesFromSnapshot(latest)` at
  `backend/src/services/caseStudy/caseStudySyncService.ts:329`, and generate-first-override-second at
  `caseStudySnapshotBuilder.ts:251-256`

Members today: narrative prose, build timeline, architecture (narrative, stack, capabilities,
diagram, diagramSource), measurement narrative, roadmap, contributors, taxonomy.

### The rule this yields

> **If the asset needs its own approval lifecycle and its own verification, it is Class A.
> If it is editorial copy about facts held elsewhere, it is Class B.**

A quote needs a named human, a consent record and a reviewer — Class A. A chart is a *rendering* of
numbers that already live in `case_study_metrics` — it must be Class B and must carry metric *keys*,
never its own values, or it becomes a second place a number can be asserted.

Getting this wrong in either direction is the main design risk. A Class-B quote would be an
unverifiable testimonial pasted into prose (which the publish gate already tries to catch and
blocks — see §3). A Class-A chart would let someone type `47%` into a chart row and bypass
`verifiedFigures()` entirely.

---

## 1. Asset-by-asset inventory

| # | Asset | Home today? | Where it lives | Class |
|---|---|---|---|---|
| 1 | Narrative facts | **Yes** | `content.situation/architecture/measurement.narrative` | B |
| 2 | Metrics | **Yes, fully** | `case_study_metrics` + `content.heroMetrics` / `content.measurement.metrics` | A |
| 3 | Quotes | **No** — exists only as a prohibition | `ruleQuotes`, `ai_generated_quote` blocker | — |
| 4 | Diagrams | **Yes, two of them** | `architecture.diagram`, `architecture.diagramSource` | B |
| 5 | Charts | **No** — absent entirely | — | — |
| 6 | Screenshots | **Yes** | `case_study_artifacts`, `artifact_type: 'screenshot'` | A |
| 7 | External references | **No** — absent entirely | — | — |
| 8 | Timeline | **Yes** | `content.buildTimeline` | B |
| 9 | Repositories | **Yes, fully** | `case_study_repositories` + collection | A |
| 10 | Evidence | **Yes, fully** | `case_study_evidence` | A |

Six of ten already have a home. Three of those six are complete enough to serve a Story Studio with
no schema change at all (metrics, repositories, evidence). **Three assets genuinely do not exist:
quotes, charts, external references.**

---

## 2. The assets that already have a home

### 1. Narrative facts — Class B, with one real gap

Three narrative arrays, all `readonly string[]`:

- `CaseStudySituationSection.narrative` — `types/caseStudy.ts:337`
- `CaseStudyArchitectureSection.narrative` — `types/caseStudy.ts:367`
- `CaseStudyMeasurementSection.narrative` — `types/caseStudy.ts:395`

**The gap: only `situation` carries a verification pair.** `CaseStudySituationSection` declares
`readonly verification: CaseStudyVerification` (`types/caseStudy.ts:340`).
`CaseStudyArchitectureSection` (`:366-392`) and `CaseStudyMeasurementSection` (`:394-397`) declare
none. The public projection enforces this asymmetry: `projectSituation` returns `null` unless
`pairOf(s.verification)` passes (`caseStudyPublicSections.ts:259-265`), while `projectArchitecture`
and `projectMeasurement` have no equivalent gate.

Consequence for a Story Studio: architecture and measurement prose reach the public page carrying no
verification claim of their own. They are governed only by the closed-vocabulary claim scan (§3 of
the companion document). **This is the nearest thing to a genuine V-29 and it is a structured-field
gap, not a prose gap.**

### 2. Metrics — Class A, complete

The most finished asset in the system, and the one every numeric surface must route through.

- Table `case_study_metrics` — `models/CaseStudyMetric.ts`, DDL `ensureCaseStudySchema.ts`
- Contract `CaseStudyMetricEntry` — `types/caseStudy.ts:293-306`
- Honesty context `CaseStudyMeasurementContext` — `types/caseStudy.ts:284-290`, where `limitations`
  is a **required** array so "nobody considered it" is distinguishable from "none"

**`heroMetrics` and `measurement.metrics` are not two lists.** They are one list and a filter over
it — `caseStudySnapshotSections.ts:213`:

```
const heroMetrics = all.filter((m) => m.isHeadline);
```

Both are returned from the same `buildMetrics` call (`:216-220`). `isHeadline` selects; it does not
duplicate. Anything new that displays numbers should follow the same shape: **select from the one
list, never assemble a parallel one.**

Two independent locks make a metric publishable: `publishable` (defaults `false`) and
`verification.class` (defaults `'pending'`). `projectMetric` returns `null` unless *both* clear
(`caseStudyPublicSections.ts:149-168`).

### 4. Diagrams — Class B, two distinct concepts

The split is deliberate and is documented as a truth claim, not a rendering choice
(`types/caseStudy.ts:377-391`):

| | `architecture.diagram` | `architecture.diagramSource` |
|---|---|---|
| What it is | normalised verified nodes + edges | human-authored Mermaid |
| Who writes it | hand-curated only (`caseStudySnapshotInput.ts:103`) | human override only — *"nothing generates it"* |
| How it renders | **as text**, by `CaseStudyArchitecture.tsx` | as a chart, `StoryDiagram` → `MermaidDiagram` |
| Boundary rule | node/edge filtering, `id`→`key` rename (`caseStudyPublicSections.ts:242-246`) | `projectDiagramSource` (`:224-230`) |

The sanitisation is four rules, and rule 4 is the one to know
(`caseStudyPublicSections.ts:226-229`):

```
if (source.length > MAX_DIAGRAM_SOURCE_CHARS) return null;
if (source.includes('<')) return null;
```

`<` is refused outright because the renderer writes Mermaid's output to `innerHTML`
(`MermaidDiagram.tsx:80`) and this module deliberately refuses to depend on Mermaid's own
`securityLevel` default three modules away. **Rejection is silent** — it returns `null`, the band
disappears, and a rejected diagram is indistinguishable from a record that never had one. For an
authoring experience that is the first seam to change: make `projectDiagramSource` return a
discriminated result rather than `null`.

Mermaid is **not a bundled dependency**; it is fetched at runtime from a CDN
(`MermaidDiagram.tsx:35-36`, pinned by a contract test that asserts no `mermaid` entry in
`package.json`).

### 6. Screenshots — Class A, with a blocking gap

Screenshots are artifacts. `artifact_type: 'screenshot'` is `presentation: 'evidence'` by derivation,
never by author choice — `caseStudyArtifactPresentation.ts:38-40`. It ranks first in hero resolution
(`HERO_IMAGE_PRIORITY = ['screenshot', 'architecture', 'photo']`, `:54-56`).

**The blocking gap: no code path promotes an artifact to `approved`.** The complete set of writes to
`case_study_artifacts` in `backend/src` is two `findAll` calls and one `create`
(`caseStudyEvidenceSource.ts:350`, `:369`; `caseStudySyncSources.ts:253`). The `create` hardcodes
`status: 'candidate'`, `visibility: 'private'`. There is no `update`, no `destroy`, and no artifact
CRUD route. Since `projectArtifacts` drops anything not `approved`
(`caseStudyPublicSections.ts:331-371`), **the entire hero / carousel / figure surface cannot populate
through the application today.** Any Story Studio that shows images must close this first.

### 8. Timeline — Class B, complete

`CaseStudyTimelineEntry` — `types/caseStudy.ts:343-352`. Carries `date`, `label`, `detail`, a
7-member `source` union (`:265-272`), an internal-only `sourceRef`, and a verification pair. Repo
creation dates are injected as milestones using `createdAt` and never `pushedAt`, because a date that
moves on every push cannot be hashed (`caseStudySnapshotSections.ts` `buildTimeline`).

### 9. Repositories — Class A, complete

`case_study_repositories` inside a `case_study_repo_collections` container. 10-member role union
(`types/caseStudy.ts:198-208`) — note there is **no `supporting` or `reference` role**. Two database
invariants worth reusing as precedent:

```
CREATE UNIQUE INDEX ... cs_repositories_unique_per_collection
   ON case_study_repositories (collection_id, LOWER(repo_owner), LOWER(repo_name))
CREATE UNIQUE INDEX ... cs_repositories_one_primary_per_collection
   ON case_study_repositories (collection_id) WHERE role = 'primary'
```

(`ensureCaseStudySchema.ts:144-145`, `:161-162`.) The second was added after a real race in
`setRepositoryRole`; the rationale is recorded in the DDL at `:146-160`.

Public exposure is opt-in and fails closed: `allowPublicRepoLink` must be `true` **and**
`visibility === 'public'`, and `'unknown'` is not `'public'` (`types/caseStudy.ts:210-211`;
gate blocker `private_repo_exposed`).

### 10. Evidence — Class A, complete, and the model for "link, never mutate"

`case_study_evidence` holds a bare-UUID pointer `evidence_record_id` (nullable —
`CaseStudyEvidence.ts:63`) into the platform's `evidence_records` ledger. The service reads that
ledger and **never writes to it** — asserted twice, statically over the source text and at runtime
with model mocks whose write methods fail the suite if called
(`caseStudyEvidenceSource.ts:5-14`).

`evidence_record_id` nullability is load-bearing: a NULL means manually-created evidence, and the
partial unique index `WHERE evidence_record_id IS NOT NULL` deliberately excludes those so they stay
unlimited (`ensureCaseStudySchema.ts:255-257`).

---

## 3. The three assets that do not exist

### 3. Quotes — present only as a prohibition

There is no quote table, no quote type, no quote field. What exists is the **refusal** of one:

- `AiForbiddenFieldClass` includes `'quote'` — `caseStudyProvenance.ts:107`
- matched by `{ cls: 'quote', key: /quote|testimonial|endorsement/ }` — `:115`
- `ruleQuotes` scans all narrative prose for a 3+-word quotation and emits the
  `ai_generated_quote` blocker when provenance is `ai_draft` **or `unknown`** —
  `caseStudyPublishClaimScan.ts:229-241`

The `unknown` case is the important one, and the file states why
(`caseStudyPublishClaimScan.ts:221-228`):

> Publishing a quotation asserts that a named human said those words; a quotation whose authorship no
> provenance entry records cannot support that assertion, and "we could not establish who wrote it" is
> not a reason to ship it.

So today the only way to get a quotation onto a public page is to paste it into prose and attach a
non-AI provenance entry. That works, but the quotation is then untyped text with no attributed
speaker, no consent record and no reviewer.

**Nearest existing pattern to extend: `case_study_evidence` (Class A), plus the `CaseStudyContributor`
consent shape.**

The fit is close, not approximate:

| A quote needs | `case_study_evidence` already has | Cite |
|---|---|---|
| the words | `title` + `description` | `CaseStudyEvidence.ts:68-69` |
| who said it, with consent | — *(this is the one addition)* | — |
| how it was obtained | `source_type` incl. `'client_confirmation'` | `types/caseStudy.ts:143-151` |
| whether it may be shown | `is_publicly_openable`, defaults `false` | `CaseStudyEvidence.ts:71` |
| verification | `verification_class`, defaults `'pending'` | `:70` |
| a human reviewer | `reviewed_by`, `reviewed_at` | `:73-74` |
| a link to the artefact | `public_url`, `source_ref` | `:72`, `:66` |
| free-form extras | `metadata` JSONB | `:75` |

For attribution, the pattern to copy is **not** a nullable `speaker_name` column. It is
`CaseStudyContributor` — a discriminated union on consent where "named without consent" has no shape
to occupy (`types/caseStudy.ts:414-430`):

```
| { displayMode: 'named'; displayName: string; role: string; kind; consentRecordedAt: IsoDateTime }
| { displayMode: 'role_only'; role: string; kind }
| { displayMode: 'anonymous'; kind }
```

The type comment states the reason directly: *"the publish gate still checks it, but the type makes
the mistake hard to write in the first place."* A quote attributed to a named client is exactly the
same consent problem as a contributor named on a page, and the publish gate already has
`builder_consent` rules (`caseStudyPublishRules.ts:302-312`) that would transfer almost verbatim.

The existing `ruleQuotes` prohibition then becomes the *fallback* rather than the only rule: a
quotation appearing in prose remains blocked, while a quotation carried as a first-class evidence row
with a consent-bearing attribution is publishable.

### 5. Charts — absent, and the one asset with a hard constraint

No chart concept exists anywhere in the Case Study subsystem. Grep for `chart|graph|plot|series|dataviz`
across `services/caseStudy/`, `types/caseStudy*.ts` and `models/CaseStudy*.ts` returns only prose in
comments and the unrelated word "flowchart".

**Where would a chart get its numbers such that it cannot bypass metric verification?**

This is the load-bearing design question and the existing code answers it. `verifiedFigures()`
(`caseStudyPublishClaimScan.ts:135-147`) builds the set of figures a page is allowed to state, and it
draws only from metrics that are **visible, `verified` or `anonymized`, and not `method: 'self'`**.
The prose scan then compares every `%` and currency token against that set by fold-then-compare, and
the file records that containment matching was tried first and rejected because
`'140%faster'.includes('40%')` let a verified figure vouch for an unrelated one (`:150-178`).

A chart that carried its own `values: number[]` would sit entirely outside that mechanism. Nothing
would compare it to anything.

**Therefore: a chart must be Class B and must reference metric *keys*, never carry values.** The
shape that follows from the existing contracts is a chart spec that names
`CaseStudyMetricEntry.key` values (`types/caseStudy.ts:295`) and lets the projection resolve them at
render time through the same `projectMetric` gate that already returns `null` for anything not
`publishable` and verified (`caseStudyPublicSections.ts:149-168`). A chart then cannot show a number
the measurement section would refuse to show, because it is the same number resolved by the same
function.

**Nearest existing pattern to extend:** `architecture.diagram` (`types/caseStudy.ts:373-376`). It is
the precedent for "a visual assembled from structured, verified data, hidden rather than fabricated
when the data is absent", and its sibling `diagramSource` is the precedent for the human-authored
counterpart being a *separate, differently-governed field* rather than an override of the generated
one. A chart is the measurement-section analogue of `diagram`.

Rendering has a precedent too: `CaseStudyArchitecture.tsx` deliberately renders the verified node/edge
list **as text**, because *"a chart drawn from that same list would have to invent a layout the data
does not contain"* (`types/caseStudy.ts:381-386`). Whatever a chart renders must not require inventing
data — bar/line over metric keys with explicit units qualifies; anything needing interpolation does not.

### 7. External references — absent

Zero occurrences of `externalRef|external_reference|citation|pressLink|external_link|referenceUrl`
anywhere in `services/caseStudy/`, `types/caseStudy*.ts` or `models/CaseStudy*.ts`.

**Nearest existing pattern to extend: `case_study_evidence` again (Class A), governed by the
repository link rule.**

An external reference — a press mention, a customer's own blog post, a conference talk — is
structurally an evidence row that happens to point outward:

- `public_url VARCHAR(512)` already exists (`CaseStudyEvidence.ts:72`)
- `source_type` is a closed union that would take one new member alongside
  `'client_confirmation'` and `'internal_measurement'` (`types/caseStudy.ts:143-151`)
- `is_publicly_openable` defaults `false`, and the model header states the governing principle
  directly (`CaseStudyEvidence.ts:8-10`): *"`is_publicly_openable` defaults false for the same reason
  repo links do: public exposure is opt-in, never inherited."*

The link-safety rule to reuse is `safeHttpUrl` (`caseStudyPublicSections.ts:77-88`), which drops
anything not `http:`/`https:` and is described as the stored-XSS boundary. The three-gate repository
pattern (`visibility === 'public'` AND `allowPublicRepoLink === true` AND a valid URL, else increment
a `withheld` counter — `:393-412`) is the exact shape an external reference should copy, including
the honest opaque count rather than silent omission.

---

## 4. What a "story asset library" would be, concretely

Given all of the above, the library is not a new subsystem. It is **a read model over what already
exists, plus three additions**.

### The spine that already exists

```
case_studies                 canonical row, human-owned editorial fields
  └── case_study_snapshots   immutable versioned content, sha256 content-hashed
        └── case_study_publications   one row per (case_study_id, surface_key)
```

`UNIQUE(case_study_id, surface_key)` (`ensureCaseStudySchema.ts:318-319`) is what makes four surfaces
a data question rather than a schema question. Assets attach to the **CaseStudy**, are projected into
the **snapshot**, and are surfaced per **publication** — so an asset is authored once and can appear
on all four lenses without any copy existing twice.

### The three additions, in dependency order

| # | Addition | Class | Extends | Blocked on |
|---|---|---|---|---|
| 1 | **Artifact promotion path** | A | `case_study_artifacts` — add the missing `update` | nothing; this is a gap, not a feature |
| 2 | **Quote** | A | `case_study_evidence` + `CaseStudyContributor` consent union | consent rules in the publish gate |
| 3 | **External reference** | A | `case_study_evidence` + `safeHttpUrl` + the 3-gate repo link rule | nothing |
| 4 | **Chart** | B | `architecture.diagram` shape; references metric keys only | metrics must already be verified |

Addition 1 is listed first deliberately: it is not new capability, it is an existing surface that
cannot populate. Every image-bearing feature depends on it.

### What each addition must inherit to be consistent with the system

1. **Default closed.** `publishable`/`status`/`is_publicly_openable` default to the state that shows
   nothing (`CaseStudyMetric.ts:92`, `CaseStudyEvidence.ts:71`, `ensureCaseStudySchema.ts:279`).
2. **A partial unique index** if it is ever imported from another table, scoped
   `WHERE <source_id> IS NOT NULL` (`ensureCaseStudySchema.ts:255-257`).
3. **A provenance tier**, and never `ai_draft` for anything in the six forbidden field classes
   (`caseStudyProvenance.ts:106-120`). A quote is already one of those six.
4. **A publish-gate rule and a blocker code.** The extension point is the hand-written call list at
   `caseStudyPublishGate.ts:162-179`; the code must be added to *both* the union
   (`caseStudyPublishRules.ts:45`) and the array (`:58`), which are two literals with nothing
   enforcing agreement.
5. **A named key in the public projection literal.** `caseStudyPublicProjection.ts` has no spread, no
   `Object.assign`, no `JSON.parse(JSON.stringify)` — an internal field reaches the public payload
   only when a human types its name (`:5-9`). Plus an entry in `PUBLIC_DETAIL_KEY_MAP`
   (`types/caseStudyPublic.ts:328-360`) and disjointness from `FORBIDDEN_PUBLIC_KEYS` (`:376-404`).

### What the library must *not* do

- **Not carry its own numbers.** Charts reference metric keys. Anything holding a value that is not
  in `case_study_metrics` is a number no rule can check.
- **Not let an author set `presentation`.** Evidence-vs-atmosphere is derived from the artifact type
  and never read from the row, because *"an author-set flag would make 'is this evidence?' an
  editorial field, which is exactly the decision that must not be editable"*
  (`types/caseStudyPublic.ts:166-177`).
- **Not create a second verification vocabulary.** `CaseStudyVerificationClass` and
  `VerificationStatus` in `frontend/src/config/claimsRegistry.ts` are already two deliberately
  unmapped vocabularies, and the reason is recorded at `types/caseStudy.ts:37-45`: the first person
  to write `VERIFIED -> 'verified'` would quietly promote an unevidenced claim. A third would
  compound it.
- **Not assume `assertCaseStudySchema()` will catch a mistake.** It is presence-only: it checks that
  expected tables, indexes and columns exist, and is structurally unable to see an extra column no
  model declares (`ensureCaseStudySchema.ts:455-508`). This is the V-26 finding and it applies to
  every addition above.

---

## 5. Summary

Six of ten candidate assets already have a home, and three of those are complete enough to serve a
Story Studio unchanged (metrics, repositories, evidence). Two more are complete in contract but
blocked in practice: **screenshots cannot be approved** because no update path exists, and
**architecture/measurement narrative carries no verification pair** while situation narrative does.

Three assets are genuinely absent — quotes, charts, external references. **None of them needs a
greenfield design.** Quotes and external references are both `case_study_evidence` extensions, and
the consent shape they need is already written as `CaseStudyContributor`. Charts are the
measurement-section analogue of `architecture.diagram`, and the single constraint that matters is
that they reference metric keys rather than carrying values — because `verifiedFigures()` is the only
thing standing between a number on a page and a number nobody checked.
