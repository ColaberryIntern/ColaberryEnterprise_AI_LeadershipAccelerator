# Migration Strategy

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

---

## 1. The working-tree rule (standing, and now twice-earned)

The multi-tenancy Gate 0 found the OneDrive checkout 2,586 commits behind `origin/main`
and missing three models its plan named as foundations. This Gate 0 found the same
checkout **2,722 commits behind**, missing every SBP module and every multi-tenancy
document the master plan names — **and containing one file, `buildPlanIngestService.ts`,
that exists nowhere on `main`.**

That last detail is the sharp edge. A plan written by reading the OneDrive tree would have
been designed around a service that has not existed for thousands of commits, and nothing
about reading it would have felt wrong.

**Standing rule for every gate of this plan:**

1. Before touching a file, run `git rev-list --left-right --count HEAD...origin/main`.
2. If the tree is behind, work in an external worktree off `origin/main`, outside OneDrive:
   `git worktree add C:/Users/ali_m/<slug>-wt -b <branch> origin/main`
3. Junction `node_modules` in to run `tsc`/`jest`; `cmd /c rmdir` them out afterwards
   (never `rm -rf` a junction — bash follows it and deletes the real directory).
4. Pin the TypeScript version explicitly. A bare `npx tsc` from `backend/` resolves 4.9.5
   and can report a false clean.
5. Commit only explicit paths. Other sessions share these trees.

---

## 2. Schema migration approach

There is no migration framework. 53 `ensure*Schema.ts` modules run idempotent raw DDL at
boot, because `sync({ alter: true })` once produced ~50k duplicate constraints and OOM-ed
Postgres.

### The module

**One** module — `backend/src/db/ensureRefactoredDeliverySchema.ts` — wired into
`server.ts` boot alongside the others.

### Non-negotiable properties

| Property | Why |
|---|---|
| **Additive only** | Zero drops, zero renames, zero retypes |
| **Zero `NOT NULL` on any existing column** | An existing row that suddenly violates a constraint fails the boot, and a failed boot is an outage |
| **Idempotent** | It runs on **every** boot, forever. Second run must be a no-op |
| **No FKs on write-hot tables** | The multi-tenancy work held this line on `page_events` / `visitor_sessions`; delivery event tables inherit it |
| **Rehearsed before arming** | See §3 |

### The one exception: C-02

`Organization.owner_enrollment_id` must go from `NOT NULL UNIQUE` to nullable and
non-unique. This is a **relaxation**, which is the safe direction — every existing row
keeps its value and its FK; only new rows may omit it.

It is still a change to a live production table, so it is a **governance escalation**
(root `CLAUDE.md`: "Database engine or schema redesign"). It does not proceed on Claude's
authority. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

---

## 3. Rehearsal, not hope

The multi-tenancy work set the standard and it should be matched exactly:

> Rehearsed on 2026-08-22 against a throwaway Postgres 16 loaded with a **structure-only
> dump of the live production schema** (373 tables). 69 statements applied cleanly, zero
> errors. Second identical run: zero errors, idempotent. No production data copied,
> nothing on the production database modified.

**Required before `ensureRefactoredDeliverySchema` is merged:**

1. Structure-only dump of the production schema into a throwaway Postgres.
2. Run the module. Zero errors.
3. Run it again. Zero errors, no duplicate objects.
4. Verify every new table and column exists.
5. Exercise each unique constraint **functionally** — insert the duplicate and confirm
   rejection. Inspecting a constraint is not the same as proving it fires.
6. Confirm no FK landed on a write-hot table.

Constraint 5 matters most for `delivery_evidence.idempotency_key`: it is the backstop for
master plan §15's "same execution callback ⇒ no duplicate evidence", and a unique index
that exists but does not fire is worse than none, because the code will trust it.

---

## 4. Backfill

**None required.** Every delivery table is new and starts empty.

The only data movement is optional and explicit: linking an existing student `Project`
into a delivery context creates a `delivery_project_source_links` row. That is a user
action, not a migration. Master plan §Gate 1: *"Do not destructively migrate existing
student projects."*

`backfillTenancy.ts` already backfills `tenant_id`/`brand_id` on `organizations`; delivery
inherits that work rather than repeating it.

---

## 5. Rollout sequence

```
PREREQUISITE  Organization tenant scoping (multi-tenancy Gate 5)  ── blocks Gate 1  OPEN
DECIDED ✅    C-02 (Organization.owner_enrollment_id) — Option A   2026-08-23
PREREQUISITE  E-01 decision (Claude Code SDK dependency)          ── blocks Gate 8  OPEN
PREREQUISITE  S-01 decision (execution isolation model)           ── blocks Gate 8  OPEN

Gate 1   schema module + models, shipped dark (no routes)
Gate 2   delivery roles, shadow-logged first (ApprovalRequest.shadow_logged)
Gate 3   contract + graph
Gates 4-7 intake, trust, design, story graph — still no execution
Gate 8   execution plane — only after E-01 and S-01
Gates 9-15
```

Two properties of this ordering:

- **Gate 1 ships dark.** Tables exist, nothing routes to them. If anything is wrong, the
  blast radius is an unused table.
- **Gate 2 ships shadow-logged.** The authorization model records what it *would* have
  decided before it decides anything. This is not a novel idea here — `ApprovalRequest`
  already has the `shadow_logged` status for exactly this.

---

## 6. Prerequisite detail: Organization tenant scoping

`orgService.ts` and `adminOrgService.ts` contain **zero** `tenant_id` references. The
multi-tenancy work deferred this deliberately and said so, on the reasoning that every
organization today is Colaberry Enterprise.

That reasoning expires the moment this plan creates an AI Flotation client org. The
deferral was correct; continuing it while introducing a second tenant's organizations
would be a cross-tenant read path — item 4 in
[DATA_OWNERSHIP_MATRIX.md](DATA_OWNERSHIP_MATRIX.md) §Cross-tenant read paths.

**Scope:** add tenant scoping to both services, with the isolation tests the multi-tenancy
work already established as the pattern (AI Flotation cannot see CPN; CPN cannot see
Colaberry; brand admin cannot escape tenant; superadmin access audited).

This is work in **another workstream's** area. It should be raised with whoever owns the
multi-tenancy branch rather than absorbed silently here — master plan §Gate 1 lists it as
a prerequisite, not as this plan's deliverable.

---

## 7. Rollback

| Stage | Rollback |
|---|---|
| Gate 1 (dark tables) | Leave them. Empty additive tables cost nothing and dropping them is riskier than keeping them |
| Gate 2 (shadow) | Stop reading the verdicts. No enforcement to unwind |
| Gate 2 (enforcing) | Revert to shadow via config, not via deploy |
| Gates 3-7 | Feature-flag the route tree off. Data persists harmlessly |
| Gate 8 | Cancel in-flight runs, disable the provider. Ephemeral workspaces are destroyed by design |
| C-02 | **Not cleanly reversible** — re-adding `NOT NULL UNIQUE` fails if any client org exists. This is why it is an escalation |

---

## 8. Retention

Master plan §13 requires these be defined separately rather than defaulting to "keep
everything". Initial position, confirmed at Gate 13:

| Class | Retention |
|---|---|
| Raw worker event stream | Days |
| Normalized execution summary | Life of project |
| Test logs | 90 days, or life of the release if it gated one |
| Screenshots / visual diffs | Life of the release they evidence |
| Approvals / acceptances / decisions | **Permanent** |
| `tenant_access_audits` | Permanent, append-only |
| Ephemeral workspace | Destroyed at end of run. Never retained |

Durable proof outlives ephemeral execution logs.
