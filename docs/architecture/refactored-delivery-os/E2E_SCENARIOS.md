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
| A | Intern sandbox | ✅ Gates 7, 8, 9, 11 | ⛔ no |
| B | AI Flotation client | ✅ Gates 1, 6, 8, 9, 10 | ⛔ no — also blocked on identity |
| C | Multi-project builder | ✅ Gates 2, 11, 12 | ⛔ no |
| D | Government | ✅ Gates 5, 9, 13, 14 | ⛔ no |
| E | Existing student Project | ✅ Gate 1 | ⛔ no |
| F | Cross-tenant attack | ✅ Gates 1, 2, 10 | ✅ **YES — 2026-08-28, passed** |
| G | Production feedback | ✅ Gate 14 | ⛔ no |

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
