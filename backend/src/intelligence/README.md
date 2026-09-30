# Intelligence

The decision layer. **529 files** — planning, reasoning, agent orchestration, and the System State Engine.

The split with `services/` is worth stating plainly: **`services/` does things, `intelligence/` decides what should be done.** A service sends an email; intelligence decides an email is the right intervention, for whom, and whether the system is allowed to send it unsupervised.

---

## Top-level engines

Seven engines plus an index sit directly in this directory:

| File | What it does |
|---|---|
| `nextBestActionEngine.ts` | Computes the ranked next action for an operator or agent. |
| `predictiveEngine.ts` | Forecasts outcomes from current state. |
| `processDiscoveryEngine.ts` | Discovers business processes from observed behavior. |
| `processScoringEngine.ts` | Scores discovered processes for value and risk. |
| `processSyncEngine.ts` | Keeps discovered processes in sync with reality. |
| `agentEvolutionEngine.ts` | Proposes changes to the agent fleet itself. |
| `autonomyProgressionEngine.ts` | Governs how much autonomy an agent has earned. |
| `selfOptimizationEngine.ts` | Tunes the system's own parameters. |
| `promptGenerator.ts` | Builds prompts from context. |

`autonomyProgressionEngine.ts` is the important one conceptually: autonomy in this system is **earned and revocable**, not configured. An agent's permitted blast radius is a function of its verified track record.

---

## Subsystems

### `systemStateEngine/` — 405 files

The largest subsystem in the repository, and the reason this directory is so big. It maintains a single authoritative model of what the system is doing, so that no other surface has to recompute it.

**Read [systemStateEngine/system/README.md](systemStateEngine/system/README.md) before writing any consumer of system state.** The one rule that matters: never re-derive readiness, coverage, maturity, queue order, or next-action anywhere else. The engine is the single source of truth. If it is missing a dimension you need, extend it — do not compute the value locally.

Entry points: `systemStateEngine.ts`, `index.ts`, `snapshotReader.ts`, `refreshTriggers.ts`.

State is read via `GET /api/portal/project/system-state` (or `readOrRebuild` server-side). Mutations fire `refreshSystemState(...)` fire-and-forget after success.

The subsystem is organized into ~40 capability modules, built out over a long sequence of phases (each documented in a `PHASE_*_VALIDATION_REPORT.md` under [../../../docs/](../../../docs/)):

| Cluster | Modules |
|---|---|
| **Observation** | `telemetry/` (16), `realtime/` (13), `capture/`, `behavioral/`, `vision/` (10), `visual/` (8), `multimodal/` (12) |
| **Reasoning** | `causality/` (12), `learning/` (10), `prediction/`, `scoring/` (7), `cognitiveCompression/` (12), `topology/` (10) |
| **Governance** | `governance/` (7), `governanceMemory/` (14), `adaptiveGovernance/` (11), `operatorGovernance/` (10), `policy/`, `autonomy/` (14) |
| **Action** | `execution/` (9), `executionSubstrate/` (11), `delegatedExecution/` (13), `executionEconomics/` (13), `mutation/` (9), `queue/` |
| **Resilience** | `remediation/` (14), `recoveryForesight/` (14), `stabilizationIntelligence/` (13), `incidents/` (9), `health/` |
| **Safe experimentation** | `experimentation/` (11), `liveSandbox/` (12), `simulation/` |
| **Distribution** | `distributedRuntime/` (11), `distributed/`, `federation/` (10), `federatedLearning/` (10), `transfer/` |
| **Continuity** | `operatorContinuity/` (14) |
| Contracts and tests | `system/` (contracts), `types/`, `__tests__/` (35) |

The design intent across those clusters: observe reality, reason about it, decide under governance, act within a bounded substrate, recover when wrong, and carry operator context across sessions.

### `agents/` — 19 files

The core Cory decision agents. These are the ones catalogued as "Intelligence" in the [agent catalog](../../../docs/agent-catalog/README.md):

`CoryStrategicAgent`, `ProblemDiscoveryAgent`, `RootCauseAgent`, `ActionPlannerAgent`, `RiskEvaluatorAgent`, `ImpactEstimatorAgent`, `ExecutionAgent`, `MonitorAgent`, `GovernanceAgent`, `AuditAgent`, `StrategicIntelligenceAgent`, `CostOptimizationAgent`, `RevenueOptimizationAgent`, `GrowthExperimentAgent`, `datasetRegistrationAgent`, `processObservationAgent`

Plus the wiring: `agentRegistry.ts`, `agentFactory.ts`, `agentMetadata.ts`.

They compose into a loop: discover a problem → find root cause → plan an action → evaluate risk → estimate impact → execute if permitted → monitor at 1h/6h/24h → roll back if the outcome is worse. `GovernanceAgent` and `AuditAgent` sit across the whole loop rather than at one step.

### `assistant/` — 14 files

The natural-language query pipeline behind Cory's conversational surface:

`intentClassifier` → `planBuilder` → `contextBuilder` → one of `sqlExecutor` / `vectorExecutor` / `mlExecutor` → `chartSelector` → `followupGenerator`

Quality gates: `chartValidationAgent`, `reportQualityAgent`, `dataAnalystAgent`. Orchestration: `coryAgenticEngine`, `queryEngine`, `openaiHelper`.

### `meta/` — 6 files

Agents that operate on the system itself: `architectureAgent`, `performanceAgent`, `promptOptimizationAgent`, `experimentAgent`, driven by `metaAgentLoop`.

### `requirements/` and `execution/`

Requirements discovery and the reality check that follows it:

- `requirements/`: `codeDiscovery`, `gapDetectionEngine`, `requirementGenerationEngine`, `requirementGrouper`, `taxonomyGenerator`
- `execution/`: `executionPlanner`, `requirementsEngine`, `reconciliationEngine`, `validationParser`, **`realityVerifier`**

`realityVerifier.ts` is the guard against the failure mode this whole layer is prone to: an agent reporting success it did not achieve. Requirements move `UNMAPPED -> VERIFIED` only on verified evidence.

### Supporting modules

| Module | Files | Purpose |
|---|---|---|
| `discovery/` | 5 | `schemaInspector`, `dataProfiler`, `relationshipMapper`, `semanticClassifier`, `dictionaryBuilder` — mirrors the Python engine's discovery layer. |
| `graph/` | 4 | `graphBuilder`, `graphQueryEngine`, `graphTypes`, `agentImportAttributor`. |
| `verification/` | 4 | `contractValidator`, `structuralVerifier`, `regressionDetector`, `verificationConfig`. |
| `services/` | 6 | `entityGraphService`, `dataAccessService`, `businessEntityService`, `executiveSummaryService`, `analyticsService`, `localQueryEngine`. |
| `strategy/` | 3 | `aiCOO`, `coryEngine`, `reasoningTimeline`. |
| `unifiedProjectState/` | 3 | `unifiedProjectStateBuilder`, `unifiedOperationalPriorityEngine`, `types`. |
| `profiles/` | 3 | `executionProfiles`, `modeResolver`, `strategyTemplates`. |
| `orchestrator/` | 3 | `plannerAgent`, `criticAgent`, `queryEngine` — plan/critique pairing. |
| `memory/` | 3 | `vectorMemory`, `learningEngine`, `actionMemoryBridge`. |
| `acceleration/` | 3 | `goldenPaths`, `stepBundler`, `systemBlocks`. |
| `steering/` | 2 | `intentClassifier`, `steeringExecutor`. |
| `scoring/`, `rules/`, `knowledge/`, `hitl/`, `autonomy/`, `architect/` | 1 each | Focused single-file modules. `hitl/` is the human-in-the-loop gate. |

---

## Working here

This directory carries the highest blast radius in the repo. An error in `services/` breaks a feature; an error here changes what the system decides to do on its own.

- **Autonomy changes are governance decisions**, not implementation details. Widening what an agent may do without approval is an escalation, not a PR.
- **Never bypass the System State Engine.** Recomputing state locally is the specific fragmentation this subsystem was built to end.
- **Verify, don't trust.** An agent's self-report is a claim. `realityVerifier` and the `verification/` module exist because claims and reality diverged often enough to need a permanent guard.
- **Every LLM call goes through `llmCallWrapper`** in `services/`, not directly to the SDK.
- Unit tests are required for new logic here — this is one of the two directories where CLAUDE.md makes that non-negotiable.

Related reading: [../../../docs/AI_OPERATIONS_ARCHITECTURE.md](../../../docs/AI_OPERATIONS_ARCHITECTURE.md), [../../../docs/AI_AGENT_AUDIT.md](../../../docs/AI_AGENT_AUDIT.md), [../../../system/README.md](../../../system/README.md).
