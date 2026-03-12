import { Op } from 'sequelize';
import { OpenclawTask, OpenclawSession } from '../../../models';
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
          started_at: null,
          assigned_agent: null,
          updated_at: new Date(),
        });
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
            { scheduled_for: null },
            { scheduled_for: { [Op.lte]: new Date() } },
          ],
        },
        order: [['priority', 'DESC'], ['created_at', 'ASC']],
        limit: slotsAvailable,
      });

      for (const task of pendingTasks) {
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

    // 5. Check session health summary
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
