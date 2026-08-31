# E2E Scenarios — specification, and what has NOT been run

**Session:** CC-20260823-r4k9 · **Gate:** 15 · **Status:** ⛔ **NONE OF THESE HAVE BEEN EXECUTED**

---

## Read this first

Master plan §8 requires seven end-to-end scenarios. This document specifies all seven
precisely enough to execute. **It does not report a single result, because none has been
run.**

That is not an omission to be tidied up later. It is a structural consequence of the
authorization this work was given:

| Scenario needs | Available here? |
|---|---|
| A running application stack | ❌ nothing is deployed |
| A client repository to execute against | ❌ none exists |
| A working Claude Agent SDK binding | ❌ deferred at Gate 8, deliberately unwritten |
| A production or staging deploy | ❌ **forbidden by master plan §20** |
| Real client identities and acceptances | ❌ live client invitations forbidden by §20 |

Four of the seven scenarios require a deploy. All seven require a running stack.

**Nothing in this repository should be read as evidence that the delivery OS works end to
end.** What the 16 gates establish is that each *component* behaves as specified under
unit and integration test — 2,127 tests across 123 suites at Gate 14, plus type checking
and CI. That is a real and useful thing. It is not the same thing.

The distinction matters most precisely where it is most tempting to blur: a system whose
parts are each individually verified can still fail at every seam between them, and the
seams are what an E2E run exercises.

---

## What each scenario must demonstrate

Each is written as: **the chain**, then **the observable that proves it**, then **why that
observable and not an easier one**.

### A — Intern sandbox

```
intern → idea → discovery → requirements → design → story
→ Claude Code → tests → evidence → Experience Ledger
```

**Proves it:** an `experience_claims` row that is *earned* — traceable to a
`delivery_evidence` row from a real agent run, with `builderDidTheWork` true.

**Why that observable:** the ledger is the only artifact in the chain that cannot be
produced by any single component acting alone. A story exists after planning; evidence
exists after execution; a *claim* requires the projection, the quality gate and the
attendance rule all to have agreed.

### B — AI Flotation client

```
AI Flotation tenant → client org → engagement → app project
→ client reviewer → design options → approval → execution
→ evidence → release → client acceptance
```

**Proves it:** a `delivery_client_acceptances` row whose `promised_acceptance`,
`preview_ref` and `evidence_summary` snapshots match what the client actually saw, plus a
client-surface HTTP response body containing **no** builder-shaped fields.

**Why that observable:** asserting on the response body rather than the rendered page is
the whole point of Gate 10's server-side projection. A DOM assertion would pass on a page
that received private data and chose not to draw it.

**Blocked by:** client identity. Gate 0 flagged, and Gate 2 did not close, whether
`PlatformIdentity` supports an identity linked to neither an enrollment nor an admin user.
This scenario cannot run until that is answered.

### C — Multi-project builder

```
qualified builder → 3 projects → capacity model
→ parallel-safe runs → overload guard → mentor
```

**Proves it:** the fourth concurrent assignment is refused by `assessOverload`, and a
`builder_overloaded` mentor exception appears — then an expiring override lifts the cap and
`reliesOnOverride` is true.

**Why that observable:** the override expiry is the part that rots silently. A run that
only tests the refusal would pass forever while the expiry logic quietly broke.

### D — Government

```
government profile → required accessibility/security/trust
→ missing evidence → release blocked
```

**Proves it:** `evaluateReleaseGate` returns `ready: false` with an accessibility blocker,
**and** the same release becomes ready once a Gate 13 waiver is recorded — with the waiver
visible in `waived` rather than folded into `passed`.

**Why that observable:** the failure mode is not "the gate does not block". It is "the gate
stops blocking for a reason nobody can see afterwards."

### E — Existing student Project

```
existing Project → linked to delivery context
→ enrollment/program intact → SBP/progression unchanged
```

**Proves it:** a student `Project` row is byte-for-byte unchanged after linking, and the
SBP regression suite passes identically before and after.

**Why that observable:** master plan §24 lists "student `Project` behavior regresses" as a
stop condition. The only credible evidence is the untouched row plus the unchanged suite —
a passing new test proves nothing about what was already there.

### F — Cross-tenant attack

```
AI Flotation user → CPN/Colaberry foreign project
→ denied without enumeration → TenantAccessAudit
```

**Proves it:** the response is **404, not 403**, for a project that exists in another
tenant, and a `TenantAccessAudit` row records the attempt.

**Why that observable:** 403 confirms the resource exists. The distinction between "you may
not see this" and "this is not here" is the entire difference between a denial and a
disclosure, and it is invisible unless the test asserts on the status code specifically.

### G — Production feedback

```
operational signal → candidate story → review → release
```

**Proves it:** a real operate signal produces a `SignalCandidate` in status `proposed`, and
**no production state changes** until a human converts it through the ordinary gates.

**Why that observable:** the property under test is an absence — that nothing happened
automatically. It requires a real signal to arrive, which requires a deployment.

---

## Honest status of each

| # | Scenario | Components built & unit-tested | E2E executed |
|---|---|---|---|
| A | Intern sandbox | ✅ Gates 7, 8, 9, 11 | ✅ **YES — 2026-08-31, 20/20 PARTIAL** (no agent-run leg) |
| B | AI Flotation client | ✅ Gates 1, 6, 8, 9, 10 | ⚠️ **PARTIAL — 2026-08-29, projection half passed; acceptance half has no writer** |
| C | Multi-project builder | ✅ Gates 2, 11, 12 | ✅ **YES — 2026-08-30, passed** (mentor-exception half still unwired) |
| D | Government | ✅ Gates 5, 9, 13, 14 | ✅ **YES — 2026-08-31, 28/28 passed** |
| E | Existing student Project | ✅ Gate 1 | ✅ **YES — 2026-08-31, 12/12 passed** |
| F | Cross-tenant attack | ✅ Gates 1, 2, 10 | ✅ **YES — 2026-08-28, passed** |
| G | Production feedback | ✅ Gate 14 | ✅ **YES — 2026-08-31, 14/14 passed** |

## Scenario C — executed 2026-08-30, PASSED

**C could not be written until Gate 12 was wired.** `assessOverload` had zero production
callers and there was no assignment path at all, so there was nothing to refuse. A script
calling the pure function directly would have duplicated `capacityEconomics.test.ts` while
looking like an executed scenario.

`POST /api/refactored/admin/projects/:id/assign` now consults the capacity model, so every
assertion below drives the real endpoint:

```
  PASS  assignment 1 of 3 is accepted                      201
  PASS  assignment 2 of 3 is accepted                      201
  PASS  assignment 3 of 3 is accepted                      201
  PASS  the FOURTH assignment is refused                   409
  PASS    refused for capacity, not something else         overloaded
  PASS    and nothing was written                          3
  PASS  a LIVE override admits the fourth                  201
  PASS    and the reliance is surfaced                     true
  PASS  an EXPIRED override no longer lifts the cap        409
  PASS    refused for capacity                             overloaded
  PASS  a client-side role is refused by the builder path  422
```

Three of those matter more than the rest:

**Nothing was written on refusal.** A guard that says no and assigns anyway is worse than
no guard, because it reports safety it did not deliver.

**The expired override no longer lifts the cap.** This spec calls that out as the part
that rots silently, and it is right: every other assertion here would still pass if expiry
broke.

**The fourth is refused, not the fifth.** The service assesses the assignment being
CONSIDERED (`activeProjects + 1`). Assessing the current count would find `3 <= 3` and
allow it, letting every builder land exactly one over their cap forever.

### NOT covered

The `builder_overloaded` **mentor exception** half. `mentorExceptions` is still unwired, so
nothing raises one from this path. Marked partial in that respect rather than claimed.

---
## Scenario B (projection half) — executed 2026-08-29, PASSED

B's blocker in this doc was **client identity**. Magic-link sign-in resolved it.

Run by `scripts/e2e/scenarioB-clientProjection.js`:

```
[B] stamped 4 private values on c3edcf4c-f0a7-4ff4-9a06-b30c2064693a

  PASS  the client can actually reach the project            200
  PASS  "workflow_summary" does not reach the client
  PASS  "existing_system_summary" does not reach the client
  PASS  "delivery_profile_key" does not reach the client
  PASS  "trust_profile_key" does not reach the client
  PASS  no forbidden-category field in the response          0
  PASS  no project key outside the allowlist                 0
```

**It writes private data before reading.** A leak test against a project with nothing
private in it proves nothing — the response would be clean because there was nothing to
leak. The canaries are genuinely builder-shaped values stamped on the row the client CAN
reach, so the test can fail for the right reason.

The last assertion is the one that catches what the canaries did not anticipate: every key
present must be named by the allowlist, not merely free of known-bad values.

### NOT covered

B's full chain ends in a `delivery_client_acceptances` row whose snapshots match what the
client saw. **Nothing writes acceptances yet**, so that half is not executed and is not
claimed. Marked PARTIAL rather than executed deliberately: a scenario marked done that
quietly tested a third of itself is worse than one marked partial, because the first stops
anybody looking again — which is how this document came to list seven blockers that had
all been cleared.

---
## Scenario F — executed 2026-08-28, PASSED

Run against the dev instance by `scripts/e2e/scenarioF-crossTenant.js`:

```
[F] own tenant: Refactored.ai | foreign tenant: Career Pathways Network
[F] foreign project exists: dfd8ae06-e0e8-41c2-b53a-fb1447a258dd

  PASS  own project is reachable                             200
  PASS  EXISTING foreign-tenant project returns 404, not 403 404
  PASS  unknown id is indistinguishable from a foreign one   404
  PASS  the attempt is recorded in TenantAccessAudit         true
        resource_type=delivery_project action=read reason=project_not_in_client_session
```

**Writing it caught a real gap.** `requireDeliveryProjectAccess` logged a cross-tenant
attempt to `ai_events` only — it never wrote `TenantAccessAudit`, the table that exists
specifically to answer *who tried to read whose data*. The scenario asserts on that row,
so it would have failed. Now recorded through `recordAccessDecision`.

**The foreign project genuinely exists**, in a genuinely different tenant. An earlier
spot-check used a random uuid, which proves less than it looks: an id matching nothing
returns 404 from almost any implementation. A 403-shaped bug only shows against a real
row belonging to someone else. The first assertion is the control — without it a blanket
404 would read as a pass.

---

## Why A, C, D and G cannot be written as tests yet (2026-08-29)

Scenario C was attempted and abandoned, for a reason worth recording.

**The Gate 9-14 delivery logic has no production callers.** Verified per symbol against
the non-test tree, after discarding two names that turned out not to exist at all:

| Symbol | Gate | Real callers |
|---|---|---|
| `assessOverload` | 12 | **0** |
| `decideCapacityOverride` | 12 | **0** |
| `evaluateQualityGate` | 9 | **0** |
| `evaluateReleaseGate` | 14 | **0** (its one hit is a doc comment) |
| `assertModeIsSupportOnly` | 11 | **0** (doc comment) |
| `resolveProfile` | 13 | **0** |
| `summarizeLedger` | 11 | **0** |
| `evaluateClaim` | 11 | 1, inside its own module |
| `buildCaseStudy` | 15 | **9** - genuinely wired |

These are well-designed, well-tested pure functions that nothing invokes. **The capacity
guard does not guard**: a builder could be assigned a hundred projects and no code path
would refuse, because no assignment path calls it.

That is why C has nothing to observe. Its stated observable is *the fourth concurrent
assignment is refused by `assessOverload`* - and there is no assignment path that consults
it. A script calling `assessOverload` directly would duplicate the unit tests that already
cover it (`capacityEconomics.test.ts` asserts the refusal, the override, `reliesOnOverride`,
and the expiry fallback) while LOOKING like an executed scenario. That is the failure mode
this document already fell into once.

A, D and G are the same shape: their observables depend on the quality gate, delivery
profiles and the release gate, none of which any runtime path reaches.

**So the remaining scenarios are not blocked on being written. They are blocked on the
gates being wired** - which is a build, not a test-writing exercise. F and B were
executable precisely because the client surface IS wired end to end.

---

## What it would take

1. **A deployable environment** the delivery OS can run in — the dev instance, not
   production.
2. **The Agent SDK binding** behind `ExecutionProvider`, written against
   `code.claude.com/docs/en/agent-sdk` rather than from memory (deferred at Gate 8).
3. **A GitHub Actions runner workflow** to host execution (ESC-4's decision, unimplemented).
4. **The schema rehearsal** against a production-structure dump — 19 tables of DDL have
   never run against a real Postgres.
5. **An answer to the client identity question** for scenario B.
6. **Both UI surfaces**, for anything asserting on what a person can see.
7. **Authorization** — §20 currently forbids the deploy that four of these require.

Items 1–6 are engineering. Item 7 is a decision only Ali can make.

### Status of that list as of 2026-08-28 — all seven are cleared

| # | Blocker | Now |
|---|---|---|
| 1 | A deployable environment | ✅ dev and production both run the delivery OS |
| 2 | The Agent SDK binding | ✅ `claudeAgentSdkProvider.ts` |
| 3 | A GitHub Actions runner workflow | ✅ `delivery-execution-runner.yml` |
| 4 | Schema rehearsal against real Postgres | ✅ 19 tables, 3 environments, identical |
| 5 | An answer to the client identity question | ✅ magic-link sign-in, verified end to end |
| 6 | Both UI surfaces | ✅ `ClientPortal` and `BuilderWorkspace` |
| 7 | Authorization for the deploy | ✅ Ali authorised production |

So the remaining six scenarios are blocked on **being written**, not on anything missing.
F is done. A–E and G are the work.


---

## A, D, E and G — written AND EXECUTED 2026-08-31

Deployed to dev and run against `accelerator_dev1`. **74 assertions, all passing.**
Results and what running them found are at the end of this section.

Writing them was mostly not a test-writing exercise. Each of the four needed a production
path that did not exist:

| # | Script | What had to be built first |
|---|---|---|
| A | `scenarioA-experienceLedger.js` | `delivery_experience_claims` + `experienceClaims.ts` + 2 endpoints. `evaluateClaim` had no table, so no claim could ever be earned. |
| D | `scenarioD-governmentRelease.js` | 5 release endpoints and `waiveReleaseCheck`. Nothing could record a waiver. |
| E | `scenarioE-studentProjectIntact.js` | `projectSourceLink.ts` + 2 endpoints. `DeliveryProjectSourceLink` had a model and a table and **no service or route at all**. |
| G | `scenarioG-productionFeedback.js` | `delivery_signal_candidates` + `signalIntake.ts` + 2 endpoints. `operateSignals.ts` was pure with nowhere to write, so no signal could arrive. |

### What each one is actually careful about

**D** asserts the *control* as well as the failure: after recording every mandatory check
except accessibility, the only remaining check blocker must be accessibility. Without that,
"not ready" could mean anything at all was missing and the test would pass even if the gate
had stopped looking. It also asserts that a recorded `not_run` does not satisfy the gate —
recording a check without measuring it is the cheapest way to quiet one — and that the
waiver is **still on the record after approval**, since folding it away at that point would
leave a finished record claiming a clean government release that never had an a11y run.

**E** compares `row_to_json` of the whole student row as a string, not a field-by-field
check of the columns the script thinks matter. `updated_at` is inside that JSON, so a bare
touch — the most likely regression and the easiest to miss — fails. It uses the **oldest
existing** student project rather than one it created, because a row with no enrollment and
no progression is a weak subject for a §24 non-regression claim.

**G** tests an absence, so it snapshots counts of every table a signal could plausibly have
written to plus the project row itself, before and after. A script asserting only "a
candidate exists" would pass just as happily on a system that also silently opened a story.

**A** is marked **PARTIAL by design**: it covers story → evidence → earned claim traceable
to a real `delivery_evidence` row, and every refusal path. It does **not** cover the
`-> Claude Code ->` leg — the evidence is recorded through the evidence endpoint, not
produced by an autonomous agent run, and nothing in the script proves an agent executed
anything.

### Two rules that came out of writing these

**The caller never describes its own evidence.** `claimFromEvidence` reads `evidence_type`
and `outcome` from the row and has no parameter for them. A caller that can describe its
own evidence can substantiate anything, and the ledger would record claims about a world it
was told existed.

**Silence is not an attestation.** `evaluateClaim` rejects `builderDidTheWork: false`, but
the field is optional on `ClaimCandidate`, so *omitting* it passes. That is credit for
attendance arriving through the one door the pure rule leaves open, so the service requires
an explicit boolean and the column is `NOT NULL`.

### Still not covered by anything

- **A's agent-run leg.** Needs `ExecutionProvider` actually executing.
- **B's acceptance half.** `delivery_client_acceptances` still has no writer.
- **C's mentor-exception half.** Now unblocked — Gate 11 is wired as of PR #1949 — but the
  scenario has not been extended to assert it.


### Executed 2026-08-31 against dev — 74 assertions, all passing

```
  [D] SCENARIO D PASSED                28/28
  [E] SCENARIO E PASSED                12/12
  [G] SCENARIO G PASSED                14/14
  [A] SCENARIO A PASSED (PARTIAL)      20/20
```

**Scenario A remains PARTIAL by design.** Every assertion passes, but the `-> Claude Code ->`
leg is not covered: evidence is recorded through the evidence endpoint, not produced by an
autonomous agent run. The script says so in its own output so a passing run cannot be
misread as a complete one.

### Running them found a real bug that 20 unit tests could not

Scenario D failed 6 of 28 on the first run. One root cause: **`requireAdmin` populates
`req.admin`, and every actor lookup on these routes read `req.user`.** Release approval
returned 401 because there was no approving identity.

The interesting part is what that exposed. `assignBuilderToProject` — shipped, merged,
covered by the scenario C run recorded above — had the *identical* expression and had been
passing `actorIdentityId: null` since it shipped. Nothing failed:
`granted_by_identity_id` is nullable, so every assignment silently recorded no granter.
Scenario C passed against it because C never asserted who granted.

**That is the argument for E2E scenarios in a single bug.** Twenty unit tests covered the
assignment service and every one of them supplied the actor directly as a parameter, so
none of them could see that the route never supplied one. The seam between the middleware
and the handler is exactly what unit tests cannot reach, and exactly what an E2E run does.

`AuthPayload` carries `sub`, not `id`. `actorOf` now checks `platform_identity_id`, then
`sub`, then `id`, on `req.admin` and then `req.user`.

### Two more fixture errors, caught by running

Neither was a code defect; both were names invented rather than read:

- Scenario A's story contract used `businessOutcome` / `acceptanceCriteria` / `requirements`
  and `riskLevel: 'low'`. The real fields are `fulfills` and `acceptance`, `riskLevel` is
  **required**, and risk levels are `R0`–`R5`. The endpoint refused it 422, correctly. The
  script now prints the validator's issues on failure so the next drift is diagnosable from
  the run output.
- A `docker cp` into an existing `/app/e2e` left a stale copy in place, so a corrected
  script produced a byte-identical failure. The identical output was the tell — a real fix
  that changes nothing at all is a signal that the fix never ran.
