# Story Studio — Current State of the Case Study OS

**Checkpoint A deliverable. Discovery only — no application code was written, modified or deployed.**

This document establishes what the Case Study OS already is, so that the standing instruction —
*do not redesign or replace it without first proving the existing architecture cannot support the
requirement* — can actually be tested rather than asserted.

**The headline finding, stated up front: the architecture was built for this.** All four surfaces
exist in the type contract from day one, the publication table is uniquely keyed on
`(case_study_id, surface_key)` so four surfaces can coexist against one canonical row today, and the
admin preview already accepts and honours a non-enterprise surface parameter. Serving a second
surface publicly is a 12-line resolver edit plus a publication row, not a schema change. That is a
property the code claims about itself in comments, and it holds under inspection.

Companion document: `STORY_ASSET_MODEL.md`.

- Worktree `C:/Users/ali_m/casestudy-os-wt`, branch `workstream/case-study-os`
- HEAD `e2fbd96a` (*Merge remote-tracking branch 'origin/main' into workstream/case-study-os*)
- Working tree clean at time of measurement
- Date 2026-08-25

---

## Part 0 — Baseline test results

### 0.1 Backend type-check

Run with the **backend-local** compiler by explicit path. The root `node_modules/typescript` is
4.9.5 and reports a false clean on code TypeScript 5.9 rejects; it must never be used as the gate.

```
cd backend && ./node_modules/.bin/tsc --version
Version 5.9.3

cd backend && ./node_modules/.bin/tsc --noEmit
```

**Verbatim output: (no output — zero diagnostic lines).**

Run twice. The first run was piped to `tail`, which masks the compiler's exit status, so it was
re-run redirecting straight to a file and capturing the status directly:

```
./node_modules/.bin/tsc --noEmit > tsc_clean.txt 2>&1; echo "TRUE_TSC_EXIT=$?" >> tsc_clean.txt
```

The resulting file is **16 bytes** — exactly the string `TRUE_TSC_EXIT=0` and a newline. Zero
compiler output, exit status `0`, measured without a pipe in the way.

Wall time was approximately 50 minutes per run on this machine, peaking near 3.0 GB resident. That is
slow but not a failure; it is the whole backend graph including a 1000+ line `models/index.ts`.

Scope limit worth recording: `backend/tsconfig.json` sets
`exclude: ["node_modules", "dist", "**/*.test.ts", "**/__tests__/**"]`, so **backend test files are
not type-checked by `tsc --noEmit`**. A type error inside a backend test surfaces only when jest runs
it. A clean backend type-check says nothing about the type health of `__tests__/`.

### 0.2 Backend jest — the requested Case Study scope

```
cd backend && npx jest src/services/caseStudy src/routes/__tests__ src/models/__tests__ src/db/__tests__ src/types/__tests__
```

Verbatim summary:

```
Test Suites: 2 failed, 69 passed, 71 total
Tests:       2 failed, 1409 passed, 1411 total
Snapshots:   0 total
Time:        115.747 s, estimated 177 s
Ran all test suites matching /src\\services\\caseStudy|src\\routes\\__tests__|src\\models\\__tests__|src\\db\\__tests__|src\\types\\__tests__/i.
```

Suite breakdown of the 69 passing:

| Path | Suites |
|---|---|
| `src/services/caseStudy/__tests__` | 24 |
| `src/db/__tests__` | 24 |
| `src/routes/__tests__` | 15 |
| `src/models/__tests__` | 5 |
| `src/types/__tests__` | 1 |

**The two failures:**

```
FAIL src/routes/__tests__/projectRoutes.test.ts (57.209 s)
FAIL src/routes/__tests__/enrollmentRoutes.test.ts (27.201 s)
```

Both are `Exceeded timeout of 5000 ms for a test`. **Neither is a Case Study suite.** Both were
re-run in isolation and confirmed environmental:

- `npx jest src/routes/__tests__/enrollmentRoutes.test.ts src/routes/__tests__/projectRoutes.test.ts --runInBand`
  → `enrollmentRoutes` **PASS** (5.014 s); `projectRoutes` still failed while sharing the run.
- `npx jest src/routes/__tests__/projectRoutes.test.ts --runInBand`
  → `Test Suites: 1 passed, 1 total / Tests: 5 passed, 5 total`.

So each passes alone and fails under co-execution — the known flake class, caused by both suites
calling `buildApp()` against no configured database within a 5-second default timeout. **Zero real
failures. Every Case Study suite passes.**

### 0.3 What `jest.ci.config.ts` excludes

`backend/jest.ci.config.ts` is an **ignore-list**, not an allow-list — every suite runs unless named.
The header records the measured reason (`:19-22`): full suite 614 suites with 25 failures; with the
list, 589 suites, 588 passed, 1 skipped, exit 0.

The 25 exclusions (`:51-79`) are grouped as: 12 model/service suites needing a live database, 6
community-surface suites, and 7 middleware/seed/timeline suites that read model metadata at import.
Every one fails for the same environmental reason — Sequelize models never initialise with no
`DATABASE_URL`.

**No Case Study suite is on the ignore-list.** All 24 `services/caseStudy/__tests__` suites,
the `db/__tests__` schema suites and the Case Study route suites run in CI.

---

## Part 1 — The 20-point architecture map

### 1. Canonical `CaseStudy` ownership — human-owned vs sync-owned

`backend/src/models/CaseStudy.ts` — one row per project story, independent of any publishing surface.
Every column is declared three times on purpose (attributes interface, `init()`, `declare`), because
a column present in Postgres but absent from `init()` is invisible: reads return `undefined` and
writes are dropped without an error (`CaseStudy.ts:9-17`).

Two separate axes, deliberately not merged (`CaseStudy.ts:19-22`):

- **`status`** — the editorial lifecycle: `draft | review | approved | archived` (`:33`)
- **`visibility` + the two `*_identity_mode` columns** — the consent axis the publish gate reads

A record can be `approved` while organisation consent is still `hidden`, and publishing must fail
closed in that state.

**Human-owned fields** are defined by the `updateSchema` allowlist in
`backend/src/services/caseStudy/caseStudyAdminService.ts:118-133` — 15 fields: `title`, `slug`,
`status`, `canonicalSummary`, `industry`, `primaryCapability`, `programKey`, `builtByType`,
`visibility`, and the six organisation/builder consent fields. The comment above it (`:111-117`)
states the rule: *"A field absent from this object cannot be written through this service at all —
the consent columns are here because granting consent IS a human act."*

Two important properties:

- It is a **Zod object schema, not a `readonly string[]`**. No exported constant names these fields,
  so nothing can enumerate them programmatically.
- Unknown keys are **silently stripped, not rejected** — no `.strict()`, so Zod drops them. A second
  filter then re-projects key by key through a hand-written `set()` list (`:409-427`).
- The same allowlist is **duplicated** at the route layer as `updateBody`
  (`routes/admin/caseStudyAdminRoutes.ts:105-121`). Two independent literals; a field added to one
  and not the other silently fails.

Two writes happen that are not on the allowlist: `status: 'approved'` also stamps `approved_by` and
`approved_at` (`:435-438`); `status: 'archived'` calls `assertNotPublished` and stamps `archived_at`
(`:439-450`).

**Sync-owned** is everything else, and it never touches this row's editorial fields — the sync writes
snapshots, not `case_studies`.

### 2. Snapshot ownership, versioning, content hashing, immutability

`case_study_snapshots` is **immutable and append-only**. A regeneration is a new version, never an
overwrite (`models/CaseStudySnapshot.ts:5-10`).

- `updatedAt: false` is **load-bearing** (`:75`): the DDL gives the table `created_at` and
  deliberately no `updated_at`, so under Sequelize's default every write would set a column that does
  not exist and fail at runtime.
- Unique index `cs_snapshots_unique_case_version` on `(case_study_id, version)` (`:77`).

**Content hashing.** `hashCanonical` from `utils/canonicalHash.ts` — the same recursive key-sorting
sha256 that gives a BuildPlan its identity, extracted rather than reimplemented
(`caseStudySnapshotBuilder.ts:9-14`). **Nothing volatile reaches the hash**: only
`{ content, sourceCommitMap }` is hashed; `generatedAt`, provenance `recordedAt` and the correlation
id sit outside that envelope, and the clock is injectable so a test can prove it (`:16-23`).

**The idempotency gate** is `caseStudySnapshotStore.ts:135`:

```
if (latest && latest.content_hash === draft.contentHash) { ... return { outcome: 'unchanged', ... } }
```

Identical normalised content ⇒ identical hash ⇒ no new row, however many times the sync runs. It
compares against the **latest**, not any historical version, and the reason is semantic not
performance (`:15-20`): if a repository is reverted so its content matches version 3 while version 7
is current, that *is* a change and the reviewer needs a diff against what is live.

The version race is bounded at `MAX_VERSION_ATTEMPTS = 3` (`:38`) — CLAUDE.md prohibits unbounded
retry. A `SequelizeUniqueConstraintError` on `(case_study_id, version)` triggers a re-read; on the
third attempt it throws with `error_class: 'VersionRaceExhausted'`.

### 3. `CaseStudyPublication` — per-surface fields, the unique constraint, overrides, featured

**The constraint that makes everything else possible** —
`db/ensureCaseStudySchema.ts:318-319`:

```
CREATE UNIQUE INDEX IF NOT EXISTS cs_publications_unique_case_surface
  ON case_study_publications (case_study_id, surface_key)
```

Unique on the **pair**, not on `case_study_id` alone. One case study therefore holds up to four
publication rows simultaneously, each with its own pinned snapshot, status and featured state.

Per-surface columns (`ensureCaseStudySchema.ts:297-317`):

| Column | Honoured on the public page? |
|---|---|
| `surface_key` | **Yes** — SQL filter + predicate, asserted twice |
| `status` (`draft｜published｜unpublished`) | **Yes** — in memory |
| `published_snapshot_id` — **the pin** | **Yes** |
| `surface_title_override` | **Yes** — override wins, snapshot is fallback |
| `surface_summary_override` | **Yes** — same |
| `featured`, `featured_rank` | Read (index card + sort) — **never written by application code** |
| `section_order` | **No — dead column** |
| `hidden_sections` | **No — dead column** |
| `cta_profile_key` | **No — dead column** |
| `tenant_id`, `brand_id` | Never read on this path |

**Overrides that work** are exactly two, applied at `caseStudyPublicProjection.ts:145-146`:

```
title: text(publication.titleOverride) || text(content?.identity?.title),
standfirst: text(publication.summaryOverride) || text(content?.identity?.standfirst) || null,
```

**Verified finding — three declared columns are dead.** A repo-wide grep for `section_order`,
`hidden_sections` and `cta_profile_key` returns, for this table, only the DDL line and the three
model declarations. No read site anywhere. Editing them in the database today has **zero effect** on
`/stories/:slug`; the route sends the *surface profile's* order and CTA instead
(`publicCaseStudyRoutes.ts:158-159`).

**`featured` is read-only in practice.** `publishCaseStudy` omits it from both the create and update
payloads (`caseStudyPublicationService.ts:305-311`, `:325-332`). No route or service sets it. It also
never reaches `/stories/:slug` — it is a `PublicCaseStudySummary` key only, absent from
`PUBLIC_DETAIL_KEY_MAP`.

### 4. Evidence ownership — `case_study_evidence`

`models/CaseStudyEvidence.ts`. Shape: `case_study_id`, `evidence_record_id` (**nullable**, `:63`),
`metric_id`, `source_type`, `source_ref`, `source_commit_sha`, `title`, `description`,
`verification_class` (defaults `'pending'`), `is_publicly_openable` (defaults `false`), `public_url`,
`reviewed_by`, `reviewed_at`, `metadata` JSONB. No `updated_at` — `updatedAt: false` again load-bearing.

**Who writes it:** exactly one function, `linkEvidenceRecords` in
`services/caseStudy/caseStudyEvidenceSource.ts:300`. The module's contract is **link, never mutate**
(`:4-14`): `evidence_records` is the currency of progression — each row awards Builder XP and carries
a unique idempotency key — so this module reads it and writes only a pointer. *"Editing a learner's
evidence to make a story read better would corrupt the ledger the platform grades on. The test
asserts it twice: statically over the source text, and at runtime with model mocks whose write
methods fail the suite if called."*

Every row lands `verification_class: 'pending'` and `is_publicly_openable: false` **even when the
source record has `validated = true`** — the platform confirming a learner did the work is not a
person deciding it may appear publicly.

**`evidence_record_id` nullability is deliberate and load-bearing.** NULL means manually-created
evidence. The partial unique index `cs_evidence_unique_source_record ... WHERE evidence_record_id IS
NOT NULL` (`ensureCaseStudySchema.ts:255-257`) therefore constrains imported links only and leaves
manual evidence unlimited.

### 5. Artifact ownership — type union, visibility, `presentation`, hero resolution

**Type union** (`types/caseStudy.ts:175-186`) — 11 members: `screenshot | architecture | photo |
demo | deck | roadmap | report | evaluation | code | document | other`.

**Visibility** (`:191-192`): `public | request_only | private`. `request_only` renders a real ask,
never a fake download. **Status** (`:194-195`): `candidate | approved | rejected` — candidates are
never publishable.

**`presentation` — evidence vs atmosphere.** Two values (`types/caseStudyPublic.ts:177`), **derived
from the artifact type and never read from the row** (`caseStudyArtifactPresentation.ts:38-40`):

```
export const ATMOSPHERE_ARTIFACT_TYPES = Object.freeze(['photo']);
export function artifactPresentation(type) {
  return ATMOSPHERE_ARTIFACT_TYPES.includes(type) ? 'atmosphere' : 'evidence';
}
```

`photo` is the only atmosphere member. The reason it is derived rather than authored
(`types/caseStudyPublic.ts:166-177`): *"an author-set flag would make 'is this evidence?' an
editorial field, which is exactly the decision that must not be editable."* The governing rule the
whole system inherits from the claims registry is quoted at `types/caseStudy.ts:156-161`: *"a picture
presented as evidence of something that did not happen is a fabricated claim, it just happens to be
made of pixels."*

A `photo` whose title or description makes a delivered-work claim is **dropped entirely** from the
public payload (`caseStudyPublicSections.ts:341-350`), matched against a closed 22-term vocabulary
(`caseStudyArtifactPresentation.ts:73-78`).

**Hero resolution priority** (`caseStudyArtifactPresentation.ts:54-56`):

```
export const HERO_IMAGE_PRIORITY = Object.freeze(['screenshot', 'architecture', 'photo']);
```

Resolved by `resolveHeroImage` (`caseStudyPublicSections.ts:428-439`). The full ordered chain:
pre-filter to `status === 'approved'` and `access === 'open'`; then try `screenshot`, then
`architecture`, then `photo`; within each artifact `previewUrl` before `url`; otherwise `null`. A
`request_only` artifact can never be the hero. The order is the rule, not a convenience — a real
product image always wins over a photograph.

**Who writes artifacts — and the blocking gap.** The complete set of writes to
`case_study_artifacts` in `backend/src` is two `findAll` calls and **one `create`**
(`caseStudyEvidenceSource.ts:350`, `:369`; `caseStudySyncSources.ts:253`). That `create` hardcodes
`status: 'candidate'`, `visibility: 'private'`, `public_url: null`, `preview_url: null`. It is
called from both the sync (`caseStudySyncService.ts:292`) and admin
(`caseStudyAdminService.ts:299`) paths.

**There is no `update`, no `destroy`, and no artifact CRUD route.** Since `projectArtifacts` drops
anything not `approved`, the entire hero / carousel / figure surface cannot populate through the
application. How an artifact would reach `approved` today is unverified — presumably a snapshot
override at `artifacts[n].status`, or direct SQL.

### 6. Repository collection behaviour and roles, including the partial unique indexes

**Role union** (`types/caseStudy.ts:198-208`) — 10 members: `primary | frontend | backend | agents |
data | infra | docs | evals | demo | other`. **There is no `supporting` or `reference` role.** The
runtime mirror carries a two-direction compile-time proof that the list and the union agree
(`caseStudyRepoCollection.ts:66-78`).

**The two partial unique indexes on the repo tables:**

```
CREATE UNIQUE INDEX IF NOT EXISTS cs_repositories_unique_per_collection
   ON case_study_repositories (collection_id, LOWER(repo_owner), LOWER(repo_name))

CREATE UNIQUE INDEX IF NOT EXISTS cs_repositories_one_primary_per_collection
   ON case_study_repositories (collection_id) WHERE role = 'primary'
```

(`ensureCaseStudySchema.ts:144-145`, `:161-162`.) The first makes `Owner/Repo` and `owner/repo` the
same repository inside a collection — an expression index Sequelize's `indexes` option cannot
express, so it lives only in the DDL and the model says so (`CaseStudyRepository.ts:16-18`).

The second was added after a real race found in verification, and the DDL records it (`:146-160`):
`setRepositoryRole` reads current rows *outside* its transaction and demotes from that snapshot, so
two concurrent promotions could each demote a stale incumbent and both commit, leaving two primaries
and an ambiguous Case Study. The partial index closes it fail-closed. The cited precedent is
`github_connections_unique_project`, also a partial unique index.

**Cardinality.** The schema permits one-to-many (`case_study_id` has only a non-nunique index,
`:114`) and the association is `hasMany` (`models/index.ts:1803-1804`), but the service behaves
one-to-one via `findOrCreate` on `{ case_study_id }` (`caseStudyRepoCollection.ts:281-288`). A
collection holds many repositories, capped at `MAX_REPOS_PER_CASE_STUDY = 20` (`:85`). A repo is not
bound to one story — *"the same repo may be one Project's workspace and evidence in five Case Studies
at once"* (`:8-11`).

Note the namesake trap: `CaseStudyCollection` (singular, `models/CaseStudyCollection.ts`) is a saved
editorial **filter**, unrelated to repo collections, and deliberately has no association.

### 7. The repo analyzer — what it extracts, its seams, and Story Studio reuse

`services/caseStudy/caseStudyRepoAnalyzer.ts` plus three siblings: `repoFactExtractors.ts` (pure —
which files are worth reading), `repoDependencySignatures.ts` (pure — what manifest bodies prove),
`caseStudyRepoReader.ts` (the five bounded, classified GitHub reads).

**What it extracts** — `CaseStudyRepoFacts` (`:102-121`): `metadata` (18 fields — visibility,
default branch, topics, language bytes, timestamps, license, latest commit sha, fork/archived flags),
`derived` (21 fields — languages, frameworks, dependencies, databases, aiSdks, aiProviders,
agentClues, testFrameworks, ciProviders, plus 11 boolean/count signals and `deploymentUrl`),
`documents` (up to 6 prose excerpts), `manifestFile`, `filesRead`, `fileCount`, `treeTruncated`,
`treeSource`, `accessStatus`.

**The seam is `fetchImpl`** (`:145-152`):

```
export interface AnalyzeRepositoryInput {
  readonly owner: string;
  readonly repo: string;
  readonly correlationId?: string;
  /** Injected in tests. Production omits it and the client uses global fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly persistedTree?: PersistedRepoTree | null;
}
```

Default at `githubRepoClient.ts:103`: `const fetchImpl = opts.fetchImpl ?? fetch;`.

The clock is deliberately **not** injected — freshness is pushed to the caller as a required `nowMs`
argument (`:194-206`). The token is explicitly not a seam (`:29-32`): *"This file never reads
`GITHUB_TOKEN` and never accepts a token argument."*

**Bounds and failure handling.** Per repository: 1 metadata + 1 commit-head + 1 languages + 1 tree
request, then at most `MAX_CONTENT_FETCHES = 24` file bodies each capped at `MAX_FILE_BYTES = 128 KB`
— a 10,000-file repository costs at most 28 requests (`:16-20`). Timeout `15_000 ms`, `MAX_ATTEMPTS
= 3` with `300 * attempt` backoff, retrying only 429/5xx/rate-limited (`githubRepoClient.ts:19-20`,
`:147-150`). Seven error classes, no eighth invented (`caseStudyRepoReader.ts:44-47`):
`RepoNotFound | Unauthorized | RateLimited | Timeout | MalformedManifest | RepoEmpty | Unknown`.
There is no circuit breaker in the GitHub layer — a documented deferral (`:26-31`).

**Could it serve a Story Studio "analyze" step unchanged? Yes.** The input carries no CaseStudy
identity — `{ owner, repo, correlationId?, fetchImpl?, persistedTree? }` with a Zod schema accepting
only `owner`, `repo`, `correlationId`. It imports no Sequelize model and touches no database. It
writes nothing and is *"idempotent by construction"* (`:38-39`). The existing caller already unpacks
persisted rows to `(owner, repo)` before calling (`caseStudySyncService.ts:240-243`), so a
hand-typed repo reference behaves identically. The only caveats: it requires `GITHUB_TOKEN`, and it
logs under `service: 'case-study-repo-analyzer'` — cosmetic.

`persistedTree` is declared and tested but **has no production caller**; the tree request is always live.

### 8. The publish gate — every rule, every blocker code, the extension point

`services/caseStudy/caseStudyPublishGate.ts:158`. One pure function. Every rule invoked
unconditionally; nothing short-circuits. **No override argument and no force flag** — stated as
doctrine at `:11-13`.

**11 blocker codes** (`caseStudyPublishRules.ts:45-57`, mirrored as a const array at `:58`), emitted
from **32 distinct sites**:

| Code | Triggers | Where |
|---|---|---|
| `surface_not_publishable` | surface is not `enterprise` | `Rules:182` |
| `case_study_not_approved` | status ≠ `approved`; or archived | `Rules:190`, `:195` |
| `snapshot_not_approved` | no snapshot; status ≠ `approved`; missing approver/timestamp; content not an object | `Rules:204/210/216`, `Gate:181` |
| `metric_pending` | visible metric with `class: 'pending'` | `Rules:227` |
| `organization_consent` | 5 rules — drift ×2, named-without-consent, named-without-name, hidden-but-named | `Rules:246-267` |
| `builder_consent` | 6 rules — drift ×2, mode consent, contributor named without consent / wrong mode / no `consentRecordedAt` | `Rules:282-312` |
| `private_repo_exposed` | `allowPublicRepoLink` true while visibility ≠ `public` (incl. `unknown`) | `Rules:329` |
| `self_attested_verification` | visible metric `class: 'verified'` + `method: 'self'` | `Rules:352` |
| `proof_metadata_missing` | verified metric with no `evidenceId`; headline metric with no baseline/sample/methodology; production status verified with no `evidenceId` | `Rules:358/365/372` |
| `ai_generated_quote` | quotation in prose at tier `ai_draft` or `unknown`; provenance records `ai_draft` at a `quote`-classified path | `ClaimScan:236`, `:251` |
| `unverified_claim` | `ai_draft` at another forbidden class; unbacked `%`/currency figure; ROI words without a business-outcome metric; production words without verified shipped status; `shipped` with pending/illustrative class; `shipped` with `self` method | `ClaimScan:255/273/278/283/294/299` |

**Where a new rule attaches.** There is **no registry array and no plugin list**. The extension point
is the hand-written call list inside `evaluateCaseStudyPublishGate` at `caseStudyPublishGate.ts:162-179`.
Adding a rule requires three coordinated edits:

1. write the rule in `caseStudyPublishRules.ts` (structural) or `caseStudyPublishClaimScan.ts` (prose)
2. add the call at `:162-179` and the import at `:105-117`
3. add the code to **both** the union (`Rules:45`) and the array (`Rules:58`) — two separate literals
   with nothing enforcing agreement

The de-facto signature is `(…what the rule reads…, b: Blockers) => void`, pushing via
`b.add(code, field, message, remedy)` (`Rules:129`). The gate is consumed only through
`caseStudyPublicationService.ts` — `:221` (read-only evaluation) and `:248` (before any write).

**The readiness rubric is separate and advisory.** `caseStudyReadinessService.ts:4-13`: *"It does not
authorise publication and must never be read as doing so. A score of 100 grants nothing."* Enforced
structurally — the report has no boolean, only a band `thin | developing | substantial`. Eight
weighted categories summing to 100 (`caseStudyReadinessRubric.ts:45`): evidence 20, technical 15,
story 15, outcome 15, identity 10, artifacts 10, consent 10, publication 5; 30 checks. The gate does
not import it. A record can score 100/100 and still be refused (`caseStudyPublishGate.ts:37-45`).

### 9. Admin editing — `updateCaseStudy`, `applyHumanOverride`, path semantics, re-sync survival

`updateCaseStudy` is covered in §1. `applyHumanOverride` is at `caseStudyAdminReview.ts:234`.

**Path grammar** — parsed by `parseProvenancePath` (`caseStudySnapshotOverrides.ts:41`):

```
path   := key ( '.' key | '[' digits ']' )*
key    := /^[A-Za-z_$][A-Za-z0-9_$]*$/  and not __proto__ | constructor | prototype
digits := /^\d+$/
```

Dots separate object keys; brackets carry array indices only. A bracket may follow a key or another
bracket but may not start the path or follow a dot. Leading/trailing dot, negative or float index,
unclosed bracket → `null` (never a throw). `FORBIDDEN_KEYS` blocks the three prototype-pollution
routes explicitly (`:39`).

**Writing** is `setAtPath` (`:82-99`), and its key property is that **a missing parent is never
created**: an out-of-range index or a wrong container kind is refused rather than punching `null`
holes. That surfaces as a 400 (`caseStudyAdminReview.ts:253-257`).

**Where overrides are stored: there is no overrides table.** An override lives in the snapshot itself,
in two places on one row — the value written in place inside `content` at the dotted path, and the
attribution as one entry in `provenance` keyed by the same path
(`caseStudySnapshotOverrides.ts:148-152`):

```
entries[override.path] = {
  tier: 'human_override',
  origin: { kind: 'human', actor: override.actor, note: override.note },
  recordedAt: override.recordedAt,
};
```

Both are persisted as a **new snapshot version with status `draft`** — never a mutation of the
version under review.

**Do overrides survive a re-sync? Yes — verified, four links:**

1. sync loads the previous snapshot — `caseStudySyncService.ts:315`
2. **`overrides: overridesFromSnapshot(latest)`** — `caseStudySyncService.ts:329`
3. extraction filters `tier === 'human_override'` and `origin.kind === 'human'` —
   `caseStudySyncSources.ts:318`
4. **generate first, override second** — `caseStudySnapshotBuilder.ts:251-256`, with the comment
   *"That order is the whole guarantee: a regenerated value can never land on top of a human's
   correction."* `merged.entries` spreads last, and `human_override` is index 0 of
   `CASE_STUDY_PROVENANCE_PRECEDENCE`.

Four real caveats: `MAX_CARRIED_OVERRIDES = 500` with a **silent** `break` and no warning surfaced
(`caseStudySyncSources.ts:324`); a path the regenerated content no longer contains is dropped rather
than recreated, and that skip happens *before* the builder so it is not reported anywhere (`:331`);
only the latest snapshot's overrides carry forward; a collapsed repo read skips the rebuild entirely
so overrides are safe there too.

### 10. Admin preview — `previewSurfaceProjection`

`caseStudyAdminReview.ts:443`. **It is not hardcoded to enterprise. It already accepts and honours a
non-enterprise surface today.** Evidence chain:

1. the schema binds to the **wider** set — `surfaceKey: z.enum(CASE_STUDY_SURFACE_KEYS)`
   (`:182-187`), all four, not `PUBLISHABLE_SURFACE_KEYS`
2. the parameter is forwarded, not overwritten — `projectPreviewDetail(record.slug, shown,
   data.surfaceKey)` (`:494`)
3. `projectPreviewDetail` forwards it (`caseStudyAdminPreview.ts:42-54`)
4. the projection branches on it — `getCaseStudySurfaceProfile(input.surfaceKey)`
   (`caseStudyPublicProjection.ts:197`)
5. the route exposes it — `GET /api/admin/case-studies/:id/preview?surfaceKey=training` works today.
   `DEFAULT_SURFACE = 'enterprise'` (`caseStudyAdminRoutes.ts:146`) is a **default, not a clamp**
6. a non-enterprise preview is **not refused** — `projection` is computed independently of
   `decision.allowed`. The `surface_not_publishable` blocker appears in `decision.blockers` while the
   rendered projection is still returned

**Two qualifications.** The surface-dependence is **shallow**: `projectPublicDetail` reads only
`profile.cta` from the profile. `profile.hero`, `sectionOrder`, `hiddenSections` and `emphasis` are
served separately by `publicCaseStudyRoutes.ts:148-160`, which the admin preview never calls — so a
`training` preview differs from `enterprise` **only in the echoed key and four CTA strings**. And it
is **not test-covered**: the only surface exercised in `caseStudyAdminPreview.test.ts` is
`'enterprise'`. Verified by code reading, unverified by test.

### 11. Public projection — how the payload is assembled

`caseStudyPublicProjection.ts` is declared **the security boundary** (`:1-2`). The doctrine (`:5-9`):

> There is no spread of an internal object anywhere in this file, no `...content`, no
> `Object.assign`, no `JSON.parse(JSON.stringify)` of a row. An internal field reaches the public
> payload only when a human types its name into one of these literals

Two stages: `common(input)` (`:140-156`) for the ten fields shared by summary and detail, then
`projectPublicDetail` (`:194-251`) — a single object literal with 31 named keys. Backed by
compile-checked runtime allowlists `PUBLIC_SUMMARY_KEY_MAP` / `PUBLIC_DETAIL_KEY_MAP`
(`types/caseStudyPublic.ts:307-360`) plus a 50-entry `FORBIDDEN_PUBLIC_KEYS` denylist (`:376-404`)
asserted disjoint from both.

**It reads the snapshot, never the live row.** `PublicProjectionInput.content` is typed
`CaseStudySnapshotContent` (`:118-125`), so it structurally cannot read a `CaseStudy` row, and the
module is pure — *"No model, no Express, no `fetch`, no `Date.now()`"* (`:31-33`). The store's
doctrine (`caseStudyPublicStore.ts:13-19`): *"PUBLISHED CONTENT COMES FROM THE PIN, NEVER FROM 'THE
NEWEST'… A sync that wrote a new draft snapshot this morning is invisible until somebody
republishes."* The live row contributes only to the visibility candidate and taxonomy fallbacks.

### 12. Mermaid handling

`architecture.diagramSource` (`types/caseStudy.ts:377-391`) carries Mermaid source for a
**human-authored** chart and only ever that. **Nothing generates it** — the snapshot architecture
builder emits no such key (`caseStudySnapshotSections.ts:172-179`), and a repo-wide grep finds it
only in the two type files, the public sections file, and fixtures. It is written solely through a
`human_override` at path `architecture.diagramSource`, which sits at precedence tier 0 so no sync can
overwrite it.

It does **not** replace `diagram`. `CaseStudyArchitecture.tsx` renders the verified node/edge list as
**text** on purpose, because *"a chart drawn from that same list would have to invent a layout the
data does not contain"*.

**Sanitisation — four rules, one function** (`caseStudyPublicSections.ts:224-230`):

1. must be a string, trimmed
2. must be non-empty after trim
3. `length > MAX_DIAGRAM_SOURCE_CHARS (8000)` → `null` (boundary inclusive: 8000 passes, 8001 fails)
4. **`if (source.includes('<')) return null;`**

The `<` rejection reasoning (`:210-218`): the renderer hands Mermaid's output to `innerHTML`, so the
chart source is a markup channel whether or not anyone intended one. Mermaid's own
`securityLevel: 'strict'` default escapes labels, *"but this module cannot see the renderer's
configuration and must not depend on it — a later change to a shared component would silently reopen
the hole."* Flowchart syntax needs no angle bracket, so refusing it costs a `<br/>` in a node label.

**Rejection is silent** — it returns `null`, no error class, no message. The band disappears and a
rejected diagram is indistinguishable from a record that never had one. If Story Studio wants an
authoring experience, making `projectDiagramSource` return a discriminated result is the seam.

**Renderer:** `frontend/src/pages/publicV2/StoryDiagram.tsx` → `components/visuals/MermaidDiagram.tsx`.
**Mermaid is not bundled** — it is fetched at runtime from
`https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs` via a dynamic import with
`webpackIgnore` (`MermaidDiagram.tsx:35-36`, `:61-63`), and a contract test asserts no `mermaid`
entry in `package.json`. The `innerHTML` sink the `<` rule defends is at `:80`. Note
`mermaid.initialize` does **not** set `securityLevel` (`:70-74`), relying on the `'strict'` default —
exactly the coupling the backend refuses to depend on. The client deliberately re-validates nothing
(`StoryDiagram.tsx:30-35`).

### 13. Metrics — entry shape, `isHeadline`, `publishable`, verification, hero vs measurement

Entry shape `CaseStudyMetricEntry` (`types/caseStudy.ts:293-306`): `key`, `label`, `valueDisplay`,
`numericValue?`, `unit?`, `metricType`, `verification`, `isHeadline`, `publishable`, `measurement?`.

`CaseStudyMeasurementContext` (`:284-290`) carries `baseline?`, `sample?`, `measured?`,
`methodology?` and a **required** `limitations` array — required not optional, because *"a
high-impact number without evidence context is incomplete, and an optional field is one a builder
forgets. An empty array is an explicit 'none', which is a different statement from 'nobody considered
it'."*

Verification is two **orthogonal** axes, not a hierarchy (`:49-54`): `class` (`verified | anonymized
| illustrative | pending`) and `method` (`client | repo | platform | internal | self | manual`).
`class: 'verified', method: 'repo'` and `class: 'anonymized', method: 'client'` are both valid and
mean different things.

Two independent locks: `publishable` defaults **false** and `verification_class` defaults
**`'pending'`** (`models/CaseStudyMetric.ts:91-92`, `:81`). *"AI writes rows here only as 'pending'
and may never set 'verified'."* `projectMetric` returns `null` unless both clear
(`caseStudyPublicSections.ts:149-168`).

**`heroMetrics` vs `measurement.metrics` — one list, not two.** `caseStudySnapshotSections.ts:213`:

```
const heroMetrics = all.filter((m) => m.isHeadline);
```

Both are returned from the same `buildMetrics` call (`:216-220`), over the same `all` array.
`isHeadline` **selects**; it does not duplicate. An empty `heroMetrics` is legal — a record with no
verified figure renders a proof point instead of an invented number.

### 14. Surface profiles — all four

`services/caseStudy/caseStudySurfaceProfiles.ts`. All four keys exist from day one, *"what makes
'adding Training is a publication row, not a schema change' a real property rather than an
aspiration"* (`:10-14`).

| Field | enterprise | training | ai-flotation | refactored |
|---|---|---|---|---|
| `publishable` | **true** | false | false | false |
| `brandLabel` | Colaberry Enterprise | Colaberry Training | AI Flotation | Refactored |
| `hero.title` | What we shipped, and who built it. | What our learners built. | What we put into production. | The work behind the platform. |
| `emphasis` | business problem, team capability, outcome, measurement, architecture, roadmap, ownership | who built it, what they learned, skills, stack, artifacts, portfolio proof | workflow, what shipped, architecture, delivery, production, technical proof | project facts, build timeline, architecture, ownership |
| `sectionOrder` | shared `SECTION_ORDER` | **identical** | **identical** | **identical** |
| `hiddenSections` | `[]` | `[]` | `[]` | `[]` |
| `defaultSort` | `featured` | `featured` | `featured` | `featured` |

Exact key strings: `'enterprise' | 'training' | 'ai-flotation' | 'refactored'` — kebab-case, note
`'ai-flotation'` not `ai_flotation` (`types/caseStudy.ts:508`).

**What actually varies:** `surfaceKey`, `brandLabel`, `publishable`, three `hero.*`, five `cta.*`,
`emphasis`, and `defaultFilters.surface`. **What is identical across all four:** `defaultSort`,
`sectionOrder`, `hiddenSections`, and `defaultFilters.verificationClass` (the shared `PROVEN_ONLY =
['verified', 'anonymized']`).

So the per-surface section ordering and hiding capability **exists in the type and is entirely
unexercised**. Today the only real per-surface variation is copy. There is no `tone` field;
`emphasis` is the only tone carrier and its type comment is explicit that it is *"Copy, not logic: it
orders emphasis, it never changes what is true."*

`publishable` is enforced **twice, independently**: the profile flag, and `ruleSurface` in the publish
gate which refuses non-publishable surfaces regardless of it. `publishable` is never sent to the
client (`publicCaseStudyRoutes.ts:142`).

### 15. CTA profiles per surface

`CaseStudyCtaProfile` (`types/caseStudyFilters.ts:101-107`): `key`, `eyebrow`, `heading`,
`buttonLabel`, `href`. `key` is synthesised as `` `${surfaceKey}-default` ``.

| Surface | heading | buttonLabel | href |
|---|---|---|---|
| enterprise | Bring us a workflow worth improving. | Map an opportunity | `/lab` |
| training | Start the program that produced this work. | See the program | `/programs` |
| ai-flotation | Talk to the team that shipped it. | Start a conversation | `/contact` |
| refactored | Explore the platform that produced this. | Explore Refactored | `/refactored` |

It reaches the payload by **two independent paths** — inside `caseStudy.cta`
(`caseStudyPublicProjection.ts:237-242`) and inside `surface.cta`
(`publicCaseStudyRoutes.ts:152-157`) — and `key` is dropped from both, structurally, because
`PublicCaseStudyCta` has no `key` field.

`CaseStudyCTA.tsx` contains **no path, no product name and no wording of its own** (`:9-13`); every
string arrives from the surface profile. As noted in §3, `cta_profile_key` on the publication row is
dead: the CTA is 100% derived from the surface profile constant and cannot be overridden per
publication today.

### 16. Authorization — and the product-owner question

**`requireAdmin`** (`middlewares/authMiddleware.ts:58-78`) does **no DB lookup**. It verifies the JWT
and checks one claim against a hardcoded set (`:55`):

```
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
```

`admin` and `super_admin` are treated as **identical** here, and also in `adminAllowedSections`
(`:40-45`) where they are OR'd into the same branch.

**`mgmtSectionGate`** (`middlewares/mgmtSectionGate.ts`) maps a request path to a section via the
`PATH_SECTION` prefix table. **There is a Case Study entry** (`:41`):

```
['/api/admin/case-studies', 'program'],
```

— the same section as `/api/admin/projects`, with the rationale in-line: a Case Study is the
publishable projection of a platform Project, so the roles that manage Projects manage these. Without
the row the gate is deny-by-default and every scoped mgmt token would 403.

Crucially, **`mgmtSectionGate` is a narrowing mechanism only and can never be stricter than
`requireAdmin`.** Two escape hatches: `if (!payload.mgmt_role) return next();` (`:75`) — a legacy
admin login has no `mgmt_role` and bypasses the gate entirely — and mgmt `owner` short-circuits
(`:78`).

**Is there an existing superadmin / platform-admin concept that could represent "product owner
only"? No.** Exhaustive search for `superadmin|super_admin|isSuperAdmin|platformAdmin|ownerOnly|
restrictTo|envAllowlist|ADMIN_EMAILS|ALLOWLIST|requireOwner|DRI|productOwner` found no tier strictly
above normal admin usable for this. What exists is:

- **`super_admin`** — a *synonym* for admin everywhere except two routes in
  `routes/admin/roleRoutes.ts:16,24` via `requireRole('super_admin')`
  (`middlewares/rbacMiddleware.ts:13-22`). This is the closest existing "tier above admin" primitive
  and it is trivially reusable. **Caveat:** `mintMgmtAdminToken` mints `role: 'super_admin'` for
  anyone with `mgmt_role === 'owner'` (`services/access/mgmtBridgeService.ts:87`), and `mgmt_role` is
  settable over HTTP by any admin (`routes/admin/communityMemberRoutes.ts:96-110`) with no
  super_admin check — a privilege-escalation path into `super_admin`.
- **`requireCoryAuthorized`** (`authMiddleware.ts:181-214`) — the repository's **only existing
  precedent for a tier strictly above admin**, and it is a hardcoded email literal (`:197-198`):
  `payload?.email === 'ali@colaberry.com' || payload?.role === 'super_admin'`. Mirrored client-side in
  `frontend/src/hooks/useCoryAvailable.ts:27-28`. Not config — a string in two source files.
- **mgmt `owner`** — a narrowing role meaning "all sections"; cannot express "owner only".
- **`platform_super_admin`** (`modules/tenancy/tenantRoles.ts:32-48`) — conceptually the right shape
  and explicit that *"admins can see everything must not be the default"*, but it is
  membership-row-driven for the tenancy module and **is not read by `requireAdmin`,
  `mgmtSectionGate`, or any Case Study route**.
- **No env-driven email allowlist exists anywhere.** `config/env.ts` (370 lines) contains no
  `*_EMAILS`, no `*_ALLOWLIST`, no `ADMIN_EMAILS`; `.env.example` contains none.

**The repository-standard mechanism for a server-configured allowlist** is the `SBP_AGENT_SCOPING`
pattern: one parse site in `env.ts` (`:169`), one exported **pure predicate** taking
`(identity, setting)` with an `off` / `all` / CSV tri-state defaulting closed
(`services/sbp/scopeAgents.ts:212-218`), and the call site injecting `env.x` rather than reading
`process.env` inline (`services/sbp/sbpOrchestrator.ts:213`). A runtime-editable alternative is
`settingsService`, which already carries comma-separated email lists as a convention
(`admin_notification_emails`, `settingsService.ts:19`) and even a `super_admin_only` visibility tier
(`ai_cory_visibility`, `:46`) — though that key is declared and read by nothing.

**One mounting constraint matters.** `requireAdmin` is applied **per-route, never `router.use`**, in
`caseStudyAdminRoutes.ts`, and the file says why (`:35-39`): an admin sub-router is mounted with no
path scope, so an unscoped `router.use` guard applies to every request that reaches `adminRoutes`
afterwards — *"That has caused a production outage in this repo."* So an owner gate must be either
per-route, or path-scoped in `adminRoutes.ts` the way `requireSection` already is at `:178-179`:
`router.use('/api/admin/case-studies', requireCaseStudyOwner)`.

### 17. Tenant / brand resolution as it touches Case Study

The resolver is `modules/tenancy/tenantResolver.ts` — a **service, not middleware**; there is no
`app.use` tenant middleware. Order: source slug, then brand hostname, else unresolved (`:182-195`).
Security invariant (`:6-9`): *"a browser never names its own tenant… If a request body could carry
`tenant_id`, any visitor could write into any tenant's data by editing one field."*

**The Case Study subsystem does not read tenant or brand.** A grep across
`services/caseStudy/` returns only `brandLabel` in the surface profiles — a hardcoded display string.
`case_study_publications` carries `tenant_id` and `brand_id` columns but `caseStudyPublicStore.ts`
never reads them.

One indirect coupling: Case Study **analytics** inherit tenancy because they land in `page_events`
via the shared tracking controller, which calls `resolvePublicContext` and writes
`tenant_id`/`brand_id` (`controllers/trackingController.ts:151`, `:281-282`, `:441-442`). So a
`case_study_view` row carries tenant/brand, but nothing in the Case Study code path reads or sets it.

### 18. Case Study analytics — events, consent gate, `sanitizeEventData`

**Seven events** (`backend/src/constants/caseStudyEventTypes.ts:36-44`): `case_study_view`,
`case_study_filter`, `case_study_card_click`, `case_study_repo_click`, `case_study_artifact_click`,
`case_study_cta_click`, `case_study_share`. A 30-char ceiling is asserted because
`page_events.event_type` is `STRING(30)`.

**The backend emits none of them** — it only accepts them (ingest allowlist,
`controllers/tracking/trackingEventValidation.ts:66`) and queries them (War Room read allowlist).
All emitters are in `frontend/src/utils/caseStudyTracking.ts:208-272`, called from exactly two pages:
`StoriesV2.tsx` and `StoryDetailV2.tsx`.

**`sanitizeEventData`** (`caseStudyTracking.ts:143-181`) — **it is an ALLOWLIST**, with a denylist
retained as a redundant second gate. The decisive ordering is `:151-152`:
`if (!ALLOWED.has(normalised)) continue;` runs *before* the forbidden check. The docblock records
that it used to be a denylist and that verification defeated it with five payloads (a phone in
`contact_ref`, a repo URL in `link`, `author_name`, `jane(at)example.com`, and `'email '` with a
trailing space).

Five strip layers: (1) key not in `ALLOWED_EVENT_DATA_KEYS`; (2) key in `FORBIDDEN_EVENT_DATA_KEYS`;
(3) non-scalars dropped, never flattened; (4) **value-shape regardless of key** — email-shaped
(`@`, `(at)`, `%40`) and URL-shaped; (5) length cap 120, empty/whitespace and non-finite numbers
dropped.

**This confirms V-30/V-31 with a correction: the frontend is now an allowlist, not a denylist.** What
remains true is the asymmetry — the **backend has only the denylist** (`FORBIDDEN_EVENT_DATA_KEYS`,
`constants/caseStudyEventTypes.ts:65-109`) and no `ALLOWED_EVENT_DATA_KEYS`, and the backend docblock
states the consequence bluntly (`:48-63`): *"`recordPageEvent` writes `event_data` to JSONB verbatim.
So there is no server-side net."* Parity between the two lists is pinned by a contract test.

**The consent gate is client-side, two layers.** The tracker never starts without consent —
`PublicLayoutV2.tsx:39-49` calls `initTracker()` only from `trackingAllowed()` or the consent banner
callback (`:63`). The predicate is `getConsent() === 'granted'` (`config/v2Consent.ts:90-92`), state
is `granted | denied | unset` with `unset` → denied, and declining actively purges prior identifiers.
**Nothing on the server checks consent before recording a Case Study event**, so every Case Study
metric measures consenting sessions only.

Do not conflate this with the *publication* consent gate on naming organisations and builders — a
different concept enforced by the `organization_consent` / `builder_consent` blockers.

### 19. Existing visual/media handling

| Concept | Defined | Rendered |
|---|---|---|
| Artifact (row) | `models/CaseStudyArtifact.ts`, DDL `:264-288` | — |
| Artifact (public) | `types/caseStudyPublic.ts:185-201`, discriminated on `access: 'open'｜'request'` | artifacts band |
| Presentation | derived, `caseStudyArtifactPresentation.ts:38-40` | `data-presentation` attribute |
| Hero image | `resolveHeroImage`, `caseStudyPublicSections.ts:429` | **index card only** + `og:image` |
| Slide | `storyMediaModel.ts:55-61`; images are `screenshot｜architecture｜photo` | — |
| Carousel | `carouselSlides`, minimum 2 slides | `StoryMediaCarousel.tsx` — CSS scroll-snap, no library |
| Figure (in-narrative) | `storyFigurePlacement.ts` | `StoryFigure.tsx` |
| Diagram (verified) | `architecture.diagram` | rendered **as text** |
| Diagram (human) | `architecture.diagramSource` | `StoryDiagram` → `MermaidDiagram` |

**A figure concept does exist**, and its design note is a truth decision rather than a layout one
(`storyFigurePlacement.ts:16-21`): figures are placed **between** sections, never inside, because
*"A figure placed INSIDE 'The measurement' is captioned by that section whether anybody wrote a
caption or not… A figure placed BETWEEN two sections belongs to neither, carries its own type label
and its own title, and claims nothing it cannot support."* Atmosphere figures are additionally
excluded after `architecture`, `measurement`, `roadmap` and `contributors`.

Alt text is deliberately empty (`StoryFigure.tsx:15-20`): the wire carries an approved image and no
alt text, and *"writing a sentence describing a picture this code has never seen is exactly the
fabrication the evidence/atmosphere split exists to prevent"* — so the image is decorative and the
real caption beside it carries the meaning.

**`heroImageUrl` is computed on the detail payload but never rendered on the detail page** — only on
index cards and as `og:image`. Whether that is deliberate is unverified.

### 20. Exactly how `/stories/:slug` is assembled

**The public URL is `/stories/:slug` only.** There is no `/case-studies/:slug` route;
`/case-studies` exists solely as a redirect to `/stories` (`frontend/src/routes/publicRoutes.tsx:43`).
The API path is `/api/public/case-studies/:slug`.

**Frontend → API**

1. `App.tsx:71` — `<Route path="/" element={<PublicLayoutV2 />}>`
2. `App.tsx:127` — `<Route path="stories/:slug" element={<StoryDetailV2 />} />` (child, no leading slash)
3. `StoryDetailV2.tsx:74` — `const { slug } = useParams<{ slug: string }>()`
4. `StoryDetailV2.tsx:91` — `fetchCaseStudyDetail(slug, { signal })`
5. `services/caseStudyApi.ts:380-388` — GETs `` `${INDEX_PATH}/${encodeURIComponent(slug)}` `` where
   `INDEX_PATH = '/api/public/case-studies'` (`:44-45`), then `assertShape(body, ['surface', 'caseStudy'])`
6. `caseStudyApi.ts:303-306` — `fetch` with **`credentials: 'omit'`**, deliberately: *"a public page
   must not put a bearer token on an anonymous GET"* (`:14-18`). This client does not use the shared
   axios instance.

**Express middleware chain**

`helmet` (`server.ts:101`) → `cors` (`:102`) → `traceMiddleware` (`:107`) → `express.json` (`:121`)
→ `intelligenceMiddleware` (`:124`) → non-matching routers → **`app.use(publicCaseStudyRoutes)` at
`server.ts:174`** → `app.use(adminRoutes)` at `:176`.

**The mount order is load-bearing and correct.** `publicCaseStudyRoutes` is two lines *above*
`adminRoutes`. The comment at `server.ts:168-173` explains: mounting it below would make the public
proof library *"return 401 to every real reader while every authenticated smoke test kept passing."*
This is the known repo bug class (public routes after `adminRoutes` inheriting an auth guard) and it
is **not present here** — it is pinned by `routes/__tests__/publicCaseStudyRoutes.mount.test.ts`,
which builds both orders against an adminRoutes-shaped stand-in and asserts 200 above / 401 below.

**Handler**

7. router-level rate limiter, path-scoped, never bare `router.use` — `publicCaseStudyRoutes.ts:109`;
   240 req/min/IP default
8. `publicCaseStudyRoutes.ts:332` — `router.get('/api/public/case-studies/:slug', ...)` with an
   absolute path inside a flat mount
9. `:334-335` — slug validated against `PUBLIC_SLUG` (`schemas/publicCaseStudySchema.ts:114`); a
   malformed slug is a **404, not a 400**
10. `:336` — `const surfaceKey = resolveRequestSurface(req)` → **always `'enterprise'`**
11. `:338` — lazy `await import('../services/caseStudy/caseStudyPublicStore')`, keeping model imports
    out of the pure-module test path
12. `:339` — `store.loadPublishedRecordBySlug(slug, surfaceKey)`

**Store — four queries** (`caseStudyPublicStore.ts:218-229`, `:160-190`)

- Q1 `case_studies WHERE slug = :slug` — no status filter, no surface filter
- Q2 `case_study_publications WHERE case_study_id = :id AND surface_key = :surfaceKey LIMIT 1` —
  filters on **surface**, not on status
- filter out publications with no `published_snapshot_id` (`:163`)
- Q3 `case_studies WHERE id IN (...)` — re-fetches the row already loaded in Q1
- Q4 `case_study_snapshots WHERE id IN (published_snapshot_id...)` — **by the pin, not by recency**
- `assemble()` (`:145-156`) returns `null` unless `isApprovedSnapshot` passes and `content.identity`
  exists

The division is stated at `:22-25`: *"Only `surface_key` is filtered in SQL. Editorial state
(publication status, Case Study status, archive) is evaluated in memory."*

**In-memory editorial gate** — `isCandidatePubliclyVisible` (`caseStudyFilterService.ts:200-209`),
five conditions: surface matches, publication status is `published`, an approved snapshot exists, not
archived, and case study status is `approved` or `published`. Failure returns the same frozen
`{ error: 'Not found' }` body as an unknown slug, so the two cases are unprobeable.

**Projection** — `:344-353` builds `{ surface: surfaceView(profile), caseStudy: projectPublicDetail({...}) }`,
typed `PublicCaseStudyDetailResponse` (`:178-181`). `canonicalBaseUrl` comes from `env.publicAppUrl`,
which **defaults to `https://enterprise.colaberry.ai`** (`config/env.ts:350`) — so if `PUBLIC_APP_URL`
is unset anywhere, every `seo.canonicalUrl` points at the enterprise host regardless of where the page
is served, and `StoryDetailV2.tsx:204` copies that exact string to the clipboard on "Copy link".

**Render** — `StoryDetailV2.tsx:263-273` computes sections, SEO extras, hero metrics, facts,
indicators and figures; `visibleSections()` honours the **server's** `sectionOrder` and
`hiddenSections` (`storyDetailV2Model.ts:135-157`). Structure: `<SeoV2>`, then
`<article class="cbv2-story">` containing the page hero (eyebrow from the surface profile, title,
standfirst, verification badge, indicator rail, facts, hero metrics, actions, copy-link), then
`<StorySectionList>` which emits one `<section data-section={key}>` per key with a **sibling**
`<StoryFigureBand>`, then the CTA.

---

## Part 2 — The four direct questions

### Q1. Can four surfaces be served from one CaseStudy row today?

**Yes at the data layer, today, with no schema change. No at the HTTP layer, because of one
12-line function.**

**The constraint** (`ensureCaseStudySchema.ts:318-319`):

```
CREATE UNIQUE INDEX IF NOT EXISTS cs_publications_unique_case_surface
  ON case_study_publications (case_study_id, surface_key)
```

Unique on the pair. Four publication rows against one `case_studies` row is legal and is the intended
design: *"canonical truth lives in case_studies, and a publication binds ONE approved snapshot to ONE
surface"* (`ensureCaseStudySchema.ts:293-295`).

**The isolation mechanisms — asserted twice, deliberately:**

1. **In SQL** — `caseStudyPublicStore.ts:224`:
   `where: { case_study_id: study.id, surface_key: surfaceKey }`
2. **In the predicate** — `caseStudyFilterService.ts:204`:
   `if (candidate.surfaceKey !== surfaceKey) return false;`

The reason for the duplication is recorded at `caseStudyFilterService.ts:194-198`: *"the isolation is
asserted twice, at the query and at the predicate, because a single check is one refactor away from
being removed."*

**What blocks it today** is `resolveRequestSurface` (`publicCaseStudyRoutes.ts:124-126`):

```
export function resolveRequestSurface(_req: Request): CaseStudySurfaceKey {
  return 'enterprise';
}
```

The parameter is `_req` — underscore-prefixed, unused. No header, host, query param, cookie or path
segment is inspected. It is a constant in function clothing, and the comment says that is on purpose
(`:115-123`): *"It is a FUNCTION rather than a constant on purpose… Adding Training is an edit to
this resolver plus a publication row - nothing downstream of here names a surface."*

To serve a second surface publicly: edit that resolver, flip `publishable` in the surface profile,
extend `PUBLISHABLE_SURFACE_KEYS` (`types/caseStudy.ts:518`) so `ruleSurface` stops blocking, add the
frontend route and set `routed: true` / `indexPath` / `detailPathPrefix` in
`frontend/src/config/caseStudySurfaces.ts:124-126`, and insert the publication row. **No schema
change.** The architecture's central claim about itself holds.

### Q2. Do quotes exist in any form? External references? Charts?

**Quotes — only as a prohibition, never as data.** There is no quote table, type or field. What
exists is the refusal of one:

- `'quote'` is one of six `AiForbiddenFieldClass` values (`caseStudyProvenance.ts:107`), matched by
  `/quote|testimonial|endorsement/` (`:115`)
- `ruleQuotes` scans all narrative prose for a 3+-word quotation and blocks it when provenance is
  `ai_draft` **or `unknown`** (`caseStudyPublishClaimScan.ts:229-241`)

The `unknown` case is treated identically to `ai_draft` on purpose (`:221-228`): *"Publishing a
quotation asserts that a named human said those words; a quotation whose authorship no provenance
entry records cannot support that assertion."*

**Nearest existing concept to extend:** `case_study_evidence` — it already has `title`,
`description`, `source_type` including `'client_confirmation'`, `verification_class`, `reviewed_by`,
`reviewed_at`, `is_publicly_openable` and `public_url`. For attribution, the pattern is
`CaseStudyContributor` (`types/caseStudy.ts:414-430`), a discriminated union on consent where "named
without consent" has no shape to occupy.

**External references — absent entirely.** Zero hits for
`externalRef|external_reference|citation|pressLink|external_link|referenceUrl` across
`services/caseStudy/`, `types/caseStudy*.ts` and `models/CaseStudy*.ts`. **Nearest concept:**
`case_study_evidence` again (it already carries `public_url` and the opt-in
`is_publicly_openable`), governed by `safeHttpUrl` (`caseStudyPublicSections.ts:77-88`) and the
three-gate repository link rule with its honest `withheld` counter (`:393-412`).

**Charts — absent entirely.** No chart concept anywhere in the subsystem. **Nearest concept:**
`architecture.diagram` — the precedent for a visual assembled from structured verified data and
hidden rather than fabricated when the data is absent — paired with `measurement.metrics` for the
numbers.

### Q3. Where would a chart get its numbers such that it cannot bypass metric verification?

**From `case_study_metrics`, by key reference, resolved through `projectMetric` at render time —
never by carrying its own values.**

The mechanism that makes this the only safe answer is `verifiedFigures()`
(`caseStudyPublishClaimScan.ts:135-147`). It builds the set of figures the page is permitted to
state, drawing only from metrics that are visible, `verified` or `anonymized`, and **not**
`method: 'self'`. The prose scan then checks every `%` and currency token against that set.

The matching is fold-then-compare, and the file records why containment was rejected (`:150-178`):
`'140%faster'.includes('40%')` was true, so a verified "140% faster" laundered an entirely unrelated,
unbacked "40%". *"Any verified figure would quietly vouch for every smaller figure that happened to
be a substring of it — which is the opposite of what a proof gate is for."*

A chart carrying `values: number[]` would sit **entirely outside** that mechanism — no rule compares a
chart datum to anything. A chart that names `CaseStudyMetricEntry.key` values and resolves them
through `projectMetric` inherits both locks automatically: `projectMetric` returns `null` unless
`publishable === true` and the verification pair passes (`caseStudyPublicSections.ts:149-168`). The
chart then cannot display a number the measurement section would refuse to display, because it is
literally the same number from the same function.

Note the existing precedent for restraint: `CaseStudyArchitecture.tsx` renders the verified node/edge
list as text rather than a chart, because *"a chart drawn from that same list would have to invent a
layout the data does not contain."* Whatever a chart renders must not require inventing data.

### Q4. What prevents a surface-specific claim from drifting from canonical truth today?

**Six mechanisms, in order of strength.**

1. **There is only one content object.** All surfaces read the same
   `case_study_snapshots.content`; a publication row selects *which snapshot version* is pinned, not
   what it says. The only surface-specific text that reaches the page is `surface_title_override` and
   `surface_summary_override` — two fields, both title-level, applied as
   `override || snapshot value` (`caseStudyPublicProjection.ts:145-146`). There is no per-surface
   body copy, so there is nothing for body copy to drift *from*.

2. **The projection is an explicit allowlist, not a spread.** `caseStudyPublicProjection.ts:5-9`:
   no `...content`, no `Object.assign`, no `JSON.parse(JSON.stringify)`. An internal field reaches
   the public payload only when a human types its name, backed by `PUBLIC_DETAIL_KEY_MAP` and a
   50-entry `FORBIDDEN_PUBLIC_KEYS` denylist asserted disjoint from it.

3. **The surface profile is copy, not logic.** `emphasis` orders what a surface leads with; its type
   comment is explicit (`types/caseStudyFilters.ts:134-137`): *"Copy, not logic: it orders emphasis,
   it never changes what is true."*

4. **The publish gate runs per publication.** `ruleSurface` and all ten other rules evaluate against
   the *canonical* record and the *pinned snapshot* every time — consent drift between the
   `case_studies` row and the snapshot's `identity` block is itself a blocker
   (`organization_consent`, `builder_consent`, drift rules at `caseStudyPublishRules.ts:246`, `:251`,
   `:282`, `:287`).

5. **Provenance precedence is a total order.** Seven tiers, index-ordered, with the merge rule
   `indexOf(incoming) < indexOf(existing)` and *"no second place for the ordering to be written down
   and disagree"* (`types/caseStudyProvenance.ts:30-43`).

6. **The content hash.** Same repo set + same SHAs + same facts ⇒ same normalised snapshot hash ⇒
   sync outcome `unchanged`. A surface cannot cause content to change, because a surface is not an
   input to the hash.

**Where the protection thins.** Two honest gaps:

- **The claim scan's vocabulary is closed.** The gate *does* read prose — `collectNarrative` covers
  15 paths across `identity`, `situation`, `buildTimeline`, `architecture`, `measurement`, `roadmap`
  and `artifacts` (`caseStudyPublishClaimScan.ts:62-87`) — but it only recognises five token classes:
  a 3+-word quotation, `PERCENTAGE`, `MONEY`, `ROI_WORDS`, `PRODUCTION_WORDS`. The file states the
  residue plainly (`:33-37`): *"A false sentence that uses none of the scanned vocabulary — 'the
  system transformed their operation' — passes, and no deterministic rule could reach it. Human
  snapshot approval is what stands in that gap."*
- **Several free-text fields are not in `collectNarrative` at all** and are therefore never
  claim-scanned: `identity.programLabel`, `contributors[].role`, metric `label`,
  `measurement.baseline / .sample / .measured / .methodology / .limitations[]`,
  `architecture.integrations[] / .dataStores[]`, and diagram node/edge labels. A `%` figure written
  into `measurement.methodology` reaches the public page unchecked.

---

## Part 3 — Verdict: supported / small extension / genuinely new

### Already supported — no code change needed

| Capability | Evidence |
|---|---|
| One canonical case study, four surface lenses | `UNIQUE(case_study_id, surface_key)`, `ensureCaseStudySchema.ts:318` |
| All four surfaces named in the contract | `types/caseStudy.ts:508-518` |
| Per-surface hero copy, CTA, brand label, emphasis | `caseStudySurfaceProfiles.ts:58-125` |
| Per-surface title and summary override | `caseStudyPublicProjection.ts:145-146` |
| Per-surface independent pin, status, featured state | `case_study_publications` columns |
| **Admin preview of a non-enterprise surface** | `?surfaceKey=training` works today, `caseStudyAdminRoutes.ts:357-367` |
| Surface isolation on the public read path | asserted twice, SQL + predicate |
| Repo analysis for a Story Studio "analyze" step | `analyzeRepository` takes `{owner, repo}`, no DB, no CaseStudy identity |
| Immutable versioned content with idempotent re-sync | content hash, `caseStudySnapshotStore.ts:135` |
| Human overrides surviving re-sync | `caseStudySyncService.ts:329` |
| One metric list serving both hero and measurement | `caseStudySnapshotSections.ts:213` |
| Human-authored Mermaid, sanitised at the boundary | `projectDiagramSource`, 4 rules |
| Figures placed between narrative sections | `storyFigurePlacement.ts` |

### Small extension — existing seam, bounded change

| Capability | The seam | Size |
|---|---|---|
| Serve a second surface publicly | `resolveRequestSurface` (`publicCaseStudyRoutes.ts:124-126`) + `PUBLISHABLE_SURFACE_KEYS` + frontend `routed: true` | 12-line function + 3 constants + 1 route |
| Per-surface section order / hidden sections | **Columns already exist and are dead.** Wire `section_order` / `hidden_sections` into `toPublicationFacts` (`caseStudyPublicStore.ts:134-143`) and `PublicProjectionPublicationFacts` | read sites only, no DDL |
| Per-publication CTA | **`cta_profile_key` already exists and is dead.** Same wiring | read sites only, no DDL |
| Set `featured` from the app | Column exists and is read; `publishCaseStudy` simply omits it (`caseStudyPublicationService.ts:305-311`) | add to two payloads + a route |
| Deeper per-surface preview | `projectPublicDetail` reads only `profile.cta`; plumb `hero`/`sectionOrder`/`hiddenSections` in | one function |
| A new publish-gate rule | Hand-written call list at `caseStudyPublishGate.ts:162-179` + two literals | 3 coordinated edits |
| **Artifact promotion to `approved`** | **No `update` exists at all** — only `findAll` ×2 and `create` ×1 | new service fn + route |
| Claim-scan coverage of the unscanned fields | Add paths to `collectNarrative` (`caseStudyPublishClaimScan.ts:62-87`) | one function |
| Server-side event-data allowlist | Backend has only the denylist; mirror `ALLOWED_EVENT_DATA_KEYS` | one constant + one filter |

### Genuinely new — nothing to extend from

| Capability | Why it is new | Nearest pattern (see `STORY_ASSET_MODEL.md`) |
|---|---|---|
| **Quotes as data** | Exists only as a prohibition | `case_study_evidence` + `CaseStudyContributor` consent union |
| **External references** | Zero occurrences anywhere | `case_study_evidence` + `safeHttpUrl` + 3-gate repo link rule |
| **Charts** | Zero occurrences anywhere | `architecture.diagram` shape, referencing metric **keys** only |
| **A product-owner-only tier** | No superadmin/owner concept exists above admin | `SBP_AGENT_SCOPING` env-allowlist pattern (`env.ts:169` + `scopeAgents.ts:212-218`), path-scoped in `adminRoutes.ts` |
| **Story Studio admin UI** | No `storyStudio` module exists | admin preview + `applyHumanOverride` are the backend it would drive |

### The bottom line

**The existing architecture supports the Story System requirement.** The four-lens model is not a
redesign — it is the design, already built, with the publication table keyed for it and the surface
profiles populated for all four. The single thing standing between today and a second live surface is
a function that ignores its own argument, and its comment says it was written that way so the change
would be small.

The genuinely new work is three content types (quotes, charts, external references) and one
authorization primitive — and none of the three content types needs a greenfield design, because
`case_study_evidence` and `architecture.diagram` are already the right shapes to extend.

**The strongest argument against redesign is the code's own discipline:** the projection is an
allowlist with a disjoint denylist, presentation is derived rather than authored, verification is two
orthogonal axes rather than one ladder, overrides are generate-first-override-second, and the
isolation check is deliberately written twice. That discipline is worth more than any greenfield
schema, and it is the thing a rewrite would most likely lose.

---

## Appendix — findings worth tracking

Discovered during this mapping. None was acted on.

| ID | Finding | Cite |
|---|---|---|
| A-1 | `section_order`, `hidden_sections`, `cta_profile_key` are dead columns — declared, never read | `ensureCaseStudySchema.ts:309-311` |
| A-2 | `featured` is never written by application code; only direct SQL can set it | `caseStudyPublicationService.ts:305-311`, `:325-332` |
| A-3 | **No code path promotes an artifact to `approved`** — blocks the whole image surface | only `create` at `caseStudyEvidenceSource.ts:369` |
| A-4 | `MAX_CARRIED_OVERRIDES = 500` breaks silently, no warning surfaced | `caseStudySyncSources.ts:324` |
| A-5 | The `updateCaseStudy` allowlist is duplicated with no shared constant | `caseStudyAdminService.ts:118` vs `caseStudyAdminRoutes.ts:105` |
| A-6 | New blocker codes need two hand-synchronised literals | `caseStudyPublishRules.ts:45` and `:58` |
| A-7 | `architecture` and `measurement` narrative carry **no verification pair**; only `situation` does | `types/caseStudy.ts:340` vs `:366-397` |
| A-8 | Fields absent from `collectNarrative` are never claim-scanned (metric labels, methodology, programLabel, contributor roles, diagram labels) | `caseStudyPublishClaimScan.ts:62-87` |
| A-9 | A rejected Mermaid diagram fails silently to `null` — no error class, no admin feedback | `caseStudyPublicSections.ts:224-230` |
| A-10 | `MermaidDiagram` does not set `securityLevel`, relying on Mermaid's default — the coupling the backend refuses to trust | `MermaidDiagram.tsx:70-74` |
| A-11 | `env.publicAppUrl` defaults to the enterprise host; unset `PUBLIC_APP_URL` mis-canonicalises every page | `config/env.ts:350` |
| A-12 | `loadPublishedRecordBySlug` runs 4 queries and re-fetches the row it already loaded | `caseStudyPublicStore.ts:166-168` vs `:221` |
| A-13 | Privilege escalation into `super_admin`: any admin can set `mgmt_role='owner'` over HTTP | `communityMemberRoutes.ts:96-110` + `mgmtBridgeService.ts:87` |
| A-14 | `MGMT_ROLES` includes `'mentor'` but the DB CHECK constraint omits it | `mgmtRoles.ts:28` vs `server.ts:681` |
| A-15 | Three stale doc comments on `CaseStudyArtifact.ts` list type/source/visibility values that do not match the authoritative unions | `models/CaseStudyArtifact.ts:19, 23, 30` |
| A-16 | `persistedTree` on the analyzer has no production caller | `caseStudyRepoAnalyzer.ts:138-143` |
| A-17 | `ai_cory_visibility: 'super_admin_only'` is declared and read by nothing | `settingsService.ts:46` |
| A-18 | `heroImageUrl` is computed on the detail payload but rendered only on index cards | `caseStudyPublicProjection.ts:221` |

### Prior findings, re-tested

- **V-29** — *"the publish gate reads structured fields and does NOT read prose"*: **refuted as
  written.** `collectNarrative` explicitly reads 15 prose paths including all three narrative arrays,
  and both prose rules iterate it. The true residue is narrower and twofold: the vocabulary is closed
  (A-8's first half, and the file says so itself), and several free-text **structured** fields are
  missing from the collector (A-7, A-8).
- **V-26** — *"`assertCaseStudySchema()` is presence-only"*: **confirmed.** It checks that expected
  tables, indexes and columns exist and is structurally unable to see an extra column no model
  declares (`ensureCaseStudySchema.ts:455-508`).
- **V-30 / V-31** — *"the tracking value filter is a denylist, and the allowlist is client-side
  only"*: **partly superseded.** The **frontend is now an allowlist** with the denylist kept as a
  redundant second gate (`caseStudyTracking.ts:151-152`). What remains true is the asymmetry: the
  **backend still has only the denylist** and writes `event_data` to JSONB verbatim, which the
  backend docblock states outright (`constants/caseStudyEventTypes.ts:48-63`).
