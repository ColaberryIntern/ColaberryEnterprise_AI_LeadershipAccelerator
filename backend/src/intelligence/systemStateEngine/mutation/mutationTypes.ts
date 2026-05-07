/**
 * mutationTypes — Phase 15 governance primitives.
 *
 * `MutationEnvelope` is THE first-class abstraction for every governed
 * autonomous mutation of the platform's own operational cognition state.
 * Engine-internal state mutations (queue stabilization, automation
 * downgrades, isolation, trust recalibration, policy nudges) ALL flow
 * through this envelope so they share governance, audit, replay, blast
 * radius, and rollback treatment.
 *
 * Phase 15 explicitly does NOT mutate user code, run Claude Code in
 * process, or screenshot/DOM-diff render output. See the Phase 15
 * validation report § "Out of scope".
 */

/**
 * The 7 mutation intent classes the engine can fire autonomously.
 * Trust learning evolves PER intent class so a misbehaving class
 * (e.g., POLICY_NUDGE oscillating) can lose autonomy without dragging
 * down the others.
 */
export type MutationIntent =
  | 'QUEUE_STABILIZATION'         // rerank suppression / cooldown gates
  | 'PRESSURE_REBALANCE'          // remediation pressure drop after isolation
  | 'ISOLATION_CONTAINMENT'       // add/extend isolation registry entries
  | 'AUTOMATION_DEESCALATION'     // setAutomationMode(supervised|frozen)
  | 'TRUST_RECALIBRATION'         // one-shot trust adjustment
  | 'POLICY_NUDGE'                // cognitivePolicy threshold ±5
  | 'SELF_HEALING_ACTION';        // composite — wraps Phase 14 self-heal

/**
 * Reversibility classes. Drives the rollback strategy:
 *   - 'pure_inmemory': in-memory state flip; rollback = inverse flip.
 *   - 'audit_backed':  audit row drives source of truth; rollback writes
 *                      a compensating audit entry.
 *   - 'persisted_state': touched a DB column; rollback is a column UPDATE.
 *   - 'composite':     multi-step chain; rollback walks the chain in reverse.
 */
export type MutationReversibility =
  | 'pure_inmemory'
  | 'audit_backed'
  | 'persisted_state'
  | 'composite';

export type MutationVerificationStatus =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'verification_timeout';

export type MutationContainmentState =
  | 'none'              // ordinary execution
  | 'monitoring'        // flagged but not isolated yet
  | 'contained'         // wrapped inside containMutationCascade workflow
  | 'frozen';           // intent class globally frozen by policy

/**
 * Provenance chain — the cognition history that caused this mutation.
 * Foundational for operational causality replay (Phase 16+).
 *
 * Each entry is a short sentence ('rage spike on /dashboard') plus an
 * optional source reference (event id, audit id, contradiction id).
 */
export interface MutationProvenanceEntry {
  readonly source: 'contradiction' | 'pressure_escalation' | 'queue_evolution' | 'remediation' | 'governance' | 'stabilization' | 'self_heal' | 'operator_request';
  readonly summary: string;
  readonly source_id?: string;
  readonly recorded_at: string;     // ISO timestamp
}

export interface MutationProvenanceChain {
  readonly entries: ReadonlyArray<MutationProvenanceEntry>;
  /** Highest-severity link in the chain ('error' if any entry was an error event, etc.) */
  readonly inherited_severity: 'info' | 'warning' | 'error';
}

/**
 * Bounded scope describing WHAT the mutation touches. Used by the blast
 * radius forecaster + the verification engine.
 */
export interface MutationScope {
  readonly project_id: string;
  /** What domain the mutation lives in. */
  readonly domain: 'queue' | 'governance' | 'isolation' | 'pressure' | 'trust' | 'policy' | 'composite';
  /** Optional surface-level reference — e.g., capability id, cluster signature, intent class. */
  readonly subject_id?: string;
  /** Hard caps the engine self-imposes for this mutation (used by safety guardrails). */
  readonly limits: {
    readonly max_rerank_delta?: number;
    readonly max_threshold_delta?: number;
    readonly max_concurrent_per_class?: number;
    readonly max_rollback_depth?: number;
  };
}

/**
 * Forward-looking blast forecast attached to the envelope when it was
 * created. Same shape pattern as Phase 14's BlastRadiusProfile but
 * tailored to operational-state mutations (no UX collateral routes).
 */
export interface MutationBlastForecast {
  readonly score: number;                  // 0-100
  readonly tier: 'low' | 'moderate' | 'high';
  readonly contributing_factors: ReadonlyArray<string>;
  readonly dependency_propagation: number; // 0-100
  readonly orchestration_destabilization: number;
  readonly cognition_ripple: number;
  readonly conflict_with_active_mutations: number;
}

/**
 * The first-class governance primitive. EVERY autonomous mutation
 * creates an envelope before it touches state.
 */
export interface MutationEnvelope {
  readonly mutation_id: string;             // uuid-like; client-side generated
  readonly mutation_class: MutationIntent;
  readonly mutation_intent: string;          // human-readable one-liner
  readonly scope: MutationScope;
  readonly reversibility: MutationReversibility;
  /**
   * Ordered list of inverse operations. Rollback walks this in reverse.
   * Each step is a JSON-serializable record the rollback coordinator
   * knows how to execute (kind + args).
   */
  readonly rollback_chain: ReadonlyArray<RollbackStep>;
  readonly blast_radius: MutationBlastForecast;
  readonly trust_score: number;              // 0-100 trust at envelope creation time
  readonly verification_status: MutationVerificationStatus;
  readonly containment_state: MutationContainmentState;
  /** Where this mutation came from. */
  readonly provenance: MutationProvenanceChain;
  /** 'autonomous' = engine-fired; 'operator_assisted' = operator clicked through. */
  readonly provenance_origin: 'autonomous' | 'operator_assisted';
  readonly created_at: string;               // ISO
  readonly executed_at: string | null;
  readonly verified_at: string | null;
  readonly rolled_back_at: string | null;
}

export interface RollbackStep {
  readonly kind: 'restore_automation_mode' | 'lift_isolation' | 'restore_trust' | 'restore_policy' | 'restore_pressure' | 'undo_cooldown' | 'noop';
  readonly args: Readonly<Record<string, unknown>>;
}

export interface MutationVerificationResult {
  readonly mutation_id: string;
  readonly mutation_success: boolean;
  readonly rendered_change_verified: boolean | null;   // null when N/A for the intent class
  readonly cognition_improvement_verified: boolean | null;
  readonly regression_detected: boolean;
  readonly rollback_required: boolean;
  readonly verification_confidence: number;            // 0-100
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly verified_at: string;
}

/**
 * Per-intent-class trust profile. Mirrors Phase 13's autonomyTrustState
 * shape but keyed on MutationIntent.
 */
export interface MutationTrustEntry {
  readonly intent_class: MutationIntent;
  readonly trust_score: number;             // 0-100
  readonly success_count: number;
  readonly rollback_count: number;
  readonly contained_count: number;
  readonly verification_failure_count: number;
  readonly last_updated_at: number;         // epoch ms
}

export interface MutationTrustProfile {
  readonly project_id: string;
  readonly profiles_by_intent: Readonly<Record<MutationIntent, MutationTrustEntry>>;
  readonly autonomy_recommended_intent: MutationIntent | null;
}

export interface MutationContainmentSnapshot {
  readonly project_id: string;
  readonly contained_classes: ReadonlyArray<MutationIntent>;
  readonly frozen_classes: ReadonlyArray<MutationIntent>;
  readonly active_workflows: ReadonlyArray<{
    readonly workflow_id: string;
    readonly trigger: string;
    readonly started_at: string;
    readonly steps_completed: ReadonlyArray<string>;
  }>;
}

/**
 * Summary surface for the AuthoritativeSystemState.mutation_summary
 * block. Sync, in-memory only.
 */
export interface MutationSummarySnapshot {
  readonly active_envelopes_24h: number;
  readonly recent_verifications: number;
  readonly recent_rollbacks: number;
  readonly contained_classes_count: number;
  readonly frozen_classes_count: number;
  readonly avg_trust_score: number;
  readonly highest_trust_intent: MutationIntent | null;
}

export const MUTATION_INTENT_CLASSES: ReadonlyArray<MutationIntent> = [
  'QUEUE_STABILIZATION',
  'PRESSURE_REBALANCE',
  'ISOLATION_CONTAINMENT',
  'AUTOMATION_DEESCALATION',
  'TRUST_RECALIBRATION',
  'POLICY_NUDGE',
  'SELF_HEALING_ACTION',
];
