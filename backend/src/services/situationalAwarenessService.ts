// ─── Situational Awareness Service ──────────────────────────────────────────
// Single aggregation endpoint for the Intelligence OS situational awareness panel.
// Returns top alerts, opportunities, system health, active agents, and revenue pipeline.

import { AiAgent } from '../models';
import Lead from '../models/Lead';
import Ticket from '../models/Ticket';
import { Op } from 'sequelize';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SituationalSnapshot {
  topAlerts: Array<{
    id: string;
    type: string;
    severity: number;
    title: string;
    impact_area: string;
    created_at: Date;
  }>;
  topOpportunities: Array<{
    id: string;
    title: string;
    confidence: number | null;
    impact_area: string;
    created_at: Date;
  }>;
  systemHealth: {
    score: number;
    agentsTotal: number;
    agentsHealthy: number;
    agentsErrored: number;
    agentsPaused: number;
    openTickets: number;
    criticalTickets: number;
  };
  activeAgents: {
    total: number;
    byDepartment: Record<string, number>;
    recentRuns: Array<{ name: string; status: string; last_run_at: string | null }>;
  };
  revenuePipeline: {
    totalLeads: number;
    hotLeads: number;
    meetingsScheduled: number;
    proposalsSent: number;
    enrolled: number;
  };
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

export async function getSituationalSnapshot(): Promise<SituationalSnapshot> {
  // Lazy import alertService to avoid circular deps
  const { getTopAlerts, getTopOpportunities } = await import('./alertService');

  const [
    topAlerts,
    topOpportunities,
    agents,
    openTickets,
    criticalTickets,
    totalLeads,
    hotLeads,
    meetingsScheduled,
    proposalsSent,
    enrolled,
  ] = await Promise.all([
    getTopAlerts(5).catch(() => []),
    getTopOpportunities(5).catch(() => []),
    AiAgent.findAll({ attributes: ['id', 'agent_name', 'status', 'department', 'last_run_at'] }),
    Ticket.count({ where: { status: { [Op.in]: ['backlog', 'todo', 'in_progress', 'in_review'] } } }),
    Ticket.count({ where: { priority: 'critical', status: { [Op.in]: ['backlog', 'todo', 'in_progress'] } } }),
    Lead.count(),
    Lead.count({ where: { lead_score: { [Op.gte]: 70 } } }),
    Lead.count({ where: { status: 'meeting_scheduled' } }),
    Lead.count({ where: { status: 'proposal_sent' } }),
    Lead.count({ where: { status: 'enrolled' } }),
  ]);

  // Agent fleet stats
  const statuses = agents.map((a) => a.getDataValue('status'));
  const agentsTotal = agents.length;
  const agentsHealthy = statuses.filter((s) => s === 'idle' || s === 'running').length;
  const agentsErrored = statuses.filter((s) => s === 'error').length;
  const agentsPaused = statuses.filter((s) => s === 'paused').length;

  // Health score: 100 if all healthy, deduct for errors and critical tickets
  const errorPenalty = agentsTotal > 0 ? (agentsErrored / agentsTotal) * 40 : 0;
  const ticketPenalty = Math.min(criticalTickets * 5, 20);
  const score = Math.max(0, Math.round(100 - errorPenalty - ticketPenalty));

  // By department
  const byDepartment: Record<string, number> = {};
  for (const a of agents) {
    const dept = (a as any).department || 'Unknown';
    byDepartment[dept] = (byDepartment[dept] || 0) + 1;
  }

  // Recent runs (last 5 agents that ran)
  const sorted = [...agents]
    .filter((a: any) => a.last_run_at)
    .sort((a: any, b: any) => new Date(b.last_run_at).getTime() - new Date(a.last_run_at).getTime())
    .slice(0, 5);

  const recentRuns = sorted.map((a: any) => ({
    name: a.agent_name,
    status: a.status,
    last_run_at: a.last_run_at ? new Date(a.last_run_at).toISOString() : null,
  }));

  return {
    topAlerts: (topAlerts as any[]).map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      impact_area: a.impact_area,
      created_at: a.created_at,
    })),
    topOpportunities: (topOpportunities as any[]).map((a) => ({
      id: a.id,
      title: a.title,
      confidence: a.confidence,
      impact_area: a.impact_area,
      created_at: a.created_at,
    })),
    systemHealth: {
      score,
      agentsTotal,
      agentsHealthy,
      agentsErrored,
      agentsPaused,
      openTickets,
      criticalTickets,
    },
    activeAgents: {
      total: agentsTotal,
      byDepartment,
      recentRuns,
    },
    revenuePipeline: {
      totalLeads,
      hotLeads,
      meetingsScheduled,
      proposalsSent,
      enrolled,
    },
  };
}
