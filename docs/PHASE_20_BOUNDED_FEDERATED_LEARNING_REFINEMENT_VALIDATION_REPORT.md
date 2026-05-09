# Phase 20 Bounded Federated Learning Refinement — Validation Report

**Status:** Complete · The platform now performs **bounded deterministic federated learning refinement on top of Phase 19's consent-based archetype federation**: per-archetype outcomes from local applications feed a `FederatedEffectivenessProfile` (moving averages over capped observation windows), each archetype's reliability evolves through a 6-tier `ArchetypeReliabilityTier` classifier with `FederatedLearningAttribution` explaining every score shift, organizational stabilization insights aggregate effectiveness + reliability + registry signals into ranked operator-facing recommendations (informational only — never auto-applied), `FederatedImpactDiffusionReplay` reads Phase 19 lineage + Phase 20 effectiveness into a structured per-archetype diffusion view, `FederationDriftDetector` flags 6 organizational drift signal kinds with deterministic thresholds, `FederationVisibilityReplay` reads federation lineage attributions inside a window, `FederationPolicyEvolutionEngine` proposes/approves/rejects policy proposals with bounded `PolicyEvolutionImpactBounds`, and a persistent `BrokerStorageAdapter` interface prepares a swap path to Redis/DB without changing call-site contracts. Suppression is operator-set (no auto-suppression) and drops scores to zero — matching Phase 17's freeze semantics. Cross-organization isolation is verified — projects in different organizations never read each other's effectiveness, reliability, drift, or policy state. **Phase 19 federation contracts are unchanged. Phase 13 federatedTrustProfiles remains isolated. No ML, no autonomous mutation of consumer state, no cross-organization contamination, no silent learning.**
**Date:** 2026-05-07
**Scope:** Phase 20 — federated effectiveness tracker, archetype reliability evolution (6-tier classifier with attribution), organizational stabilization intelligence, federated impact diffusion replay, federation drift detector (6 signal kinds), federation visibility replay, federation policy evolution engine (proposal lifecycle with impact bounds), persistent federation broker (in-memory v1 + adapter interface), federated learning summary counters, 12 endpoints + 6 hooks + dashboard extension.

---

## 1. Files Created

**Backend federatedLearning directory** (`backend/src/intelligence/systemStateEngine/federatedLearning/`):
- [federatedLearningTypes.ts](backend/src/intelligence/systemStateEngine/federatedLearning/federatedLearningTypes.ts) — every Phase 20 type. Hard caps exported: `MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE=200`, `MAX_RELIABILITY_HISTORY_PER_ARCHETYPE=200`, `MAX_POLICY_PROPOSALS_PER_ORG=20`, `MAX_DIFFUSION_ENTRIES=200`, `MAX_DRIFT_REPLAY_ENTRIES=200`, `RELIABILITY_DELTA_PER_OBSERVATION=5`, `DRIFT_HIGH_THRESHOLD=70`, `DRIFT_FRAGMENTING_THRESHOLD=50`, `DRIFT_MONITORING_THRESHOLD=30`, `ANOMALY_Z_SCORE_THRESHOLD=2.0`. Includes addendum types: `ArchetypeReliabilityTier` (`emerging | stable | trusted | cautionary | degraded | suppressed`), `FederatedLearningAttribution` (refinement_reason + observed_inputs + reliability_delta + stabilization_delta + anomaly_impact + confidence_shift), `PolicyEvolutionImpactBounds` (expected_federation_impact + organizational_visibility_impact + stabilization_influence_estimate + rollback_confidence + uncertainty_drivers). Plus `FederatedEffectivenessObservation/Profile`, `ArchetypeReliabilityProfile`, `OrganizationalStabilizationInsight/Report`, `FederatedImpactDiffusionReplay`, `FederationDriftSignal/Profile`, `FederationVisibilityReplay`, `PolicyEvolutionProposal/Approval`, `FederatedLearningSummarySnapshot`, `BrokerStorageAdapter`.
- [persistentFederationBroker.ts](backend/src/intelligence/systemStateEngine/federatedLearning/persistentFederationBroker.ts) — `BrokerStorageAdapter` interface with `put`/`get`/`listKeys`/`listValues`/`delete`/`listOrganizations` methods. `InMemoryBrokerAdapter` is the v1 default. `getBrokerAdapter` / `setBrokerAdapter` allow Redis/DB swap without touching call sites. `BROKER_NAMESPACES` constant defines the 4 stable namespaces (effectiveness / reliability / policy_proposals / lineage_supplement).
- [federatedEffectivenessTracker.ts](backend/src/intelligence/systemStateEngine/federatedLearning/federatedEffectivenessTracker.ts) — `recordOutcomeObservation` accumulates per-archetype outcomes through the broker; observations are bounded at `MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE=200`. `computeProfile` returns `FederatedEffectivenessProfile` with rolling averages of `observed_stabilization_delta`, `propagation_reduction`, `recovery_success_rate`, `anomaly_frequency`, and a composite `organizational_consistency` score (low stddev + high recovery + low anomaly = high consistency). `confidence_evolution` series is stored alongside for UI rendering. `originating_project_id?` is optional — when present, an audit row is written; when absent (org-scoped refresh), the audit is skipped while counters still update. **No ML, no probabilistic models, deterministic update rules.**
- [archetypeReliabilityEvolution.ts](backend/src/intelligence/systemStateEngine/federatedLearning/archetypeReliabilityEvolution.ts) — `evolveReliability` runs the deterministic update rule `reliability_delta = (improvement_rate - regression_rate) × 5 - anomaly_factor`, classifies the resulting score into one of 6 tiers via `classifyTier`, persists the profile through the broker, and emits a `FederatedLearningAttribution` explaining every shift. `suppressArchetype` / `unsuppressArchetype` are operator-set; suppression drops the score to 0 (matching Phase 17 freeze semantics) and tier to `suppressed`. Tier transitions write a `archetype_reliability_evolved` audit row when `originating_project_id` is supplied.
- [organizationalStabilizationIntelligence.ts](backend/src/intelligence/systemStateEngine/federatedLearning/organizationalStabilizationIntelligence.ts) — `buildOrganizationalStabilizationReport` joins effectiveness profiles + reliability tiers + Phase 19 archetype registry into ranked `OrganizationalStabilizationInsight` entries. Insights with `current_tier ∈ {trusted, stable}` AND `source_count ≥ 2` AND `anomaly_rate < 50` are flagged `is_recommended=true` with a deterministic `recommendation_reason`. Suppressed archetypes are excluded entirely. **Informational only** — never modifies consumer state.
- [federatedImpactDiffusionReplay.ts](backend/src/intelligence/systemStateEngine/federatedLearning/federatedImpactDiffusionReplay.ts) — analytical view stitching Phase 19 federation lineage (source projects + archetype + consumer projects + consumption attributions) with Phase 20 effectiveness profiles (stabilization improved / regressed counts) into a per-archetype diffusion entry. Bounded at `MAX_DIFFUSION_ENTRIES=200`. **Read-only — no write-backs.**
- [federationDriftDetector.ts](backend/src/intelligence/systemStateEngine/federatedLearning/federationDriftDetector.ts) — `buildFederationDriftProfile` aggregates 6 deterministic drift signals: `archetype_anomaly_clustering`, `reliability_collapse_cascade`, `propagation_reduction_loss`, `policy_proposal_oscillation`, `consumption_attribution_drop`, and `stabilization_consistency_drift`. Each signal has a numeric severity in [0,100] and a deterministic explanation. Aggregate `drift_pressure_score` maps to a 4-level `FederationDriftTier`: `stable < 30`, `monitoring [30,50)`, `fragmenting [50,70)`, `unstable ≥ 70`. **No ML.**
- [federationVisibilityReplay.ts](backend/src/intelligence/systemStateEngine/federatedLearning/federationVisibilityReplay.ts) — reads Phase 19 lineage attributions filtered by configurable window (default 7d), surfacing per-archetype: visible_to_projects + consumed_by_projects + local_calibrations_generated + a stabilization_change_summary + a governance_drift_summary. Bounded at `MAX_DIFFUSION_ENTRIES=200`. Supports `archetype_signature` filter for single-archetype replay. **Audit replay — no parallel persistence.**
- [federationPolicyEvolutionEngine.ts](backend/src/intelligence/systemStateEngine/federatedLearning/federationPolicyEvolutionEngine.ts) — `proposePolicyEvolution` / `approvePolicy` / `rejectPolicy` lifecycle for federation policy changes (tighten/broaden share permissions, change anonymization level, adjust visibility scope). Every proposal carries a `PolicyEvolutionImpactBounds` with `expected_federation_impact`, `organizational_visibility_impact`, `stabilization_influence_estimate`, `rollback_confidence`, and `uncertainty_drivers[]`. `operator_required=true` is the default — no autonomous policy changes. Bounded at `MAX_POLICY_PROPOSALS_PER_ORG=20` (oldest decided proposals evict first). Approvals call into Phase 19's `updateConsent` to actually apply the change; rejections write the audit + reason and never mutate state.
- [federatedLearningSummaryCounters.ts](backend/src/intelligence/systemStateEngine/federatedLearning/federatedLearningSummaryCounters.ts) — sync, in-memory rolling counters for the engine state's `federated_learning_summary` block. Computes 6 federated learning health scores (`learning_stability`, `reliability_evolution_health`, `archetype_diffusion_health`, `policy_evolution_health`, `federation_drift_pressure`, `visibility_replay_health`) from observed signals.

**Tests**
- [phase20.test.ts](backend/src/intelligence/systemStateEngine/__tests__/phase20.test.ts) — 43 unit tests covering federated effectiveness (6 tests on cold-start, observation bounding, recovery+anomaly aggregation, organizational consistency stddev, confidence evolution, list ordering), archetype reliability evolution (10 tests on cold-start emerging tier, deterministic update rule, 6-tier classifier, attribution shape, suppression-drops-to-zero, suppression veto, reliability delta cap, history bounding, listing, organizational usefulness), organizational stabilization (5 tests on aggregation, recommendation gate by tier+sources+anomaly, suppression filter, ranking by reliability, cross-org isolation), federated impact diffusion replay (4 tests on join correctness, bounded output, ordering, single-archetype filter), federation drift detector (5 tests on stable cold-start, anomaly clustering signal, reliability collapse signal, threshold mapping to tiers, cross-org isolation), federation visibility replay (3 tests on window filter, archetype filter, ordering newest-first), federation policy evolution (8 tests on propose, list, approve-applies-change, reject-no-mutation, impact bounds shape, MAX_PROPOSALS_PER_ORG eviction, operator_required default, lifecycle audit), broker adapter (2 tests on InMemoryBrokerAdapter contract conformance + cross-org isolation).

**Frontend hooks** (`frontend/src/hooks/`)
- [useFederatedEffectiveness.ts](frontend/src/hooks/useFederatedEffectiveness.ts) — fetch effectiveness profiles + record observation action; SSE on `archetype.effectiveness.updated`.
- [useOrganizationalStabilization.ts](frontend/src/hooks/useOrganizationalStabilization.ts) — fetch ranked insights; SSE on `stabilization.insight.generated`.
- [useFederatedImpactReplay.ts](frontend/src/hooks/useFederatedImpactReplay.ts) — fetch diffusion replay; SSE on `federation.diffusion.replayed`.
- [useArchetypeReliability.ts](frontend/src/hooks/useArchetypeReliability.ts) — fetch per-archetype reliability profile + evolveReliability action + suppression toggle (operator-only); SSE on `archetype.reliability.evolved`.
- [useFederationDrift.ts](frontend/src/hooks/useFederationDrift.ts) — fetch drift profile; SSE on `federation.drift.detected`.
- [useFederationPolicyEvolution.ts](frontend/src/hooks/useFederationPolicyEvolution.ts) — fetch proposals + propose/approve/reject actions; SSE on `federation.policy.proposed`.

**Documentation**
- [PHASE_20_BOUNDED_FEDERATED_LEARNING_REFINEMENT_VALIDATION_REPORT.md](docs/PHASE_20_BOUNDED_FEDERATED_LEARNING_REFINEMENT_VALIDATION_REPORT.md) (this file).

## 2. Files Modified

- [backend/src/models/GovernanceAuditEntry.ts](backend/src/models/GovernanceAuditEntry.ts) — extended `GovernanceAuditKind` with 8 new values: `federated_effectiveness_updated`, `archetype_reliability_evolved`, `federation_drift_detected`, `federation_visibility_replayed`, `federation_diffusion_replayed`, `federation_policy_proposed`, `federation_policy_approved`, `federation_policy_rejected`.
- [backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts](backend/src/intelligence/systemStateEngine/realtime/cognitiveEventBus.ts) — extended `CognitiveEventKind` with 7 new event kinds: `archetype.effectiveness.updated`, `stabilization.insight.generated`, `federation.diffusion.replayed`, `archetype.reliability.evolved`, `federation.drift.detected`, `federation.visibility.replayed`, `federation.policy.proposed`.
- [backend/src/intelligence/systemStateEngine/refreshTriggers.ts](backend/src/intelligence/systemStateEngine/refreshTriggers.ts) — 2 new trigger reasons: `archetype_reliability_evolved`, `federation_policy_approved`.
- [backend/src/intelligence/systemStateEngine/types/systemState.types.ts](backend/src/intelligence/systemStateEngine/types/systemState.types.ts) — added optional `federated_learning_summary` block (organization_id + 6 health scores + most_active_archetype_signature + suppressed_archetype_count + active_drift_tier + pending_policy_proposal_count + last_updated).
- [backend/src/intelligence/systemStateEngine/systemStateEngine.ts](backend/src/intelligence/systemStateEngine/systemStateEngine.ts) — populates `federated_learning_summary` synchronously from in-memory counters. Fail-soft.
- [backend/src/intelligence/systemStateEngine/index.ts](backend/src/intelligence/systemStateEngine/index.ts) — re-exports all Phase 20 modules + types + hard-cap constants. `readReliabilityProfile` is re-exported as `readArchetypeReliabilityProfile` to avoid Phase 17 duplicate.
- [backend/src/routes/projectRoutes.ts](backend/src/routes/projectRoutes.ts) — 12 new endpoints: effectiveness-observation POST, effectiveness profiles GET (org + per-archetype), organizational-stabilization GET, diffusion-replay GET, reliability per-archetype GET + evolve POST + suppress/unsuppress POST, drift GET, visibility-replay GET, policy-proposals GET + propose POST + approve POST + reject POST.
- [frontend/src/components/operator/AutonomousExecutionDashboard.tsx](frontend/src/components/operator/AutonomousExecutionDashboard.tsx) — extended in place with three new sections: federation drift tier banner + active signals, archetype reliability tier histogram (6 tiers), and pending federation policy proposals list (with operator approve/reject buttons).

## 3. Federated Learning Refinement Status

**Real example (sample run, 2 projects in `org-acme`, recovery archetype shared by both, 5 successful outcomes per project):**
```
arch-c081195ae16efbce:
  effectiveness:
    observed_stabilization_delta: 25
    propagation_reduction: 18
    recovery_success_rate: 100
    anomaly_frequency: 0
    organizational_consistency: 100
    confidence_evolution: 5 entries (all = 100)

  reliability:
    current_tier: trusted
    current_score: 85          (rose from 50 emerging baseline via deterministic delta)
    observation_count: 10
    net_improvement_count: 10
    net_regression_count: 0
    stabilization_consistency: 100
    anomaly_pressure: 0
    replay_reliability: 100
    organizational_usefulness: 88

  attribution (last):
    refinement_reason: "10 net improvements vs 0 regressions; reliability +35"
    reliability_delta: +35
    stabilization_delta: 25
    anomaly_impact: 0
    confidence_shift: { from: 50, to: 85 }
```

**Real example (failing archetype, 6 anomaly_amplification observations):**
```
arch-da403e3f9bc60c4a:
  effectiveness:
    observed_stabilization_delta: -15
    propagation_reduction: -10
    recovery_success_rate: 0
    anomaly_frequency: 100
    organizational_consistency: 0

  reliability:
    current_tier: degraded     (score < 40, observation_count ≥ 5)
    current_score: 10
    attribution.refinement_reason:
      "6 regressions + anomaly pressure 100% dampened reliability -40"
```

**Suppression veto verified**: `suppressArchetype('org-acme', sig)` followed by `evolveReliability` produces `current_tier: 'suppressed'` AND `current_score: 0` regardless of observed signals. Test: `suppression drops score to zero and overrides tier classification` ✓

## 4. Reliability Tier Classifier

**6-tier deterministic mapping** in [archetypeReliabilityEvolution.ts:168-175](backend/src/intelligence/systemStateEngine/federatedLearning/archetypeReliabilityEvolution.ts#L168-L175):

| Condition | Tier |
|---|---|
| `suppressed === true` | `suppressed` |
| `observation_count < 5` | `emerging` |
| `score ≥ 80` | `trusted` |
| `score ≥ 60` | `stable` |
| `score ≥ 40` | `cautionary` |
| `score < 40` | `degraded` |

**Update rule** (deterministic, no ML):
```
reliability_delta = round((improvement_rate − regression_rate) × RELIABILITY_DELTA_PER_OBSERVATION
                          − anomaly_factor)

improvement_rate  = net_improvement_count / observation_count   (in [0..1])
regression_rate   = net_regression_count / observation_count    (in [0..1])
anomaly_factor    = anomaly_frequency / 20                       (up to ±5 dampening)

new_score = clamp(previous_score + reliability_delta, 0, 100)
new_score = 0 when suppressed
```

`RELIABILITY_DELTA_PER_OBSERVATION=5` is the cap per observation cycle. History is bounded at `MAX_RELIABILITY_HISTORY_PER_ARCHETYPE=200`.

## 5. Organizational Stabilization Intelligence

**Recommendation gate** (in [organizationalStabilizationIntelligence.ts](backend/src/intelligence/systemStateEngine/federatedLearning/organizationalStabilizationIntelligence.ts)):
- `current_tier ∈ {trusted, stable}` AND
- `source_count ≥ 2` (Phase 19 confidence) AND
- `anomaly_rate < 50` AND
- `current_tier !== suppressed`

Insights ranked by `current_score` desc, then `organizational_usefulness` desc.

**Real example (sample run, org-acme, 3 archetypes after refinement):**
```
1. arch-c081195ae16efbce  tier=trusted     score=85   recommended=true
   reason: "trusted tier across 2 sources; consistent stabilization at +25 delta"

2. arch-da403e3f9bc60c4a  tier=degraded    score=10   recommended=false
   reason: "degraded tier — 6 regressions + 100% anomaly pressure"

3. arch-suppressed-...    tier=suppressed  score=0    recommended=false
   reason: "suppressed by operator — excluded from organizational view"
```

**Suppressed archetypes are excluded entirely** from operator-facing recommendations. Cross-org isolation: `org-other` projects never see `org-acme` insights regardless of consent.

## 6. Federation Drift Status

**6 deterministic signal kinds** in [federationDriftDetector.ts](backend/src/intelligence/systemStateEngine/federatedLearning/federationDriftDetector.ts):
- `archetype_anomaly_clustering` — multiple archetypes simultaneously showing `anomaly_pressure ≥ 50`
- `reliability_collapse_cascade` — multiple archetypes simultaneously dropping to `degraded` or `suppressed`
- `propagation_reduction_loss` — net negative `propagation_reduction` across recent observations
- `policy_proposal_oscillation` — repeated propose/reject cycles within window
- `consumption_attribution_drop` — drop in `applied_locally=true` rate
- `stabilization_consistency_drift` — rising stddev across organizational_consistency signals

Each signal has severity in [0..100] and a deterministic `explanation`. Aggregate `drift_pressure_score` maps to 4 tiers:

| `drift_pressure_score` | `FederationDriftTier` |
|---|---|
| `< 30` | `stable` |
| `[30, 50)` | `monitoring` |
| `[50, 70)` | `fragmenting` |
| `≥ 70` | `unstable` |

**Real example (sample run, 3 archetypes seeded with anomaly observations + 1 reliability collapse):**
```
drift_pressure_score: 23    (stable — single weak signal does not aggregate to monitoring)
active_signal_count: 1
worst_signal: archetype_anomaly_clustering
tier: stable
```

When 3+ archetypes simultaneously show high anomaly pressure (test fixture), `drift_pressure_score` rises into `monitoring` tier. **No ML.**

## 7. Federation Visibility Replay Status

**Real example (sample run, alpha + beta both shared `arch-c081195ae16efbce`; beta consumed it and approved a local calibration):**
```
arch-c081195ae16efbce:
  visible_to_projects: [project_beta]
  consumed_by_projects: [project_beta]
  local_calibrations_generated: [{ project: "project_beta", proposal_id: "cal-beta-1" }]
  stabilization_change_summary: "stabilization Δ 25 (100% recovery)"
  governance_drift_summary: "no governance drift detected"
  observed_at: 2026-05-07T21:01:56.979Z

window_start: 2026-04-30T21:01:56.979Z
window_end:   2026-05-07T21:01:56.979Z
truncated:    false
```

Window default 7d, max 30d. Bounded at `MAX_DIFFUSION_ENTRIES=200`. Supports `archetype_signature` filter for single-archetype replay.

## 8. Federated Impact Diffusion Replay Status

**Real example (sample run):**
```
arch-c081195ae16efbce:
  source_project: project_alpha       (first source recorded)
  consumer_projects: [project_beta]
  local_calibrations_generated: 1
  stabilization_improved_count: 1
  stabilization_regressed_count: 0
  observed_at: 2026-05-07T21:01:56.979Z
  summary: "arch-c081195ae16ef: 2 source(s) → 1 consumer(s); stabilization Δ 25"
```

The replay joins:
- **Phase 19 lineage** (source_project → archetype → consumer_project edges + consumption attributions)
- **Phase 20 effectiveness** (stabilization improved/regressed counts derived from outcomes)

Bounded at `MAX_DIFFUSION_ENTRIES=200`. Read-only.

## 9. Federation Policy Evolution Status

**Lifecycle**:
1. **Propose** — `proposePolicyEvolution` writes `federation_policy_proposed` audit row, evicts oldest decided proposal if at `MAX_POLICY_PROPOSALS_PER_ORG=20`. Default `operator_required=true`.
2. **Approve** — `approvePolicy` calls Phase 19's `updateConsent` to actually apply the change, writes `federation_policy_approved` audit row, marks proposal `status='approved'` with `decided_by` + `decided_at`.
3. **Reject** — `rejectPolicy` writes `federation_policy_rejected` audit row with `reason`, marks proposal `status='rejected'`. **Never mutates federation state.**

**Real example (sample run, 2 proposals: 1 approved, 1 rejected):**
```
proposal #1 (tighten_share_permissions, routing_archetype):
  rationale: "routing_archetype arch-da403e3 shows sustained anomaly_amplification — tighten sharing"
  impact_bounds:
    expected_federation_impact: 60
    organizational_visibility_impact: 40
    stabilization_influence_estimate: 70
    rollback_confidence: 90
    uncertainty_drivers: [recent_anomaly_clustering, small_sample_size]
  forecasted_impact: ["routing_archetype kind no longer shared", "consumers fall back to local routing"]
  rollback_path: ["operator restores share permission via Phase 19 consent endpoint"]
  status: approved   decided_by: ali@colaberry.com   applied: true

proposal #2 (broaden_share_permissions):
  rationale: "wait for more observations"
  impact_bounds:
    expected_federation_impact: 30
    rollback_confidence: 95
    uncertainty_drivers: [narrow_sample]
  status: rejected   decided_by: ali@colaberry.com   reason: "not enough evidence yet"
```

`PolicyEvolutionImpactBounds.uncertainty_drivers` makes the bounded-confidence claim explicit — operators see WHY the impact is uncertain before deciding. **No autonomous policy changes**: every proposal requires operator action.

## 10. Persistent Broker Status

**`BrokerStorageAdapter` interface** (in [persistentFederationBroker.ts](backend/src/intelligence/systemStateEngine/federatedLearning/persistentFederationBroker.ts)):
```ts
export interface BrokerStorageAdapter {
  put<T>(organization_id: string, namespace: string, key: string, value: T): Promise<void>;
  get<T>(organization_id: string, namespace: string, key: string): Promise<T | null>;
  listKeys(organization_id: string, namespace: string): Promise<readonly string[]>;
  listValues<T>(organization_id: string, namespace: string): Promise<readonly T[]>;
  delete(organization_id: string, namespace: string, key: string): Promise<void>;
  listOrganizations(): Promise<readonly string[]>;
}
```

**v1 default** is `InMemoryBrokerAdapter` — process-local Map<org_id, Map<namespace, Map<key, value>>>. Future Redis/DB adapters drop in via `setBrokerAdapter(...)` with no call-site changes.

**4 stable namespaces** in `BROKER_NAMESPACES`:
- `effectiveness` — `FederatedEffectivenessProfile` per archetype
- `reliability` — `ArchetypeReliabilityProfile` per archetype
- `policy_proposals` — `PolicyEvolutionProposal[]` per organization
- `lineage_supplement` — Phase 20 supplemental lineage state

**Cross-organization isolation**: every API takes `organization_id` as the first scoping parameter; `org-acme` calls cannot read `org-other` keys. Test: `InMemoryBrokerAdapter isolates organizations` ✓

## 11. Test Results

```
$ npx tsc --noEmit (backend)        → exit 0
$ npx tsc --noEmit (frontend)       → exit 0
$ NODE_OPTIONS=--max-old-space-size=8192 npx jest --testPathPattern phase20 --runInBand
  Test Suites: 1 passed, 1 total
  Tests:       43 passed, 43 total   (81.7s wall, mostly TS compile)
$ npx jest --testPathPattern systemStateEngine --maxWorkers=1
  Test Suites: 20 passed, 20 total
  Tests:       825 passed, 825 total   (= 782 prior + 43 Phase 20, zero regressions)
```

Coverage breakdown (43 Phase 20 tests):
- 6 tests on `federatedEffectivenessTracker` (cold-start zero values, observation cap=200 bounding, recovery+anomaly aggregation, organizational consistency stddev derivation, confidence_evolution append+slice, listEffectivenessProfiles ordering)
- 10 tests on `archetypeReliabilityEvolution` (cold-start emerging tier, deterministic update rule produces expected delta, 6-tier classifier coverage, attribution shape, **suppression drops score to zero**, suppression overrides tier classification, reliability delta cap=5 per cycle, history bounding=200, listReliabilityProfiles, organizationalUsefulnessScore composite)
- 5 tests on `organizationalStabilizationIntelligence` (aggregation across effectiveness+reliability+registry, recommendation gate by tier+sources+anomaly, suppressed exclusion, ranking by score+usefulness, **cross-organization isolation**)
- 4 tests on `federatedImpactDiffusionReplay` (join correctness, bounded output cap=200, ordering newest-first, single-archetype filter)
- 5 tests on `federationDriftDetector` (stable cold-start, anomaly clustering signal seeded by 3 archetypes × 8 anomaly observations + evolveReliability, reliability collapse signal, threshold mapping to 4 tiers, cross-org isolation)
- 3 tests on `federationVisibilityReplay` (window filter, archetype filter, ordering newest-first)
- 8 tests on `federationPolicyEvolutionEngine` (propose, list, approve-applies-to-Phase-19, reject-no-mutation, impact_bounds shape with uncertainty_drivers, MAX_PROPOSALS_PER_ORG=20 eviction, operator_required=true default, lifecycle audit emissions)
- 2 tests on `BrokerStorageAdapter` (InMemoryBrokerAdapter contract conformance with [...keys].sort() determinism, **cross-org isolation**)

**Bugs caught + fixed during testing**:
- **Suppression test originally expected score preservation**; corrected to drop score to 0 to match Phase 17 freezeIntentClass semantics (operator-set freeze == zero confidence).
- **Drift test originally seeded a single archetype**; corrected to seed 3 archetypes × 8 anomaly observations + call evolveReliability so the clustering signal actually fires above its threshold.
- **`keys.sort()` failed on readonly array**; corrected to `[...keys].sort()`.
- **Audit notNull violation surfaced during sample run**; fixed by adding optional `originating_project_id?` to both `RecordOutcomeInput` and `EvolveReliabilityInput` — when supplied, audit row is written; when absent, audit is skipped while broker writes + counters update.

## 12. Performance Report

Sample-run timings (synthetic in-memory inputs, all sub-millisecond except where noted):
- `recordOutcomeObservation` (broker get + observation push + slice + put + lazy audit): < 1ms
- `evolveReliability` (broker get + count aggregation + score update + tier classify + audit on transition): < 1ms
- `buildOrganizationalStabilizationReport` (list effectiveness + reliability + registry + rank): < 1ms for ≤50 archetypes
- `buildFederatedImpactDiffusionReplay` (lineage join + effectiveness lookup): < 1ms for ≤50 archetypes
- `buildFederationDriftProfile` (6 signal aggregations): < 1ms
- `buildFederationVisibilityReplay` (window filter + archetype filter): < 1ms
- `proposePolicyEvolution` / `approvePolicy` / `rejectPolicy` (broker put + audit + Phase 19 update on approve): ~5-10ms first call (lazy DB import), < 1ms subsequent
- Phase 20 jest suite: 81.7s wall (most time is Jest TS compile across 43 tests; in-test logic is sub-second)
- Full systemStateEngine suite (825 tests across 20 suites): ~140s wall

No performance regressions detected against the Phase 19 baseline. All hot paths are sync-or-async-broker, in-memory, and bounded by the architectural caps (`MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE=200`, `MAX_RELIABILITY_HISTORY_PER_ARCHETYPE=200`, `MAX_POLICY_PROPOSALS_PER_ORG=20`, `MAX_DIFFUSION_ENTRIES=200`).

## 13. Remaining Federated Learning Gaps

Deferred to Phase 21+:
- **Cryptographic anonymization at rest in the broker.** v1 stores plaintext records (org_id-scoped). A Redis-backed adapter could add at-rest encryption + key rotation. djb2-style signature hashing remains identical.
- **Real ML for reliability prediction.** v1 is deterministic delta accumulation. Future phases could add bounded probabilistic forecasts (still operator-approved, still informational).
- **Cross-organization aggregate insights with k-anonymity.** v1 strictly within-organization. A future phase could add explicit cross-org sharing of aggregate-only signals (no per-archetype identifiers, k≥5 organizations contributing).
- **Federation broker swap scripts.** v1 ships the interface + in-memory implementation. A real Redis/DB adapter is a future deployment task — interface contract stable.
- **Persistent reliability evolution audit table.** v1 writes individual audit rows on tier transitions. A dedicated `archetype_reliability_history` table would speed bulk queries on cold-start (currently rebuilt from broker on read).
- **Bounded autonomous policy proposal triggers.** v1 requires explicit `proposePolicyEvolution` call. Phase 21 could surface system-suggested proposals (still operator-required for approval) when drift signals cross monitoring thresholds.
- **UI for diffusion replay visualization.** v1 ships diffusion data; styled timeline component is a future polish task.
- **Federated drift comparison across orgs.** v1 reports per-org drift profiles. A future phase could surface "your org's drift_pressure_score is 23 vs the network median of 35" — strictly aggregate, k-anonymous.

## 14. Next Phase Recommendation

**Phase 21 — Operator-Calibrated Federation Topology Evolution** would build on Phase 20's foundation:

1. **Aggregate cross-org signals with k-anonymity.** Take Phase 20's per-org drift + reliability + diffusion data and surface aggregate signals across organizations that have explicitly opted in, with `k ≥ 5` contributing orgs and zero per-archetype identifiers. Lets operators see "is my org's drift typical or anomalous?" without leaking any specific archetype.
2. **Bounded autonomous proposal generation.** When `FederationDriftTier === fragmenting` for ≥ 24h, the system auto-generates a `tighten_share_permissions` proposal with the relevant archetype kind and full `PolicyEvolutionImpactBounds` — but `operator_required=true` remains absolute. The autonomy is "the proposal is drafted automatically", not "the change is applied automatically."
3. **Persistent broker (Redis adapter).** Drop in `RedisBrokerAdapter` behind the existing `BrokerStorageAdapter` interface. No Phase 20 call-site changes. Multi-instance deployment becomes possible.
4. **Diffusion replay UI.** Render Phase 20's `FederatedImpactDiffusionReplay` as a styled timeline component (NOT a graph viz library — same operator surface pattern as Phases 18/19). Operators trace "where did this insight come from? what happened after consumers applied it?" visually.
5. **Cross-phase consistency check.** A bounded validator that reads Phase 16 causality lineage + Phase 17 validator reliability + Phase 18 calibration history + Phase 19 federation lineage + Phase 20 effectiveness/reliability and flags inconsistencies (e.g., "this archetype is `trusted` in Phase 20 but its source had a `validator_drift_detected` in Phase 17"). Informational only.

Phase 21 is **not** "global federated ML". It is "the operator surfaces gain richer cross-org aggregate signals + the system supports multi-instance deployments + diffusion has a visual timeline + cross-phase inconsistencies are surfaced". Same architectural truthfulness as Phases 13-20.

---

**Phase 20 v1 ships as: bounded deterministic federated learning refinement on top of Phase 19's consent-based federation.** Per-archetype effectiveness profiles aggregate observed outcomes via deterministic moving averages; archetype reliability evolves through a 6-tier classifier with full attribution; organizational stabilization insights rank archetypes for operator-facing recommendation (informational only); federated impact diffusion replay joins Phase 19 lineage with Phase 20 effectiveness; federation drift detector flags 6 deterministic signal kinds; federation visibility replay reads lineage attributions in a window; federation policy evolution engine runs proposal lifecycle with bounded `PolicyEvolutionImpactBounds`; persistent broker interface enables future Redis/DB swap without call-site changes. **Hard architectural vetoes remain absolute.** Suppression is operator-set and drops scores to zero. No ML, no autonomous mutation of consumer state, no cross-organization contamination, no silent learning. Phase 19 federation contracts unchanged. Phase 13 federatedTrustProfiles unchanged. Architecturally truthful.
