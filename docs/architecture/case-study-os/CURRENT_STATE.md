# Case Study OS — Current State

**Gate 0 deliverable.** What exists in this repository *today*, before any Case Study OS
code is written. Every claim below was observed directly in the worktree
`C:/Users/ali_m/casestudy-os-wt` at `origin/main` = `cfd016d9`, on 2026-08-22.

Read this before `DEPENDENCY_MAP.md`. Nothing in this document describes a future state.

---

## Part 0 — Gate 0 exit answers

The build plan (§3, *Gate 0 exit condition*) requires these nine questions to be answered
before any schema or UI work. Short answers first; the evidence is in Parts 1–5.

### 0.1 What is the authoritative Project record?

`backend/src/models/Project.ts`, table `projects`, PK `id` **UUID** with
`defaultValue: DataTypes.UUIDV4` (`Project.ts:93-97`). Options `timestamps: true`,
`underscored: true` (`Project.ts:241-250`). 33 declared columns.

Any new FK pointing at a Project must be `project_id UUID ... REFERENCES projects(id)` —
the exact form used by every sibling schema module (precedent: `backend/src/db/ensureSbpSchema.ts:32`).

Fields a Case Study will read: `name` (`:110`), `organization_name` (`:114`),
`industry` (`:118`), `primary_business_problem` (`:122`), `selected_use_case` (`:126`),
`system_model` JSONB (`:156`), `executive_summary` (`:160`), `portfolio_cache` JSONB (`:164`),
`project_stage` ENUM (`:138`), `enrollment_id` (`:98`).

Two traps on this model:

- **`projects.github_repo_url` (`Project.ts:148`) is abandoned, not lagging.** Measured on
  production 2026-08-20 and recorded at `backend/src/services/projectRepoResolver.ts:12-18`:
  of 16 connections carrying both `project_id` and `repo_url`, **zero** had
  `projects.github_repo_url` populated. Reading this column directly reports every genuinely
  connected student as unconnected.
- **`project_stage` is a real Postgres ENUM** (`Project.ts:138`). Adding a stage value is an
  `ALTER TYPE ... ADD VALUE`, not a TypeScript union edit.

### 0.2 What is the authoritative workspace repo connection?

`backend/src/models/GitHubConnection.ts`, table `github_connections`, PK `id` UUID
(`:73-77`), `timestamps: false` (`:162` — `created_at` is an explicit column and there is
**no `updated_at`**).

The authoritative *read* is **not** the table directly. It is
`resolveProjectRepo(projectId, project.github_repo_url)` at
`backend/src/services/projectRepoResolver.ts:102`, whose pure core `decideRepoPointer()`
(`:72`) applies the precedence: a connection row carrying a non-blank `repo_url` wins →
else `projects.github_repo_url` → else `source: 'none'` (`:76-95`). A connection row that
exists with a blank `repo_url` is deliberately **not** an answer (`:68-70`) — that is a
student who authorised GitHub but never picked a repo.

**One repo per project** (FR-037) is enforced by a **partial unique index**, not a Sequelize
`unique: true` — `backend/src/db/ensureWorkspaceRepoSchema.ts:42-43`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS github_connections_unique_project
  ON github_connections (project_id) WHERE project_id IS NOT NULL
```

Partial because legacy enrollment-keyed rows carry `project_id = NULL` and several NULLs must
not collide (`ensureWorkspaceRepoSchema.ts:40-41`). Backed by
`assertWorkspaceRepoSchema()` (`:69`), which queries `information_schema` / `pg_constraint` /
`pg_indexes` and emits `error_class: 'SchemaInvariantViolation'` if the index is absent.
Application-level guards sit on top: `assertNotClaimedElsewhere()`
(`backend/src/services/sbp/repoConnect/repoConnectService.ts:139`, case-insensitive via
`Op.iLike`) and `assertRebindAllowed()` (`:165`).

**Caveat that matters to this build:** the uniqueness is on `project_id`, **not** on
`(repo_owner, repo_name)`. The same repo appearing twice is blocked only by application code.
See `GITHUB_INTEGRATION_MAP.md` §4.

### 0.3 How is GitHub currently accessed and synchronized?

**Raw `fetch`. There is no Octokit anywhere** — no `@octokit/*` in `backend/package.json`
(the comment at `backend/src/services/agentGitHubService.ts:3` claiming Octokit is stale).

**There are four competing HTTP paths, and only one is hardened:**

| Client | File | Timeout | Retry | Rate-limit aware |
|---|---|---|---|---|
| `githubRepoClient` **(the good one)** | `backend/src/services/sbp/repoConnect/githubRepoClient.ts` | **15 s** via `AbortController` (`:19`, `:108-109`) | **3 attempts**, 429/5xx only, linear `300ms * attempt` (`:20`, `:132-134`, `:149`) | **Yes** (`isRateLimited()` `:73`, honours `retry-after` `:177`) |
| `githubIntegrationService` | `backend/src/services/githubIntegrationService.ts` | 15 s on 3 activity reads only; **none** on OAuth exchange (`:30`) or webhook registration (`:110`) | none | no |
| `githubService` | `backend/src/services/githubService.ts` | **none on any call** | none | no |
| `agentGitHubService` | `backend/src/services/agentGitHubService.ts` | none | none | no |

**There is no circuit breaker on any GitHub path**, despite `openclawCircuitBreaker.ts` being
named the canonical pattern in root `CLAUDE.md`. The `githubRepoClient` retry cap is the only
backstop.

Sync today happens three ways:
1. **Webhook** — exactly one inbound receiver, `POST /api/webhook/github`
   (`backend/src/routes/webhookRoutes.ts:62`, mounted `backend/src/server.ts:100`). HMAC-SHA256
   verified with `crypto.timingSafeEqual` (`githubIntegrationService.ts:212`), fail-closed
   (`webhookRoutes.ts:98-101`). Delivery dedup via
   `github_webhook_deliveries` PK on `delivery_id` (`backend/src/db/ensureSbpSchema.ts:135-142`).
2. **`syncFileTree(enrollmentId)`** — `backend/src/services/githubService.ts:107`, writes the raw
   recursive tree wholesale into `github_connections.file_tree_json` (`:157`).
3. **`syncStudentActivity(enrollmentId)`** — `githubIntegrationService.ts:138`, commits + PRs +
   repo metadata into `StudentGithubActivity`.

The only sanctioned **writer** into a repo is `backend/src/services/sbp/repoWriter.ts`
(`githubRepoClient.ts:14-15`, `:97-98`: *"Nothing here may be used to mutate repository
CONTENT; that remains repoWriter's sole job"*).

Full detail, including which parser to reuse and which two to never copy, is in
`GITHUB_INTEGRATION_MAP.md`.

### 0.4 What existing evidence can Case Studies reference?

Four distinct things in this repo answer to the word "evidence". Naming one without
qualification is ambiguous.

| System | Table | What it is | Usable by Case Study OS |
|---|---|---|---|
| `EvidenceRecord` (`backend/src/models/EvidenceRecord.ts`) | `evidence_records` | XP/progression award ledger, append-only, unique `idempotency_key` | **Yes** — this is the one spec §7.7 means by "reuse existing EvidenceRecord" |
| `PortfolioArtifact` (`backend/src/models/PortfolioArtifact.ts`) | `runtime_portfolio_artifacts` | student deliverable bodies (JSONB `content`) | **Yes, as a source for `case_study_artifacts`** — never as a Case Study itself |
| `EvidenceArtifact` + `EvidenceLink` (`backend/src/models/EvidenceArtifact.ts`) | `evidence_artifacts` | ProofDesk / ticket screenshots, logs, diffs | Out of scope — ticket-shaped, FK to `tickets` |
| `student_tasks.verified_*` | `student_tasks` | the real verification latch | Read-only signal; see below |

**`EvidenceRecord` field discipline** (`EvidenceRecord.ts:43-54`): `id` UUID PK,
`enrollment_id` UUID (no FK declared), `card_id` UUID, `source_type` `STRING(30)`,
`source_ref` `STRING(255)`, `competency_weights` JSONB, `builder_xp` INTEGER,
`validated` BOOLEAN default `true`, `idempotency_key` `STRING(255)` **UNIQUE**, `created_at`.
`EvidenceSource` union (`:12-14`): `prompt_lab | github_commit | github_pr | artifact |
peer_review | instructor_review | deliverable | implementation | portfolio`.
Sole writer: `recordEvidence()` at `backend/src/services/progression/evidenceEngine.ts:53-88`,
key composed at `:54` as `` `evidence:${enrollmentId}:${source}:${sourceRef}` ``.

**`EvidenceRecord.validated` is vestigial.** It is hardcoded `true` at
`evidenceEngine.ts:68`, is never written `false` anywhere in the codebase, and every reader
filters `where: { validated: true }`. It is **not** a verification workflow. There is no
`verified_by`, `verified_at`, `reviewer_id`, or status enum on the model.

**Real verification state lives on `student_tasks`**, added by
`backend/src/db/ensureSbpSchema.ts:62-95`, in a deliberate four-way split:
`status = 'complete'` is the *student's claim*; `verified_at` is the platform having
**confirmed** it (a latch a student cannot reach); `verified_by` is who/what confirmed;
`verified_ref` is **the evidence commit sha, frozen at award time**; `verification_json` is
the *live* verdict refreshed on every sync. All four are nullable with no DEFAULT on purpose
(`:70-72` — a default would backdate every already-complete task into verified, which is the
one outcome the column exists to prevent).

The doctrine to inherit, stated at
`backend/src/services/sbp/verification/verificationLatch.ts:6-11`:

> **EVIDENCE LIVES IN OUR DATABASE. THE REPO IS ONLY WHERE VERIFICATION HAPPENS.**

`student_tasks` joins to `evidence_records` by **key composition, not FK**:
`source_type: 'github_commit'` + `source_ref = ` `` `${storyId}@${verified_ref}` ``. The `@`
delimiter is deliberate so a prefix scan `STORY-1@` cannot match `STORY-10@`
(`backend/src/services/projects/projectReadService.ts:96-97`). `evidence_records` has **no
foreign keys at all** — not in the model, not in the DDL (`backend/src/server.ts:1624-1637`).

### 0.5 How does anonymous visitor behaviour become part of a Lead journey?

Through `resolveIdentity(visitorId, leadId)` at
`backend/src/services/visitorTrackingService.ts:304-381`, in six steps: set
`visitors.lead_id` (`:312`) → mirror `leads.visitor_id` (`:315-318`) → backfill
`visitor_sessions.lead_id` (`:321-329`) → backfill `page_events.lead_id` (`:341-356`) →
write an `activities` row (`:359-368`) → write an `event_ledger` row (`:371-380`). The
backfills carry a `lead_id IS NULL` predicate, which makes them idempotent and stops an
already-attributed event being reassigned (`:338-340`). The `page_events` backfill is
separately try/caught and non-fatal by design (`:336-337`).

Four triggers: `?email=` on any tracked event (`backend/src/controllers/trackingController.ts:238-251`),
the `lid` query param on a single event (`:252-263`), a `lead_id` body field on a batch
(`:368-379`), and `POST /api/t/identify` (`:447-539`, the only find-or-**create** path).

**The critical nuance:** the journey renderer does **not** read `page_events.lead_id`. It
joins by `visitor_id` (`backend/src/services/journeyTimelineService.ts:129-148`). So an
anonymous event enters the journey the moment `visitors.lead_id` is set, whether or not the
`page_events` backfill succeeded. **Anything built on `page_events.lead_id` inherits a lag and
a silent-failure mode; anything built on `visitor_id` does not.** `page_events.lead_id` is
never set at insert time — `recordPageEvent` (`visitorTrackingService.ts:242-259`) omits it
entirely.

See Part 4 for the full pipeline, and the **`/stories` categorisation defect** in Part 6 — the
single highest-value finding in this whole discovery.

### 0.6 What is currently illustrative on `/stories`?

**Everything. All of it. There is no backend.**

`/stories` renders `frontend/src/pages/publicV2/StoriesV2.tsx` (102 lines), which imports
three literal entries from `frontend/src/config/v2Stories.ts:40`
(`export const STORIES: readonly Story[]`) and makes **zero network calls**. The three slugs
are `claims-triage`, `maintenance-knowledge`, `finance-close` (`v2Stories.ts:42, 62, 81`).

The "illustrative" labelling works in three independent layers, only one of which is enforced:

1. **Page-level prose** — `STORIES_NOTICE` (`v2Stories.ts:102-105`) rendered as the hero lede.
2. **Per-card badge — HARDCODED.** `StoriesV2.tsx:52` is literally
   `<EvidenceBadge evidence="illustrative" />`. The string is typed into the JSX. It is
   **not** read from the story object. Every card gets the same badge regardless of data.
   A verified story cannot be expressed today without changing this line.
3. **Per-card evidence-gap footer** — `StoriesV2.tsx:71-73` renders
   *"To publish this for real: {s.evidenceNeeded}"*, styled by
   `frontend/src/pages/publicV2/storiesV2.css:56-66`.

**Contradiction inside the data file itself:** `v2Stories.ts:6` claims in a header comment
that *"every entry carries `evidence: 'illustrative'`"*. The `Story` interface
(`v2Stories.ts:25-38`) has **no `evidence` field**. The comment describes an intent the data
shape does not implement.

The `Story` interface is nine required `readonly` fields: `slug`, `who`, `sector`,
`icon: IconName`, `headline`, `problem`, `built`, `result`, `evidenceNeeded`. **No date, no
metrics, no client name, no consent record, no images, no long-form body.** There is nothing
here that would support a detail page beyond what the card already shows. There is also **no
accessor function** — unlike `frontend/src/config/v2Services.ts:261` (`getServiceBySlug`).

Cards are **not links** — the slug is used only as a React `key` (`StoriesV2.tsx:41`). There
are **no filters** of any kind (no sector filter, search, sort, tabs, or query-param handling).
`STORIES.map()` renders all three in array order.

Separately: **`frontend/src/pages/CaseStudiesPage.tsx` (35 KB) still exists** and still
contains the fabricated Priya Nair / Marcus Bell studies. No route uses it, but
`frontend/src/routes/publicRoutes.tsx:8` still imports it — dead code behind an unused
import. Its cleanup is prescribed by the claims registry; see §0.7 and `PROOF_INTEGRATION.md`.

### 0.7 What proof rules already govern public claims?

**Two independent string unions govern this, and they are not the same taxonomy.** Confusing
them is the most likely modelling error in this build.

**(A) `EvidenceClass` — the UI badge taxonomy.**
`frontend/src/components/publicV2/Claim.tsx:23`:

```ts
export type EvidenceClass = 'verified' | 'anonymized' | 'illustrative' | 'pending';
```

Lowercase, four values. Labels at `Claim.tsx:25-30`, glyphs `✔ ◐ ◆ ◷` at `:33-38` —
deliberately text-plus-glyph, never colour alone.

**(B) `VerificationStatus` — the claims-registry governance taxonomy.**
`frontend/src/config/claimsRegistry.ts:26-46`:

```ts
export type VerificationStatus =
  | 'VERIFIED' | 'OWNER_ATTESTED' | 'NEEDS_VERIFICATION' | 'ILLUSTRATIVE' | 'DO_NOT_PUBLISH';
```

SCREAMING_SNAKE, five values, plus a second orthogonal gate `CapabilityStatus`
(`claimsRegistry.ts:48-56`) = `'live' | 'partial' | 'unbuilt' | 'n/a'`. The two gates are
deliberately independent (`claimsRegistry.ts:14-20`): *"a perfectly true sentence about an
unbuilt feature is still a false impression."*

Enforcement machinery: `PUBLISHABLE_VERIFICATION` = `['VERIFIED','OWNER_ATTESTED','ILLUSTRATIVE']`
(`:655-659`); `isPublishable()` (`:662-666`) additionally requires
`capability !== 'unbuilt' && approvedRoutes.length > 0`; `publicClaim(key, route?)` (`:679`)
returns `string | null` and the `<Claim>` component **renders nothing** when a claim may not
ship (`Claim.tsx:92-97`: *"There is deliberately no way to pass raw copy through this
component."*).

`<Metric>` (`Claim.tsx:139`) takes `evidence: EvidenceClass` as a **required prop with no
default**, so an unlabelled figure is a compile error (`Claim.tsx:122-125`).

Two registry entries bear directly on this build:

- **`surface.proof.room`** (`claimsRegistry.ts:585`) — *"Every proof record carries its
  evidence class and the evidence behind it."* `VERIFIED` / **`unbuilt`** /
  `evidenceSource: 'No evidence_class taxonomy in backend/src.'` **This build is what
  unblocks that claim.**
- **`casestudy.fabricated`** (`claimsRegistry.ts:598`) — `DO_NOT_PUBLISH`,
  `approvedRoutes: []`, with a prescribed cleanup at `:610`: *"Delete the component, purge the
  sitemap entry, remove it from the agent knowledge source."*

Full treatment in `PROOF_INTEGRATION.md`.

### 0.8 What admin auth path must be reused?

`backend/src/middlewares/` — **note the plural.** (`backend/CLAUDE.md` documents
`src/middleware/` singular; that directory does not exist. Documentation defect.)

Five recognised guards in `backend/src/middlewares/authMiddleware.ts`:
`requireAdmin` (`:58`), `requireSection(section)` (`:90`), `requireAnyAdmin` (`:121`,
identity endpoints only — **not** access control), `requireSalesOrAdmin` (`:141`),
`requireCoryAuthorized` (`:181`).

**A new admin route family needs TWO auth registrations, not one:**

1. A per-route guard (`requireAdmin` or `requireSection('<section>')`), and
2. a `PATH_SECTION` entry in `backend/src/middlewares/mgmtSectionGate.ts:21-41`.

`mgmtSectionGate` is applied globally at `backend/src/routes/adminRoutes.ts:96-101` and is
**deny-by-default for scoped mgmt roles** (`mgmtSectionGate.ts:58-92`). Without a
`PATH_SECTION` row, `/api/admin/case-studies` behaves like this:

| Identity | Result |
|---|---|
| legacy `admin` / `super_admin` | works |
| mgmt `owner` | works |
| mgmt `admin` | works (unmapped is allowed for the broad role) |
| mgmt `curriculum` / `revenue` / `admissions` / `support` / `community_organizer` | **403 on every call** |

Section keys are owned by `backend/src/services/access/mgmtRoles.ts:15-21`; the header
(`:1-10`) states the contract: *"Keep this list in step with the frontend `adminNav.ts`
section keys — the server is the authority."*

The CI guard `scripts/lint-route-auth.js` only scans `backend/src/routes/admin/` (`:18`) and
is a **substring check, not a per-route check** (`:19`, `:29-39`) — one guarded route in a
file satisfies it. It cannot see `mgmtSectionGate` at all.

On the frontend, a page with no entry in `frontend/src/components/Layout/adminNav.ts` is
**invisible in the sidebar for everyone and unreachable for a `sales` login**, because
`ProtectedRoute` (`frontend/src/components/ProtectedRoute.tsx:28-55`) resolves the path via
`sectionForPath()` (`adminNav.ts:117-126`), which returns `null` for an unmapped path.

### 0.9 What tenant/brand architecture exists?

**It exists. Spec §6.3's "if they do not exist" fallback does not apply.**

Present on `main`: `backend/src/models/Tenant.ts`, `Brand.ts`, `BrandDomain.ts`,
`TenantMembership.ts`, `LeadTenantContext.ts`, `TenantAccessAudit.ts`. A tenancy backfill
landed 2026-08-22 adding `tenant_id` to `LeadSource`, `EntryPoint`, `VisitorSession`,
`PageEvent`, `Campaign`, `Organization`, `OrgMember`, `EventLedger`, `FollowUpSequence`.

Resolution runs through `backend/src/modules/tenancy/tenantResolver.ts`:
`resolvePublicContext({ sourceSlug, pageUrl })` (`:182-195`) tries `lead_sources` by
lowercased slug (`:111`) → `brands` (must be active, `:84`) → `tenants` (must be active,
`:86`), falling back to `brand_domains` by hostname (`:132-160`, which yields **no**
`sourceId`). 5-minute / 500-entry FIFO TTL cache (`:44-68`). Every failure path swallows and
returns `null`.

Consequence for this build: `case_study_publications` carries a nullable `tenant_id` /
`brand_id` **alongside** the stable `surface_key`, not `surface_key` alone.

**The hard-won lesson attached to that tenancy work must be honoured.** Commit `feeae19a`
("Fix: the tenancy runtime was inert — nine models never declared their columns", PR #1714)
is the post-mortem: the DDL added `tenant_id`/`brand_id` to nine tables, every service read
and wrote them, but no model declared the attributes. **Sequelize only ever SELECTs, INSERTs
or UPDATEs attributes a model knows about.** `findOne()` never selected the column,
`update({tenant_id})` silently dropped the write, and every unit test still passed because
they all mock the models. The rule, stated at `backend/CLAUDE.md:46`: a new column needs the
attribute interface **AND** the Sequelize column definition **AND** the `declare` line —
*all three or the model is broken.* The guard that now exists is
`backend/src/db/__tests__/ensureMultiTenantSchema.modelParity.test.ts`, and it needs no
database.

---

## Part 1 — Public V2 marketing surface

### 1.1 Routing

V2 owns `/` since the 2026-08-13 cutover. All V2 routes are children of one
`<Route path="/" element={<PublicLayoutV2 />}>` at `frontend/src/App.tsx:68-111`:
`index → HomeV2`, `services`, `services/:slug`, `platform`, `proof`, `lab`,
`free-workspace`, `contact`, `privacy`, `start` (redirect), `pricing`, and
`stories → StoriesV2` at **`App.tsx:110`**. Child paths are declared **without** a leading
slash. Ordering is load-bearing — `App.tsx:55-67` carries a comment that this block must
stay above the legacy `<Route element={<PublicLayout />}>` block at `:112-114`.

`frontend/src/pages/publicV2/ServicesV2.tsx` is the slug-detail precedent: list page
`export function ServicesV2` at `:26`, detail `export function ServiceDetailV2` at `:115`,
both named exports from one file, imported together at `App.tsx:12`.

**No V2 route is lazy-loaded**, and that is deliberate. `frontend/src/pages/publicV2/proofV2.css:5-13`
records it as a *load-bearing* dependency: shared primitives (`.cbv2-grid--2`, `.cbv2-note`
in `servicesV2.css`; `.cbv2-card`, `.cbv2-lede`, `.cbv2-grid`, `.cbv2-section`,
`.cbv2-eyebrow` in `homeV2.css`) resolve only because all V2 stylesheets land in one bundle.
Lazy-loading a new route would silently break layout on other pages.

Six legacy paths redirect rather than 404 (`frontend/src/routes/publicRoutes.tsx:43-48`).
**Two of them land on Stories, not one:** `/case-studies` (`:44`) and `/demo-day` (`:45`).
Catch-all 404 at `:70`. Nginx is a plain SPA fallback (`nginx/nginx.conf:183`) — **no
server-level redirects exist**; all redirect logic is client-side React Router.

### 1.2 Layout, SEO, nav

`PublicLayoutV2.tsx:51-65` renders `cbv2-shell` → skip link → `<PublicHeaderV2 />` →
`<main id="cbv2-main">` with `<Outlet />` → `<PublicFooterV2 />` → `<ConsentBanner>`.
**The contract for a page component is a bare fragment of `<section>` elements** — no
`<main>`, no header, no footer, no wrapper div.

`SeoV2` (`frontend/src/components/publicV2/SeoV2.tsx`) accepts `{ title, description, route? }`
(`:33-38`) — and the `route` prop is **accepted but ignored**; the destructured signature is
`({ title, description })`. It sets `document.title` (suffix `| Colaberry Enterprise AI`
appended for you, `SEOHead.tsx:14`), `meta[description]` (**updates only, never creates** —
`SEOHead.tsx:16-19`), `og:title` / `og:description` / `og:url`, `link[rel=canonical]`
(`SeoV2.tsx:56-62`), and `meta[robots]` (`:64`, `PREVIEW_NOINDEX` is `false` at `:31`, so V2
is indexable).

**What it does NOT set:** no `og:image`, no `og:type`, no Twitter cards, no JSON-LD, no
`article:published_time`. A case-study detail page wanting rich previews or `CaseStudy`
schema.org markup needs `SeoV2` extended — this is a real gap. All meta handling is
client-side `useEffect` DOM mutation; there is no SSR or prerender.

Canonical derives from `location.pathname`, so `/stories/:slug` self-canonicalises with zero
extra work.

`V2_NAV` (`PublicHeaderV2.tsx:38-44`) is Services · Platform · Pricing · Proof · Start Free.
**`/stories` is not in the primary nav** — it is reachable only from the footer
(`PublicFooterV2.tsx:63`, "Builder stories" under the Proof group).

### 1.3 Sitemap

`frontend/public/sitemap.xml` is a **static, hand-maintained file. There is no generator
anywhere in the repo** — a repo-wide search for `sitemap` returns 10 files, none of which
generates one. Service detail pages are enumerated individually (`sitemap.xml:26-50`), so
per-story URLs would follow that precedent and each need a hand-written block. `/stories` is
present at `:66-70`. Redirect *sources* are deliberately excluded (`:2-14`).

**Pre-existing defect:** `frontend/public/robots.txt:3` points at
`https://www.colaberry.com/sitemap.xml` while the sitemap itself lists
`https://enterprise.colaberry.ai/*`. Crawlers are being sent to a sitemap on a different host.

### 1.4 Frontend API convention

The shared axios instance is `frontend/src/utils/api.ts` (52 lines): `baseURL` from
`REACT_APP_API_URL || ''` (`:3-8`), **no default timeout**, a request interceptor attaching
`Authorization: Bearer ${localStorage.admin_token}` only when present (`:18-24`) — so it is
safe for unauthenticated public calls — and a response interceptor routing 401/429/4xx/5xx
through a global toast handler (`:27-50`).

The preferred domain-module shape is a thin typed wrapper over that instance
(`frontend/src/services/capeApi.ts:17-47`): a header comment naming the backend schema file
that is the source of truth, one exported interface per response shape, one exported async
function per endpoint returning unwrapped `data`, and **no try/catch**.

**Only two V2 pages touch the network at all** — `OpportunityLabV2.tsx:117`
(`api.post('/api/leads', …)`) and `SignupV2.tsx`. `StoriesV2` and `ProofV2` make zero calls.
There is no `services/publicApi.ts` and no unauthenticated-public client module. A Case Study
OS with a backend is establishing a new pattern for the public site.

### 1.5 Design system

Plain global CSS imports plus CSS custom properties. **No CSS Modules, no Bootstrap on V2, no
CSS-in-JS.** Tokens are two-tier (raw ramps → semantic aliases) in
`frontend/src/colaberry/tokens/{colors,typography,spacing,fonts,base}.css`, imported once via
`frontend/src/colaberry/styles.css` at `frontend/src/index.tsx:23`. Product code references
**only the semantic layer** (`colors.css:93`). Class naming is BEM-ish under a `cbv2-`
namespace (`publicV2.css:8`: *"the cbv2-* namespace only, so it cannot leak into portal or
admin"*).

**Legacy trap:** `frontend/src/styles/tokens.css` is a second, older token system
(`--color-primary`, `--space-md`, `--cherry`, `--leaf`). `publicV2.css:5-6` explicitly
mandates `colaberry/tokens/*` for V2. Do not use the old names in a V2 stylesheet.

**Pre-existing CSS bug:** `storiesV2.css:12` declares `padding: var(--space-7)`, and
**`--space-7` does not exist** — the scale in `spacing.css:8-21` jumps 6 → 8. The declaration
is invalid and dropped, so the story card gets no padding from it.

### 1.6 Public V2 tests

Framework is CRA's built-in Jest via `react-scripts test`. `@testing-library/react` is **not
used anywhere in publicV2** — every publicV2 test uses `renderToStaticMarkup` from
`react-dom/server` plus `MemoryRouter`, with a per-file `html()` / `textOf()` helper pair
(canonical form at `ProofV2.test.tsx:20-27`).

`frontend/src/pages/publicV2/__tests__/` holds 8 files — Home, OpportunityLab, Platform,
Pricing, Proof, Services, Signup, Try. **There is no `StoriesV2.test.tsx`. Stories is the
only untested V2 page.** It is also currently absent from the `PAGES` array in
`linkIntegrity.test.tsx:58-70`, so its links are not dead-link-checked either.

---

## Part 2 — GitHub / Project subsystem

Covered in depth by `GITHUB_INTEGRATION_MAP.md`. The state facts that belong here:

- **There is no migration framework.** No `sequelize-cli`, no umzug, no `.sequelizerc`, no
  `backend/migrations/`, no `SequelizeMeta` table. The only directory named `migrations` is
  `backend/src/seeds/migrations` (seed data, not schema).
- `sequelize.sync()` is **off by default**, gated on `DB_BOOT_SYNC === 'true'`
  (`backend/src/server.ts:2726-2728`). Rationale in-file (`:2719-2725`): on a 215-model graph
  `sync({alter:true})` hits pre-existing index conflicts and never reaches later models. An
  ungated `sync(alter)` has previously OOM'd production Postgres. **Never turn this on.**
- The actual mechanism is **35 `ensure<X>Schema()` modules** in `backend/src/db/`, each
  exporting one async function running an array of idempotent raw SQL statements, imported at
  `server.ts:42-81` and awaited in explicit dependency order inside `start()`
  (`server.ts:2322`, running `:2346`–`:2549`). Canonical shape:
  `backend/src/db/ensureEvidenceSchema.ts` (67 lines).
- **Every statement is swallowed into a `console.warn`**, so *"it didn't throw" is not
  evidence the schema landed.* The repo learned this the hard way — a `DROP INDEX` against a
  constraint-backed index failed silently inside exactly this loop and shipped green having
  done nothing (`ensureWorkspaceRepoSchema.ts:16-22`). The only real safety net is a
  hand-written `assert<X>Schema()` that queries `information_schema` / `pg_indexes` /
  `pg_constraint` (`ensureSbpSchema.ts:204`), and **only ~4 of the 35 modules have one.**
- **`CREATE TABLE IF NOT EXISTS` is a no-op on an existing table** (`ensureSbpSchema.ts:221-225`),
  so on any database that already has the table, the `ALTER TABLE ... ADD COLUMN` statements
  are the only thing creating a new column. `REQUIRED_COLUMNS` is therefore checked separately
  from `REQUIRED_TABLES`.
- Adding a model is **three edits to `backend/src/models/index.ts`** (1720 lines): default
  import in the top block, associations in a labelled section (always declare both sides,
  always name the `as` alias), and the barrel export block starting at `:1173`.
- **There is no `Project ↔ GitHubConnection` association** anywhere. `models/index.ts:647-649`
  declares only the Enrollment side, and that `Enrollment.hasOne` is now factually wrong
  post-FR-037. `Project.findByPk(id, { include: 'githubConnection' })` is not available.
- Legacy DDL is inlined directly in `server.ts` for older tables (e.g.
  `runtime_portfolio_artifacts` at `server.ts:1906-1917`, `evidence_records` at `:1624-1637`).
  That is the legacy shape; the extracted `db/ensure*` module is the current one.

**Naming collision to record.** `PortfolioArtifact.kind` is a `VARCHAR(40)` whose **default
value is `'case_study'`** (`backend/src/models/PortfolioArtifact.ts:23`, DDL at
`server.ts:1910`), meaning "a student's case-study writeup artifact" — a learner deliverable,
not a published Case Study OS record.
`backend/src/services/runtime/portfolioService.ts:16-22` maps several card types onto that
kind. There is **no table collision** (new tables are `case_studies`, `case_study_*`), but a
future reader will trip over it. The rule: *a PortfolioArtifact may become a
`case_study_artifacts` row, but it is never itself a CaseStudy.*

---

## Part 3 — Evidence, artifacts, public sharing

### 3.1 `PortfolioArtifact` — what it does not have

Table `runtime_portfolio_artifacts`. 30-line model. Fields (`PortfolioArtifact.ts:19-28`):
`id`, `enrollment_id`, `card_id`, **`kind`** (`STRING(40)` default `'case_study'`), `title`,
`summary`, `content` JSONB, `competencies` JSONB, `created_at` (`updatedAt: false`).

- **The field is `kind`, not `type`.** There is no TS union, no PG enum, no CHECK constraint,
  and no central constant list. The eight observed literals are `case_study`,
  `prompt_library`, `architecture_doc`, `presentation`, `reflection`,
  `architecture_decision`, `build_artifact`, `field_guide`. The closest thing to a registry is
  `KIND_BY_TYPE` at `backend/src/services/runtime/portfolioService.ts:13-19`.
- **There are no visibility/status/approval fields at all** — no `status`, `visibility`,
  `is_public`, `published_at`, `approved_at`, `approved_by`, `share_token`, `slug`, or
  `version`. There is no approval workflow on the model; a row is created already-final.
- **There is no public-URL derivation.** Public exposure is one level up, on `Project`.
- **It is not exported from `models/index.ts`.** Every consumer imports the default directly,
  several of them *dynamically* inside the function
  (`backend/src/services/artifacts/artifactRepoSync.ts:185`) to keep model init out of
  test-only import graphs.
- **Latent defect:** four services enforce "one artifact per `(enrollment_id, card_id)`" with a
  `findOne` → `create` read-then-write (`runtime/runtimeService.ts:181`,
  `runtime/architectMindsetService.ts:172`/`:183`, `runtime/buildArtifactService.ts:124`,
  `runtime/fieldGuideService.ts:92`), but **there is no unique index on
  `(enrollment_id, card_id)`** — only `idx_portfolio_enrollment (enrollment_id)`. Two
  concurrent completions can produce duplicates.

### 3.2 Public sharing today — and what it teaches

The whole public read surface is `backend/src/routes/publicPortfolioRoutes.ts`, **27 lines**,
`GET /api/public/portfolio/:token`, mounted prefix-less at `server.ts:132`.

What is worth copying:

1. **Route file, not controller.** The path is declared **absolutely inside `router.get()`**.
   This repo has no portal/public route aggregator; every router mounts flat.
2. **No `router.use(<guard>)`.** See Part 5 mount-order constraint.
3. **Enumeration defence via a uniform 404** — identical response for "no such token" and
   "sharing disabled" (`publicPortfolioRoutes.ts:8-10`), implemented by folding
   `share_enabled: true` into the WHERE clause
   (`backend/src/services/portfolioShareService.ts:48`) so the service *cannot* leak the
   distinction.
4. **`error_class`-tagged errors map to status** — `err?.error_class === 'NotFoundError'` → 404,
   everything else → 500 with a **generic** message, never `err.message`. (The *authenticated*
   sibling at `backend/src/routes/projectRoutes.ts:475` does leak `err.message`.)
5. **Dynamic `await import()` of the service inside the handler**, the house style.

What must **not** be copied:

- **It sanitizes nothing.** `res.json(portfolio)` returns the whole `PortfolioResult`, including
  `project_metadata.project_variables` — a raw untyped JSONB blob
  (`backend/src/services/portfolioGenerationService.ts:38`, `:207`) — served straight to
  anonymous callers. A repo-wide search for `sanitize|toPublic|publicShape|redact` across
  `backend/src/routes/` returns only `admin/securityRoutes.ts` (GDPR erasure) and two
  unrelated comments. **There is no `toPublic()` / DTO / allow-list pattern in this repo. A
  sanitizer for the new API must be written, not reused.**
- **No Zod.** `req.params.token` is passed through as `req.params.token as string`.
- **No rate limiter**, though `express-rate-limit` is used on `leadRoutes.ts:17`,
  `trackingRoutes.ts:13`, and `explorerSignalRoutes.ts:34`.
- **No caching.** Every anonymous hit triggers a full multi-table read **plus a `gpt-4o-mini`
  call** (`portfolioGenerationService.ts:324-331`). `projects.portfolio_cache` exists but is
  never consulted by `generatePortfolio()` — it is written by `portfolioEnhancementService.ts:99-107`
  and read only by `mentorInterventionService.ts:295`. **It is not a cache in the serving path.**

The stronger composite template for a *new* public endpoint is
`backend/src/routes/explorerSignalRoutes.ts` (92 lines) — inline Zod, a **path-scoped** guard,
and a rate limiter that degrades to 204 under flood. Its header (`:44-46`) states the rule:
*"NEVER a bare `router.use(requireParticipant)` — that has caused two production outages here."*

### 3.3 Snapshot / versioning precedent — a strong one exists

`build_plans` (`backend/src/db/ensureSbpSchema.ts:102-122`) is the gold standard:
`version INTEGER`, `status VARCHAR(20)`, `plan_json JSONB`, `plan_sha256 VARCHAR(64)`,
`published_at TIMESTAMPTZ`, and a `UNIQUE (project_id, version)` index, with the in-file rule
*"Versions are immutable once written (FR-004): a regeneration is a new version, never an
overwrite."*

The hash utility to reuse rather than reinvent is `backend/src/services/sbp/planHash.ts`
(pure, 37 lines): `canonicalize()` recursively sorts object keys so serialization is
order-independent, then `hashPlan()` sha256s it. Its header (`:4-11`) explains why:
*"`savePlanDraft` records this hash and `publishPlan` re-checks it, which is what makes 'the
plan you reviewed is the plan that shipped' a checkable claim rather than an intention."*

The complementary discipline is `backend/src/services/sbp/buildProgressSnapshot.ts:1-25`:

> **NOTHING VOLATILE MAY LEAVE THIS MODULE.** Every field returned has to be stable while the
> build is stable — no `checked_at`, no run id, no "now".

### 3.4 Logging convention

**There is no shared logger utility.** No pino, no winston, no `backend/src/utils/logger.ts`.
~20 services declare a private `function log(...)`; only one is exported
(`backend/src/services/communityRooms/roomShared.ts:5-9`). The variant closest to root
`CLAUDE.md`'s Observability Framework — correlation id plus outcome — is
`backend/src/services/artifacts/artifactRepoSync.ts:92-102`. Correlation ids come from
`backend/src/utils/requestContext.ts` (`AsyncLocalStorage`, seeded by `traceMiddleware` at
`server.ts:97`); `ensureTraceId()` guarantees a non-null id even outside a request.

The route layer uses a **different, unstructured** form:
`console.error('[RouterName] METHOD /path error:', err.message)`.

### 3.5 Zod

**`zod ^4.3.6` — major version 4.** Errors are read via `parsed.error.issues`, **not**
`.errors`. `z.record()` takes **two** arguments (`z.record(z.string(), z.any())`).

**There is no validation middleware.** `backend/src/middlewares/` holds 16 files and not one
`validate*` / `zodValidate` module; a search for `validateBody|validateQuery|validateParams|zodValidate`
across `backend/src` returns zero hits. All ~60+ call sites are inline `Schema.safeParse(...)`.

Three patterns coexist: schema in `backend/src/schemas/` parsed at the route
(`backend/src/schemas/portfolioShareSchema.ts` + `projectRoutes.ts:486-487`); schema inline in
a newer route file (`explorerSignalRoutes.ts:49-66`, which returns the better 400 shape
`{ error, issues }`); and validation at the **service** boundary so every caller is covered,
not just HTTP (`backend/src/services/workLedger/workLedgerService.ts:53-59`, with a tagged
`WorkLedgerValidationError` carrying `error_class`).

---

## Part 4 — Visitor tracking and the lead journey

### 4.1 The models

`PageEvent` (`backend/src/models/PageEvent.ts`), table `page_events`, `timestamps: false`.
The column that decides this build:

```ts
// PageEvent.ts:79-82
event_type: {
  type: DataTypes.STRING(30),
  allowNull: false,
},
```

**It is a free string — not a Sequelize ENUM and not a Postgres enum type.** There is no
`.sql` DDL for `page_events` anywhere in the repo; the only DDL that touches it is
`backend/src/db/ensurePageEventLeadId.ts:28-35`, which adds `lead_id` plus two indexes and no
CHECK constraint. **No schema change is required to add `case_study_*` event types.** Two real
constraints apply instead:

1. **A 30-character ceiling.** `case_study_view` (15) is fine; `case_study_cta_click_bottom_v2`
   (30) is exactly at the limit.
2. **An application allowlist** — `VALID_EVENT_TYPES` at
   `backend/src/controllers/trackingController.ts:36-64`. `/api/t/event` returns **400** for
   anything not in that array (`validateTrackEvent`, `:165-182`). The in-file comment at
   `:61-62`, left by the last team to add a type, states the rule plainly: *the ingest rejects
   unknown types*. Appending to this array is a one-file, low-blast-radius edit.

`page_events.lead_id` is `INTEGER` nullable with **deliberately no FK** (`PageEvent.ts:75-78`,
comment at `:72-74`: the DDL omits it so Postgres never validate-scans this high-write table).

`Visitor` (`backend/src/models/Visitor.ts`) — PK UUID, `fingerprint` `STRING(64)` **UNIQUE**
(`:67-71`) is the natural key, `lead_id` INTEGER **with** an FK to `leads.id` (`:72-76`).
**No `tenant_id`/`brand_id` on Visitor, deliberately** — `visitorTrackingService.ts:195-197`:
*"Visitors stay global because one browser legitimately moves between ecosystem brands; the
brand relationship belongs to the session, not the browser."*

`Lead` (`backend/src/models/Lead.ts`) — **PK is INTEGER autoincrement** (`:134-138`), not UUID.
**No column on `leads` is a Sequelize ENUM.** Two gotchas: the default scope silently filters
`source = 'campaign_test'` unless `.scope('withTest')` is used (`:396-403`), and
`timestamps: false` (`:395`).

`Activity` (`backend/src/models/Activity.ts`) is the **one** place a new value needs a
migration — `type` **is** a hard Sequelize ENUM (`:43-56`) of
`note, email_sent, email_opened, call, meeting, status_change, score_change, sms, system`. If
this build writes activity rows, it must use `'system'` plus `metadata.activity_subtype`,
following the established `website_signal` pattern.

### 4.2 Ingest endpoints

All four are public, unauthenticated, and rate-limited (`backend/src/routes/trackingRoutes.ts:45-48`):
`POST /api/t/event` (100/60s), `/api/t/batch` (20/60s), `/api/t/heartbeat` (60/60s),
`/api/t/identify` (100/60s). **A rate-limit breach returns 204, not 429** — a silent drop by
design (`trackingRoutes.ts:19`, `:27`, `:37`). A global kill switch returns 204 immediately
when `!env.enableVisitorTracking`.

Client-settable fields are enumerated at `trackingController.ts:192-212`. Fields the client
may **never** set — `tenant_id`, `brand_id`, `source_id`, `entry_point_id`, `page_category`,
`ip_address` — are server-resolved only, with the reason stated at `:111-123`: *"A request
body may never name its own tenant — if it could, any visitor could write into any tenant's
data by editing one field."*

**Validation inconsistency (a real backdoor):** `handleTrackBatch` (`:317-440`) validates only
`fingerprint` and `events.length`; it **never calls `validateTrackEvent`** (`:340-347`,
`:403-421`). So `/api/t/batch` will persist any `event_type` string ≤ 30 chars while
`/api/t/event` rejects it. Since the SPA tracker picks its endpoint by buffer size
(`frontend/src/utils/tracker.ts:124` — single event → `/api/t/event`, 2+ → `/api/t/batch`),
skipping the allowlist edit produces a nondeterministic, timing-dependent drop. **Update the
allowlist regardless.**

### 4.3 Recording

`recordPageEvent()` (`visitorTrackingService.ts:218-297`) — **there is no event-level
deduplication.** Every accepted request inserts a row. No idempotency key, no unique
constraint, no "same type within N seconds" guard. Firing `case_study_view` on every React
re-render produces N rows. Client-side dedup exists only ad hoc (`firedThresholds` for scroll
at `tracker.ts:9`/`:147-150`; `markOncePerSession('form_start:enroll')` at
`frontend/src/pages/EnrollPage.tsx:85-89`). **Any new case-study event must bring its own guard.**

Cost per event is five sequential round trips (1 INSERT + 1 SELECT + 3 UPDATEs) with **no
transaction** — a partial failure leaves the event row written and the aggregates stale.
Sessionization adds an unindexed `findOne ... ORDER BY timestamp DESC` on the highest-row-count
table **once per tracking request** (`getOrCreateSession`, `:156-164`).

`pageview_count` and `visitors.total_pageviews` increment **only** when
`event_type === 'pageview'` (`:270-278`), so `case_study_*` events will not inflate pageview
counts.

### 4.4 Client-side tracking — two contradicted assumptions

**`frontend/public/v1/track.js` is NOT loaded on public V2 pages.** It is a standalone snippet
for *external* Colaberry-owned sites (`track.js:2-14`), hardcodes
`https://enterprise.colaberry.ai` (`:20`), requires a `data-site` attribute or it fatally
no-ops (`:29-42`), and is referenced by **zero HTML in this repo**. What the React app
actually uses is `frontend/src/utils/tracker.ts`.

**V2 tracking is consent-gated and off by default.** `PublicLayoutV2.tsx:39-49` starts the
tracker only when `trackingAllowed()` — `frontend/src/config/v2Consent.ts:90-92`, reading
`localStorage['cbv2_consent'] === 'granted'`. The default is `'unset'` → **no fingerprint, no
events**. A `denied` choice also purges `cb_visitor_fp`, `cb_lead_id`, `cb_utm_params`,
`cb_lid`, `cb_campaign_id`. The legacy `PublicLayout` still starts tracking unconditionally,
and `PublicLayoutV2.tsx:14-31` flags that asymmetry as a known pre-existing exposure, not an
oversight.

**Build implication:** case-study engagement data will be missing for every non-consenting
visitor. Any success metric must be scoped to consenting sessions, and any product logic that
*gates* on a case-study event must degrade gracefully when the tracker never started.

### 4.5 `event_data` — declared JSONB, never populated

`event_data` is `DataTypes.JSONB, allowNull: true` (`PageEvent.ts:99-102`). The plumbing does
not reach it.

**Producer side** — `frontend/src/utils/tracker.ts:76-84` spreads props at the **top level**
of the request body (`...props`), not into an `event_data` key.
**Consumer side** — `trackingController.ts:198` destructures `event_data` from `req.body` and
`:413` reads `event.event_data`.

**Proof it never connects:** `grep -rn "event_data" frontend/src` returns **zero hits**. For
every event the SPA tracker sends, `req.body.event_data` is `undefined` and
`page_events.event_data` is written `null` (`visitorTrackingService.ts:250`). A second-order
symptom confirms it: `backend/src/services/behavioralSignalService.ts:162` reads
`event_data?.depth_percent` while the tracker emits `depth` — a key mismatch that could never
have been observed working.

The only correct client is `packages/tracking-sdk/track-v2.js:110-115`, which is not wired
into this frontend.

**The de facto payload convention** (what consumers are written against): flat, snake_case,
scalar values, no nesting, accessed in SQL as `event_data->>'key'`. Real shapes:
`cta_click` → `{ element_text, href, data_track, is_cta }`; `scroll` → `{ depth, url }`;
`booking_modal_opened` → `{ dates_available, first_date, total_slots, has_prefill }`.

### 4.6 Where the journey is displayed

`GET /api/admin/leads/:id/journey` (`backend/src/routes/admin/leadRoutes.ts:80`,
`requireSalesOrAdmin`) → `handleGetLeadJourney`
(`backend/src/controllers/adminOpportunityController.ts:14-28`) → `getLeadJourney`
(`backend/src/services/journeyTimelineService.ts:427`), which fans out over nine tables. Note
the handler lives in `adminOpportunityController.ts`, not in `adminLeadController.ts` — which
is why name-based searching misses it.

The UI is `frontend/src/components/admin/JourneyTimeline.tsx`, and the good news is that it
**does not switch on `event_type` for labels** — it renders the server-supplied `event.title`
verbatim (`:293`) and colours the dot by `event.category` (`:289`). Page events are emitted as
`category: 'website'`, so `case_study_*` events appear with no frontend map edit.

`fetchPageEvents` has **no `event_type` predicate** (`journeyTimelineService.ts:144-148`), so
case-study events flow in automatically. Three caveats:

- **(a)** The title map is keyed by `event_type` (`:150-171`); unknown types render with the
  machine fallback at `:176` — `case_study_scroll_50 on /stories/foo`.
- **(b)** Stage classification (`:177-181`) defaults anything unlisted to `'awareness'`, then
  `inferStage()` (`:69-96`, applied at `:462`) only promotes on `metadata.page_category` being
  `enroll`/`contact`/`pricing`. **`page_category` is the lever** — which loops back to the
  defect in Part 6.
- **(c)** `limit: 200` with `order: ASC` (`:144-148`) takes the **oldest** 200 page events.
  Chatty case-study events can silently crowd out everything newer on a long-lived lead.

**Whitelists elsewhere that will silently drop `case_study_*`:**
`backend/src/routes/admin/cohortRoutes.ts:111` (the War Room feed — an `IN (...)` filter; this
is the one that will bite), `backend/src/services/contextGraphService.ts:136-139` (booking
counts, intentional), `backend/src/services/explorerGrowth/explorerSignalReader.ts:105-116`
(a `CASE` with `ELSE NULL`), and
`backend/src/routes/admin/visitorAnalyticsRoutes.ts:88-94` (funnel aggregates).

### 4.7 PII redaction

`backend/src/utils/piiRedaction.ts` is the only PII utility in the tracking path, and it is
**applied to logs only, never before persisting tracking data**. In the entire tracking path
there is exactly one call — `trackingController.ts:528`, redacting a name and email in a
console line. `recordPageEvent` applies **no redaction**; `event_data` is written to JSONB
verbatim.

**Build rule: never put raw user input into `event_data`.** Nothing will sanitize it. Emit
slugs, enum-like strings and numbers only.

---

## Part 5 — Admin, CI, deploy

### 5.1 Backend route registration

There is **no `backend/src/app.ts`**. The single entry point is `backend/src/server.ts`
(2,920 lines); `const app = express()` at `:85`. Every route file declares its **full** path
and is mounted prefix-less with `app.use(<router>)` — the only prefixed mount in the whole
file is `app.use('/preview', previewProxyMiddleware())` at `:108`.

**The hard constraint,** stated verbatim at `server.ts:138-145`:

> *"PUBLIC API routes — MUST stay mounted BEFORE adminRoutes. adminRoutes is mounted with no
> path prefix and chains many admin sub-routers that call `router.use(requireAdmin)` with no
> path scope. Because of that, any request that doesn't match an earlier route falls into
> adminRoutes and is 401'd ("Authentication required") by the first requireAdmin guard before
> it can ever reach these public routes. … DO NOT move these below adminRoutes."*

`app.use(adminRoutes)` is at **`server.ts:150`**. `publicPortfolioRoutes` is at `:132` and
`trackingRoutes` at `:148` — both deliberately above it.

**`/api/public/*` is not a convention in this repo.** Census of literal prefixes declared
across `backend/src/routes/**/*.ts`: `/api/admin` 1014, `/api/portal` 655, `/api/webhook` 8,
`/api/referrals` 7, `/api/chat` 6, `/api/v1` 5, `/api/t` 4, `/api/sponsor` 4 —
and **`/api/public` exactly 1**, at `publicPortfolioRoutes.ts:12`.

**The 401-masks-a-404 trap** is documented and has previously shipped as a bug
(`backend/src/routes/admin/organizationRoutes.ts:26-34`): *"a 401 does not prove a route
exists."* The mitigation is to read the router stack directly —
`backend/src/routes/admin/__tests__/organizationRoutes.paths.test.ts:36-70`. Copy that test
verbatim for any new route family.

### 5.2 Admin route family and nav

`backend/src/routes/adminRoutes.ts` is 197 lines of 92 imports plus 92 prefix-less
`router.use()` calls, preceded by `router.use(auditMiddleware)` and `router.use(mgmtSectionGate)`
(`:96-101`). Adding a family means one import line and one `router.use()` line here, plus the
`PATH_SECTION` entry described in §0.8.

On the frontend, `frontend/src/routes/adminRoutes.tsx` (153 lines) is three edits: a
`lazy()` import at the top, a `<Route>` inside the `<AdminLayout />` block, and **the list
route declared before the detail route** or `":id"` eats the list path (comment at
`adminRoutes.tsx:85-87`).

Nav lives in `frontend/src/components/Layout/adminNav.ts` (145 lines). **Icons are RemixIcon
names without the `ri-` prefix** (`adminNav.ts:4-5`, rendered as `` `ri-${link.icon}` `` at
`AdminLayout.tsx:13`). Bootstrap Icons are not the admin icon set.

The reference implementation to copy end-to-end is **Business Accounts** (shipped 2026-08):
`frontend/src/pages/admin/AdminBusinessAccountsPage.tsx` (281 lines) +
`AdminBusinessAccountDetailPage.tsx` (529) + `frontend/src/services/adminOrgApi.ts` (217) +
`backend/src/routes/admin/organizationRoutes.ts` (48) +
`backend/src/controllers/adminOrgController.ts` (170) +
`backend/src/schemas/adminOrgSchema.ts` (35).

One repo rule from that reference deserves restating, because it is stated in three separate
comment blocks: the empty-state cell is **three-state**, not two
(`AdminBusinessAccountsPage.tsx:185-203`) —

> *"'No business accounts yet' is a claim about the database and must not appear when the
> request failed."* (`adminOrgApi.ts:12-13`: *"the leads page shipped that bug and told an
> operator their database was empty when the request had simply failed."*)

`adminOrgApi.ts:210-217` exports `describeApiError(err, subject)`, which turns an axios failure
into an operator sentence and is the mechanism that makes the three-state cell possible.

### 5.3 Toolchain

Neither the root, backend, nor frontend `package.json` declares a `typecheck` script;
`tsc --noEmit` is invoked directly. Backend jest config lives in `backend/jest.config.ts`
(there is **no `jest` key in any package.json**), with a second `backend/jest.ci.config.ts`
adding `testPathIgnorePatterns` for 25 DB-touching suites.

**A test file MUST live under a `__tests__/` directory** or it is collected by nobody —
`jest.config.ts:7-13` records exactly that having happened to 5 suites / 117 assertions.

`transform` uses `isolatedModules: true` deliberately (`jest.config.ts:25-30`): full-graph
type checking pulls in 100+ models through the 1720-line `models/index.ts` and exhausts the
V8 heap. **`tsc --noEmit` is the type gate; jest is the runtime gate.**

**The false-clean trap:** root `node_modules/typescript` is **4.9.5** (hoisted by
`react-scripts@5.0.1`), while `backend/` and `frontend/` are **5.9.3**. Running
`npx tsc --noEmit` from the repo root reports a clean tree on code that TS 5.9 rejects.
Details and the correct commands are in `TEST_PLAN.md` §1 and `BASELINE_TEST_RESULTS.md`.

CI (`.github/workflows/ci.yml`) has six jobs: `backend-typecheck`, `frontend-typecheck`,
`frontend-build` (with `CI: 'true'`), `unit-tests` (`npx jest -c jest.ci.config.ts --ci`),
`guards` (secret scan + route-auth lint), and `security-scan` (report-only). **There is no
frontend unit-test job** — `frontend/src/__tests__/adminNavRbac.test.ts`, the test that guards
nav↔RBAC drift, never runs automatically.

`ci.yml:44-53` records why a build job exists on top of a typecheck:

> *"A typecheck is NOT a build. On 2026-08-15 commit 2f0a72dd left main unbuildable for hours
> with every check green: an eslint-disable comment in a .ts file named
> `react-hooks/exhaustive-deps`, a rule CRA does not register for .ts, which is itself an
> ESLint error — and CI=true promotes it to a failed build. tsc had nothing to say about any
> of it."*

**Playwright:** there is **no `playwright.config.ts`, no `.spec.ts` file, and
`@playwright/test` is not a dependency** — only `playwright: ^1.58.2`. `tests/systemV2/`
holds four plain Node scripts driven by raw `chromium`, run with `node <file>`, exiting 0/1/2.
Auth is by minting a JWT with the server's `JWT_SECRET` and injecting it into
`localStorage.admin_token` via `ctx.addInitScript` (`tests/systemV2/resolveWorkTabSmoke.e2e.js:43-58`).
`tests/CLAUDE.md` documents a config path, a `.spec.ts` naming rule, a `PLAYWRIGHT_BASE_URL`
env var and an `npx playwright test` command — **none of which exist in the repo.**

Production is four Docker services (`docker-compose.production.yml`, project name
`colaberry-accelerator`): `postgres`, `backend` (`expose: 3001`, **not published to the host**),
`intelligence`, `nginx` (`8888:80`). `nginx depends_on: backend`, which is why the documented
nginx deploy line carries `--no-deps`.

---

## Part 6 — Pre-existing defects this build inherits

These are **not** things the spec anticipated. They predate this build, they are load-bearing,
and smoothing them over would make Gate 7 dishonest.

### D-1 (BLOCKER for Gate 7) — the `case_studies` page category is unreachable in production

`backend/src/services/visitorTrackingService.ts:20` maps `'/case-studies'` → `'case_studies'`
in `categorizePagePath()`. But the canonical public route is **`/stories`**, with
`/case-studies` merely *redirecting* to it (`frontend/src/routes/publicRoutes.tsx:44`). A
redirect means the tracked `page_path` is `/stories`, which matches no entry in `categoryMap`
and falls through to `'other'` (`visitorTrackingService.ts:53`). **There is no `/stories` key
and no `/stories/` prefix rule** (the only prefix rules, at `:49-51`, are `/referrals`,
`/portal`, `/admin`).

**Six downstream consumers are therefore already dead code in production:**

| Consumer | What silently never fires |
|---|---|
| `backend/src/services/behavioralSignalService.ts:170` | the `deep_scroll_case_study` lead signal, **strength 20** |
| `backend/src/services/admissionsMayaService.ts:305` | Maya's "reviewing success stories" greeting |
| `backend/src/services/agents/admissions/admissionsPageContextAgent.ts:32` | the `case_studies` page-context branch |
| `backend/src/services/chatService.ts:73` | case-studies chat context |
| `backend/src/services/admissionsKnowledgeService.ts:104` | `case_studies` → `outcomes` knowledge routing |
| `backend/src/services/reporting/visitorFlowGraphService.ts:88` | the "Case Studies" node in the visitor flow graph |

**Remediation required in Gate 7:** add `'/stories': 'case_studies'` to the map **plus** a
`cleaned.startsWith('/stories')` prefix rule so `/stories/:slug` categorises too, proved with
a unit test on `categorizePagePath`. Keep the `/case-studies` key — a direct hit on the legacy
URL before the redirect resolves should categorise identically.

This is a fix to an existing function required to make the requested feature actually work,
not scope creep.

### D-2 — `event_data` is dead plumbing (§4.5)

Never populated by either in-repo client. The build must call
`trackEvent('case_study_view', { event_data: { … } })` explicitly, or the payload is silently
dropped. Fixing `push()` in `tracker.ts` would repair ~20 existing call sites at once but is a
behavioural change to the highest-traffic shared module in the system — assessed at Gate 0 as a
**governance escalation candidate**, logged separately, not folded into this build.

> **RESOLVED 2026-08-24 — this WAS folded in, deliberately, and the Gate 0 assessment above is
> superseded.** Recording the disagreement rather than editing it away, because the two artifacts
> genuinely disagreed and the reasoning matters more than the conclusion.
>
> The execution contract put this in scope as one of two named pre-existing fixes, on the grounds
> that Gate 7 cannot honestly claim "Case Study behaviour reaches the lead journey" while the field
> that behaviour travels in is `null` for every client event ever recorded.
>
> What changed the risk calculus is **how** it was fixed. The escalation concern was blast radius on
> a shared module. The implementation is strictly **additive**: the existing top-level property
> spread is retained — the ingest destructures `campaign_id`, `email`, `lid`, `timestamp`,
> `site_slug` and the browser fields from the body root, so removing it would have traded one silent
> loss for another — and `event_data` is added beside it, omitted entirely when empty so
> payload-free events keep writing `NULL` rather than `{}`. Nothing the server already read stops
> being read. That is a superset, not a behavioural change, and it does not meet CLAUDE.md's
> escalation bar.
>
> **A consequence worth knowing:** `deep_scroll_case_study` would still have been dead after the
> `categorizePagePath` fix alone. It reads `event_data.depth_percent` while the tracker emitted
> `depth` — a mismatch nobody could ever have observed, because `event_data` was `null`. The scroll
> push now emits both keys. Fixing only the page category would have left that signal dead while the
> acceptance criterion claimed it revived.

### D-3 — `/api/t/batch` does not validate event types (§4.2)

An unvalidated backdoor beside a validated front door. Makes allowlist omissions fail
*nondeterministically* rather than loudly.

### D-4 — the public read path sanitizes nothing (§3.2)

`project_metadata.project_variables`, a raw untyped JSONB blob, is served to anonymous
callers. Do not copy this shape.

### D-5 — `robots.txt` points at the wrong host (§1.3)

`frontend/public/robots.txt:3` → `https://www.colaberry.com/sitemap.xml`, while the sitemap
lists `https://enterprise.colaberry.ai/*`.

### D-6 — `PortfolioArtifact` is missing its dedup unique index (§3.1)

Four services enforce one-per-`(enrollment_id, card_id)` with a read-then-write race and no
supporting constraint.

### D-7 — `github_connections.access_token_encrypted` is not encrypted

Plain `TEXT` (`GitHubConnection.ts:103`), written verbatim from the OAuth exchange
(`githubIntegrationService.ts:51`) and read verbatim into an `Authorization: Bearer` header
(`:142`, `githubService.ts:119`). **The name is a lie.** The newer SBP path deliberately does
not use this column — `githubRepoClient.requireToken()` (`:46`) reads a single platform
`process.env.GITHUB_TOKEN` at call time and never persists it. **New work must use the
platform token, not the per-connection column.**

### D-8 — `syncFileTree` is enrollment-keyed on a project-keyed world

`backend/src/services/githubService.ts:107` resolves its connection via
`getConnection(enrollmentId)` → `findOne({ where: { enrollment_id } })` (`:46`), which selects
an **arbitrary** row now that `enrollment_id` is no longer unique. A live latent bug for any
enrollment with a second project.

### D-9 — webhook dedup covers only the last of five downstream calls

The delivery claim happens inside `handlePushForVerification` (call 5). Calls 1–4 in
`webhookRoutes.ts:107-126` run **before and outside** the dedup claim, so a GitHub redelivery
re-runs `syncStudentActivity`, `matchRecentCommitsToBPs` and `verifyRequirementsFromCommits`,
burning rate limit each time. The receiver also returns **200** where
`docs/BUILD_PIPELINE_GITHUB_SYNC.md` §5.2 specifies 202.

### D-10 — `frontend/src/pages/CaseStudiesPage.tsx` is fabricated content still on disk

35 KB containing the invented Priya Nair / Marcus Bell studies, unrouted but still imported at
`frontend/src/routes/publicRoutes.tsx:8`. Its cleanup is prescribed verbatim by
`claimsRegistry.ts:610`, and its `evidenceSource` (`:604-607`) records that
`backend/src/services/agents/admissions/admissionsKnowledgeSyncAgent.ts:25` **still ingests it as fact**. See `PROOF_INTEGRATION.md` §6.

---

## Part 7 — File index

| Concern | Path |
|---|---|
| V2 route table | `frontend/src/App.tsx:68-111` |
| Legacy redirects | `frontend/src/routes/publicRoutes.tsx:43-48` |
| Stories page / data / CSS | `frontend/src/pages/publicV2/StoriesV2.tsx`, `frontend/src/config/v2Stories.ts`, `frontend/src/pages/publicV2/storiesV2.css` |
| Evidence primitives | `frontend/src/components/publicV2/Claim.tsx` |
| Claims governance | `frontend/src/config/claimsRegistry.ts` |
| Layout / header / footer | `frontend/src/components/publicV2/PublicLayoutV2.tsx`, `PublicHeaderV2.tsx`, `PublicFooterV2.tsx` |
| SEO | `frontend/src/components/publicV2/SeoV2.tsx`, `frontend/src/components/SEOHead.tsx` |
| Sitemap / robots | `frontend/public/sitemap.xml`, `frontend/public/robots.txt` |
| Project model | `backend/src/models/Project.ts` |
| GitHub connection | `backend/src/models/GitHubConnection.ts` |
| Repo pointer oracle | `backend/src/services/projectRepoResolver.ts` |
| Canonical repo parser | `backend/src/services/sbp/repoConnect/repoReference.ts` |
| Hardened GitHub client | `backend/src/services/sbp/repoConnect/githubRepoClient.ts` |
| One-repo-per-project index | `backend/src/db/ensureWorkspaceRepoSchema.ts:42` |
| Evidence (progression) | `backend/src/models/EvidenceRecord.ts`, `backend/src/services/progression/evidenceEngine.ts` |
| Portfolio artifacts | `backend/src/models/PortfolioArtifact.ts`, `backend/src/services/runtime/portfolioService.ts` |
| Public read reference | `backend/src/routes/publicPortfolioRoutes.ts` |
| Better public template | `backend/src/routes/explorerSignalRoutes.ts` |
| Snapshot/hash precedent | `backend/src/db/ensureSbpSchema.ts:102-122`, `backend/src/services/sbp/planHash.ts` |
| Tracking ingest | `backend/src/controllers/trackingController.ts`, `backend/src/routes/trackingRoutes.ts` |
| Tracking service | `backend/src/services/visitorTrackingService.ts` |
| Journey | `backend/src/services/journeyTimelineService.ts`, `frontend/src/components/admin/JourneyTimeline.tsx` |
| Admin auth | `backend/src/middlewares/authMiddleware.ts`, `backend/src/middlewares/mgmtSectionGate.ts` |
| Admin nav | `frontend/src/components/Layout/adminNav.ts` |
| Server mount order | `backend/src/server.ts:91-150` |
| Schema convention | `backend/src/db/ensureEvidenceSchema.ts`, `backend/src/db/ensureSbpSchema.ts` |
