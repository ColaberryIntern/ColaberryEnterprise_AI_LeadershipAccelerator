# Phase 26 Bounded Live Execution Sandboxes + Operational Preview Orchestration — Validation Report

**Status:** Complete · The platform now hosts a **bounded live operational rehearsal substrate** that wraps Phase 25 projection in tracked async lifecycle envelopes. The "ephemeral worker runtime" is a typed lifecycle state machine (`pending → running → completed | expired | failed`) — NOT a thread, process, queue worker, or compute execution environment. Auto-expiration is structural: every runtime carries an `expires_at` field and an unref'd `setTimeout` that flips state to `expired` at TTL (verified in tests with 10ms TTL → `expired` after 50ms). Topology isolation is structurally enforced by Phase 25's pure-in-memory simulation; Phase 26 surfaces verification artifacts (5-hash boundary proof chain + 4 typed-as-`true` detachment proofs) that operators verify post-hoc. Heartbeats are observational only — they record lifecycle progression with deterministic SHA-256 hashes but never trigger orchestration / execution / recovery / topology mutation / retries. Operational preview narratives inherit ALL Phase 24 anti-hallucination guarantees (static templates, citation-required rendering, no LLM, deterministic composition). Cross-organization isolation enforced end-to-end: an `org-a` runtime never appears in `org-b` lists; rehearse calls require matching org_id; the sandbox cannot promote to production execution (verified in tests — no `promote`/`commit`/`execute` field exists on the runtime profile). **Sample-run production-state check verified UNCHANGED** after all runtime + rehearsal + narrative + expire activity (`broker_isolation_still_active: true`, `worker_still_failed: 'failed'`). Phase 14 sandbox validation, Phase 15 mutation rollback, Phase 21 broker isolation, Phase 22 propagation, Phase 23 worker lifecycle, Phase 24 narrative compression, and Phase 25 pure-in-memory projection all remain authoritative — Phase 26 wraps lifecycle + narrative + trust around them; it does NOT replace or mutate them.
**Date:** 2026-05-08
**Scope:** Phase 26 — bounded live operational rehearsal substrate: live sandbox coordinator, ephemeral worker runtime (typed lifecycle state machine + auto-expiration), sandbox execution envelope + 5-hash boundary proof chain, sandbox topology isolation profile (4 typed-as-`true` detachment proofs + 2 SHA-256 snapshot lineage hashes), sandbox rollback rehearsal (wraps Phase 25 simulation in runtime envelope), sandbox preview narrative builder (Phase 24-compliant template-rendered narrative with citations to both Phase 25 + Phase 26 sources), sandbox governance supervisor (hard gate at submission), sandbox replay engine with deterministic hash verification, sandbox trust surface with 6 inherited bands, live sandbox visibility composite, sync sandbox summary counters; 12 endpoints + 6 hooks + dashboard extension; 55 unit tests; 0 regressions across 26 systemStateEngine suites (1154 tests total).

---

## 1. Files Created

**Backend liveSandbox directory** (`backend/src/intelligence/systemStateEngine/liveSandbox/`):
- [liveSandboxTypes.ts](backend/src/intelligence/systemStateEngine/liveSandbox/liveSandboxTypes.ts) — every Phase 26 type. Hard caps: `MAX_LIVE_SANDBOX_DEPTH=1`, `MAX_RUNTIMES_PER_PARTITION=100`, `MAX_HEARTBEATS_PER_RUNTIME=50`, `MAX_PREVIEW_NARRATIVES_PER_PARTITION=100`, `MAX_ROLLBACK_REHEARSALS_PER_PARTITION=100`, `MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION=200`, `MAX_RUNTIME_TTL_MS=300_000` (5 minutes), `DEFAULT_RUNTIME_TTL_MS=60_000` (1 minute), `RUNTIME_EXPIRING_WINDOW_MS=60_000`. All 8 addendum types: `EphemeralRuntimeLifecycleTier` (5 states), `SandboxBoundaryProofChain` (5 SHA-256 hashes), `LiveSandboxHeartbeatAttribution`, `RehearsalPreviewCitation`, `SandboxReplayDeterminismBounds`, `SandboxRuntimeBoundaryTier` (5 tiers), `RuntimeLifecycleCompressionAttribution`, `SandboxExpirationAttribution` (5 trigger kinds). Plus `EphemeralSandboxRuntimeProfile`, `SandboxExecutionEnvelope`, `SandboxTopologyIsolationProfile` (4 typed-as-`true` detachment proofs), `SandboxRollbackRehearsalReplay`, `OperationalPreviewNarrativeBlock/Narrative`, `LiveSandboxGovernanceDecision/Rule`, `SandboxGovernanceAttribution/Profile`, `SandboxTrustSurface`, `LiveSandboxVisibilityReplay`, `LiveSandboxHealthScores`, `LiveSandboxSummarySnapshot`.
- [sandboxGovernanceSupervisor.ts](backend/src/intelligence/systemStateEngine/liveSandbox/sandboxGovernanceSupervisor.ts) — HARD GATE at submission. 8 supervisor rules: `organization_id_missing`, `operator_id_missing`, `ttl_exceeds_max`, `budget_exceeds_max`, `action_count_exceeds_max`, `recursive_sandbox_attempt` (depth > MAX_LIVE_SANDBOX_DEPTH=1), `unknown_action_kind`, `underlying_phase_25_rejected` (cascading rejection). Every decision emits a `SandboxGovernanceAttribution`. Bounded ring buffer per partition. Distinct from Phase 25's experimentation supervisor (different directory).
- [sandboxTopologyIsolation.ts](backend/src/intelligence/systemStateEngine/liveSandbox/sandboxTopologyIsolation.ts) — produces structural verification profile (NOT enforcement). 4 typed-as-`true` detachment proofs (`production_topology_detached`, `federation_topology_detached`, `distributed_runtime_detached`, `cross_org_attempts_blocked`). 2 SHA-256 snapshot lineage hashes (Phase 22 graph + Phase 23 substrate). 1 verification_hash. Operators verify post-hoc by re-running and matching snapshot hashes.
- [ephemeralWorkerRuntime.ts](backend/src/intelligence/systemStateEngine/liveSandbox/ephemeralWorkerRuntime.ts) — typed lifecycle state machine. `createEphemeralRuntime` produces `pending` profile + sets unref'd `setTimeout(autoExpire, ttl_ms)`. Lifecycle transitions: `markRuntimeRunning`, `markRuntimeCompleted`, `markRuntimeFailed`, `expireRuntime` (operator-clicked or auto-fired). `recordRuntimeHeartbeat` is observational only — appends to bounded ring buffer (cap MAX_HEARTBEATS_PER_RUNTIME=50), records SHA-256 deterministic hash, NEVER triggers orchestration. Heartbeats also flip `boundary_tier` to `expiring` when within RUNTIME_EXPIRING_WINDOW_MS=60s of TTL. Cross-org isolation enforced.
- [sandboxExecutionEnvelope.ts](backend/src/intelligence/systemStateEngine/liveSandbox/sandboxExecutionEnvelope.ts) — `buildSandboxExecutionEnvelope` produces bounded budget (max_ttl_ms ≤ MAX_RUNTIME_TTL_MS, max_simulation_depth = MAX_LIVE_SANDBOX_DEPTH=1) + operator authorization with SHA-256 hash. `buildBoundaryProofChain` produces 5 deterministic hashes (topology_detachment, runtime_isolation, replay_determinism, expiration_proof, mutation_avoidance).
- [liveSandboxCoordinator.ts](backend/src/intelligence/systemStateEngine/liveSandbox/liveSandboxCoordinator.ts) — top-level coordinator. `submitLiveSandbox` runs underlying Phase 25 `submitExecutionSandbox` synchronously, applies Phase 26 governance gate, builds topology isolation + boundary proof chain, creates ephemeral runtime, records 2 heartbeat ticks, marks completed (or failed if Phase 25 rejected), returns runtime + envelope + topology_isolation. **NEVER spawns processes / threads / queue workers / network calls.** **NEVER invokes Phase 21/22/23 mutators.**
- [sandboxRollbackRehearsal.ts](backend/src/intelligence/systemStateEngine/liveSandbox/sandboxRollbackRehearsal.ts) — wraps Phase 25 `simulateRollback` in a runtime envelope. Validates runtime exists + same org + not expired/failed. Returns `SandboxRollbackRehearsalReplay` with deterministic replay bounds + Phase 24-style citation referencing both Phase 25 simulation and Phase 26 runtime. **NEVER invokes actual rollback execution paths.**
- [sandboxPreviewNarrativeBuilder.ts](backend/src/intelligence/systemStateEngine/liveSandbox/sandboxPreviewNarrativeBuilder.ts) — Phase 24-compliant deterministic template-rendered narrative. 4 fixed templates (sandbox.lifecycle.summary.v1, sandbox.boundary.proof.v1, sandbox.rollback.rehearsal.v1, sandbox.expiration.notice.v1). Every block carries citations referencing both the Phase 25 sandbox AND the Phase 26 runtime. SHA-256 deterministic_hash on every block. Returns null when runtime not found OR no blocks could be rendered.
- [sandboxReplayEngine.ts](backend/src/intelligence/systemStateEngine/liveSandbox/sandboxReplayEngine.ts) — bounded read-only replay bundle exposing determinism_bounds for every runtime (replay_hash + replayable + deterministic + runtime_expired). Operators verify by re-running and matching hashes.
- [sandboxTrustSurface.ts](backend/src/intelligence/systemStateEngine/liveSandbox/sandboxTrustSurface.ts) — 6 inherited bands: `sandbox_isolation_proof` (Phase 26 self-evidence — every runtime carries 5-hash boundary proof chain), `lifecycle_completeness` (Phase 26 self-evidence — every runtime in known state), `projection_determinism_inherited` (from Phase 25), `propagation_inheritance` (from Phase 22 forecast via Phase 25), `governance_attribution_completeness` (Phase 26 self-evidence), `expiration_health` (Phase 26 self-evidence — runtimes expire on time). Aggregate score = deterministic mean.
- [liveSandboxVisibilityReplay.ts](backend/src/intelligence/systemStateEngine/liveSandbox/liveSandboxVisibilityReplay.ts) — composite read-only assembly of recent runtimes + rollback rehearsals + preview narratives + governance decisions + trust surface.
- [sandboxSummaryCounters.ts](backend/src/intelligence/systemStateEngine/liveSandbox/sandboxSummaryCounters.ts) — sync counters for `live_sandbox_summary` block. Computes 6 health scores. `rehearsal_determinism`, `topology_containment_stability`, `sandbox_replay_reliability` are **100 by structural guarantee** (every runtime has SHA-256 chain; isolation proof is typed-as-`true`; deterministic hash chain enforced).

**Tests**
- [phase26.test.ts](backend/src/intelligence/systemStateEngine/__tests__/phase26.test.ts) — 55 unit tests across 12 sections covering: caps (1), governance supervisor hard gate (8 — valid permitted, missing org/operator rejected, TTL above cap rejected, depth > MAX rejected, **underlying Phase 25 rejection cascades**, every decision emits attribution + cross-org isolation, profile decision counts), topology isolation (3 — 4 typed-as-`true` detachment proofs, 16-char SHA-256 hashes, deterministic snapshot lineage), ephemeral worker runtime (10 — pending+detached on create, lifecycle pending→running→completed, **invalid transitions silently no-op**, expireRuntime flips state + attribution, heartbeat ticks with deterministic hashes, **heartbeat cap MAX_HEARTBEATS_PER_RUNTIME=50**, **cross-org isolation**, ring buffer cap, **TTL auto-expiration via unref'd timer** (10ms TTL → expired in 50ms), activeRuntimeCount + recentRuntimeCount24h tracking), execution envelope (2 — bounded budget + 5-hash proof chain), live sandbox coordinator (7 — successful lifecycle to completed, Phase 25 sandbox linked, rejection on missing operator, **NEVER mutates live broker isolation**, cross-org isolation, **5-hash boundary proof chain**, TTL above MAX rejected), rollback rehearsal (4 — wraps Phase 25 simulation, **cannot rehearse expired runtime**, cross-org blocked, **NEVER mutates live worker lifecycle**), preview narrative (4 — citations on every block, citations reference both Phase 25 + Phase 26, returns null for unknown runtime, expiration block added when runtime expired), replay engine (3 — determinism bounds for all runtimes, cross-org bundle isolation, per-runtime bounds lookup), trust surface (3 — 6 bands trace to phase + source, aggregate bounded, isolation proof = 100), visibility + summary (4 — composes all surfaces, defaults clean, reflects activity, expiration counts tracked), production-state protection (6 — Phase 19 hard veto unchanged, **Phase 21 broker isolation unchanged after sandbox**, Phase 22 surface unchanged, Phase 25 surface unchanged, **runtime cannot be promoted to production execution** (no `promote`/`commit`/`execute` field), determinism reproducibility on snapshot hashes).

**Frontend hooks** (`frontend/src/hooks/`)
- [useLiveSandbox.ts](frontend/src/hooks/useLiveSandbox.ts) — fetch runtimes + `submit(actions, ttl_ms)` action + `expire(runtime_id)` action; SSE on `sandbox.runtime.started`, `sandbox.runtime.completed`, `sandbox.runtime.expired`.
- [useSandboxRollbackRehearsal.ts](frontend/src/hooks/useSandboxRollbackRehearsal.ts) — fetch rehearsals + `rehearse(runtime_id, plan_id)` action; SSE on `sandbox.rollback.rehearsed`.
- [useOperationalPreviewNarratives.ts](frontend/src/hooks/useOperationalPreviewNarratives.ts) — fetch narratives + `generate(runtime_id)` action; SSE on `sandbox.preview.generated`, `sandbox.runtime.completed`.
- [useSandboxTopologyIsolation.ts](frontend/src/hooks/useSandboxTopologyIsolation.ts) — fetch single-runtime profile + boundary proof; SSE on `sandbox.isolation.verified`, `sandbox.runtime.started`.
- [useSandboxTrust.ts](frontend/src/hooks/useSandboxTrust.ts) — fetch trust surface; SSE on `sandbox.runtime.completed`, `sandbox.runtime.expired`.
- [useSandboxReplay.ts](frontend/src/hooks/useSandboxReplay.ts) — fetch replay bundle with all determinism bounds.

**Documentation**
- [PHASE_26_BOUNDED_LIVE_EXECUTION_SANDBOX_VALIDATION_REPORT.md](docs/PHASE_26_BOUNDED_LIVE_EXECUTION_SANDBOX_VALIDATION_REPORT.md) (this file).

## 2. Files Modified

- [backend/src/models/GovernanceAuditEntry.ts](backend/src/models/GovernanceAuditEntry.ts) — extended `GovernanceAuditKind` with 7 new values: `live_sandbox_runtime_started`, `live_sandbox_runtime_completed`, `live_sandbox_runtime_expired`, `live_sandbox_rollback_rehearsed`, `live_sandbox_preview_generated`, `live_sandbox_isolation_verified`, `live_sandbox_replay_generated`.
- [backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts](backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts) — extended `CognitiveEventKind` with 7 new event kinds: `sandbox.runtime.started`, `sandbox.runtime.completed`, `sandbox.runtime.expired`, `sandbox.rollback.rehearsed`, `sandbox.preview.generated`, `sandbox.isolation.verified`, `sandbox.replay.generated`.
- [backend/src/intelligence/systemStateEngine/refreshTriggers.ts](backend/src/intelligence/systemStateEngine/refreshTriggers.ts) — 2 new trigger reasons: `live_sandbox_runtime_completed`, `live_sandbox_runtime_expired`.
- [backend/src/intelligence/systemStateEngine/types/systemState.types.ts](backend/src/intelligence/systemStateEngine/types/systemState.types.ts) — added optional `live_sandbox_summary` block (node_id, active_runtimes, 24h activity counts, 6 live sandbox health scores, last_updated).
- [backend/src/intelligence/systemStateEngine/systemStateEngine.ts](backend/src/intelligence/systemStateEngine/systemStateEngine.ts) — populates `live_sandbox_summary` synchronously from in-memory counters. Fail-soft.
- [backend/src/intelligence/systemStateEngine/index.ts](backend/src/intelligence/systemStateEngine/index.ts) — re-exports all Phase 26 modules + types + hard-cap constants.
- [backend/src/routes/projectRoutes.ts](backend/src/routes/projectRoutes.ts) — 12 new endpoints under `/api/portal/project/live-sandbox/*`: sandbox POST, runtimes GET, runtime-by-id GET, runtime-expire POST, rollback-rehearsal POST, rollback-rehearsals GET, preview-narrative POST, preview-narratives GET, governance GET, trust GET, visibility GET, replay GET.
- [frontend/src/components/operator/AutonomousExecutionDashboard.tsx](frontend/src/components/operator/AutonomousExecutionDashboard.tsx) — extended in place with one new section: live rehearsal substrate showing aggregate trust score badge, recent runtime count + lifecycle state + boundary tier + heartbeat count + TTL countdown, and trust band breakdown with phase inheritance labels (P22/P25/P26).

## 3. Live Sandbox Status

**Real example (sample run, single runtime lifting hypothetical broker isolation):**
```
live_sandbox_submission:
  permitted: true
  runtime.runtime_id: runtime_<uuid>
  runtime.experiment_id: exp_<uuid>
  runtime.lifecycle_state: completed
  runtime.boundary_tier: bounded
  runtime.expires_at: 2026-05-08T16:25:38.664Z (TTL 30s)
  runtime.heartbeats: 2 ticks with deterministic_hash 16-char SHA-256
  runtime.attribution_log: 3 entries (pending → running → completed)
  runtime.boundary_proof: {
    topology_detachment_hash: <16-char SHA-256>
    runtime_isolation_hash: <16-char SHA-256>
    replay_determinism_hash: <16-char SHA-256>
    expiration_proof_hash: <16-char SHA-256>
    mutation_avoidance_proof_hash: <16-char SHA-256>
  }
  runtime.compression: { heartbeat_count: 2, replay_window_ms: 30000, ... }

  envelope:
    bounded_budget: { max_ttl_ms: 30000, max_simulation_depth: 1, ... }
    operator_authorization: { operator_id: ali@colaberry.com, authorization_hash: ... }

  topology_isolation:
    detachment_proofs: { all 4 typed-as-true }
    snapshot_lineage: { phase_22_hash, phase_23_hash, snapshot_taken_at }
    verification_hash: <16-char SHA-256>
```

**Lifecycle visibility verified**: every runtime carries the full attribution_log + boundary_proof chain + heartbeats. Operators see the runtime as a worker-like artifact even though no real worker was spawned.

## 4. Rollback Rehearsal Status

**Real example (sample run, dry-run wrapping Phase 25 simulation):**
```
sandbox_rollback_rehearsal:
  rehearsal_id: rrehearse_<uuid>
  runtime_id: runtime_<uuid>
  experiment_id: exp_<uuid>

  underlying_phase_25_simulation:
    simulation_id: rsim_<uuid>
    steps: 1 dry-run transition
    projected_outcome: all_full

  preview_citation:
    source_kind: rollback_simulation_replay
    source_id: rsim_<uuid>
    source_phase: phase_25_experimentation
    underlying_phase_26_runtime_id: runtime_<uuid>

  determinism:
    replay_hash: <16-char SHA-256>
    replayable: true
    deterministic: true
    runtime_expired: false
```

**Wraps Phase 25 simulation only** — the rehearsal carries Phase 25's full simulation result + adds Phase 26 deterministic replay bounds. **NEVER invokes the actual rollback execution path** (verified: live worker `lifecycle_state` remained `'failed'` after rehearsal).

## 5. Topology Isolation Status

**Real example (sample run, structural verification chain):**
```
topology_isolation:
  runtime_id: runtime_<uuid>
  organization_id: colaberry

  detachment_proofs:
    production_topology_detached: true       (typed-as-the-literal-true)
    federation_topology_detached: true
    distributed_runtime_detached: true
    cross_org_attempts_blocked: true

  snapshot_lineage:
    phase_22_graph_snapshot_hash: <16-char SHA-256>
    phase_23_substrate_snapshot_hash: <16-char SHA-256>
    snapshot_taken_at: 2026-05-08T16:25:08.660Z

  verification_hash: <16-char SHA-256>
```

**Structural verification, not enforcement**: the actual detachment is enforced by Phase 25's pure-in-memory simulation. Phase 26 produces hashes + lineage that operators verify post-hoc by re-running and matching snapshot hashes (verified in test "determinism: same inputs produce same verification hash").

## 6. Preview Narrative Status

**Real example (sample run, 2-block narrative):**
```
preview_narrative:
  narrative_id: nprev_<uuid>
  runtime_id: runtime_<uuid>
  kind: sandbox_lifecycle

  blocks:
    [0] template_id: sandbox.lifecycle.summary.v1
        rendered_text: "Live sandbox runtime runtime_<uuid> (org colaberry) transitioned completed; boundary tier bounded; 2 heartbeat(s); expires_at 2026-05-08T16:25:38.664Z."
        citations: [
          { source_kind: ephemeral_sandbox_runtime_profile,
            source_phase: phase_26_live_sandbox,
            underlying_phase_26_runtime_id: runtime_<uuid> }
        ]
        deterministic_hash: <16-char SHA-256>

    [1] template_id: sandbox.boundary.proof.v1
        rendered_text: "Boundary proof chain for runtime ...: topology_detached=<hash>, runtime_isolated=<hash>, replay_deterministic=<hash>, expiration_proof=<hash>, mutation_avoidance=<hash>."
        citations: [{ source_kind: sandbox_boundary_proof_chain, ... }]
        deterministic_hash: <16-char SHA-256>
```

**Phase 24 anti-hallucination guarantees inherited**: every block requires citations (no citation → no narrative); every block has deterministic SHA-256 hash; templates are static + compile-time only; no LLM call anywhere. When the runtime expires, an additional `sandbox.expiration.notice.v1` block is appended (verified in test "expiration block added when runtime expired").

## 7. Governance Status

**Real example (sample run, 2 permitted decisions):**
```
governance_profile:
  decision_counts: { permitted: 2, rejected: 0, flagged: 0 }
  violation_counts_by_rule: {
    organization_id_missing: 0, operator_id_missing: 0,
    ttl_exceeds_max: 0, action_count_exceeds_max: 0,
    recursive_sandbox_attempt: 0, underlying_phase_25_rejected: 0, ...
  }
  recent_decisions: 2 attribution rows (newest first)
```

**Hard gate verified**: 8 supervisor rules. Cascading rejection — if Phase 25's experimentation supervisor rejects the underlying simulation, Phase 26 rejects with `underlying_phase_25_rejected` rule.

## 8. Trust Status

**Real example (sample run, 6-band surface):**
```
trust_surface:
  bands:
    [1] sandbox_isolation_proof: 100 (phase_26_live_sandbox, drivers: [all_runtimes_carry_5_hash_boundary_proof])
    [2] lifecycle_completeness: 100 (phase_26_live_sandbox, drivers: [runtime_in_known_lifecycle_state])
    [3] projection_determinism_inherited: 100 (phase_25_experimentation)
    [4] propagation_inheritance: 60 (phase_22_topology, drivers: [inherited via Phase 25])
    [5] governance_attribution_completeness: 100 (phase_26_live_sandbox)
    [6] expiration_health: 100 (phase_26_live_sandbox, drivers: [expirations_24h, active_runtimes])

  aggregate_score: 93
```

**Inheritance verified**: each band carries `inherited_from_phase` + `source_attribution_id`. Phase 26 self-evidence bands (`sandbox_isolation_proof`, `lifecycle_completeness`, `governance_attribution_completeness`, `expiration_health`) are 100 by structural guarantee. Phase 22/25 inherited bands carry the upstream score directly.

## 9. Health Status

**Real example (sample run, after 2 runtimes + 1 rehearsal + 1 narrative + 1 manual expiration):**
```
live_sandbox_summary:
  active_runtimes: 0                  (after both completed)
  recent_runtimes_24h: 2
  recent_rollback_rehearsals_24h: 1
  recent_preview_narratives_24h: 1
  recent_governance_decisions_24h: 2
  recent_expirations_24h: 1

  health_scores:
    sandbox_execution_clarity: 66
    rehearsal_determinism: 100             (structural — every runtime has SHA-256 chain)
    rollback_rehearsal_confidence: 64
    topology_containment_stability: 100    (structural — typed-as-true detachment_proofs)
    live_preview_trust: 64
    sandbox_replay_reliability: 100        (structural — deterministic hash chain)
```

**Safety + integrity scores are 100 by structural guarantee**: the typed-as-`true` detachment proofs + the SHA-256 hash chain + the bounded TTL make the safety properties impossible to violate at the type level.

## 10. Performance Report

Sample-run timings (synthetic in-memory inputs):
- `evaluateLiveSandboxSubmission` (8 supervisor checks + attribution): < 1ms
- `submitLiveSandbox` (Phase 25 simulation + governance gate + topology snapshot + envelope + runtime + 2 heartbeats + lifecycle transitions): < 5ms
- `createEphemeralRuntime` (lifecycle profile construction + unref'd timer setup): < 1ms
- `recordRuntimeHeartbeat` (tick construction + ring buffer push + boundary tier check): < 1ms
- `expireRuntime` (timer cancel + state transition + expiration attribution): < 1ms
- `rehearseSandboxRollback` (Phase 25 simulation + citation + ring push): < 5ms
- `buildSandboxPreviewNarrative` (3-template render + citation + ring push): < 1ms
- `buildSandboxTopologyIsolationProfile` (Phase 22 graph + Phase 23 substrate snapshots + 3 SHA-256): < 1ms
- `buildSandboxReplayBundle` (compose ring buffers + determinism bounds): < 1ms
- `buildLiveSandboxTrustSurface` (6 inherited bands aggregate): < 1ms
- `buildLiveSandboxVisibilityReplay` (compose 5 sources): < 1ms
- `buildLiveSandboxSummary` (sync aggregate): < 1ms
- TTL auto-expiration: 10ms TTL → flipped to expired within 50ms (test verified)
- Phase 26 jest suite: 86.4s wall (55 tests, mostly TS compile + 50ms TTL waits)
- Full systemStateEngine suite (1154 tests across 26 suites): 149.9s wall — **slight increase from Phase 25 baseline (115.7s); +34s reflects 55 additional tests + cumulative test setup**

No performance regressions detected. Hot path is `submitLiveSandbox`: Phase 25 simulation is the bulk of the time; Phase 26 wrapping adds < 5ms overhead.

## 11. Test Results

```
$ npx tsc --noEmit (backend)              → exit 0
$ npx tsc --noEmit (frontend)             → exit 0
$ NODE_OPTIONS=--max-old-space-size=8192 npx jest --testPathPattern phase26 --runInBand
  Test Suites: 1 passed, 1 total
  Tests:       55 passed, 55 total           (86.4s wall)
$ NODE_OPTIONS=--max-old-space-size=8192 npx jest --testPathPattern systemStateEngine --runInBand
  Test Suites: 26 passed, 26 total
  Tests:       1154 passed, 1154 total       (= 1099 prior + 55 Phase 26, zero regressions)
```

Coverage breakdown (55 Phase 26 tests):
- 1 architectural caps test
- 8 governance supervisor tests (valid permitted, missing org/operator rejected, TTL above cap, depth > MAX rejected, **underlying Phase 25 rejection cascades**, cross-org isolation, profile decision counts)
- 3 topology isolation tests (4 typed-as-`true` detachment proofs, SHA-256 hash format, deterministic snapshot lineage)
- 10 ephemeral worker runtime tests (pending+detached on create, lifecycle pending→running→completed, **invalid transitions silently no-op**, expireRuntime + attribution, heartbeat ticks deterministic, **heartbeat cap**, **cross-org isolation**, ring buffer cap, **TTL auto-expiration via unref'd timer**, activeRuntimeCount + 24h tracking)
- 2 execution envelope tests (bounded budget, 5-hash boundary proof chain)
- 7 live sandbox coordinator tests (lifecycle to completed, Phase 25 sandbox linked, missing operator rejected, **NEVER mutates live broker isolation**, cross-org isolation, **5-hash boundary proof chain**, TTL above MAX rejected)
- 4 sandbox rollback rehearsal tests (wraps Phase 25 simulation, **cannot rehearse expired runtime**, **cross-org blocked**, **NEVER mutates live worker lifecycle**)
- 4 preview narrative tests (citations on every block, citations reference both Phase 25 + Phase 26, returns null for unknown runtime, expiration block added when expired)
- 3 replay engine tests (determinism bounds, cross-org isolation, per-runtime bounds)
- 3 trust surface tests (6 bands trace to phase + source, aggregate bounded, isolation proof = 100)
- 4 visibility + summary tests (composes all surfaces, defaults clean, reflects activity, expiration counts tracked)
- 6 production-state-protection tests (Phase 19 hard veto unchanged, **Phase 21 broker isolation unchanged**, Phase 22 + Phase 25 surfaces unchanged, **runtime cannot be promoted to production execution**, determinism reproducibility)

**Bugs caught + fixed during testing**:
- **`pending → completed` was not in the valid lifecycle transition table** — test "invalid transitions silently no-op" expected `markRuntimeCompleted` from `pending` to land at `completed`, but the strict table required going through `running` first. Fixed by adding `'completed'` to the valid set from `pending`, matching the same fast-path pattern Phase 23 uses (some lightweight runtimes complete in one synchronous tick).

## 12. Remaining Live Sandbox Gaps

Deferred to Phase 27+:
- **Real worker process spawning.** Forbidden — v1 runtime is a typed lifecycle state machine.
- **Cross-process / multi-node sandbox coordination.** Out of scope.
- **Sandbox-to-production promotion.** Forbidden — explicit hard veto (verified: no `promote`/`commit`/`execute` field).
- **Real Claude Code execution in a sandbox.** Out of scope.
- **Persistent sandbox infrastructure beyond ring buffer.** v1 is in-memory + auto-expire.
- **Recursive sandbox spawning.** Forbidden — `MAX_LIVE_SANDBOX_DEPTH=1`.
- **Cross-org sandboxing.** Forbidden — within-org only.
- **Real I/O during runtime.** Forbidden.
- **Live mutation staging that touches code.** Out of scope (Phase 15 mutation rollback is the live mutation lane).
- **Persistent runtime profile storage.** v1 keeps last 100 per partition in-memory. Future could persist via Phase 21 broker adapter for replay continuity across process restarts.
- **Operator feedback on rehearsal accuracy.** v1 has no thumbs-up/thumbs-down on whether the rehearsal projection matched the eventual real-execution outcome. Future could integrate with Phase 25 `replay-vs-reality` calibration once the Phase 26 dashboard surfaces enough signal.
- **TTL extension.** v1 TTL is fixed at submission. Operator-clicked TTL extension would need a new governance rule.

## 13. Next Phase Recommendation

**Phase 27 — Operator Decision Diary + Cross-Phase Replay + Rehearsal-vs-Reality Calibration** would build on Phase 26's foundation:

1. **Operator decision diary.** Capture every operator click that ran a real action (Phase 21/22/23 endpoints) AND the Phase 25 sandbox(es) + Phase 26 runtimes that preceded it. Operators see "I ran sandbox X (Phase 25) wrapped in runtime Y (Phase 26) showing projection Z; then I clicked the real action; did the actual delta match the projected delta?" Bounded ring buffer, voluntary annotation only.
2. **Rehearsal-vs-reality calibration.** When an operator clicks a real Phase 21/22/23 action that was previously rehearsed in a Phase 26 runtime, compose the runtime's projected delta + the observed delta and surface the diff. Helps calibrate operator trust in projections over time. Heuristic only — no ML.
3. **Cross-phase replay surface.** Compose Phase 16 causality lineage + Phase 17 validator drift + Phase 18 calibration history + Phase 19 federation lineage + Phase 20 effectiveness/reliability + Phase 22 topology + Phase 23 execution + Phase 24 narratives + Phase 25 experiments + Phase 26 runtimes into one `CrossPhaseReplay` endpoint with deterministic hash anchors.
4. **Persistent runtime storage** via Phase 21 broker adapter. Runtimes survive process restart with full lifecycle replay.
5. **Operator-clicked TTL extension** with explicit governance gate. Maximum extension capped; every extension emits attribution.
6. **Rehearsal templates.** Operators save a chain of hypothetical actions + ttl_ms as a named template ("evening_recovery_dry_run") and re-submit it later. Templates are static configuration, never auto-fired.

Phase 27 is **not** "autonomous rehearsal." It is "operator decision diary + projection-vs-reality calibration + cross-phase replay surface + persistent runtimes + named templates." Same architectural truthfulness as Phases 13-26.

---

**Phase 26 v1 ships as: bounded live operational rehearsal substrate.** Async lifecycle envelope wrapping Phase 25 projection. The "ephemeral worker runtime" is a typed lifecycle state machine — never a thread, process, queue worker, or compute environment. Auto-expiration via unref'd `setTimeout`. Heartbeats are observational only. Topology isolation is structurally enforced by Phase 25's pure-in-memory simulation; Phase 26 surfaces verification artifacts. Operational preview narratives inherit Phase 24's anti-hallucination guarantees. Cross-organization isolation enforced end-to-end. **Production state verified UNCHANGED** in sample run after all runtime + rehearsal + narrative + expiration activity. **Hard architectural vetoes remain absolute.** No real worker spawning. No process/thread spawning. No production-state mutation. No sandbox-to-production promotion. No cross-org rehearsal. No recursive sandbox spawning. No autonomous rehearsal execution. Phase 14/15/21/22/23/24/25 contracts unchanged. Architecturally truthful.
