/**
 * executionDriftDetector — Phase 13 §H.
 *
 * Heartbeat-driven (registers with awarenessHeartbeatManager); runs at
 * most every 30 minutes per project (gated by withCooldown). Flags
 * drift when:
 *   - success_rate drops below 50%
 *   - rollback_frequency rises above 15%
 *   - blocked_count rises 3× baseline
 *   - operator override velocity > 5/30min while autonomy active
 *
 * On flag → publishes `autonomy.trust.changed` (warning severity).
 */

import { withCooldown } from '../realtime/cognitiveStabilityProtection';
import { executionSuccessRate, rollbackFrequency, readTrustProfile } from './autonomyTrustState';
import { readMemory } from '../governance/governanceMemory';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const DETECT_COOLDOWN_MS = 30 * 60 * 1000;
const SUCCESS_FLOOR = 50;
const ROLLBACK_CEILING = 15;
const OVERRIDE_VELOCITY_CEILING = 5;
const BLOCKED_BASELINE_MULTIPLIER = 3;

export interface DriftSignal {
  readonly project_id: string;
  readonly drift_detected: boolean;
  readonly drift_score: number;          // 0-100, higher = worse
  readonly reasons: ReadonlyArray<string>;
  readonly snapshot_at: string;
}

export function detectExecutionDrift(project_id: string, opts?: { force?: boolean }): DriftSignal | null {
  // Cooldown gate (skip if recently checked, unless forced for tests)
  if (!opts?.force && !withCooldown(`drift_detector_${project_id}`, DETECT_COOLDOWN_MS)) {
    return null;
  }
  const reasons: string[] = [];
  let driftScore = 0;
  const successRate = executionSuccessRate(project_id);
  if (successRate < SUCCESS_FLOOR) {
    reasons.push(`Success rate dropped below ${SUCCESS_FLOOR}% (current ${successRate}%).`);
    driftScore += 30;
  }
  const rbFreq = rollbackFrequency(project_id);
  if (rbFreq > ROLLBACK_CEILING) {
    reasons.push(`Rollback frequency above ${ROLLBACK_CEILING}% (current ${rbFreq}%).`);
    driftScore += 25;
  }
  const memory = readMemory(project_id);
  if (memory.override_velocity > OVERRIDE_VELOCITY_CEILING) {
    reasons.push(`Operator override velocity high (${memory.override_velocity}).`);
    driftScore += 25;
  }
  const trust = readTrustProfile(project_id);
  // Baseline: average blocked across the 4 action classes; per-class sum
  // > 3× the average tells us blocks are spiking.
  const totalBlocks = Object.values(trust.profiles_by_class).reduce((s, e) => s + e.blocked_count, 0);
  const avgBlocks = totalBlocks / 4;
  const maxBlocked = Math.max(...Object.values(trust.profiles_by_class).map(e => e.blocked_count));
  if (avgBlocks > 0 && maxBlocked > avgBlocks * BLOCKED_BASELINE_MULTIPLIER) {
    reasons.push(`Blocked count for one action class is ${BLOCKED_BASELINE_MULTIPLIER}× average.`);
    driftScore += 20;
  }
  driftScore = Math.min(100, driftScore);
  const drift_detected = driftScore >= 30;

  if (drift_detected) {
    try {
      publishCognitiveEvent({
        kind: 'autonomy.trust.changed',
        project_id,
        severity: 'warning',
        payload: {
          drift_score: driftScore,
          reasons,
          success_rate: successRate,
          rollback_frequency: rbFreq,
          override_velocity: memory.override_velocity,
        },
      });
    } catch { /* fail-soft */ }
  }

  return {
    project_id,
    drift_detected,
    drift_score: driftScore,
    reasons,
    snapshot_at: new Date().toISOString(),
  };
}

/**
 * Heartbeat handler entry point. Called by the awareness heartbeat
 * manager once per project per tick; cooldown ensures at most one drift
 * scan per project per 30 min.
 */
export function executionDriftHeartbeatHandler(project_id: string): void {
  detectExecutionDrift(project_id);
}
