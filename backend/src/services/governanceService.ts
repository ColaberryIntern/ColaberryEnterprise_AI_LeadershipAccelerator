import { Op, literal } from 'sequelize';
import { AiAgent, AiAgentActivityLog, AiSystemEvent } from '../models';
import { getSetting, setSetting } from './settingsService';

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
 * Log a sponsorship kit request as a governance system event.
 * Fire-and-forget — never throws.
 */
export async function logSponsorshipKitEvent(
  lead: { id: number; name: string; company?: string },
  score: number,
  tier: string,
  stage: string,
): Promise<void> {
  try {
    await AiSystemEvent.create({
      source: 'governance',
      event_type: 'sponsorship_kit_requested',
      entity_type: 'lead',
      entity_id: lead.id,
      details: {
        severity: score > 12 ? 'warning' : 'info',
        lead_name: lead.name,
        company: lead.company || 'Unknown',
        score,
        tier,
        stage,
        message: `Sponsorship kit requested by "${lead.name}" — Score: ${score} (${tier})`,
      },
    } as any);
  } catch (err) {
    console.error('[Governance] logSponsorshipKitEvent failed (non-blocking):', err);
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

// ─── COO Config ──────────────────────────────────────────────────────────────

export interface COOConfig {
  cory_status: 'active' | 'paused' | 'manual';
  cory_autonomy_level: 'full' | 'safe' | 'manual';
  cory_experiment_budget: number;
  cory_decision_authority: 'auto_safe' | 'propose_all' | 'manual_only';
  enable_agent_hiring: boolean;
  enable_experiments: boolean;
  enable_auto_optimization: boolean;
}

const COO_DEFAULTS: COOConfig = {
  cory_status: 'active',
  cory_autonomy_level: 'full',
  cory_experiment_budget: 3,
  cory_decision_authority: 'auto_safe',
  enable_agent_hiring: true,
  enable_experiments: true,
  enable_auto_optimization: true,
};

export async function getCOOConfig(): Promise<COOConfig> {
  const keys = Object.keys(COO_DEFAULTS) as (keyof COOConfig)[];
  const config: any = { ...COO_DEFAULTS };
  for (const key of keys) {
    const val = await getSetting(key);
    if (val !== null && val !== undefined) {
      if (typeof COO_DEFAULTS[key] === 'boolean') {
        config[key] = val === true || val === 'true';
      } else if (typeof COO_DEFAULTS[key] === 'number') {
        config[key] = parseInt(val as string, 10) || COO_DEFAULTS[key];
      } else {
        config[key] = val;
      }
    }
  }
  return config;
}

export async function updateCOOConfig(updates: Partial<COOConfig>, updatedBy?: string): Promise<COOConfig> {
  for (const [key, value] of Object.entries(updates)) {
    if (key in COO_DEFAULTS) {
      await setSetting(key, String(value), updatedBy);
    }
  }
  return getCOOConfig();
}

// ─── Autonomy Rules ──────────────────────────────────────────────────────────

export interface AutonomyRule {
  name: string;
  risk_min: number;
  risk_max: number;
  confidence_min: number;
  confidence_max: number;
  action: 'auto_execute' | 'require_approval' | 'allow_experiment' | 'block';
}

const DEFAULT_RULES: AutonomyRule[] = [
  { name: 'LOW_IMPACT_HIGH_CONFIDENCE', risk_min: 0, risk_max: 25, confidence_min: 70, confidence_max: 100, action: 'auto_execute' },
  { name: 'HIGH_IMPACT_LOW_CONFIDENCE', risk_min: 50, risk_max: 100, confidence_min: 0, confidence_max: 60, action: 'require_approval' },
  { name: 'HIGH_IMPACT_HIGH_CONFIDENCE', risk_min: 50, risk_max: 100, confidence_min: 70, confidence_max: 100, action: 'allow_experiment' },
  { name: 'CRITICAL_RISK', risk_min: 75, risk_max: 100, confidence_min: 0, confidence_max: 100, action: 'block' },
];

export async function getAutonomyRules(): Promise<AutonomyRule[]> {
  const raw = await getSetting('autonomy_rules');
  if (raw) {
    try { return JSON.parse(raw as string); } catch { /* fall through */ }
  }
  return DEFAULT_RULES;
}

export async function updateAutonomyRules(rules: AutonomyRule[], updatedBy?: string): Promise<AutonomyRule[]> {
  await setSetting('autonomy_rules', JSON.stringify(rules), updatedBy);
  return rules;
}

// ─── Safety Limits ───────────────────────────────────────────────────────────

export interface SafetyLimits {
  max_agents: number;
  max_experiments: number;
  max_autonomous_decisions_per_hour: number;
  approval_required_for_critical_actions: boolean;
}

const SAFETY_DEFAULTS: SafetyLimits = {
  max_agents: 100,
  max_experiments: 5,
  max_autonomous_decisions_per_hour: 10,
  approval_required_for_critical_actions: true,
};

export async function getSafetyLimits(): Promise<SafetyLimits> {
  const raw = await getSetting('safety_limits');
  if (raw) {
    try { return { ...SAFETY_DEFAULTS, ...JSON.parse(raw as string) }; } catch { /* fall through */ }
  }
  return SAFETY_DEFAULTS;
}

export async function updateSafetyLimits(limits: Partial<SafetyLimits>, updatedBy?: string): Promise<SafetyLimits> {
  const current = await getSafetyLimits();
  const merged = { ...current, ...limits };
  await setSetting('safety_limits', JSON.stringify(merged), updatedBy);
  return merged;
}

// ─── Experiment Registry ─────────────────────────────────────────────────────

import IntelligenceDecision from '../models/IntelligenceDecision';

export async function getExperimentRegistry(): Promise<any[]> {
  const experiments = await IntelligenceDecision.findAll({
    where: { recommended_action: 'launch_ab_test' },
    order: [['timestamp', 'DESC']],
    limit: 50,
  });

  return experiments.map((e: any) => ({
    id: e.decision_id,
    experiment_name: e.action_details?.description || `Experiment ${e.decision_id?.slice(0, 8)}`,
    agent: e.action_details?.parameters?.agent || 'system',
    status: e.execution_status,
    start_time: e.executed_at || e.timestamp,
    impact: e.impact_after_24h || e.impact_estimate || null,
    risk_score: e.risk_score,
    confidence_score: e.confidence_score,
  }));
}
