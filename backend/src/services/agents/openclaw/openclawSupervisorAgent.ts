import { Op } from 'sequelize';
import { OpenclawTask, OpenclawSession, OpenclawResponse } from '../../../models';
import { checkCircuitBreaker, getAllCircuitStatus } from './openclawCircuitBreaker';
import { isRateLimited } from './openclawRateLimiter';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Supervisor Agent
 * Manages the task queue: assigns pending tasks, detects stuck tasks,
 * enforces platform rate budgets, and cancels expired work.
 */
export async function runOpenclawSupervisorAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxConcurrent = config.max_concurrent_tasks || 3;
  const stuckThreshold = config.stuck_task_threshold_ms || 600000;

  try {
    // 1. Detect and cancel stuck tasks (running > threshold)
    const stuckCutoff = new Date(Date.now() - stuckThreshold);
    const stuckTasks = await OpenclawTask.findAll({
      where: {
        status: 'running',
        started_at: { [Op.lt]: stuckCutoff },
      },
    });

    for (const task of stuckTasks) {
      const retries = (task.retry_count || 0) + 1;
      if (retries >= (task.max_retries || 3)) {
        await task.update({
          status: 'failed',
          error_message: 'Exceeded max retries after being stuck',
          updated_at: new Date(),
        });
        actions.push({
          campaign_id: '',
          action: 'cancel_stuck_task',
          reason: `Task ${task.id} stuck for ${stuckThreshold}ms, max retries exceeded`,
          confidence: 1,
          before_state: { status: 'running' },
          after_state: { status: 'failed' },
          result: 'success',
          entity_type: 'system',
          entity_id: task.id,
        });
      } else {
        await task.update({
          status: 'pending',
          retry_count: retries,
          started_at: undefined,
          assigned_agent: undefined,
          updated_at: new Date(),
        } as any);
        actions.push({
          campaign_id: '',
          action: 'retry_stuck_task',
          reason: `Task ${task.id} stuck, retry ${retries}`,
          confidence: 1,
          before_state: { status: 'running' },
          after_state: { status: 'pending', retry_count: retries },
          result: 'success',
          entity_type: 'system',
          entity_id: task.id,
        });
      }
    }

    // 2. Count currently running tasks
    const runningCount = await OpenclawTask.count({ where: { status: 'running' } });

    // 3. Assign pending tasks up to concurrency limit
    const slotsAvailable = Math.max(0, maxConcurrent - runningCount);
    if (slotsAvailable > 0) {
      const pendingTasks = await OpenclawTask.findAll({
        where: {
          status: 'pending',
          [Op.or]: [
            { scheduled_for: { [Op.is]: null as any } },
            { scheduled_for: { [Op.lte]: new Date() } },
          ],
        } as any,
        order: [['priority', 'DESC'], ['created_at', 'ASC']],
        limit: slotsAvailable,
      });

      for (const task of pendingTasks) {
        // Phase 4: Gate post_response tasks on circuit breaker + rate limiter
        if (task.task_type === 'post_response') {
          const responseId = task.input_data?.response_id;
          if (responseId) {
            try {
              const response = await OpenclawResponse.findByPk(responseId, { attributes: ['platform'] });
              if (response?.platform) {
                // Circuit breaker check
                try {
                  const circuit = await checkCircuitBreaker(response.platform);
                  if (circuit.state === 'OPEN') {
                    actions.push({
                      campaign_id: '',
                      action: 'block_task_circuit_open',
                      reason: `Circuit OPEN for ${response.platform} (error rate: ${circuit.error_rate}%) -skipping task ${task.id}`,
                      confidence: 1,
                      before_state: { status: 'pending' },
                      after_state: { status: 'pending' },
                      result: 'skipped',
                      entity_type: 'system',
                      entity_id: task.id,
                    });
                    continue;
                  }
                } catch { /* non-fatal */ }

                // Rate limit check
                try {
                  const rateResult = await isRateLimited(response.platform);
                  if (!rateResult.allowed) {
                    actions.push({
                      campaign_id: '',
                      action: 'defer_task_rate_limited',
                      reason: `Rate limited on ${response.platform}: ${rateResult.reason} -deferring task ${task.id}`,
                      confidence: 1,
                      before_state: { status: 'pending' },
                      after_state: { status: 'pending' },
                      result: 'skipped',
                      entity_type: 'system',
                      entity_id: task.id,
                    });
                    continue;
                  }
                } catch { /* non-fatal */ }
              }
            } catch { /* non-fatal -proceed with assignment */ }
          }
        }

        await task.update({
          status: 'assigned',
          updated_at: new Date(),
        });
        actions.push({
          campaign_id: '',
          action: 'assign_task',
          reason: `Assigned ${task.task_type} task, priority ${task.priority}`,
          confidence: 1,
          before_state: { status: 'pending' },
          after_state: { status: 'assigned' },
          result: 'success',
          entity_type: 'system',
          entity_id: task.id,
        });
      }
    }

    // 4. Expire old unprocessed tasks (>24h pending)
    const expireCutoff = new Date(Date.now() - 86400000);
    const [expiredCount] = await OpenclawTask.update(
      { status: 'cancelled', error_message: 'Expired after 24h', updated_at: new Date() },
      { where: { status: 'pending', created_at: { [Op.lt]: expireCutoff } } },
    );
    if (expiredCount > 0) {
      actions.push({
        campaign_id: '',
        action: 'expire_tasks',
        reason: `Expired ${expiredCount} tasks older than 24h`,
        confidence: 1,
        before_state: null,
        after_state: { expired: expiredCount },
        result: 'success',
        entity_type: 'system',
      });
    }

    // 4b. Expire stale responses (>72h in ready_to_post/approved) — source articles
    // are likely deleted by then. Prevents backlog of unpostable content.
    const staleResponseCutoff = new Date(Date.now() - 72 * 3600000);
    const [staleResponseCount] = await OpenclawResponse.update(
      { post_status: 'rejected', updated_at: new Date() } as any,
      { where: { post_status: { [Op.in]: ['ready_to_post', 'approved'] }, created_at: { [Op.lt]: staleResponseCutoff } } },
    );
    if (staleResponseCount > 0) {
      actions.push({
        campaign_id: '',
        action: 'expire_stale_responses',
        reason: `Expired ${staleResponseCount} responses older than 72h (source articles likely deleted)`,
        confidence: 1,
        before_state: null,
        after_state: { expired: staleResponseCount },
        result: 'success',
        entity_type: 'system',
      });
    }

    // 5. Circuit breaker status summary
    try {
      const circuitStatuses = await getAllCircuitStatus();
      const nonClosed = circuitStatuses.filter(s => s.state !== 'CLOSED');
      if (nonClosed.length > 0) {
        actions.push({
          campaign_id: '',
          action: 'circuit_breaker_summary',
          reason: `${nonClosed.length} platform(s) with non-CLOSED circuits: ${nonClosed.map(s => `${s.platform}=${s.state}`).join(', ')}`,
          confidence: 1,
          before_state: null,
          after_state: { circuits: nonClosed.map(s => ({ platform: s.platform, state: s.state, error_rate: s.error_rate })) },
          result: 'flagged',
          entity_type: 'system',
        });
      }
    } catch { /* non-fatal */ }

    // 6. Check session health summary
    const unhealthySessions = await OpenclawSession.count({
      where: {
        session_status: { [Op.in]: ['captcha_blocked', 'rate_limited', 'crashed'] },
      },
    });
    if (unhealthySessions > 0) {
      actions.push({
        campaign_id: '',
        action: 'session_health_warning',
        reason: `${unhealthySessions} unhealthy browser sessions detected`,
        confidence: 0.9,
        before_state: null,
        after_state: { unhealthy_sessions: unhealthySessions },
        result: 'flagged',
        entity_type: 'system',
      });
    }
  } catch (err: any) {
    errors.push(err.message || 'Supervisor error');
  }

  return {
    agent_name: 'OpenclawSupervisorAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.length,
  };
}
