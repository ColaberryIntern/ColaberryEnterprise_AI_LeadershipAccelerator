# Phase 4 handoff

**Created:** 2026-10-06 (P4-T6) · **Session:** CC-20261001-q7m4 · P4-T7 completes the walkthrough.

---

## 1. The one thing in Phase 4 that reaches production on the next deploy

**Two new tables. Nothing else.** Everything else Phase 4 built is pure functions with **no
production entry point**, so its blast radius today is zero. The DDL is the exception, and it
is **not dark**.

Stated precisely, because an earlier version of this line said "`grep` finds zero importers
outside tests" and that is false — the modules import each other. Measured 2026-10-06:

| module | non-test importers | all of them inside `lifecycle/generation/`? |
|---|---|---|
| `workspaceBindingTypes.ts` | 5 | yes |
| `workspaceBindingChecks.ts` | 3 | yes |
| `workspaceMapping.ts` | 1 | yes |
| `designAlternatives.ts` | 1 | yes |
| `designSelection.ts` | 0 | — |
| `workspaceStateChecks.ts` | 0 | — |
| `controlSpecification.ts` | 0 | — |

**Nothing outside that folder imports any of it**, and no route, controller, service or job
calls any of it. That is the claim that matters for blast radius, and it is a different claim
from "zero importers".

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
| the partial index, the revision index, and **all three** CHECK constraints | each proven by a write that was **refused**, with the assertion naming the constraint that fired |
| **every operand of the two compound CHECKs** | one isolating control each; deleting any single conjunct fails exactly one NAMED test |
| a THIRD operand found afterwards — `acceptable_variance IS NULL` | **removed, not tested.** A Postgres CHECK whose expression evaluates to NULL is SATISFIED, so that disjunct could not change any answer. Amendment 4 category 2. Removal proven behaviour-preserving at 12/12 on a fresh database, NULL-variance insert included |

The negative control is the part worth keeping: without it, "exit 0" only means the script ran.

**An earlier version of this table said "both CHECK constraints" while §4 said three — and the
third was the one with no behavioural test at all.** A verifier found it by deleting one
conjunct of `ck_visual_contract_regions_is_array` and watching 67 of 67 tests still pass. That
miscount is exactly what concealed the gap from this document, which is why the count is now
spelled out and the per-operand row is above.

Mutation evidence, each applied to a **fresh** database so the mutated DDL is what gets created
(against the seeded one `CREATE TABLE IF NOT EXISTS` is a no-op and the mutation is inert):

```
baseline on a fresh database                    12/12
delete the required_actions conjunct            11/12  OPERAND 2 of 2: a non-array required_actions is refused...
delete the required_regions conjunct            11/12  OPERAND 1 of 2: a non-array required_regions is refused...
delete `acceptable_variance >= 0`               11/12  OPERAND 1 of 2 on the variance range: a NEGATIVE variance is refused
delete `acceptable_variance <= 1`               11/12  the variance CHECK refuses a value outside 0..1...
SURVIVORS: none
```

**That table said "SURVIVORS: none" and a verifier then found one.** The variance CHECK had a
THIRD operand I had not counted — `acceptable_variance IS NULL` — and deleting it left 12/12.
It is inert rather than untested: a Postgres CHECK whose expression evaluates to NULL is
satisfied, so a NULL variance passes without that disjunct being there at all. Amendment 4 has
a category for exactly this and the remedy is deletion, not a test that cannot fail. Removed,
and the removal is proven behaviour-preserving at 12/12 on a fresh database.

Worth naming the shape: **"every operand" is itself a count**, and I had not enumerated the
operands before claiming to have covered them all. Two of the three were conjuncts of an `AND`
and the third was a disjunct of the enclosing `OR`, which is exactly the kind of thing a reader
skims past.

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

---

## 7. How to see what Phase 4 produced, if you are not a developer

### Read this first: THERE IS NOTHING TO CLICK

No page, no button, no screen. Phase 4 produced **a set of rules that refuse bad input, and
two empty database tables.** If you were expecting a demo, the honest answer is that there is
nothing to demo and inventing one would be the exact failure the phase spent its time
preventing.

What you *can* do is watch the rules refuse something, which is the only thing they claim to
do. Each step below is one command and what you should see.

### Step 1 — watch every rule run (about 20 seconds)

From the `backend` folder:

```
node ../node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/services/lifecycle/generation/__tests__/designSelection.test.ts
```

You should see `Tests: 53 passed`. Each line is one rule. The names are written to be read —
for example *"a surface whose taskId is a NUMBER is refused"* and *"PASSING COUNTERPART: the
same shape with both ids as strings is accepted"*. Those two together are the point: the rule
refuses the bad case **and** accepts the good one, so it is not just refusing everything.

### Step 2 — break a rule on purpose and watch it complain

This is the step worth doing, because a test that cannot fail proves nothing.

Open `backend/src/services/lifecycle/generation/designSelection.ts`, find the line

```
  if (count === 0) {
```

change the `0` to `99`, save, and re-run the command from step 1. Measured, so you can check
you got the same thing: **`Tests: 3 failed, 50 passed, 53 total`**, and the three that fail are

```
ALTERNATIVES_NO_STRUCTURE fires
zero structures refuses on the set alone, before any journey is considered
an entirely absent input does not throw
```

**Change it back to `0`** and re-run; all 53 pass again.

What you just proved: the rule about "a design with no options at all must be refused" is
genuinely being checked, not merely described in a comment.

### Step 3 — see the two tables, and see that they are empty

This one needs a database, so it is for whoever has access to one. The expected answer is
**zero rows in both** — nothing writes to them until a later phase.

```sql
SELECT count(*) FROM blueprint_design_decisions;
SELECT count(*) FROM blueprint_visual_contracts;
```

Two empty tables is the correct and intended result. They exist so that the next phase has
somewhere to put a design decision; they are not evidence that anything has been designed.

### Step 4 — the post-deploy check (REQUIRED, and it is §2 of this document)

After the next deploy, somebody must run the command in §2 and confirm it exits 0. **It is not
optional and it is not a formality.** The code that creates those two tables logs a warning and
carries on if it fails, so a failed migration leaves the deploy looking completely normal. The
check in §2 is the only thing that would tell you.

### Step 5 — read what Phase 4 says it did NOT do

§6 of this document. It is short and it is the most useful page here if you are deciding what
to expect from the next phase.

---

## 8. Phase 4’s contribution to the run handoff, and what Phase 5 must build first

### What Phase 4 contributes

A **checked contract** for the design stage. Concretely: every business task must resolve to a
workspace action or an explicitly enumerated headless reason; a proposed screen must carry
a set of named fields or be refused (the list is the WorkspaceRef interface; no count is quoted here because no test asserts one); a workspace must declare an empty, a loading and an error
state with an accessible label; a manager control that names no enforcement point is `unavailable`
rather than shown as working; a design decision offers between two and four structurally
distinct options, or records why there is only one with a named human accepting that; and the
selection records both the chosen variant and the visual-contract revision.

Plus the persistence for the last of those, and a rule for which later edits invalidate an
approval (`approval-and-change-policy.md` §4.1).

### What Phase 5 must build before ANY of it is demonstrable

This is the dependency that matters, and it is not a small one.

1. **A rendered surface.** Every "journey" Phase 4 checks is a DECLARED path — a list of
   (task, workspace, action) steps asserted against a structure. Nothing renders, nothing
   receives a click. Until there is a surface, "the design can be demonstrated" is a claim no
   test in this phase can make, and §4.5 of the request says a screenshot alone would not
   establish it either.
2. **An orchestrator that calls these validators.** Measured: nothing outside
   `services/lifecycle/generation/` imports any of them, and no route, controller, service or
   job calls them. They are correct and they are unwired. `controlSurfaceExists()` has no
   production call site at all, and `validateTaskSurfaces` and `validateWorkspaceStates` are
   two more — see the register’s accumulating-risk entry.
3. **A writer for the manifest.** Production never creates an
   `operating_blueprint_manifests` row — it only reads and updates one. Until something writes
   it, `refs_json` is empty, the content hash has nothing to hash, and the §4.1 rule cannot be
   implemented even though it is now written down.

The order matters: 3 unblocks the approval-invalidation deferral, 2 makes the contract actually
gate anything, and 1 is what lets a human see any of it.

---

## 9. Every deferral this phase recorded, with its owner

Full text and reasoning in `carried-forward-obligations.md`. This is the index, so nothing is
owed by nobody.

| deferral | owner | why it is deferred rather than done |
|---|---|---|
| Screenshots and real responsive behaviour | **Phase 5** | needs a rendered surface |
| Whether the running surface enforces its declared permission views | **the phase that builds the routes** | a route-authorisation question; note this repo’s route-auth lint is per FILE, so an unguarded route inside a guarded file passes it |
| The hash / approval-invalidation binding — 3 parts, one now closed | **the phase that ships a persisted manifest** | nothing writes `refs_json` and no classifier exists; part 2 (stating the rule) is DONE as of §4.1 |
| The `gatherEvidence` stubs the design gate depends on | **Phase 6** | `lifecycleStatus.ts:142` hardcodes `selectedDesignRef: null`, so `design_ready` cannot be reached end to end |
| Acceptance-evidence rows LC-01…07, LC-13, LC-14 | **Phases 1-3 retroactively, or Phase 8 when it assembles** | writing them now would mean inventing evidence from plans that did not measure it |
| A stronger LC-08 guarantee ("proves a workflow", not just "a human interacts somewhere") | **Phase 6** | needs the release-level view |
| `ensureProjectLifecycleSchema.ts` at 426 lines | **the next change to that file** | under the 500 ceiling today; the seam is named in the register |
| Two unwired gates in `lifecycle/generation/` | **whoever composes the pipeline** | wiring was in no packet; the risk is that it accumulates quietly |
| Six design-system token pairs below WCAG AA | **whoever owns `tokens.css`** | a finding about the existing design system, not about Phase 4; Phase 4 constrains only itself |
| A flake seen once under heavy load | **nobody yet** | unreproduced in three runs; recorded with its measurements rather than closed or dismissed |
