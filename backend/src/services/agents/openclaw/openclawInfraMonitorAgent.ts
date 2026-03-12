import { Op } from 'sequelize';
import { OpenclawSession, OpenclawTask } from '../../../models';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Infrastructure Monitor Agent
 * Monitors browser session health, detects problems, and self-heals.
 */
export async function runOpenclawInfraMonitorAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const healthThreshold = config.health_threshold || 0.3;
  const maxConsecutiveErrors = config.max_consecutive_errors || 5;
  const autoRestart = config.auto_restart_sessions !== false;

  try {
    const sessions = await OpenclawSession.findAll();

    for (const session of sessions) {
      const sessionErrors = (session.errors as any[]) || [];
      const recentErrors = sessionErrors.filter(
        (e: any) => e.timestamp && Date.now() - new Date(e.timestamp).getTime() < 3600000,
      );

      // Check health
      const healthScore = Number(session.health_score) || 1;
      const status = session.session_status;

      if (status === 'captcha_blocked') {
        // Pause all tasks for this platform
        await OpenclawTask.update(
          { status: 'pending', assigned_agent: undefined, updated_at: new Date() } as any,
          {
            where: {
              session_id: session.id,
              status: { [Op.in]: ['assigned', 'running'] },
            },
          },
        );

        actions.push({
          campaign_id: '',
          action: 'captcha_detected',
          reason: `Session ${session.id} (${session.platform}) blocked by captcha`,
          confidence: 1,
          before_state: { session_status: status },
          after_state: { session_status: 'captcha_blocked', tasks_paused: true },
          result: 'flagged',
          entity_type: 'system',
          entity_id: session.id,
        });
      } else if (status === 'rate_limited') {
        actions.push({
          campaign_id: '',
          action: 'rate_limit_detected',
          reason: `Session ${session.id} (${session.platform}) rate limited`,
          confidence: 1,
          before_state: { session_status: status },
          after_state: { session_status: 'rate_limited' },
          result: 'flagged',
          entity_type: 'system',
          entity_id: session.id,
        });
      } else if (status === 'crashed' && autoRestart) {
        // Auto-restart crashed sessions
        await session.update({
          session_status: 'idle',
          health_score: 0.5,
          errors: [],
          updated_at: new Date(),
        });

        actions.push({
          campaign_id: '',
          action: 'restart_session',
          reason: `Auto-restarted crashed session ${session.id} (${session.platform})`,
          confidence: 0.8,
          before_state: { session_status: 'crashed' },
          after_state: { session_status: 'idle', health_score: 0.5 },
          result: 'success',
          entity_type: 'system',
          entity_id: session.id,
        });
      } else if (healthScore < healthThreshold) {
        // Low health — close and recreate
        await session.update({
          session_status: 'closed',
          updated_at: new Date(),
        });

        actions.push({
          campaign_id: '',
          action: 'close_unhealthy_session',
          reason: `Session ${session.id} health ${healthScore.toFixed(2)} below threshold ${healthThreshold}`,
          confidence: 0.9,
          before_state: { health_score: healthScore },
          after_state: { session_status: 'closed' },
          result: 'success',
          entity_type: 'system',
          entity_id: session.id,
        });
      }

      // Check for stale sessions (no activity in 2 hours)
      if (session.last_activity_at) {
        const hoursSinceActivity = (Date.now() - new Date(session.last_activity_at).getTime()) / 3600000;
        if (hoursSinceActivity > 2 && status === 'active') {
          await session.update({
            session_status: 'idle',
            updated_at: new Date(),
          });
        }
      }
    }

    // Summary action
    const activeSessions = sessions.filter((s) => s.session_status === 'active' || s.session_status === 'idle').length;
    const problemSessions = sessions.filter((s) =>
      ['captcha_blocked', 'rate_limited', 'crashed'].includes(s.session_status),
    ).length;

    actions.push({
      campaign_id: '',
      action: 'infra_health_summary',
      reason: `${activeSessions} active, ${problemSessions} problem sessions out of ${sessions.length} total`,
      confidence: 1,
      before_state: null,
      after_state: { total: sessions.length, active: activeSessions, problems: problemSessions },
      result: problemSessions > 0 ? 'flagged' : 'success',
      entity_type: 'system',
    });
  } catch (err: any) {
    errors.push(err.message || 'Infra monitor error');
  }

  return {
    agent_name: 'OpenclawInfraMonitorAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.length,
  };
}
