import { Op, literal } from 'sequelize';
import { AiAgent, AiAgentActivityLog, AiSystemEvent } from '../models';
import { getSetting } from './settingsService';

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
        status: 'active',
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
 * Get governance overview stats with settings sync.
 */
export async function getGovernanceOverview(): Promise<{
  total_agents: number;
  active_agents: number;
  errored_agents: number;
  errors_24h: number;
  system_status: 'healthy' | 'degraded' | 'critical';
  settings_sync: {
    high_intent_threshold: number;
    price_per_enrollment: number;
    test_mode_enabled: boolean;
    follow_up_enabled: boolean;
    enable_auto_email: boolean;
    enable_voice_calls: boolean;
  };
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

  // Check for critical/warning alerts in last 24h using JSONB path query
  const criticalAlerts = await AiSystemEvent.count({
    where: {
      source: 'governance',
      created_at: { [Op.gte]: oneDayAgo },
      [Op.and]: [literal("details->>'severity' = 'critical'")],
    },
  });

  const warningAlerts = await AiSystemEvent.count({
    where: {
      source: 'governance',
      created_at: { [Op.gte]: oneDayAgo },
      [Op.and]: [literal("details->>'severity' = 'warning'")],
    },
  });

  let systemStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (criticalAlerts > 0 || errors24h >= 3 || errored >= 2) systemStatus = 'critical';
  else if (warningAlerts > 0 || errors24h > 0 || errored > 0) systemStatus = 'degraded';

  // Settings sync — read-only mirror values from Settings layer
  const [hitRaw, ppeRaw, tmRaw, fuRaw, aeRaw, vcRaw] = await Promise.all([
    getSetting('high_intent_threshold'),
    getSetting('price_per_enrollment'),
    getSetting('test_mode_enabled'),
    getSetting('follow_up_enabled'),
    getSetting('enable_auto_email'),
    getSetting('enable_voice_calls'),
  ]);

  return {
    total_agents: total,
    active_agents: active,
    errored_agents: errored,
    errors_24h: errors24h,
    system_status: systemStatus,
    settings_sync: {
      high_intent_threshold: parseInt(hitRaw as string, 10) || 60,
      price_per_enrollment: parseInt(ppeRaw as string, 10) || 4500,
      test_mode_enabled: tmRaw === true || tmRaw === 'true',
      follow_up_enabled: fuRaw !== false && fuRaw !== 'false',
      enable_auto_email: aeRaw !== false && aeRaw !== 'false',
      enable_voice_calls: vcRaw === true || vcRaw === 'true',
    },
  };
}

/**
 * Log an executive briefing funnel event as a governance system event.
 * Fire-and-forget — never throws.
 */
export async function logExecutiveBriefingEvent(
  lead: { id: number; name: string; company?: string },
  score: number,
  tier: string,
  stage: string,
  sponsorshipInterest: boolean,
): Promise<void> {
  try {
    await AiSystemEvent.create({
      source: 'governance',
      event_type: 'executive_briefing_request',
      entity_type: 'lead',
      entity_id: lead.id,
      details: {
        severity: 'info',
        lead_name: lead.name,
        company: lead.company || 'Unknown',
        score,
        tier,
        stage,
        sponsorship_interest: sponsorshipInterest,
        message: `Executive briefing requested by "${lead.name}" — Score: ${score} (${tier})`,
      },
    } as any);
  } catch (err) {
    console.error('[Governance] logExecutiveBriefingEvent failed (non-blocking):', err);
  }
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
