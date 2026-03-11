// ─── Architecture Agent ──────────────────────────────────────────────────────
// Analyzes the agent fleet for structural inefficiencies: schedule overlaps,
// redundant execution, error cascades, duration regression, and idle agents.

import AiAgent from '../../models/AiAgent';
import AgentPerformanceMetric from '../../models/AgentPerformanceMetric';
import { registerAgent } from '../agents/agentRegistry';
import { Op } from 'sequelize';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ArchitectureProposal {
  type: 'schedule_overlap' | 'redundant_execution' | 'error_cascade' | 'duration_regression' | 'idle_agent';
  agent_names: string[];
  description: string;
  recommendation: string;
  priority: 'low' | 'medium' | 'high';
}

export interface ArchitectureReport {
  proposals: ArchitectureProposal[];
  fleet_size: number;
  analyzed_metrics: number;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/**
 * Analyze agent fleet architecture for inefficiencies.
 */
export async function analyzeArchitecture(): Promise<ArchitectureReport> {
  const proposals: ArchitectureProposal[] = [];

  const agents = await AiAgent.findAll({
    where: { enabled: true },
    attributes: ['agent_name', 'schedule', 'run_count', 'avg_duration_ms', 'error_count', 'status'],
  });

  // 1. Detect schedule overlaps (agents with identical schedules)
  const scheduleMap = new Map<string, string[]>();
  for (const agent of agents) {
    if (agent.schedule) {
      const existing = scheduleMap.get(agent.schedule) || [];
      existing.push(agent.agent_name);
      scheduleMap.set(agent.schedule, existing);
    }
  }

  for (const [schedule, agentNames] of scheduleMap) {
    if (agentNames.length > 3) {
      proposals.push({
        type: 'schedule_overlap',
        agent_names: agentNames,
        description: `${agentNames.length} agents share schedule "${schedule}" — potential resource contention`,
        recommendation: 'Stagger schedules by 1-2 minutes to reduce peak load',
        priority: agentNames.length > 5 ? 'high' : 'medium',
      });
    }
  }

  // 2. Detect idle agents (many runs, no actions)
  for (const agent of agents) {
    if ((agent.run_count || 0) > 50 && agent.status === 'idle') {
      const recentMetrics = await AgentPerformanceMetric.findAll({
        where: {
          agent_name: agent.agent_name,
          period_end: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        attributes: ['total_actions', 'skip_count', 'execution_count'],
        limit: 7,
      }).catch(() => []);

      const totalActions = recentMetrics.reduce((sum, m) => sum + ((m.get('total_actions') as number) || 0), 0);
      const totalExecs = recentMetrics.reduce((sum, m) => sum + ((m.get('execution_count') as number) || 0), 0);

      if (totalExecs > 10 && totalActions === 0) {
        proposals.push({
          type: 'idle_agent',
          agent_names: [agent.agent_name],
          description: `${agent.agent_name} has ${totalExecs} executions in 7d with zero actions`,
          recommendation: 'Consider reducing frequency or pausing this agent',
          priority: 'low',
        });
      }
    }
  }

  // 3. Detect duration regression (>50% increase over 7 days)
  for (const agent of agents) {
    try {
      const metrics = await AgentPerformanceMetric.findAll({
        where: {
          agent_name: agent.agent_name,
          period_end: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        order: [['period_end', 'ASC']],
        attributes: ['avg_duration_ms', 'period_end'],
        limit: 14,
      });

      if (metrics.length >= 4) {
        const firstHalf = metrics.slice(0, Math.floor(metrics.length / 2));
        const secondHalf = metrics.slice(Math.floor(metrics.length / 2));

        const avgFirst = firstHalf.reduce((s, m) => s + ((m.get('avg_duration_ms') as number) || 0), 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((s, m) => s + ((m.get('avg_duration_ms') as number) || 0), 0) / secondHalf.length;

        if (avgFirst > 0 && avgSecond > avgFirst * 1.5) {
          proposals.push({
            type: 'duration_regression',
            agent_names: [agent.agent_name],
            description: `${agent.agent_name} duration increased from ${Math.round(avgFirst)}ms to ${Math.round(avgSecond)}ms over 7d`,
            recommendation: 'Investigate performance bottleneck or data growth',
            priority: 'medium',
          });
        }
      }
    } catch {
      // Metrics may not exist yet
    }
  }

  // 4. Detect error cascades (multiple agents erroring in same period)
  const erroredAgents = agents.filter((a) => a.status === 'error');
  if (erroredAgents.length >= 3) {
    proposals.push({
      type: 'error_cascade',
      agent_names: erroredAgents.map((a) => a.agent_name),
      description: `${erroredAgents.length} agents currently in error state — possible cascade`,
      recommendation: 'Check shared dependencies (database, external APIs, Python proxy)',
      priority: 'high',
    });
  }

  return {
    proposals,
    fleet_size: agents.length,
    analyzed_metrics: 0,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'ArchitectureAgent',
  category: 'meta',
  description: 'Analyze agent fleet for schedule overlaps, idle agents, and error cascades',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const report = await analyzeArchitecture();
      return {
        agent_name: 'ArchitectureAgent',
        campaigns_processed: 0,
        entities_processed: report.fleet_size,
        actions_taken: report.proposals.map((p) => ({
          campaign_id: 'system',
          action: `architecture_${p.type}`,
          reason: p.description,
          confidence: 0.7,
          before_state: null,
          after_state: { recommendation: p.recommendation, priority: p.priority } as any,
          result: 'success' as const,
          entity_type: 'system' as const,
        })),
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'ArchitectureAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
