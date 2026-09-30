# Case Study OS — Data Source Map

**Gate 0 deliverable.** Spec §3 requires that *"every important public field"* be mapped to its
source priority, whether AI may infer it, and whether human approval is required before publish.
This is that table, filled in against the real repository rather than the spec's illustrative
example.

Observed against `origin/main` = `cfd016d9`, 2026-08-22.

---

## 1. The precedence ladder

Spec §9 defines a deterministic precedence. Every row in §3 below resolves through it, highest
wins:

| # | Tier | Where it lives in this repo |
|---|---|---|
| 1 | Human-approved CaseStudy override | `case_studies.*` override columns + `case_study_publications.surface_*_override` |
| 2 | Approved `CaseStudyMetric` / `CaseStudyEvidence` | `case_study_metrics` (`publishable = true`), `case_study_evidence` |
| 3 | Existing Refactored Project facts | `backend/src/models/Project.ts` |
| 4 | Existing `EvidenceRecord` / `PortfolioArtifact` | `backend/src/models/EvidenceRecord.ts`, `backend/src/models/PortfolioArtifact.ts` |
| 5 | Structured repo manifest | `case-study.yml` / `.yaml` / `.json` via `CaseStudyManifestReader` (spec §8) |
| 6 | Deterministic GitHub / repository extraction | `githubRepoClient.fetchRepoFacts` / `fetchRepoFile`, `GitHubConnection.file_tree_json` |
| 7 | AI-generated draft from extracted facts only | The repo's existing AI provider abstraction (spec §12) |

**Rule 1 (spec §9):** the published snapshot must carry field-level or section-level provenance.
Every field in §3 records which tier produced the value that shipped.

**Rule 2 (spec §34):** a human override is never silently overwritten by a later repo sync. Sync
updates the *generated* value underneath; the override stays on top and the diff is shown to the
reviewer.

**Rule 3 (spec §12):** AI output is always a draft, never auto-published, and receives only
extracted source facts plus the explicit prohibitions listed in §5 below.

---

## 2. What the two answer columns mean

**`AI infer?`**

| Value | Meaning |
|---|---|
| **yes** | AI may propose the value from extracted facts. It lands as a draft. |
| **deterministic** | Derived by code from a file or API response. AI is not involved *and must not be* — spec §11: *"Do not use AI for facts that are deterministic."* |
| **limited** | AI may propose the *shape* (e.g. a role label) but never the identity itself. |
| **NO** | AI must never produce this value under any circumstance. Fabrication here is the failure mode this whole system exists to prevent. |

**`Human approval before publish?`**

| Value | Meaning |
|---|---|
| **YES** | A named human must approve the value before it can appear on a public surface. The publish gate (spec §15) fails closed without it. |
| **no if deterministic** | Auto-publishable when the value came from tier 5 or 6 and provenance records that. If the value came from tier 7 (AI), it reverts to YES. |
| **implicit** | Approved as part of the snapshot approval, not as an individual field. |

---

## 3. The field map

### 3.1 Identity

| Field | Preferred source | Fallback | AI infer? | Human approval before publish? |
|---|---|---|---:|---:|
| `title` | Human `case_studies.title` override (tier 1) | `Project.name` (`Project.ts:110`) → repo `name` from `fetchRepoFacts` (`githubRepoClient.ts:216`) → README H1 | yes | **YES** |
| `slug` | Human-set, immutable once published | Slugified `title` on create; collision-checked against the unique index on `case_studies(slug)` | yes (initial draft only) | **YES** |
| `summary` / standfirst | Human override (tier 1) | AI draft from extracted facts (tier 7); deterministic fallback is repo `description` (`fetchRepoFacts`) → `Project.executive_summary` (`Project.ts:160`) | yes | **YES** |
| `organization_display_name` (client / organization) | **Approved consent record only** — `case_studies.organization_is_anonymized` plus an approved consent state | `Project.organization_name` (`Project.ts:114`) is a **candidate for review, never a publishable value** | **NO** | **YES** |
| `builder identity` (contributors) | Approved Project/Enrollment identity with an explicit consent state (`named \| role_only \| anonymous`, spec §16) | Git commit-author metadata (tier 6) — usable **only** to populate a role label, never a public name | **limited** | **YES** |

**Why organization and builder identity are `NO`/`YES`.** `Project.organization_name` is a
free-text `STRING(255)` a student typed during intake. It carries no consent, no verification,
and no provenance. Publishing it because it exists is exactly the failure that produced the
`casestudy.fabricated` block at `claimsRegistry.ts:598` and `testimonial.undisclosed` at `:613`.
Spec §16 requires organization identity to be one of `named | anonymized | hidden` and builder
identity one of `named | role_only | anonymous`, with the publish gate failing closed when
consent is unsatisfied (spec §15).

### 3.2 Taxonomy and classification

| Field | Preferred source | Fallback | AI infer? | Human approval before publish? |
|---|---|---|---:|---:|
| `industry` | Human override → repo manifest `classification.industry` (tier 5) | `Project.industry` (`Project.ts:118`) | yes | **YES** (a wrong industry is a public factual error, and it drives filtering) |
| `primary_capability` | Human override → manifest `classification.capabilities` | AI suggestion from extracted facts | yes | **YES** |
| `stack` | **Deterministic extraction** from dependency files — `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `*.csproj`, `Dockerfile` (spec §11) | `GitHubConnection.repo_language` (`GitHubConnection.ts:141`) — see caveat | **deterministic** | **no if deterministic** |
| `program_key` | Platform data — the Project's program blueprint (`Project.program_id`, `Project.ts:105`) | Manifest `built_by.program` | no | implicit |
| `built_by_type` | Approved value on `case_studies` | Manifest `built_by.type` | limited | **YES** |
| `deliverable` / collection tags | Deterministic repo signals (tests present, CI present, Dockerfile present, docs present) | Human curation | **deterministic** | no if deterministic |

**Caveat on `repo_language`.** There is **no call to GitHub's `/languages` endpoint anywhere in
this repo.** `GitHubConnection.repo_language` is inferred client-side from file extensions with a
10-entry `langMap` at `backend/src/services/githubService.ts:150-153`. It is a coarse single
value, not a language breakdown. Treat it as a weak fallback below dependency-file parsing, and
never present it as "GitHub says".

### 3.3 Narrative

| Field | Preferred source | Fallback | AI infer? | Human approval before publish? |
|---|---|---|---:|---:|
| `situation` / problem | Human override | `Project.primary_business_problem` (`Project.ts:122`) → `Project.selected_use_case` (`:126`) → AI draft from README + docs | yes | **YES** |
| `architecture` explanation | Human override | `Project.system_model` JSONB (`Project.ts:156`) → `docs/ARCHITECTURE.md` / `docs/architecture/**` from the repo → AI draft | yes | **YES** |
| `build timeline` | **Deterministic** — commit dates from `commit_summary_json` (`GitHubConnection.ts:137`), first/last commit, `created_at`/`pushed_at` from `fetchRepoFacts` | `case_study_snapshots.source_commit_map` | **deterministic** (narrative gloss may be AI, the dates may not) | no if deterministic; **YES** for any narrative gloss |
| `roadmap` / what happened next | Human override only | none | yes (draft) | **YES** |
| `quotes` (any quoted human speech) | **Approved, attributable, consented source only** | **none — there is no fallback** | **NO** | **YES** |

**Quotes are the sharpest rule in this document.** Spec §12 lists *"Do not create quotes"* among
the AI prohibitions, and spec §15 makes *"no AI-generated quote exists"* a publish-gate condition.
The registry already carries a `DO_NOT_PUBLISH` block for exactly this failure —
`casestudy.fabricated` (`claimsRegistry.ts:598`) exists because a shipped page carried *"three
case studies with invented client quotations."* A Case Study with an unsourced quote must fail
the gate, not warn.

### 3.4 Measurement

| Field | Preferred source | Fallback | AI infer? | Human approval before publish? |
|---|---|---|---:|---:|
| `business metric` (cost saved, time saved, ROI, revenue impact, % improvement, accuracy) | Approved `case_study_metrics` row with `publishable = true`, a `verification_class`, a `verification_method`, and a linked evidence row | **none** | **NO** | **YES** |
| `technical proof point` | Deterministic repo/platform measurement — test count, CI status, coverage, latency from a committed benchmark, `EvidenceRecord` counts | Human-entered with method `manual` | **deterministic** (value) / yes (label wording) | **YES** (still gated, but a technical proof point is a *valid* headline without any business ROI — spec §13) |
| `baseline` / `sample` / `methodology` / `limitations` | Human-entered on the metric row (`case_study_metrics.baseline`, `.sample`, `.methodology`, `.limitations`) | none | **NO** | **YES** |
| `verification_class` | Human decision, constrained to `verified \| anonymized \| illustrative \| pending` | defaults to `pending` | **NO** | **YES** |
| `verification_method` | Human decision, constrained to `client \| repo \| platform \| internal \| self \| manual` | none | **NO** | **YES** |
| `is_headline` | Human editorial decision | none | **NO** — spec §31: *"AI may not decide what is featured"* | **YES** |

Spec §7.6 states the rule in the schema itself: *"AI must never fabricate cost savings, time
savings, ROI, percent improvement, accuracy, production status, client verification, or revenue
impact."* Spec §13 adds the counterweight that keeps this honest: *"A Case Study does not need a
business ROI number to be valid. A repo/platform-verified technical proof point is acceptable.
Never manufacture a number just to make cards visually uniform."*

### 3.5 Evidence and artifacts

| Field | Preferred source | Fallback | AI infer? | Human approval before publish? |
|---|---|---|---:|---:|
| `case_study_evidence` rows | Existing `EvidenceRecord` (`evidence_records`, via `evidence_record_id`) | `github_commit` / `github_pr` / `repo_file` refs from deterministic extraction; `client_confirmation` / `internal_measurement` / `manual` are human-entered | **deterministic** (linking) / **NO** (creating an evidence claim) | **YES** for anything publicly visible |
| `artifacts` (screenshots, architecture diagrams, demos, decks, reports) | Approved `case_study_artifacts` rows with `status = 'approved'` | Sourced from `PortfolioArtifact` (`runtime_portfolio_artifacts`) or a repo path | limited (titles/descriptions only) | **YES** — `status` starts at `candidate` |
| `artifact.public_url` / `preview_url` | Only for `visibility = 'public'` **and** `status = 'approved'` | none | **NO** | **YES** |
| `repo link` | Requires **all three**: repo is public **AND** `case_study_repositories.allow_public_repo_link = true` **AND** the publication snapshot approves it (spec §16) | none — a private repo has **no** public representation, not even owner/name | **NO** | **YES** |

**The repo-link rule is a conjunction, and every clause is load-bearing.** Spec §16: *"never
render raw repo URL publicly; never expose owner/repo if it reveals a customer; never expose
tokens, installation IDs, or private file URLs."* `allow_public_repo_link` defaults to `false`
(spec §7.3) — the safe default is silence.

### 3.6 Status, publication and dates

| Field | Preferred source | Fallback | AI infer? | Human approval before publish? |
|---|---|---|---:|---:|
| `production` / shipped status ("live in production", "deployed") | Approved human attestation, recorded as a metric or evidence row with a `verification_method` | Deterministic *proxies* only — a `homepage` URL on `fetchRepoFacts`, a Pages URL, a green CI run. **A proxy is evidence of deployment machinery, not of production use.** | **NO** | **YES** |
| `case_studies.status` (`draft\|review\|approved\|published\|archived`) | Admin workflow action | none | **NO** | **YES** (it *is* the approval) |
| `case_study_publications.status` + `surface_key` | Admin publish action; Phase 1 permits `enterprise` only (spec §6.2) | none | **NO** | **YES** |
| `featured` / `featured_rank` | Human editorial decision | none | **NO** — spec §31 | **YES** |
| `published_at` / `approved_at` / `archived_at` | System clock at the moment of the human action | none | **deterministic** | implicit |
| `created_at` / `updated_at` (record lifecycle) | System clock | none | **deterministic** | implicit |
| project/build dates shown publicly | Deterministic — commit history and repo `created_at`/`pushed_at` | Manifest | **deterministic** | no if deterministic |

**"Production" is called out separately from `status` on purpose.** Spec §12 lists *"Do not claim
production deployment"* among the AI prohibitions, and spec §15 makes *"no unverified
production/ROI/outcome claim exists"* a gate condition. A `homepage` field on a GitHub repo is
not proof that anything runs in production for a real user.

### 3.7 Consent

| Field | Preferred source | Fallback | AI infer? | Human approval before publish? |
|---|---|---|---:|---:|
| organization identity consent (`named\|anonymized\|hidden`) | Recorded human consent | **none** | **NO** — spec §12: *"Do not infer consent"* | **YES** |
| builder identity consent (`named\|role_only\|anonymous`) | Recorded human consent | **none** | **NO** | **YES** |
| public repo link consent | `case_study_repositories.allow_public_repo_link` | defaults `false` | **NO** | **YES** |
| manifest `consent:` block | **A request, never an authorization** | — | **NO** | **YES** |

Spec §8 is explicit that `requested_surfaces` in a manifest *"is a request, never automatic
publication authorization."* The same applies to every key under `consent:` — a file committed
to a repo by whoever had push access is not a consent record.

---

## 4. Fields the public API must never expose

Spec §19 enumerates this and spec §37 repeats it. The public projection is an **allow-list**, not
a redaction pass. There is no existing sanitizer in this repo to reuse (see `CURRENT_STATE.md`
§3.2, defect D-4), so this list is the specification for the one that must be written:

- draft or unapproved snapshots, and any `case_studies.status` other than `published`
- internal review notes, readiness scores, and sync-run diagnostics
- private source refs, `source_commit_sha` for private repos, private repo URLs, private
  `repo_owner`/`repo_name`
- student email, `enrollment_id`, `admin` ids, `created_by`/`approved_by`/`published_by`
- internal client names where consent is `anonymized` or `hidden`
- private evidence rows, and any evidence where `is_publicly_openable = false`
- any GitHub token, installation id, or webhook secret (never in a response, never in a log —
  spec §37; the fixed-field logger at `githubRepoClient.ts:57-60` exists for this reason:
  *"a spread here is how a token ends up in a log"*)
- `Project.project_variables` and any other raw untyped JSONB blob — this is the exact exposure
  in the existing public portfolio route that must not be repeated

---

## 5. The AI prompt contract

Spec §12 defines what AI may draft: standfirst, technical summary, problem-summary candidate,
build-summary candidate, architecture explanation, suggested taxonomy, timeline narrative. It
receives **only extracted source facts** plus these instructions, verbatim:

```text
Do not create metrics.
Do not invent client names.
Do not claim production deployment.
Do not create quotes.
Do not infer consent.
Do not create ROI.
Do not claim a capability unless evidence supports it.
Return unknown when evidence is insufficient.
```

Two operational constraints attach:

- **Use the repository's existing AI provider abstraction. Do not add a new model provider.**
  (Adding one is a governance escalation under root `CLAUDE.md`.)
- **AI output is always a draft and must never auto-publish.** Provenance must record tier 7, so
  a reviewer can see at a glance which sentences a machine wrote.

---

## 6. Provenance record shape

Every published snapshot carries provenance so that any field on a live page can be traced back
to its tier. The minimum per field or section:

| Key | Meaning |
|---|---|
| `tier` | 1–7 from §1 |
| `source_type` | e.g. `human_override`, `project`, `evidence_record`, `manifest`, `repo_file`, `github_api`, `ai_draft` |
| `source_ref` | The specific pointer — `projects.<column>`, `evidence_records.<id>`, `README.md@<sha>`, `case-study.yml@<sha>` |
| `source_commit_sha` | For anything derived from repo content |
| `generated_at` / `generated_by` | `repo_sync \| platform_sync \| human_edit` (spec §7.4) |
| `approved_by` / `approved_at` | For every field whose approval column above says **YES** |

This is what makes the `surface.proof.room` claim — *"Every proof record carries its evidence
class and the evidence behind it"* (`claimsRegistry.ts:585`) — true rather than aspirational.

---

## 7. Quick reference: the six absolute NOs

If nothing else from this document survives into implementation, these six must:

1. **Business metrics** — AI infer **NO**, human approval **YES**.
2. **Client / organization identity** — AI infer **NO**, human approval **YES**.
3. **Consent of any kind** — AI infer **NO**, human approval **YES**.
4. **Production / shipped claims** — AI infer **NO**, human approval **YES**.
5. **Quotes** — AI infer **NO**, human approval **YES**, and **no fallback source exists**.
6. **ROI** — AI infer **NO**, human approval **YES**.

Each maps to a publish-gate condition in spec §15. The gate **fails closed** and returns
actionable errors naming the specific field, e.g.:

```text
Cannot publish:
- headline metric "41% fewer stockouts" has no verified evidence
- organization name is visible but naming consent is not approved
```
