# Case Study OS — Dependency Map

**Gate 0 deliverable.** Every existing module the Case Study OS will touch, depend on, or
deliberately avoid. Observed against `origin/main` = `cfd016d9` in the worktree
`C:/Users/ali_m/casestudy-os-wt` on 2026-08-22.

## How to read the Disposition column

| Value | Meaning |
|---|---|
| **REUSE** | Call it as-is. Do not fork, wrap, or reimplement its logic. |
| **EXTEND** | Add to it in place (one array entry, one map key, one route line). Additive only. |
| **READ-ONLY** | Query it. Never write to it from Case Study code. |
| **COPY-PATTERN** | Do not import it; copy its *shape* into a new Case Study module. |
| **MUST NOT TOUCH** | Changing it is out of scope or a governance escalation. |
| **DO NOT COPY** | It exists, it works, and it is the wrong example. Named here so nobody finds it by accident and follows it. |

---

## 1. Domain models and schema

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `Project` | `backend/src/models/Project.ts:93-97` (UUID PK), `:241-250` (options) | The authoritative project record: `name`, `organization_name`, `industry`, `primary_business_problem`, `selected_use_case`, `system_model`, `executive_summary`, `project_stage`, `enrollment_id` | **READ-ONLY.** `case_studies.project_id` is a nullable FK to it. Never add a column to `projects`. |
| `Project.github_repo_url` | `backend/src/models/Project.ts:148` | Legacy repo pointer column | **DO NOT COPY / do not read directly.** Measured zero-populated in production (`projectRepoResolver.ts:12-18`). Go through `resolveProjectRepo()`. |
| `Project.project_stage` | `backend/src/models/Project.ts:138` | Postgres **ENUM** `discovery\|architecture\|implementation\|portfolio\|complete` | **READ-ONLY.** Adding a value is an `ALTER TYPE`, not a TS edit. |
| `GitHubConnection` | `backend/src/models/GitHubConnection.ts:161` (table), `:73-77` (PK) | The workspace repo binding: `repo_owner`, `repo_name`, `repo_url`, `file_tree_json`, `commit_summary_json`, `repo_language`, `webhook_secret` | **READ-ONLY.** `case_study_repositories.github_connection_id` is a nullable pointer to it. |
| `GitHubConnection.access_token_encrypted` | `backend/src/models/GitHubConnection.ts:103` | Per-connection OAuth token, stored as plain `TEXT` despite the name | **MUST NOT TOUCH / never read.** Use the platform `process.env.GITHUB_TOKEN` via `githubRepoClient.requireToken()` (`githubRepoClient.ts:46`). |
| `EvidenceRecord` | `backend/src/models/EvidenceRecord.ts:43-54` | Progression evidence ledger; `source_type` union at `:12-14`; UNIQUE `idempotency_key` | **READ-ONLY.** `case_study_evidence.evidence_record_id` points at it. Never write an `evidence_records` row from Case Study code — `evidenceEngine.recordEvidence()` is the only sanctioned writer. |
| `PortfolioArtifact` | `backend/src/models/PortfolioArtifact.ts:19-28`; table `runtime_portfolio_artifacts` | Student deliverable bodies (`content` JSONB), keyed by `kind` `VARCHAR(40)` | **READ-ONLY.** A source for `case_study_artifacts` rows. Note it is **not exported from `models/index.ts`** — import the default directly, dynamically inside the function (pattern: `artifactRepoSync.ts:185`). |
| `PortfolioArtifact.kind` default `'case_study'` | `backend/src/models/PortfolioArtifact.ts:23`; DDL `backend/src/server.ts:1910` | A *learner deliverable* kind that happens to share our domain word | **MUST NOT TOUCH.** No table collision, but record the distinction: a PortfolioArtifact may become a `case_study_artifacts` row; it is never itself a CaseStudy. |
| `student_tasks.verified_*` | `backend/src/db/ensureSbpSchema.ts:62-95` | The real verification latch: `verified_at`, `verified_by`, `verified_ref`, `verification_json` | **READ-ONLY.** The doctrine to inherit is at `verificationLatch.ts:6-11`. |
| `Tenant` / `Brand` | `backend/src/models/Tenant.ts`, `Brand.ts`, `BrandDomain.ts` | Existing tenancy graph | **READ-ONLY.** `case_study_publications` carries nullable `tenant_id`/`brand_id` alongside `surface_key`. Do not invent a second tenancy model. |
| `models/index.ts` | `backend/src/models/index.ts` — imports `:50`/`:168`, associations `:647`/`:897`, barrel `:1173` | Model registry and association wiring | **EXTEND.** Three edits per new model: import, both-direction associations with named `as`, barrel export. A model absent here is absent from `sequelize.models`, which the parity test depends on. |

---

## 2. Schema creation

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `ensureEvidenceSchema` | `backend/src/db/ensureEvidenceSchema.ts` (67 lines) | **The canonical shape to copy**: one exported async fn, a `const statements: string[]`, every statement `IF NOT EXISTS`, each in its own warn-and-continue try/catch, additive only | **COPY-PATTERN** for `backend/src/db/ensureCaseStudySchema.ts`. |
| `ensureSbpSchema` | `backend/src/db/ensureSbpSchema.ts:173-193` (`REQUIRED_TABLES`/`REQUIRED_COLUMNS`/`REQUIRED_INDEXES`), `:204` (`assertSbpSchema`) | The post-condition assertion with teeth — queries `information_schema` and `pg_indexes`, emits `error_class: 'SchemaInvariantViolation'` | **COPY-PATTERN.** Mandatory, not optional: because every statement is swallowed into a `console.warn`, *"it didn't throw" is not evidence the schema landed*. |
| `ensureSbpSchema` `build_plans` DDL | `backend/src/db/ensureSbpSchema.ts:102-122` | The immutable-version + content-hash table shape (`version`, `status`, `*_json`, `*_sha256`, `published_at`, `UNIQUE (project_id, version)`) | **COPY-PATTERN** for `case_study_snapshots`. |
| `ensureWorkspaceRepoSchema` | `backend/src/db/ensureWorkspaceRepoSchema.ts:42-43` (partial unique index), `:69` (assertion), `:32-34` (drop-constraint-before-drop-index) | The one-repo-per-project invariant | **MUST NOT TOUCH / must not weaken.** See `GITHUB_INTEGRATION_MAP.md` §4. |
| `server.ts` boot sequence | `backend/src/server.ts:42-81` (imports), `:2322` (`start()`), `:2346-2549` (awaited ensures) | Ordered schema application at boot | **EXTEND.** One import + one `await ensureCaseStudySchema()` placed after any table it FKs into. Carry an ordering comment (precedent `server.ts:2502`). |
| `ensureMultiTenantSchema.modelParity.test.ts` | `backend/src/db/__tests__/ensureMultiTenantSchema.modelParity.test.ts:31-49` | Regex-parses the exported statement array and asserts every added column is a declared model attribute. **Needs no database.** | **COPY-PATTERN.** Requires the new schema module to export its statement array as a named `const`. This is the guard against the `feeae19a` inert-runtime failure mode. |
| `sequelize.sync()` | `backend/src/server.ts:2726-2728` (gated on `DB_BOOT_SYNC`) | Sequelize auto-migration | **MUST NOT TOUCH.** Leave it off. `:2719-2725` explains why; an ungated `sync(alter)` has previously OOM'd production Postgres. |

---

## 3. GitHub layer

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `parseRepoReference()` | `backend/src/services/sbp/repoConnect/repoReference.ts:54` | **The** repo-URL parser. Pure, no I/O, 5 input shapes, canonicalises to `https://github.com/{owner}/{repo}`, throws `RepoConnectError('InvalidRepoReference')` with an actionable message | **REUSE. Never reimplement.** |
| `isRepoReference()` / `sameRepo()` | `repoReference.ts:122` / `:135` | Boolean wrapper; case-insensitive owner/repo comparison | **REUSE.** `sameRepo()` is the dedupe primitive for `case_study_repositories`. |
| `parseOwnerName()` | `backend/src/services/projectRepoResolver.ts:57` | Legacy regex `/github\.com[/:]([^/]+)\/([^/.]+)/` | **DO NOT COPY.** Truncates repo names containing a dot (`my.project` → `my`), accepts non-GitHub junk, returns `null` silently. Exists only to salvage legacy rows. |
| inline regex in `connectRepo()` | `backend/src/services/githubService.ts:10` | The same weak regex, inlined | **DO NOT COPY.** Same defects. |
| `decideRepoPointer()` | `backend/src/services/projectRepoResolver.ts:72` | **PURE** precedence: connection-with-repo_url → `projects.github_repo_url` → none | **REUSE.** Fully unit-tested with zero mocks (`backend/src/services/__tests__/projectRepoResolver.test.ts`). |
| `resolveProjectRepo()` / `resolveProjectRepos()` | `projectRepoResolver.ts:102` / `:116` | Async single and **batch (N+1-avoiding)** repo resolution | **REUSE.** Use the batch form for the admin candidate-discovery report (spec §36). |
| `githubRepoClient` | `backend/src/services/sbp/repoConnect/githubRepoClient.ts` — `fetchRepoFacts` `:216`, `fetchRepoFile` `:253`, `repoHasCommits` `:286`, `githubApiRequest` `:163` | The **only** hardened GitHub read path: 15 s `AbortController` timeout (`:19`, `:108-109`), 3 capped retries on 429/5xx (`:20`, `:132-134`), rate-limit disambiguation (`:73`), `retry-after` honoured (`:177`), classified errors, and a fixed-field `log()` (`:57-60`) | **REUSE / build on.** All analyzer reads go through this. |
| `GitHubReadOptions.fetchImpl` | `githubRepoClient.ts:36-38`, threaded at `:103` | The injection seam for tests | **REUSE.** Do not mock `global.fetch`. |
| `githubIntegrationService` | `backend/src/services/githubIntegrationService.ts` | OAuth, webhook registration, `syncStudentActivity` (`:138`), `validateWebhookSignature` (`:212`), `findEnrollmentByRepo` (`:223`) | **READ-ONLY / DO NOT COPY its HTTP shape.** No timeout on OAuth exchange (`:30`) or webhook registration (`:110`), no retries, no error classes. |
| `githubService` | `backend/src/services/githubService.ts` — `syncFileTree` `:107`, `syncCommitHistory` `:205` | Legacy enrollment-keyed sync; sole writer of `file_tree_json` (`:157`) | **READ-ONLY (consume its output).** **DO NOT COPY:** zero timeouts on any call, zero retries, enrollment-keyed arbitrary-row selection (`:46`). |
| `agentGitHubService` | `backend/src/services/agentGitHubService.ts` | A fourth raw-fetch path | **DO NOT COPY.** Its header comment claiming Octokit (`:3`) is stale — there is no Octokit in this repo. |
| `repoWriter` | `backend/src/services/sbp/repoWriter.ts` | The **only** sanctioned repo-content writer | **MUST NOT TOUCH.** The Case Study OS is read-only against GitHub. `githubRepoClient.ts:97-98` states the boundary. |
| `artifactRepoSync` | `backend/src/services/artifacts/artifactRepoSync.ts` — outcome union `:51`, orchestrator `:158`, failure classification `:238-288` | The never-throws, classified-outcome orchestrator shape | **COPY-PATTERN** for `caseStudySyncService`. Its `ArtifactSyncOutcome` union is the model for the spec §29 failure taxonomy. |
| `writeFailureDiagnosis` | `backend/src/services/artifacts/writeFailureDiagnosis.ts:33-35` | **PURE** rule separating `no_push_access` from `repo_missing` from `transient` | **REUSE** if the analyzer needs to distinguish "gone" from "may not read". |
| `webhookRoutes` GitHub receiver | `backend/src/routes/webhookRoutes.ts:62-164` | The single inbound GitHub hook | **MUST NOT TOUCH in Phase 1.** Spec §29 prefers triggering a Case Study refresh from an existing event over registering a second webhook. Note pre-existing defect D-9 (calls 1–4 run outside the dedup claim). |
| `github_webhook_deliveries` ledger | `backend/src/db/ensureSbpSchema.ts:135-142`; claim at `githubPushVerification.ts:118-144` | `INSERT ... ON CONFLICT DO NOTHING RETURNING` delivery dedup | **COPY-PATTERN** if Case Study sync ever needs an at-most-once claim. |

---

## 4. Evidence, artifacts, snapshotting

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `evidenceEngine.recordEvidence()` | `backend/src/services/progression/evidenceEngine.ts:53-88`, key composed `:54` | The sole `evidence_records` writer; `findOrCreate` on `idempotency_key` | **MUST NOT TOUCH.** Case Study code reads evidence, never awards it. |
| `verifiedStoryXp()` | `backend/src/services/projects/projectReadService.ts:79-130` | Reads awarded XP by `source_type: 'github_commit'` + `` `${storyId}@${sha}` ``; **fails soft** | **REUSE / COPY-PATTERN.** The `@` delimiter rationale is at `:96-97`. |
| `verificationLatch` | `backend/src/services/sbp/verification/verificationLatch.ts:6-11`, states `:45` | The mutable-view vs immutable-latch discipline | **COPY-PATTERN.** `case_study_snapshots.status` is the same idea: a draft snapshot is a view, an approved snapshot is a latch. |
| `planHash` | `backend/src/services/sbp/planHash.ts` — `canonicalize()`, `canonicalPlanJson()`, `hashPlan()` | **PURE** key-order-independent sha256 | **REUSE.** `case_study_snapshots.content_hash` must use this, not a bare `JSON.stringify` — otherwise structurally identical snapshots hash differently and sync never reports `unchanged`. |
| `buildProgressSnapshot` | `backend/src/services/sbp/buildProgressSnapshot.ts:1-25` | The clock-free-snapshot doctrine ("nothing volatile may leave this module") and the dynamic-model-import rule | **COPY-PATTERN.** Directly determines whether spec §30 idempotency is achievable. |
| `artifactRepoFiles` | `backend/src/services/artifacts/artifactRepoFiles.ts:1-27` | A pure, clock-free, byte-identical renderer; `mergeArtifactHashesIntoManifest` `:249` | **COPY-PATTERN** for the snapshot builder. |
| `artifactVersionService` | `backend/src/services/artifactVersionService.ts:9-58` | Linked-list versioning: `version_number`, `parent_version_id`, `is_latest`, `diff_json` | **Reference only.** `build_plans`-style `(parent_id, version)` uniqueness is the better fit for snapshots. |
| `portfolioGenerationService` | `backend/src/services/portfolioGenerationService.ts:196-341` | The generated student portfolio | **READ-ONLY, and note the disconnect:** it **never reads `runtime_portfolio_artifacts`** (`:229-252` reads `Artifact`, `ProjectArtifact`, `ArtifactDefinition`, `AssignmentSubmission`, `ArchitectEvaluation`). The public portfolio and `PortfolioArtifact` are two disconnected systems today. |
| `portfolioShareService` | `backend/src/services/portfolioShareService.ts:32-45` (idempotent mint), `:47-51` (token read) | Opaque-token public gating; `share_enabled: true` folded into the WHERE | **COPY-PATTERN** for any Case Study preview-link feature. The idempotence rationale is at `:29-31`: *"a link already handed to an employer keeps working."* |
| `WorkLedgerEvent` / `emitEvent()` | `backend/src/services/workLedger/workLedgerService.ts:53-59`, `:61-123`; schema `backend/src/schemas/workLedgerEventSchema.ts` | The richest domain-event ledger: required `traceId` + `idempotencyKey`, three-layer idempotency, shadow-mode contract (`:5-11`) | **REUSE** for spec §38 events, wrapped via `emitLedgerEventSafe.ts`. **Caveat:** heavily ticket-oriented; `ticketId` is optional but the health panel is ticket-scoped. |
| `EventLedger` | `backend/src/models/EventLedger.ts` | The cheap generic ledger | **Reference only.** One writer in the entire backend (`autonomousIngestController.ts:83`), no Zod, no idempotency key. Least governed option. |
| `AuditLog` + `auditMiddleware` | `backend/src/models/AuditLog.ts`; `backend/src/middlewares/auditMiddleware.ts` | Admin CRUD trail, already applied to every admin request via `adminRoutes.ts:97` | **REUSE (automatic).** Admin Case Study mutations get audited for free. |

---

## 5. Public API surface

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `publicPortfolioRoutes` | `backend/src/routes/publicPortfolioRoutes.ts` (27 lines) | The uniform-404 enumeration defence (`:8-10`), `error_class`→status mapping, dynamic service import, prefix-less absolute path | **COPY-PATTERN — the good half only.** |
| ...the same file's response | `publicPortfolioRoutes.ts` `res.json(portfolio)` | Unsanitized pass-through of `PortfolioResult` including raw `project_variables` JSONB | **DO NOT COPY.** There is no `toPublic()`/DTO/allow-list anywhere in `backend/src/routes/`. The Case Study public projection must be **written**, not reused. |
| `explorerSignalRoutes` | `backend/src/routes/explorerSignalRoutes.ts:34` (limiter), `:44-46` (path-scoped guard), `:49-66` (inline Zod) | The strongest composite template for a new public/semi-public endpoint | **COPY-PATTERN.** Its 400 shape `{ error, issues }` is the better one. |
| `express-rate-limit` usage | `backend/src/routes/trackingRoutes.ts:13-41`, `leadRoutes.ts:17` | Rate limiting that degrades to 204 rather than 429 | **REUSE.** Already a dependency; no new package. |
| `server.ts:138-150` mount block | `backend/src/server.ts:138-145` (comment), `:150` (`app.use(adminRoutes)`) | The ordering constraint that makes public routes reachable | **MUST NOT TOUCH the ordering. EXTEND above line 150 only.** See `ROUTE_IMPACT.md` §3. |
| Zod v4 | `backend/package.json` (`zod ^4.3.6`) | Runtime validation | **REUSE.** `parsed.error.issues` (**not** `.errors`); `z.record(keyType, valueType)` takes two args. There is **no validation middleware** — inline `safeParse` at every call site. |
| `workLedgerService` service-boundary validation | `backend/src/services/workLedger/workLedgerService.ts:53-59`, error class `:28-37` | Validation *inside* the service so non-HTTP callers are covered too | **COPY-PATTERN** for the Case Study domain writer. |

---

## 6. Admin surface

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `requireAdmin` | `backend/src/middlewares/authMiddleware.ts:58` | `role ∈ {admin, super_admin}` | **REUSE.** Per-route, never `router.use()` unscoped. |
| `requireSection(section)` | `backend/src/middlewares/authMiddleware.ts:90` | Section-scoped guard for mgmt roles | **REUSE** if a scoped mgmt role must reach `/admin/case-studies`. |
| `mgmtSectionGate` + `PATH_SECTION` | `backend/src/middlewares/mgmtSectionGate.ts:21-41` (table), `:58-92` (gate) | The **global** deny-by-default section gate applied at `adminRoutes.ts:100` | **EXTEND — mandatory.** One row `['/api/admin/case-studies', '<section>']`. Without it, every scoped mgmt role 403s. Invisible to `scripts/lint-route-auth.js`. |
| `mgmtRoles` | `backend/src/services/access/mgmtRoles.ts:15-21` (`SECTION_KEYS`), `:38-58` (`MGMT_ROLE_DEFS`) | The authoritative section vocabulary | **READ-ONLY unless a new section is genuinely needed.** Header `:1-10`: *"the server is the authority."* Prefer reusing `program`. |
| `adminRoutes.ts` | `backend/src/routes/adminRoutes.ts:96-101` and the 92 `router.use()` lines | Admin router aggregation | **EXTEND.** One import + one `router.use(caseStudyAdminRoutes)`. |
| `organizationRoutes` | `backend/src/routes/admin/organizationRoutes.ts:39-46` | The canonical minimal admin route file: full `/api/admin/...` paths, per-route guard, `/stats` declared **before** `/:id` | **COPY-PATTERN.** |
| `organizationRoutes.paths.test.ts` | `backend/src/routes/admin/__tests__/organizationRoutes.paths.test.ts:36-70` | Reads `router.stack` to prove declared paths, defeating the 401-masks-a-404 trap | **COPY-PATTERN — verbatim.** Cheapest catch for the highest-frequency admin-route defect in this repo. |
| `adminOrgController` | `backend/src/controllers/adminOrgController.ts:27` (`actingAdmin`), `:32-42` (`routeParam`), `:44-52` (`handleZod`) | Thin-controller idioms; **Zod v4 `err.issues`** at `:24` | **COPY-PATTERN.** |
| `frontend/src/routes/adminRoutes.tsx` | `:11-12` (lazy imports), `:88-89` (routes), `:85-87` (ordering comment) | Admin route tree | **EXTEND.** Three edits; list route **before** detail route. |
| `adminNav.ts` | `frontend/src/components/Layout/adminNav.ts:38-92` (`NAV_GROUPS`), `:117-126` (`sectionForPath`) | Sidebar IA **and** the frontend RBAC resolver | **EXTEND — mandatory.** No entry ⇒ invisible for everyone and unreachable for a `sales` login. Icons are RemixIcon names **without** the `ri-` prefix (`:4-5`). |
| `ProtectedRoute` | `frontend/src/components/ProtectedRoute.tsx:28-55` | The frontend section bounce | **MUST NOT TOUCH.** `:18-19`: *"This is a UX boundary, not a security one."* |
| admin shell primitives | `frontend/src/components/admin/shell/index.ts` (`PageHeader`, `StatCard`, `StatusBadge`, `SectionCard`) | The admin page furniture | **REUSE.** |
| `describeApiError()` | `frontend/src/services/adminOrgApi.ts:210-217` | Turns an axios failure into an operator sentence; enables the three-state empty cell | **COPY-PATTERN.** The rule it enforces (`adminOrgApi.ts:12-13`): a "no records yet" message must never appear when the request simply failed. |
| `frontend/src/utils/api.ts` | `:3-8` (instance), `:18-24` (auth interceptor), `:27-50` (error interceptor) | The shared axios client | **REUSE** for both the admin client and the public Case Study client. Do **not** create a fresh `axios.create()`. |

---

## 7. Public V2 marketing surface

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `App.tsx` V2 route block | `frontend/src/App.tsx:68-111`; `stories` at `:110` | The V2 route table | **EXTEND.** Insert `stories/:slug` immediately after `:110`, relative path, no leading slash. Ordering vs the legacy block (`:112-114`) is load-bearing (`:55-67`). |
| `publicRoutes.tsx` redirects | `frontend/src/routes/publicRoutes.tsx:43-48` | `/case-studies` (`:44`) and `/demo-day` (`:45`) → `/stories` | **MUST NOT TOUCH.** Both must keep redirecting; see `ROUTE_IMPACT.md` §2. |
| `publicRoutes.tsx:8` | `frontend/src/routes/publicRoutes.tsx:8` | Unused import of `CaseStudiesPage` | **EXTEND (delete).** Prescribed by `claimsRegistry.ts:610`. |
| `CaseStudiesPage.tsx` | `frontend/src/pages/CaseStudiesPage.tsx` (35 KB) | Fabricated Priya Nair / Marcus Bell studies, unrouted | **EXTEND (delete).** See `PROOF_INTEGRATION.md` §6. |
| `StoriesV2.tsx` | `frontend/src/pages/publicV2/StoriesV2.tsx` (102 lines); hardcoded badge at `:52` | The current `/stories` page | **EXTEND / rewrite in place**, but keep it thin. Spec §32: *"Do not put the whole implementation in `StoriesV2.tsx`."* The literal `<EvidenceBadge evidence="illustrative" />` at `:52` must become data-driven. |
| `v2Stories.ts` | `frontend/src/config/v2Stories.ts:25-38` (interface), `:40` (data), `:102-105` (`STORIES_NOTICE`) | The three hardcoded illustrative stories | **EXTEND (demote to a dev/test fixture).** Spec §26: remove from the production data path; never seed as verified content. |
| `ServicesV2.tsx` | `frontend/src/pages/publicV2/ServicesV2.tsx:26` (list), `:115` (detail) | The list+detail-in-one-file slug precedent | **COPY-PATTERN.** |
| `PublicLayoutV2` | `frontend/src/components/publicV2/PublicLayoutV2.tsx:51-65` | The page contract: return a bare fragment of `<section>`s, no `<main>`/header/footer | **REUSE. MUST NOT TOUCH.** |
| `SeoV2` | `frontend/src/components/publicV2/SeoV2.tsx:33-38`, `:56-62` (canonical), `:64` (robots) | Title, description, OG, canonical, robots | **REUSE; EXTEND only if OG image / JSON-LD is required.** Note the `route` prop is accepted and ignored, and no `og:image`/`og:type`/JSON-LD is emitted today. |
| `PublicHeaderV2.V2_NAV` | `frontend/src/components/publicV2/PublicHeaderV2.tsx:38-44` | Primary nav array | **EXTEND (decision required).** `/stories` is not currently in the primary nav. `isCurrent()` (`:74-78`) already highlights on `/stories/:slug`. |
| `PublicFooterV2.GROUPS` | `frontend/src/components/publicV2/PublicFooterV2.tsx:39-73`; `/stories` at `:63` | Footer IA + `FOOTER_LINKS` export for the link test | **EXTEND (optional).** |
| design tokens | `frontend/src/colaberry/tokens/*.css` via `frontend/src/colaberry/styles.css`, loaded `frontend/src/index.tsx:23` | Semantic token layer | **REUSE.** Semantic names only (`colors.css:93`). |
| `frontend/src/styles/tokens.css` | — | The **second, older** token system (`--color-primary`, `--space-md`, `--cherry`) | **DO NOT COPY.** `publicV2.css:5-6` bars it from V2 stylesheets. |
| shared `cbv2-` primitives | `publicV2.css`, `cinematicV2.css`, and — importantly — `homeV2.css` / `servicesV2.css` | `.cbv2-card`, `.cbv2-lede`, `.cbv2-grid`, `.cbv2-section`, `.cbv2-eyebrow`, `.cbv2-note`, `.cbv2-grid--2` live in **page** stylesheets | **REUSE, and do not lazy-load.** `proofV2.css:5-13` documents that this coupling is load-bearing: lazy-loading a new route silently breaks layout elsewhere. |

---

## 8. Proof / claims

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `EvidenceClass` | `frontend/src/components/publicV2/Claim.tsx:23` | `'verified' \| 'anonymized' \| 'illustrative' \| 'pending'` | **REUSE — this is the union Case Study OS adopts.** See `PROOF_INTEGRATION.md` §3. |
| `EvidenceBadge` / `Metric` / `SampleBadge` | `Claim.tsx:45` / `:139` / `:63` | The rendering primitives; `Metric.evidence` is required with no default (`:122-125`) | **REUSE.** Never render a Case Study figure outside `<Metric>`. |
| `Claim` / `canShow` / `CapabilityNotice` | `Claim.tsx:98` / `:111` / `:173` | Registry-gated copy; renders nothing when a claim may not ship (`:92-97`) | **REUSE** for any *marketing* sentence about the Case Study system itself. |
| `VerificationStatus` / `CapabilityStatus` | `frontend/src/config/claimsRegistry.ts:26-46` / `:48-56` | The governance taxonomy for hand-written marketing copy | **READ-ONLY.** Do **not** adopt this union for per-record Case Study data. |
| `surface.proof.room` claim | `frontend/src/config/claimsRegistry.ts:585` | `VERIFIED` / **`unbuilt`** — the claim this build unblocks | **EXTEND.** Flip `capability` to `live` and update `evidenceSource` once the store ships. Moves a derived count on `/proof`. |
| `casestudy.fabricated` claim | `frontend/src/config/claimsRegistry.ts:598`, note `:610` | `DO_NOT_PUBLISH` with a prescribed three-part cleanup | **EXTEND.** Execute the cleanup, then retire the claim; never rename a key (`claimsRegistry.ts:58-77`). |
| `v2Proof.ts` | `frontend/src/config/v2Proof.ts:29-34`, `:110`, `:133` | `EvidenceClassDoc` (a duplicate inline declaration of the four badge keys), `GATES`, `PLANNED_PROOF_ROOM` | **EXTEND.** `PLANNED_PROOF_ROOM` (`:133`) is future-tense roadmap copy rendered at `ProofV2.tsx:170`; it needs revisiting when the proof room becomes real. |
| `ProofV2.tsx` derived counts | `frontend/src/pages/publicV2/ProofV2.tsx:28-36` | Counts computed from `blockedClaims()` at render time, never typed in | **MUST NOT TOUCH the mechanism.** `ProofV2.test.tsx:72-107` asserts they track the registry. Retiring `casestudy.fabricated` will change these numbers, and that is correct. |
| `v2Proof.ts:18-24` withdrawn-claims rule | — | Withdrawn claims are described by category and reason, **never restated** | **MUST NOT VIOLATE.** `ProofV2.test.tsx:29-35` enforces it by asserting no `blockedClaims().publicWording` string appears in rendered text. |

---

## 9. Tracking

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `VALID_EVENT_TYPES` | `backend/src/controllers/trackingController.ts:36-64` | The ingest allowlist; `/api/t/event` 400s anything absent | **EXTEND — mandatory.** Append `case_study_*` types, each ≤ 30 chars. |
| `validateTrackEvent` | `backend/src/controllers/trackingController.ts:165-182` | Hand-rolled validation (no Zod, contrary to the Contract Enforcement rule) | **MUST NOT TOUCH** in this build; note the deviation. |
| `handleTrackBatch` | `backend/src/controllers/trackingController.ts:317-440` | Batch ingest that **never calls `validateTrackEvent`** | **DO NOT RELY ON.** Pre-existing defect D-3; it makes allowlist omissions fail nondeterministically. |
| `categorizePagePath()` | `backend/src/services/visitorTrackingService.ts:9-54`; map `:15-46`; prefix rules `:49-51`; `'/case-studies'` key at `:20` | Server-side `page_category` derivation | **EXTEND — mandatory, and this is defect D-1.** Add `'/stories': 'case_studies'` **and** a `cleaned.startsWith('/stories')` prefix rule. Six live consumers currently never fire. |
| `recordPageEvent()` | `backend/src/services/visitorTrackingService.ts:218-297` | The only `page_events` writer. **No event-level dedup.** | **MUST NOT TOUCH.** Bring a client-side fire-once guard instead. |
| `resolveIdentity()` | `backend/src/services/visitorTrackingService.ts:304-381` | Anonymous→Lead backfill, idempotent via `lead_id IS NULL` | **REUSE (automatic). MUST NOT TOUCH.** |
| `frontend/src/utils/tracker.ts` | `trackEvent` / `initTracker`; `push()` at `:76-84`; endpoint choice at `:124` | The real SPA tracker | **REUSE as-is.** Call `trackEvent('case_study_view', { event_data: {...} })` — the explicit wrapper is required because `push()` spreads props at the top level (defect D-2). |
| `frontend/public/v1/track.js` | `:2-14`, `:20`, `:29-42` | A standalone external-site snippet | **DO NOT USE.** Not loaded on V2, hardcodes the prod host, fatally no-ops without `data-site`. |
| `packages/tracking-sdk/track-v2.js` | `:110-115` | The only client that populates `event_data` correctly | **Reference only.** Not wired into this frontend. |
| `v2Consent.ts` / `ConsentBanner` | `frontend/src/config/v2Consent.ts:90-92`; `PublicLayoutV2.tsx:39-49` | Consent gating; default `'unset'` ⇒ nothing fires | **MUST NOT TOUCH.** Design every case-study metric to be consent-scoped. |
| `journeyTimelineService` | `backend/src/services/journeyTimelineService.ts:150-171` (titles), `:69-96` + `:177-181` (stage), `:144-148` (`limit: 200` ASC) | Journey projection | **EXTEND.** Add title entries and a stage-promotion rule. Watch the oldest-200 truncation. |
| `cohortRoutes` War Room feed | `backend/src/routes/admin/cohortRoutes.ts:111` | `WHERE pe.event_type IN (...)` | **EXTEND.** Omitting this silently drops case-study events from the War Room. |
| `explorerSignalDefinitions` / `explorerSignalReader` | `backend/src/services/explorerGrowth/explorerSignalDefinitions.ts:52-56`; `explorerSignalReader.ts:105-116` | Intent-signal mapping (`CASE ... ELSE NULL`) | **EXTEND (optional, Phase 1 stretch).** Requires both a definition row and a `CASE` branch. |
| `Activity.type` ENUM | `backend/src/models/Activity.ts:43-56` | A **real** Postgres enum | **MUST NOT TOUCH.** If activity rows are written, use `'system'` + `metadata.activity_subtype`. |
| `piiRedaction` | `backend/src/utils/piiRedaction.ts` | Log-only redaction | **REUSE for logs only.** Nothing sanitizes `event_data`; emit slugs, enums and numbers only. |

---

## 10. Test, CI, tooling

| Module | `path:line` | Provides | Disposition |
|---|---|---|---|
| `backend/jest.config.ts` | `:7-13` (`testMatch`), `:25-32` (`isolatedModules`) | Local jest; **a test file must live under `__tests__/`** | **REUSE.** |
| `backend/jest.ci.config.ts` | `:42-43` (maintenance rule), `:45-81` (ignore list) | The CI gate set | **MUST NOT extend the ignore list** without a stated reason. |
| `projectRepoResolver.test.ts` | `backend/src/services/__tests__/projectRepoResolver.test.ts:1-8` | The zero-mock pure-core test idiom | **COPY-PATTERN.** |
| `ensureSbpSchema.test.ts` | `backend/src/db/__tests__/ensureSbpSchema.test.ts:8-19`, `:50-60` | Mocked-`sequelize.query` contract test + a fixture-drift meta-test | **COPY-PATTERN.** |
| `explorerGrowthModels.test.ts` | `backend/src/models/__tests__/explorerGrowthModels.test.ts:1-21` | Anti-drift model tests that diff attributes against hand-written DDL | **COPY-PATTERN.** |
| `tests/systemV2/resolveWorkTabSmoke.e2e.js` | `:9-13` (why raw Playwright), `:26` (`BASE_URL`), `:43-58` (JWT injection) | The real E2E shape: plain `.js`, run with `node`, exit 0/1/2 | **COPY-PATTERN.** There is no `playwright.config.ts` and no `@playwright/test`. |
| `scripts/captureHelpers.js` | `:18` (`MAX_SAFE_WIDTH = 1800`), `:20-24` (`SAFE_VIEWPORT`), `:33-41` (token) | Safe-width screenshot capture | **REUSE** for the review doc. |
| `scripts/lint-route-auth.js` | `:18` (dir), `:19`, `:29-39` (substring check) | The CI route-auth guard | **Satisfy it, do not rely on it.** It only scans `backend/src/routes/admin/` and is a substring check. |
| `.github/workflows/ci.yml` | `:44-53` (why `frontend-build` exists) | Six jobs; no frontend unit-test job | **MUST NOT TOUCH.** Treat all six plus `secret-scan / pull-request` as the de-facto merge gate. |

---

## 11. Import-count sanity check

Root `CLAUDE.md` warns that a module importing from 15+ other internal modules is doing too
much. The Case Study OS is deliberately split (spec §11 / §33) so that no single module
approaches that: `caseStudyRepoAnalyzer` depends on `githubRepoClient` + `repoReference` only;
`caseStudySnapshotBuilder` depends on `planHash` + the pure fact types only;
`caseStudyPublicationService` depends on the models plus the publish-gate module. The wide
import surface belongs to the **route/controller** layer, where it is expected.

## 12. Modules deliberately NOT in scope

| Module | Why it is out |
|---|---|
| `backend/src/services/sbp/repoWriter.ts` | Case Study OS never writes to a repo. |
| `backend/src/routes/webhookRoutes.ts` | Phase 1 triggers refresh from existing events; registering a second webhook is a separate infrastructure workstream (spec §29). |
| `frontend/src/utils/tracker.ts` `push()` | Fixing the `event_data` nesting touches ~20 call sites on the highest-traffic path — a governance escalation candidate (defect D-2), not this build. |
| `backend/src/models/Activity.ts` ENUM | Requires `ALTER TYPE`. Use `'system'` + subtype. |
| `packages/tracking-sdk/track-v2.js` | Not wired into this frontend; wiring it is a separate decision. |
| `/system/*` state maps | Portal-owned, auto-generated. Root `CLAUDE.md`: do not manually edit. |
