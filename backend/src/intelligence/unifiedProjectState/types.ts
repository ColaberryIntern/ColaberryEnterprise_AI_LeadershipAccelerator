/**
 * UnifiedProjectState — One canonical operational state object.
 *
 * One Brain Consolidation Sprint, 2026-05-09.
 *
 * The unified state is a READ-ONLY synthesizer over existing engines.
 * It does NOT introduce a new cognition layer. It does NOT compute
 * anything that isn't already computed elsewhere. Its contract:
 *
 *   - One source of truth for readiness, coverage, confidence, health.
 *   - One ranked operational queue (Cory's authority).
 *   - One next step the entire UI agrees on.
 *   - One blocker list, one active build, one verification status.
 *
 * Frontend code that needs operational state reads from a single hook
 * (useUnifiedProjectState). Local recomputation is forbidden. If a
 * surface needs a value that isn't here, add it here — never compute
 * locally.
 */

export type ReadinessBand = 'red' | 'amber' | 'green';
export type BlastRadiusBand = 'low' | 'medium' | 'high';
export type QueueSourceKind =
  | 'next_action'
  | 'governance_recommendation'
  | 'visual_workspace_pending'
  | 'verification_failure'
  | 'capability_gap';

export interface ReadinessProfile {
  /** 0..100 composite readiness score */
  score: number;
  /** semantic band derived from score */
  band: ReadinessBand;
  /** human-readable reasons for the current band */
  reasons: string[];
  /** dimension breakdown so the UI can render a sparkline if it wants */
  breakdown: {
    artifact_completion: number;
    requirements_coverage: number;
    github_health: number;
    portfolio_quality: number;
    workflow_progress: number;
  };
}

export interface CoverageProfile {
  /** 0..100 composite coverage score */
  score: number;
  /** matched / total requirements */
  requirements_matched: number;
  requirements_total: number;
  /** capabilities (BPs) for which a build has landed */
  bps_complete: number;
  bps_total: number;
}

export interface ConfidenceProfile {
  /** 0..100 confidence in the current operational state */
  score: number;
  sources: string[];
}

export interface HealthProfile {
  /** 0..100 operational health */
  score: number;
  /** placeholder counters — populated when telemetry/verification feeds are wired in */
  regressions_24h: number;
  verification_pass_rate: number;
}

export interface BlastRadiusProfile {
  band: BlastRadiusBand;
  reason?: string;
}

export interface NextActionProfile {
  /** Stable id from the source engine (if available) */
  source_id: string | null;
  source: QueueSourceKind;
  title: string;
  /** Why this matters now — plain language */
  reason: string;
  /** Composite priority 0..100 used by the queue ranker */
  priority_score: number;
  /** Confidence 0..100 (engine-emitted; pass-through) */
  confidence_score: number;
  /** Estimated minutes to complete; null if unknown */
  time_est_minutes: number | null;
  /** Blast radius / reversibility hint */
  blast_radius: BlastRadiusProfile;
  /** Where the operator should land to act on it */
  target_route: string;
  /** Optional metadata for explainability */
  metadata?: Record<string, any>;
}

export type QueueEntry = NextActionProfile & {
  /** Position in the ranked queue (1-based) */
  rank: number;
};

export interface BlockerEntry {
  /** Stable id where applicable */
  source_id: string | null;
  source: QueueSourceKind;
  title: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ActiveBuildProfile {
  source: QueueSourceKind;
  /** Free-text description (e.g. "Pilot funnel attribution") */
  title: string;
  started_at: string;
  /** Page route or capability id the build targets */
  target_ref: string;
}

export interface VerificationStateProfile {
  /** Number of items pending operator verification */
  pending: number;
  /** Items currently passing */
  passing: number;
  /** Items currently failing */
  failing: number;
  /** Last 24h pass rate as a fraction 0..1 */
  pass_rate_24h: number;
}

export interface UnifiedProjectState {
  /** Project metadata snapshot */
  project: {
    id: string;
    organization_name: string | null;
    industry: string | null;
    project_stage: string;
  };

  /** ONE readiness — every UI surface consumes this */
  readiness: ReadinessProfile;

  /** ONE coverage — every UI surface consumes this */
  coverage: CoverageProfile;

  /** ONE confidence */
  confidence: ConfidenceProfile;

  /** ONE health */
  health: HealthProfile;

  /** THE next step (top of queue) — Cory's authority */
  next_action: NextActionProfile | null;

  /** ONE ranked operational queue (top N entries) */
  queue: QueueEntry[];

  /** ONE blocker list */
  blockers: BlockerEntry[];

  /** ONE active build (or null) */
  active_build: ActiveBuildProfile | null;

  /** ONE verification state */
  verification: VerificationStateProfile;

  /** When this snapshot was built */
  built_at: string;
}
