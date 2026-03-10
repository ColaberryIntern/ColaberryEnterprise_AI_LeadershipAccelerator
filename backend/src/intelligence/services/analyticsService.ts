import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import CampaignHealth from '../../models/CampaignHealth';
import CampaignError from '../../models/CampaignError';
import OrchestrationHealth from '../../models/OrchestrationHealth';
import AiAgent from '../../models/AiAgent';
import SystemProcess from '../../models/SystemProcess';
import AiAgentActivityLog from '../../models/AiAgentActivityLog';
import { Lead } from '../../models';
import OpportunityScore from '../../models/OpportunityScore';

// ---- Helpers ----

function riskLabel(score: number): string {
  if (score < 30) return 'Low';
  if (score <= 60) return 'Medium';
  return 'High';
}

function healthLabel(score: number): string {
  if (score >= 80) return 'Healthy';
  if (score >= 50) return 'Degraded';
  return 'Critical';
}

function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Simple linear regression: returns slope per period
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ---- KPIs ----

export async function getIntelligenceKPIs(entityType?: string) {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // --- Risk Level ---
  const healthRecords = await CampaignHealth.findAll();
  const avgHealth =
    healthRecords.length > 0
      ? healthRecords.reduce((s, h) => s + h.health_score, 0) / healthRecords.length
      : 100;
  const riskScore = Math.round(100 - avgHealth);

  // Delta: compare this week avg vs last week avg
  const thisWeekHealth = healthRecords.filter(
    (h) => h.last_scan_at && new Date(h.last_scan_at) >= oneWeekAgo,
  );
  const lastWeekHealth = healthRecords.filter(
    (h) =>
      h.last_scan_at &&
      new Date(h.last_scan_at) >= twoWeeksAgo &&
      new Date(h.last_scan_at) < oneWeekAgo,
  );
  const thisWeekAvg =
    thisWeekHealth.length > 0
      ? thisWeekHealth.reduce((s, h) => s + h.health_score, 0) / thisWeekHealth.length
      : avgHealth;
  const lastWeekAvg =
    lastWeekHealth.length > 0
      ? lastWeekHealth.reduce((s, h) => s + h.health_score, 0) / lastWeekHealth.length
      : avgHealth;
  const riskDelta = Math.round((100 - thisWeekAvg) - (100 - lastWeekAvg));

  // --- Active Alerts ---
  const unresolvedErrors = await CampaignError.count({ where: { resolved: false } });

  const latestOrchHealth = await OrchestrationHealth.findOne({
    order: [['scan_timestamp', 'DESC']],
  });
  let orchAlertCount = 0;
  if (latestOrchHealth?.findings && Array.isArray(latestOrchHealth.findings)) {
    orchAlertCount = (latestOrchHealth.findings as any[]).filter(
      (f: any) => f.severity === 'critical' || f.severity === 'error',
    ).length;
  }
  const activeAlertsCount = unresolvedErrors + orchAlertCount;

  // Alert delta: compare vs a week ago (approximate)
  const alertsDelta = 0; // No historical snapshot available; default to 0

  // --- Lead Trend ---
  const leadsThisWeek = await Lead.count({
    where: { created_at: { [Op.gte]: oneWeekAgo } },
  });
  const leadsLastWeek = await Lead.count({
    where: { created_at: { [Op.gte]: twoWeeksAgo, [Op.lt]: oneWeekAgo } },
  });
  const totalLeads = await Lead.count();
  const leadDelta = pctDelta(leadsThisWeek, leadsLastWeek);

  // --- System Health ---
  const orchScore = latestOrchHealth?.health_score ?? 100;
  const agentErrorRate = await (async () => {
    const agents = await AiAgent.findAll();
    if (agents.length === 0) return 0;
    const erroredCount = agents.filter((a) => a.status === 'error').length;
    return erroredCount / agents.length;
  })();
  const systemHealthScore = Math.round(
    orchScore * 0.5 + avgHealth * 0.3 + (100 - agentErrorRate * 100) * 0.2,
  );

  // --- Agent Health ---
  const agents = await AiAgent.findAll();
  const agentHealth = {
    running: agents.filter((a) => a.status === 'running').length,
    errored: agents.filter((a) => a.status === 'error').length,
    total: agents.length,
    idle: agents.filter((a) => a.status === 'idle').length,
    paused: agents.filter((a) => a.status === 'paused').length,
  };

  // --- Process Activity ---
  const processCount24h = await SystemProcess.count({
    where: { created_at: { [Op.gte]: oneDayAgo } },
  });
  const processCountPrev24h = await SystemProcess.count({
    where: { created_at: { [Op.gte]: twoDaysAgo, [Op.lt]: oneDayAgo } },
  });
  const processDelta = pctDelta(processCount24h, processCountPrev24h);

  return {
    risk_level: { score: riskScore, label: riskLabel(riskScore), delta: riskDelta },
    active_alerts: { count: activeAlertsCount, delta: alertsDelta },
    lead_trend: { value: `${leadsThisWeek}`, delta: leadDelta, total: totalLeads },
    system_health: { score: systemHealthScore, label: healthLabel(systemHealthScore) },
    agent_health: agentHealth,
    process_activity: { count_24h: processCount24h, delta: processDelta },
  };
}

// ---- Anomalies ----

export async function getAnomalies(entityType?: string) {
  const severityOrder: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };

  // 1. Unresolved campaign errors
  const campaignErrors = await CampaignError.findAll({
    where: { resolved: false, severity: { [Op.in]: ['critical', 'error'] } },
    order: [['created_at', 'DESC']],
    limit: 10,
  });
  const errorAnomalies = campaignErrors.map((e) => ({
    id: `ce-${e.id}`,
    entity: `Campaign ${e.campaign_id}`,
    entity_type: 'campaign',
    metric: e.component,
    severity: e.severity,
    description: e.error_message,
    detected_at: e.created_at,
    factors: [e.component, e.severity],
  }));

  // 2. Errored agents
  const erroredAgents = await AiAgent.findAll({ where: { status: 'error' } });
  const agentAnomalies = erroredAgents.map((a) => ({
    id: `ag-${a.id}`,
    entity: a.agent_name,
    entity_type: 'agent',
    metric: 'status',
    severity: 'error' as string,
    description: `Agent "${a.agent_name}" is in error state (${a.error_count} errors, ${a.run_count} runs)`,
    detected_at: a.last_run_at || a.updated_at,
    factors: [a.agent_type, `error_count:${a.error_count}`],
  }));

  // 3. Orchestration findings
  const latestOrch = await OrchestrationHealth.findOne({
    order: [['scan_timestamp', 'DESC']],
  });
  const orchAnomalies: any[] = [];
  if (latestOrch?.findings && Array.isArray(latestOrch.findings)) {
    (latestOrch.findings as any[])
      .filter((f: any) => f.severity === 'critical' || f.severity === 'error')
      .forEach((f: any, i: number) => {
        orchAnomalies.push({
          id: `oh-${latestOrch.id}-${i}`,
          entity: 'Orchestration Engine',
          entity_type: 'system',
          metric: f.category || 'orchestration',
          severity: f.severity,
          description: f.message,
          detected_at: latestOrch.scan_timestamp,
          factors: [f.category, `count:${f.count || 1}`],
        });
      });
  }

  // Combine and sort
  let all = [...errorAnomalies, ...agentAnomalies, ...orchAnomalies];

  // Filter by entity type if scoped
  if (entityType) {
    const typeMap: Record<string, string[]> = {
      campaigns: ['campaign'],
      agents: ['agent'],
      system: ['system'],
      leads: ['campaign', 'opportunity'],
    };
    const allowedTypes = typeMap[entityType] || [entityType];
    all = all.filter((a) => allowedTypes.includes(a.entity_type));
  }

  all.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  return all.slice(0, 20);
}

// ---- Forecasts ----

export async function getForecasts(entityType?: string) {
  // Lead forecast
  const leadWeeks: { week: string; count: string }[] = await sequelize.query(
    `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
     FROM "leads"
     WHERE created_at >= NOW() - INTERVAL '12 weeks'
     GROUP BY week ORDER BY week`,
    { type: QueryTypes.SELECT },
  );

  const leadForecast = buildForecast(leadWeeks);

  // Enrollment forecast
  const enrollWeeks: { week: string; count: string }[] = await sequelize.query(
    `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
     FROM "enrollments"
     WHERE created_at >= NOW() - INTERVAL '12 weeks'
     GROUP BY week ORDER BY week`,
    { type: QueryTypes.SELECT },
  ).catch(() => [] as any);

  const enrollForecast = buildForecast(enrollWeeks);

  return {
    leads_30d: leadForecast,
    enrollments_30d: enrollForecast,
  };
}

function buildForecast(
  weeklyData: { week: string; count: string }[],
): Array<{ date: string; predicted: number; upper: number; lower: number }> {
  const counts = weeklyData.map((w) => Number(w.count));
  if (counts.length === 0) {
    // Return 4 empty weeks
    const result: Array<{ date: string; predicted: number; upper: number; lower: number }> = [];
    const now = new Date();
    for (let i = 1; i <= 4; i++) {
      const d = new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      result.push({
        date: d.toISOString().slice(0, 10),
        predicted: 0,
        upper: 0,
        lower: 0,
      });
    }
    return result;
  }

  const slope = linearSlope(counts);
  const lastValue = counts[counts.length - 1];
  const n = counts.length;

  const result: Array<{ date: string; predicted: number; upper: number; lower: number }> = [];
  const lastWeekDate = weeklyData.length > 0 ? new Date(weeklyData[weeklyData.length - 1].week) : new Date();

  for (let i = 1; i <= 4; i++) {
    const predicted = Math.max(0, Math.round(lastValue + slope * i));
    const upper = Math.round(predicted * 1.2);
    const lower = Math.max(0, Math.round(predicted * 0.8));
    const d = new Date(lastWeekDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    result.push({
      date: d.toISOString().slice(0, 10),
      predicted,
      upper,
      lower,
    });
  }

  return result;
}

// ---- Risk Entities ----

export async function getRiskEntities(entityType?: string) {
  // 1. Low-health campaigns
  const unhealthyCampaigns = await CampaignHealth.findAll({
    where: { health_score: { [Op.lt]: 70 } },
    order: [['health_score', 'ASC']],
  });
  const campaignRisks = unhealthyCampaigns.map((c) => ({
    entity: `Campaign ${c.campaign_id}`,
    entity_type: 'campaign',
    risk_score: 100 - c.health_score,
    factors: [
      `health_score:${c.health_score}`,
      `status:${c.status}`,
      `errors:${c.error_count}`,
    ],
    last_activity: c.last_scan_at,
  }));

  // 2. Stalled opportunities
  const stalledOpps = await OpportunityScore.findAll({
    where: { stall_risk: { [Op.in]: ['high', 'medium'] } },
    order: [['score', 'ASC']],
    limit: 10,
  });
  const oppRisks = stalledOpps.map((o) => ({
    entity: `Lead ${o.lead_id}`,
    entity_type: 'opportunity',
    risk_score: o.stall_risk === 'high' ? 85 : 60,
    factors: [
      `stall_risk:${o.stall_risk}`,
      o.stall_reason || '',
      `conversion_probability:${o.conversion_probability}`,
    ].filter(Boolean),
    last_activity: o.updated_at || null,
  }));

  // 3. Error-prone agents
  const errorAgents = await AiAgent.findAll({
    where: { error_count: { [Op.gt]: 5 } },
    order: [['error_count', 'DESC']],
  });
  const agentRisks = errorAgents.map((a) => ({
    entity: a.agent_name,
    entity_type: 'agent',
    risk_score: Math.min(100, Math.round((a.error_count / Math.max(a.run_count, 1)) * 100 + 20)),
    factors: [
      `error_count:${a.error_count}`,
      `run_count:${a.run_count}`,
      `status:${a.status}`,
    ],
    last_activity: a.last_run_at,
  }));

  let all = [...campaignRisks, ...oppRisks, ...agentRisks];

  // Filter by entity type if scoped
  if (entityType) {
    const typeMap: Record<string, string[]> = {
      campaigns: ['campaign'],
      leads: ['opportunity'],
      agents: ['agent'],
    };
    const allowedTypes = typeMap[entityType] || [entityType];
    all = all.filter((a) => allowedTypes.includes(a.entity_type));
  }

  all.sort((a, b) => b.risk_score - a.risk_score);

  return all.slice(0, 20);
}
