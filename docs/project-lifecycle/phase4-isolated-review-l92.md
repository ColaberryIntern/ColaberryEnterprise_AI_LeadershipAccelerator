# L9.2 — Phase 4, re-reviewed in isolation

Ticket L9.2 · Approver: Ali · 2026-11-02, session `CC-20261021-h9v3`

> **Success metric (the ticket's own words):** "Ali decides: accept it as reviewed, or re-review
> the Phase 4 diff in isolation."

The DRI asked for the decision to be made rather than returned to him. **Taken: re-review**, not
accept-as-reviewed. Accepting blind would have cost nothing and proved nothing, and the review
found something, which settles whether it was worth doing.

---

## 1. The ticket's claim, verified rather than assumed

> P4-T1 through P4-T7 reached main inside PR #3048, the Phase 5 PR, not under their own review.

**Confirmed.** PR #3048 is *"Phase 5: the operator review surface, shipped dark"*, merged
2026-10-09, merge commit `a11961e3`. All seven named Phase 4 commits are ancestors of it:

```
4442fe77 a4b0077f c8da0cc1 7eeeaedb 37480a77 a3e0dae9 f8834976   -> all ancestors of a11961e3
```

The only `phase4` merge commits on main belong to **other programmes** — `#2768`
`ai-project-factory-phase4` and `#2716` `growth-journey-phase4` — not to the project lifecycle. So
there is no project-lifecycle Phase 4 PR, as the ticket says.

## 2. Isolating the diff was not trivial, and that is part of the finding

Phase 4's commits are **not a contiguous range on main.** Interleaved among them are three
unrelated workstreams: Zoom recording correlation (`1cf18290`, `0f3d069a`), the Studio rehearsal
runbook (`cea10577`), and a screenshot pass (`f39ab235`). A naive `git diff first..last` would have
reviewed other people's work as Phase 4.

Isolation therefore had to be path-scoped:

- **17 commits** whose subject is a `P4-T` task (filtered on the SUBJECT — `git log --grep` matches
  the whole message, and five unrelated commits mention `P4-T` in their bodies).
- **29 distinct files** touched by those commits.
- **Contamination check:** exactly one non-P4 commit in the range touches any of those 29 files —
  `0d57a036`, a session log. No code contamination.

**The reviewable diff:**

```
git diff 6193b25f^..f8834976 -- <the 29 paths>
29 files changed, 8824 insertions(+), 4 deletions(-)
```

Roughly **2,700 lines of production code**, 3,300 of tests, 2,800 of docs — four deletions in
total. That is a substantial body of work that reached production inside another phase's review.

## 3. THE FINDING: a schema gate that logs instead of gating

**`ensureProjectLifecycleSchema` cannot fail.** Three facts compose into one:

1. The DDL loop is **warn-only**:
   ```ts
   try { await sequelize.query(sql); }
   catch (err: any) { console.warn('[DB] project lifecycle schema stmt skipped:', err?.message); }
   ```
2. `assertProjectLifecycleSchema()` **returns `false`** and `console.error`s. It never throws.
3. Its only production caller discards the result —
   `ensureProjectLifecycleSchema.ts:387`: `await assertProjectLifecycleSchema();`

So on a database where the lifecycle DDL does not apply, every statement warn-skips, the assert
emits one structured line, and **the boot completes**. The server then serves traffic while
lifecycle registration and blueprint approval fail at runtime — with this already in the log, at
boot, read by nobody:

```json
"impact": "Project lifecycle registration and blueprint approval will fail;
           new projects would not be governed."
```

### Why this is a review finding and not a test finding

**The assert is good, and it is well tested.** It checks tables, indexes, columns *and* CHECK
constraints; it works around a real sequelize raw-array quirk; and
`ensureProjectLifecycleSchema.test.ts` asserts `.resolves.toBe(false)` across five separate failure
scenarios.

What no test covers is that **nothing acts on `false`**. The function is verified in isolation and
unenforced in composition — which is exactly the class of defect a diff review catches and a unit
suite cannot, because every unit involved behaves as written.

The file's own header invites the stronger reading:

> a post-condition assert names anything that failed to appear — … The warn-only loop is why the
> assert is not optional: **without it a failed migration is silent**

True as far as it goes: it *names* the problem. But naming it in a log line with no consumer is one
step from silent, and a reader of that sentence will believe there is a gate.

### The adjacent risk the header already declared, still live

> MUST BE CALLED AFTER `ensureMultiTenantSchema()`. … The order holds today **by position alone** —
> `server.ts:2555` … before `:2744` … and nothing states the requirement.

Re-measured on current main: the calls are at **2653** and **2858**. Still correctly ordered, and
**the line numbers have moved by ~100**, which demonstrates the file shifting underneath an
unstated dependency. Every table here is `REFERENCES tenants(id)`, so if that order ever inverts,
the whole DDL warn-skips — and by the finding above, nothing stops the boot.

### ⚠️ NOT FIXED HERE, deliberately

Making the assert throw is a **production-availability change**. If any environment currently boots
with an incomplete lifecycle schema, adding a `throw` takes it down on the next deploy instead of
degrading one feature. That is not an unattended change, and the honest sequence is:

1. Measure whether `assertProjectLifecycleSchema()` currently returns `true` on production and on
   dev — a read-only check, one log line each.
2. Only if both are clean, make the failure fatal, behind the same `LIVE_SINCE`-style caution the
   registration check already uses.

Doing step 2 before step 1 would be the "arming a gate without a cutoff" mistake this programme
already has an example of, one subsystem over.

### Step 1 is DONE, and production is clean

Measured 2026-11-03 against `accelerator-backend`, counts only, 72-hour window:

```
project lifecycle schema ensured              1
project_lifecycle_schema_invariant_violated   0
project lifecycle schema stmt skipped         0
SchemaInvariantViolation                      0

Server running on port                        1     <- boots in the window
container started at                          2026-11-03T01:38:48Z
```

**One `ensured` over exactly one boot**, with zero skipped statements and zero violations. The boot
count is reported alongside deliberately: a bare `0 violations` would have been ambiguous — it
reads the same whether the schema is healthy or the assert never ran. One-of-one says every boot in
the window asserted clean.

**So the latent defect is not currently masking anything**, and step 2 is unblocked as a deliberate,
reviewed change. It is still not a change to make unattended, because the risk is about the
environments nobody has measured — dev, preview, and any fresh database — not production.

## 4. Scope of this review, stated rather than implied

**Reviewed in depth:** the persistence and schema surface — `ensureProjectLifecycleSchema.ts`,
`projectLifecycleSchemaContract.ts`, `BlueprintDesignDecision.ts`, `BlueprintVisualContract.ts`,
`models/index.ts`. That is what the ticket names ("two design tables") and it carries the most risk,
being the only part of Phase 4 that writes to a database.

**Reviewed structurally only:** the six generation modules (`controlSpecification`,
`designAlternatives`, `designSelection`, `workspaceBindingChecks`, `workspaceBindingTypes`,
`workspaceMapping`, `workspaceStateChecks`) — about 2,200 lines. Their evidence is recorded in
`acceptance-evidence.md` under LC-08 and LC-09, including per-refusal mutation proofs and a seeded
generator whose keyspace is derived from the source. **A reader should not take this document as a
line-by-line review of those files**, and one session cannot honestly claim to have given 2,200
lines of adversarially-built code the review a PR would have had.

**That is the residual gap**, and it is smaller than before this document but not closed. If the
remaining 2,200 lines matter enough to review properly, they want their own pass with the diff
open — which is precisely what not having a PR cost.

## 5. Disposition

| | |
|---|---|
| Ticket claim | **verified** |
| Diff isolated | **yes** — 17 commits, 29 files, contamination checked |
| Review-coverage gap | **real**, and partially closed by this document |
| Defect found | **one**, in the schema gate, with a safe remediation sequence |
| Recommendation | **do not accept Phase 4 as reviewed.** Record it as re-reviewed at the persistence layer, with 2,200 lines of generation code still owed a proper pass. |
