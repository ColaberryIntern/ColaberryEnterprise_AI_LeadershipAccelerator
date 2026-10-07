# Phase 4 handoff

**Created:** 2026-10-06 (P4-T6) · **Session:** CC-20261001-q7m4 · P4-T7 completes the walkthrough.

---

## 1. The one thing in Phase 4 that reaches production on the next deploy

**Two new tables. Nothing else.** Everything else Phase 4 built is pure functions with no
production caller yet — `grep` finds zero importers outside tests — so its blast radius today is
zero. The DDL is the exception, and it is **not dark**.

`verifyProjectLifecycleSchema.ts` records why: a boot-registered `ensure*Schema` runs on the next
backend deploy by **any** session, regardless of `ENABLE_PROJECT_LIFECYCLE`. So the tables arrive
whether or not anything is switched on.

**And the boot loop only `console.warn`s.** `ensureProjectLifecycleSchema` catches every statement
error and logs it; it never throws, because a boot that dies on a DDL hiccup is worse. The
consequence is that **a failed migration is silent.** That is the whole reason step 2 exists.

Expected post-deploy state: both tables present and **empty**. Nothing writes to them until
Phase 5 or 6.

---

## 2. REQUIRED post-deploy step, for whoever next deploys

Run this on the backend container after the deploy that carries this code:

```
npx ts-node src/scripts/verifyProjectLifecycleSchema.ts
```

**Pass condition: exit 0**, with every table, every index and every constraint present. The script
prints one structured JSON line, so paste it into the deploy record verbatim rather than
summarising it. A pass looks like:

```json
{"outcome":"success","context":{"tables":"7/7","indexes":"8/8","constraints":"6/6",
 "tables_missing":[],"indexes_missing":[],"constraints_missing":[]}}
```

**Do not skip this because the deploy looked fine.** The deploy will look fine either way — that
is what warn-only means. The script is read-only (SELECTs against `information_schema` and
`pg_indexes`), writes nothing, and is safe against production, which is the point.

**If it exits 1** it names each gap and prints a remedy: re-run `ensureProjectLifecycleSchema`,
which is idempotent, then re-run the script. The failure mode to care about most is a missing
index, because `indexes_missing` is the only place it shows up — a missing unique index does not
surface as an error, it surfaces later as two rows that both claim to be true.

### Why indexes and not just tables

Measured, not assumed: the LC-13 concurrency suite proved against a real Postgres that with
`uq_blueprint_approval_revision` dropped, two concurrent approvals of the same revision write
**two** rows; with it present, one. The application-level check is a read-then-compare and does not
close the race alone. A table-only check would report a healthy schema over a reopened incident.

Phase 4 added two more names to that list for the same reason — see §4.

---

## 3. What was verified before this handoff, and where

Against a throwaway Postgres 16 container, not against production:

| check | result |
|---|---|
| `ensureProjectLifecycleSchema()` on an empty database | both tables, both indexes, all three constraints created |
| the same function run **again** | no-op; row counts unchanged |
| `verifyProjectLifecycleSchema.ts` | exit **0**, `tables 7/7, indexes 8/8, constraints 6/6` |
| **negative control** — drop `uq_design_decision_approved_tier`, re-run | exit **1**, naming that index |
| model round trip through `BlueprintDesignDecision` / `BlueprintVisualContract` | write and read back, JSONB arrays intact |
| the partial index, the revision index, and both CHECK constraints | each proven by a write that was **refused**, with the assertion naming the constraint that fired |

The negative control is the part worth keeping: without it, "exit 0" only means the script ran.

**Phase 4 does not deploy**, so it cannot run step 2 — which is why step 2 is written as an
obligation here rather than claimed as done.

---

## 4. The two new names in the assertion lists, and why each is load-bearing

- **`uq_design_decision_approved_tier`** — at most one APPROVED design decision per
  (tenant, manifest, tier). **PARTIAL**, on `status = 'approved'`. `deliveryDesignLoop` is built on
  "supersession, never silent overwrite", so many rows per tier over time is correct and many
  *approved* rows is not. A full unique index would forbid supersession; no index would let two
  rows both claim to be what was agreed.
- **`uq_visual_contract_decision_revision`** — one contract per (tenant, decision, revision). §4.5
  requires the approval record to reference a contract revision, and a reference that resolves to
  two rows is not a reference.

Plus three CHECK constraints: the two JSONB-array shapes, and `acceptable_variance` bounded to
0..1 — outside that range the visual diff passes every screen or fails every screen depending on
which default someone picked, and nothing errors.

---

## 5. Rollback

Two empty additive tables with no writer. **Reverting the code leaves them in place harmlessly**,
which is the documented forward-compatible posture — an unused table costs nothing and dropping
one that something later wants is worse.

If they genuinely must go, `DROP TABLE` is safe **only while `SELECT count(*)` is 0 on both**.
Check it, do not assume it:

```sql
SELECT count(*) FROM blueprint_design_decisions;
SELECT count(*) FROM blueprint_visual_contracts;
```

The two models are new files; reverting them and their two lines in `models/index.ts` restores
today's state exactly.

---

## 6. What Phase 4 did NOT establish

Stated here so the next phase does not inherit a false impression from a passing test suite.

- **Nothing a human can click.** Every design "journey" is a declared path over a structure. There
  is no surface until Phase 5, and §4.5 itself says a screenshot alone would not establish
  usability either.
- **No approval invalidation.** Selecting or revising a design does not invalidate approvals,
  because nothing in production writes `manifest.refs_json` and no material-vs-cosmetic classifier
  exists. Deferred with its three parts named in `carried-forward-obligations.md`.
- **`controlSurfaceExists()` has no production call site.** The design brief consumes a boolean of
  the same name that nothing supplies yet; the wire closes in the phase that builds the
  design-stage orchestrator, and no gate type-checks the hand-mirrored shape between them.
- **Six design-system token pairs fail WCAG AA for normal text**, two of them in the repo's own
  four-state status family. Phase 4 constrains only itself, via an allow-list; the token file
  belongs to whoever owns it, and the finding is in the register.
