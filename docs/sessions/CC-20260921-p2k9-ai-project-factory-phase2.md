# Session CC-20260921-p2k9 — AI Project Factory, Phase 2 (LLM decomposition behind factoryValidate)

Per-PR session log (separate from PROGRESS.md to avoid union-merge conflicts). Branch
`workstream/ai-project-factory-phase2`. Run via loop-architect (plan audited 20/20 on cycle 2 after a
16/20 cycle-1 catch; all 9 build tasks independently verified 12/12 by loop-task-verifier). Phase 2 =
the LLM decomposition that turns a requirement into a complete, gate-valid FactoryProject; additive,
flag-dark, the SBP student build pipeline untouched. Builds on Phase 1 (#2750): the typed contracts,
`factoryValidate`, transactional approval, identity map, additive schema.

- [x] Phase 2: LLM decomposition pipeline (prompt + input + bounded call + assembly + repair +
      orchestration + write-gate + dark flag), additive and behind ENABLE_FACTORY_GENERATION
  - Date: 2026-09-21
  - Session: CC-20260921-p2k9
  - What changed:
    - `contracts/factoryContractSchema.ts` (+ `contracts/__tests__/factoryContract.test.ts`): widened
      the structured-output mirror with `FACTORY_PROCESS/TRANSITION/ROLE_JSON_SCHEMA` and the wrapper
      `FACTORY_DECOMPOSITION_JSON_SCHEMA`, so the model emits a COMPLETE decomposition (not just
      tasks+assignments). The frozen FACTORY_TASK/ASSIGNMENT schemas are byte-unchanged; the lockstep
      test is extended to the new schemas AND to the known-valid sample's real records.
    - `services/factory/factoryDecomposePrompt.ts`: PURE prompt that states every factoryValidate gate
      rule in the model's output vocabulary; untrusted source fenced as DATA (SAFE-002).
    - `services/factory/factoryDecomposeInput.ts`: PURE adapter — requirements + understanding →
      classified SourceBlocks (`blk-<reqId>`, never 'unresolved'), the SOURCE_COVERAGE anchor.
    - `services/factory/factoryDecompose.ts`: the bounded OpenAI call (mirrors sbp/decomposeService) —
      strict schema via `toStrictSchema` (oneOf→anyOf, frozen source untouched), explicit timeout,
      retry-once-fail-closed, classified error_class.
    - `services/factory/factoryAssemble.ts`: PURE deterministic assembly — derives idempotent
      assignment/edge ids via factoryId, attaches source_blocks/requirements/tracks → a complete
      FactoryProject. Proven to reconstruct the known-valid sample with `factoryErrors === []`.
    - `services/factory/factoryRepair.ts`: bounded, monotone repair — violations verbatim + per-rule
      remedies; keeps a candidate only if it strictly reduces the error count; capped at 3; fail-closed.
    - `services/factory/factoryGenerate.ts`: the orchestration — input → decompose → assemble → gate →
      repair; INVARIANT `accepted === (factoryErrors(project).length === 0)`; produced-but-invalid ⇒
      refuse, failed-to-produce ⇒ throw. No persistence, no SBP.
    - `services/factory/factoryApproval.ts`: the WRITE gate — `assertApprovable` + `ApprovalGateError`
      inserted into `approveProcessDocument` after CAS/transition and before the write; a document with
      gate errors (or a malformed one) cannot be approved. Existing CAS/fork behavior byte-unchanged.
    - `services/factory/factoryGenerationEntry.ts`: the DARK switch — `factoryGenerateIfEnabled` is
      inert (no model call, FACTORY_GENERATION_DISABLED) unless `ENABLE_FACTORY_GENERATION=true`.
    - `config/featureFlags.ts` (+ `.env.example`): the `factoryGeneration` flag, default off.
    - `services/factory/README.md`: the chain documentation. SBP SKILL cross-reference added.
  - Verification: 11 factory suites / **111 tests** green under `jest -c jest.ci.config.ts
    src/services/factory` (schema lockstep + sample conformance, prompt gate-rule coverage, input
    classification/idempotency, decompose happy/retry/fail-closed/strict-transform, assemble
    zero-error golden reconstruction + id derivation, repair monotone/bounded, generate
    accept/repair/refuse/boundary/throw, approval CAS+fork+gate, flag dark/on). Every LLM call mocked.
    All 9 tasks graded 12/12 by loop-task-verifier (separate agent, never self-graded). Additive proof:
    zero diff under `services/sbp/**` or `BuildPlan`. Type-check clean for factory via
    `npx tsc --noEmit --skipLibCheck` (bare local tsc resolves a stale TS 4.9.5 = library `.d.ts`
    noise only; CI is authoritative).
  - Notes: ships DARK — deploying changes nothing until the flag is flipped. No live route/UI (Phase
    3+), no evidence/approvals surface (Phase 4), no builder (Phase 5). No schema change (additive
    code only). The factory chain is documented in a co-located README rather than bloating the
    hardened SBP runbook (a distinct subsystem); the SBP SKILL carries a one-line pointer to it.
