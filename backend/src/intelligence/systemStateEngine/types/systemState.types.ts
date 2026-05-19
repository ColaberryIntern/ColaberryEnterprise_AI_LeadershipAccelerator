/**
 * System State Engine — Type Definitions
 *
 * Single authoritative source for every type the engine produces or consumes.
 * Every other module imports from this file. No competing type definitions
 * are allowed elsewhere in the engine.
 */

// ---------------------------------------------------------------------------
// Core scoring types
// ---------------------------------------------------------------------------

/**
 * A score is always 0-100. We standardize on this so cross-cap comparisons
 * are always meaningful. Sub-scores that are dimensionally different (e.g.
 * counts of files) get normalized inside the scorers before reaching here.
 */
export type Score0to100 = number;

export interface CapabilityScores {
  readonly capability_id: string;
  readonly readiness: Score0to100;
  readonly coverage: Score0to100;
  readonly maturity: Score0to100;     // 0-100 representation of L0-L4
  readonly maturity_level: 0 | 1 | 2 | 3 | 4;
  readonly health: Score0to100;
  readonly sync_health: Score0to100;
  /**
   * True when the cap's score gap requires operator judgment to close
   * (e.g., Page awaiting ui_review verification). False when the gap
   * is system-actionable (e.g., missing observability files, missing
   * agent layer). Added 2026-05-19 for score-task transparency.
   */
  readonly operator_bounded?: boolean;
  /**
   * Per-dimension breakdown so the operator can see WHY a score is what
   * it is. Surfaces in the API response so the UI can render "Health
   * 49% because: ux_exposure=80, reliability=20, ...".
   */
  readonly readiness_breakdown?: {
    readonly layer: Score0to100;
    readonly coverage: Score0to100;
    readonly quality: Score0to100;
  };
  readonly health_breakdown?: {
    readonly applicable_dimensions: ReadonlyArray<string>;
    readonly determinism: Score0to100;
    readonly reliability: Score0to100;
    readonly observability: Score0to100;
    readonly ux_exposure: Score0to100;
    readonly automation: Score0to100;
    readonly production_readiness: Score0to100;
  };
}

export interface ProjectScores {
  readonly project_id: string;
  readonly readiness: Score0to100;
  readonly coverage: Score0to100;
  readonly maturity: Score0to100;
  readonly health: Score0to100;
  readonly sync_health: Score0to100;
  readonly backend: Score0to100;
  readonly frontend: Score0to100;
  readonly intelligence: Score0to100;
  readonly observability: Score0to100;
  readonly per_capability: ReadonlyArray<CapabilityScores>;
  /**
   * Honest accounting of where the score gap comes from. Added 2026-05-19.
   *   operator_bounded_count: caps below 100 readiness whose gap is
   *     operator-judgment (e.g., Pages awaiting ui_review verification).
   *     The system can't push the score higher without operator input.
   *   system_actionable_count: caps below 100 whose gap can be addressed
   *     by system-generated tasks (e.g., missing observability files).
   *   fully_built_count: caps at 100.
   * sum = total caps.
   */
  readonly accounting?: {
    readonly operator_bounded_count: number;
    readonly system_actionable_count: number;
    readonly fully_built_count: number;
  };
}

// ---------------------------------------------------------------------------
// Authoritative task queue
// ---------------------------------------------------------------------------

export type AuthoritativeTaskType =
  | 'foundation'
  | 'backend'
  | 'frontend'
  | 'database'
  | 'validation'
  | 'testing'
  | 'intelligence'
  | 'ui_review'
  | 'optimization'
  | 'agent_stack';

export type AuthoritativeTaskState =
  | 'pending'
  | 'ready'
  | 'blocked'
  | 'in_progress'
  | 'validated'
  | 'failed';

/**
 * The single task shape every consumer of the engine sees. Cory, the
 * frontend, the System Components grid, the Build flow — all read this.
 * No other "task" type is permitted in the engine's output surface.
 */
export interface AuthoritativeTask {
  readonly id: string;
  readonly project_id: string;
  readonly bp_id?: string;

  readonly title: string;
  readonly description?: string;

  readonly type: AuthoritativeTaskType;

  // Component scores (each 0-100). Used by priorityRanker.
  readonly priority_score: Score0to100;
  readonly blocking_score: Score0to100;
  readonly dependency_score: Score0to100;
  readonly maturity_gain: Score0to100;
  readonly readiness_gain: Score0to100;
  readonly confidence_score: Score0to100;
  readonly execution_cost: Score0to100;

  readonly dependencies: ReadonlyArray<string>;

  // Final composite rank — what consumers actually sort by. Lower = earlier.
  readonly calculated_rank: number;

  readonly state: AuthoritativeTaskState;

  // Human-readable trace explaining why this task scored where it did.
  // Every entry should be a short sentence that the UI can show as-is.
  readonly reasoning: ReadonlyArray<string>;

  // Full explainability payload — every input that fed scoring + the formulas
  // applied. The UI uses this for the "Why is this next?" panel. Optional
  // because synthetic tasks (e.g. foundation kickoff) can be built without
  // a full trace in tests.
  readonly decision_trace?: DecisionTrace;

  // Deep-link payload — when the operator clicks a task on Cory Home,
  // the consumer surface uses these to pre-fill its form fields so
  // the operator doesn't have to re-pick the BP / route. Added 2026-05-19.
  // Optional because not every task type has a target frontend surface.
  readonly frontend_route?: string;
}

/**
 * Explains how a task arrived at its current rank. Every consumer of the
 * "Why is this next?" panel reads this. Producers MUST populate inputs
 * with concrete, source-attributed numbers — not placeholders.
 *
 * Phase 3 additions: explicit explainability payload (score_breakdown,
 * dependency_chain, missing_requirements, expected_outcomes,
 * projected_maturity_gain, affected_systems, telemetry_sources_used).
 */
export interface DecisionTrace {
  readonly readiness_inputs: {
    readonly current: Score0to100;
    readonly target: Score0to100;
    readonly gap: number;
  };
  readonly coverage_inputs: {
    readonly current: Score0to100;
    readonly source: 'requirements_coverage' | 'page_visual_review' | 'evidence_based' | 'user_verified' | 'no_signal';
    readonly target: Score0to100;
    readonly gap: number;
  };
  readonly maturity_inputs: {
    readonly current_level: 0 | 1 | 2 | 3 | 4;
    readonly target_level: 0 | 1 | 2 | 3 | 4;
    readonly next_level_gap?: string;
  };
  readonly dependency_inputs: {
    readonly count: number;
    readonly unmet: ReadonlyArray<string>;
    readonly cycles: ReadonlyArray<string>;
  };
  readonly blocking_inputs: {
    readonly is_blocking: boolean;
    readonly downstream_count: number;
    readonly reason?: string;
  };
  readonly confidence_inputs: {
    readonly confidence: Score0to100;
    readonly basis: string;     // e.g. "high — backend exists with 3 files matching name stem"
  };
  readonly formulas_used: ReadonlyArray<string>;
  // Ordered explanation chain — UI renders these as bullet points.
  readonly reasoning_chain: ReadonlyArray<string>;

  // ── Phase 3 explainability payload ────────────────────────────────────
  // Component-level breakdown of the final calculated_rank. Each entry is
  // a labeled contribution (e.g. "blocking": 30, "coverage_gap": 25).
  readonly score_breakdown?: Readonly<Record<string, number>>;
  // Ordered chain of upstream tasks/BPs this work depends on. Renders as
  // "X → Y → this".
  readonly dependency_chain?: ReadonlyArray<string>;
  // Requirements still missing (when known from telemetry).
  readonly missing_requirements?: ReadonlyArray<string>;
  // What the user should observe after the task completes.
  readonly expected_outcomes?: ReadonlyArray<string>;
  // Maturity level expected after completion (with delta).
  readonly projected_maturity_gain?: {
    readonly current_level: 0 | 1 | 2 | 3 | 4;
    readonly projected_level: 0 | 1 | 2 | 3 | 4;
    readonly delta: number;
  };
  // System ids/labels that change as a result of this task.
  readonly affected_systems?: ReadonlyArray<string>;
  // Which telemetry sources informed this trace (for "is this guess or fact?")
  readonly telemetry_sources_used?: ReadonlyArray<'manifest' | 'validation' | 'declared_map' | 'repo_evidence'>;
}

// ---------------------------------------------------------------------------
// Contradiction detection
// ---------------------------------------------------------------------------

export type ContradictionSeverity = 'info' | 'warning' | 'error';

export type ContradictionKind =
  | 'readiness_mismatch'           // capability claims complete but is missing layers
  | 'duplicate_next_step'          // multiple sources nominate different next steps for same BP
  | 'queue_ordering_inconsistency' // legacy ordering disagrees with engine
  | 'missing_bp_reference'         // task references a BP that doesn't exist
  | 'frontend_complete_backend_missing'
  | 'capability_status_mismatch'   // user_status='verified' but is_complete=false
  | 'conflicting_completion_pct'   // two systems report different completion for same BP
  | 'orphan_route'                 // route in repo not connected to any BP
  | 'orphan_bp'                    // BP with no files linked AND no requirements
  | 'undocumented_api'             // route exists but no OpenAPI / type definitions
  | 'validation_drift'             // validation_report.commitSha doesn't match repo HEAD
  // ── Phase 3 telemetry contradictions ────────────────────────────────
  | 'telemetry_drift'              // manifest declares state that repo evidence contradicts
  | 'telemetry_conflict'           // two manifests disagree (same project, same artifact)
  | 'stale_telemetry'              // most recent manifest for a BP is older than the freshness threshold
  | 'missing_telemetry'            // BP claims complete but no manifest has ever been ingested
  | 'undocumented_db_change'       // database_change in a manifest references a table without a documented entry
  | 'orphan_table'                 // table exists in declared map but no API/BP/frontend references it
  | 'undocumented_table'           // table referenced by code but absent from declared map
  | 'ui_drift'                     // ui_map declares a component or route that no manifest has emitted
  | 'graph_drift'                  // graph synchronizer detects an edge in repo evidence that contradicts a manifest
  | 'low_confidence_validation'    // validation_result.confidence_score below threshold
  | 'validation_regression'        // newer validation has lower confidence than an earlier one
  // ── Phase 6 visual cognition contradictions ─────────────────────────
  | 'hidden_primary_cta'           // primary CTA below the fold or with low visual weight
  | 'inaccessible_critical_action' // primary action exists but lacks ARIA labels / focus
  | 'workflow_dead_end'            // page has no outbound nav for an active BP
  | 'visual_hierarchy_mismatch'    // multiple competing primaries
  | 'overloaded_action_zone'       // density >> healthy threshold
  | 'orphan_navigation_path'       // outbound link to unknown route
  | 'misleading_progression'       // heading hierarchy or step indicator implies a flow that doesn't exist
  | 'accessibility_vs_health_conflict' // visually healthy but inaccessible
  | 'ux_regression'                // friction or accessibility worsened vs prior snapshot
  // ── Phase 7 multimodal cognition contradictions ─────────────────────
  | 'visual_vs_dom_conflict'       // LLM vision says X, DOM heuristic says ¬X
  | 'aesthetic_vs_accessibility_conflict' // strong aesthetic but failing accessibility
  | 'multimodal_hierarchy_mismatch' // LLM hierarchy score conflicts with heuristic
  | 'screenshot_vs_telemetry_drift' // captured screenshot disagrees with declared UI map
  | 'behavioral_vs_visual_conflict' // visually healthy but behavioral evidence shows struggle
  | 'regression_without_manifest'  // UX regression detected but no manifest explains the change
  | 'unresolved_visual_regression';// regression flagged in 2+ consecutive snapshots

export interface ContradictionFlag {
  readonly kind: ContradictionKind;
  readonly severity: ContradictionSeverity;
  readonly message: string;
  readonly project_id: string;
  readonly capability_id?: string;
  readonly task_id?: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Sync health
// ---------------------------------------------------------------------------

export interface SyncHealthDimensions {
  readonly telemetry_freshness: Score0to100;
  readonly contradictory_calculations: Score0to100;
  readonly orphan_bps: Score0to100;
  readonly orphan_routes: Score0to100;
  readonly undocumented_apis: Score0to100;
  readonly missing_manifests: Score0to100;
  readonly validation_drift: Score0to100;
  readonly queue_inconsistency: Score0to100;
  readonly frontend_backend_mismatch: Score0to100;
  readonly missing_dependency_references: Score0to100;
  // ── Phase 3 telemetry health dimensions ────────────────────────────
  readonly manifest_freshness: Score0to100;          // 100 if all recent manifests fresh
  readonly missing_build_manifests: Score0to100;     // 100 if every BP has at least one manifest
  readonly conflicting_manifests: Score0to100;       // 100 if no resolver conflicts
  readonly undocumented_db_changes: Score0to100;     // 100 if every DB change is mapped
  readonly ui_drift: Score0to100;                    // 100 if ui_map matches manifests
  readonly graph_drift: Score0to100;                 // 100 if graph synchronizer found no contradictions
  readonly missing_validation_telemetry: Score0to100; // 100 if every recent manifest carries validation_results
  // ── Phase 5 UX health dimensions ───────────────────────────────────
  readonly ux_debt_health: Score0to100;              // 100 - ux_debt total
  readonly workflow_friction_health: Score0to100;    // 100 - friction_score
}

export interface SyncHealthResult {
  readonly score: Score0to100;
  readonly dimensions: SyncHealthDimensions;
  readonly contradiction_count: number;
}

// ---------------------------------------------------------------------------
// State graph
// ---------------------------------------------------------------------------

export type StateGraphNodeType =
  | 'project'
  | 'bp'
  | 'task'
  | 'file'
  | 'database_object'
  | 'api'
  | 'ui_component'
  | 'validation_result'
  | 'test';

export interface StateGraphNode {
  readonly id: string;
  readonly type: StateGraphNodeType;
  readonly label: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StateGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;        // e.g. "implements", "tests", "depends_on"
}

export interface StateGraph {
  readonly nodes: ReadonlyArray<StateGraphNode>;
  readonly edges: ReadonlyArray<StateGraphEdge>;
}

// ---------------------------------------------------------------------------
// Authoritative system state
// ---------------------------------------------------------------------------

/**
 * The full output of buildAuthoritativeState(projectId). Consumed by every
 * downstream surface (Cory, Blueprint, System View, snapshot persister).
 */
export interface AuthoritativeSystemState {
  readonly project_id: string;
  readonly generated_at: string;     // ISO timestamp

  readonly scores: ProjectScores;
  readonly queue: ReadonlyArray<AuthoritativeTask>;
  readonly contradictions: ReadonlyArray<ContradictionFlag>;
  readonly graph: StateGraph;

  readonly next_task: AuthoritativeTask | null;
  readonly next_bp_id: string | null;

  readonly sync_health: SyncHealthResult;

  /**
   * Phase 11 — remediation surface summary (optional). Lets surfaces that
   * read engine state (Cory, dashboards) reflect remediation pressure +
   * activity without an extra fetch.
   */
  readonly remediation_summary?: {
    readonly active_clusters: number;
    readonly total_pressure: Score0to100;
    readonly tier: 'calm' | 'elevated' | 'urgent' | 'critical';
    readonly last_updated: string;
  };

  /**
   * Phase 12 — governance surface summary (optional). Lets the operator
   * dashboard show recommendation counts + automation mode without an
   * extra fetch. Mirrors the remediation_summary pattern.
   */
  readonly governance_summary?: {
    readonly pending_recommendations: number;
    readonly automation_mode: 'autonomous' | 'supervised' | 'frozen';
    readonly automation_confidence: Score0to100;
    readonly recent_overrides: number;
    readonly last_updated: string;
  };

  /**
   * Phase 13 — autonomy surface summary (optional). Sync, in-memory
   * read only. Lets the operator dashboard reflect autonomy activity
   * without an extra fetch.
   */
  readonly autonomy_summary?: {
    readonly recent_executions: number;
    readonly recent_rollbacks: number;
    readonly recent_blocks: number;
    readonly trust_tier: 'low' | 'moderate' | 'high';
    readonly avg_trust_score: Score0to100;
    readonly last_updated: string;
  };

  /**
   * Phase 14 — execution surface summary (optional). Sync, in-memory
   * read only. Reflects autonomous handoff + verification activity for
   * the dashboard.
   */
  readonly execution_summary?: {
    readonly active_handoffs_24h: number;
    readonly recent_verifications: number;
    readonly recent_rollbacks: number;
    readonly isolated_signatures_count: number;
    readonly self_heal_actions_24h: number;
    readonly verification_success_rate: Score0to100;
    readonly last_updated: string;
  };

  /**
   * Phase 15 — direct mutation surface summary (optional). Sync,
   * in-memory read only. Reflects governed operational-state mutation
   * activity. The intent-class with the highest trust is surfaced so
   * dashboards can show "what's currently safest to fire next."
   */
  readonly mutation_summary?: {
    readonly active_envelopes_24h: number;
    readonly recent_verifications: number;
    readonly recent_rollbacks: number;
    readonly contained_classes_count: number;
    readonly frozen_classes_count: number;
    readonly avg_trust_score: Score0to100;
    readonly highest_trust_intent: string | null;
    readonly last_updated: string;
  };

  /**
   * Phase 16 — causality + distributed validation surface summary.
   * Sync, in-memory read only. Reflects active root causes, unstable
   * branches, validator conflicts, trust propagation alerts, and
   * contradiction clusters identified by the causality engines.
   */
  readonly causality_summary?: {
    readonly active_root_causes: number;
    readonly unstable_branches: number;
    readonly validator_conflicts: number;
    readonly trust_propagation_alerts: number;
    readonly contradiction_clusters: number;
    readonly last_updated: string;
  };

  /**
   * Phase 17 — adaptive validator intelligence + causal governance
   * evolution surface. Sync, in-memory read only. Reflects validator
   * drift, specialization, forecasts, recovery chains, and ancestry
   * rollback recommendations from the adaptive engines.
   */
  readonly adaptive_governance_summary?: {
    readonly drifting_validators: number;
    readonly suppressed_validators: number;
    readonly active_forecasts: number;
    readonly active_recovery_chains: number;
    readonly ancestry_rollbacks_recommended: number;
    readonly worst_validator_tier: 'stable' | 'cautionary' | 'drifting' | 'unstable' | 'suppressed';
    readonly last_updated: string;
  };

  /**
   * Phase 18 — operator-calibrated governance evolution surface. Sync,
   * in-memory read only. Reflects pending calibration proposals,
   * recent operator decisions, active recovery sessions, forecast
   * tuning state, routing stability, and 5 governance health scores.
   */
  readonly governance_evolution_summary?: {
    readonly pending_calibration_proposals: number;
    readonly approved_calibrations_24h: number;
    readonly rejected_calibrations_24h: number;
    readonly active_recovery_sessions: number;
    readonly forecast_signals_widened: number;
    readonly routing_stability: 'stable' | 'adaptive' | 'volatile' | 'suppressed' | 'overridden';
    readonly health_scores: {
      readonly calibration_stability: Score0to100;
      readonly routing_stability: Score0to100;
      readonly recovery_optimization: Score0to100;
      readonly forecast_reliability: Score0to100;
      readonly governance_transparency: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 19 — federated organizational governance intelligence
   * surface. Sync, in-memory read only. Reflects federation consent
   * tier, archetype share/consume volume, active anomalies, drift
   * detection counters, and 5 federation health scores.
   */
  readonly federation_summary?: {
    readonly federation_enabled: boolean;
    readonly isolation_tier: 'isolated' | 'local_only' | 'organizational' | 'restricted' | 'visibility_limited';
    readonly archetypes_shared_24h: number;
    readonly archetypes_consumed_24h: number;
    readonly active_anomalies: number;
    readonly drift_events_detected: number;
    readonly health_scores: {
      readonly federation_stability: Score0to100;
      readonly archetype_confidence: Score0to100;
      readonly federation_drift: Score0to100;
      readonly anomaly_pressure: Score0to100;
      readonly visibility_integrity: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 20 — bounded federated organizational learning surface.
   * Sync, in-memory read only. Reflects archetype reliability tiers
   * tracked, drift tier classification, pending policy proposals,
   * recent operator decisions, and 6 federated learning health scores.
   */
  readonly federated_learning_summary?: {
    readonly archetypes_tracked: number;
    readonly archetypes_trusted: number;
    readonly archetypes_degraded: number;
    readonly active_drift_signals: number;
    readonly drift_tier: 'stable' | 'monitoring' | 'fragmenting' | 'unstable';
    readonly pending_policy_proposals: number;
    readonly approved_policies_24h: number;
    readonly rejected_policies_24h: number;
    readonly health_scores: {
      readonly federated_effectiveness: Score0to100;
      readonly organizational_stabilization: Score0to100;
      readonly federation_drift_pressure: Score0to100;
      readonly archetype_reliability: Score0to100;
      readonly federation_visibility_integrity: Score0to100;
      readonly policy_evolution_stability: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 21 — bounded persistent federation runtime continuity. Reports
   * the active broker adapter, the per-process node id, partition count,
   * active isolations, recent replay activity, and 6 distributed runtime
   * health scores. SINGLE-PROCESS, SINGLE-BROKER today. Forward-shaped
   * for future multi-instance deployments without contract change.
   */
  readonly distributed_runtime_summary?: {
    readonly node_id: string;
    readonly active_adapter_kind: 'in_memory' | 'redis';
    readonly broker_continuity_status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'isolated';
    readonly partition_count: number;
    readonly active_isolations: number;
    readonly recent_replay_count_24h: number;
    readonly health_scores: {
      readonly broker_continuity: Score0to100;
      readonly partition_isolation: Score0to100;
      readonly synchronization_stability: Score0to100;
      readonly replay_recovery: Score0to100;
      readonly distributed_topology_stability: Score0to100;
      readonly runtime_drift_pressure: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 22 — bounded within-partition cognition topology orchestration.
   * Aggregates fragmentation tier counts across partitions on this node,
   * recent propagation activity, recovery plans, and 6 topology health
   * scores. Within-partition only — never cross-partition. Single-step
   * heuristic forecasting; no ML.
   */
  readonly topology_summary?: {
    readonly partition_count: number;
    readonly cohesive_partition_count: number;
    readonly fragmented_partition_count: number;
    readonly shattered_partition_count: number;
    readonly active_propagations_24h: number;
    readonly recent_recovery_plans_24h: number;
    readonly health_scores: {
      readonly topology_cohesion: Score0to100;
      readonly fragmentation_pressure: Score0to100;
      readonly propagation_amplification_score: Score0to100;
      readonly dependency_stability: Score0to100;
      readonly continuity_resilience: Score0to100;
      readonly topology_recovery_readiness: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 23 — bounded operational execution substrate. Aggregates
   * worker lifecycle state across all organizations on this single node:
   * active workers, 24h lifecycle counts, active isolation count, recent
   * governance decisions, and 6 execution health scores. Voluntary
   * registration only; never auto-discovered. Within-organization
   * isolation preserved.
   */
  readonly execution_substrate_summary?: {
    readonly node_id: string;
    readonly active_worker_count: number;
    readonly completed_24h: number;
    readonly failed_24h: number;
    readonly interrupted_24h: number;
    readonly rolled_back_24h: number;
    readonly active_isolation_count: number;
    readonly recent_governance_decisions_24h: number;
    readonly health_scores: {
      readonly execution_continuity: Score0to100;
      readonly rollback_resilience: Score0to100;
      readonly worker_stability: Score0to100;
      readonly execution_isolation: Score0to100;
      readonly replay_execution_integrity: Score0to100;
      readonly execution_governance_stability: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 24 — deterministic operational cognition compression. Aggregates
   * recent narrative + guidance activity, current cognitive load tier
   * across all partitions on this node, and 6 human-readable health
   * scores. Templates only — no LLM, no inference, no synthesis.
   */
  readonly cognitive_compression_summary?: {
    readonly node_id: string;
    readonly recent_narratives_24h: number;
    readonly recent_compressed_replays_24h: number;
    readonly recent_guidance_plans_24h: number;
    readonly current_load_tier: 'light' | 'moderate' | 'dense' | 'overloaded';
    readonly current_load_score: number;
    readonly health_scores: {
      readonly operational_clarity: Score0to100;
      readonly replay_comprehensibility: Score0to100;
      readonly rollback_explainability: Score0to100;
      readonly continuity_visibility: Score0to100;
      readonly topology_understandability: Score0to100;
      readonly operator_trust: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 25 — deterministic counterfactual operational projection.
   * Aggregates recent sandbox + rollback simulation + propagation
   * preview + rehearsal counts and 6 experimentation health scores.
   * Pure in-memory simulation — never mutates production state.
   */
  readonly experimentation_summary?: {
    readonly node_id: string;
    readonly recent_sandboxes_24h: number;
    readonly recent_rollback_simulations_24h: number;
    readonly recent_propagation_previews_24h: number;
    readonly recent_rehearsals_24h: number;
    readonly recent_governance_decisions_24h: number;
    readonly health_scores: {
      readonly experimentation_clarity: Score0to100;
      readonly simulation_reliability: Score0to100;
      readonly rollback_rehearsal_confidence: Score0to100;
      readonly propagation_preview_quality: Score0to100;
      readonly sandbox_integrity: Score0to100;
      readonly experimentation_safety: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 26 — bounded live operational rehearsal substrate. Aggregates
   * active runtime count + 24h activity counts (runtimes, rollback
   * rehearsals, preview narratives, governance decisions, expirations)
   * + 6 live sandbox health scores. The runtime is a typed lifecycle
   * state machine wrapping Phase 25 projection — never spawns real
   * workers, never mutates production state.
   */
  readonly live_sandbox_summary?: {
    readonly node_id: string;
    readonly active_runtimes: number;
    readonly recent_runtimes_24h: number;
    readonly recent_rollback_rehearsals_24h: number;
    readonly recent_preview_narratives_24h: number;
    readonly recent_governance_decisions_24h: number;
    readonly recent_expirations_24h: number;
    readonly health_scores: {
      readonly sandbox_execution_clarity: Score0to100;
      readonly rehearsal_determinism: Score0to100;
      readonly rollback_rehearsal_confidence: Score0to100;
      readonly topology_containment_stability: Score0to100;
      readonly live_preview_trust: Score0to100;
      readonly sandbox_replay_reliability: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 27 — bounded delegated operational execution substrate.
   * Aggregates recent envelope issuance + execution + refusal + timeout
   * + expiration counts and 6 delegated-execution health scores.
   * Single-use, time-bounded, rollback-required, topology-contained,
   * synchronous-only execution. Operator is the sole authority source.
   */
  readonly delegated_execution_summary?: {
    readonly node_id: string;
    readonly recent_envelopes_24h: number;
    readonly recent_executions_24h: number;
    readonly recent_refusals_24h: number;
    readonly recent_timeouts_24h: number;
    readonly recent_expirations_24h: number;
    readonly recent_governance_decisions_24h: number;
    readonly health_scores: {
      readonly delegation_confidence: Score0to100;
      readonly rollback_certainty: Score0to100;
      readonly containment_integrity: Score0to100;
      readonly authority_reliability: Score0to100;
      readonly budget_safety: Score0to100;
      readonly replay_integrity: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 28 — Execution resource governance + operational economics.
   * Deterministic resource accounting. NOT autonomous orchestration.
   * Bounded, governance-safe, operator-visible, replay-safe.
   */
  readonly execution_economics_summary?: {
    readonly node_id: string;
    readonly recent_quota_exhaustions_24h: number;
    readonly recent_quota_governance_changes_24h: number;
    readonly recent_pressure_samples_24h: number;
    readonly recent_load_classifications_24h: number;
    readonly recent_forecasts_24h: number;
    readonly current_economics_tier: 'stable' | 'constrained' | 'elevated' | 'saturated' | 'exhausted';
    readonly health_scores: {
      readonly budget_reliability: Score0to100;
      readonly rollback_cost_certainty: Score0to100;
      readonly pressure_classification_confidence: Score0to100;
      readonly topology_load_integrity: Score0to100;
      readonly quota_safety: Score0to100;
      readonly replay_integrity: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 29 — Stabilization playbook intelligence + recovery governance.
   * Replay-safe stabilization recommendation intelligence. NOT
   * autonomous recovery orchestration. Bounded, deterministic,
   * rollback-protected, operator-mediated, replay-safe.
   */
  readonly stabilization_summary?: {
    readonly node_id: string;
    readonly recent_archetype_governance_changes_24h: number;
    readonly recent_sequencings_24h: number;
    readonly recent_forecasts_24h: number;
    readonly recent_pressure_samples_24h: number;
    readonly recent_governance_decisions_24h: number;
    readonly recent_finality_proofs_24h: number;
    readonly current_stabilization_tier: 'stable' | 'recovering' | 'strained' | 'critical' | 'failing';
    readonly health_scores: {
      readonly rollback_survivability_confidence: Score0to100;
      readonly continuity_restoration_trust: Score0to100;
      readonly recovery_replay_integrity: Score0to100;
      readonly topology_restoration_confidence: Score0to100;
      readonly stabilization_reliability: Score0to100;
      readonly recovery_governance_trust: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 30 — Recovery foresight UX + stabilization decision cognition.
   * Replay-safe stabilization comparison cognition. NOT decision
   * authority. Comparison ≠ recommendation. Side-by-side, no ranking.
   */
  readonly recovery_foresight_summary?: {
    readonly node_id: string;
    readonly recent_comparisons_24h: number;
    readonly recent_survivability_24h: number;
    readonly recent_tradeoffs_24h: number;
    readonly recent_archaeology_24h: number;
    readonly recent_walkthroughs_24h: number;
    readonly recent_governance_decisions_24h: number;
    readonly current_foresight_tier: 'clear' | 'explorable' | 'contested' | 'unsuitable' | 'blocked';
    readonly health_scores: {
      readonly comparison_neutrality: Score0to100;
      readonly survivability_visibility: Score0to100;
      readonly tradeoff_clarity: Score0to100;
      readonly archaeology_integrity: Score0to100;
      readonly guidance_advisory_safety: Score0to100;
      readonly decision_governance_trust: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 31 — Operator cognition continuity + governance memory.
   * Replay-safe governance memory and cognition continuity substrate.
   * Per-org append-only event log. NOT operator profiling.
   */
  readonly governance_memory_summary?: {
    readonly node_id: string;
    readonly recent_sessions_24h: number;
    readonly recent_events_24h: number;
    readonly recent_archaeology_24h: number;
    readonly recent_replays_24h: number;
    readonly recent_compressions_24h: number;
    readonly recent_narratives_24h: number;
    readonly recent_governance_decisions_24h: number;
    readonly current_density_tier: 'sparse' | 'partial' | 'developed' | 'dense' | 'compressed';
    readonly health_scores: {
      readonly memory_neutrality: Score0to100;
      readonly continuity_integrity: Score0to100;
      readonly timeline_visibility: Score0to100;
      readonly archaeology_integrity: Score0to100;
      readonly compression_transparency: Score0to100;
      readonly replay_determinism: Score0to100;
    };
    readonly last_updated: string;
  };

  /**
   * Phase 32 — Multi-operator governance continuity + handoff cognition.
   * Replay-safe per-org append-only handoff event log. NOT operator
   * ranking, NOT collaboration scoring, NOT behavioral inference.
   * authority_transfer_supported: false typed-as-literal on every handoff.
   */
  readonly operator_continuity_summary?: {
    readonly node_id: string;
    readonly recent_handoffs_24h: number;
    readonly recent_transfer_bundles_24h: number;
    readonly recent_archaeology_24h: number;
    readonly recent_replays_24h: number;
    readonly recent_compressions_24h: number;
    readonly recent_narratives_24h: number;
    readonly recent_governance_decisions_24h: number;
    readonly current_density_tier: 'silent' | 'sparse' | 'paired' | 'frequent' | 'continuous';
    readonly health_scores: {
      readonly handoff_neutrality: Score0to100;
      readonly transfer_lineage_integrity: Score0to100;
      readonly timeline_visibility: Score0to100;
      readonly archaeology_integrity: Score0to100;
      readonly compression_transparency: Score0to100;
      readonly replay_determinism: Score0to100;
    };
    readonly last_updated: string;
  };
}

// ---------------------------------------------------------------------------
// Inputs — what the engine reads
// ---------------------------------------------------------------------------

/**
 * Minimal capability shape the engine needs. Built from the Capability
 * model + enrichment. Kept narrow so the engine can run in tests with
 * synthetic data.
 */
export interface EngineCapabilityInput {
  readonly id: string;
  readonly project_id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly source: string;
  readonly user_status: 'in_progress' | 'verified' | 'archived' | string;
  readonly applicability_status: 'active' | 'deferred' | 'archived' | string;
  readonly frontend_route?: string | null;
  readonly is_page_bp?: boolean;
  /**
   * Capability taxonomy that drives queue task generation. See
   * Capability.kind in the model for full semantics. Added 2026-05-18.
   *
   * Queue gating:
   *   'service'   (default) — eligible for backend, frontend, verification tasks
   *   'page'      — eligible for ui_review + verification only
   *   'agent'     — skip backend-build (agent IS the backend code itself)
   *   'component' — skip backend-build + skip add_frontend (component lives inside other UI)
   */
  readonly kind?: 'service' | 'page' | 'agent' | 'component';
  readonly mode_override?: string | null;

  readonly last_execution?: {
    status?: string;
    evidence_completion_pct?: number;
    progress_md_mentions?: number;
    completed_steps?: ReadonlyArray<string>;
    validation_report?: Readonly<Record<string, unknown>>;
  } | null;

  readonly linked_backend_services?: ReadonlyArray<string> | null;
  readonly linked_frontend_components?: ReadonlyArray<string> | null;
  readonly linked_agents?: ReadonlyArray<string> | null;

  readonly ui_element_map?: {
    category_scores?: Readonly<Record<string, { verified?: boolean }>>;
    steps?: Readonly<Record<string, { run_at?: string; issues_found?: number }>>;
  } | null;

  readonly total_requirements: number;
  readonly matched_requirements: number;
  readonly verified_requirements: number;
  /**
   * Count of unmatched requirements EXCLUDING autonomy-engine-generated rows.
   * The queue's implement_reqs task generator should use this, not the raw
   * (total - matched) delta, because autonomy-generated requirements have
   * their own tracking surface and showing them in both places confuses
   * the operator. Added 2026-05-18 audit. May be undefined for older
   * inputs; queue should default to 0 in that case.
   */
  readonly operator_unmatched_requirements?: number;
  /**
   * File-content-based signals that gate health scoring. Computed once per
   * engine refresh (cached per file 1hr) by reading the cap's linked
   * backend files. Replaces the file-count heuristics that produced a
   * 90% false-positive rate on 'Improve reliability/automation for X'
   * priorities (2026-05-19 operator audit).
   *
   * When present:
   *   reliability dimension is skipped if reliability_signal === 'na'
   *     (pure-function service has nothing to wrap)
   *   automation dimension is skipped if automation_applicable === false
   *     (CRUD admin etc. don't need agents)
   *
   * When absent (old engine inputs / tests), scorer falls back to the
   * legacy file-count heuristics so behavior stays backward compatible.
   */
  readonly code_evidence?: {
    readonly reliability_signal: 'high' | 'medium' | 'low' | 'na';
    readonly automation_applicable: boolean;
    readonly evidence_files_read: number;
  };
}

export interface EngineProjectInput {
  readonly id: string;
  readonly target_mode: 'mvp' | 'production' | 'enterprise' | 'autonomous' | string;
  readonly setup_status: Readonly<Record<string, unknown>>;
  readonly capabilities: ReadonlyArray<EngineCapabilityInput>;
  readonly repo_file_tree: ReadonlyArray<string>;
  readonly latest_commit_sha?: string | null;
}
