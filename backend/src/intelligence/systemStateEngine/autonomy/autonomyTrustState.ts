/**
 * autonomyTrustState — in-memory per-project trust profiles per action
 * class. Persisted to LearningPolicySnapshot rows (cooldown-bounded;
 * see runAutonomousOutcomeLearningTick) but the engine state read goes
 * through this in-memory cache to keep buildAuthoritativeStateFromInputs
 * synchronous.
 *
 * Phase 13 §B (in-memory companion to the LearningPolicySnapshot
 * persistence path).
 */

export type AutonomyActionClass = 'autonomous_safe' | 'supervised_safe' | 'operator_required' | 'autonomy_blocked';

export interface AutonomyTrustEntry {
  readonly action_class: AutonomyActionClass;
  readonly success_count: number;
  readonly rollback_count: number;
  readonly blocked_count: number;
  readonly trust_score: number;
  readonly last_updated_at: string;        // ISO
}

export interface ProjectTrustProfile {
  readonly project_id: string;
  readonly profiles_by_class: Readonly<Record<AutonomyActionClass, AutonomyTrustEntry>>;
  readonly recent_executions: number;
  readonly recent_rollbacks: number;
  readonly recent_blocks: number;
  readonly snapshot_at: string;
}

interface MutableEntry {
  success_count: number;
  rollback_count: number;
  blocked_count: number;
  trust_score: number;
  last_updated_at: number;
}

interface MutableState {
  by_class: Record<AutonomyActionClass, MutableEntry>;
  recent_executions: number;
  recent_rollbacks: number;
  recent_blocks: number;
  last_event_at: number;
}

const states = new Map<string, MutableState>();

function emptyEntry(): MutableEntry {
  return { success_count: 0, rollback_count: 0, blocked_count: 0, trust_score: 50, last_updated_at: Date.now() };
}

function getOrInit(project_id: string): MutableState {
  let s = states.get(project_id);
  if (!s) {
    s = {
      by_class: {
        autonomous_safe: emptyEntry(),
        supervised_safe: emptyEntry(),
        operator_required: emptyEntry(),
        autonomy_blocked: emptyEntry(),
      },
      recent_executions: 0,
      recent_rollbacks: 0,
      recent_blocks: 0,
      last_event_at: Date.now(),
    };
    states.set(project_id, s);
  }
  return s;
}

function recomputeTrust(entry: MutableEntry): number {
  const denom = entry.success_count + entry.rollback_count + entry.blocked_count;
  if (denom === 0) return 50;
  // Trust score: success-weighted, penalized by rollback + block.
  const successPct = entry.success_count / denom;
  const rollbackPenalty = entry.rollback_count / denom;
  const blockPenalty = entry.blocked_count / denom;
  // Anchor at 50; +50 for full success, -40 for full rollback, -20 for full block.
  return Math.max(0, Math.min(100, Math.round(50 + successPct * 50 - rollbackPenalty * 40 - blockPenalty * 20)));
}

export function recordExecutionSuccess(project_id: string, action_class: AutonomyActionClass): void {
  const s = getOrInit(project_id);
  const entry = s.by_class[action_class];
  entry.success_count++;
  entry.last_updated_at = Date.now();
  entry.trust_score = recomputeTrust(entry);
  s.recent_executions++;
  s.last_event_at = Date.now();
}

export function recordExecutionRollback(project_id: string, action_class: AutonomyActionClass): void {
  const s = getOrInit(project_id);
  const entry = s.by_class[action_class];
  entry.rollback_count++;
  entry.last_updated_at = Date.now();
  entry.trust_score = recomputeTrust(entry);
  s.recent_rollbacks++;
  s.last_event_at = Date.now();
}

export function recordExecutionBlocked(project_id: string, action_class: AutonomyActionClass): void {
  const s = getOrInit(project_id);
  const entry = s.by_class[action_class];
  entry.blocked_count++;
  entry.last_updated_at = Date.now();
  entry.trust_score = recomputeTrust(entry);
  s.recent_blocks++;
  s.last_event_at = Date.now();
}

export function readTrustProfile(project_id: string): ProjectTrustProfile {
  const s = getOrInit(project_id);
  const profiles_by_class: Record<AutonomyActionClass, AutonomyTrustEntry> = {} as any;
  for (const klass of Object.keys(s.by_class) as AutonomyActionClass[]) {
    const e = s.by_class[klass];
    profiles_by_class[klass] = {
      action_class: klass,
      success_count: e.success_count,
      rollback_count: e.rollback_count,
      blocked_count: e.blocked_count,
      trust_score: e.trust_score,
      last_updated_at: new Date(e.last_updated_at).toISOString(),
    };
  }
  return {
    project_id,
    profiles_by_class: Object.freeze(profiles_by_class),
    recent_executions: s.recent_executions,
    recent_rollbacks: s.recent_rollbacks,
    recent_blocks: s.recent_blocks,
    snapshot_at: new Date().toISOString(),
  };
}

export function executionSuccessRate(project_id: string): number {
  const s = getOrInit(project_id);
  let success = 0;
  let total = 0;
  for (const e of Object.values(s.by_class)) {
    success += e.success_count;
    total += e.success_count + e.rollback_count;
  }
  if (total === 0) return 100;
  return Math.round((success / total) * 100);
}

// Phase 14 — verification counters (separate from execution success/rollback
// counters because we want to track empirical post-execution outcomes
// distinct from the execution itself completing). 'verification_timeout'
// (no validation report received within 6h) does NOT count as either —
// we lack evidence either way.
const verificationCounters = new Map<string, { success: number; failure: number; last_updated_at: number }>();

export function recordVerificationSuccess(project_id: string): void {
  const c = verificationCounters.get(project_id) ?? { success: 0, failure: 0, last_updated_at: Date.now() };
  c.success++;
  c.last_updated_at = Date.now();
  verificationCounters.set(project_id, c);
}

export function recordVerificationFailure(project_id: string): void {
  const c = verificationCounters.get(project_id) ?? { success: 0, failure: 0, last_updated_at: Date.now() };
  c.failure++;
  c.last_updated_at = Date.now();
  verificationCounters.set(project_id, c);
}

export function verificationSuccessRate(project_id: string): number {
  const c = verificationCounters.get(project_id);
  if (!c || (c.success + c.failure) === 0) return 100;
  return Math.round((c.success / (c.success + c.failure)) * 100);
}

export interface VerificationCounters {
  readonly success: number;
  readonly failure: number;
  readonly success_rate: number;
}

export function readVerificationCounters(project_id: string): VerificationCounters {
  const c = verificationCounters.get(project_id) ?? { success: 0, failure: 0, last_updated_at: 0 };
  return { success: c.success, failure: c.failure, success_rate: verificationSuccessRate(project_id) };
}

export function _resetVerificationCounters(): void {
  verificationCounters.clear();
}

export function rollbackFrequency(project_id: string): number {
  const s = getOrInit(project_id);
  let rollback = 0;
  let total = 0;
  for (const e of Object.values(s.by_class)) {
    rollback += e.rollback_count;
    total += e.success_count + e.rollback_count;
  }
  if (total === 0) return 0;
  return Math.round((rollback / total) * 100);
}

export function _resetAutonomyTrustState(): void {
  states.clear();
}
