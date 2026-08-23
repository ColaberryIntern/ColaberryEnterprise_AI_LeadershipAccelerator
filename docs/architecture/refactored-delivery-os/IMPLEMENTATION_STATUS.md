# Implementation Status

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Branch:** `workstream/refactored-delivery-os-gate0`

Status vocabulary: `NOT STARTED` · `DISCOVERY` · `IMPLEMENTING` · `TESTING` · `BLOCKED` · `COMPLETE`

**Deployment state: NOT DEPLOYED.** No DDL has been written, no production database
touched, no DNS, no client invitations, no production email, no billing. Master plan §20
respected in full.

---

## Gate status

| Checkpoint | Gate | Status |
|---|---|---|
| A | 0 Discovery | **COMPLETE** — this deliverable |
| B | 1 Delivery Domain + Tenancy | **BLOCKED** — 2 prerequisites |
| B | 2 Delivery Roles + Authority | NOT STARTED |
| B | 3 Delivery Contract + Project Graph | NOT STARTED |
| C | 4 Intake + Discovery | NOT STARTED |
| C | 5 Trust Before Intelligence | NOT STARTED — **unblocked**, D-04 closed 2026-08-23 |
| C | 6 Design Decision Loop | NOT STARTED |
| D | 7 Release/Story Graph + SBP | NOT STARTED |
| D | 8 Execution Plane + Claude Code | **BLOCKED** — E-01, S-01 |
| D | 9 Quality OS + Evidence | NOT STARTED |
| E | 10 Client Review Room | NOT STARTED |
| E | 11 Builder Workspace + Ledger | NOT STARTED |
| E | 12 Capacity + Economics | NOT STARTED |
| F | 13 Delivery Profiles | NOT STARTED |
| F | 14 Release + Operate + GOALS | NOT STARTED |
| F | 15 Case Study + Attribution + E2E | NOT STARTED |

**No feature code was written.** Gate 0 forbids it and none exists on this branch.

---

## Gate 0 deliverables

| Document | Content |
|---|---|
| `CURRENT_STATE.md` | Verified state of tenancy, `Project`, SBP, execution, approvals, evidence; answers to all 13 Gate 0 questions |
| `DOMAIN_REUSE_MAP.md` | 34 capabilities: 9 REUSE, 12 EXTEND, 13 BUILD |
| `DATA_OWNERSHIP_MATRIX.md` | Tenancy-by-parent rule; 2 tables carry `tenant_id`, 16 scope by join |
| `AUTHORIZATION_MATRIX.md` | Tenant vs delivery roles; full 13-role × 13-permission grid; R0–R5 mapped onto the existing R0–R4 |
| `SBP_INTEGRATION_MAP.md` | Module-by-module reuse tiers + backward-compat contract |
| `EXECUTION_CAPABILITY_MAP.md` | Claude Code absent; `previewStackService` as workspace base; S-01; no durable queue |
| `EVIDENCE_INTEGRATION_MAP.md` | `delivery_evidence` + the one-way projection rule |
| `CLIENT_PORTAL_MAP.md` | No client surface exists; server-side projection requirement |
| `CASE_STUDY_INTEGRATION_MAP.md` | Case Study OS does not exist; adapter + allowlist design |
| `ROUTE_IMPACT.md` | `/refactored` clean; route trees; what must not change |
| `SCHEMA_CONFLICTS.md` | C-01 … C-06 |
| `MIGRATION_STRATEGY.md` | Additive DDL, rehearsal requirement, rollout order, rollback |
| `TARGET_ARCHITECTURE.md` | 14 Mermaid diagrams |
| `TEST_PLAN.md` | Per-gate checks, SBP regression tripwires, failure-first list |
| `BASELINE_TEST_RESULTS.md` | tsc 2 known artifacts; 879 tests passing |
| `IMPLEMENTATION_STATUS.md` | This file |

Deferred to later gates per master plan §18 (required "by completion", not at Gate 0):
`IMPLEMENTATION_DEVIATIONS.md`, `VALIDATION_REPORT.md`, `SECURITY_MODEL.md`,
`EXECUTION_PROVIDER_CONTRACT.md`, `DELIVERY_PROFILE_CONTRACT.md`,
`TRUST_BEFORE_INTELLIGENCE_INTEGRATION.md`.

---

## Escalations — Ali's decisions, not Claude's

Root `CLAUDE.md` classes all four as governance boundaries. Recommendations given;
none acted on.

### ESC-1 — `Organization.owner_enrollment_id` must be relaxed (C-02) — ✅ **DECIDED**

`allowNull: false, unique: true`, FK to `enrollments`. An external client company cannot
be represented. Master plan §6 hangs the whole commercial chain off `Organization`, and
**the plan does not flag this** — it flags the equivalent on `Project` but not on its
parent.

*Recommendation was:* relax to nullable, drop the unique constraint, discriminate on the
existing `organization_type` column.

**Decision: Option A, approved by Ali on 2026-08-23.** Gate 1 will relax
`owner_enrollment_id` to nullable and drop the unique constraint, on the existing
`organizations` table. No `ClientOrganization` table; no re-parenting of engagements onto
`Brand`.

Conditions carried into Gate 1:

- Existing rows keep their owner and their FK. The change is a **relaxation**, so nothing
  currently valid becomes invalid.
- Every read path in `orgService.ts` / `adminOrgService.ts` that assumes a non-null owner
  must be audited and null-guarded in the same change.
- `organization_type` becomes the discriminator between a manager's management account and
  a client company. Existing rows are backfilled to the management-account value.
- **Not cleanly reversible.** Once a client org exists, re-adding `NOT NULL UNIQUE` fails.
  Recorded so that a later rollback plan does not assume otherwise.

*Class:* schema change to a live production table. Decided by the DRI.

### ESC-2 — Multi-tenancy Gate 5 (Organization scoping) must close first

`orgService.ts` and `adminOrgService.ts` contain **zero** `tenant_id` references
(verified, not inferred). Deferred deliberately by the multi-tenancy work on the
reasoning that every org today is Colaberry Enterprise — sound then, expiring the moment
this plan creates an AI Flotation client org.

*Recommendation:* close it in the multi-tenancy workstream, not silently here. It is
listed as a Gate 1 prerequisite by the master plan itself.

*Class:* cross-workstream dependency + security posture.

### ESC-3 — Claude Code SDK is a new external dependency (E-01)

Not installed. `@anthropic-ai/sdk ^0.106.0` is present but is not the coding agent.

*Recommendation:* adopt the official SDK behind the `ExecutionProvider` seam.
Reimplementing an agentic coding loop on raw Messages API means rebuilding tool dispatch,
file editing and permission gating — precisely the parts carrying master plan §11's
security requirements.

*Class:* external dependency introduction.

### ESC-4 — Execution isolation model (S-01)

`previewStackService` requires the Docker socket mounted into the **main backend
container**, which also serves public HTTP. Root-equivalent host control behind an
internet-facing process. Today's blast radius is students' own repos; Gate 8's would be
client repositories under commercial and government contracts.

*Recommendation:* GitHub Actions runner for MVP — the only option of the three the master
plan permits that requires no new isolation code to be correct. Three of the eight
default-deny rules are unenforceable until this is decided.

*Class:* production infrastructure + security posture.

---

## Deviations

| ID | Deviation | Impact |
|---|---|---|
| **D-00** | Requested in a checkout **2,722 commits behind** `origin/main` with ~50 files dirty from concurrent sessions. Work moved to an external worktree off `origin/main` | All findings are against `d1d46d1e`, not the OneDrive tree |
| **D-01** | `buildPlanIngestService.ts` — named in master plan §2.3 as a reuse target — exists **only** in the stale checkout, not on `main` | A plan written from the OneDrive tree would have designed around a service that no longer exists |
| **D-02** | Master plan §6 requires `Organization` as parent, but `Organization` is an enrollment-bound management account | ESC-1 |
| **D-03** | Master plan Gate 2 proposes R0–R5 as new; R0–R4 already exist on `tickets.risk_tier` with a `shadow_logged` approval mode | Extend, do not duplicate. Reduces Gate 2 scope |
| **D-04** | **CLOSED 2026-08-23.** The canonical book was read (`manuscript/` @ `main`). The plan's vocabulary is correct, but the plan's caution "do not invent scores if the book does not define them" inverted the real finding: the book **does** define them — INPACT 1–6 per dimension (36 max, scaled to 100), GOALS 1–5 per dimension (25 max), plus a mandatory INPACT dependency order and regulatory thresholds citing EU AI Act 2024/1689 Arts. 9–15 and NIST AI RMF | Gate 5 **unblocked**, and constrained: it must use those exact scales, not design its own. See `TRUST_BEFORE_INTELLIGENCE_INTEGRATION.md`. Two follow-ups remain: Chapter 9 (`measuring_agent_readiness`) and the appendices' scoring methodology were not read — required before the assessment UI is built |
| **D-05** | Case Study OS does not exist; the plan treats it as an existing consumer. A `casestudy-os-wt` worktree exists locally but nothing of it is on `main` | Gate 15 is adapter + candidate only. Check that branch before building |
| **D-06** | No durable job queue. `ExecutionRun` needs one | DB-as-queue with `SELECT … FOR UPDATE SKIP LOCKED`. No new dependency |
| **D-07** | AI provider abstraction partial — 43 files instantiate OpenAI directly | Observation. Out of scope; the plan should not claim "engines are replaceable" platform-wide |
| **D-08** | Playwright not executable here — no running stack, no staging credentials | Reported as **not executed**, never as passing. Same as multi-tenancy D-10 |
| **D-09** | One baseline test timed out under parallel load; passes 8/8 in isolation at 8.3 s | Environmental, not a code defect. Recorded rather than re-run into a green number |
| **D-10** | `EvidenceRecord.enrollment_id` is NOT NULL and `EvidenceSource` is a closed 9-value union | Sibling `delivery_evidence` with a one-way projection (C-03) |
| **D-11** | Accessibility exists as a Claude **skill**, not a service that can emit an evidence row | Gate 13 makes it a mandatory government release gate. A skill cannot gate a release; Gate 9 must make it runnable |

---

## Verification evidence

| Claim | Evidence |
|---|---|
| Tree 2,722 behind | `git rev-list --left-right --count origin/main...HEAD` → `2722  76` |
| Base SHA | `d1d46d1e72ead44d6e4c04d2ca7c54966843d51e` |
| `Project` NOT NULL | `models/Project.ts:98-109` |
| `Organization` enrollment-bound | `models/Organization.ts:72-77` |
| Org services unscoped | `grep -c tenant_id` → `0` and `0` |
| Claude Code absent | no match in `backend/src`, `frontend/src`, any `package.json` |
| Docker socket assumption | `services/previewStackService.ts` header |
| R0–R4 exists | `services/agentAutonomy.ts:65`, `models/ApprovalRequest.ts` |
| `/refactored` clean | no match in route trees |
| 32 `Project` consumers | ripgrep across `backend/src` |
| 53 `ensure*Schema` modules | `find backend/src -name "ensure*Schema*.ts" \| wc -l` |
| Backend typecheck | 2 errors, both `@anthropic-ai/sdk` junction artifacts. TS **5.9.3** pinned |
| SBP + tenancy tests | 50/51 suites, **879 passed**, 1 environmental timeout, 5 skipped |

---

## Gate 0 verdict

**The source-of-truth map is not ambiguous. Checkpoint B may proceed** once ESC-2 closes.
ESC-1 is decided (Option A, 2026-08-23). ESC-3 and ESC-4 block Gate 8 only and can be
decided later, though deciding S-01 early changes the Gate 8 design materially rather than
cosmetically.

**Remaining blocker for Gate 1: ESC-2 alone** — organization tenant scoping, which belongs
to the multi-tenancy workstream. ESC-1's approved relaxation makes that scoping *more*
urgent, not less: the moment `organizations` can hold a client company, an unscoped
`orgService` is a cross-tenant read path rather than a theoretical one.

The most useful thing Gate 0 found is that **the plan is roughly one third greenfield**.
Tenancy, the plan/gate/decomposition engine, approvals with a shadow mode, bounded
concurrency, idempotent repo writing and a container-based workspace provider all already
exist. What does not exist is the delivery domain on top of them, the client surface, and
the Claude Code execution seam.

The most dangerous thing it found is **D-01**: the master plan names a file as a reuse
target that has not existed on `main` for thousands of commits. That is not a criticism of
the plan — it is the reason Gate 0 is a gate.
