/**
 * liveSandboxTypes — Phase 26. Types for the bounded live operational
 * rehearsal substrate.
 *
 * Architectural commitment (per the Phase 26 stress-test):
 *   - Phase 26 wraps Phase 25 projection inside a bounded async
 *     lifecycle envelope. The runtime is a typed lifecycle state
 *     machine — NOT a thread, process, queue worker, or compute
 *     execution environment.
 *   - Auto-expiration is structural: every runtime carries `expires_at`
 *     and an unref'd timer flips it to `expired` at TTL.
 *   - Topology isolation proof is structural verification (hashes +
 *     lineage). Actual detachment remains Phase 25's pure-in-memory
 *     projection boundary.
 *   - Heartbeats are observational only. They MUST NOT trigger
 *     orchestration / execution / recovery / topology mutation / retries.
 *   - Narratives inherit ALL Phase 24 anti-hallucination guarantees.
 */

import type { CompressionSourcePhase } from '../cognitiveCompression/cognitiveCompressionTypes';
import type {
  HypotheticalAction, ExecutionSandboxProfile,
  RollbackSimulationReplay,
} from '../experimentation/experimentationTypes';

// ─── Ephemeral runtime lifecycle (addendum #1) ───────────────────────

export type EphemeralRuntimeLifecycleTier =
  | 'pending'        // submitted, runtime not yet started
  | 'running'        // active heartbeats; in-memory simulation in flight
  | 'completed'      // simulation completed; runtime queryable until expiration
  | 'expired'        // TTL reached; auto-flipped by unref'd timer
  | 'failed';        // governance rejection or simulation error before completion

// ─── Boundary proof chain (addendum #2) ──────────────────────────────

/**
 * Hash chain that PROVES the rehearsal stayed bounded. Operators can
 * verify each hash post-hoc by re-running the same sandbox and matching
 * outputs. Phase 26 surfaces these proofs; Phase 25's pure-in-memory
 * simulation enforces the actual detachment.
 */
export interface SandboxBoundaryProofChain {
  readonly topology_detachment_hash: string;
  readonly runtime_isolation_hash: string;
  readonly replay_determinism_hash: string;
  readonly expiration_proof_hash: string;
  readonly mutation_avoidance_proof_hash: string;
}

// ─── Heartbeat attribution (addendum #3) ─────────────────────────────

export interface LiveSandboxHeartbeatAttribution {
  readonly tick_index: number;
  readonly recorded_at: string;
  readonly runtime_state: EphemeralRuntimeLifecycleTier;
  readonly elapsed_ms: number;
  readonly deterministic_hash: string;
}

// ─── Rehearsal preview citation (addendum #4) ────────────────────────

export interface RehearsalPreviewCitation {
  readonly source_kind: string;
  readonly source_id: string;
  readonly source_phase: CompressionSourcePhase | 'phase_25_experimentation' | 'phase_26_live_sandbox';
  readonly recorded_at: string;
  readonly fragment_quoted: string;
  readonly underlying_phase_25_sandbox_id?: string;
  readonly underlying_phase_26_runtime_id?: string;
}

// ─── Replay determinism bounds (addendum #5) ─────────────────────────

export interface SandboxReplayDeterminismBounds {
  readonly runtime_id: string;
  readonly replay_hash: string;
  readonly replayable: boolean;
  readonly deterministic: boolean;
  readonly runtime_expired: boolean;
  readonly bounded_reason?: string;
}

// ─── Runtime boundary tier (addendum #6) ─────────────────────────────

export type SandboxRuntimeBoundaryTier =
  | 'detached'       // never connected to production state (pre-run)
  | 'isolated'       // running with structural isolation in effect
  | 'bounded'        // completed within budget, all proofs verified
  | 'expiring'       // within 60s of TTL
  | 'expired';       // post-TTL, no longer queryable for live state

// ─── Lifecycle compression attribution (addendum #7) ─────────────────

export interface RuntimeLifecycleCompressionAttribution {
  readonly runtime_id: string;
  readonly heartbeat_count: number;
  readonly replay_window_ms: number;
  readonly compressed_events: number;        // events excluded from retained replay
  readonly retained_events: number;          // events included in retained replay
  readonly deterministic_hash: string;
}

// ─── Expiration attribution (addendum #8) ────────────────────────────

export type SandboxExpirationTrigger =
  | 'ttl_reached'                       // unref'd timer flipped
  | 'operator_cancelled'                // operator-initiated cancel
  | 'governance_rejected'               // governance supervisor rejected mid-flight
  | 'budget_exhausted'                  // projection budget hit during run
  | 'simulation_failed';                // underlying Phase 25 simulation rejected

export interface SandboxExpirationAttribution {
  readonly runtime_id: string;
  readonly expiration_reason: string;
  readonly runtime_duration_ms: number;
  readonly lifecycle_terminal_state: EphemeralRuntimeLifecycleTier;
  readonly expiration_trigger: SandboxExpirationTrigger;
  readonly recorded_at: string;
}

// ─── Ephemeral runtime profile ───────────────────────────────────────

export interface EphemeralSandboxRuntimeProfile {
  readonly runtime_id: string;
  readonly experiment_id: string;
  readonly organization_id: string;
  readonly lifecycle_state: EphemeralRuntimeLifecycleTier;
  readonly boundary_tier: SandboxRuntimeBoundaryTier;
  readonly started_at: string;
  readonly expires_at: string;
  readonly completed_at?: string;
  readonly failed_at?: string;
  readonly expired_at?: string;
  readonly underlying_phase_25_sandbox_id?: string;
  readonly heartbeats: ReadonlyArray<LiveSandboxHeartbeatAttribution>;
  readonly boundary_proof: SandboxBoundaryProofChain;
  readonly compression: RuntimeLifecycleCompressionAttribution;
  readonly expiration?: SandboxExpirationAttribution;
  readonly attribution_log: ReadonlyArray<{
    readonly recorded_at: string;
    readonly transition: EphemeralRuntimeLifecycleTier;
    readonly note?: string;
  }>;
}

// ─── Sandbox execution envelope ──────────────────────────────────────

export interface SandboxExecutionEnvelope {
  readonly runtime_id: string;
  readonly organization_id: string;
  readonly hypothetical_actions: ReadonlyArray<HypotheticalAction>;
  readonly bounded_budget: {
    readonly max_ttl_ms: number;
    readonly max_heartbeat_count: number;
    readonly max_action_count: number;
    readonly max_simulation_depth: number;
  };
  readonly operator_authorization: {
    readonly operator_id: string;
    readonly authorized_at: string;
    readonly authorization_hash: string;
  };
}

// ─── Topology isolation profile ──────────────────────────────────────

export interface SandboxTopologyIsolationProfile {
  readonly runtime_id: string;
  readonly organization_id: string;
  readonly detachment_proofs: {
    readonly production_topology_detached: true;       // typed-as-true: structural guarantee
    readonly federation_topology_detached: true;
    readonly distributed_runtime_detached: true;
    readonly cross_org_attempts_blocked: true;
  };
  readonly snapshot_lineage: {
    readonly phase_22_graph_snapshot_hash: string;
    readonly phase_23_substrate_snapshot_hash: string;
    readonly snapshot_taken_at: string;
  };
  readonly verification_hash: string;
  readonly built_at: string;
}

// ─── Rollback rehearsal replay ───────────────────────────────────────

export interface SandboxRollbackRehearsalReplay {
  readonly rehearsal_id: string;
  readonly runtime_id: string;
  readonly experiment_id: string;
  readonly organization_id: string;
  readonly underlying_phase_25_simulation: RollbackSimulationReplay;
  readonly preview_citation: RehearsalPreviewCitation;
  readonly determinism: SandboxReplayDeterminismBounds;
  readonly built_at: string;
}

// ─── Operational preview narrative ───────────────────────────────────

export interface OperationalPreviewNarrativeBlock {
  readonly block_id: string;
  readonly template_id: string;
  readonly rendered_text: string;
  readonly citations: ReadonlyArray<RehearsalPreviewCitation>;
  readonly deterministic_hash: string;
}

export interface OperationalPreviewNarrative {
  readonly narrative_id: string;
  readonly runtime_id: string;
  readonly organization_id: string;
  readonly kind: 'sandbox_lifecycle' | 'rollback_rehearsal' | 'topology_preview' | 'continuity_preview';
  readonly blocks: ReadonlyArray<OperationalPreviewNarrativeBlock>;
  readonly built_at: string;
}

// ─── Governance attribution ──────────────────────────────────────────

export type LiveSandboxGovernanceDecision =
  | 'permitted'
  | 'rejected'
  | 'flagged';

export type LiveSandboxSupervisorRule =
  | 'organization_id_missing'
  | 'operator_id_missing'
  | 'ttl_exceeds_max'
  | 'budget_exceeds_max'
  | 'action_count_exceeds_max'
  | 'recursive_sandbox_attempt'
  | 'depth_exceeds_max'
  | 'underlying_phase_25_rejected';

export interface SandboxGovernanceAttribution {
  readonly runtime_id: string;
  readonly organization_id: string;
  readonly operator_id: string;
  readonly decision: LiveSandboxGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: LiveSandboxSupervisorRule;
  readonly recorded_at: string;
}

export interface SandboxGovernanceProfile {
  readonly organization_id: string;
  readonly recent_decisions: ReadonlyArray<SandboxGovernanceAttribution>;
  readonly decision_counts: { readonly permitted: number; readonly rejected: number; readonly flagged: number };
  readonly violation_counts_by_rule: Readonly<Record<LiveSandboxSupervisorRule, number>>;
  readonly built_at: string;
}

// ─── Trust surface ───────────────────────────────────────────────────

export interface SandboxTrustSurface {
  readonly organization_id: string;
  readonly bands: ReadonlyArray<{
    readonly label: string;
    readonly score: number;
    readonly inherited_from_phase: CompressionSourcePhase | 'phase_25_experimentation' | 'phase_26_live_sandbox';
    readonly drivers: ReadonlyArray<string>;
    readonly source_attribution_id: string;
  }>;
  readonly aggregate_score: number;
  readonly built_at: string;
}

// ─── Visibility ──────────────────────────────────────────────────────

export interface LiveSandboxVisibilityReplay {
  readonly organization_id: string;
  readonly recent_runtimes: ReadonlyArray<EphemeralSandboxRuntimeProfile>;
  readonly recent_rollback_rehearsals: ReadonlyArray<SandboxRollbackRehearsalReplay>;
  readonly recent_preview_narratives: ReadonlyArray<OperationalPreviewNarrative>;
  readonly recent_governance_decisions: ReadonlyArray<SandboxGovernanceAttribution>;
  readonly trust_surface: SandboxTrustSurface;
  readonly built_at: string;
}

// ─── Health surface ──────────────────────────────────────────────────

export interface LiveSandboxHealthScores {
  readonly sandbox_execution_clarity: number;
  readonly rehearsal_determinism: number;
  readonly rollback_rehearsal_confidence: number;
  readonly topology_containment_stability: number;
  readonly live_preview_trust: number;
  readonly sandbox_replay_reliability: number;
}

export interface LiveSandboxSummarySnapshot {
  readonly node_id: string;
  readonly active_runtimes: number;
  readonly recent_runtimes_24h: number;
  readonly recent_rollback_rehearsals_24h: number;
  readonly recent_preview_narratives_24h: number;
  readonly recent_governance_decisions_24h: number;
  readonly recent_expirations_24h: number;
  readonly health_scores: LiveSandboxHealthScores;
  readonly last_updated: string;
}

// ─── Architectural caps ──────────────────────────────────────────────

export const MAX_LIVE_SANDBOX_DEPTH = 1;
export const MAX_RUNTIMES_PER_PARTITION = 100;
export const MAX_HEARTBEATS_PER_RUNTIME = 50;
export const MAX_PREVIEW_NARRATIVES_PER_PARTITION = 100;
export const MAX_ROLLBACK_REHEARSALS_PER_PARTITION = 100;
export const MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION = 200;
export const MAX_RUNTIME_TTL_MS = 5 * 60_000;          // 5 minutes hard cap
export const DEFAULT_RUNTIME_TTL_MS = 60_000;          // 1 minute default
export const MAX_HEARTBEAT_INTERVAL_MS = 5_000;
export const RUNTIME_EXPIRING_WINDOW_MS = 60_000;      // boundary tier 'expiring' last 60s
