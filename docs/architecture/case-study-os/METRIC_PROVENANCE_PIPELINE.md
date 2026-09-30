# Metric Provenance Pipeline — scope, feasibility, recommendation

**Status:** discovery and design only. No feature code, no schema change, no deployment.
**Date:** 2026-08-28
**Branch:** `workstream/case-study-os` (merged `origin/main` before this survey)
**Question asked:** should the Case Study OS grow a producer that computes verified metrics from platform data, emits its own methodology, writes `case_study_metrics`, and lets AI draft prose around numbers it did not produce?

**Answer in one paragraph.** The producer is worth building. The *cohort learner-competency* version of it is not, and not yet for a reason that no amount of engineering fixes: the only live writer into the skill-evidence ledger is timeline card completion, so the platform's "verified competency" number is course completion re-weighted, and a pipeline that auto-generates rigorous-sounding methodology around it would make a weak construct *look* stronger without making it truer. Build the pipeline against repository facts first — data the analyzer already extracts, that is non-personal, that a third party can re-read at a pinned commit, and that needs no consent model. That unblocks metric entry and charts, which is the actual stated blocker, and proves the mechanism on the case where honesty is cheap. Revisit cohort metrics when a second evidence source is live.

---

## 1. What exists

### 1.1 The Case Study metric contract is complete and unusually well-defended

| Piece | Where | Note |
|---|---|---|
| Table | `backend/src/db/ensureCaseStudySchema.ts:193-218` | 20 columns; `publishable` and `verification_class` both default to the refusing value |
| Model | `backend/src/models/CaseStudyMetric.ts:18-106` | Header states the invariant: AI writes `pending` only, never `verified` |
| Contract type | `backend/src/types/caseStudy.ts:293-306` | `CaseStudyMetricEntry` — `key`, `label`, `valueDisplay`, `numericValue`, `unit`, `metricType`, `verification`, `isHeadline`, `publishable`, `measurement` |
| Row → contract | `backend/src/services/caseStudy/caseStudySyncSources.ts:182-211` | Pure. Unreadable `verification_class` degrades to `pending`, never to `verified` |
| Public projection | `backend/src/services/caseStudy/caseStudyPublicSections.ts:149-168` | Allow-list. Returns `null` unless `publishable === true` and both label and value are non-empty |
| Publish gate | `backend/src/services/caseStudy/caseStudyPublishRules.ts:223-231, 345-375` | Blocks pending-but-publishable, blocks `verified`+`self`, blocks `verified` with no `evidenceId` |
| Prose cross-check | `backend/src/services/caseStudy/caseStudyPublishClaimScan.ts:186-199, 317-327` | Every `%` and currency token in prose must match a verified figure exactly |

The verification vocabulary: classes `verified | anonymized | illustrative | pending` (`backend/src/types/caseStudy.ts:47`), methods `client | repo | platform | internal | self | manual` (`:55-61`).

### 1.2 The provenance system already has a slot shaped for exactly this

`backend/src/types/caseStudyProvenance.ts:35-43` orders seven tiers strongest-first. Index 1 — second only to a named human — is **`approved_metric_evidence`**, and `backend/src/services/caseStudy/caseStudyProvenance.ts:94-102` restricts its origin kinds to `case_study_metric` and `case_study_evidence`. That tier exists, outranks every generated tier, and today nothing ever occupies it.

### 1.3 `case_study_evidence` is already the right shape for a run record

`backend/src/models/CaseStudyEvidence.ts:16-35` — `metric_id`, `source_type` (`repo | platform | manual | client | manifest`), `source_ref` (512 chars), `source_commit_sha`, `metadata` JSONB, `created_at`, and deliberately **no `updated_at`** (`:12-14`). The two tables carry bare UUIDs at each other rather than foreign keys precisely so they can be written in either order (`backend/src/models/CaseStudyMetric.ts:11-12`).

This matters more than it looks. It means the "point `evidenceId` at the run, not at a hand-written note" requirement needs **no schema change at all** — the evidence row can *be* the run record.

### 1.4 Charts already resolve against the table

`backend/src/services/caseStudy/caseStudyChartService.ts:83-130` — a chart carries metric *keys* and no values, by four independently failing layers (`:18-25`). `resolveChart` reads `case_study_metrics` and reports every key it could not resolve, with a reason.

### 1.5 The learner-side skill system is real, evidence-weighted, and entirely per-learner

| Piece | Where | Shape |
|---|---|---|
| Evidence ledger | `backend/src/models/StudentSkillEvidence.ts:24-77` | Append-only. `enrollment_id`, `skill_id`, `band`, `credit`, `source`, `idempotency_key` (unique), `mapping_version`, `metadata`, `created_at`. Header states there is **no update or delete code path anywhere** (`:9-11`) |
| Derived state | `backend/src/models/StudentArchitectureSkill.ts:22-84` | A **cache**, full-replace, unique on `(enrollment_id, skill_id)`. `weights_version` records which weights produced `proficiency` |
| Recompute | `backend/src/services/cape/capeProficiencyService.ts:66-110` | Sums evidence credit per band (capped at 100), applies the current weights row, rounds |
| Learner profile | `backend/src/services/cape/capeProficiencyService.ts:179-229` | Ten current skills, `overall_proficiency` = plain mean |
| Weights history | `backend/src/models/ArchitectureSkillEvidenceBandWeights.ts` | Versioned with `is_current`; old versions retained |

The ledger's provenance discipline is genuinely good: idempotency keys, mapping versions, no mutation path, `created_at` on every row. That is the raw material a retrospective baseline would need, and it is present.

---

## 2. What is missing

### 2.1 Nothing writes `case_study_metrics`. Confirmed exhaustively.

Every reference to the model in `backend/src` outside tests:

- `backend/src/models/index.ts:453, 1534, 1825-1826` — registration and associations
- `backend/src/scripts/verifyCaseStudySchema.ts:54, 73` — schema check
- `backend/src/services/caseStudy/caseStudyChartService.ts:84` — `findAll`
- `backend/src/services/caseStudy/caseStudySyncSources.ts:221` — `findAll`

A grep for `create | upsert | update | bulkCreate | destroy` on the model or its alias returns **nothing**. Three reads, zero writes. The table cannot be non-empty except by hand-written SQL.

### 2.2 There is no UI control to create one

`frontend/src/components/admin/caseStudy/CaseStudyMetricsPanel.tsx` is read-only over snapshot metrics (`:45-86`) plus one override field per metric on `valueDisplay` only, for the **first three metrics** (`:90`). Its own footer says the quiet part: *"Editing how a figure READS does not verify it"* (`:104-107`). There is no create control, no verification-class control, no publishable toggle. The admin studio routes (`backend/src/routes/admin/caseStudyStudioRoutes.ts:203-434`) expose storyline, analyze, story-drafts, artifacts, charts and quotes. No metric endpoint exists.

### 2.3 `candidate_metrics: 0` is arithmetically inevitable

`backend/src/services/caseStudy/caseStudySyncService.ts:301` calls `loadCandidateMetrics(caseStudyId)`, which is a `findAll` over an empty table (`caseStudySyncSources.ts:220-228`). Its `.length` becomes `counts.candidateMetrics` (`caseStudySyncService.ts:309`), which the finalize UPDATE writes to `case_study_sync_runs.candidate_metrics` (`caseStudySyncRunStore.ts:352`). The counter is honest; it is counting an empty set.

### 2.4 The chart-builder key mismatch, and its already-recorded cause

`frontend/src/pages/admin/AdminCaseStudyDetailPage.tsx:135` builds the offered key list from `desk.metrics` — snapshot content. `resolveChart` reads the table. The file already documents this (`:129-134`): *"these keys are read from the SNAPSHOT, while `resolveChart` resolves against the `case_study_metrics` table."*

The mechanism is worth stating precisely, because it explains why the mismatch is structural rather than a bug. `backend/src/services/caseStudy/caseStudySnapshotSections.ts:191-220` builds snapshot metrics from **two** sources:

1. **Repository manifest `outcomes`** — pinned to `verification: { class: 'pending' }` and `publishable: false` whatever the manifest author wrote (`:203-207`). These produce metric *keys in snapshot content that have no row in the table*.
2. **`platform.metrics`** — which is `loadCandidateMetrics()`, i.e. the table.

So the chart builder offers keys from source 1 and the resolver reads source 2. There is a second metric producer today; its output is deliberately unpublishable and never touches the table.

One further consequence: `heroMetrics` is `all.filter((m) => m.isHeadline)` (`:210`), and only table rows can carry `isHeadline`. **No case study can currently have a headline metric at all.**

### 2.5 Cohort aggregation does not exist. Confirmed and refuted where it seemed to.

Every CAPE, progression, and skill service takes a single `enrollmentId: string`. There is no function anywhere that accepts a cohort id, a learner array, or no learner at all while reading learner rows.

The three functions that look like rollups are not:

- `capeSkillCoverageHeatmapService.getSkillCoverageHeatmap()` (`backend/src/services/cape/capeSkillCoverageHeatmapService.ts:81`) — takes no id, reads **zero learner rows**. It is a `curriculum_type × skill` matrix from `CurriculumSkillMap` and the type registry (`:83, :92`).
- `capeGovernancePersonaService.listPersonas()` (`:79`) — scans 50 enrollments (`:82-85`) to pick five exemplars. Computes no statistic.
- `capeTodayPlanService.isCohortLearner()` (`:102`) — a private boolean about one learner.

The only `GROUP BY` over a CAPE table in the repo is `backend/src/services/career/careerEvidenceAdapters.ts:214-235`, and it groups **within one learner** (`where: { enrollment_id: enrollmentId }`, `:220`). `fn('AVG')` appears zero times in CAPE, progression, or skill territory.

No CAPE table has a `cohort_id`. The join path a cohort statistic would need is `student_architecture_skill.enrollment_id` → `enrollments.cohort_id` (`backend/src/models/Enrollment.ts:145, 314`), following the pattern already used by `analyticsService.getSessionCompletionRates(cohortId)` (`backend/src/services/analyticsService.ts:14-22`).

**Correction to the framing this scope arrived with.** `ProgressionLog` (`backend/src/models/ProgressionLog.ts:28-63`) is *not* the skill progression ledger. Its columns are `id, project_id, action_id, decision_type, reason, confidence, metadata, created_at`. It has **no `enrollment_id`, no `user_id`, no `cohort_id`** — it records the Student Build Pipeline's next-action decisions and is unrelated to `services/progression/*` despite the name. A metric described as *"computed from N ProgressionLog rows across M learners"* is not computable, because the table cannot name a learner. The correct table is `student_skill_evidence`.

Cross-learner skill statistics exist in exactly one place, and it is the **legacy** system: `analyticsService.getProgramSkillMastery()` (`:230-250`) over `skill_mastery`, program-wide and not cohort-filterable. CAPE neither reads nor writes that table. (Aside worth a ticket: `backend/src/intelligence/services/analyticsService.ts:363, 437-441` and `backend/src/intelligence/assistant/sqlExecutor.ts:283` query a column `mastery_level`, while `backend/src/models/SkillMastery.ts:52` defines `proficiency_level`. Wrapped in `safeQuery`, so they degrade silently to `0`.)

### 2.6 No consent axis covers publication of learner data

`backend/src/services/consent/captureSignupConsent.ts` and `backend/src/models/ConsentRecord.ts:15-16` model consent for **contact channels** — `voice | sms | email` — with subject types `lead | contact | email | phone`. The ledger cannot name a student, let alone record that one agreed to be counted in a public statistic.

The only mechanism with the right *shape* is `backend/src/services/sbp/profileContract.ts:59, 71-83, 164` — disclosure levels `private | anonymised | public`, default `private`, with per-category opt-in (`requirement_statements`, `measures`, `systems`, `narrative`) and an explicit rationale at `:51-58`. It is per-student, self-authored in `.colaberry/profile.json`, and not consulted by any Case Study path.

There is no media release, no likeness release, no publicity consent model anywhere in `backend/src`.

### 2.7 No minimum-cell rule anywhere

The single precedent for refusing to show a figure because the group is too small is `backend/src/modules/delivery/capacitySignals.ts:225-234` (`sample_too_small`), and its direction is inverted — it protects an *individual* figure from small-n noise, and its thresholds are 0 or 1 (`:91-137`). Nothing anywhere refuses an *aggregate* because it might re-identify its members. `k-anonymity` appears only in validation reports describing future work.

### 2.8 Two smaller gaps that would bite a producer immediately

- **No unique constraint on `(case_study_id, metric_key)`.** The DDL (`ensureCaseStudySchema.ts:193-218`) indexes `(case_study_id, publishable)` and `verification_class`, neither unique. A producer run would silently accumulate duplicate rows per key — and `resolveChart` builds `new Map(metrics.map((m) => [m.metric_key, m]))` (`caseStudyChartService.ts:87`), which keeps the **last** duplicate without complaint. Adding the constraint is a schema change and therefore a DRI decision under `CLAUDE.md`'s governance boundaries; it is a prerequisite, not something this scope makes.
- **`sample` is `VARCHAR(300)` free text** (`ensureCaseStudySchema.ts:207`) projected verbatim to the public page (`caseStudyPublicSections.ts:164`). It documents a denominator to a reader; nothing validates it as a number and nothing enforces a floor.

---

## 3. The proposed contract

Four pieces, assessed for what they can reuse.

### 3.1 A metric definition is code

A named, versioned module with a deterministic `compute`:

```
interface MetricDefinition {
  readonly key: string;               // stable; equals case_study_metrics.metric_key
  readonly version: number;           // bump ONLY when the meaning changes
  readonly label: string;
  readonly metricType: CaseStudyMetricType;   // types/caseStudy.ts:133
  readonly verificationMethod: 'repo' | 'platform';
  compute(ctx: MetricRunContext): Promise<MetricComputation>;
}

interface MetricComputation {
  readonly numericValue: number | null;
  readonly valueDisplay: string;
  readonly unit?: string;
  readonly sample: string;            // GENERATED, not typed
  readonly methodology: string;       // GENERATED, not typed
  readonly baseline: string | null;   // GENERATED; null is correct for a level metric
  readonly limitations: readonly string[];
  readonly inputs: Record<string, unknown>;   // exactly what was read
}
```

`version` is the answer to definition drift. `key` stays stable so charts and snapshots keep resolving; `version` travels in the run record; and a version bump against a metric whose current row is `publishable` **refuses to write** and reports the divergence, rather than recomputing a published number under new rules.

### 3.2 The run emits the metric *and* its methodology

`sample`, `methodology` and `limitations` become outputs of `compute()`, not fields a human types. `docs/architecture/case-study-os/DATA_SOURCE_MAP.md:120` currently records these as *"Human-entered on the metric row"* — that line is the thing this proposal changes, and the doc should be updated in the same change if this ships.

Static limitations belong to the definition. Run-derived ones belong to the run: *"one of four attached repositories failed analysis and is excluded from the denominator."*

### 3.3 `evidenceId` points at the run — with no schema change

The run record **is** a `case_study_evidence` row:

| Column | Value |
|---|---|
| `source_type` | `'internal_measurement'` |
| `source_ref` | the run id |
| `source_commit_sha` | the pinned sha, for repo-derived definitions |
| `title` | `<definition label> — computed <ISO date>` |
| `metadata` | `{ definition_key, definition_version, inputs, computed_at, correlation_id }` |
| `metric_id` | the metric row's UUID |
| `verification_class` | mirrors the metric's |

**CORRECTED.** This table originally specified `source_type` as `'repo'` or
`'platform'`. Neither is a member of `CaseStudyEvidenceSourceType`, whose real
members are `evidence_record | github_commit | github_pr | repo_file | artifact |
client_confirmation | internal_measurement | manual`. The error came from the doc
comment on `CaseStudyEvidence.ts`, which listed `repo | platform | manual | client
| manifest` — four invented values and seven omitted ones — and which this
document was written from. A metric run record is the platform measuring itself,
so `internal_measurement` is the honest member; the repository provenance travels
in `source_commit_sha` and `metadata.inputs`, which is where it is checkable.
The comment is now pinned by `caseStudyModelDocContract.test.ts`.

Then `case_study_metrics.evidence_id` = that row's id. Both UUIDs are minted before either write, which the bare-UUID design explicitly permits (`CaseStudyMetric.ts:11-12`). The evidence row has no `updated_at` and no delete path in the Case Study services, so the run record is append-only by construction.

This satisfies gate rule 7 (`caseStudyPublishRules.ts:356-361`) with an artefact that is a *record of what ran*, which is what was asked for.

**Write discipline for release 1.** The producer writes `verification_class: 'pending'`, `publishable: false` — the DDL defaults. It never sets `verified` and never sets `publishable`. A human promotes, and promotion is what stamps `verification_class`, `verified_by` and `verified_at`. This preserves the invariant the model header already asserts (`CaseStudyMetric.ts:7-9`) and keeps the decision to publish a number a decision a person made. Auto-promotion is a later question, answerable only after the run record has proved itself in use.

**Re-run discipline.** A run never mutates a row where `publishable = true`. If a recomputation diverges from a published figure, it records the divergence on the run and surfaces it to the admin. This is the difference between *"the number moved"* and *"the number moved and nobody knows why."*

### 3.4 AI drafts around the number, never producing it

This piece is already largely built and needs no change. `case_study_ai_drafts` is a quarantine: an AI value is not in `case_study_snapshots.content`, so it cannot be projected, published, or scanned — because it is not there (`backend/src/services/caseStudy/caseStudyAiDraftStore.ts:17-24`). Promotion writes `human_override`, not `ai_draft`, because a human who presses Promote is the accountable party (`:37-46`).

**One constraint to respect rather than remove.** `AI_FORBIDDEN_RULES` (`backend/src/services/caseStudy/caseStudyProvenance.ts:113-120`) refuses any AI-proposed path matching `/metric|measurement|numericvalue|valuedisplay|baseline|methodology/`, and `measurement` is in that rule *on purpose* — it is the section where numbers are explained (`:110-112`). So the model may take a verified metric and its methodology as **input** and write connective prose into `situation`, `build` or `architecture`; it may not write the measurement narrative. That is correct and should not be weakened to make this feature more convenient.

### 3.5 Which `verification.method` is honest

The gate refuses `verified` + `self` outright (`caseStudyPublishRules.ts:350-355`), and `verifiedFigures` excludes `method: 'self'` from the set of figures prose may state (`caseStudyPublishClaimScan.ts:191`). So the choice matters.

| Figure | Honest method | Why |
|---|---|---|
| Derived from a repository at a pinned sha | **`repo`** | Independently checkable. A third party can re-read the repository at that sha and get the same number. This is the only method in the union that makes a *platform-computed* figure verifiable by someone outside the platform. |
| Derived from learner platform data | **`platform`** | It is the only union member that names the mechanism. `internal` is vaguer; `self` is refused. |
| Any client business outcome (cost saved, ROI, revenue) | **none available** | The platform instruments nothing about a client's business. There is no honest method because there is no data. Reject these definitions outright. |

On the class for platform-derived figures there is a real argument to have, and it should be had explicitly rather than defaulted:

- `verified` + `platform` passes the gate and is defensible under the codebase's own doctrine, which distinguishes *a party asserting* from *a mechanism measuring* — a deterministic, re-runnable query is a mechanism.
- `anonymized` + `platform` is more humble, renders as "Anonymized ◐" (`frontend/src/components/publicV2/Claim.tsx:26-36`), is literally accurate for a cohort figure with no named subjects, and still counts as a verified figure for prose (`caseStudyPublishClaimScan.ts:191` accepts `anonymized`).
- **The trap:** `anonymized` does *not* require an `evidenceId` (`caseStudyPublishRules.ts:356-357`). Choosing it out of humility would silently lower the evidence bar. If `anonymized` is chosen, attach the evidence row anyway.

For repository facts — the recommended release-1 scope — `verified` + `repo` + evidence is unambiguous and the argument does not arise.

### 3.6 What a produced metric looks like against the contract

```
{
  key: 'delivery_elapsed_days',
  label: 'Calendar days from first repository to pinned commit',
  valueDisplay: '38 days',
  numericValue: 38,
  unit: 'days',
  metricType: 'delivery',
  verification: {
    class: 'verified',              // set by a human at promotion; 'pending' at write
    method: 'repo',
    verifiedAt: '2026-08-28T...',
    evidenceId: '<uuid of the run's case_study_evidence row>'
  },
  isHeadline: false,                 // a human decision, never the producer's
  publishable: false,                // a human decision, never the producer's
  measurement: {
    baseline: null,
    sample: '2 of 2 attached repositories analysed at commit a1b2c3d',
    methodology: 'Elapsed calendar days between the earliest repository created_at
                  (2026-06-02) and the commit date of the sha pinned in snapshot
                  version 4 (2026-07-10). Both endpoints read from the GitHub API.
                  Definition delivery_elapsed_days v1.',
    limitations: [
      'Repository creation is not project start; scoping before the first commit is not counted.',
      'A repository created early and left idle inflates the figure.'
    ]
  }
}
```

Every field below `verification.class` and `isHeadline` is machine-generated. The two that decide whether a visitor ever sees it stay human.

---

## 4. The first three metric definitions worth building

Admissibility test, applied before marketing usefulness:

1. Computable from data the platform records **today**.
2. Stable across runs, or explicitly pinned so that it is.
3. Honest under a method the gate accepts, without stretching the word.
4. No learner data — so release 1 raises no consent question.

The repository analyzer already returns `metadata` (`backend/src/services/caseStudy/caseStudyRepoReader.ts:100-118`: `createdAt`, `pushedAt`, `latestCommitSha`, `visibility`, `languageBytes`, `license`, `isFork`, `isArchived`) and `derived` (`backend/src/services/caseStudy/repoFactExtractors.ts:107-131`: language/framework/dependency/AI-SDK lists, `testFileCount`, `hasCi`, `hasDocker`, `hasArchitectureDoc`, `deploymentUrl`, and more). All of it is already fetched on every sync and then counted into a single scalar (`caseStudySyncSources.ts:393-403`) and otherwise discarded.

### D1 — `delivery_elapsed_days` · type `delivery` · method `repo`

Calendar days from the earliest `metadata.createdAt` across the case study's analysable repositories to the commit date of the sha pinned in the approved snapshot.

**Why this one first.** It is the number the business is *already claiming* and cannot currently back. `backend/src/seeds/seedPilotProgramCampaigns.ts:47` instructs a campaign to say a system was "deployed in 11 days" — unverified prose in an email, invisible to the gate because it never travels as a metric. Turning it into a computed figure replaces a claim nobody can check with one anyone can, and it is the single most persuasive fact this business has.

**Stability.** Anchored to the pinned sha, not to `pushedAt` — which moves on every push and which the codebase already refuses to hash for that reason (`caseStudySnapshotSections.ts`, `buildTimeline` header). Re-running against the same snapshot returns the same number.

**Limitations** (generated, not optional): repository creation is not project start; an early-created idle repository inflates it.

### D2 — `production_systems_declared` · type `adoption` · method `repo`

Count of attached repositories whose `derived.deploymentUrl` is non-null, over the count successfully analysed. `deploymentUrl` is the repository's own declared homepage and is documented as *"Never guessed from README prose"* (`repoFactExtractors.ts:129-130`).

**Why.** "Three of four systems declare a live deployment" is a buyer-relevant claim about shipping rather than building, and it is mechanically checkable. It also pairs correctly with the existing production-status rule (`caseStudyPublishRules.ts:369-374`), which already refuses a `verified` production status carrying no evidence.

**Limitation** (generated): a declared homepage is a declaration, not proof of live traffic. This limitation is why the metric is `adoption` and not a production-status claim.

### D3 — `automated_test_files` · type `quality` · method `repo`

`derived.testFileCount` summed across analysed repositories, with `derived.hasCi` reported alongside in the methodology.

**Why.** It is the metric that resists inflation, which is the reason to ship it. It will sometimes be a small number, and a case study that publishes a small honest number next to a large honest number is more credible than one that publishes only the flattering one. It is also the one whose limitation is most important to state and most easily stated.

**Limitation** (generated, non-negotiable): a file count is not coverage. If this metric is ever promoted to headline, the limitation must render with it.

### Explicitly rejected

| Rejected | Why |
|---|---|
| Any per-learner or cohort competency figure | See §5.2 — the construct is not ready, cohorts are small, and no consent axis exists |
| Cost saved / ROI / revenue impact / payback | The platform instruments nothing about a client's business. No honest `verification.method` exists. `AI_FORBIDDEN_RULES` already treats `roi` as an absolute no (`caseStudyProvenance.ts:114`) — the absence of a data source is the deeper reason |
| Any "N% improvement" figure | Requires a baseline nothing records. See §6 |
| `commits`, `pull requests`, `lines of code` | The analyzer reads metadata, a tree and selected files — not commit history (`caseStudyRepoAnalyzer.ts`). And they are activity, not outcome |

---

## 5. Where it runs

### 5.1 What this repo already does for scheduled work

- `node-cron`, in-process, no queue library, no separate worker process, no host crontab. `backend/src/services/aiOpsScheduler.ts:1` and `backend/package.json:42`.
- Jobs declare cadence in a static registry, overridable per-agent from the `cron_schedule_configs` table (`aiOpsScheduler.ts:160, 364, 653-672`), reloadable without restart (`:529`).
- Runs and errors are recorded by `instrumentCronJob` (`backend/src/services/cronInstrumentation.ts:19`) and dead-lettered after three consecutive failures (`backend/src/services/deadLetterService.ts:20`).
- **The whole registry is gated off by default.** `startAIOpsScheduler()` is nested inside `startScheduler()` (`backend/src/services/schedulerService.ts:3239`), which `server.ts:2998-3001` calls only when `ENABLE_FOLLOWUP_SCHEDULER === 'true'` — default `false` (`backend/src/config/env.ts:142`).
- The house pattern for Case Study work is **admin-triggered and synchronous**, with an append-only run row: `POST /api/admin/case-studies/:id/sync` (`backend/src/routes/admin/caseStudyAdminRoutes.ts:313-322`) → `syncCaseStudy` → `startSyncRun` / `finalizeSyncRun` (`caseStudySyncRunStore.ts:312, 344-362`). The route contract says it plainly: *"no retries at this layer — a retry is the admin clicking again"* (`caseStudyAdminRoutes.ts:55-69`). The sync has exactly one call site and no cron entry.

### 5.2 Recommendation: admin-triggered, and a separate action from sync

`POST /api/admin/case-studies/:id/metrics/compute`, synchronous, following `caseStudyAdminRoutes.ts:313-322` exactly.

Three reasons, in order of weight:

1. **A scheduled recompute changes a published number without anyone deciding to.** That is the central risk of this whole feature, and choosing request-time execution removes it rather than mitigating it.
2. **It must not ride on sync.** Sync rebuilds a draft snapshot; a metric run writes rows a human then promotes. Fusing them means every repository sync silently re-derives figures.
3. Cron would need `ENABLE_FOLLOWUP_SCHEDULER` on, plus a `trigger` enum extension — `caseStudySyncService.ts:122` accepts `manual | webhook | reconciliation | project_update` and does **not** accept `'scheduled'`, even though `CaseStudySyncRun.ts:19` documents it as valid. That mismatch is worth fixing regardless.

If a scheduled run is wanted later, the slot is `DYNAMIC_SCHEDULE_REGISTRY` (`aiOpsScheduler.ts:364`), which brings instrumentation, timezone pinning, DB schedule override and hot enable/disable for free.

---

## 6. The baseline problem

**The gate does not require a baseline.** `caseStudyPublishRules.ts:363-364` blocks a headline metric only when `baseline` *and* `sample` *and* `methodology` are all absent — note the `||` inside the negation. Any one of the three satisfies it.

That reframes the question usefully. The distinction that matters is not *does a baseline exist* but *what kind of claim is being made*:

- **Level claims** — "38 calendar days", "3 of 4 systems declare a deployment". No baseline needed and none is honest to invent. `sample` + `methodology` carry the weight. All three recommended definitions are level claims.
- **Change claims** — "41% fewer stockouts". The baseline *is* the claim. Without one there is nothing to publish.

For the recommended scope: **the first run is not a baseline, because a level metric does not need one.** `baseline: null` is the correct and honest value, not a gap.

For the deferred learner scope the answer is more interesting than expected. A retrospective baseline **is** computable in principle, because `student_skill_evidence` is append-only with `created_at` and has no update or delete path anywhere (`StudentSkillEvidence.ts:9-11, 71`). Replaying rows with `created_at <= D` reconstructs the ledger as of date D.

But replaying it with *today's* weights produces a number that never existed. `proficiency` is weights-versioned (`StudentArchitectureSkill.ts:16-20`), and `getLearnerSkillProfile` silently recomputes any row whose `weights_version` is stale on read (`capeProficiencyService.ts:187-190`). An honest historical baseline would have to resolve the weights row that was `is_current` at date D — which is *possible*, because `ArchitectureSkillEvidenceBandWeights` retains versions. That is a genuine positive finding: the history is there and it is honest history. It is the *construct*, not the retention, that is not ready.

---

## 7. Privacy

**For the recommended scope, this section is short by design: repository facts carry no learner data, so the consent question does not arise.** That is a reason to scope it this way, not a happy accident.

For the deferred cohort scope, three things would have to exist first and none of them does:

1. **A publication-consent axis.** `ConsentRecord.subject_type` is `lead | contact | email | phone` (`ConsentRecord.ts:15`) — it cannot name a student. `consentService.ts:1-14` is shadow-first and **fails open**. The existing machinery governs *contacting*, not *publishing*. The right shape already exists in `profileContract.ts:59, 71-83, 164` — `private | anonymised | public`, default private, per-category, with the rationale that *"opting out after the fact is not"* a decision a learner gets (`:51-58`) — but it is per-student, self-authored, and unwired.
2. **A minimum-cell rule.** Nothing anywhere refuses an aggregate for being too small. Cohorts on this platform run in the tens; a per-cohort competency figure on a public page, next to a named cohort and a named contributor, is a live re-identification surface. `capacitySignals.ts:225-234` is the only refusal precedent and its thresholds are 0 or 1.
3. **A rule that `sample` states a real denominator.** Today it is free text (`ensureCaseStudySchema.ts:207`) published verbatim (`caseStudyPublicSections.ts:164`). It informs a reader; it constrains nothing.

The Case Study OS's existing consent work is strong and worth noting so it is not re-litigated: organisation and builder naming consent are drift-checked between record and snapshot and gate-enforced (`caseStudyPublishRules.ts:233-317`), named contributors require a `consentRecordedAt` timestamp (`:311-315`), unconsented contributors are downgraded to role rather than dropped (`caseStudyPublicSections.ts:329-361`), and named quotes are unstorable without consent via a DB CHECK constraint (`backend/src/models/CaseStudyQuote.ts:4-26`). And learner evidence already lands `visibility: 'private'`, `verification_class: 'pending'`, `is_publicly_openable: false` *even when the source is validated*, on the stated grounds that *"the platform confirming a learner did the work is not a person deciding it may appear publicly"* (`backend/src/services/caseStudy/caseStudyEvidenceSource.ts:15-21`).

That last sentence is the existing doctrine, and a cohort metric would be the first thing to test it.

Two smaller findings, worth a ticket rather than a redesign: `case_studies.visibility` and `organization_is_anonymized` are written (`caseStudyAdminService.ts:390, 392`) and displayed (`caseStudyAdminStore.ts:92-94`) but **never read by the publish gate** — `CaseStudyPublishRecord` (`caseStudyPublishRules.ts:82-91`) has no `visibility` field — despite the model header claiming the gate reads them (`CaseStudy.ts:19-22`).

---

## 8. What could go wrong

| # | Risk | Mitigation in the design |
|---|---|---|
| 1 | **A definition changes and the key does not.** Same `metric_key`, different meaning, no record. | `version` on the definition, carried in the evidence row's `metadata`. A version bump against a `publishable` row refuses to write and reports the divergence. |
| 2 | **A number moves between runs with no record of why.** | Runs never mutate a `publishable = true` row. Divergence is recorded on the run and surfaced, never applied. Repo definitions anchor to a pinned sha, never `pushedAt`. |
| 3 | **A small cohort makes an individual identifiable.** | Not mitigated — which is why cohort metrics are out of scope. No minimum-cell rule exists anywhere in the repo. |
| 4 | **Construct validity — the deepest one.** | See below. Partially mitigated only by scoping. |
| 5 | **Duplicate rows per `metric_key`.** No unique constraint; `resolveChart` silently keeps the last (`caseStudyChartService.ts:87`). | Prerequisite schema change, DRI-gated. Until then, find-then-decide inside a transaction. |
| 6 | **Auto-generated methodology laundering a hand-picked figure.** | The producer writes `pending` / not-publishable only. A human still decides. The methodology names the definition and version, so a reader can ask what ran. |
| 7 | **The AI-forbidden-path rule gets weakened for convenience.** | Stated as a non-goal in §3.4. The model gets the metric as input; it never writes `measurement.*`. |

### Risk 4, stated properly

The publish gate checks whether a metric is *labelled* honestly. It cannot check whether the underlying construct *is* honest. Those are different questions, and this pipeline makes the second one more dangerous rather than less.

Concretely: the only live writer into `student_skill_evidence` is `capeTimelineEvidenceBridge.ts:129`, reached from `progressionService.ts:129-133` on card completion. The other three idempotency-key formats — `classroom:`, `diagnostic:`, `resume:` — are builder functions that Phase 2/3 will call (`StudentSkillEvidence.ts:14-21`). So today, `proficiency` is *curriculum cards completed, weighted by each card's declared skill mapping*. Add that `confidence` is `min(1, n/10)` with the in-code comment *"Not a statistical model; a placeholder"* (`capeProficiencyService.ts:57-61`), and that a weights edit rewrites every learner's proficiency on next read (`:187-190`).

Now imagine that number wearing generated methodology: *"computed from 412 evidence rows across 38 learners between 2026-03-01 and 2026-08-01, evidence-band weights version 3."* Every word is true. The sentence reads as science. It is describing course completion.

**A pipeline that automatically produces rigorous-sounding provenance raises the apparent credibility of a number without touching its truth.** That is the argument for building it only where the construct is already sound, and the argument against building it where the construct is a placeholder the codebase itself labels as one.

---

## 9. Staged plan

**Stage 0 — prerequisite, DRI decision (not this scope).** `UNIQUE (case_study_id, metric_key)` on `case_study_metrics`. Schema changes cross a governance boundary under `CLAUDE.md`; naming it is as far as this document goes.

**Stage 1 — one definition, end to end.** `delivery_elapsed_days` only. The definition interface, the runner, the evidence-row-as-run-record, the admin route, the pending write. Ship with the full mandatory test set: happy path, repository unreadable, zero analysable repositories, run twice (byte-identical), run twice against a promoted row (refuses).

**Success condition — CORRECTED after running it in production on 2026-08-30.** The original read: *"a metric row exists, `resolveChart` resolves its key, and a chart renders a real bar."* **The third clause is not achievable by Stage 1, and asking for it contradicts §3.3 of this same document.** `resolveChart` applies the two locks `projectMetric` applies — `publishable` and `verification_class` — while §3.3 requires the producer to write `pending` / `publishable: false` and never promote its own output. So a bar cannot render until a human promotes, and the promote control is Stage 2. Written as it was, Stage 1 could only have been declared complete by violating its own write discipline.

The achievable condition, and what was verified live:

- a metric row exists — **yes**, `delivery_elapsed_days = 181 days` on `ai-systems-architect-training-system`;
- the run record exists as a `case_study_evidence` row with `source_type: 'internal_measurement'` — **yes**;
- the row is `pending`, `publishable: false`, with `verified_by` and `verified_at` null — **yes**;
- re-running leaves one metric row at the same value and appends a second run record — **yes**, `created: false`, 181 → 181, 1 metric / 2 run records;
- `resolveChart` **finds the key** and refuses it for the stated reason *"That metric is not marked publishable, so no surface may show it."* — which is the correct behaviour and also proves the §2.4 key mismatch is not present.

A rendered bar belongs to Stage 2's exit criteria, not Stage 1's.

**Stage 2 — the metrics panel gains a promote control.** Verification class, method, evidence link, `isHeadline`, `publishable`, all human, all audited via `verified_by` / `verified_at`. Then delete the `metrics.slice(0, 3)` override field (`CaseStudyMetricsPanel.tsx:90`), which exists only because there was no better instrument.

**Stage 3 — definitions two and three.** `production_systems_declared`, `automated_test_files`. Zero new mechanism. This stage is the proof that a new metric is a new *definition*, not a new *feature* — and if it is not, Stage 1 got the interface wrong.

**RESULT, 2026-08-31: the interface held.** Each definition is one module plus one line in the registry. No change to `MetricDefinition`, `MetricRunContext`, `MetricComputation`, the runner, the writer, the context assembler, the promotion service, the routes, or the panel. The route's definition enum and the panel's dropdown both derive from the registry, so both metrics became runnable in the product with no route change and no frontend work at all. A test asserts the shared machinery contains no metric key of any kind, and a mutation that leaks one into the runner reddens it — so the boundary is defended rather than merely observed once.

**Stage 4 — decision gate, not a build stage.** Re-ask the cohort question against the state of the world then. It becomes worth reopening when **a second evidence source is live** (diagnostic or classroom, `StudentSkillEvidence.ts:14-21`), because until then "competency" and "completion" are the same measurement under two names. It stays closed until a publication-consent axis and a minimum-cell rule exist.

---

## 10. Recommendation

**Build it. Scope it to repository-derived metrics. Do not build cohort learner metrics yet, and do not schedule it.**

### The case for

- The producer gap is the single blocker behind two separate symptoms — no metric entry, no working charts — and one mechanism closes both.
- The architecture already has the hole shaped for it. `approved_metric_evidence` is provenance tier 1 with origin kinds `case_study_metric` / `case_study_evidence` and nothing occupying it. `case_study_evidence` already carries `metric_id`, `source_ref`, `source_commit_sha` and a `metadata` JSONB with no update path. **The run-record-as-evidence-row design needs no schema change at all** — the only prerequisite is a unique constraint, and that is for correctness rather than for the design.
- Repository facts are already extracted on every sync (`repoFactExtractors.ts:107-131`, `caseStudyRepoReader.ts:100-118`), then collapsed into a single integer and thrown away. The data is being fetched and discarded today.
- `method: 'repo'` at a pinned sha is the only combination in the whole vocabulary where a platform-computed figure is checkable by someone outside the platform. That is a strong place to start, and it will teach the interface honestly.
- It replaces a real live problem. The business is already claiming "deployed in 11 days" in campaign copy (`seedPilotProgramCampaigns.ts:47`) with nothing behind it. This is the mechanism that would put something behind it.

### The case against — taken seriously

- **It is a producer for a table that currently holds nothing, on a surface with one pilot record.** Building a versioned definition framework for three metrics is over-engineering if the answer is a metric-entry form. That is a fair objection, and the honest response is that the framework and the form are the *same* work: the form still needs somewhere to write, still needs an evidence pointer, and still needs a methodology field somebody fills in. The choice is whether the methodology is typed or generated. Two definitions in, the framework has paid for itself; if it has not, that is Stage 3's signal.
- **The most valuable metrics are the ones this cannot produce.** A buyer wants cost saved and time saved. The platform instruments neither and never will, because they happen inside the client's business. This pipeline produces the second tier of interesting facts, and it should not be sold as producing the first.
- **Three repo-derived metrics may not be a headline.** Possibly true. But `heroMetrics` is currently *structurally empty* — only table rows can carry `isHeadline` (`caseStudySnapshotSections.ts:210`) and there are no table rows — so the alternative to a modest headline is no headline at all.
- **The strongest version of this objection:** the feature's real appeal is the cohort competency number, and this recommendation declines to build it. If cohort metrics are the actual goal, then the right conclusion is *"not yet"*, and Stages 1-3 are a detour. Reasonable people could stop here.

I do not think that is right, for one reason. The mechanism and the construct are independent problems, and the mechanism is the cheap one. Building it against repository facts costs little, unblocks the charts, and produces an interface that a cohort definition could later slot into unchanged — while a cohort metric built today would ship a placeholder wearing generated methodology onto a public marketing page, which is precisely the failure this entire subsystem was built to prevent.

### What I would say no to regardless of budget

- Cohort learner-competency metrics before a second evidence source is live.
- Any scheduled recompute of a published figure.
- Any metric whose only honest `verification.method` would be `self`.
- Weakening `AI_FORBIDDEN_RULES` so a model can write the measurement narrative.

---

## Appendix — claims made here that are unverified

- Cohort sizes on this platform are in the tens rather than the hundreds. Not verified from the database (production was not queried per the scope's rules); inferred from the shape of the enrollment and cohort models and from prior architecture notes.
- `case_study_metrics` being empty in production is taken from the scope statement and corroborated structurally — no write path exists in `backend/src` — but was not confirmed against a live database.
- `analyticsService`'s `mastery_level` / `proficiency_level` column mismatch (§2.5) is inferred from a repo-wide grep finding no model or DDL defining `mastery_level`. The physical table was not inspected.
