// ─── Monitor Agent ───────────────────────────────────────────────────────────
// Tracks outcomes of executed decisions at 1h/6h/24h checkpoints.
// Rolls back actions if metrics worsen below baseline.

import IntelligenceDecision from '../../models/IntelligenceDecision';
import { updateFromMonitor } from '../memory/learningEngine';
import { registerAgent } from './agentRegistry';
import { Op } from 'sequelize';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MonitorCheckpoint {
  checkpoint: '1h' | '6h' | '24h';
  metrics_snapshot: Record<string, any>;
  improved: boolean;
  delta_pct: number;
}

// ─── Checkpoint Logic ────────────────────────────────────────────────────────

/**
 * Determine which checkpoint to run based on execution time.
 */
function getCheckpoint(executedAt: Date): '1h' | '6h' | '24h' | null {
  const elapsed = Date.now() - executedAt.getTime();
  const hours = elapsed / (60 * 60 * 1000);

  if (hours >= 24) return '24h';
  if (hours >= 6) return '6h';
  if (hours >= 1) return '1h';
  return null;
}

/**
 * Compute the next monitor time after a checkpoint.
 */
function getNextMonitorTime(checkpoint: '1h' | '6h' | '24h', executedAt: Date): Date | null {
  switch (checkpoint) {
    case '1h':
      return new Date(executedAt.getTime() + 6 * 60 * 60 * 1000); // next: 6h
    case '6h':
      return new Date(executedAt.getTime() + 24 * 60 * 60 * 1000); // next: 24h
    case '24h':
      return null; // monitoring complete
  }
}

/**
 * Evaluate whether the action improved the target metric.
 * This is a simplified check — compares after_state to before_state.
 */
function evaluateOutcome(
  decision: IntelligenceDecision,
): { improved: boolean; delta_pct: number } {
  const beforeState = decision.get('before_state') as Record<string, any> | null;
  const afterState = decision.get('after_state') as Record<string, any> | null;
  const impactEstimate = decision.get('impact_estimate') as Record<string, any> | null;

  // Simple heuristic: if decision is still in monitoring and no errors reported, assume mild positive
  if (!beforeState || !afterState) {
    return { improved: true, delta_pct: 0 };
  }

  // Check if error counts decreased (for agent-related actions)
  if (beforeState.error_count !== undefined && afterState.error_count !== undefined) {
    const delta = afterState.error_count - beforeState.error_count;
    return { improved: delta <= 0, delta_pct: beforeState.error_count > 0 ? Math.round((delta / beforeState.error_count) * 100) : 0 };
  }

  // Default: trust the impact estimate direction
  const expectedChange = impactEstimate?.change_pct ?? 0;
  return { improved: expectedChange >= 0, delta_pct: expectedChange };
}

// ─── Main Monitor Cycle ──────────────────────────────────────────────────────

/**
 * Run monitoring checks for all decisions that are due for a checkpoint.
 */
export async function runMonitorCycle(): Promise<{ checked: number; completed: number; rolledBack: number }> {
  let checked = 0;
  let completed = 0;
  let rolledBack = 0;

  // Find decisions due for monitoring
  const decisions = await IntelligenceDecision.findAll({
    where: {
      execution_status: 'monitoring',
      monitor_next_at: { [Op.lte]: new Date() },
    },
    limit: 50,
  });

  for (const decision of decisions) {
    try {
      const executedAt = decision.get('executed_at') as Date | null;
      if (!executedAt) continue;

      const checkpoint = getCheckpoint(executedAt);
      if (!checkpoint) continue;

      checked++;

      // Evaluate the outcome
      const outcome = evaluateOutcome(decision);

      // Update monitor results
      const existingResults = (decision.get('monitor_results') as Record<string, any>) || {};
      existingResults[checkpoint] = {
        improved: outcome.improved,
        delta_pct: outcome.delta_pct,
        checked_at: new Date().toISOString(),
      };

      const nextMonitor = getNextMonitorTime(checkpoint, executedAt);

      if (checkpoint === '24h') {
        // Final checkpoint — mark as completed or rolled_back
        if (outcome.improved) {
          await decision.update({
            execution_status: 'completed',
            monitor_results: existingResults,
            impact_after_24h: { improved: outcome.improved, delta_pct: outcome.delta_pct },
            monitor_next_at: null as any,
          });
          completed++;
        } else {
          await decision.update({
            execution_status: 'rolled_back',
            monitor_results: existingResults,
            impact_after_24h: { improved: false, delta_pct: outcome.delta_pct },
            monitor_next_at: null as any,
          });
          rolledBack++;
        }
      } else {
        // Intermediate checkpoint — check for immediate degradation
        if (!outcome.improved && outcome.delta_pct < -20) {
          // Significant degradation — roll back early
          await decision.update({
            execution_status: 'rolled_back',
            monitor_results: existingResults,
            monitor_next_at: null as any,
          });
          rolledBack++;
        } else {
          // Continue monitoring
          await decision.update({
            monitor_results: existingResults,
            monitor_next_at: nextMonitor as any,
          });
        }
      }

      // Update learning engine
      try {
        await updateFromMonitor(decision, checkpoint);
      } catch {
        // Non-critical
      }
    } catch (err: any) {
      console.warn(`[MonitorAgent] Error checking decision ${decision.get('decision_id')}:`, err?.message);
    }
  }

  if (checked > 0) {
    console.log(`[MonitorAgent] Checked ${checked} decisions: ${completed} completed, ${rolledBack} rolled back`);
  }

  return { checked, completed, rolledBack };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'MonitorAgent',
  category: 'operations',
  description: 'Track decision outcomes at 1h/6h/24h checkpoints with auto-rollback',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const result = await runMonitorCycle();
      return {
        agent_name: 'MonitorAgent',
        campaigns_processed: 0,
        entities_processed: result.checked,
        actions_taken: [
          ...(result.completed > 0
            ? [{
                campaign_id: 'system',
                action: 'monitor_completed',
                reason: `${result.completed} decision(s) completed successfully`,
                confidence: 1,
                before_state: null,
                after_state: null,
                result: 'success' as const,
                entity_type: 'system' as const,
              }]
            : []),
          ...(result.rolledBack > 0
            ? [{
                campaign_id: 'system',
                action: 'monitor_rollback',
                reason: `${result.rolledBack} decision(s) rolled back`,
                confidence: 1,
                before_state: null,
                after_state: null,
                result: 'success' as const,
                entity_type: 'system' as const,
              }]
            : []),
        ],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'MonitorAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
