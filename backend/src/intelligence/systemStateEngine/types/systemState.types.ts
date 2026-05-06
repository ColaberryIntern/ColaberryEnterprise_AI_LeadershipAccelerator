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
  | 'validation_drift';            // validation_report.commitSha doesn't match repo HEAD

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
