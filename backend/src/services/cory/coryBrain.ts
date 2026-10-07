/**
 * Cory Brain — Central Intelligence Orchestrator
 *
 * Cory operates as the AI COO for the Colaberry Enterprise platform.
 * This service coordinates:
 *  - Strategic intelligence cycles (via aiCOO)
 *  - Department report collection (via super agents)
 *  - Opportunity and risk detection (from intelligence_decisions)
 *  - Task generation and orchestration
 *  - Executive briefing compilation
 *  - Agent creation proposals
 *
 * All operations are logged to ai_agent_activity_logs via logAiEvent.
 */

import { runStrategicCycle, getLatestStrategicReport, type StrategicReport } from '../../intelligence/strategy/aiCOO';
import IntelligenceDecision from '../../models/IntelligenceDecision';
import DepartmentReport from '../../models/DepartmentReport';
import AgentTask from '../../models/AgentTask';
import AgentCreationProposal from '../../models/AgentCreationProposal';
import AiAgent from '../../models/AiAgent';
import { createTask, getTaskStats, type CreateTaskInput } from '../taskOrchestrator';
import { logAiEvent } from '../aiEventService';
import { createStrategicInitiative } from './coryInitiatives';
import { getRecentInitiatives, getInitiativeStats, type InitiativeSummary } from './coryInitiatives';
import { runEvolutionCycle, type EvolutionFinding } from './coryEvolution';
import StrategicInitiative from '../../models/StrategicInitiative';
import { Op } from 'sequelize';
import {
  judgeDepartmentHealth,
  readReportedAgentCount,
  type DepartmentHealth,
} from '../briefings/departmentHealthVerdict';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoryBrainStatus {
  strategic_cycle_last_run: string | null;
  departments: {
    name: string;
    /**
     * Three-state verdict, not a bare `string`. `string` is how 'healthy' as
     * the else-branch of "no anomalies were recorded" survived review here and
     * in the executive briefing: with the union written down, a consumer that
     * only styles 'healthy' and 'degraded' is a visible omission rather than a
     * silent fall-through. See briefings/departmentHealthVerdict.
     */
    health: DepartmentHealth;
    /**
     * null when the report carries no readable headcount. It used to be
     * `(r.metrics as any)?.total || 0`, so an unreadable metrics blob printed a
     * confident "0 agents" - a claim the row does not support.
     */
    agent_count: number | null;
    last_report_at: string | null;
  }[];
  insights_24h: number;
  tasks: { total: number; pending: number; in_progress: number; completed: number; failed: number };
  agent_fleet: { total: number; healthy: number; errored: number; paused: number };
}

export interface COODashboardData {
  status: CoryBrainStatus;
  recent_insights: any[];
  department_reports: any[];
  recent_tasks: any[];
  agent_activity: any[];
  strategic_initiatives: InitiativeSummary[];
  initiative_stats: { total: number; proposed: number; approved: number; in_progress: number; completed: number; cancelled: number };
}

// ---------------------------------------------------------------------------
// Strategic Intelligence
// ---------------------------------------------------------------------------

/**
 * Run the full strategic cycle — delegates to aiCOO then logs.
 */
export async function runCoryStrategicCycle(): Promise<StrategicReport> {
  const start = Date.now();

  const report = await runStrategicCycle();

  await logAiEvent('CoryBrain', 'STRATEGIC_CYCLE', 'intelligence_decisions', undefined, {
    duration_ms: Date.now() - start,
    risks: report.overview.risk_areas.length,
    opportunities: report.overview.opportunity_areas.length,
    experiments: report.experiments.length,
    governance_compliant: report.governance.compliant,
    summary_points: report.executive_summary.length,
  }).catch(() => {});

  return report;
}

/**
 * Collect the latest department reports (one per department).
 */
export async function collectDepartmentReports(): Promise<DepartmentReport[]> {
  // LIMIT: 8 super agents x 48 cycles/day = ~384 rows per 24h, so the previous
  // limit of 50 was the newest ~3 hours of the window, not the window. A
  // department that stopped writing - the Finance/Partnership failure mode -
  // aged out after three hours and disappeared from the COO dashboard entirely,
  // which reads as "no such department" rather than "this department has gone
  // quiet". Silence is the direction this whole fix exists to close off, so the
  // limit now covers the full 24h window with headroom, and a four-cycle-old
  // report is judged 'unknown' by judgeDepartmentHealth instead of vanishing.
  const latestReports = await DepartmentReport.findAll({
    where: {
      created_at: {
        [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    order: [['created_at', 'DESC']],
    limit: 500,
  });

  // Deduplicate — keep only the latest per department. Rows arrive created_at
  // DESC, which is what makes the kept row the most recent one. The key is
  // trimmed and lower-cased so two spellings of one department cannot each
  // claim a slot and show up twice on the dashboard.
  const seen = new Set<string>();
  const deduped: DepartmentReport[] = [];
  for (const r of latestReports) {
    const key = typeof r.department === 'string' ? r.department.trim().toLowerCase() : '';
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  await logAiEvent('CoryBrain', 'DEPARTMENT_REPORT', 'department_reports', undefined, {
    departments_reporting: deduped.length,
  }).catch(() => {});

  return deduped;
}

/**
 * Detect recent opportunities from intelligence_decisions.
 */
export async function detectOpportunities(): Promise<IntelligenceDecision[]> {
  return IntelligenceDecision.findAll({
    where: {
      risk_tier: { [Op.in]: ['safe', 'moderate'] },
      execution_status: 'proposed',
      timestamp: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    order: [['confidence_score', 'DESC']],
    limit: 20,
  });
}

/**
 * Detect recent risks from intelligence_decisions.
 */
export async function detectRisks(): Promise<IntelligenceDecision[]> {
  return IntelligenceDecision.findAll({
    where: {
      risk_tier: { [Op.in]: ['risky', 'dangerous'] },
      execution_status: 'proposed',
      timestamp: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    order: [['risk_score', 'DESC']],
    limit: 20,
  });
}

// ---------------------------------------------------------------------------
// Task Orchestration
// ---------------------------------------------------------------------------

/**
 * Generate strategic tasks based on recent insights and department reports.
 */
export async function generateStrategicActions(): Promise<AgentTask[]> {
  const createdTasks: AgentTask[] = [];

  // Get unaddressed high-risk insights
  const risks = await detectRisks();
  for (const risk of risks.slice(0, 5)) {
    // JSONB containment used to avoid duplicate tasks across strategic cycles
    const existing = await AgentTask.findOne({
      where: {
        context: { [Op.contains]: { decision_id: risk.decision_id } } as any,
        status: { [Op.notIn]: ['completed', 'cancelled', 'failed'] },
      },
    });
    if (existing) continue;

    const task = await createTask({
      task_type: 'investigation',
      description: `Investigate: ${risk.problem_detected}`,
      priority: risk.risk_score && risk.risk_score > 60 ? 'high' : 'medium',
      context: { decision_id: risk.decision_id, risk_score: risk.risk_score },
      created_by: 'CoryBrain',
    });
    createdTasks.push(task);
  }

  // Get anomalous department reports
  const reports = await collectDepartmentReports();
  for (const report of reports) {
    if (report.anomalies && Array.isArray(report.anomalies) && report.anomalies.length > 0) {
      // IDEMPOTENCY. This branch had no dedup check, unlike the risk branch
      // above: every strategic cycle minted another repair task for the same
      // report row. It mattered less while collectDepartmentReports only
      // reached back ~3 hours; now that it covers the full 24h window, a
      // department that goes quiet while erroring would be re-ticketed every
      // cycle for a day. Keyed on report_id, which is what the task context
      // already carries.
      const alreadyRaised = await AgentTask.findOne({
        where: {
          context: { [Op.contains]: { report_id: report.id } } as any,
          status: { [Op.notIn]: ['completed', 'cancelled', 'failed'] },
        },
      });
      if (alreadyRaised) continue;

      const task = await createTask({
        task_type: 'repair',
        description: `Resolve ${report.anomalies.length} anomalies in ${report.department}`,
        assigned_department: report.department,
        priority: report.anomalies.length > 3 ? 'high' : 'medium',
        context: { anomalies: report.anomalies, report_id: report.id },
        created_by: 'CoryBrain',
      });
      createdTasks.push(task);
    }
  }

  if (createdTasks.length > 0) {
    await logAiEvent('CoryBrain', 'TASK_CREATED', 'agent_tasks', undefined, {
      tasks_created: createdTasks.length,
    }).catch(() => {});
  }

  return createdTasks;
}

// ---------------------------------------------------------------------------
// Agent Creation Proposals
// ---------------------------------------------------------------------------

/**
 * Propose a new agent for admin approval.
 */
export async function proposeNewAgent(params: {
  agent_name: string;
  purpose: string;
  department: string;
  agent_group?: string;
  trigger_type?: string;
  schedule?: string;
  justification: string;
}): Promise<AgentCreationProposal> {
  const proposal = await AgentCreationProposal.create({
    agent_name: params.agent_name,
    purpose: params.purpose,
    department: params.department,
    agent_group: params.agent_group || null,
    trigger_type: params.trigger_type || 'cron',
    schedule: params.schedule || null,
    justification: params.justification,
    proposed_by: 'CoryBrain',
  });

  await logAiEvent('CoryBrain', 'AGENT_PROPOSAL', 'agent_creation_proposals', proposal.id, {
    agent_name: params.agent_name,
    department: params.department,
  }).catch(() => {});

  return proposal;
}

// ---------------------------------------------------------------------------
// Dashboard Data
// ---------------------------------------------------------------------------

/**
 * `created_at` is declared as a Date, but a raw query or a JSON round-trip can
 * hand back a string, and `r.created_at?.toISOString()` on a string throws a
 * TypeError. That throw happens inside getCOODashboardData, so one malformed
 * timestamp 500s the entire COO dashboard - a far bigger blast radius than the
 * missing field it would report.
 */
function toIsoOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return null;
}

/**
 * Get full COO dashboard data for the frontend.
 */
export async function getCOODashboardData(): Promise<COODashboardData> {
  const [
    latestReport,
    departmentReports,
    recentInsights,
    taskStats,
    recentTasks,
    fleetStats,
    initiatives,
    initiativeStats,
  ] = await Promise.all([
    Promise.resolve(getLatestStrategicReport()),
    collectDepartmentReports(),
    IntelligenceDecision.findAll({
      where: { timestamp: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      order: [['timestamp', 'DESC']],
      limit: 20,
    }),
    getTaskStats(),
    AgentTask.findAll({
      order: [['created_at', 'DESC']],
      limit: 20,
    }),
    AiAgent.findAll({ attributes: ['status', 'enabled'] }),
    getRecentInitiatives(10),
    getInitiativeStats(),
  ]);

  // Compute fleet health
  const fleet = { total: fleetStats.length, healthy: 0, errored: 0, paused: 0 };
  for (const agent of fleetStats) {
    if (agent.enabled && (agent.status === 'idle' || agent.status === 'running')) fleet.healthy++;
    else if (agent.status === 'error') fleet.errored++;
    else if (agent.status === 'paused' || !agent.enabled) fleet.paused++;
  }

  // Build department summaries.
  //
  // THE VERDICT IS NOT COMPUTED HERE ANY MORE. It used to be:
  //
  //   health: r.anomalies && (r.anomalies as any[]).length > 0 ? 'degraded' : 'healthy'
  //
  // which made 'healthy' the else-branch of "no anomalies were recorded" and
  // put the line "Content Engine - healthy - 0 agents" on the COO dashboard:
  // the number that proves the supervisor saw nothing, printed next to the word
  // healthy. ContentEngineSuperAgent wrote 9,366 such reports; Finance and
  // Partnerships reported healthy every 30 minutes from 2026-08-24, the day
  // their single subordinate stopped.
  //
  // judgeDepartmentHealth owns the rules now, and it is the same judgement the
  // executive briefing uses, so this dashboard and that briefing cannot drift
  // apart again.
  const departments = departmentReports.map(r => ({
    name: r.department,
    health: judgeDepartmentHealth(r),
    agent_count: readReportedAgentCount(r.metrics),
    last_report_at: toIsoOrNull(r.created_at),
  }));

  const status: CoryBrainStatus = {
    strategic_cycle_last_run: latestReport?.timestamp || null,
    departments,
    insights_24h: recentInsights.length,
    tasks: taskStats,
    agent_fleet: fleet,
  };

  return {
    status,
    recent_insights: recentInsights.map(i => ({
      id: i.decision_id,
      problem: i.problem_detected,
      risk_score: i.risk_score,
      risk_tier: i.risk_tier,
      confidence: i.confidence_score,
      status: i.execution_status,
      timestamp: (i as any).timestamp,
    })),
    department_reports: departmentReports.map(r => ({
      department: r.department,
      summary: r.summary,
      anomalies: r.anomalies,
      recommendations: r.recommendations,
      report_type: r.report_type,
      created_at: r.created_at,
    })),
    recent_tasks: recentTasks.map(t => ({
      id: t.id,
      type: t.task_type,
      description: t.description,
      department: t.assigned_department,
      agent: t.assigned_agent,
      status: t.status,
      priority: t.priority,
      created_at: t.created_at,
    })),
    agent_activity: [], // Populated by caller from AiAgentActivityLog if needed
    strategic_initiatives: initiatives,
    initiative_stats: initiativeStats,
  };
}

/**
 * Get system status summary for Cory.
 */
export async function getSystemStatus(): Promise<CoryBrainStatus> {
  const data = await getCOODashboardData();
  return data.status;
}

// ---------------------------------------------------------------------------
// Self-Evolution
// ---------------------------------------------------------------------------

/**
 * Run the CoryBrain self-evolution cycle.
 * Analyzes the system for improvements and generates strategic initiatives.
 */
export async function runSelfEvolution(): Promise<{
  findings: EvolutionFinding[];
  initiatives_created: number;
}> {
  return runEvolutionCycle();
}

// Re-export initiative functions for route consumption
export {
  createStrategicInitiative,
  getRecentInitiatives,
  getInitiativeStats,
} from './coryInitiatives';
export {
  approveInitiative,
  rejectInitiative,
  startInitiative,
  completeInitiative,
  getActiveInitiatives,
} from './coryInitiatives';
