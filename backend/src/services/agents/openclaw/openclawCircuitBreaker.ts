/**
 * OpenClaw Circuit Breaker — Phase 4
 *
 * Auto-disables automation when error rates exceed threshold per platform.
 * States: CLOSED (normal) → OPEN (blocked) → HALF_OPEN (testing) → CLOSED
 *
 * No new model — counts OpenclawTask success/failed in last hour per platform.
 */

import { Op } from 'sequelize';
import { OpenclawTask, OpenclawResponse } from '../../../models';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  error_threshold_percent: number;
  min_sample_size: number;
  cooldown_ms: number;
  half_open_max_attempts: number;
}

export interface CircuitStatus {
  state: CircuitState;
  platform: string;
  error_count: number;
  total_count: number;
  error_rate: number;
  last_failure_at: Date | null;
  opened_at: Date | null;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  error_threshold_percent: 50,
  min_sample_size: 5,
  cooldown_ms: 30 * 60 * 1000, // 30 minutes
  half_open_max_attempts: 2,
};

// In-memory circuit state (resets on server restart — conservative approach)
const circuitStates: Map<string, { state: CircuitState; opened_at: Date | null; half_open_successes: number }> = new Map();

// ─── Pure Function ───────────────────────────────────────────────────────────

/**
 * Evaluate circuit state from error/total counts and timestamps.
 * Pure function for testability.
 */
export function evaluateCircuit(
  errorCount: number,
  totalCount: number,
  lastFailureAt: Date | null,
  openedAt: Date | null,
  config: Partial<CircuitBreakerConfig> = {},
): CircuitState {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Not enough data to evaluate
  if (totalCount < cfg.min_sample_size) {
    return 'CLOSED';
  }

  const errorRate = totalCount > 0 ? (errorCount / totalCount) * 100 : 0;

  // If circuit was OPEN, check if cooldown has passed
  if (openedAt) {
    const elapsed = Date.now() - new Date(openedAt).getTime();
    if (elapsed < cfg.cooldown_ms) {
      // Still within cooldown — stay OPEN
      return 'OPEN';
    }
    // Cooldown expired — transition to HALF_OPEN
    return 'HALF_OPEN';
  }

  // Check if error rate exceeds threshold
  if (errorRate >= cfg.error_threshold_percent) {
    return 'OPEN';
  }

  return 'CLOSED';
}

// ─── DB-Backed Functions ─────────────────────────────────────────────────────

/**
 * Get task counts per platform from the last hour.
 * Extracts platform from response linked to the task.
 */
async function getTaskCountsForPlatform(platform: string): Promise<{
  errorCount: number;
  totalCount: number;
  lastFailureAt: Date | null;
}> {
  const oneHourAgo = new Date(Date.now() - 3600000);

  // Get response IDs for this platform
  const responses = await OpenclawResponse.findAll({
    where: { platform },
    attributes: ['id'],
    raw: true,
  });
  const responseIds = responses.map((r: any) => r.id);

  if (responseIds.length === 0) {
    return { errorCount: 0, totalCount: 0, lastFailureAt: null };
  }

  // Count tasks that reference these responses (via input_data.response_id)
  const tasks = await OpenclawTask.findAll({
    where: {
      task_type: 'post_response',
      status: { [Op.in]: ['completed', 'failed'] },
      updated_at: { [Op.gte]: oneHourAgo },
    },
    attributes: ['status', 'updated_at', 'input_data'],
    raw: true,
  });

  // Filter to tasks for this platform's responses
  const platformTasks = tasks.filter((t: any) => {
    const responseId = t.input_data?.response_id;
    return responseId && responseIds.includes(responseId);
  });

  const errorCount = platformTasks.filter((t: any) => t.status === 'failed').length;
  const totalCount = platformTasks.length;

  const failedTasks = platformTasks.filter((t: any) => t.status === 'failed');
  const lastFailureAt = failedTasks.length > 0
    ? new Date(Math.max(...failedTasks.map((t: any) => new Date(t.updated_at).getTime())))
    : null;

  return { errorCount, totalCount, lastFailureAt };
}

/**
 * Check circuit breaker status for a platform.
 */
export async function checkCircuitBreaker(platform: string): Promise<CircuitStatus> {
  const { errorCount, totalCount, lastFailureAt } = await getTaskCountsForPlatform(platform);
  const existing = circuitStates.get(platform);
  const openedAt = existing?.state === 'OPEN' ? existing.opened_at : null;

  const state = evaluateCircuit(errorCount, totalCount, lastFailureAt, openedAt);

  // Update in-memory state
  if (state === 'OPEN' && existing?.state !== 'OPEN') {
    circuitStates.set(platform, { state: 'OPEN', opened_at: new Date(), half_open_successes: 0 });
  } else if (state === 'HALF_OPEN') {
    const prev = circuitStates.get(platform);
    if (prev) {
      // In HALF_OPEN: check if recent tasks succeeded
      if (errorCount === 0 && totalCount >= (DEFAULT_CONFIG.half_open_max_attempts)) {
        // Enough successes in HALF_OPEN — close circuit
        circuitStates.set(platform, { state: 'CLOSED', opened_at: null, half_open_successes: 0 });
      } else {
        circuitStates.set(platform, { ...prev, state: 'HALF_OPEN' });
      }
    }
  } else if (state === 'CLOSED') {
    circuitStates.delete(platform);
  }

  const finalState = circuitStates.get(platform)?.state || state;
  const errorRate = totalCount > 0 ? Math.round((errorCount / totalCount) * 100) : 0;

  return {
    state: finalState,
    platform,
    error_count: errorCount,
    total_count: totalCount,
    error_rate: errorRate,
    last_failure_at: lastFailureAt,
    opened_at: circuitStates.get(platform)?.opened_at || null,
  };
}

/**
 * Get circuit status for all platforms (for dashboard).
 */
export async function getAllCircuitStatus(): Promise<CircuitStatus[]> {
  const platforms = [
    'reddit', 'hackernews', 'devto', 'hashnode', 'discourse',
    'twitter', 'bluesky', 'youtube', 'producthunt', 'medium',
    'quora', 'facebook_groups', 'linkedin_comments', 'linkedin',
  ];

  return Promise.all(platforms.map(p => checkCircuitBreaker(p)));
}
