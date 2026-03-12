// ─── KPI Service ──────────────────────────────────────────────────────────
// Department and entity KPI tracking, snapshot storage, and trend computation.

import { KPISnapshot, AiAgent, Campaign, Lead, Enrollment, Cohort } from '../../models';
import { sequelize } from '../../config/database';
import { QueryTypes, Op } from 'sequelize';
import type { KPIScopeType, KPIPeriod } from '../../models/KPISnapshot';

// ─── KPI Definitions ──────────────────────────────────────────────────────

export const DEPARTMENT_KPI_DEFINITIONS: Record<string, string[]> = {
  Marketing: ['campaign_roi', 'open_rate', 'reply_rate', 'cost_per_lead', 'funnel_velocity', 'active_campaigns'],
  Admissions: ['conversion_rate', 'show_rate', 'pipeline_velocity', 'avg_deal_cycle', 'new_leads'],
  Education: ['completion_rate', 'assignment_scores', 'session_attendance', 'curriculum_coverage'],
  Student_Success: ['at_risk_count', 'engagement_score', 'satisfaction_proxy', 'retention_rate'],
  Platform: ['uptime', 'error_rate', 'page_load_ms', 'agent_fleet_health'],
  Alumni: ['reengagement_rate', 'referral_count', 'community_activity'],
  Partnerships: ['active_partnerships', 'partner_pipeline_value', 'training_utilization'],
  Executive: ['revenue', 'enrollment_count', 'lead_count', 'system_health'],
  Strategy: ['initiative_velocity', 'experiment_success_rate'],
  Intelligence: ['agent_run_count', 'insight_generation_rate', 'anomaly_detection_rate'],
  Governance: ['policy_compliance_rate', 'risk_score', 'approval_turnaround'],
  Reporting: ['insight_accuracy', 'kpi_coverage', 'report_generation_rate'],
};

// ─── Snapshot Operations ──────────────────────────────────────────────────

export async function snapshotKPIs(
  scopeType: KPIScopeType,
  scopeId: string,
  scopeName: string,
  period: KPIPeriod,
  computedBy: string,
): Promise<any> {
  const today = new Date().toISOString().split('T')[0];
  const metrics = await gatherMetrics(scopeType, scopeId);

  // Compute deltas from previous snapshot
  const previous = await KPISnapshot.findOne({
    where: { scope_type: scopeType, scope_id: scopeId, period },
    order: [['snapshot_date', 'DESC']],
    raw: true,
  });

  const deltas = previous ? computeDeltas(metrics, (previous as any).metrics) : {};

  const [snapshot] = await KPISnapshot.upsert({
    scope_type: scopeType,
    scope_id: scopeId,
    scope_name: scopeName,
    period,
    snapshot_date: today,
    metrics,
    deltas,
    computed_by: computedBy,
  });

  return snapshot;
}

export function computeDeltas(
  current: Record<string, number>,
  previous: Record<string, number>,
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const key of Object.keys(current)) {
    const prev = previous[key];
    const curr = current[key];
    if (typeof prev === 'number' && typeof curr === 'number' && prev !== 0) {
      deltas[key] = ((curr - prev) / Math.abs(prev)) * 100;
    } else {
      deltas[key] = 0;
    }
  }
  return deltas;
}

// ─── Metrics Gathering ────────────────────────────────────────────────────

async function gatherMetrics(scopeType: KPIScopeType, scopeId: string): Promise<Record<string, number>> {
  switch (scopeType) {
    case 'department':
      return gatherDepartmentMetrics(scopeId);
    case 'system':
      return gatherSystemMetrics();
    default:
      return {};
  }
}

async function gatherDepartmentMetrics(department: string): Promise<Record<string, number>> {
  const metrics: Record<string, number> = {};

  // Agent health for this department
  const deptCats = getDeptCategories(department);
  if (deptCats.length > 0) {
    const agents = await AiAgent.findAll({
      where: { category: { [Op.in]: deptCats }, enabled: true },
      attributes: ['status', 'error_count', 'run_count'],
      raw: true,
    });

    const total = agents.length;
    const healthy = agents.filter((a: any) => a.status !== 'error').length;
    metrics.agent_count = total;
    metrics.agent_health_score = total > 0 ? (healthy / total) * 100 : 100;
    metrics.total_runs = agents.reduce((sum: number, a: any) => sum + (a.run_count || 0), 0);
    metrics.total_errors = agents.reduce((sum: number, a: any) => sum + (a.error_count || 0), 0);
  }

  // Department-specific metrics
  if (department === 'Marketing') {
    const activeCampaigns = await Campaign.count({ where: { status: 'active' } });
    metrics.active_campaigns = activeCampaigns;
  }

  if (department === 'Admissions') {
    const newLeads = await Lead.count({
      where: { created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    metrics.new_leads = newLeads;
  }

  if (department === 'Education') {
    const activeCohorts = await Cohort.count({ where: { status: 'active' } });
    metrics.active_cohorts = activeCohorts;
  }

  return metrics;
}

async function gatherSystemMetrics(): Promise<Record<string, number>> {
  const [totalAgents, activeAgents, totalLeads, totalCampaigns] = await Promise.all([
    AiAgent.count(),
    AiAgent.count({ where: { enabled: true } }),
    Lead.count(),
    Campaign.count({ where: { status: 'active' } }),
  ]);

  return {
    total_agents: totalAgents,
    active_agents: activeAgents,
    total_leads: totalLeads,
    active_campaigns: totalCampaigns,
    system_health: activeAgents > 0 ? 100 : 0,
  };
}

function getDeptCategories(dept: string): string[] {
  const map: Record<string, string[]> = {
    Executive: ['executive'], Strategy: ['strategic'], Marketing: ['outbound', 'openclaw'],
    Admissions: ['admissions', 'admissions_ops'], Alumni: ['alumni'], Partnerships: ['partnerships'],
    Education: ['accelerator', 'curriculum'], Student_Success: ['student_success'],
    Platform: ['maintenance', 'operations', 'website_intelligence', 'orchestration'],
    Intelligence: ['behavioral', 'ai_ops', 'memory', 'meta', 'autonomous'],
    Governance: ['security', 'governance_ops'], Reporting: ['reporting'],
  };
  return map[dept] || [];
}

// ─── KPI Retrieval ────────────────────────────────────────────────────────

export async function getKPIHistory(
  scopeType: KPIScopeType,
  scopeId: string,
  period: KPIPeriod = 'daily',
  limit = 30,
): Promise<any[]> {
  return KPISnapshot.findAll({
    where: { scope_type: scopeType, scope_id: scopeId, period },
    order: [['snapshot_date', 'DESC']],
    limit,
    raw: true,
  });
}

export async function getSystemWideKPIs(): Promise<Record<string, any>> {
  const departments = Object.keys(DEPARTMENT_KPI_DEFINITIONS);
  const result: Record<string, any> = {};

  for (const dept of departments) {
    const latest = await KPISnapshot.findOne({
      where: { scope_type: 'department', scope_id: dept },
      order: [['snapshot_date', 'DESC']],
      raw: true,
    });
    result[dept] = latest ? { metrics: (latest as any).metrics, deltas: (latest as any).deltas, date: (latest as any).snapshot_date } : null;
  }

  return result;
}
