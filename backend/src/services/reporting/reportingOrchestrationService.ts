// ─── Reporting Orchestration Service ──────────────────────────────────────
// Coordinates all reporting agents — system scans, daily digests, weekly strategic reports.

import { v4 as uuidv4 } from 'uuid';
import { ReportingInsight, KPISnapshot, AiAgent } from '../../models';
import { logEvent } from '../ledgerService';
import { Op } from 'sequelize';

// ─── System Scan ──────────────────────────────────────────────────────────

export async function runSystemScan(): Promise<{
  trace_id: string;
  insights_generated: number;
  departments_scanned: number;
  duration_ms: number;
}> {
  const trace_id = uuidv4();
  const start = Date.now();

  // Count active data points across the system
  const activeAgents = await AiAgent.count({ where: { enabled: true } });
  const recentInsights = await ReportingInsight.count({
    where: { created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });

  const departments = [
    'Executive', 'Strategy', 'Marketing', 'Admissions', 'Alumni',
    'Partnerships', 'Education', 'Student_Success', 'Platform',
    'Intelligence', 'Governance', 'Reporting',
  ];

  await logEvent('reporting_system_scan', 'ReportingIntelligenceAgent', 'system', 'global', {
    trace_id,
    active_agents: activeAgents,
    recent_insights: recentInsights,
    departments_scanned: departments.length,
  });

  return {
    trace_id,
    insights_generated: recentInsights,
    departments_scanned: departments.length,
    duration_ms: Date.now() - start,
  };
}

// ─── Daily Digest ─────────────────────────────────────────────────────────

export async function runDailyDigest(): Promise<{
  trace_id: string;
  departments_reported: number;
  top_insights: any[];
  duration_ms: number;
}> {
  const trace_id = uuidv4();
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // Gather today's KPI snapshots
  const snapshots = await KPISnapshot.findAll({
    where: { snapshot_date: today, period: 'daily' },
    order: [['scope_type', 'ASC']],
    raw: true,
  });

  // Get top insights from last 24 hours
  const topInsights = await ReportingInsight.findAll({
    where: {
      created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      status: 'new',
    },
    order: [['final_score', 'DESC']],
    limit: 10,
    raw: true,
  });

  await logEvent('reporting_daily_digest', 'ReportingIntelligenceAgent', 'system', 'global', {
    trace_id,
    departments_reported: snapshots.length,
    top_insight_count: topInsights.length,
  });

  return {
    trace_id,
    departments_reported: snapshots.length,
    top_insights: topInsights,
    duration_ms: Date.now() - start,
  };
}

// ─── Weekly Strategic Report ──────────────────────────────────────────────

export async function runWeeklyStrategic(): Promise<{
  trace_id: string;
  kpi_trends: any[];
  strategic_insights: any[];
  duration_ms: number;
}> {
  const trace_id = uuidv4();
  const start = Date.now();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get weekly KPI snapshots for delta analysis
  const weeklySnapshots = await KPISnapshot.findAll({
    where: { period: 'weekly', snapshot_date: { [Op.gte]: weekAgo.toISOString().split('T')[0] } },
    order: [['scope_type', 'ASC'], ['snapshot_date', 'DESC']],
    raw: true,
  });

  // Get high-impact insights from the week
  const strategicInsights = await ReportingInsight.findAll({
    where: {
      created_at: { [Op.gte]: weekAgo },
      final_score: { [Op.gte]: 0.7 },
    },
    order: [['final_score', 'DESC']],
    limit: 20,
    raw: true,
  });

  await logEvent('reporting_weekly_strategic', 'ReportingIntelligenceAgent', 'system', 'global', {
    trace_id,
    weekly_snapshots: weeklySnapshots.length,
    strategic_insights: strategicInsights.length,
  });

  return {
    trace_id,
    kpi_trends: weeklySnapshots,
    strategic_insights: strategicInsights,
    duration_ms: Date.now() - start,
  };
}
