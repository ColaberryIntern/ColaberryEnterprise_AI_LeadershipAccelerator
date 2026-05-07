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
  | 'optimization';

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
}

export interface EngineProjectInput {
  readonly id: string;
  readonly target_mode: 'mvp' | 'production' | 'enterprise' | 'autonomous' | string;
  readonly setup_status: Readonly<Record<string, unknown>>;
  readonly capabilities: ReadonlyArray<EngineCapabilityInput>;
  readonly repo_file_tree: ReadonlyArray<string>;
  readonly latest_commit_sha?: string | null;
}
