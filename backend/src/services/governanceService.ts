import { Op } from 'sequelize';
import { AiAgent, AiAgentActivityLog, AiSystemEvent } from '../models';

const GOVERNANCE_AGENTS = [
  { agent_name: 'visitor_tracker', agent_type: 'signal_detector', category: 'behavioral', description: 'Tracks visitor sessions and page events' },
  { agent_name: 'intent_scorer', agent_type: 'intent_scorer', category: 'behavioral', description: 'Computes time-decay intent scores from behavioral signals' },
  { agent_name: 'revenue_aggregator', agent_type: 'scheduled_processor', category: 'ai_ops', description: 'Aggregates campaign revenue and conversion metrics' },
  { agent_name: 'forecast_engine', agent_type: 'scheduled_processor', category: 'ai_ops', description: 'Generates revenue and enrollment forecasts' },
  { agent_name: 'calendar_intent_booster', agent_type: 'intent_scorer', category: 'behavioral', description: 'Boosts intent score on strategy call booking' },
];

/**
 * Ensure all governance-tracked agents are registered in the ai_agents table.
 * Uses findOrCreate — safe to call multiple times.
 */
export async function ensureGovernanceAgents(): Promise<void> {
  for (const agent of GOVERNANCE_AGENTS) {
    await AiAgent.findOrCreate({
      where: { agent_name: agent.agent_name },
      defaults: {
        agent_name: agent.agent_name,
        agent_type: agent.agent_type,
        category: agent.category,
        description: agent.description,
        status: 'idle',
        enabled: true,
        trigger_type: 'event_driven',
        run_count: 0,
        error_count: 0,
      } as any,
    });
  }
}

/**
 * Log an agent execution and update agent stats.
 * Fire-and-forget — never throws.
 */
export async function logAgentExecution(
  agentName: string,
  status: 'success' | 'failed',
  executionTimeMs: number,
  error?: string,
): Promise<void> {
  try {
    const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
    if (!agent) return;

    await AiAgentActivityLog.create({
      agent_id: agent.id,
      action: 'execution',
      result: status,
      duration_ms: Math.round(executionTimeMs),
      details: error ? { error } : undefined,
      stack_trace: error || undefined,
    } as any);

    const updates: any = {
      last_run_at: new Date(),
      run_count: (agent.run_count || 0) + 1,
      status: status === 'success' ? 'idle' : 'error',
    };

    if (status === 'failed') {
      updates.error_count = (agent.error_count || 0) + 1;
      updates.last_error = error || 'Unknown error';
      updates.last_error_at = new Date();
    }

    if (executionTimeMs > 0) {
      const prevAvg = agent.avg_duration_ms || executionTimeMs;
      const prevCount = Math.max((agent.run_count || 0), 1);
      updates.avg_duration_ms = Math.round((prevAvg * prevCount + executionTimeMs) / (prevCount + 1));
    }

    await agent.update(updates);
  } catch (err) {
    console.error('[Governance] logAgentExecution failed (non-blocking):', err);
  }
}

/**
 * Check for alert conditions and raise system events.
 */
export async function checkAndRaiseAlerts(): Promise<void> {
  try {
    const failingAgents = await AiAgent.findAll({
      where: { error_count: { [Op.gte]: 3 } },
    });

    for (const agent of failingAgents) {
      const existing = await AiSystemEvent.findOne({
        where: {
          source: 'governance',
          event_type: 'agent_failure_streak',
          entity_type: 'ai_agent',
          entity_id: agent.id,
          created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      if (!existing) {
        await AiSystemEvent.create({
          source: 'governance',
          event_type: 'agent_failure_streak',
          entity_type: 'ai_agent',
          entity_id: agent.id,
          details: {
            severity: agent.error_count >= 5 ? 'critical' : 'warning',
            agent_name: agent.agent_name,
            error_count: agent.error_count,
            last_error: agent.last_error,
            message: `Agent "${agent.agent_name}" has ${agent.error_count} consecutive failures`,
          },
        } as any);
      }
    }
  } catch (err) {
    console.error('[Governance] checkAndRaiseAlerts failed:', err);
  }
}

/**
 * Get governance-relevant alerts.
 */
export async function getGovernanceAlerts(limit = 50): Promise<any[]> {
  const events = await AiSystemEvent.findAll({
    where: {
      source: 'governance',
    },
    order: [['created_at', 'DESC']],
    limit,
  });
  return events;
}

/**
 * Get governance overview stats.
 */
export async function getGovernanceOverview(): Promise<{
  total_agents: number;
  active_agents: number;
  errored_agents: number;
  errors_24h: number;
  system_status: 'healthy' | 'degraded' | 'critical';
}> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const agents = await AiAgent.findAll({
    where: { agent_name: { [Op.in]: GOVERNANCE_AGENTS.map(a => a.agent_name) } },
  });

  const total = agents.length;
  const active = agents.filter(a => a.enabled && a.status !== 'error').length;
  const errored = agents.filter(a => a.status === 'error').length;

  const errors24h = await AiAgentActivityLog.count({
    where: {
      result: 'failed',
      created_at: { [Op.gte]: oneDayAgo },
    },
  });

  let systemStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (errors24h >= 3 || errored >= 2) systemStatus = 'critical';
  else if (errors24h > 0 || errored > 0) systemStatus = 'degraded';

  return {
    total_agents: total,
    active_agents: active,
    errored_agents: errored,
    errors_24h: errors24h,
    system_status: systemStatus,
  };
}

/**
 * Get all governance-tracked agents with their stats.
 */
export async function getGovernanceAgents(): Promise<any[]> {
  await ensureGovernanceAgents();

  const agents = await AiAgent.findAll({
    where: { agent_name: { [Op.in]: GOVERNANCE_AGENTS.map(a => a.agent_name) } },
    order: [['agent_name', 'ASC']],
  });

  return agents;
}
