# Implementation Status

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded` · **Branch:** `workstream/multi-tenant-ecosystem`

Status vocabulary: `NOT STARTED` · `DISCOVERY` · `IMPLEMENTING` · `TESTING` · `BLOCKED` · `COMPLETE`

---

## Sequencing note

Gate 0 was produced and committed on its own so it could be reviewed as the safety check
before the migration. It was, and the build was **unparked on 2026-08-22** on Ali's
instruction. Work has continued since.

The reason the hold was worth honouring is visible in D-01: the discovery pass caught
that the working tree was 2,586 commits stale and missing three models the plan names as
foundations. That is what Gate 0 is for.

**Still true:** nothing has been deployed, no DNS has been pointed, and no backfill has
been executed against real data.

## Schema rehearsal — the DDL has now been run against a real database

The one genuine unknown in this work was that `ensureMultiTenantSchema()` had never
executed anywhere. Merging arms it for the next production boot, so it was rehearsed
first, on **2026-08-22**, against a throwaway Postgres 16 loaded with a
**structure-only dump of the live production schema** (373 tables). No production data
was copied and nothing on the production database was modified.

| Check | Result |
|---|---|
| All 69 statements against the real prod schema | **applied cleanly, zero errors** |
| Second identical run (boot executes this every time) | **zero errors, idempotent** |
| 10 new tables created | all present |
| 20 additive columns on 9 existing tables | all present, all nullable |
| Foreign keys on new columns of `page_events` / `visitor_sessions` | **none** — the write-hot policy held |
| Pre-existing `page_events` FKs | untouched (`session_id`, `visitor_id`) |

Two constraints were exercised functionally rather than merely inspected:

- inserting a second `lead_tenant_contexts` row for the same `(lead, tenant, brand)` is
  **rejected** by `lead_tenant_contexts_lead_tenant_brand_unique` — this is the
  idempotency backstop for the whole lead-context pipeline;
- inserting a second default sender profile for one brand is **rejected** by
  `sender_profiles_one_default_per_brand` — two defaults is not a preference, it is a
  coin flip at send time.

The only errors during restore were the `vector` extension being unavailable in the
stock Postgres image, which is unrelated to this work.

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

**Status: COMPLETE**

**10** models, 1 DDL module, `models/index.ts` wiring, `server.ts` boot call, declarative
seed data, idempotent seeder. Additive only: **10** new tables, nullable columns on 9
existing tables, zero drops/renames/retypes, zero `NOT NULL` on existing columns.

The tenth table is `tenant_access_audits`, added for DEC-05 (below).

---

## DEC-05 — CPN isolation as a formal compliance requirement

**Status: COMPLETE**

Ali confirmed on 2026-08-21 that CPN's data isolation is a grant and donor commitment,
not merely good practice. That raised the bar past enforcement: a control that silently
works produces no evidence it worked, and the **refusals** are the evidence.

| Requirement | Delivered |
|---|---|
| Audit trail of every boundary decision, denials included | `tenant_access_audits` (append-only, no FKs so it outlives what it describes, no `updated_at`), `tenantAccessAudit.ts`, audited guards in `tenantAccessGuards.ts` |
| Written evidence an auditor can read | `ISOLATION_EVIDENCE.md`, **generated by running the tests**, never hand-written |

Three properties the tests lock in:

1. **The row is written before the error is thrown.** A denial that throws first loses
   its record the moment anything upstream swallows the exception.
2. **The audit can never change an outcome.** An unreachable audit table degrades to
   "enforced but unevidenced", loudly logged, and never to "allowed because bookkeeping
   broke".
3. **Cross-tenant superadmin access is recorded on the allowed path too.** "Who looked
   across tenants, and when" is the other half of what a funder asks.

**Still open, and not ours to answer:** whether any scholarship applicants are minors.
That carries retention and consent obligations independent of tenant isolation.

## Gate 2 — Context Services

**Status: COMPLETE**

`tenantRoles`, `tenantResolver` (bounded TTL cache), `tenantAuthorization`,
`leadContextService`, `platformIdentityService`, `journeyLinkService`.

## Gate 3 — Tracking + Attribution

**Status: COMPLETE**

Server-side context resolution wired into `trackingController` (event + batch),
`visitorTrackingService` (session + page event), and `leadIngestionService`. Fail-soft
throughout; `tenant_context_unresolved` emitted on every miss.

## Gate 4 — Campaign Tenancy

**Status: COMPLETE**

`senderProfileService` (4-step resolution ramp, fail-closed preflight, cross-brand
rejection, provider metadata), `schedulerService` switched onto the resolver, and the
Mandrill webhook restoring tenant/brand/sender-profile from provider metadata.

Two deliberate safety decisions in the send path:

- **Preflight gates ecosystem-brand sends only.** Applying it to the existing Colaberry
  pipeline would stop today's mail dead: those campaigns have no sender profile and no
  verified domain row, so every one would fail a check describing a state they were
  never migrated into. A campaign that has been given a profile has opted in.
- **Resolver faults degrade to today's behaviour**, except a cross-brand sender profile,
  which is re-thrown. Sending CPN mail over the AI Flotation envelope is a forgery, and
  falling back silently would produce exactly that.

The webhook reads the new metadata keys defensively and stores them alongside the
existing fields. Messages sent before this change are still in flight and still
generating opens weeks later; they carry only the old shape and must keep resolving.

## Gate 5 — Organization / Account Context

**Status: PARTIAL** — schema columns exist and are backfilled by
`backfillTenancy.ts`; `orgService`/`adminOrgService` are not yet tenant-scoped. Deferred
deliberately: the platform is single-tenant for organizations today (every existing org
is Colaberry Enterprise), so scoping them changes no behaviour until a second tenant
actually owns one. It is listed here rather than quietly dropped.

## Gate 6 — Skeleton Applications

**Status: COMPLETE**

Three apps, three shared packages, boundary validator. All three build independently;
validator verified to **fail** on a planted violation, not merely to pass.

## Gate 7 — Full E2E

**Status: COMPLETE for the ecosystem isolation suite** (2026-08-24). D-10 is closed.

Unit + integration: **196/196 passing across 16 suites**, backend `tsc --noEmit` clean.
Tenant-isolation evidence generated from real test output: **73 checks, 0 failures** —
see [ISOLATION_EVIDENCE.md](ISOLATION_EVIDENCE.md).

`ecosystemIsolation.e2e.js` has now been **executed against the dev stack: 11/11 checks,
exit 0**, and the resulting rows were verified directly in `accelerator_dev1` rather than
trusted from the exit code. One canonical lead carries two brand relationships
(`cpn/scholarship_interest`, `ai-flotation/workflow_intake`), and the hostile body's
claimed tenant is stored nowhere — 0 rows.

**The first execution found three defects that 196 passing unit tests could not**, which
is the whole argument for the gate: two brands could not capture a lead at all because no
seeder ever created their `lead_sources` rows; the spec posted to a route that does not
exist; and its most important assertion was testing the verbatim raw-payload echo rather
than what the server resolved, so it failed while the system was correct. All three are
fixed. Detail in [TEST_MATRIX.md](TEST_MATRIX.md).

**Still not executed:** the browser-level journey specs in the table in TEST_MATRIX.md
(CPN / AI Flotation / Refactored skeleton journeys, admin context switch). Those need the
skeleton apps served somewhere; the isolation suite covers the API boundary they sit on,
but they are not the same thing and are not being reported as done.

## Gate 8 — Deployment

**Status: NOT STARTED and deliberately not attempted.** No DNS pointed, nothing deployed,
plan §61/§62 respected.
