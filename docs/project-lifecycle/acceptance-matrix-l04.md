# L0.4 — Acceptance matrix: LC-01 … LC-18

Ticket L0.4 · Blocks L8.6 · Approver: Ali · Drafted 2026-11-02, session `CC-20261021-h9v3`

> **Success metric (the ticket's own words):** "Ali can pick any LC ID and reach its evidence in
> one hop, and every row says deployed versus activated rather than just 'done'."

**Status: DRAFT. It cannot close.** The ticket says so itself — *"Completed only when Phase 8
closes"* — and L9.7 (LC-10/LC-11 withdrawn) is listed as its input.

## What this file is, and what it deliberately is not

This is the **index**. `acceptance-evidence.md` is the evidence; this points at it in one hop and
says, for every one of the eighteen, whether evidence exists at all.

**It does not backfill a single row.** `acceptance-evidence.md` states the rule and the reason:

> An empty row is the correct state for work that has not happened, and filling one in from a plan
> rather than a measurement is how this table would become the thing it exists to prevent.

So fourteen rows below say **"no evidence row"** and name who owes it. That is the measurement, not
a gap in this document.

## ⛔ The figure

**4 of 18 have an evidence row.** One is met-with-a-limit, three are partial. Fourteen have none.

**Never write "16 of 18" or "17 of 18".** `carried-forward-obligations.md:1332` and
`phase7-handoff.md:261` retire the former explicitly: it began as shorthand for *two IDs are
carried open* and was written three times as though it meant *sixteen are evidenced*. Phase 5
refused the same arithmetic in its own words — *"Sixteen of the eighteen are not evidenced by
Phase 5. That is the honest number."*

---

## The matrix

`DvA` = deployed versus activated, which the ticket asks every row to answer.
**Deployed** = the code is on production. **Activated** = something in production actually runs it.

| ID | The claim, short | Owner | Tier | Evidence, one hop | Result | DvA |
|---|---|---|---|---|---|---|
| **LC-01** | No entry route or job bypasses lifecycle registration or plan authorization | P6-T1 | unit+int | `acceptance-evidence.md` → *LC-01* | **Partial.** Registration unbypassable on both consumers, proven. *Enforcement* exists on the student path only; the cell was amended ✅→⚠️ by Phase 7 on a measurement | **Deployed; enforcement NOT activated** — the story gate is unreachable (below) |
| **LC-02** | Facts / proposals / assumptions / questions / confirmations stay distinguishable | P2-T5 | unit | **no evidence row** | Owed retroactively by Phases 1–3; recorded in `carried-forward-obligations.md` | unknown |
| **LC-03** | Must-have requirements survive decomposition and link to implementation evidence | P6-T4, P7-T1 | unit+int | **no evidence row** | Owed. **See discrepancy 1** — the evidence file assigns this to Phases 1–3, the plan assigns it to P6/P7, both of which have run | unknown |
| **LC-04** | Every process/task has valid transitions, completion conditions, exception/recovery | P3-T2 | unit | **no evidence row** | Owed retroactively by Phases 1–3 | unknown |
| **LC-05** | Complete allocation + human accountability required for full approval | P3-T3 | unit+int | **no evidence row** | Owed retroactively by Phases 1–3 | unknown |
| **LC-06** | Runtime agents have usable tools/authority/owners; builder agents separate | P3-T4 | unit | **no evidence row** | Owed retroactively by Phases 1–3 | unknown |
| **LC-07** | Effort measures disclose basis, coverage, uncertainty, deterministic share | P3-T5 | unit | **no evidence row** | Owed retroactively by Phases 1–3 | unknown |
| **LC-08** | Every task maps to a justified surface/action or explicit background operation | P4-T1 | unit | `acceptance-evidence.md` → *LC-08* and *LC-08 amended* | **Met, with a stated limit.** Amended to "strengthened": the surface exists and enforces per route. "Proves a workflow" is still not claimed | **Deployed and activated** (routes enforce) |
| **LC-09** | Interactive design + human controls exist before authorized planning | P4-T6, P6-T2 | int | `acceptance-evidence.md` → *LC-09* | **Partial.** The gate is real and blocking; "interactive" is **declared, not rendered** — nothing clicks anything | Deployed; the gate is activated, the *interaction* claim is unevidenced |
| **LC-10** | Approval binds authorized human, project/tenant, exact version/hash, selected design | P2-T3 | unit+int | `ruling-lc10-coverage.md`; PR #3595 | **WITHDRAWN, advanced tonight but still not writable.** See below | Deployed; **not** activated — see the role limb |
| **LC-11** | Material changes invalidate only affected approvals; block stale downstream work | P5-T4 | unit | `phase5-handoff.md` | **WITHDRAWN**, not waiting. Dropped when P5-T1.3's evidence failed five gradings | unknown |
| **LC-12** | Stories/releases carry blueprint traceability and demonstrate complete workflows | P6-T3, P6-T4 | unit+int | **no evidence row** | Owed by Phase 6, which **has run**. **See discrepancy 2** | unknown |
| **LC-13** | Retries/restarts/concurrent commands do not duplicate, erase or silently publish | P2-T4, P7-T3 | int | `blueprintApproval.concurrency.integration.test.ts`; PR #3595 | **No evidence row, but the integration suite EXECUTED on 2026-11-02** — 8 tests incl. its mandatory positive control. Previously it self-skipped in CI | Deployed; the unique index is active |
| **LC-14** | Cross-tenant access, forged approvals, direct API and worker bypass refused | P7-T2 | int | `acceptance-evidence.md` → *LC-14* | **Partial — 3 of 4 clauses.** The fourth has no path to test and carries a falsifiable tripwire instead | Deployed; the cross-tenant guard sits on a **self-closing migration ramp** — see caveat |
| **LC-15** | Legacy projects remain usable; migration explicit, preserves real progress | P7-T4 | int | **no evidence row** | Owed by Phase 7 | unknown |
| **LC-16** | Feature flags support staged release; production default enforces for new projects | P2, P8-T4 | unit+live | measured 2026-11-02; `release-packet-l81.md` | **Partial, newly measurable.** `ENABLE_PROJECT_LIFECYCLE=true` in production, durably in the stack `.env` | **ACTIVATED** for routes. The *other* half of P8-T4 is not — see below |
| **LC-17** | Real production journey, release identity, health, permissions, UI, logs verified | P8-T5 | live | **no evidence row** | Owed by Phase 8. Needs a live release | not deployed |
| **LC-18** | Rollback executable; never silently restores an ungoverned creation path | P8-T1 | int+runbook | `scripts/rollback-lifecycle-release.sh`; `release-packet-l81.md`; PR #3605 | **Advanced tonight.** An executable rollback exists with six guards exercised, and it never touches the feature flag — the "ungoverned path" clause. The *deploy half* has never been rehearsed off production | Deployed as a script; **never exercised** against production |

---

## The four rows tonight moved, and exactly how far

**LC-10 — one of two blockers cleared, so still not writable.** `ruling-lc10-coverage.md` named the
outstanding item as *"one integration-tier refusal from the live approve path — stale CAS or
cross-tenant."* That landed (PR #3595), deterministically, and mutation-proved: the same mutation
that **escaped** the pre-existing race test is **caught** by the new one, because the race resolves
through the idempotent read-back path and its rejection branch never executed. But Phase 7 recorded
a *second* reason LC-10 cannot be written — **no role is compared at approval time**;
`approved_by_role` goes into a nullable column and `git grep` outside tests finds only the DDL, the
model, the input type and one assignment. That limb is bound by recording, not enforcement. **One
of two cleared is not a row.**

**LC-13 — evidence that had never run, ran.** The suite is deliberately not on
`jest.ci.config.ts`'s ignore list, so with no `DATABASE_URL` it **skips visibly** and jest exits 0.
"All required checks green" has therefore only ever been a statement about the unit tier. It
executed against a pinned throwaway on 2026-11-02: 8 tests, including the control that drops
`uq_blueprint_approval_revision` and asserts the race then writes two rows. Still no evidence row,
because writing one is Phase 8's call, not this draft's.

**LC-16 — now partly answerable, and the answer contradicts the ledger.**
`ENABLE_PROJECT_LIFECYCLE=true` in production. The run ledger records it as *"unset — activation is
Phase 8, a documented hard stop."* The ledger is stale. LC-16's "explicit disabled state, never a
generic successful fallback" is satisfied in code — `projectLifecycleRoutes.ts:57,98,157,234` each
return `409 { lifecycleDisabled: true }` — but **that path is now unreachable**, which is why
ticket L9.1 is dead rather than pending.

**LC-18 — an executable rollback exists, and writing it found a defect.** The procedure recorded in
`deployment-log.md` no longer works: `DEPLOY_MODE` flipped to `registry` on 2026-10-18, and in
registry mode the `:main` digest can never equal an older commit's, so a rollback is refused by
definition. The script forces `DEPLOY_MODE=build`. It also never touches the feature flag, which is
LC-18's actual clause — rolling back code and deactivating a feature are two decisions.

## THE STRUCTURAL FINDING: a task recorded `passed` is not an evidenced acceptance ID

Checked against the state ledger, not inferred:

| ID | Owning task | Ledger status | Acceptance state |
|---|---|---|---|
| LC-10 | P2-T3 | **passed** | **withdrawn** |
| LC-11 | P5-T4 | **passed** | **withdrawn** |
| LC-12 | P6-T3, P6-T4 | **passed, passed** | **no row** |
| LC-03 | P6-T4, P7-T1 | **passed, passed** | **no row** |
| LC-01 | P6-T1 | **T1a passed, T1b BLOCKED** | partial — and the blocked half is why |

**Four acceptance IDs whose owning tasks are all recorded `passed` have no evidence row, and two of
those are formal withdrawals.** That is not a bookkeeping slip: it is the difference the whole
programme keeps paying to learn. A task passes when its verifier accepts the work. An acceptance ID
is evidenced when something *measured* proves the claim. Phase 7 is the clearest case and says so
itself — it built three modules, passed nine tasks, and claims **no** acceptance ID, because what
it built has no caller.

LC-01 is the useful counter-example in the other direction: its partial status traces to a
*specific* blocked subtask, `P6-T1b`, rather than to a vague shortfall. That is what a row should
look like.

**So the honest headline for L8.6 is not a fraction of eighteen.** It is: *four IDs carry evidence,
two are withdrawn, twelve were never written, and the ledger's phase-completion count tells you
nothing about which.*

## Two discrepancies, recorded rather than resolved

**1. LC-03's owner is contested.** `plan.md:111` assigns it to **P6-T4, P7-T1**; the evidence file
groups it with *"LC-01 to LC-07 … owed retroactively by Phases 1–3"*. Both named phases have run,
so under the plan's reading LC-03 is owed by work that completed; under the evidence file's it is a
retroactive gap. **Not resolved here** — picking one silently is how an owner disappears.

**2. LC-12 is owed by a phase that has run.** Its owners are P6-T3 and P6-T4, Phase 6 is complete
in the state ledger, and no row exists. The evidence file's blanket sentence — *"the rest belong to
the phases that have not run yet"* — is not true of LC-12.

## One caveat that must travel with LC-14 and LC-01

`ruling-lc10-coverage.md` gives an explicit instruction, and this is the discharge of it:

> `lifecycleStatus.ts:148`'s audited guard sits on `migration_open_legacy_admin`, which records
> `decision: allowed` for ANY admin while `tenant_memberships` / `platform_identities` are empty.
> **Say this out loud wherever the wrong-tenant row is claimed**, rather than letting three paths
> read as three independent live controls.

So: of the three paths that refuse cross-tenant access, **one is on a self-closing ramp**. It fails
closed and the first membership row restores strict scoping everywhere at once — but it is not a
third independent live control today.

## And the one that is not an acceptance ID but gates them

**The story authorization gate is unarmed.** `decomposeService.ts:141` is
`if (opts.projectId) { storyAuthorizationFor(...) }`, and `sbpOrchestrator.ts:328` calls
`decomposeBuild({brief, document, targets, correlationId})` with **no `projectId`**. Arming it
refuses **all 62 legacy student builds**, which predate the registration hook and hold no lifecycle
row. That is why LC-01's DvA column reads "enforcement NOT activated" and why L8.4 is half done.
