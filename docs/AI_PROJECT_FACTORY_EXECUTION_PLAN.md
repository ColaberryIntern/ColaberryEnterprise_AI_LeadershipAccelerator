# AI Project Factory & Internship Command Center — Execution Plan

Owner: Ali Muwwakkil
Date: 2026-09-20
Governs: the build described in `AI_PROJECT_FACTORY_AND_INTERNSHIP_COMMAND_CENTER_PLAN.md` (the product spec)
Method: this repo's `/loop-architect` skill, one governed run per phase

This is the **HOW**. The product spec is the **WHAT**. This plan adds three things the spec
leaves open: (1) the task-decomposition engine, built from the NuOrg teardown Ali emailed;
(2) how each phase is executed and graded through `/loop-architect`; (3) the sequencing,
dependencies and escalation boundaries so a phase never silently ships something governed.

---

## 0. The one principle everything hangs on

From CLAUDE.md and independently from the NuOrg write-up (Part 4): **the model does the
probabilistic work, code does the deterministic work.**

- **LLM:** decompose a requirement/contract into candidate tasks, normalize them (split
  compounds, merge duplicates, name stages), propose role→executor matches, draft prose.
- **Code:** coverage, structural validity, id generation, versioning, hashing, audit,
  approval transactions, and the human/AI allocation *score*. The model never grades itself;
  a `validate()` function with named rule codes does.

Every generated task, role, assignment, page and approval is **evidence-anchored and
re-derivable**. "Did the decomposition miss anything?" must be a deterministic query, not a
judgment call.

---

## 1. The task-decomposition engine (the part Ali flagged)

The NuOrg platform (`NuOrg/nuorg-python-platform`, commit e41d421) is the reference for the
deterministic half. It *parses* a procedure someone already wrote; it never *generates*
tasks — and requirement-to-tasks *is* the generation step. So we keep its **output contract,
precedence rules, gates, and review model**, and put an LLM where its regex recall stops.

### 1.1 Keep from NuOrg (proven, copy verbatim in spirit)

| Idea | How it lands here |
|---|---|
| Evidence is the unit of truth, not the task | Every task cites the requirement **block ids** it derives from; every block must be cited by a task or explicitly classified (context / constraint / out-of-scope). `SOURCE_COVERAGE` is a deterministic check on LLM output. |
| Fixed, written precedence of signals, each with a one-line reason | Prompt rule: **what the requirement states explicitly > what it implies > what the model adds**; the model tags each task `method: EXPLICIT \| INFERRED \| LLM`. |
| "Don't know" is a first-class value | `UNSPECIFIED` performer, `UNKNOWN` effort basis, unlinked target, typed `OPEN` question, `unresolved` block. The engine is **never rewarded for guessing**; the judge penalizes invention, not omission. |
| Three separate decisions | (a) what the task is, (b) which **role** performs it, (c) which **person / team / agent** fills the role. Titles are not roles; roles are scoped to the process, not a global catalog. This is exactly the separation an AI executor needs. |
| Executor is exactly one of person / team / agent, and a system needs a human accountable | Enforced twice (schema + DB CHECK). A system/agent can never be `APPROVER` or `ACCOUNTABLE`. |
| Structural validity is a machine gate with named codes + severities | Port NuOrg's ~30 rules: `SOURCE_COVERAGE`, `SOURCE_CLASSIFICATION`, `FIELD_CONFLICT`, `FLOW/START/END/REACHABILITY`, `LOOP`, `BRANCH_KIND/DECISION`, `PERFORMER`, `OVERSIGHT`, `EFFORT_EVIDENCE`, `DUPLICATE_ASSIGNMENT`, `STAGE_LIMIT`, etc. Errors block approval; the model gets the codes back and retries — no self-certification. |
| Approval is a transaction | version + `expected_version` (stale ⇒ 409), SHA-256 over (org revision id + document), immutable audit (DB trigger denies UPDATE/DELETE; audit-write failure rolls back approval), **fork-on-edit** (approved snapshot never mutated). |
| Two-level approval | **Documented** (flow is right; structural errors zero; role links may still be pending) vs **Full** (links resolved). Link readiness reported as `enrichment_status`, decoupled from "the process is right". |
| Idempotent ids from source identity | `uuid5(requirement_hash + cited_block_ids + kind)` ⇒ re-parse ⇒ identical ids ⇒ meaningful diffs. |
| Numbers carry a basis | No minutes without `ESTIMATED \| MEASURED` + a source. Same rule as our judge scores. |
| Tests named after failure modes | `test_source_block_cited_by_nothing`, `test_compound_sentence_becomes_two_tasks`, `test_two_paragraphs_become_one_task`, `test_role_matching_two_positions_is_not_auto_linked`, `test_agent_cannot_be_assigned_to_approval_step`, `test_changed_requirement_does_not_resurrect_removed_task`. The BREAK phase, written down. |

### 1.2 Add what NuOrg lacks (this is where our AI must be better)

- **Decompose, don't recognize.** The LLM turns a requirement / goal / narrative SOP into
  tasks against a **stated granularity rule**: *one task = one verb, one object, one
  outcome, one performer.* NuOrg returns "no activities found" here; that is precisely the
  gap.
- **Attributes an assignment decision actually needs** (NuOrg's task carries none): add
  `required_skills[]` (ids from our ontology, not free text), `judgment_level`,
  `decision_authority`, `data_sensitivity` (structured), `interaction_pattern`,
  `frequency`/`volume`, `confidence`, `method`.
- **Assignment as a separate scored pass.** Input: role + task attributes + approved org
  (positions, occupants, skills) + an **agent catalog** (capabilities, permitted data
  classes, tools). Output per role: a ranked candidate list with `match_method`
  (`EXACT \| ALIAS \| SKILL_OVERLAP \| LLM_SUGGESTED`) + `confidence`. **Auto-accept only
  EXACT-unique** (exactly as NuOrg does); everything else → review queue with evidence. The
  **human-or-AI decision is a score computed in code** over the task attributes, never asked
  of the model.
- **Re-derive, don't patch.** A changed requirement re-runs decomposition + assignment and
  shows a **diff** against the approved version; approve as a new version (hash + audit +
  fork-on-edit). Deterministic ids make the diff meaningful.
- **Confidence + threshold policy** everywhere the LLM contributes (NuOrg is binary because
  it is pure rules).

### 1.3 Source to hand the executing AI

`NuOrg/nuorg-python-platform` (private; ColaberryIntern is admin), commit e41d421:
`backend/nuorg/current_work/semantic.py` (extraction), `domain.py` (contracts + `validate()`),
`application.py` (lifecycle), `backend/migrations/004_current_work.sql` (constraints),
`backend/tests/test_structured_sop.py` (failure-mode tests). **Read for the contract, the
precedence, the gates and the tests — not to copy the regex decomposition, which is the part
we replace.**

---

## 2. How each phase runs through `/loop-architect`

Per the spec (§11) and the skill: **one `/loop-architect` run per phase**, invoked as
`/loop-architect <phase packet>`. Each run is self-governing:

1. **DISCOVER** — re-reads CLAUDE.md + nested CLAUDE.md, inspects the actual code/tests/CI
   (the spec's §10 foundations *drift*; verify them live).
2. **EXECUTION CONTRACT + PLAN** — writes `request.md`, `execution-contract.md`, `plan.md`
   to `.loop-architect/runs/<ts>-<slug>/` (survives compaction).
3. **PLAN AUDIT** — `loop-plan-auditor` subagent scores 10 dims (PASS ≥ 18/20, no zero, ≤ 3
   cycles). **Fires the Kickoff HTML dashboard on pass** — this is Ali's checkpoint before
   any building.
4. **EXECUTE** — one task at a time, smallest complete change; `loop-task-verifier` grades
   fresh evidence (PASS ≥ 11/12, ≤ 3 attempts). Halfway dashboard at 50%.
5. **QUALITY GATE** — `tsc --noEmit` (both stacks), jest, Playwright where present, lint,
   diff review. Shipping dashboard on green.
6. **DEPLOY** — documented prod mechanism only (`scripts/deploy-prod.sh`).
7. **PROD VERIFY** — `loop-production-verifier` checks the **live** release (≤ 2 fix cycles).
   Live dashboard on pass.
8. **HANDOFF** — `handoff.md`: prod link, plain-English test scenarios, regressions,
   limitations, rollback.

**Never self-grade** (plan, task, or deploy each go to their own subagent). **Hard-stops**
(→ Blocked dashboard, not silent execution): changes to `docker-compose*.yml`, `nginx/`, DB
engine/schema *redesign*, new paid external dependencies, or anything in CLAUDE.md's
Strategic Decisions list. Additive schema (a new nullable column + `ensure*Schema` migration,
the pattern already used for `archived_at` / `approval_state`) is PROCEED-tier; a schema
*redesign* is ESCALATE.

Each phase ends with **one concise review packet** for Ali: what changed, what was tested,
review URLs/artifacts, open limitations, the next decision.

---

## 3. The six phases (supersedes the old four-phase outline)

Sequential; each is one `/loop-architect` run. The reviewable exit result is the packet Ali
approves before the next phase starts.

### Phase 1 — Process & project contract
**Scope:** inspect current architecture; define the linked-tracks model (proposal + solution
build), the process/task schema (§1 above), the human/AI allocation matrix, the old→new role
map, the workspace/IA design, and the project-identity mapping (do **not** assume two domains'
`project_id` are the same entity — define the mapping).
**Exit:** one complete **sample contract project** showing both tracks, task ownership, and
consolidated human roles — as data + a rendered review, not prose.
**loop-architect packet emphasis:** this phase is mostly typed contracts + one worked
instance; the plan-audit must confirm the schema carries §1.2's added fields and the NuOrg
gate codes before any generation code is written.

### Phase 2 — Generation pipeline
**Scope:** update `/build-student-project` **and** the real pipeline together — `sbp/planContract.ts`,
decomposition, gates, `buildStoryPrompt.ts`, `renderDocs.ts`, verification. Wire the LLM
decomposition (§1.2) behind the deterministic `validate()` (§1.1). An agent-scoping pass must
**reconcile with explicit assignments**, not independently invent a workforce.
**Exit:** a newly generated project produces coherent process + workforce + UI architecture
with stories traced to process tasks and requirements. Generation **gates** reject: missing
outcomes, unmapped tasks, AI assignments without tools/authority, absent accountable humans,
unjustified page/login proliferation, orphan requirements, non-testable stories, proposal
claims without an evidence state.
**Watch:** `renderDocs.ts` write allowlist (`CLAUDE.md`, `docs/`, `.colaberry/`,
`artifacts/`) — reconcile new outputs with the canonical UI-map contract via reviewed
schema/writer changes or an approved import adapter; **never silently bypass the allowlist.**

### Phase 3 — Management workspaces
**Scope:** extend the shared admin delivery data; add process/workforce, proposal, and
whole-project views (the Internship Admin Project Command Center); scaffold the generated
**human operator** Command Center inside each app. Admin access uses **admin authorization,
never intern impersonation**; "See as intern" stays a distinct action.
**Exit:** admin sees the whole portfolio (counts drill into real records); a human operator
sees their authorized business work through **one login** (one identity, multiple permission
sets — never a superuser).

### Phase 4 — Evidence & approvals
**Scope:** page inventory (extend the UI-map contract, don't invent a competing one),
captures to approved object storage, review submissions bound to **immutable versions**,
version-specific decisions, revision tasks (one per retried request, not duplicated),
acceptance gates. Six separate decisions: process/role, proposed design, built-page visual,
functional, proposal, release. Extend `VisualReviewSession` / `visualReviewSessionService`.
**Exit:** demonstrate review, rejection, correction, resubmission, and **stale-approval
rejection** (an approved prior screenshot must not authorize a newer unreviewed build).

### Phase 5 — Builder integration *(blocked on a dependency — see §5)*
**Scope:** integrate the verified AI-builder runtime/identity + caption events, directions,
pause/resume, evidence links. Captions summarize **observable events** (each backed by a
timestamped event with run/story ids), never invent activity; pending ≠ successful;
disconnection shown honestly.
**Exit:** one real scoped build emits truthful captions and reaches human review; unavailable
runtime functions are explicitly marked. **Do not claim a generic agent dashboard satisfies
this.**

### Phase 6 — Migration & acceptance
**Scope:** backfill known processes/links without fabricating evidence (label legacy work
`unassessed` where evidence can't be established); page-consolidation plan + role-migration
map before touching nav/permissions; preserve old-route redirects.
**Exit:** one contract project **and** one ordinary AI project pass the full workflow; a
migration/rollback report and remaining gaps are visible.

---

## 4. Sequencing & dependencies

```
Phase 1 ─▶ Phase 2 ─▶ Phase 3 ─▶ Phase 4 ─▶ Phase 6
                                    │
Phase 5 (builder) ──────────────────┘   (needs §5 resolved; can start once 1–2 land)
```

- 1→2→3→4→6 is the spine. Phase 5 (builder captions) can proceed on the **integration
  contract** in the spec once Phases 1–2 exist, but its **employee-specific internals** wait
  on §5.
- The plan's **publication/materialization** status is separate from **acceptance of the
  delivered application** — do not block creating an instructional plan until the app exists.

---

## 5. The one open dependency (must resolve before Phase 5 internals)

The spec (§7, §13) records a separate-tab design for an AI employee that writes code with
visible captions. **It has not been located.** Related Reese/Dara / employee-consolidation
material is *not* that design. Needed to unblock Phase 5 internals: **the other tab's title,
shared link, employee name, or design file.** Until then, Phase 5 builds only to the caption/
event + work-assignment **integration contract** in the spec — it must not pretend the other
design was recovered, and must not spawn a duplicate employee.

---

## 6. Governance recap (so a run never surprises us)

- **Deploy only** via `scripts/deploy-prod.sh`; merge is Ali's click; prod verified live, not
  from a local build.
- **PROGRESS.md hard gate:** every task a run marks `passed` needs a session-ID-tagged entry
  with verification evidence.
- **Escalation-tier = hard-stop:** compose/nginx changes, schema *redesign*, paid deps,
  Strategic Decisions. Additive schema is fine.
- **Evidence discipline (from NuOrg + CLAUDE.md):** never present planned as delivered;
  verified ≠ self-reported; "don't know" is a stored value; the machine gate grades, not the
  model.

---

## 7. Immediate next action

Kick off **Phase 1** as a `/loop-architect` run with the packet in §3. Its plan-audit fires
the **Kickoff dashboard** — that is the first checkpoint to confirm the task-schema (§1)
before any generation code is written.
