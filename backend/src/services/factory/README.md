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
