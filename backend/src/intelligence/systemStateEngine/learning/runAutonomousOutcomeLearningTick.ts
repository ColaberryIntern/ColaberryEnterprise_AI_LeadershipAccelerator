/**
 * runAutonomousOutcomeLearningTick — Phase 13 third independent tick
 * (separate from runLearningTick + runGovernanceLearningTick). Triggered
 * by `autonomy.execution.applied` events.
 *
 * Persists the in-memory autonomy trust state to LearningPolicySnapshot
 * (cooldown-bounded so we don't spam append-only history with trivial
 * deltas). Cross-project federation reads from the project_id='global'
 * row.
 *
 * Phase 13 §B + §N.
 */

import { withCooldown } from '../realtime/cognitiveStabilityProtection';
import { readTrustProfile } from '../autonomy/autonomyTrustState';

const TRUST_SNAPSHOT_COOLDOWN_MS = 60_000;

export interface AutonomousLearningResult {
  readonly project_id: string;
  readonly snapshot_recorded: boolean;
  readonly trust_score_summary: Record<string, number>;
  readonly recent_executions: number;
  readonly recent_rollbacks: number;
  readonly elapsed_ms: number;
  readonly notes: ReadonlyArray<string>;
}

export async function runAutonomousOutcomeLearningTick(project_id: string): Promise<AutonomousLearningResult> {
  const start = Date.now();
  const notes: string[] = [];
  const trust = readTrustProfile(project_id);
  const trust_score_summary: Record<string, number> = {};
  for (const klass of Object.keys(trust.profiles_by_class)) {
    trust_score_summary[klass] = (trust.profiles_by_class as any)[klass].trust_score;
  }

  let snapshotRecorded = false;
  if (withCooldown(`trust_recompute_${project_id}`, TRUST_SNAPSHOT_COOLDOWN_MS)) {
    try {
      const { default: LearningPolicySnapshot } = await import('../../../models/LearningPolicySnapshot');
      await LearningPolicySnapshot.create({
        project_id,
        trigger: 'autonomy_trust_recompute',
        policy: { trust_profiles_by_action_class: trust.profiles_by_class },
        deltas: {
          recent_executions: trust.recent_executions,
          recent_rollbacks: trust.recent_rollbacks,
          recent_blocks: trust.recent_blocks,
        },
        confidence: Math.round(
          Object.values(trust.profiles_by_class)
            .map(e => e.trust_score)
            .reduce((s, v) => s + v, 0) / 4,
        ),
        recorded_at: new Date(),
      } as any);
      snapshotRecorded = true;
    } catch (err: any) {
      notes.push(`Snapshot write failed: ${err?.message}`);
    }
  } else {
    notes.push('Cooldown active — snapshot suppressed.');
  }

  return {
    project_id,
    snapshot_recorded: snapshotRecorded,
    trust_score_summary,
    recent_executions: trust.recent_executions,
    recent_rollbacks: trust.recent_rollbacks,
    elapsed_ms: Date.now() - start,
    notes,
  };
}
