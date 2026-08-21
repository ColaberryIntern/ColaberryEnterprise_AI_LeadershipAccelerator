# Implementation Status

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded` · **Branch:** `workstream/multi-tenant-ecosystem`

Status vocabulary: `NOT STARTED` · `DISCOVERY` · `IMPLEMENTING` · `TESTING` · `BLOCKED` · `COMPLETE`

---

## ⚠️ Sequencing note — read this first

The instruction to **execute Gate 0 only, and hold before building** arrived after Gates
1 through 6 had already been implemented in this session. Rather than discard working,
tested code, the work has been split into two commits on this branch so the intended
review order is still available:

| Commit | Contents | State |
|---|---|---|
| 1 | **Gate 0 only** — the ten discovery documents | **This is the safety check. Review this first.** |
| 2 | Gates 1-6 implementation | **Parked. Not merged, not deployed, not enabled anywhere.** |

Nothing has been merged to `main`. Nothing has been deployed. No DNS has been pointed. No
migration has been run against any database — `ensureMultiTenantSchema()` is wired into
boot but this branch has never been booted anywhere, and no backfill has been executed.
Commit 2 can be dropped with `git reset --hard HEAD~1` on this branch and the Gate 0
maps survive intact.

The recommendation that produced this note is a good one, and the reason it is good is
visible in D-01: the discovery pass caught that the working tree was 2,586 commits stale
and missing three models the plan names as foundations. That check is exactly what Gate 0
is for, and it should be reviewed on its own before the migration is blessed.

---

## Gate 0 — Discovery

**Status: COMPLETE** — this is the deliverable for review.

| Item | Evidence |
|---|---|
| Repo rules read | root + backend/frontend/tests/directives/system `CLAUDE.md` |
| Current state | `CURRENT_STATE.md` |
| Dependency maps | `DEPENDENCY_MAP.md`, `TRACKING_DEPENDENCY_MAP.md`, `CAMPAIGN_DEPENDENCY_MAP.md` |
| Data ownership matrix | `DATA_OWNERSHIP_MATRIX.md` |
| Route impact matrix | `ROUTE_IMPACT_MATRIX.md` |
| Extraction boundaries | `EXTRACTION_BOUNDARIES.md` |
| Backfill map | `MIGRATION_BACKFILL_MAP.md` |
| Test matrix | `TEST_MATRIX.md` |
| Baseline tests | `BASELINE_TEST_RESULTS.md` — tsc clean, 77/77 targeted tests pass |
| Deviations | `IMPLEMENTATION_DEVIATIONS.md` — 11 recorded (D-01 … D-11) |
| Target architecture | `TARGET_ARCHITECTURE.md` — 10 Mermaid diagrams |

**The four findings that should drive the review:**

1. **D-01** — the OneDrive checkout was 2,586 commits behind `origin/main` and did not
   contain `Organization.ts` / `OrgMember.ts` / `OrgCohort.ts` at all. Work moved to a
   clean worktree from `origin/main`.
2. **D-02** — there is no migration framework. 32 `ensure*Schema.ts` modules of idempotent
   raw DDL, because `sync({alter:true})` once produced ~50k duplicate constraints and
   OOM-ed Postgres.
3. **D-03** — `leads.id` is an INTEGER autoincrement while everything else is UUID. Mixed
   key types in the new tables are unavoidable and deliberate.
4. **D-05** — 17 of the 18 campaign tables are strict children of `campaigns` and should
   scope by join, not by their own `tenant_id`. The plan's literal reading would mean 17
   backfills and 17 drift risks.

---

## Gate 1 — Schema Foundation

**Status: COMPLETE (parked in commit 2, awaiting Gate 0 sign-off)**

9 models, 1 DDL module, `models/index.ts` wiring, `server.ts` boot call, declarative seed
data, idempotent seeder. Additive only: 9 new tables, nullable columns on 9 existing
tables, zero drops/renames/retypes, zero `NOT NULL` on existing columns.

## Gate 2 — Context Services

**Status: COMPLETE (parked)**

`tenantRoles`, `tenantResolver` (bounded TTL cache), `tenantAuthorization`,
`leadContextService`, `platformIdentityService`, `journeyLinkService`.

## Gate 3 — Tracking + Attribution

**Status: COMPLETE (parked)**

Server-side context resolution wired into `trackingController` (event + batch),
`visitorTrackingService` (session + page event), and `leadIngestionService`. Fail-soft
throughout; `tenant_context_unresolved` emitted on every miss.

## Gate 4 — Campaign Tenancy

**Status: PARTIAL (parked)**

Done: `senderProfileService` — 4-step resolution ramp, fail-closed preflight,
cross-brand rejection, provider metadata.
**Not done:** `schedulerService` is not yet switched onto the resolver, and the Mandrill
webhook does not yet restore tenant context. Both are deliberate — they touch the live
sending path and should not move before the Gate 0 review.

## Gate 5 — Organization / Account Context

**Status: PARTIAL (parked)** — schema columns exist; `orgService`/`adminOrgService` are
not yet tenant-scoped.

## Gate 6 — Skeleton Applications

**Status: COMPLETE (parked)**

Three apps, three shared packages, boundary validator. All three build independently;
validator verified to **fail** on a planted violation, not merely to pass.

## Gate 7 — Full E2E

**Status: NOT STARTED**

Unit + integration: 137/137 pass, tsc clean. Playwright ecosystem suite is **not
executed** (D-10) — no running stack or staging credentials in this environment.

## Gate 8 — Deployment

**Status: NOT STARTED and deliberately not attempted.** No DNS pointed, nothing deployed,
plan §61/§62 respected.
