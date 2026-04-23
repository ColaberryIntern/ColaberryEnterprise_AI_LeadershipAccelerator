/**
 * Workforce Intelligence Engine
 *
 * Analyzes agent fleet performance and generates workforce decisions.
 * All decisions create tickets for audit trail.
 * Deterministic rules (no LLM).
 */

interface WorkforceInsight {
  agent_name: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
}

interface WorkforceReport {
  total_agents: number;
  healthy: number;
  errored: number;
  idle: number;
  insights: WorkforceInsight[];
  tickets_created: number;
  duration_ms: number;
}

export async function runWorkforceAnalysis(companyId: string): Promise<WorkforceReport> {
  const start = Date.now();
  const { sequelize: seq } = await import('../../config/database');
  const { createWorkforceTicket } = await import('./ticketOrchestrator');
  const { logAudit } = await import('./companyService');

  // Get agent fleet status
  const [agents] = await seq.query(`
    SELECT agent_name, status, run_count, error_count, last_run_at, category
    FROM ai_agents
    WHERE run_count > 0
    ORDER BY error_count DESC
    LIMIT 50
  `) as [any[], any];

  const total = agents.length;
  const healthy = agents.filter((a: any) => a.status === 'active' && a.error_count < 5).length;
  const errored = agents.filter((a: any) => a.error_count >= 5).length;
  const idle = agents.filter((a: any) => {
    if (!a.last_run_at) return true;
    const hoursSinceRun = (Date.now() - new Date(a.last_run_at).getTime()) / (1000 * 60 * 60);
    return hoursSinceRun > 24;
  }).length;

  const insights: WorkforceInsight[] = [];
  let ticketsCreated = 0;

  // Rule 1: High error agents
  for (const agent of agents) {
    const a = agent as any;
    const errorRate = a.run_count > 0 ? (a.error_count / a.run_count) * 100 : 0;
    if (errorRate > 20 && a.error_count >= 10) {
      const insight: WorkforceInsight = {
        agent_name: a.agent_name,
        issue: `Error rate ${Math.round(errorRate)}% (${a.error_count}/${a.run_count} runs)`,
        severity: errorRate > 50 ? 'high' : 'medium',
        recommendation: `Review ${a.agent_name} error patterns and add retry logic or fix root cause`,
      };
      insights.push(insight);

      // Create ticket
      try {
        await createWorkforceTicket(
          companyId,
          a.agent_name,
          `High error rate detected: ${Math.round(errorRate)}%`,
          insight.recommendation,
          insight.severity === 'high' ? 'high' : 'medium',
        );
        ticketsCreated++;
      } catch {}
    }
  }

  // Rule 2: Idle agents (no run in 24h)
  for (const agent of agents) {
    const a = agent as any;
    if (!a.last_run_at) continue;
    const hoursSinceRun = (Date.now() - new Date(a.last_run_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceRun > 48 && a.run_count > 10) {
      insights.push({
        agent_name: a.agent_name,
        issue: `Idle for ${Math.round(hoursSinceRun)} hours`,
        severity: 'low',
        recommendation: `Check if ${a.agent_name} schedule is misconfigured or if it's intentionally paused`,
      });
    }
  }

  // Rule 3: Overworked agents (>1000 runs, high error)
  for (const agent of agents) {
    const a = agent as any;
    if (a.run_count > 1000 && a.error_count > 50) {
      insights.push({
        agent_name: a.agent_name,
        issue: `High volume (${a.run_count} runs) with ${a.error_count} errors`,
        severity: 'medium',
        recommendation: `Consider splitting ${a.agent_name} workload or optimizing its logic`,
      });
    }
  }

  // Limit to top 10 insights
  const topInsights = insights.slice(0, 10);

  // Audit log
  await logAudit(companyId, 'workforce_analysis', 'WORKFORCE_ENGINE', {
    total_agents: total,
    healthy,
    errored,
    idle,
    insights_count: topInsights.length,
    tickets_created: ticketsCreated,
    duration_ms: Date.now() - start,
  });

  return {
    total_agents: total,
    healthy,
    errored,
    idle,
    insights: topInsights,
    tickets_created: ticketsCreated,
    duration_ms: Date.now() - start,
  };
}
