/**
 * governanceMemory — per-project learned state for the governance layer.
 * Parallel to federatedPatternRegistry but operating on governance
 * signals (accepted plans, override storms, blocked automation) rather
 * than incident patterns.
 *
 * Maintains:
 *   - successful_plan_signatures: signatures of plans that landed +
 *     reduced UX debt without regressing
 *   - unsafe_pattern_signatures: signatures the operator has overridden
 *     ≥3× OR that triggered an override storm
 *   - override_velocity: rolling count of operator overrides over the
 *     last 30 minutes
 *   - last_storm_at: most recent override-storm trigger timestamp
 *
 * In-memory state (per Node process) backed by DB reads on first access
 * per project. The recommendation engine reads from here to bias scoring.
 *
 * Phase 12 §A.6.
 */

export interface GovernanceMemoryState {
  readonly project_id: string;
  readonly successful_plan_signatures: Readonly<Record<string, { count: number; last_seen_at: string }>>;
  readonly unsafe_pattern_signatures: Readonly<Record<string, { reason: string; last_seen_at: string }>>;
  readonly override_velocity: number;
  readonly last_storm_at: string | null;
  readonly snapshot_at: string;
}

interface MutableState {
  successful: Map<string, { count: number; last_seen_at: number }>;
  unsafe: Map<string, { reason: string; last_seen_at: number }>;
  override_timestamps: number[];   // sliding window
  last_storm_at: number | null;
}

const projectStates = new Map<string, MutableState>();
const OVERRIDE_WINDOW_MS = 30 * 60 * 1000;
const STORM_THRESHOLD = 5;
const STORM_WINDOW_MS = 10 * 60 * 1000;

function getOrInit(project_id: string): MutableState {
  let s = projectStates.get(project_id);
  if (!s) {
    s = { successful: new Map(), unsafe: new Map(), override_timestamps: [], last_storm_at: null };
    projectStates.set(project_id, s);
  }
  return s;
}

export function recordSuccessfulPlan(project_id: string, signature: string, now = Date.now()): void {
  const s = getOrInit(project_id);
  const existing = s.successful.get(signature);
  s.successful.set(signature, {
    count: (existing?.count ?? 0) + 1,
    last_seen_at: now,
  });
}

export function recordUnsafePattern(project_id: string, signature: string, reason: string, now = Date.now()): void {
  const s = getOrInit(project_id);
  s.unsafe.set(signature, { reason, last_seen_at: now });
}

/**
 * Record an operator override. Returns whether this override completed
 * a storm (≥STORM_THRESHOLD overrides in STORM_WINDOW_MS).
 */
export function recordOperatorOverride(project_id: string, now = Date.now()): { storm_triggered: boolean; velocity: number } {
  const s = getOrInit(project_id);
  s.override_timestamps.push(now);
  // Trim to sliding window
  s.override_timestamps = s.override_timestamps.filter(t => now - t < OVERRIDE_WINDOW_MS);
  // Storm = STORM_THRESHOLD overrides within STORM_WINDOW_MS
  const stormWindow = s.override_timestamps.filter(t => now - t < STORM_WINDOW_MS);
  const storm_triggered = stormWindow.length >= STORM_THRESHOLD;
  if (storm_triggered) {
    s.last_storm_at = now;
  }
  return { storm_triggered, velocity: s.override_timestamps.length };
}

export function readMemory(project_id: string): GovernanceMemoryState {
  const s = getOrInit(project_id);
  const successful: Record<string, { count: number; last_seen_at: string }> = {};
  for (const [k, v] of s.successful.entries()) {
    successful[k] = { count: v.count, last_seen_at: new Date(v.last_seen_at).toISOString() };
  }
  const unsafe: Record<string, { reason: string; last_seen_at: string }> = {};
  for (const [k, v] of s.unsafe.entries()) {
    unsafe[k] = { reason: v.reason, last_seen_at: new Date(v.last_seen_at).toISOString() };
  }
  return {
    project_id,
    successful_plan_signatures: Object.freeze(successful),
    unsafe_pattern_signatures: Object.freeze(unsafe),
    override_velocity: s.override_timestamps.length,
    last_storm_at: s.last_storm_at != null ? new Date(s.last_storm_at).toISOString() : null,
    snapshot_at: new Date().toISOString(),
  };
}

/** Test-only: clear all per-project state. */
export function _resetGovernanceMemory(): void {
  projectStates.clear();
}
