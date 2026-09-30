# Case Study OS — Test Plan

**Gate 0 deliverable.** The full test strategy, mapped to this repository's **real** toolchain
rather than the one its documentation describes. Observed against `origin/main` = `cfd016d9`,
2026-08-22.

Three toolchain facts drive everything below, and getting any of them wrong produces a test suite
that reports green while proving nothing:

1. **A backend test file must live under a `__tests__/` directory**, or jest collects it and
   nobody notices.
2. **`npx tsc --noEmit` from the repo root resolves TypeScript 4.9.5 and reports a false clean.**
   The gate is the **local 5.9.3 compiler**: `./node_modules/.bin/tsc --noEmit`, run from
   `backend/` and from `frontend/`.
3. **Playwright here is raw `.js` scripts run with `node`.** There is no `playwright.config.ts`,
   there are no `.spec.ts` files, and `@playwright/test` is not a dependency.

---

## 1. The toolchain, exactly

### 1.1 Commands

| Gate | Command | cwd |
|---|---|---|
| Backend typecheck | `./node_modules/.bin/tsc --noEmit` | `backend/` |
| Frontend typecheck | `./node_modules/.bin/tsc --noEmit` | `frontend/` |
| Backend jest — CI set (the merge gate) | `npx jest -c jest.ci.config.ts --ci` | `backend/` |
| Backend jest — everything | `npx jest` | `backend/` |
| Backend jest — one suite | `npx jest src/services/caseStudy/__tests__/caseStudySnapshotBuilder.test.ts` | `backend/` |
| Frontend tests | `CI=true npx react-scripts test --watchAll=false` | `frontend/` |
| Frontend production build (the real UI gate) | `CI=true npm run build:frontend` | repo root |
| Backend build | `npm run build:backend` | repo root |
| Route-auth lint | `node scripts/lint-route-auth.js` | repo root |
| Secret scan | `node scripts/secret-scan.js` | repo root |
| Playwright E2E | `BASE_URL=http://localhost:3000 ADMIN_JWT_SECRET=<dev secret> node tests/systemV2/<file>.e2e.js` | repo root |

### 1.2 The TypeScript false-clean trap

| Location | Declared | Installed |
|---|---|---|
| repo root | not declared in `package.json` | **4.9.5** (lockfile-pinned, hoisted by `react-scripts@5.0.1`) |
| `backend/` | `typescript: ^5.7.3` (devDep) | **5.9.3** |
| `frontend/` | `typescript: ^5.7.3` (devDep) | **5.9.3** |

`npx tsc --noEmit` executed from the repo root resolves **4.9.5** and reports a clean tree on code
that TypeScript 5.9 rejects. `npx` from inside `backend/` usually resolves the local 5.9.3, but
`npx` walks upward and can fall through to the root binary — which is why the invocation in this
plan is the **explicit local path**, `./node_modules/.bin/tsc --noEmit`. That form cannot resolve
anywhere else.

CI does the right thing via `working-directory: backend` / `frontend` in
`.github/workflows/ci.yml`. Local runs and agent runs must be equally explicit.

There is **no `typecheck` script** in the root, backend, or frontend `package.json`. `tsc --noEmit`
is always invoked directly.

### 1.3 tsconfig differences that change what is tested

| | `backend/tsconfig.json` | `frontend/tsconfig.json` |
|---|---|---|
| `strict` | `true` | `true` |
| target / module | `ES2022` / `commonjs` | CRA defaults, `jsx: react-jsx`, `isolatedModules: true` |
| Are tests typechecked? | **NO** — `exclude: ["node_modules","dist","**/*.test.ts","**/__tests__/**"]` | **YES** — `include: ["src"]` |

**Consequence:** a type error inside a backend test file is invisible to `tsc --noEmit` and
surfaces only when jest runs it. A type error inside a frontend test file **fails the frontend
typecheck**. Two different failure surfaces; plan for both.

### 1.4 Jest configuration

`backend/jest.config.ts` (35 lines) — `preset: 'ts-jest'`, `testEnvironment: 'node'`,
`roots: ['<rootDir>/src']`,
`testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.js']`,
`transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] }` (`:25-32`).

- **There is no `jest` key in any `package.json`.** Config lives in these two TypeScript files.
- **No `setupFiles`, no `setupFilesAfterEach`, no `globalSetup`, no `moduleNameMapper`.** Every
  suite is self-contained.
- **`testMatch` requires `__tests__/`.** `jest.config.ts:7-13` records that five suites and 117
  assertions were silently collected by nobody because of this. A file at
  `backend/src/services/caseStudy/caseStudySync.test.ts` **will not run**.
- **`isolatedModules: true` is deliberate** (`:25-30`): full-graph type checking pulls in 100+
  models through the 1720-line `models/index.ts` and exhausts the V8 heap.
  **`tsc --noEmit` is the type gate; jest is the runtime gate.** Do not expect jest to catch a
  type error.
- `.test.js` is in `testMatch` on purpose — `backend/src/scripts/` is plain JS.

`backend/jest.ci.config.ts` (83 lines) spreads the base and adds `testPathIgnorePatterns`
(`:45-81`) for 25 suites that need a live database. Measured: full suite 614 suites / 25 failed;
CI set 589 suites / 588 passed / 1 skipped / exit 0.

Its maintenance rule (`:42-43`): *"adding a suite here must come with a reason. If the list grows
without one, the gate is being narrowed back to where it started."*
**No Case Study suite may be added to that ignore list.** Every test in this plan is designed to
run without a database.

### 1.5 CI jobs

`.github/workflows/ci.yml`, six jobs, all `ubuntu-latest` / node 20:

| Job | What it runs |
|---|---|
| `backend-typecheck` | `working-directory: backend` → `npx tsc --noEmit` |
| `frontend-typecheck` | `working-directory: frontend` → `npx tsc --noEmit` |
| `frontend-build` | `env: CI: 'true'` → `npm run build:frontend` |
| `unit-tests` | `working-directory: backend` → `npx jest -c jest.ci.config.ts --ci` |
| `guards` | `node scripts/secret-scan.js`; `node scripts/lint-route-auth.js` |
| `security-scan` | `npx ts-node src/scripts/runSecurityScan.ts` (report-only) |

Plus `secret-scan.yml` → the `pull-request` job (gitleaks over `BASE_SHA..HEAD_SHA`).

**There is no frontend unit-test job.** `frontend/src/__tests__/adminNavRbac.test.ts` and the 10
other frontend suites never run automatically. Any frontend test written for this build must be
run manually and its result recorded in `PROGRESS.md` as verification evidence, or it is
decorative.

**`frontend-build` exists because a typecheck is not a build.** `ci.yml:44-53`:

> *"On 2026-08-15 commit 2f0a72dd left main unbuildable for hours with every check green: an
> eslint-disable comment in a .ts file named `react-hooks/exhaustive-deps`, a rule CRA does not
> register for .ts, which is itself an ESLint error — and CI=true promotes it to a failed build.
> tsc had nothing to say about any of it."*

The operational corollary, from `frontend/CLAUDE.md`: **`// eslint-disable-line
react-hooks/exhaustive-deps` is forbidden in this repo.** Use a stable derived value in the
dependency array instead (sanctioned example: `AdminLayout.tsx:48-52` depends on
`location.pathname` rather than a closure).

`ci.yml:3-5` says of itself that it is *"Non-blocking by default (not a required status check)."*
Branch protection is a server-side setting not observable from the worktree. **Treat all six
`ci.yml` jobs plus `secret-scan / pull-request` as the de-facto merge gate.**

### 1.6 Playwright reality

```
tests/systemV2/
  ecosystemIsolation.e2e.js      (8.6 KB)
  pointsEarnFlow.e2e.js          (5.7 KB)
  resolveWorkTabSmoke.e2e.js     (4.6 KB)
  v2-page-health.js              (3.7 KB)
  logs/
```

**No `playwright.config.ts`. No `.spec.ts` files. `@playwright/test` is not a dependency** — only
`playwright: ^1.58.2` in the root `package.json`. Everything is a plain Node script driving raw
`chromium`, run with `node <file>`, exiting 0 (pass) / 1 (fail) / 2 (misconfigured).

`tests/systemV2/resolveWorkTabSmoke.e2e.js:9-13` states this explicitly:

> *"Follows this repo's existing raw-Playwright pattern (see pointsEarnFlow.e2e.js) rather than
> @playwright/test, since only the `playwright` package (not `@playwright/test`) is a project
> dependency and no playwright.config.ts exists in this repo."*

**`tests/CLAUDE.md` documents four things the repo does not have:** an
`npx playwright test --config=tests/systemV2/playwright.config.ts` command, a `.spec.ts` naming
rule, a `PLAYWRIGHT_BASE_URL` env var (no script reads it), and *"from repo root, `npm test`"*
(which runs `npm run test --workspaces` → backend jest plus `react-scripts test` in **watch mode**,
which hangs a non-interactive run, and touches none of `tests/systemV2/`).

**Follow the repo, not the doc.**

Base URL comes from env per script: `resolveWorkTabSmoke.e2e.js:26` reads
`process.env.BASE_URL || 'http://localhost:3000'`; `v2-page-health.js:7` hardcodes
`http://localhost:3000`.

**Auth mechanism** — `resolveWorkTabSmoke.e2e.js:43-58`:

```js
if (!JWT_SECRET) {
  console.error('[e2e] ADMIN_JWT_SECRET is required (must match the target server\'s JWT_SECRET). Aborting without contacting any server.');
  process.exit(2);
}
const adminToken = jwt.sign(
  { sub: 'e2e-admin', email: 'e2e-admin@colaberry-test.local', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '15m' }
);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.addInitScript((t) => localStorage.setItem('admin_token', t), adminToken);
```

`role: 'admin'` with **no `mgmt_role`** ⇒ `adminAllowedSections()` returns ALL sections ⇒
`mgmtSectionGate` passes untouched. A token carrying `mgmt_role` would be section-gated —
which is itself a useful negative test (§6.4). `addInitScript` fires on every navigation in the
context, so the token survives client-side routing.

---

## 2. Test pyramid for this build

Root `CLAUDE.md` targets ~70 % unit / ~20 % integration / ~10 % E2E, and calls an inverted pyramid
a process violation. The Case Study OS fits that shape naturally because the expensive logic —
precedence, dedupe, hashing, readiness scoring, the publish gate, the public projection — is all
**pure**, which is this repo's dominant idiom ("pure core, tested from literals").

| Tier | Target | Where |
|---|---|---|
| Unit | ~70 % | `backend/src/services/caseStudy/__tests__/`, `backend/src/db/__tests__/`, `backend/src/routes/admin/__tests__/` |
| Integration | ~20 % | `backend/src/services/caseStudy/__tests__/*.integration-ish.test.ts` — **mocked models, real service composition**, no database |
| E2E | ~10 % | `tests/systemV2/caseStudy*.e2e.js` |

**Note on the word "integration".** There is exactly one real-Postgres suite in this repository —
`backend/src/services/sbp/__tests__/multiProjectIsolation.integration.test.ts` — and it self-guards
(`:40-52`): it runs only when `SBP_INTEGRATION_DB === '1'` and **throws** unless the database name
matches `/(^|[_-])(test|scratch|throwaway)([_-]|$)|^mp_test$/i`. It is the "1 skipped" suite in the
CI measurement.

**The Case Study integration scenarios in §4 do not use a database.** They compose real services
over mocked models — which is what spec §40's scenarios actually need, since every one of them is
about *decision logic*, not about Postgres.

---

## 3. Unit tests

Spec §39 lists fourteen required areas. Each is mapped to a concrete file and a run command below.
All live under a `__tests__/` directory. All run in the CI set.

**House style, non-negotiable** (`backend/CLAUDE.md` plus the corpus):

1. `const mockX = jest.fn()` declared **above** every `jest.mock` factory; referenced inside as
   `(...a: any[]) => mockX(...a)` so hoisting is safe.
2. `jest.mock(...)` first; module under test imported **last**.
3. Mock `../../config/database` with a bare object — minimal form at
   `backend/src/db/__tests__/ensureSbpSchema.test.ts:21`.
4. `jest.clearAllMocks()` in `beforeEach`; console silenced with
   `jest.spyOn(console, 'error').mockImplementation(() => undefined)`.
5. **Every test file opens with a block comment naming the production defect or invariant it
   guards.** Culturally enforced across the whole suite; a Case Study suite without one is
   out of style.
6. **Do not mock `global.fetch`** — inject `fetchImpl` (`githubRepoClient.ts:36-38`).

### 3.1 Spec §39 coverage map

| # | Spec area | File | What it asserts |
|---|---|---|---|
| 1 | repo URL normalization / reuse | `backend/src/services/sbp/repoConnect/__tests__/repoReference.test.ts` **(new — currently no direct test exists)** | All 7 accepted shapes canonicalise to `https://github.com/{owner}/{repo}`; `.git` stripped; `/tree/main` dropped; **`owner/my.project` keeps the dot** (the case both legacy regexes truncate); each rejection throws `RepoConnectError('InvalidRepoReference')` with a specific message |
| 2 | repo collection dedupe | `backend/src/services/caseStudy/__tests__/caseStudyRepoCollection.test.ts` | `sameRepo()`-based dedupe is **case-insensitive**; `Owner/Repo` and `owner/repo` collapse; two different collections may hold the same repo; the 20-repo cap raises a classified error |
| 3 | repo role validation | same file | Only `primary\|frontend\|backend\|agents\|data\|infra\|docs\|evals\|demo\|other` accepted; at most one `primary` per collection |
| 4 | source precedence | `backend/src/services/caseStudy/__tests__/caseStudyProvenance.test.ts` | The 7-tier ladder resolves highest-wins from literals; a tier-1 human override beats a tier-6 repo fact; **a later sync does not overwrite an override** (spec §34) |
| 5 | provenance | same file | Every resolved field carries `tier`, `source_type`, `source_ref`, and `source_commit_sha` where repo-derived; an AI-drafted field is stamped tier 7 |
| 6 | snapshot hashing | `backend/src/services/caseStudy/__tests__/caseStudySnapshotBuilder.test.ts` | Key order does not change the hash (the `canonicalize()` property); **no volatile field leaks into hashed content** — build the same snapshot twice with two different injected clocks and assert an identical hash |
| 7 | sync idempotency | `backend/src/services/caseStudy/__tests__/caseStudySyncService.test.ts` | Same repo set + same SHAs + same facts ⇒ `unchanged`; no second snapshot row; no duplicate repositories/metrics/evidence |
| 8 | readiness scoring | `backend/src/services/caseStudy/__tests__/caseStudyReadinessService.test.ts` | Deterministic from literals; the §13 weights sum to 100; **a Case Study with a technical proof point and no business ROI is valid** (spec §13) |
| 9 | metric publish gate | `backend/src/services/caseStudy/__tests__/caseStudyPublishGate.test.ts` | A `pending` publishable metric blocks publish; the error **names the metric**; a `verified` metric with no evidence pointer blocks; `method: 'self'` + `class: 'verified'` is rejected |
| 10 | consent publish gate | same file | Visible organization name without approved naming consent blocks; builder identity without consent blocks; **`requested_surfaces` in a manifest never satisfies consent** |
| 11 | private repo sanitization | `backend/src/services/caseStudy/__tests__/caseStudyPublicProjection.test.ts` | A private repo yields **no** `repo_url`, **no** `repo_owner`, **no** `repo_name` in the public shape; the three-clause public-link conjunction is enforced |
| 12 | surface filtering | `backend/src/services/caseStudy/__tests__/caseStudyFilterService.test.ts` | Enterprise-published is returned for `surface=enterprise`; a draft is not; a hypothetical `training` publication is not visible to Enterprise; sorts (`featured\|newest\|strongest-proof\|recently-updated`) are deterministic |
| 13 | public projection | `caseStudyPublicProjection.test.ts` | **Allow-list assertion:** given a fully-populated internal record, the public output contains *exactly* the permitted keys. Explicitly assert absence of `enrollment_id`, student email, `created_by`/`approved_by`, review notes, readiness score, private `source_ref`, and any raw JSONB blob |
| 14 | published snapshot pinning | `backend/src/services/caseStudy/__tests__/caseStudyPublicationService.test.ts` | A repo change after publish creates a **new draft** snapshot while `published_snapshot_id` stays pinned; republish is required to move it; repeated publish of the same snapshot is a no-op; repeated unpublish is a no-op |

**Command for the whole group:**

```bash
cd backend && npx jest src/services/caseStudy
```

### 3.2 Additional unit tests this repository's history demands

| File | Why it exists |
|---|---|
| `backend/src/db/__tests__/ensureCaseStudySchema.test.ts` | Mocked-`sequelize.query` contract test. Asserts **every** statement is `CREATE ... IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, that all ten tables appear, and that `assertCaseStudySchema()` has teeth. Header must repeat the doctrine from `ensureSbpSchema.test.ts:8-19`: *"Nothing here proves the DDL RAN."* Include the fixture-drift meta-test (`ensureSbpSchema.test.ts:50-60`) asserting the local catalog stays a superset of the source's `REQUIRED_TABLES`/`REQUIRED_COLUMNS`. |
| `backend/src/db/__tests__/ensureCaseStudySchema.modelParity.test.ts` | **The single most important test in this build.** Regex-parses the exported statement array and asserts every column has a matching declared model attribute (pattern: `ensureMultiTenantSchema.modelParity.test.ts:31-49`). This is the guard against the `feeae19a` failure — nine models whose new columns were never declared, leaving the entire tenancy runtime inert **while every test passed, because the tests mocked the models**. Needs no database. Requires the schema module to export its statements as a named `const`. |
| `backend/src/models/__tests__/caseStudyModels.test.ts` | Anti-drift: import the models with **no mocks at all** and assert literal attribute lists, diffing them against the hand-written DDL (pattern: `explorerGrowthModels.test.ts:1-21`, header `:7-21`: *"ANTI-DRIFT tests, not 'does Sequelize work' tests… because production does not run `sequelize.sync`"*). |
| `backend/src/routes/admin/__tests__/caseStudyAdminRoutes.paths.test.ts` | Reads `router.stack` to assert every declared path starts with `/api/admin/`, that the exact URLs the client calls are declared, and that literal segments (`/stats`, `/candidates`) come **before** `/:id`. Copy `organizationRoutes.paths.test.ts:36-70` verbatim. Defeats the 401-masks-a-404 trap. |
| `backend/src/routes/admin/__tests__/caseStudyAdminRoutes.authMissing.test.ts` | An unauthenticated caller gets 401 (pattern: the four `workforceRoutes.*.authMissing.test.ts` siblings). |
| `backend/src/routes/__tests__/publicCaseStudyRoutes.paths.test.ts` | Same stack-reading technique for the public router; asserts full absolute paths and **no** `router.use(<guard>)` layer. |
| `backend/src/services/__tests__/visitorTrackingService.categorize.test.ts` | **Defect D-1.** Asserts `categorizePagePath('/stories') === 'case_studies'`, `categorizePagePath('/stories/some-slug') === 'case_studies'`, and that `'/case-studies'` still returns `'case_studies'`. Pure function, zero mocks. |
| `backend/src/controllers/__tests__/trackingControllerEventTypes.test.ts` | Asserts every new `case_study_*` type is in `VALID_EVENT_TYPES` **and** is ≤ 30 characters (the `page_events.event_type` `STRING(30)` ceiling). |
| `frontend/src/pages/publicV2/__tests__/StoriesV2.test.tsx` | **Stories is currently the only untested V2 page.** Follow `ProofV2.test.tsx`: `renderToStaticMarkup` + `MemoryRouter`, the `html()`/`textOf()` helpers (`:20-27`), the banned-string list (`:37-57`), the no-blocked-claim-reprinted assertion (`:29-35`), exactly one `<h1>`, no `/admin` leak, no price render (`:151-163`), and badge presence via `data-evidence="…"` (`:131`) / `data-metric="true"` (`:144`). |

---

## 4. Integration scenarios (spec §40)

Real service composition, mocked models, no database. The in-memory fake-table idiom for stateful
multi-call flows is `backend/src/services/sbp/__tests__/repoConnectService.test.ts:11-53` — the
factory closes over a `rows` record and implements `findOrCreate` / `findOne`, including Sequelize
`Op` symbol handling via `Object.getOwnPropertySymbols(where.repo_owner)`.

| # | Scenario (spec §40) | File | Assertion |
|---|---|---|---|
| 1 | Existing Project ⇒ one Case Study draft | `backend/src/services/caseStudy/__tests__/createFromProject.integration.test.ts` | Given a `Project` + `GitHubConnection` + `EvidenceRecord` + `PortfolioArtifact`, exactly one `case_studies` row, one collection, one repository row, one draft snapshot. Repo resolution goes through `resolveProjectRepo`, **not** `project.github_repo_url` |
| 2 | Multiple repos ⇒ one Case Study | `backend/src/services/caseStudy/__tests__/multiRepoCollection.integration.test.ts` | frontend + backend + eval repos land as three `case_study_repositories` rows in **one** collection with distinct roles and one snapshot |
| 3 | Same sync twice ⇒ `unchanged` | `backend/src/services/caseStudy/__tests__/syncIdempotency.integration.test.ts` | Second run returns `status: 'unchanged'`, writes no new snapshot row, and produces an identical `content_hash` |
| 4 | Repo changes after publish | `backend/src/services/caseStudy/__tests__/snapshotPinning.integration.test.ts` | A new **draft** snapshot is created; `case_study_publications.published_snapshot_id` is unchanged; the public projection still serves the pinned content |
| 5 | Publish guard | `caseStudyPublishGate.test.ts` (§3.1 #9/#10) | A pending metric ⇒ publish rejected, with an error naming the metric |
| 6 | Privacy | `caseStudyPublicProjection.test.ts` (§3.1 #11) | Private repo + `allow_public_repo_link = false` ⇒ **no** private repo identity or URL anywhere in the public response |
| 7 | Surface isolation | `caseStudyFilterService.test.ts` (§3.1 #12) | Enterprise-published visible on Enterprise; draft not returned; a future training-only publication not visible to Enterprise |

**Additional scenarios this repo's failure history demands:**

| # | Scenario | File | Assertion |
|---|---|---|---|
| 8 | One bad repo ⇒ `partial`, not failure | `backend/src/services/caseStudy/__tests__/syncPartialFailure.integration.test.ts` | With `fetchImpl` injected to 404 one repo of three, the run is `partial`, two repos succeed, the failing repo gets a classified `access_status`, and the candidate survives |
| 9 | Rate limit is not "gone" | same file | A 403 carrying `x-ratelimit-remaining: 0` maps to `rate_limited`, **never** to `deleted` |
| 10 | Truncated file tree | `backend/src/services/caseStudy/__tests__/repoAnalyzerFacts.test.ts` | `file_tree_json.truncated === true` ⇒ absent-file conclusions degrade to `unknown`, not to `false` |
| 11 | Wrong-project persisted tree | same file | A `GitHubConnection` whose `repo_owner`/`repo_name` do not match the repo under analysis is **not** used as a fact source (defect D-8) |
| 12 | Human override survives sync | `caseStudyProvenance.test.ts` | A tier-1 override is intact after a sync that changed the underlying tier-6 fact; the diff is exposed to the reviewer |

**Command:**

```bash
cd backend && npx jest -c jest.ci.config.ts --ci
```

---

## 5. Tracking tests (spec §41)

Spec §41 requires verification of: `/stories` pageview, `case_study_filter`,
`case_study_card_click`, `/stories/:slug` view, repo click, artifact click, CTA click — and then
that Case Study PageEvents remain associated / backfilled to a known Lead per current behaviour.

**Hard rule: never create a production lead during tests.**

| # | Test | File | Assertion |
|---|---|---|---|
| 1 | Event types are accepted | `backend/src/controllers/__tests__/trackingControllerEventTypes.test.ts` | Every `case_study_*` type is in `VALID_EVENT_TYPES` (`trackingController.ts:36-64`) and ≤ 30 chars |
| 2 | **Category resolution** | `backend/src/services/__tests__/visitorTrackingService.categorize.test.ts` | `/stories` → `case_studies`; `/stories/:slug` → `case_studies`; `/case-studies` → `case_studies`. **This is defect D-1** |
| 3 | Journey titles | `backend/src/services/__tests__/journeyTimelineCaseStudy.test.ts` | Each new type has a `titleMap` entry (`journeyTimelineService.ts:150-171`) and does not fall through to the raw-string fallback at `:176` |
| 4 | Stage promotion | same file | `inferStage()` (`:69-96`) promotes a case-study visit past `awareness` once `page_category` is `case_studies` |
| 5 | War Room feed | `backend/src/routes/admin/__tests__/cohortRoutesCaseStudyFeed.test.ts` | The new types appear in the `IN (...)` list at `cohortRoutes.ts:111`, so events are not silently dropped |
| 6 | `event_data` shape | `frontend` unit test or the E2E network assertion | The payload is sent as `{ event_data: { … } }` — **not** spread at the top level (defect D-2). Keys flat, snake_case, scalar: `case_study_slug`, `surface`, `industry`, `capability`, `verification`, `source` |
| 7 | No PII in `event_data` | `caseStudyPublicProjection.test.ts` or a dedicated tracking test | Nothing user-typed reaches `event_data`; slugs, enum-like strings and numbers only. Nothing sanitizes this column at write time |
| 8 | Fire-once guard | frontend unit test | `case_study_view` fires once per slug per session (`recordPageEvent` has **no** dedup; pattern: `markOncePerSession` at `EnrollPage.tsx:85-89`) |
| 9 | Consent gating | frontend unit test | With `localStorage['cbv2_consent']` unset, **no** event fires and the page still renders correctly (`v2Consent.ts:90-92`, `PublicLayoutV2.tsx:39-49`) |
| 10 | Identity backfill | `backend/src/services/__tests__/resolveIdentityCaseStudy.test.ts` | After `resolveIdentity(visitorId, leadId)`, prior anonymous case-study events are associated. **Assert via `visitor_id`, which is what `journeyTimelineService.ts:129-148` actually joins on — not via `page_events.lead_id`, which lags and can fail silently** |

---

## 6. Playwright / browser proof (spec §42)

UI work is not complete without browser evidence. Follow the existing raw-Playwright pattern.

New files, all plain `.js` under `tests/systemV2/`:

```text
tests/systemV2/caseStudyPublicIndex.e2e.js
tests/systemV2/caseStudyPublicDetail.e2e.js
tests/systemV2/caseStudyMobile.e2e.js
tests/systemV2/caseStudyAdminFlow.e2e.js
```

Each: `const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');`
`chromium.launch({ headless: true })`, exit 0 / 1 / 2. Screenshots to `/tmp/case-study-os/`, with
the exact paths listed in the completion report.

### 6.1 Public index — desktop 1440×1000

```bash
BASE_URL=http://localhost:3000 node tests/systemV2/caseStudyPublicIndex.e2e.js
```

Verify: V2 nav present, masthead, dynamic ledger, filters, cards, proof badges, URL filter state
round-trips, card navigation reaches a detail page, **zero console errors**, no horizontal
overflow. Save a screenshot.

### 6.2 Public detail — desktop 1440×1000

```bash
BASE_URL=http://localhost:3000 node tests/systemV2/caseStudyPublicDetail.e2e.js
```

Verify: hero, situation, build timeline, architecture, measurement, roadmap, artifacts, CTA. Save
a full-page screenshot. Also assert an unknown slug renders the **404** branch — and that the
happy path did **not** silently fall through to it (the "guard the guard" idea from
`linkIntegrity.test.tsx:124-125`).

### 6.3 Mobile — 390×844

```bash
BASE_URL=http://localhost:3000 node tests/systemV2/caseStudyMobile.e2e.js
```

Verify: filters usable, one-column cards, collapsed timeline, **no horizontal overflow**, CTA
reachable, nav works. Save screenshots for index and detail.

### 6.4 Authenticated admin flow

```bash
BASE_URL=http://localhost:3000 ADMIN_JWT_SECRET=<dev secret> node tests/systemV2/caseStudyAdminFlow.e2e.js
```

Mint the JWT and inject it exactly as `resolveWorkTabSmoke.e2e.js:43-58` does. Ten steps
(spec §42): open `/admin/case-studies` → create from a test Project/repo fixture → sync → review
the candidate → edit an override → approve the snapshot → publish an Enterprise test record →
confirm the public page → unpublish → confirm the public page no longer exposes it.

**Development / test / staging data only.** Never production.

**Add an eleventh step this repo's RBAC model demands:** mint a second token carrying
`mgmt_role: 'curriculum'` and assert `/api/admin/case-studies` responds **200, not 403**. That is
the only automated check that will catch a missing `PATH_SECTION` entry
(`mgmtSectionGate.ts:21-41`) — `scripts/lint-route-auth.js` cannot see it, and
`backend/src/middlewares/__tests__/mgmtRbac.test.ts` is excluded from CI
(`jest.ci.config.ts:73`).

### 6.5 Screenshots for the review doc

Route all capture through `scripts/captureHelpers.js`: `MAX_SAFE_WIDTH = 1800` (`:18`),
`SAFE_VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 }` (`:20-24`), token from
`process.env.CAPTURE_TOKEN` or `scripts/.ali_jwt.txt` (`:33-41`), context via
`createSafeContext(browser, { token, viewport, label })`.

---

## 7. Regression sweep (spec §43)

Must still pass after the change:

**Type / build**

```bash
cd backend  && ./node_modules/.bin/tsc --noEmit     # TypeScript 5.9.3
cd frontend && ./node_modules/.bin/tsc --noEmit     # TypeScript 5.9.3
CI=true npm run build:frontend                      # from repo root
npm run build:backend                               # from repo root
```

**Test suites**

```bash
cd backend && npx jest -c jest.ci.config.ts --ci
cd frontend && CI=true npx react-scripts test --watchAll=false
node scripts/lint-route-auth.js
node scripts/secret-scan.js
```

**Existing suites most likely to break, and why**

| Suite | Risk |
|---|---|
| `frontend/src/components/publicV2/__tests__/linkIntegrity.test.tsx` | **Will fail** if `/stories/:slug` is not added to `V2_ROUTES` (`:38-51`) before Stories links to it |
| `frontend/src/components/publicV2/__tests__/consentAndSeo.test.tsx` | **Will fail** if `/stories/:slug` is not added to `DECLARED_ROUTES` (`:29-49`) |
| `frontend/src/pages/publicV2/__tests__/ProofV2.test.tsx` | Derived counts (`:72-107`) shift when `surface.proof.room` flips `capability` or `casestudy.fabricated` retires. The test asserts counts **track the registry**, so it should still pass — confirm rather than assume |
| `frontend/src/config/__tests__/claimsRegistry.test.ts` | Any registry edit touches it |
| `backend/src/services/__tests__/projectRepoResolver.test.ts` | Must stay green — proof that repo resolution was not disturbed |
| `backend/src/services/sbp/__tests__/repoConnectService.test.ts` | Must stay green — proof the workspace repo invariant was not weakened |
| `backend/src/db/__tests__/ensureSbpSchema.test.ts` | Must stay green — proof the schema convention was followed, not bent |
| `frontend/src/__tests__/adminNavRbac.test.ts` | Run **manually**; there is no frontend CI job |

**Manual/browser regression** (spec §43): `/`, `/services`, `/platform`, `/proof`, `/lab`,
`/pricing`, `/contact`, `/try`, the `/case-studies` redirect, public portfolio sharing, the student
Project workflow, one-workspace-repo-per-project, GitHub connection/sync, artifact repo sync,
EvidenceRecord progression, admin routing/auth, visitor tracking.

---

## 8. Mandatory per-feature coverage

Root `CLAUDE.md` requires four things of every shipped feature. Mapped here:

| Requirement | Where satisfied |
|---|---|
| **Happy path** | §3 unit tests, §4 scenarios 1–2, §6.1–6.4 |
| **Failure path** | §4 scenarios 8–9 (upstream 404 / 429), §3.1 #9–#11 (gate rejections), §5 #9 (consent absent) |
| **Boundary cases** | 20-repo cap; empty collection; empty repo (`repoHasCommits` 409); truncated tree; 30-char `event_type` ceiling; zero published records (the truthful empty state, spec §45) |
| **Idempotency validation** | §4 scenarios 3–4; repeated publish; repeated unpublish; re-running `ensureCaseStudySchema()` |

---

## 9. What this plan deliberately does not do

| Not doing | Why |
|---|---|
| Add a suite to `jest.ci.config.ts`'s ignore list | `:42-43` — *"adding a suite here must come with a reason."* Every test above runs without a database. |
| Introduce `@playwright/test` or a `playwright.config.ts` | A new dependency and a new test framework in one build is a governance escalation. The raw-`node` pattern works and is what the repo runs. |
| Run tests against production | `tests/CLAUDE.md` hard rule. The admin flow uses dev/test/staging fixtures only. |
| Turn on `DB_BOOT_SYNC` to make schema tests easier | `server.ts:2719-2725`. An ungated `sync({alter:true})` has previously OOM'd production Postgres. |
| Rely on `scripts/lint-route-auth.js` to prove auth | `:19`, `:29-39` — a substring check over one directory. It cannot see `mgmtSectionGate` at all. §6.4 step 11 is the real check. |
| Treat a 401 as proof a route is mounted | `organizationRoutes.paths.test.ts:20-32`. Read `router.stack` instead. |
| Fix `push()` in `frontend/src/utils/tracker.ts` | Defect D-2. It would repair ~20 existing call sites but changes behaviour on the highest-traffic shared path — a governance escalation candidate, logged separately. |

---

## 10. Definition of Done — the test half

A Case Study OS change is not done until all of these have been **run** and their results recorded
in `PROGRESS.md` with concrete evidence (no `[x]` without an artifact):

```bash
cd backend  && ./node_modules/.bin/tsc --noEmit          # exit 0
cd frontend && ./node_modules/.bin/tsc --noEmit          # exit 0
cd backend  && npx jest -c jest.ci.config.ts --ci        # exit 0, no new failures vs baseline
cd frontend && CI=true npx react-scripts test --watchAll=false
CI=true npm run build:frontend                           # from repo root
npm run build:backend                                    # from repo root
node scripts/lint-route-auth.js
node scripts/secret-scan.js
BASE_URL=... node tests/systemV2/caseStudyPublicIndex.e2e.js
BASE_URL=... node tests/systemV2/caseStudyPublicDetail.e2e.js
BASE_URL=... node tests/systemV2/caseStudyMobile.e2e.js
BASE_URL=... ADMIN_JWT_SECRET=... node tests/systemV2/caseStudyAdminFlow.e2e.js
```

Compare every result against `BASELINE_TEST_RESULTS.md`. **The baseline is fully clean — zero
TypeScript errors on both sides — so any error that appears is introduced by this build and cannot
be dismissed as pre-existing.**
