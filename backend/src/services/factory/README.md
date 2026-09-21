# AI Project Factory — generation chain (Phase 2)

The factory turns a contract **requirement + understanding** into a coherent **process
decomposition** — tasks, a workforce, and a START→END flow graph — behind the deterministic
`factoryValidate` gate. It is a **separate lane** from the Student Build Pipeline (`services/sbp/`):
SBP produces a `BuildPlan` of stories for a student's capstone; the factory produces a
`FactoryProject` for a `delivery_projects` contract. They share nothing and must not be merged.

Phase 1 shipped the contracts + the gate + a hand-built sample (no LLM). **Phase 2 adds the LLM
decomposition**, mirroring SBP's proven shape (decompose → gate → repair) but making the pure
`factoryValidate` the single enforcement point. It ships **dark** behind `ENABLE_FACTORY_GENERATION`.

## The chain

```
buildFactoryDecomposeInput   (factoryDecomposeInput.ts — PURE)
   requirements + understanding → classified SourceBlocks (blk-<reqId>, never 'unresolved')
   + the grounded prompt input. Establishes SOURCE_COVERAGE upstream: every requirement is a
   citable block.
        │
buildFactoryDecomposeUserPrompt  (factoryDecomposePrompt.ts — PURE)
   states EVERY gate rule to the model in its own output vocabulary (granularity, one START /
   ≥1 END / reachable graph, DECISION branches, PERFORMER + agent-oversight, source citation,
   precedence/method, effort-basis). Untrusted source text is fenced as DATA (SAFE-002).
        │
factoryDecompose             (factoryDecompose.ts — the bounded LLM call)
   ONE OpenAI call, response_format = FACTORY_DECOMPOSITION_JSON_SCHEMA (strict; oneOf→anyOf via
   toStrictSchema). Explicit timeout, retry-once-then-fail-closed, classified error_class. Returns
   the raw {processes, tasks, assignments, transitions, roles} — NOT gated.
        │
assembleFactoryProject       (factoryAssemble.ts — PURE, deterministic)
   keeps the model's task/process/role handles; DERIVES idempotent assignment/edge ids via
   factoryId(...); ATTACHES the deterministic source_blocks / requirements / tracks from the input;
   defaults allocation/role_map to []. → a complete FactoryProject.
        │
factoryValidate / factoryErrors   (factoryValidate.ts — PURE, the GATE)
   the deterministic judge. WORK_REFERENCE, SOURCE_COVERAGE, PERFORMER, OVERSIGHT,
   START/END/REACHABILITY/BRANCH_KIND/DECISION/LOOP, DUPLICATE_ASSIGNMENT, EFFORT_EVIDENCE.
        │  (errors > 0)
repairDecomposition          (factoryRepair.ts — bounded, monotone)
   hands the model the violations verbatim + a per-rule remedy; re-assembles + re-gates each
   candidate; keeps it ONLY if it strictly reduces the error count; capped at 3; fails closed.
        │
factoryGenerate              (factoryGenerate.ts — the orchestration)
   input → decompose → assemble → gate → (repair if needed) → { project, issues, accepted }.
   INVARIANT: accepted === (factoryErrors(project).length === 0). Never accepts a project with a
   gate error; never self-certifies. Produced-but-invalid ⇒ refuse; failed-to-produce ⇒ throw.
        │
factoryGenerateIfEnabled     (factoryGenerationEntry.ts — the DARK switch)
   inert unless ENABLE_FACTORY_GENERATION=true: no model call, refuses with
   FACTORY_GENERATION_DISABLED. A live route (Phase 3+) will call THIS, never factoryGenerate.

assertApprovable / approveProcessDocument  (factoryApproval.ts — the WRITE gate)
   a document may only be approved when factoryErrors(doc_json) is empty; a malformed document is
   MALFORMED_DOCUMENT. The gate guards the write, not just generation.
```

## What this is NOT (Phase 2 scope)

- No live route/trigger wired into intake (Phase 3+). Phase 2 is a callable, tested capability.
- No UI / command centers (Phase 3), no evidence/approvals surfaces (Phase 4), no builder (Phase 5).
- No change to `services/sbp/**` or `BuildPlan` — the live student build pipeline is untouched.
- No new dependency: the OpenAI client/key SBP already uses; every test mocks it (no network in CI).

## Flipping the flag

Set `ENABLE_FACTORY_GENERATION=true` on the backend to enable the capability. Default off. See the
run handoff (`.loop-architect/runs/20260921-064616-ai-project-factory-phase2/handoff.md`) for the
numbered verification steps and rollback.

## Command Center — the read surface (Phase 3)

The admin **Factory Command Center** (`/admin/factory`, Program section) renders one delivery contract's
decomposition. It is READ-ONLY and additive; the write actions (approve / request-changes) are disabled and
land in Phase 4 (the gated `approveProcessDocument` already exists).

```
factoryProjectView.ts (PURE)
  reconstructFactoryProject({ deliveryProjectId, docJson, tracks, requirements })
    merges the persisted doc_json SUBSET (processes/roles/tasks/assignments/transitions/allocation/
    role_map/source_blocks) with the contract_tracks (→tracks) and contract_requirements (→requirements)
    rows into a full FactoryProject.
  factoryProjectView(project, opts)
    → the command-center view model: tracks, process, flow, allocation, roster (each agent with its
      accountable human), compliance, role map, and a gate summary from the REAL factoryValidate.

routes/admin/factoryRoutes.ts  (requireSection('program') + Zod, lazy-loaded models)
  GET /api/admin/factory/sample                    → the Phase-1 sample view (day-one fixture, no DB)
  GET /api/admin/factory/contract/:deliveryProjectId → reconstruct a real contract; 404 until one exists
  (mounted in adminRoutes.ts; mgmtSectionGate maps /api/admin/factory → 'program')

frontend/src/services/factoryApi.ts + pages/admin/AdminFactoryCommandCenterPage.tsx
  the typed client + the page (Bootstrap 5 + admin-shell + RemixIcon + tokens), registered at
  /admin/factory with a Program nav link (section 'program', agreeing with the backend gate).
```

Fixture-first: the sample renders on day one; a real contract needs a `delivery_projects` engagement/tenant
(a later delivery-domain integration). See
`.loop-architect/runs/20260921-p3-command-center/handoff.md` for numbered verification steps.
