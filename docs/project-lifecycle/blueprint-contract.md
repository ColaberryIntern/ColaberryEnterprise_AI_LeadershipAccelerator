# Operating blueprint manifest — contract

**Status:** proposed (Phase 1 deliverable) · **Date:** 2026-10-01 · **Session:** CC-20261001-q7m4
Companion to `architecture.md`. Defines what the manifest holds, what it must never hold, and the invariants a test can check.

## 1. Shape: a manifest, not a second database

The manifest is an **immutable record that references exact revisions of existing normalized records**. It is not a copy of all project data.

This matters because a second mutable truth store immediately raises the question of which copy is right. The manifest answers "what exactly was approved" by pinning revisions; the domain tables stay the single source of their own data.

```
operating_blueprint_manifests
  ├─ identity:    tenant_id, project_id, schema_version, revision, content_sha256
  ├─ lineage:     prior_revision_id, superseded_by_id, status
  ├─ authorship:  created_by, created_at, approved_by, approved_at
  └─ references:  pinned revision pointers into the domain tables
```

**Immutable once approved.** An approved revision is never edited. A change forks a new revision — the pattern `factoryApproval.ts` already uses (fork-on-edit at `:147`) and `deliveryContractService.ts` reinforces with supersede-first ordering.

## 2. Required content (request §4.2, all nine bullets)

| # | Bullet | How the manifest satisfies it |
|---|---|---|
| 1 | Tenant/project identity, schema version, revision, content hash, creator, timestamps, status, prior revision | Identity + lineage + authorship columns above. **Hash binds tenant + project + revision** — closing `factoryApproval.contentHash`'s omission of tenant |
| 2 | Source evidence and requirements with stable item IDs, provenance, interpretation, confirmation status, source revision | Pinned references to `contract_requirements` / understanding items. Stable IDs minted at first capture, never derived from text (see `architecture.md` §7) |
| 3 | Business processes, tasks, transition graph, exceptions, business completion criteria | Pinned references to process/task records; the transition graph is validated, not stored twice |
| 4 | Workforce assignments and runtime agent contracts | Pinned assignment + agent-contract references, with **builder-agent and runtime-agent IDs in separate namespaces** |
| 5 | Workspace/screen map, action map, permissions, design decisions and visual references | Workspace/action map rows + the **selected** design variant and its visual-contract revision |
| 6 | Control policies, approval rules, authorized human owners | Typed policy rows with enforcement points; owners resolved against `DELIVERY_ROLES` |
| 7 | Effort assumptions, allocation measurements, uncertainty | §4 below |
| 8 | Approval records and dependency fingerprints | Approval binding per `approval-and-change-policy.md`; fingerprints per §5 below |
| 9 | Downstream plan/release/story references and validation evidence | Pinned plan/release/story IDs plus the evidence that validated them |

## 3. The six states stay distinct

The request requires `heard`, `proposed`, `confirmed`, `open`, `tested`, `production_verified` to keep distinct meanings. **Three already exist** as `SectionKind = 'heard' | 'proposed' | 'open'` (`services/delivery/buildBlueprint.ts:51`); `confirmed` exists in `services/sbp/intakeReview.ts:50` with `HUMAN_CONFIRMED` provenance mapping at `:109`; `tested` and `demonstrated` exist in the Factory's `EvidenceState`.

**Decision: extend the existing vocabulary to all six rather than inventing a parallel set.**

| State | Means | Must never mean |
|---|---|---|
| `heard` | the customer said it | that we agree with it |
| `proposed` | we are suggesting it | that they accepted it |
| `confirmed` | a human explicitly confirmed it | that it was merely not contradicted |
| `open` | genuinely undecided | zero, or a default |
| `tested` | a test covers it | that it runs in production |
| `production_verified` | observed working in production | that it was deployed |

The last two are the shipping-ladder distinction the repo already insists on: built, tested, merged, deployed and production-verified are five different states.

## 4. Business task and workforce contract (request §4.3)

**Business-runtime tasks are separate from software-build tasks.** One business task = one verb, one object, one outcome, one primary performer. Assignments may carry separate contributors, approvers, and an accountable owner.

Each business task records: source IDs, process ID, trigger, inputs, outputs, predecessor/branch info, completion criterion, exception/rework path, execution class, performer role, accountable human role, authority, tool needs, data sensitivity, effort/frequency basis, and the evidence required for success.

**Execution classes:** `ai_autonomous`, `ai_with_approval`, `deterministic_software`, `human`.

**Unknown allocation is visible and blocks full approval — but not draft exploration.** An approved manual-only project still records its allocation explicitly.

**Human accountability is mandatory for agent-operated processes.** A human role may be unstaffed in a draft; execution or activation requires a **resolvable authorized owner**.

This is not new machinery. `factoryValidate.ts` already enforces the hard part through two of its 13 rules:
- **`PERFORMER`** — every TASK/DECISION needs exactly one performer
- **`OVERSIGHT`** — an agent performer requires a human accountable or approver on the same task, and an agent may **never** hold accountable/approver itself (enforced in both directions, `factoryValidate.ts:76-90`)

**Extend these rules; do not duplicate them.**

**Agent contracts** cover purpose, assigned tasks, triggers, inputs/outputs, available tools, allowed and forbidden actions, autonomy, budgets/limits, escalation, retry/timeout boundaries, recovery, evaluation criteria, owner, and actual execution integration status. Tools must be real — no invented capabilities.

Agents are grouped by expertise, tools, data access and authority. **Not one agent per task, and not one agent per former employee.** `PlanAgent` already encodes "the LEAST autonomy the requirements permit" (`planContract.ts:114`) and must be "a person and not a department" (`:100`).

## 5. Honest effort measures (request §4.4)

Record baseline human minutes and frequency over an **explicit period**, each with basis `MEASURED` / `ESTIMATED` / `UNKNOWN` and its source. The Factory's `EffortBasis` enum already provides this vocabulary, and `factoryValidate`'s `EFFORT_EVIDENCE` rule already rejects a number whose basis is `UNKNOWN` — *"asking for completeness under a ceiling that forbids it is asking for a quiet lie"* is the house doctrine here.

**Formulas:**
- AI share = baseline effort of AI-assigned tasks ÷ **total assessed** baseline effort
- Deterministic-software share reported **separately**
- Hybrid tasks record execution and approval work **separately**, so an AI classification cannot conceal human review
- **Assessed coverage of the full task set is shown next to every percentage**

Expected and observed human minutes include approval, exceptions, correction and oversight. **Baseline work allocation is not the same as measured time saved** and must not be presented as it.

**85%+ is a target, not a pass threshold and not a safety override.** Below-target projects require a visible rationale and owner acceptance of the tradeoff. **Never reclassify a high-consequence human decision to inflate the score.**

Validation required: arithmetic, zero denominator, unknown values, units, repeated task frequencies, non-overlapping allocation.

**Unknown inputs yield incomplete coverage — never a fabricated zero or a precise-looking percentage.** Do not manufacture an 85% claim.

## 6. Dependency fingerprints

Each manifest component records a fingerprint of what it depended on. Unchanged components retain valid evidence while their fingerprints remain current; a changed dependency invalidates only what actually depended on it. This is what makes selective reapproval possible instead of re-approving everything (see `approval-and-change-policy.md`).

## 7. Invariants a test can check

1. An approved revision's `content_sha256` is reproducible from its pinned references.
2. Every citation resolves **within the correct tenant, project and revision**.
3. No approved revision is mutated — edits always fork.
4. Full approval is refused while any allocation is unknown; draft is not.
5. Every agent-performed task resolves to a human accountable role.
6. An effort percentage never appears without its assessed-coverage denominator.
7. A requirement's stable ID survives a wording correction; identical text alone does not establish identity.
8. The six states round-trip without collapsing into each other.
9. **Positive control:** each of the above has a deliberately-violating fixture that must fail. A check that cannot fail is not a check.

## 8. What the manifest must never contain

- Secrets, tokens, credentials, or raw environment values.
- A fabricated approval, provenance, confirmation, or effort figure.
- An uncontrolled dump of source text (redaction applies to audit events and manifest payloads alike).
- A duplicated mutable copy of domain data that could disagree with its source.
