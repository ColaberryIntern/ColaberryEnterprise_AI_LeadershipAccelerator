// ─── Strategic Intelligence Agent ────────────────────────────────────────────
// Cross-entity KPI aggregation and systemic pattern detection.
// Provides the AI COO with a holistic view of business health.

import { sequelize } from '../../config/database';
import AiAgent from '../../models/AiAgent';
import { registerAgent } from './agentRegistry';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StrategicOverview {
  entity_kpis: Record<string, EntityKPIs>;
  systemic_patterns: string[];
  risk_areas: string[];
  opportunity_areas: string[];
  agent_fleet_health: { total: number; healthy: number; errored: number; paused: number };
}

interface EntityKPIs {
  entity: string;
  total_rows: number;
  recent_activity: number; // last 24h
  trend: 'growing' | 'stable' | 'declining';
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/**
 * Aggregate cross-entity KPIs and detect systemic patterns.
 */
export async function gatherStrategicIntelligence(): Promise<StrategicOverview> {
  const entityKpis: Record<string, EntityKPIs> = {};
  const systemicPatterns: string[] = [];
  const riskAreas: string[] = [];
  const opportunityAreas: string[] = [];

  // 1. Agent fleet health
  const agents = await AiAgent.findAll({ attributes: ['status', 'enabled'] });
  const fleetHealth = {
    total: agents.length,
    healthy: agents.filter((a) => a.status === 'idle' && a.enabled).length,
    errored: agents.filter((a) => a.status === 'error').length,
    paused: agents.filter((a) => a.status === 'paused' || !a.enabled).length,
  };

  if (fleetHealth.errored > fleetHealth.total * 0.2) {
    riskAreas.push(`${Math.round((fleetHealth.errored / fleetHealth.total) * 100)}% of agents in error state`);
  }

  // 2. Entity row counts and recent activity (best-effort queries)
  const entityTables: Record<string, string> = {
    leads: 'leads',
    campaigns: 'campaign_healths',
    students: 'students',
  };

  for (const [entity, table] of Object.entries(entityTables)) {
    try {
      const [counts]: any = await sequelize.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as recent
         FROM ${table}`,
      );
      if (counts?.[0]) {
        const total = Number(counts[0].total) || 0;
        const recent = Number(counts[0].recent) || 0;
        const dailyRate = recent;

        // Simple trend: compare recent to expected daily average
        // Requires 30+ rows AND 1+/day average for meaningful trend detection
        let trend: 'growing' | 'stable' | 'declining' = 'stable';
        if (total > 30) {
          const expectedDaily = total / 30; // rough monthly average
          if (expectedDaily >= 1) {
            if (dailyRate > expectedDaily * 1.2) trend = 'growing';
            else if (dailyRate < expectedDaily * 0.5) trend = 'declining';
          }
        }

        entityKpis[entity] = { entity, total_rows: total, recent_activity: recent, trend };

        if (trend === 'declining') {
          riskAreas.push(`${entity} showing declining trend (${recent} in 24h vs ${Math.round(total / 30)}/day avg)`);
        }
        if (trend === 'growing') {
          opportunityAreas.push(`${entity} growing (${recent} in 24h vs ${Math.round(total / 30)}/day avg)`);
        }
      }
    } catch {
      // Table may not exist
    }
  }

  // 3. Detect systemic patterns
  if (riskAreas.length > 2) {
    systemicPatterns.push('Multiple risk areas detected — possible systemic issue');
  }
  if (fleetHealth.paused > fleetHealth.total * 0.3) {
    systemicPatterns.push('Many agents paused — consider fleet-wide review');
  }

  return {
    entity_kpis: entityKpis,
    systemic_patterns: systemicPatterns,
    risk_areas: riskAreas,
    opportunity_areas: opportunityAreas,
    agent_fleet_health: fleetHealth,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'StrategicIntelligenceAgent',
  category: 'strategy',
  description: 'Cross-entity KPI aggregation and systemic pattern detection',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const overview = await gatherStrategicIntelligence();
      return {
        agent_name: 'StrategicIntelligenceAgent',
        campaigns_processed: 0,
        entities_processed: Object.keys(overview.entity_kpis).length,
        actions_taken: [{
          campaign_id: 'system',
          action: 'strategic_scan',
          reason: `${overview.risk_areas.length} risks, ${overview.opportunity_areas.length} opportunities`,
          confidence: 0.8,
          before_state: null,
          after_state: overview as any,
          result: 'success' as const,
          entity_type: 'system' as const,
        }],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'StrategicIntelligenceAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
