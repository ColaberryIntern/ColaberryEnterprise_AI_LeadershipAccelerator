/**
 * Governance Resolution Service
 *
 * Central read-path for all governance configuration.
 * Implements the authority hierarchy:
 *   Hardcoded Defaults → Global GovernanceConfig → Agent Config → Campaign Overrides
 *
 * 30-second TTL cache. Falls back to hardcoded defaults on any DB error.
 */

import { GovernanceConfig, CronScheduleConfig, CampaignGovernanceConfig, RiskScoringConfig } from '../models';
import { AutonomyMode } from '../models/GovernanceConfig';

// ─── Hardcoded Defaults (fail-safe floor) ─────────────────────────────────────

export const HARDCODED_DEFAULTS = {
  autonomy_mode: 'full' as AutonomyMode,
  max_dynamic_agents: 50,
  max_agents_total: 100,
  max_auto_executions_per_hour: 10,
  max_risk_budget_per_hour: 200,
  max_proposed_pending: 50,
  auto_execute_risk_threshold: 40,
  auto_execute_confidence_threshold: 70,
  max_experiments_per_agent: 1,
  max_system_experiments: 3,
  approval_required_for_critical: true,
};

export const HARDCODED_RISK_DEFAULTS = {
  intent_thresholds: {
    enrollment_ready: 80,
    high_intent: 60,
    engaged: 40,
    exploring: 20,
  },
};

export const HARDCODED_CAMPAIGN_DEFAULTS = {
  max_unsubscribe_rate: 1.5,
  max_bounce_rate: 5.0,
  max_sms_failure_rate: 10.0,
  min_open_rate: 0.10,
  min_reply_rate: 0.01,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedGovernanceConfig {
  autonomy_mode: AutonomyMode;
  max_dynamic_agents: number;
  max_agents_total: number;
  max_auto_executions_per_hour: number;
  max_risk_budget_per_hour: number;
  max_proposed_pending: number;
  auto_execute_risk_threshold: number;
  auto_execute_confidence_threshold: number;
  max_experiments_per_agent: number;
  max_system_experiments: number;
  approval_required_for_critical: boolean;
  autonomy_rules: any[];
  source: 'database' | 'hardcoded';
}

export interface ResolvedCronSchedule {
  agent_name: string;
  schedule: string;
  enabled: boolean;
  source: 'database' | 'hardcoded';
}

export interface ResolvedCampaignGovernance {
  max_unsubscribe_rate: number;
  max_bounce_rate: number;
  max_sms_failure_rate: number;
  min_open_rate: number;
  min_reply_rate: number;
  ramp_profile: any | null;
  source: 'database' | 'hardcoded';
}

export interface ResolvedRiskConfig {
  blast_radius_weights: Record<string, number>;
  reversibility_weights: Record<string, number>;
  intent_thresholds: Record<string, number>;
  source: 'database' | 'hardcoded';
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

let globalConfigCache: CacheEntry<ResolvedGovernanceConfig> | null = null;
let cronScheduleCache: CacheEntry<Map<string, ResolvedCronSchedule>> | null = null;
let riskConfigCache: CacheEntry<ResolvedRiskConfig> | null = null;

function isCacheValid<T>(cache: CacheEntry<T> | null): cache is CacheEntry<T> {
  return cache !== null && Date.now() < cache.expiresAt;
}

/** Invalidate all caches. Call after any write to governance tables. */
export function invalidateGovernanceCache(): void {
  globalConfigCache = null;
  cronScheduleCache = null;
  riskConfigCache = null;
}

// ─── Resolution Functions ─────────────────────────────────────────────────────

/**
 * Resolve global governance configuration.
 * Returns DB values if available, otherwise hardcoded defaults.
 */
export async function resolveGlobalConfig(): Promise<ResolvedGovernanceConfig> {
  if (isCacheValid(globalConfigCache)) return globalConfigCache.data;

  try {
    const row = await GovernanceConfig.findOne({ where: { scope: 'global' } });
    if (row) {
      const resolved: ResolvedGovernanceConfig = {
        autonomy_mode: row.autonomy_mode,
        max_dynamic_agents: row.max_dynamic_agents,
        max_agents_total: row.max_agents_total,
        max_auto_executions_per_hour: row.max_auto_executions_per_hour,
        max_risk_budget_per_hour: row.max_risk_budget_per_hour,
        max_proposed_pending: row.max_proposed_pending,
        auto_execute_risk_threshold: row.auto_execute_risk_threshold,
        auto_execute_confidence_threshold: row.auto_execute_confidence_threshold,
        max_experiments_per_agent: row.max_experiments_per_agent,
        max_system_experiments: row.max_system_experiments,
        approval_required_for_critical: row.approval_required_for_critical,
        autonomy_rules: row.autonomy_rules || [],
        source: 'database',
      };
      globalConfigCache = { data: resolved, expiresAt: Date.now() + CACHE_TTL_MS };
      return resolved;
    }
  } catch (err) {
    console.warn('[GovernanceResolution] Failed to load global config, using hardcoded defaults:', (err as Error).message);
  }

  const fallback: ResolvedGovernanceConfig = {
    ...HARDCODED_DEFAULTS,
    autonomy_rules: [],
    source: 'hardcoded',
  };
  globalConfigCache = { data: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
  return fallback;
}

/**
 * Resolve a single cron schedule for a named agent.
 * Returns DB active_schedule if available, otherwise the provided hardcoded default.
 */
export async function resolveCronSchedule(
  agentName: string,
  hardcodedSchedule: string
): Promise<ResolvedCronSchedule> {
  // Try cache first
  if (isCacheValid(cronScheduleCache)) {
    const cached = cronScheduleCache.data.get(agentName);
    if (cached) return cached;
  }

  try {
    const row = await CronScheduleConfig.findOne({ where: { agent_name: agentName } });
    if (row) {
      return {
        agent_name: agentName,
        schedule: row.active_schedule,
        enabled: row.enabled,
        source: 'database',
      };
    }
  } catch (err) {
    console.warn(`[GovernanceResolution] Failed to load cron schedule for ${agentName}:`, (err as Error).message);
  }

  return {
    agent_name: agentName,
    schedule: hardcodedSchedule,
    enabled: true,
    source: 'hardcoded',
  };
}

/**
 * Resolve all cron schedules at once (used by scheduler on startup).
 */
export async function resolveAllCronSchedules(): Promise<Map<string, ResolvedCronSchedule>> {
  if (isCacheValid(cronScheduleCache)) return cronScheduleCache.data;

  const map = new Map<string, ResolvedCronSchedule>();
  try {
    const rows = await CronScheduleConfig.findAll();
    for (const row of rows) {
      map.set(row.agent_name, {
        agent_name: row.agent_name,
        schedule: row.active_schedule,
        enabled: row.enabled,
        source: 'database',
      });
    }
  } catch (err) {
    console.warn('[GovernanceResolution] Failed to load cron schedules:', (err as Error).message);
  }

  cronScheduleCache = { data: map, expiresAt: Date.now() + CACHE_TTL_MS };
  return map;
}

/**
 * Resolve campaign-specific governance overrides.
 * Falls back to global defaults for any null fields.
 */
export async function resolveCampaignGovernance(campaignId: string): Promise<ResolvedCampaignGovernance> {
  try {
    const row = await CampaignGovernanceConfig.findOne({ where: { campaign_id: campaignId } });
    if (row) {
      return {
        max_unsubscribe_rate: Number(row.max_unsubscribe_rate) || HARDCODED_CAMPAIGN_DEFAULTS.max_unsubscribe_rate,
        max_bounce_rate: Number(row.max_bounce_rate) || HARDCODED_CAMPAIGN_DEFAULTS.max_bounce_rate,
        max_sms_failure_rate: Number(row.max_sms_failure_rate) || HARDCODED_CAMPAIGN_DEFAULTS.max_sms_failure_rate,
        min_open_rate: Number(row.min_open_rate) || HARDCODED_CAMPAIGN_DEFAULTS.min_open_rate,
        min_reply_rate: Number(row.min_reply_rate) || HARDCODED_CAMPAIGN_DEFAULTS.min_reply_rate,
        ramp_profile: row.ramp_profile,
        source: 'database',
      };
    }
  } catch (err) {
    console.warn(`[GovernanceResolution] Failed to load campaign governance for ${campaignId}:`, (err as Error).message);
  }

  return {
    ...HARDCODED_CAMPAIGN_DEFAULTS,
    ramp_profile: null,
    source: 'hardcoded',
  };
}

/**
 * Resolve risk scoring configuration.
 */
export async function resolveRiskConfig(): Promise<ResolvedRiskConfig> {
  if (isCacheValid(riskConfigCache)) return riskConfigCache.data;

  try {
    const row = await RiskScoringConfig.findOne();
    if (row) {
      const resolved: ResolvedRiskConfig = {
        blast_radius_weights: row.blast_radius_weights || {},
        reversibility_weights: row.reversibility_weights || {},
        intent_thresholds: row.intent_thresholds || HARDCODED_RISK_DEFAULTS.intent_thresholds,
        source: 'database',
      };
      riskConfigCache = { data: resolved, expiresAt: Date.now() + CACHE_TTL_MS };
      return resolved;
    }
  } catch (err) {
    console.warn('[GovernanceResolution] Failed to load risk config, using hardcoded defaults:', (err as Error).message);
  }

  const fallback: ResolvedRiskConfig = {
    blast_radius_weights: {},
    reversibility_weights: {},
    ...HARDCODED_RISK_DEFAULTS,
    source: 'hardcoded',
  };
  riskConfigCache = { data: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
  return fallback;
}
