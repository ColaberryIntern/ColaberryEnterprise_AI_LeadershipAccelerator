# Test Plan

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

Master plan §19 plus root `CLAUDE.md`'s Test Strategy Framework. The baseline these run
against is [BASELINE_TEST_RESULTS.md](BASELINE_TEST_RESULTS.md).

---

## 1. Per-gate mandatory set

Every gate ships all seven or the gate is not complete:

| Check | Command / form |
|---|---|
| Typecheck | `tsc --noEmit` under **pinned TS 5.x**, never a bare `npx tsc` |
| Unit | Jest, pure logic, no I/O |
| Integration | Jest against dev sandbox / mocks. **Never production** |
| Schema | The `ensure*Schema` module applies cleanly and is idempotent on a second run |
| Authorization | The four-test set below, per route |
| Idempotency | Same operation twice ⇒ same end state |
| Failure paths | The §17 list below |

### The four-test authorization set (every route, no exceptions)

1. Unauthenticated ⇒ correct rejection status, asserted exactly
2. Wrong tenant ⇒ denied without enumeration + `tenant_access_audits` row written
3. Right tenant, not a project member ⇒ denied
4. Right project, insufficient delivery role ⇒ denied

Root `CLAUDE.md`: *"A route that passes happy path tests but does not test what happens
when an unauthenticated user calls this is incomplete."*

---

## 2. Test pyramid

| Tier | Target | Content |
|---|---|---|
| Unit | ~70% | `planGate` extensions, permission resolution, risk classification, impact analysis, evidence-gate computation, projection allowlist |
| Integration | ~20% | Route auth, schema application, execution run state machine, evidence write + dedup |
| E2E | ~10% | Playwright walkthroughs (§5) |

A suite that inverts this is a process violation. Push assertions down.

---

## 3. Regression contract — the SBP guarantee

The single largest risk in this plan is that generalizing SBP silently changes student
behaviour. Four assertions are the tripwire, and they run at **every** checkpoint:

| Assertion | Why it is the tripwire |
|---|---|
| `planGate` verdicts on `__tests__/fixtures/pilot-dryrun-plan.json` unchanged | The gate is the module most likely to be "improved" during generalization. A changed verdict means student build behaviour moved |
| `materializeTasks.idempotency.test.ts` unchanged | A second run must not double-write a student's tasks |
| `repoWriter*.test.ts` unchanged | One commit, content-hash idempotent, allowlist enforced by throwing |
| `multiProjectIsolation.integration.test.ts` unchanged | Students do not see each other's builds |

Plus: all 5 SBP routes behave identically for a participant, and the full SBP suite stays
at **879 passing**.

---

## 4. Per-gate specifics

| Gate | Beyond the mandatory set |
|---|---|
| 1 | Schema rehearsal against a structure-only prod dump (see MIGRATION_STRATEGY §3). Unique constraints exercised **functionally** — insert the duplicate, confirm rejection |
| 2 | Unknown role grants nothing. Delivery permission without tenant permission ⇒ deny. `platform.cross_tenant` grants no delivery authority. Shadow-logged verdicts recorded without enforcing |
| 3 | Contract versioning; approved snapshot immutable; supersession recorded not overwritten |
| 4 | Intake idempotency: same intake retried ⇒ no duplicate project |
| 5 | Every production-bound agent addresses all six INPACT dimensions, **each scored 1–6 per the book**, or the release gate blocks. Story ordering must respect the INPACT dependency phases (Instant → Natural+Permitted → Contextual → Adaptive+Transparent); a violation fails the traceability gate. GOALS stored as **five separate 1–5 scores**, never averaged for gating |
| 6 | Approved design decision cannot be silently overwritten; superseding requires a recorded decision. Visual Contract variance thresholds |
| 7 | Traceability fails closed: every `must` requirement maps to a story or the plan is rejected. Cycle prevention. Collision detection |
| 8 | The §17 failure list in full. Default-deny list enforced. Workspace destroyed even on failure |
| 9 | Release gate blocks on each missing evidence type individually. `not_run ≠ pass` |
| 10 | **Response-body** assertions that mentor notes, builder assessments and agent scratchpad are absent from the client payload — not DOM assertions |
| 11 | Experience Ledger claims trace to evidence rows. No credit without evidence |
| 12 | Overload guard fires at `max_parallel_projects`; override requires reason + audit |
| 13 | Government profile blocks a release with missing accessibility/security/trust evidence |
| 14 | Production signal creates a candidate, never a mutation |
| 15 | Adapter emits only allowlisted fields; `client_confidential` and `regulated` produce no candidate without explicit release |

---

## 5. Playwright walkthroughs (master plan §19)

Desktop ≈ `1440x1000`. Mobile ≈ `390x844`. Console-error check on every route.

```
Builder   login -> /refactored -> create -> discovery -> architecture
          -> design comparison -> approve -> story -> execution -> evidence -> release

Client    login -> same project -> cannot see intern/private notes
          -> decision -> comment -> design approve -> preview -> accept release

Mentor    portfolio -> exception queue -> risky project -> evidence -> approve/deny

Cross-tenant  foreign project/API -> deny/404 -> audit row
```

**Honesty constraint, carried from the multi-tenancy Gate 0's D-10:** there is no running
stack and no staging credentials in this environment. Playwright is currently
**not executable here**. It must be reported as not-executed, never as passing. Master
plan §24 lists "Playwright proof is missing" and "mobile proof is missing" as stop
conditions, so a gate that needs them is not complete until an environment exists that can
run them.

---

## 6. Failure-first tests (master plan §17)

Each must fail **safely and visibly** — no silent swallow, and a specific `error_class`:

| Failure | Required behaviour |
|---|---|
| GitHub outage | Retry with cap, then dead-letter with context |
| Repo access revoked | Distinguish `access_unknown` from `pull_only` (the `workspaceRepo` lesson) |
| Workspace provisioning fails | Run ⇒ `failed`, no orphan workspace |
| Claude Code failure | Run ⇒ `failed`, partial work not committed |
| Rate limit | Backoff, bounded, surfaced |
| Worker timeout | Run ⇒ `timed_out`, workspace destroyed |
| Hung test | Killed at an explicit timeout |
| **Malicious repo script** | Cannot escape the sandbox, cannot reach prod DB/email/DNS. **Depends on S-01** |
| PR creation failure | Evidence retained, run not lost |
| Browser verification failure | Evidence records `fail`, release blocked |
| Revoked approval | In-flight work stops |
| Superseded design | Dependent stories flagged, not silently executed |
| Changed delivery profile | Release re-evaluated against the new profile |
| Unresolved tenant context | Fail closed for delivery reads (note: tracking fails *soft* by design — different rule, deliberately) |
| Audit DB failure | Degrades to "enforced but unevidenced", loudly logged — **never** to "allowed because bookkeeping broke" |

That last row is the multi-tenancy work's rule and it transfers verbatim: the audit can
never change an outcome.

---

## 7. Idempotency tests (master plan §15)

| Operation | Assertion |
|---|---|
| Same intake retried | No duplicate project |
| Same execution callback | No duplicate evidence (unique `idempotency_key`) |
| Same webhook | No duplicate transition |
| Same approval retried | One approval |
| Same operational signal | One candidate |
| Same source link | One link |
| `ensure*Schema` run twice | Zero errors, zero duplicate objects |

Root `CLAUDE.md`: a script that "works once but breaks on the second run" is broken, not
fragile.

---

## 8. Security tests (master plan §11)

1. Untrusted repo content cannot override tool or security policy — the prompt envelope
   keeps system policy, approved contract, approved decisions and untrusted content in
   separate, labelled regions.
2. Client comment text cannot inject instructions.
3. Secrets redacted in every log line and every evidence payload.
4. Private repo contents never reach the client surface except as approved artifacts.
5. No client data in global analytics payloads.
6. Tool allowlist enforced; network boundaries enforced (**depends on S-01**).
7. `secret-scan.yml` runs on the delivery commit path rather than a second scanner.

---

## 9. What cannot be tested here, and is not claimed

| Item | Status |
|---|---|
| Playwright walkthroughs | **not executed** — no stack, no staging credentials |
| Frontend build | **not executed** — `react-scripts` absent locally; needs Docker |
| Production deployment verification | **not attempted** — master plan §20 forbids it |
| Real client repo execution | **not attempted** — §20 forbids it |
| Schema rehearsal against prod dump | **not yet run** — required before Gate 1 merges |

Stating these plainly is the point. A gate report that lists a check it did not run as
passing is the failure mode this section exists to prevent.
