# Case Study OS — GitHub Integration Map

**Gate 0 deliverable.** How GitHub is accessed in this repository today, and exactly how the Case
Study repository analyzer will use it. Observed against `origin/main` = `cfd016d9`, 2026-08-22.

Three rules govern everything below. If only these survive into implementation, the integration
will be correct:

1. **Reuse `parseRepoReference()` at `backend/src/services/sbp/repoConnect/repoReference.ts:54`.**
   Never the two weak legacy regexes.
2. **Build on `githubRepoClient.ts`.** It is the only GitHub path in this repo with a timeout, a
   retry cap, rate-limit awareness, classified errors, and a test seam.
3. **The one-repo-per-project invariant is a *partial* unique index plus application guards. A
   Case Study repo collection is a different concept and must not weaken it.**

---

## 1. How GitHub is accessed today

**Raw `fetch`. There is no Octokit in this repository** — `backend/package.json` contains no
`@octokit/*` dependency. The comment at `backend/src/services/agentGitHubService.ts:3` claiming
*"Uses Octokit REST API"* is stale; that file uses raw `fetch` via a local `githubApi()` helper at
`:20`.

**There is no shared HTTP client. There are four, and only one is hardened:**

| Implementation | File | Auth source | Timeout | Retry | Rate-limit aware | Error classes |
|---|---|---|---|---|---|---|
| **`githubRepoClient`** | `backend/src/services/sbp/repoConnect/githubRepoClient.ts` | `process.env.GITHUB_TOKEN`, read per call, never persisted (`:46`) | **15 s** via `AbortController` (`:19`, `:108-109`) | **3 attempts**, 429/5xx only, linear `300ms * attempt` (`:20`, `:132-134`, `:149`) | **Yes** — `isRateLimited()` (`:73`) disambiguates GitHub's overloaded 403 via `x-ratelimit-remaining` plus a body regex; honours `retry-after` (`:177`) | `RateLimited`, `Unauthorized`, `RepoNotFound`, `NoPushAccess`, `UpstreamError`, `UpstreamTimeout`, `ConfigError` |
| `githubIntegrationService` | `backend/src/services/githubIntegrationService.ts` | per-connection `access_token_encrypted` (`:142`) | `AbortSignal.timeout(15000)` on the three activity reads only (`:150`, `:174`, `:180`) — **none** on the OAuth exchange (`:30`) or webhook registration (`:110`) | none | no | none — raw `throw new Error(...)` |
| `githubService` | `backend/src/services/githubService.ts` | per-connection `access_token_encrypted` (`:117`, `:119`) | **none on any call** | none | no | none |
| `agentGitHubService` | `backend/src/services/agentGitHubService.ts` | `env.githubToken` / `process.env.GITHUB_TOKEN` + `GITHUB_REPO` (`:14-15`) | **none** | none | no | none |

**There is no circuit breaker on any GitHub path**, despite `openclawCircuitBreaker.ts` being
named as the canonical pattern in root `CLAUDE.md`. The `githubRepoClient` retry cap is the only
backstop. `githubService.ts` having zero timeouts on every call is a live violation of the root
`CLAUDE.md` rule that every outbound HTTP call carries an explicit timeout — recorded here as a
pre-existing defect, not fixed by this build.

### The token situation

`github_connections.access_token_encrypted` (`backend/src/models/GitHubConnection.ts:103`) is
plain `TEXT` and **the name is a lie**: nothing encrypts it. It is written verbatim from the OAuth
exchange (`githubIntegrationService.ts:51`, `:55`) and read verbatim into an
`Authorization: Bearer` header (`:142`, `githubService.ts:119`). No `crypto` encrypt/decrypt wraps
it anywhere.

The newer SBP path deliberately does **not** use that column.
`githubRepoClient.requireToken()` (`:46`) reads a single platform `process.env.GITHUB_TOKEN` at
call time and never persists it.

**The Case Study analyzer uses the platform token, not the per-connection column.** This is not a
preference; it is the only path that inherits the timeout, the retry cap, and the redaction
discipline.

### Existing sync mechanisms

| Mechanism | Entry point | What it writes |
|---|---|---|
| Webhook (the only inbound receiver) | `POST /api/webhook/github` — `backend/src/routes/webhookRoutes.ts:62`, mounted `backend/src/server.ts:100` | fires five downstream calls; ledgers into `github_webhook_deliveries` |
| `syncFileTree(enrollmentId)` | `backend/src/services/githubService.ts:107` | `file_tree_json`, `file_count`, `repo_language`, `last_sync_at`, `route_registry_json`, `route_component_bindings_json` |
| `syncCommitHistory(enrollmentId, count)` | `backend/src/services/githubService.ts:205` | `commit_summary_json` |
| `syncStudentActivity(enrollmentId)` | `backend/src/services/githubIntegrationService.ts:138` | `StudentGithubActivity` (commits, PRs, stars, a 7-day contribution graph) |
| `verifyBuildFromRepo(projectId)` | `backend/src/services/sbp/verification/buildVerificationService.ts:205` | story verification — **re-reads the repo, never trusts the payload** |

Note the webhook handler's ordering property: `express.json({ limit: '5mb' })` is mounted at
`server.ts:111`, i.e. **after** the webhook router at `:100`, deliberately, so the raw body
survives for HMAC verification.

---

## 2. The repo reference parser — REUSE, do not reimplement

### 2.1 The canonical parser

**`backend/src/services/sbp/repoConnect/repoReference.ts:54`**

```ts
export interface RepoReference {
  owner: string;
  repo: string;
  /** Canonical https URL — what we persist and show. */
  url: string;
}

export function parseRepoReference(input: unknown): RepoReference   // :54
export function isRepoReference(input: unknown): boolean            // :122
export function sameRepo(
  a: { owner?: string | null; repo?: string | null },
  b: { owner?: string | null; repo?: string | null },
): boolean                                                          // :135
```

**Accepted input shapes** (`repoReference.ts:8-12`, `docs/REPO_CONNECT_CONTRACT.md:64-77`):

| Shape | Example |
|---|---|
| Browser URL | `https://github.com/you/your-project` |
| Browser URL on a branch/file | `https://github.com/you/your-project/tree/main` |
| Clone URL | `https://github.com/you/your-project.git` |
| SSH remote (scp-style) | `git@github.com:you/your-project.git` |
| SSH URL | `ssh://git@github.com/you/your-project` |
| Scheme-less | `github.com/you/your-project` |
| Short form | `you/your-project` |

**Properties that matter to the analyzer:**

- **Pure.** No I/O, no network. Safe in a validator, a test, or a hot loop.
- **Normalising.** Always returns `` url: `https://github.com/${owner}/${repo}` `` (`:118`) —
  `.git` stripped (`:109`), trailing browser segments dropped.
- **Throws, does not return null.** `RepoConnectError('InvalidRepoReference')` from
  `backend/src/services/sbp/repoConnect/connectErrors.ts`, with a message naming what was wrong.
  `isRepoReference()` is the boolean wrapper and deliberately re-throws anything that is *not* a
  `RepoConnectError` (`:129-130`).
- **Rejects deliberately**, each with a specific message: bare repo name with no owner (`:95-97`),
  non-GitHub host (`:71`, `:87`), unsupported scheme (`:83-85`), an unrecognised third path
  segment (`:105-107`), owner failing `OWNER_RE` (`:29`, `:111`), repo failing `REPO_RE` (`:31`,
  `:114`), and the reserved `.` / `..`.
- Hosts accepted: `github.com`, `www.github.com` only (`:33`).
- Tolerated trailing segments (`:36-39`): `tree, blob, commits, commit, pull, pulls, issues,
  settings, actions, releases, branches, wiki, compare, tags, archive`.
- **`sameRepo()` is case-insensitive**, which is the dedupe primitive for
  `case_study_repositories` (spec §7.3: *"Dedupe owner/repo case-insensitively inside a
  collection."*). GitHub is case-insensitive; the dedupe must be too.

### 2.2 The two weak legacy parsers — DO NOT COPY

Both are the same one-line regex:

```ts
/github\.com[/:]([^/]+)\/([^/.]+)/
```

- `backend/src/services/projectRepoResolver.ts:57` — `parseOwnerName(url)`, module-private, not
  exported
- `backend/src/services/githubService.ts:10` — inlined inside `connectRepo()`

**Why they are wrong:**

| Defect | Consequence |
|---|---|
| `[^/.]+` for the repo name stops at the first dot | **`my.project` parses as `my`.** The Case Study analyzer would silently read the wrong repository, or none. |
| Silently returns `null` / `''` on non-matches | A malformed input produces an empty owner and a request to `/repos//` |
| Accepts non-GitHub-shaped junk | Any string containing `github.com/a/b` anywhere matches |
| No canonicalisation | `.git` suffixes and `/tree/main` tails survive into stored values, defeating dedupe |

They exist **only** to salvage legacy rows that stored a URL and nothing else. Do not extend them,
do not copy them, and do not call them from Case Study code.

A repo-wide search for `parseRepoUrl|parseGitHubUrl|normalizeRepoUrl|extractRepo|parseUrl` across
`backend/src` returns **zero** matches — all URL handling is confined to `parseRepoReference`
(`repoReference.ts`), `derivePagesUrl` (`pagesUrlService.ts`) and `decideRepoPointer`
(`projectRepoResolver.ts`). There is no third parser hiding somewhere.

**Cheap in-convention win:** there is currently **no direct unit test on `parseRepoReference`
itself** in `backend/src/services/sbp/repoConnect/__tests__/` — it is exercised only indirectly
through `repoConnectService.test.ts`. Adding one (including the dotted-repo-name case that breaks
the legacy regexes) belongs in this build's test plan.

### 2.3 The "which repo?" oracle

`backend/src/services/projectRepoResolver.ts` (143 lines):

```ts
export type RepoPointerSource = 'connection' | 'project_column' | 'none';                    // :38
export function decideRepoPointer(connection, legacyProjectUrl?): RepoPointer;                // :72   PURE
export async function resolveProjectRepo(projectId, legacyProjectUrl?): Promise<RepoPointer>; // :102
export async function resolveProjectRepos(projects): Promise<Map<string, RepoPointer>>;       // :116  batch, avoids N+1
export async function resolveProjectRepoUrl(projectId, legacyProjectUrl?): Promise<string|null>; // :138
```

Precedence (`:76-95`): a connection row carrying a non-blank `repo_url` wins → else
`projects.github_repo_url` → else `none`. A connection that exists with a blank `repo_url` is
deliberately **not** an answer (`:68-70`) — that is a student who authorised GitHub but never
picked a repo.

**Any Case Study feature that needs "this Project's repo" calls
`resolveProjectRepo(projectId, project.github_repo_url)`.** Reading `project.github_repo_url`
alone reports every genuinely connected student as unconnected — measured on production
2026-08-20 and documented at `projectRepoResolver.ts:12-18`: of 16 connections carrying both
`project_id` and `repo_url`, **zero** had `projects.github_repo_url` populated. The column was
abandoned, not lagging.

**Use `resolveProjectRepos()` (the batch form) for the admin candidate-discovery report** required
by spec §36. Scanning every eligible Project one at a time is an N+1 against the largest table
this feature touches.

---

## 3. The hardened client — build on this

`backend/src/services/sbp/repoConnect/githubRepoClient.ts`, exported surface:

```ts
export interface RepoFacts {                                                       // :22
  owner; repo; full_name; html_url; private; default_branch;
  platform_can_push; archived; fork;
}
export interface GitHubReadOptions { fetchImpl?: typeof fetch; correlationId?: string }  // :36
export interface RawResult { status: number; ok: boolean; body: string; headers?: Headers } // :81

export function githubApiRequest(method: 'GET'|'PATCH', path: string, opts?): Promise<RawResult> // :163
export function isRateLimitedResult(result: RawResult): boolean                     // :170
export async function fetchRepoFacts(owner, repo, opts?): Promise<RepoFacts>        // :216  GET /repos/{o}/{r}
export async function fetchRepoFile(owner, repo, path, opts?): Promise<string|null> // :253  GET /contents/{path}, base64-decoded; null == 404 (normal)
export async function repoHasCommits(owner, repo, opts?): Promise<boolean>          // :286  GET /commits?per_page=1; 409 == empty repo
```

Headers (`:116-120`): `Accept: application/vnd.github+json`,
`Authorization: Bearer <token>`, `X-GitHub-Api-Version: 2022-11-28`. Base URL overridable via
`GITHUB_API_URL` (`:43`).

### Why this and not another client

| Property | Where | Why the analyzer needs it |
|---|---|---|
| **15 s timeout** | `:19`, `:108-109` | Spec §37 requires outbound GitHub timeouts. A 20-repo collection with no timeout can hang an admin sync indefinitely. |
| **Capped retries** | `:20`, `:132-134`, `:149` — 3 attempts, 429/5xx only, linear backoff | Root `CLAUDE.md` prohibits unbounded retries outright. |
| **Rate-limit disambiguation** | `isRateLimited()` `:73` | GitHub overloads 403 for both "forbidden" and "rate limited". Getting this wrong turns a transient throttle into a permanent `unavailable` on a repo. |
| **`retry-after` honoured** | `:177` | A 20-repo sync is exactly the shape that trips secondary rate limits. |
| **Classified errors** | `RateLimited`, `Unauthorized`, `RepoNotFound`, `NoPushAccess`, `UpstreamError`, `UpstreamTimeout`, `ConfigError` | Maps almost 1:1 onto the spec §29 failure taxonomy (§6 below). |
| **`fetchImpl` injection seam** | `:36-38`, threaded at `:103` | The repo's rule (§8) is: do **not** mock `global.fetch`. |
| **Fixed-field logging** | `log()` `:57`, with the comment at `:60`: *"a spread here is how a token ends up in a log"* | Spec §37: no raw GitHub tokens in logs or responses. |

### The read/write boundary

`githubRepoClient.ts:14-15` and `:97-98` state it: *"Nothing here may be used to mutate repository
CONTENT; that remains repoWriter's sole job."* `backend/src/services/sbp/repoWriter.ts` is the
only sanctioned writer, and its idempotency comes from comparing content hashes against
`.colaberry/manifest.json` before any network call.

**The Case Study OS is read-only against GitHub. It never calls `repoWriter`.**

### The custody invariant that shapes the whole design

`docs/REPO_CONNECT_CONTRACT.md`, attributed to Ali Muwwakkil, 2026-08-14, and restated verbatim
at `repoConnectService.ts:4-22`:

> **Student-owned repos. The platform stores pointers and evidence, never the code.**

and:

> **Evidence never depends on the repo.** Commit sha, criteria, timestamp and XP are written to
> platform tables. Delete the repo, revoke access, rewrite history — the record and the points
> stay. *"The repo is where verification HAPPENS; it is never where the record LIVES."*

This is the same rule as spec §6.5 (*"Published proof survives repo availability changes"*),
already load-bearing in this codebase. A published Case Study snapshot is a platform record. A
repo going private, being renamed, or being deleted updates **sync health** and nothing else.

---

## 4. The one-repo-per-project invariant — and how a Case Study collection differs

### 4.1 What actually enforces it

Four layers, **none of them a Sequelize `unique: true`**:

**(1) The partial unique index — the real constraint.**
`backend/src/db/ensureWorkspaceRepoSchema.ts:42-43`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS github_connections_unique_project
  ON github_connections (project_id) WHERE project_id IS NOT NULL
```

Partial because legacy enrollment-keyed rows carry `project_id = NULL` and several NULLs must not
collide (comment at `:40-41`).

**(2) The old constraint is explicitly dropped, in the right order.**
`ensureWorkspaceRepoSchema.ts:33-34` drops **both**
`ALTER TABLE ... DROP CONSTRAINT IF EXISTS github_connections_enrollment_id_key` **and**
`DROP INDEX IF EXISTS github_connections_enrollment_id_key`. The header (`:16-22`) records why: a
bare `DROP INDEX` against a constraint-backed index failed silently inside the warn-only loop and
**shipped green having done nothing**. A constraint owns its index; the constraint must go first.

**(3) A post-condition assertion with teeth.** `assertWorkspaceRepoSchema()` at `:69` queries
`information_schema` / `pg_constraint` / `pg_indexes` and emits a structured
`error_class: 'SchemaInvariantViolation'` if the index is absent. `ensureWorkspaceRepoSchema()`
awaits its own assertion as its last line (`:55`).

**(4) Application guards.**
- `assertNotClaimedElsewhere(ref, projectId)` — `repoConnectService.ts:139`. Matches
  **case-insensitively** (`Op.iLike` on `repo_owner`/`repo_name`, `project_id != projectId AND NOT
  NULL`), throwing `RepoConnectError('RepoAlreadyClaimed')`. The rationale from
  `docs/REPO_CONNECT_CONTRACT.md` §3: *"two plans sharing one `docs/` folder collide on
  `REQUIREMENTS.md`. Matched case-insensitively, because GitHub is."*
- `assertRebindAllowed()` — `repoConnectService.ts:165`. Refuses to silently re-point a project
  already on a different repo **that has commits**, unless `confirmReplace` is passed. An
  unreadable current repo is treated as "has work", never as empty.

### 4.2 The caveat — read this before designing the collection

**The invariant is *one project per connection row*, keyed on `project_id`. It does NOT prevent
the same `(repo_owner, repo_name)` appearing twice at the database level** — only the application
guard does that. And legacy rows with `project_id = NULL` are exempt from the index entirely.

So "one repo per project" is really "one *connection row* per project, plus an application-level
promise that two projects do not claim the same repo."

### 4.3 The distinction — Project workspace connection vs Case Study source collection

These are two different relationships to the same underlying GitHub repositories, and conflating
them is the highest-risk modelling error in this build.

```
                    PROJECT WORKSPACE CONNECTION                 CASE STUDY SOURCE COLLECTION
                    (exists today, do not weaken)                (new, this build)

                    ┌───────────────┐                            ┌───────────────┐
                    │   projects    │                            │ case_studies  │
                    │   id (UUID)   │                            │  id (UUID)    │
                    └───────┬───────┘                            └───────┬───────┘
                            │ 1                                          │ 1
                            │                                            │
                            │ partial UNIQUE (project_id)                │
                            │ WHERE project_id IS NOT NULL               │
                            │ ensureWorkspaceRepoSchema.ts:42            │
                            │                                            │
                            ▼ 1                                          ▼ 1
                    ┌────────────────────┐                       ┌────────────────────────────┐
                    │ github_connections │                       │ case_study_repo_collections│
                    │  ONE primary repo  │                       └─────────────┬──────────────┘
                    │  repo_owner        │                                     │ 1
                    │  repo_name         │                                     │
                    │  webhook_secret    │                                     ▼ N   (max 20, spec §37)
                    │  file_tree_json    │                       ┌────────────────────────────┐
                    │  WRITABLE via      │                       │  case_study_repositories   │
                    │  repoWriter        │                       │  role: primary|frontend|   │
                    └────────────────────┘                       │        backend|agents|data|│
                            ▲                                    │        infra|docs|evals|   │
                            │                                    │        demo|other          │
                            │  nullable pointer                  │  allow_public_repo_link    │
                            └────────────────────────────────────┤  github_connection_id ─────┘
                                                                 │  project_id (nullable)
                                                                 │  READ-ONLY, always
                                                                 └────────────────────────────

  ONE project  →  ONE primary repo            ONE case study  →  ONE collection  →  MANY repos
  Enforced by a partial unique INDEX          Enforced by app-level dedupe on (owner, repo) per
  + application guards.                       collection, case-insensitively via sameRepo().
  Platform WRITES here (repoWriter).          Platform NEVER writes here.
  Deleting the repo breaks the workspace.     Deleting a repo updates sync health only; the
                                              published snapshot is unaffected (spec §6.5).
```

### 4.4 The rules that fall out of the diagram

| # | Rule |
|---|---|
| **R1** | `case_study_repositories.github_connection_id` is a **nullable pointer**, never a source of truth and never a foreign key that implies ownership. A Case Study may reference a repo that has no `GitHubConnection` row at all — spec §36 requires repo-only Case Studies to work "without a Project row for historical/internal/future AI Flotation work." |
| **R2** | **Attaching a repo to a Case Study collection must NEVER call `assertNotClaimedElsewhere`, `assertRebindAllowed`, `startConnect`, `confirmConnect`, or `adoptProvisionedRepo`.** Those are the *workspace binding* state machine (`not_connected → awaiting_proof → connected`, `docs/REPO_CONNECT_CONTRACT.md:336-345`). A Case Study attaching a repo as evidence is not a binding. |
| **R3** | **Two Case Studies may reference the same repository.** That is legitimate — one team's repo can appear in a platform story and an industry story. The workspace invariant does not apply here and must not be extended to cover it. |
| **R4** | **Uniqueness inside a collection is `(collection_id, lower(repo_owner), lower(repo_name))`.** Enforce it with a unique index on the lowered pair *and* an application dedupe via `sameRepo()` (`repoReference.ts:135`). Do not rely on either alone — the workspace layer's history is a lesson in exactly that. |
| **R5** | **Do not add, alter, or drop anything on `github_connections`.** No new column, no widened index, no relaxed constraint. `ensureCaseStudySchema.ts` is additive-only against new `case_study_*` tables. If `assertWorkspaceRepoSchema()` (`:69`) ever fires after this build, this build caused it. |
| **R6** | **The `role` field belongs to the Case Study side.** `primary | frontend | backend | agents | data | infra | docs | evals | demo | other` (spec §7.3) is editorial classification of evidence, not a workspace concept. `github_connections` has no notion of role and must not gain one. |
| **R7** | **Bound the collection.** Spec §37 suggests max 20 repos per Case Study. Enforce it at the service boundary with a classified error, not with a database check constraint — the failure needs an actionable message. |

---

## 5. What the analyzer reads

Spec §11 defines bounded facts. **Do not recursively fetch every file body.**

### 5.1 Repository metadata

`fetchRepoFacts(owner, repo)` (`githubRepoClient.ts:216`) already returns `owner`, `repo`,
`full_name`, `html_url`, `private`, `default_branch`, `platform_can_push`, `archived`, `fork`.

Spec §11 additionally wants `description`, `homepage`, `topics`, `languages`, `created_at`,
`updated_at`, `pushed_at`, `license`, contributors where safe, and the latest commit SHA. Those
come from the same `GET /repos/{owner}/{repo}` response body via `githubApiRequest` (`:163`) —
**extend the `RepoFacts` interface rather than adding a second client**, or read them through
`githubApiRequest` in the analyzer and keep `RepoFacts` untouched. Prefer extending: one shape,
one place.

**Languages caveat.** There is **no call to GitHub's `/languages` endpoint anywhere in this
repo.** `GitHubConnection.repo_language` is inferred client-side from file extensions with a
10-entry `langMap` at `backend/src/services/githubService.ts:150-153`. It is a coarse single
value, not a breakdown. If the analyzer wants a real language breakdown it must call
`GET /repos/{o}/{r}/languages` itself through `githubApiRequest` — and it must not present the
existing `repo_language` as if GitHub said it.

### 5.2 High-value files

Read individually via `fetchRepoFile(owner, repo, path)` (`githubRepoClient.ts:253`), which
base64-decodes the response and returns **`null` for a 404 — a normal, expected outcome, not an
error**. Spec §11's list:

```text
README.md / README.*        CLAUDE.md                 package.json
requirements.txt            pyproject.toml            Dockerfile
docker-compose.*            *.csproj                  go.mod
Cargo.toml                  docs/REQUIREMENTS.md      docs/ARCHITECTURE.md
docs/architecture/**        docs/TRACEABILITY.md      docs/STORIES.md
case-study.*                .colaberry/plan.json      .colaberry/manifest.json
tests/                      __tests__/                .github/workflows/
```

The trailing directory entries are **presence checks**, not file reads — answer them from the file
tree, never by fetching contents.

### 5.3 Prefer the persisted tree

Spec §11: *"Prefer persisted current `GitHubConnection.file_tree_json`, repo language, route
registry, commit summary, and existing sync data for Project-connected repos where fresh enough."*

`file_tree_json` (`GitHubConnection.ts:129`) holds GitHub's **raw recursive-tree response**:
`{ sha, url, tree: [{ path, mode, type: 'blob'|'tree', sha, size, url }], truncated }`, written
wholesale at `githubService.ts:157`.

Every consumer performs the same projection:

```ts
conn?.file_tree_json?.tree?.filter(t => t.type === 'blob').map(t => t.path)
```

**There is no shared helper for this** — that copy-pasted one-liner is the de facto contract
across 20+ call sites (`backend/src/routes/projectRoutes.ts:81`, `:2360`, `:7370`, `:7789`, …;
`backend/src/intelligence/execution/realityVerifier.ts:35`;
`backend/src/intelligence/requirements/codeDiscovery.ts:40`;
`backend/src/intelligence/systemStateEngine/systemStateEngine.ts:1172`). Reuse the same shape, or
lift a small pure helper — either is acceptable; inventing a different shape is not.

**Two traps when reading the persisted tree:**

- **`truncated: true`.** GitHub truncates very large trees. A truncated tree that reports "no
  Dockerfile" is not evidence there is no Dockerfile. Check the flag and degrade to `unknown`.
- **`syncFileTree` is enrollment-keyed** (`githubService.ts:107`) and resolves its connection via
  `getConnection(enrollmentId)` → `findOne({ where: { enrollment_id } })` (`:46`), which selects
  an **arbitrary** row now that `enrollment_id` is no longer unique. On a multi-project
  enrollment, the persisted tree may belong to a different project's repo. **Always confirm the
  connection's `repo_owner`/`repo_name` match the repository you are analyzing before trusting
  its `file_tree_json`.** This is a live pre-existing bug (defect D-8), not a hypothetical.

### 5.4 Determinism boundary

Spec §11 closes with: **"Do not use AI for facts that are deterministic."**

Deterministically derived, never AI: languages, frameworks, dependencies, test frameworks, CI
presence, Docker presence, architecture-doc presence, test presence, deliverables, visibility, and
the deployment/homepage URL. AI's role is confined to narrative drafting (spec §12) over facts the
analyzer already extracted. See `DATA_SOURCE_MAP.md` §3 and §5.

### 5.5 Manifest handling

Recognised in order (spec §8): `case-study.yml`, `case-study.yaml`, `case-study.json`.

Constraints:

- **The entire system must work without a manifest.** It is an optional accelerator.
- **A manifest is authoritative only for fields it declares**, and high-risk outcome metrics still
  require proof approval regardless.
- **`requested_surfaces` is a request, never publication authorization.** So is anything under
  `consent:` — a file committed by whoever had push access is not a consent record.
- **Do not hand-write a general YAML parser.** If no approved YAML dependency exists, fully
  support `case-study.json`, keep parsing behind a `CaseStudyManifestReader` seam, and document
  YAML as a bounded deferred adapter requiring DRI approval.
- **No arbitrary URL fetch from a manifest** (spec §37). A manifest may name evidence; it may not
  make the platform fetch an attacker-chosen URL.
- Manifest content is untrusted input from outside the trust boundary. Validate it with Zod v4
  (`.issues`, not `.errors`) before any field reaches the snapshot builder.

---

## 6. Failure classification

Spec §29 requires: `RepoNotFound`, `Unauthorized`, `RateLimited`, `Timeout`, `MalformedManifest`,
`RepoEmpty`, `Unknown`. The mapping from what `githubRepoClient` already throws:

| `githubRepoClient` error | Case Study class | Repo `access_status` (spec §7.3) |
|---|---|---|
| `RepoNotFound` | `RepoNotFound` | `deleted` — or `unavailable` if it may simply have gone private |
| `Unauthorized` | `Unauthorized` | `unavailable` |
| `RateLimited` | `RateLimited` | `rate_limited` |
| `UpstreamTimeout` | `Timeout` | `unknown` |
| `UpstreamError` | `Unknown` | `unknown` |
| `ConfigError` | `Unknown` (operator-facing) | `unknown` |
| `repoHasCommits()` returns `false` (409) | `RepoEmpty` | `connected` |
| Zod failure on a manifest | `MalformedManifest` | `connected` |

**One bad repo produces `partial`, never destruction of the whole candidate** (spec §29). The
orchestration shape to copy is `backend/src/services/artifacts/artifactRepoSync.ts`, whose
contract at `:6-16` is **NEVER THROWS** — every path returns a classified outcome
(`ArtifactSyncOutcome` at `:51`: `written | unchanged | no_repo | no_artifacts | no_access |
repo_gone | not_configured | failed`) because a mirror failing must not turn a successful upload
into a user-facing error. `case_study_sync_runs.status` (`running | success | partial | failed |
unchanged`) is the same idea at the run level.

Two details from that module worth carrying over verbatim:

- **A 404 on a write is ambiguous.** GitHub answers an unauthorised write with 404, not 403.
  `writeFailureDiagnosis.ts:33-35` resolves it: *read OK + write 404 → permissions; read 404 +
  write 404 → gone*. The Case Study analyzer only reads, so the simpler read-side rule applies —
  but the lesson stands: **do not infer "deleted" from a single 404.** `probeRepoReadable()`
  exists for exactly this, and the measurement that motivated it (2026-08-21: 12 of 13 student
  repos were "may not write", not "gone") is in the file header.
- **`err.message` is deliberately never surfaced** (`artifactRepoSync.ts:277`) — it can carry an
  upstream API body. Spec §37 says the same: *"sanitize repo errors."*

---

## 7. Sync triggers and idempotency

### 7.1 Triggers

| Trigger | Status in Phase 1 |
|---|---|
| **Manual admin sync** | **Mandatory** (spec §29). The admin clicks Sync; a `case_study_sync_runs` row is created with `trigger = 'manual'`. |
| **Existing GitHub webhook** | Preferred over a second webhook. Spec §29: *"Prefer an existing GitHub event triggering a Case Study refresh rather than duplicating webhooks."* The receiver is `webhookRoutes.ts:62`; a Case Study refresh would hang off the existing push path, gated on the repo appearing in some `case_study_repositories` row. |
| **Scheduled reconciliation** | Required if consistent with existing repo patterns. Note `docs/BUILD_PIPELINE_GITHUB_SYNC.md` §5.2 specifies an ETag-based reconciler under an advisory lock (**FR-043**) — and it is **not implemented**; there is no `last_synced_sha` column on `github_connections` (**FR-042** also unshipped). Do not assume that plumbing exists. |
| **External repo-only webhook registration** | **Deferrable** (spec §29) — it would require a separate infrastructure workstream. Document it as deferred; do not hide it. |

**If a webhook trigger is wired, inherit the existing dedup, and be aware of its gap.** The
delivery claim (`INSERT ... ON CONFLICT (delivery_id) DO NOTHING RETURNING`,
`githubPushVerification.ts:118-144`) happens only inside `handlePushForVerification`, which is the
**fifth** downstream call. Calls 1–4 in `webhookRoutes.ts:107-126` run before and outside the
claim and re-execute on every GitHub redelivery (defect D-9). A Case Study refresh hung off this
path must bring its own idempotency, not borrow theirs.

### 7.2 The idempotency contract

Spec §30:

```text
same repo set + same SHAs + same Project/Evidence facts
  = same normalized snapshot hash
  = sync outcome unchanged
```

This is achievable **only** if the snapshot builder is pure and clock-free. Two existing modules
already solve this and must be reused rather than re-derived:

- **`backend/src/services/sbp/planHash.ts`** — `canonicalize()` recursively sorts object keys so
  serialization is order-independent, then `hashPlan()` sha256s the result. Canonicalisation
  exists because `JSON.stringify` preserves insertion order, so structurally identical objects
  would otherwise hash differently. Its header (`:4-11`): *"what makes 'the plan you reviewed is
  the plan that shipped' a checkable claim rather than an intention."*
  **`case_study_snapshots.content_hash` uses this. A bare `JSON.stringify` will produce spurious
  new versions forever.**
- **`backend/src/services/sbp/buildProgressSnapshot.ts:1-25`** — *"NOTHING VOLATILE MAY LEAVE THIS
  MODULE. Every field returned has to be stable while the build is stable — no `checked_at`, no
  run id, no 'now'."* The Case Study snapshot `content` obeys the same rule. Timestamps belong on
  the **row** (`generated_at`, `approved_at`), never inside the hashed content.

`case_study_snapshots` follows the `build_plans` shape (`backend/src/db/ensureSbpSchema.ts:102-122`):
`version INTEGER`, `status VARCHAR(20)`, `content JSONB`, `content_hash VARCHAR(64)`,
`published_at TIMESTAMPTZ`, and a `UNIQUE (case_study_id, version)` index, with the same rule:
*"Versions are immutable once written: a regeneration is a new version, never an overwrite."*

**Publication pinning (spec §17).** A repo change creates a **new draft snapshot**; the
**published snapshot stays pinned** via `case_study_publications.published_snapshot_id` until an
admin reviews the structured diff and republishes. *"Do not silently mutate live content."*

---

## 8. Testing GitHub code

**Do not mock `global.fetch`.** The codebase provides explicit seams:

```ts
// githubRepoClient.ts:36-38 — "Injected in tests. Production uses global fetch"
export interface GitHubReadOptions { fetchImpl?: typeof fetch; correlationId?: string }
```

threaded through `request()` at `:103`. Sibling seams: `readArtifactText(..., readFile = fs.readFile)`
(`artifactRepoSync.ts:114`) and `ArtifactSyncOptions.now?: string` (`:72`, for clock-free
rendering).

The house style for a GitHub-touching suite (`backend/CLAUDE.md`, and the corpus):

1. `const mockX = jest.fn()` declared **above** every `jest.mock` factory, referenced inside as
   `(...a: any[]) => mockX(...a)` so hoisting is safe.
2. `jest.mock(...)` calls first; the module under test imported **last**.
3. Mock `../../config/database` with a bare object — minimal canonical form at
   `backend/src/db/__tests__/ensureSbpSchema.test.ts:21`:
   `jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));`
4. `jest.clearAllMocks()` in `beforeEach`.
5. **Every test file opens with a block comment naming the production defect or invariant it
   guards.** This is culturally enforced across the whole suite.

Importing a model does **not** open a connection (`backend/src/config/database.ts:4-13`; Sequelize
v6's constructor is lazy and `connectDatabase()` is never called at import time), so tests that
inspect `rawAttributes` work with no database — but mocking `config/database` is still the house
style.

The pure-core reference to emulate is
`backend/src/services/__tests__/projectRepoResolver.test.ts` — **fully pure, zero mocks**, header
at `:1-8`: *"The pure core is what decides whether a student is reported as having a repo, so
every rule here is asserted directly rather than through a database."*

---

## 9. Security checklist for this surface

From spec §37, mapped to what already exists:

| Requirement | How it is satisfied |
|---|---|
| No raw GitHub tokens in logs or responses | Use `githubRepoClient`'s fixed-field `log()` (`:57-60`). Never spread an options or error object into a log line. |
| Sanitize repo errors | Return a classified `error_class` and a written sentence; never `err.message` (`artifactRepoSync.ts:277`). |
| No private repo URLs in the public API | The three-clause conjunction in `DATA_SOURCE_MAP.md` §3.5. `allow_public_repo_link` defaults `false`. |
| No arbitrary URL fetch from manifests | The manifest may name evidence; it may never drive an outbound fetch. |
| Bound repo count per collection | Max 20 (spec §37), enforced at the service boundary with a classified error. |
| Bound files and file sizes per sync | Read only the §5.2 allow-list; treat directory entries as presence checks; cap decoded file size. |
| Outbound GitHub timeouts | Inherited from `githubRepoClient` (15 s). Never call `githubService.ts` — it has **zero** timeouts on every call. |
| Reuse existing PII redaction | `backend/src/utils/piiRedaction.ts` for logs. Note it is **log-only** and sanitizes nothing before persistence. |
| No directory traversal from artifact paths | Normalise and reject `..` in any repo-derived path before it reaches a filename or URL. |

---

## 10. Summary of decisions

1. **Parse with `parseRepoReference()`** (`repoReference.ts:54`). Dedupe with `sameRepo()`
   (`:135`). Never touch `projectRepoResolver.ts:57` or `githubService.ts:10` — both truncate repo
   names at the first dot.
2. **All reads through `githubRepoClient.ts`** — 15 s timeout, 3 capped retries, rate-limit
   disambiguation, classified errors, `fetchImpl` seam, fixed-field logging. Use the platform
   `GITHUB_TOKEN`, never `access_token_encrypted`.
3. **"This Project's repo" is always `resolveProjectRepo(projectId, project.github_repo_url)`**;
   use the batch `resolveProjectRepos()` for candidate discovery.
4. **A Project workspace connection (one primary repo, writable, unique-indexed) and a Case Study
   source collection (one-to-many, read-only, editorially classified) are different concepts.**
   Do not extend the workspace guards over the collection, and do not weaken the partial unique
   index at `ensureWorkspaceRepoSchema.ts:42`.
5. **Prefer persisted `file_tree_json`**, but verify `repo_owner`/`repo_name` match before
   trusting it (defect D-8) and check `truncated` before concluding a file is absent.
6. **Never read GitHub during a public render** (spec §6.4). Published snapshots and indexed DB
   queries only.
7. **Hash with `planHash.canonicalize()` + sha256, over clock-free content.** Anything else makes
   spec §30's "unchanged" outcome unreachable.
8. **The Case Study OS never writes to a repository.** `repoWriter` is out of scope entirely.
