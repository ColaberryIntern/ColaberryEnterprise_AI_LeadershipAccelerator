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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function buildForecast(
  weeklyData: { week: string; count: string }[],
): Array<{ date: string; predicted: number; upper: number; lower: number }> {
  const counts = weeklyData.map((w) => Number(w.count));
  if (counts.length === 0) {
    const result: Array<{ date: string; predicted: number; upper: number; lower: number }> = [];
    const now = new Date();
    for (let i = 1; i <= 4; i++) {
      const d = new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      result.push({ date: d.toISOString().slice(0, 10), predicted: 0, upper: 0, lower: 0 });
    }
    return result;
  }

  const slope = linearSlope(counts);
  const lastValue = counts[counts.length - 1];
  const result: Array<{ date: string; predicted: number; upper: number; lower: number }> = [];
  const lastWeekDate = weeklyData.length > 0 ? new Date(weeklyData[weeklyData.length - 1].week) : new Date();

  for (let i = 1; i <= 4; i++) {
    const predicted = Math.max(0, Math.round(lastValue + slope * i));
    const upper = Math.round(predicted * 1.2);
    const lower = Math.max(0, Math.round(predicted * 0.8));
    const d = new Date(lastWeekDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    result.push({ date: d.toISOString().slice(0, 10), predicted, upper, lower });
  }
  return result;
}

/** Safe raw query — returns empty array if table doesn't exist */
async function safeQuery<T = any>(sql: string): Promise<T[]> {
  try {
    return await sequelize.query(sql, { type: QueryTypes.SELECT }) as T[];
  } catch {
    return [];
  }
}

/** Safe count query — returns 0 on error */
async function safeCount(sql: string): Promise<number> {
  try {
    const rows: any[] = await sequelize.query(sql, { type: QueryTypes.SELECT });
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

// ─── Entity Strategy Interface ────────────────────────────────────────────────

interface EntityStrategy {
  getKPIs(): Promise<Record<string, any>>;
  getAnomalies(): Promise<any[]>;
  getForecasts(): Promise<Record<string, any>>;
  getRiskEntities(): Promise<any[]>;
}

// ─── Strategy: Campaigns ──────────────────────────────────────────────────────

const campaignStrategy: EntityStrategy = {
  async getKPIs() {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Campaign count
    const totalCampaigns = await safeCount('SELECT COUNT(*) as count FROM "campaigns"');
    const activeCampaigns = await safeCount(
      `SELECT COUNT(*) as count FROM "campaigns" WHERE status = 'active' OR status = 'running'`,
    );

    // Lead generation rate (leads created this week via campaigns)
    const leadsThisWeek = await Lead.count({ where: { created_at: { [Op.gte]: oneWeekAgo } } });
    const leadsLastWeek = await Lead.count({
      where: { created_at: { [Op.gte]: twoWeeksAgo, [Op.lt]: oneWeekAgo } },
    });
    const leadGenDelta = pctDelta(leadsThisWeek, leadsLastWeek);

    // Campaign error rate
    const totalErrors = await CampaignError.count();
    const unresolvedErrors = await CampaignError.count({ where: { resolved: false } });
    const errorRate = totalCampaigns > 0
      ? Math.round((unresolvedErrors / Math.max(totalCampaigns, 1)) * 100)
      : 0;

    // Campaign health
    const healthRecords = await CampaignHealth.findAll();
    const avgHealth = healthRecords.length > 0
      ? Math.round(healthRecords.reduce((s, h) => s + h.health_score, 0) / healthRecords.length)
      : 100;

    return {
      risk_level: { score: errorRate, label: riskLabel(errorRate), delta: 0 },
      active_alerts: { count: unresolvedErrors, delta: 0 },
      lead_trend: { value: `${leadsThisWeek}`, delta: leadGenDelta, total: totalCampaigns },
      system_health: { score: avgHealth, label: healthLabel(avgHealth) },
      agent_health: { running: activeCampaigns, errored: unresolvedErrors, total: totalCampaigns, idle: 0, paused: 0 },
      process_activity: { count_24h: totalErrors, delta: 0 },
    };
  },

  async getAnomalies() {
    const campaignErrors = await CampaignError.findAll({
      where: { resolved: false },
      order: [['created_at', 'DESC']],
      limit: 20,
    });
    return campaignErrors.map((e) => ({
      id: `ce-${e.id}`,
      entity: `Campaign ${e.campaign_id}`,
      entity_type: 'campaign',
      metric: e.component,
      severity: e.severity,
      description: e.error_message,
      detected_at: e.created_at,
      factors: { component: e.component, severity: e.severity },
    }));
  },

  async getForecasts() {
    // Lead generation forecast (campaigns drive leads)
    const leadWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "leads" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    // Campaign creation trend
    const campaignWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "campaigns" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    return {
      leads_30d: buildForecast(leadWeeks),
      enrollments_30d: buildForecast(campaignWeeks),
    };
  },

  async getRiskEntities() {
    const unhealthy = await CampaignHealth.findAll({
      where: { health_score: { [Op.lt]: 80 } },
      order: [['health_score', 'ASC']],
      limit: 20,
    });
    return unhealthy.map((c) => ({
      entity: `Campaign ${c.campaign_id}`,
      entity_type: 'campaign',
      risk_score: 100 - c.health_score,
      factors: {
        health_score: c.health_score,
        status: c.status,
        error_count: c.error_count,
      },
      last_activity: c.last_scan_at,
    }));
  },
};

// ─── Strategy: Leads ──────────────────────────────────────────────────────────

const leadStrategy: EntityStrategy = {
  async getKPIs() {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const totalLeads = await Lead.count();
    const leadsThisWeek = await Lead.count({ where: { created_at: { [Op.gte]: oneWeekAgo } } });
    const leadsLastWeek = await Lead.count({
      where: { created_at: { [Op.gte]: twoWeeksAgo, [Op.lt]: oneWeekAgo } },
    });
    const leadDelta = pctDelta(leadsThisWeek, leadsLastWeek);

    // Pipeline stage distribution
    const stageRows = await safeQuery<{ pipeline_stage: string; count: string }>(
      `SELECT COALESCE(pipeline_stage, 'unknown') as pipeline_stage, COUNT(*) as count
       FROM "leads" GROUP BY pipeline_stage ORDER BY count DESC`,
    );
    const stageDistribution: Record<string, number> = {};
    stageRows.forEach((r) => { stageDistribution[r.pipeline_stage] = Number(r.count); });

    // Conversion probability (from opportunity_scores)
    const avgConversion = await safeQuery<{ avg: string }>(
      `SELECT AVG(conversion_probability) as avg FROM "opportunity_scores"`,
    );
    const conversionProb = Math.round(Number(avgConversion[0]?.avg ?? 0));

    // Lead engagement (activity count last 7 days)
    const activityCount = await safeCount(
      `SELECT COUNT(*) as count FROM "activities" WHERE created_at >= NOW() - INTERVAL '7 days'`,
    );

    // Stalled opportunities
    const stalledCount = await safeCount(
      `SELECT COUNT(*) as count FROM "opportunity_scores" WHERE stall_risk IN ('high', 'medium')`,
    );

    return {
      risk_level: { score: stalledCount > 5 ? 70 : stalledCount > 0 ? 40 : 10, label: riskLabel(stalledCount > 5 ? 70 : stalledCount > 0 ? 40 : 10), delta: 0 },
      active_alerts: { count: stalledCount, delta: 0 },
      lead_trend: { value: `${leadsThisWeek}`, delta: leadDelta, total: totalLeads },
      system_health: { score: conversionProb, label: `${conversionProb}% avg conversion` },
      agent_health: { running: activityCount, errored: 0, total: totalLeads, idle: 0, paused: 0 },
      process_activity: { count_24h: activityCount, delta: 0 },
    };
  },

  async getAnomalies() {
    // Stalled opportunities as anomalies
    const stalledOpps = await OpportunityScore.findAll({
      where: { stall_risk: { [Op.in]: ['high', 'medium'] } },
      order: [['score', 'ASC']],
      limit: 20,
    });
    const oppAnomalies = stalledOpps.map((o) => ({
      id: `opp-${o.id}`,
      entity: `Lead ${o.lead_id}`,
      entity_type: 'lead',
      metric: 'stall_risk',
      severity: o.stall_risk === 'high' ? 'error' : 'warning',
      description: o.stall_reason || `Lead ${o.lead_id} stalled — conversion probability ${o.conversion_probability}%`,
      detected_at: o.updated_at,
      factors: { stall_risk: o.stall_risk, conversion_probability: o.conversion_probability },
    }));

    // Low temperature leads
    const coldLeads = await safeQuery<{ id: string; first_name: string; last_name: string; temperature: string }>(
      `SELECT l.id, l.first_name, l.last_name, lth.temperature
       FROM "leads" l
       JOIN "lead_temperature_history" lth ON lth.lead_id = l.id
       WHERE lth.id IN (
         SELECT DISTINCT ON (lead_id) id FROM "lead_temperature_history"
         ORDER BY lead_id, recorded_at DESC
       )
       AND lth.temperature IN ('cold', 'frozen')
       LIMIT 10`,
    );
    const coldAnomalies = coldLeads.map((l, i) => ({
      id: `cold-${l.id}-${i}`,
      entity: `${l.first_name || ''} ${l.last_name || ''}`.trim() || `Lead ${l.id}`,
      entity_type: 'lead',
      metric: 'temperature',
      severity: l.temperature === 'frozen' ? 'error' : 'warning',
      description: `Lead temperature is ${l.temperature}`,
      detected_at: new Date(),
      factors: { temperature: l.temperature },
    }));

    return [...oppAnomalies, ...coldAnomalies].slice(0, 20);
  },

  async getForecasts() {
    const leadWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "leads" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    const activityWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "activities" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    return {
      leads_30d: buildForecast(leadWeeks),
      enrollments_30d: buildForecast(activityWeeks),
    };
  },

  async getRiskEntities() {
    const stalledOpps = await OpportunityScore.findAll({
      where: { stall_risk: { [Op.in]: ['high', 'medium'] } },
      order: [['score', 'ASC']],
      limit: 20,
    });
    return stalledOpps.map((o) => ({
      entity: `Lead ${o.lead_id}`,
      entity_type: 'lead',
      risk_score: o.stall_risk === 'high' ? 85 : 60,
      factors: {
        stall_risk: o.stall_risk,
        stall_reason: o.stall_reason || '',
        conversion_probability: o.conversion_probability,
      },
      last_activity: o.updated_at || null,
    }));
  },
};

// ─── Strategy: Students ───────────────────────────────────────────────────────

const studentStrategy: EntityStrategy = {
  async getKPIs() {
    // Total students (enrollments)
    const totalStudents = await safeCount('SELECT COUNT(DISTINCT student_id) as count FROM "enrollments"');
    const totalEnrollments = await safeCount('SELECT COUNT(*) as count FROM "enrollments"');

    // Cohort distribution
    const cohortCount = await safeCount('SELECT COUNT(*) as count FROM "cohorts"');

    // Completion rate (lesson_instances completed / total)
    const totalLessons = await safeCount('SELECT COUNT(*) as count FROM "lesson_instances"');
    const completedLessons = await safeCount(
      `SELECT COUNT(*) as count FROM "lesson_instances" WHERE status = 'completed'`,
    );
    const completionRate = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    // Attendance (last 7 days)
    const attendanceCount = await safeCount(
      `SELECT COUNT(*) as count FROM "attendance_records" WHERE created_at >= NOW() - INTERVAL '7 days'`,
    );

    // Skill mastery average
    const avgMastery = await safeQuery<{ avg: string }>(
      `SELECT AVG(mastery_level) as avg FROM "skill_mastery"`,
    );
    const masteryScore = Math.round(Number(avgMastery[0]?.avg ?? 0) * 100);

    // Dropout risk: students with no recent activity
    const inactiveStudents = await safeCount(
      `SELECT COUNT(DISTINCT e.student_id) as count FROM "enrollments" e
       WHERE e.status = 'active'
       AND e.student_id NOT IN (
         SELECT DISTINCT student_id FROM "attendance_records"
         WHERE created_at >= NOW() - INTERVAL '14 days'
       )`,
    );
    const dropoutRiskScore = totalStudents > 0 ? Math.round((inactiveStudents / totalStudents) * 100) : 0;

    return {
      risk_level: { score: dropoutRiskScore, label: riskLabel(dropoutRiskScore), delta: 0 },
      active_alerts: { count: inactiveStudents, delta: 0 },
      lead_trend: { value: `${totalEnrollments}`, delta: 0, total: totalStudents },
      system_health: { score: completionRate, label: `${completionRate}% completion` },
      agent_health: { running: cohortCount, errored: inactiveStudents, total: totalStudents, idle: 0, paused: 0 },
      process_activity: { count_24h: attendanceCount, delta: 0 },
    };
  },

  async getAnomalies() {
    // Students at risk: no attendance in 14 days
    const atRisk = await safeQuery<{ student_id: string; last_attendance: string }>(
      `SELECT e.student_id, MAX(ar.created_at) as last_attendance
       FROM "enrollments" e
       LEFT JOIN "attendance_records" ar ON ar.student_id = e.student_id
       WHERE e.status = 'active'
       GROUP BY e.student_id
       HAVING MAX(ar.created_at) < NOW() - INTERVAL '14 days' OR MAX(ar.created_at) IS NULL
       ORDER BY last_attendance ASC NULLS FIRST
       LIMIT 20`,
    );

    return atRisk.map((r, i) => ({
      id: `stu-risk-${r.student_id}-${i}`,
      entity: `Student ${r.student_id}`,
      entity_type: 'student',
      metric: 'attendance',
      severity: r.last_attendance ? 'warning' : 'error',
      description: r.last_attendance
        ? `No attendance since ${new Date(r.last_attendance).toLocaleDateString()}`
        : 'No attendance records found',
      detected_at: new Date(),
      factors: { last_attendance: r.last_attendance || 'never', status: 'at_risk' },
    }));
  },

  async getForecasts() {
    const enrollWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "enrollments" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    const attendanceWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "attendance_records" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    return {
      leads_30d: buildForecast(enrollWeeks),
      enrollments_30d: buildForecast(attendanceWeeks),
    };
  },

  async getRiskEntities() {
    // Low-progress students by skill mastery
    const lowMastery = await safeQuery<{ student_id: string; avg_mastery: string; skill_count: string }>(
      `SELECT student_id, AVG(mastery_level) as avg_mastery, COUNT(*) as skill_count
       FROM "skill_mastery"
       GROUP BY student_id
       HAVING AVG(mastery_level) < 0.4
       ORDER BY avg_mastery ASC
       LIMIT 20`,
    );

    return lowMastery.map((s) => ({
      entity: `Student ${s.student_id}`,
      entity_type: 'student',
      risk_score: Math.round((1 - Number(s.avg_mastery)) * 100),
      factors: {
        avg_mastery: Math.round(Number(s.avg_mastery) * 100),
        skill_count: Number(s.skill_count),
      },
      last_activity: null,
    }));
  },
};

// ─── Strategy: Agents ─────────────────────────────────────────────────────────

const agentStrategy: EntityStrategy = {
  async getKPIs() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const agents = await AiAgent.findAll();
    const activeAgents = agents.filter((a) => a.status === 'running' || a.status === 'idle').length;
    const erroredAgents = agents.filter((a) => a.status === 'error').length;
    const totalRunCount = agents.reduce((s, a) => s + (a.run_count || 0), 0);
    const totalErrorCount = agents.reduce((s, a) => s + (a.error_count || 0), 0);
    const errorRate = totalRunCount > 0 ? Math.round((totalErrorCount / totalRunCount) * 100) : 0;
    const successRate = 100 - errorRate;

    // Execution frequency (last 24h)
    const execCount24h = await safeCount(
      `SELECT COUNT(*) as count FROM "ai_agent_activity_logs" WHERE created_at >= NOW() - INTERVAL '24 hours'`,
    );
    const execCountPrev24h = await safeCount(
      `SELECT COUNT(*) as count FROM "ai_agent_activity_logs"
       WHERE created_at >= NOW() - INTERVAL '48 hours' AND created_at < NOW() - INTERVAL '24 hours'`,
    );
    const execDelta = pctDelta(execCount24h, execCountPrev24h);

    // Orchestration health
    const latestOrch = await OrchestrationHealth.findOne({ order: [['scan_timestamp', 'DESC']] });
    const orchScore = latestOrch?.health_score ?? 100;

    return {
      risk_level: { score: errorRate, label: riskLabel(errorRate), delta: 0 },
      active_alerts: { count: erroredAgents, delta: 0 },
      lead_trend: { value: `${execCount24h}`, delta: execDelta, total: totalRunCount },
      system_health: { score: orchScore, label: healthLabel(orchScore) },
      agent_health: {
        running: agents.filter((a) => a.status === 'running').length,
        errored: erroredAgents,
        total: agents.length,
        idle: agents.filter((a) => a.status === 'idle').length,
        paused: agents.filter((a) => a.status === 'paused').length,
      },
      process_activity: { count_24h: execCount24h, delta: execDelta },
    };
  },

  async getAnomalies() {
    // Errored agents
    const erroredAgents = await AiAgent.findAll({ where: { status: 'error' } });
    const agentAnomalies = erroredAgents.map((a) => ({
      id: `ag-${a.id}`,
      entity: a.agent_name,
      entity_type: 'agent',
      metric: 'status',
      severity: 'error' as string,
      description: `Agent "${a.agent_name}" is in error state (${a.error_count} errors, ${a.run_count} runs)`,
      detected_at: a.last_run_at || a.updated_at,
      factors: { agent_type: a.agent_type, error_count: a.error_count, run_count: a.run_count },
    }));

    // Orchestration findings
    const latestOrch = await OrchestrationHealth.findOne({ order: [['scan_timestamp', 'DESC']] });
    const orchAnomalies: any[] = [];
    if (latestOrch?.findings && Array.isArray(latestOrch.findings)) {
      (latestOrch.findings as any[])
        .filter((f: any) => f.severity === 'critical' || f.severity === 'error' || f.severity === 'warning')
        .forEach((f: any, i: number) => {
          orchAnomalies.push({
            id: `oh-${latestOrch.id}-${i}`,
            entity: 'Orchestration Engine',
            entity_type: 'system',
            metric: f.category || 'orchestration',
            severity: f.severity,
            description: f.message,
            detected_at: latestOrch.scan_timestamp,
            factors: { category: f.category, count: f.count || 1 },
          });
        });
    }

    // High error-rate agents (not necessarily in error status)
    const highErrorAgents = await AiAgent.findAll({
      where: { error_count: { [Op.gt]: 3 }, status: { [Op.ne]: 'error' } },
      order: [['error_count', 'DESC']],
      limit: 10,
    });
    const warnAnomalies = highErrorAgents.map((a) => ({
      id: `ag-warn-${a.id}`,
      entity: a.agent_name,
      entity_type: 'agent',
      metric: 'error_rate',
      severity: 'warning' as string,
      description: `Agent "${a.agent_name}" has elevated error count: ${a.error_count} errors in ${a.run_count} runs`,
      detected_at: a.last_run_at || a.updated_at,
      factors: { agent_type: a.agent_type, error_count: a.error_count, run_count: a.run_count },
    }));

    return [...agentAnomalies, ...orchAnomalies, ...warnAnomalies].slice(0, 20);
  },

  async getForecasts() {
    const execWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "ai_agent_activity_logs" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    const processWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "system_processes" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    return {
      leads_30d: buildForecast(execWeeks),
      enrollments_30d: buildForecast(processWeeks),
    };
  },

  async getRiskEntities() {
    const errorAgents = await AiAgent.findAll({
      where: { error_count: { [Op.gt]: 0 } },
      order: [['error_count', 'DESC']],
      limit: 20,
    });
    return errorAgents.map((a) => ({
      entity: a.agent_name,
      entity_type: 'agent',
      risk_score: Math.min(100, Math.round((a.error_count / Math.max(a.run_count, 1)) * 100 + 20)),
      factors: {
        error_count: a.error_count,
        run_count: a.run_count,
        status: a.status,
      },
      last_activity: a.last_run_at,
    }));
  },
};

// ─── Strategy: Global (default) ───────────────────────────────────────────────

const globalStrategy: EntityStrategy = {
  async getKPIs() {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Risk Level
    const healthRecords = await CampaignHealth.findAll();
    const avgHealth = healthRecords.length > 0
      ? healthRecords.reduce((s, h) => s + h.health_score, 0) / healthRecords.length
      : 100;
    const riskScore = Math.round(100 - avgHealth);

    const thisWeekHealth = healthRecords.filter((h) => h.last_scan_at && new Date(h.last_scan_at) >= oneWeekAgo);
    const lastWeekHealth = healthRecords.filter(
      (h) => h.last_scan_at && new Date(h.last_scan_at) >= twoWeeksAgo && new Date(h.last_scan_at) < oneWeekAgo,
    );
    const thisWeekAvg = thisWeekHealth.length > 0
      ? thisWeekHealth.reduce((s, h) => s + h.health_score, 0) / thisWeekHealth.length
      : avgHealth;
    const lastWeekAvg = lastWeekHealth.length > 0
      ? lastWeekHealth.reduce((s, h) => s + h.health_score, 0) / lastWeekHealth.length
      : avgHealth;
    const riskDelta = Math.round((100 - thisWeekAvg) - (100 - lastWeekAvg));

    // Active Alerts
    const unresolvedErrors = await CampaignError.count({ where: { resolved: false } });
    const latestOrchHealth = await OrchestrationHealth.findOne({ order: [['scan_timestamp', 'DESC']] });
    let orchAlertCount = 0;
    if (latestOrchHealth?.findings && Array.isArray(latestOrchHealth.findings)) {
      orchAlertCount = (latestOrchHealth.findings as any[]).filter(
        (f: any) => f.severity === 'critical' || f.severity === 'error',
      ).length;
    }
    const activeAlertsCount = unresolvedErrors + orchAlertCount;

    // Lead Trend
    const leadsThisWeek = await Lead.count({ where: { created_at: { [Op.gte]: oneWeekAgo } } });
    const leadsLastWeek = await Lead.count({
      where: { created_at: { [Op.gte]: twoWeeksAgo, [Op.lt]: oneWeekAgo } },
    });
    const totalLeads = await Lead.count();
    const leadDelta = pctDelta(leadsThisWeek, leadsLastWeek);

    // System Health
    const orchScore = latestOrchHealth?.health_score ?? 100;
    const agents = await AiAgent.findAll();
    const agentErrorRate = agents.length > 0
      ? agents.filter((a) => a.status === 'error').length / agents.length
      : 0;
    const systemHealthScore = Math.round(orchScore * 0.5 + avgHealth * 0.3 + (100 - agentErrorRate * 100) * 0.2);

    // Agent Health
    const agentHealth = {
      running: agents.filter((a) => a.status === 'running').length,
      errored: agents.filter((a) => a.status === 'error').length,
      total: agents.length,
      idle: agents.filter((a) => a.status === 'idle').length,
      paused: agents.filter((a) => a.status === 'paused').length,
    };

    // Process Activity
    const processCount24h = await SystemProcess.count({ where: { created_at: { [Op.gte]: oneDayAgo } } });
    const processCountPrev24h = await SystemProcess.count({
      where: { created_at: { [Op.gte]: twoDaysAgo, [Op.lt]: oneDayAgo } },
    });
    const processDelta = pctDelta(processCount24h, processCountPrev24h);

    return {
      risk_level: { score: riskScore, label: riskLabel(riskScore), delta: riskDelta },
      active_alerts: { count: activeAlertsCount, delta: 0 },
      lead_trend: { value: `${leadsThisWeek}`, delta: leadDelta, total: totalLeads },
      system_health: { score: systemHealthScore, label: healthLabel(systemHealthScore) },
      agent_health: agentHealth,
      process_activity: { count_24h: processCount24h, delta: processDelta },
    };
  },

  async getAnomalies() {
    const severityOrder: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };

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
      factors: { component: e.component, severity: e.severity },
    }));

    const erroredAgents = await AiAgent.findAll({ where: { status: 'error' } });
    const agentAnomalies = erroredAgents.map((a) => ({
      id: `ag-${a.id}`,
      entity: a.agent_name,
      entity_type: 'agent',
      metric: 'status',
      severity: 'error' as string,
      description: `Agent "${a.agent_name}" is in error state (${a.error_count} errors, ${a.run_count} runs)`,
      detected_at: a.last_run_at || a.updated_at,
      factors: { agent_type: a.agent_type, error_count: a.error_count },
    }));

    const latestOrch = await OrchestrationHealth.findOne({ order: [['scan_timestamp', 'DESC']] });
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
            factors: { category: f.category, count: f.count || 1 },
          });
        });
    }

    const all = [...errorAnomalies, ...agentAnomalies, ...orchAnomalies];
    all.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
    return all.slice(0, 20);
  },

  async getForecasts() {
    const leadWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "leads" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    const enrollWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "enrollments" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    return {
      leads_30d: buildForecast(leadWeeks),
      enrollments_30d: buildForecast(enrollWeeks),
    };
  },

  async getRiskEntities() {
    const unhealthyCampaigns = await CampaignHealth.findAll({
      where: { health_score: { [Op.lt]: 70 } },
      order: [['health_score', 'ASC']],
    });
    const campaignRisks = unhealthyCampaigns.map((c) => ({
      entity: `Campaign ${c.campaign_id}`,
      entity_type: 'campaign',
      risk_score: 100 - c.health_score,
      factors: { health_score: c.health_score, status: c.status, errors: c.error_count },
      last_activity: c.last_scan_at,
    }));

    const stalledOpps = await OpportunityScore.findAll({
      where: { stall_risk: { [Op.in]: ['high', 'medium'] } },
      order: [['score', 'ASC']],
      limit: 10,
    });
    const oppRisks = stalledOpps.map((o) => ({
      entity: `Lead ${o.lead_id}`,
      entity_type: 'opportunity',
      risk_score: o.stall_risk === 'high' ? 85 : 60,
      factors: { stall_risk: o.stall_risk, stall_reason: o.stall_reason || '', conversion_probability: o.conversion_probability },
      last_activity: o.updated_at || null,
    }));

    const errorAgents = await AiAgent.findAll({
      where: { error_count: { [Op.gt]: 5 } },
      order: [['error_count', 'DESC']],
    });
    const agentRisks = errorAgents.map((a) => ({
      entity: a.agent_name,
      entity_type: 'agent',
      risk_score: Math.min(100, Math.round((a.error_count / Math.max(a.run_count, 1)) * 100 + 20)),
      factors: { error_count: a.error_count, run_count: a.run_count, status: a.status },
      last_activity: a.last_run_at,
    }));

    const all = [...campaignRisks, ...oppRisks, ...agentRisks];
    all.sort((a, b) => b.risk_score - a.risk_score);
    return all.slice(0, 20);
  },
};

// ─── Strategy: Visitors ──────────────────────────────────────────────────────

const visitorStrategy: EntityStrategy = {
  async getKPIs() {
    const totalVisitors = await safeCount('SELECT COUNT(*) as count FROM "visitors"');
    const totalSessions = await safeCount('SELECT COUNT(*) as count FROM "visitor_sessions"');
    const totalPageviews = await safeCount(
      'SELECT COALESCE(SUM(total_pageviews), 0) as count FROM "visitors"',
    );

    // Visitors this week vs last week
    const visitorsThisWeek = await safeCount(
      `SELECT COUNT(*) as count FROM "visitors" WHERE created_at >= NOW() - INTERVAL '7 days'`,
    );
    const visitorsLastWeek = await safeCount(
      `SELECT COUNT(*) as count FROM "visitors" WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days'`,
    );
    const visitorDelta = pctDelta(visitorsThisWeek, visitorsLastWeek);

    // Bounce rate
    const bouncedSessions = await safeCount(
      `SELECT COUNT(*) as count FROM "visitor_sessions" WHERE is_bounce = true`,
    );
    const bounceRate = totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 100) : 0;

    // Conversion: visitors with a lead_id
    const convertedVisitors = await safeCount(
      'SELECT COUNT(*) as count FROM "visitors" WHERE lead_id IS NOT NULL',
    );
    const conversionRate = totalVisitors > 0 ? Math.round((convertedVisitors / totalVisitors) * 100) : 0;

    // Device distribution
    const mobileCount = await safeCount(
      `SELECT COUNT(*) as count FROM "visitors" WHERE device_type = 'mobile'`,
    );

    // Avg session duration
    const avgDuration = await safeQuery<{ avg: string }>(
      `SELECT AVG(duration_seconds) as avg FROM "visitor_sessions" WHERE duration_seconds > 0`,
    );
    const avgDurationSec = Math.round(Number(avgDuration[0]?.avg ?? 0));

    return {
      risk_level: { score: bounceRate, label: `${bounceRate}% bounce`, delta: 0 },
      active_alerts: { count: bouncedSessions, delta: 0 },
      lead_trend: { value: `${visitorsThisWeek}`, delta: visitorDelta, total: totalVisitors },
      system_health: { score: conversionRate, label: `${conversionRate}% conversion` },
      agent_health: { running: totalSessions, errored: bouncedSessions, total: totalVisitors, idle: 0, paused: 0 },
      process_activity: { count_24h: totalPageviews, delta: 0 },
    };
  },

  async getAnomalies() {
    // High bounce rate sources
    const bouncySources = await safeQuery<{ utm_source: string; sessions: string; bounces: string; rate: string }>(
      `SELECT COALESCE(v.utm_source, 'direct') as utm_source,
              COUNT(vs.id) as sessions,
              COUNT(CASE WHEN vs.is_bounce THEN 1 END) as bounces,
              ROUND(COUNT(CASE WHEN vs.is_bounce THEN 1 END)::numeric / NULLIF(COUNT(vs.id), 0) * 100) as rate
       FROM "visitor_sessions" vs
       JOIN "visitors" v ON v.id = vs.visitor_id
       GROUP BY v.utm_source
       HAVING COUNT(vs.id) >= 2 AND COUNT(CASE WHEN vs.is_bounce THEN 1 END)::numeric / NULLIF(COUNT(vs.id), 0) > 0.6
       ORDER BY rate DESC
       LIMIT 10`,
    );

    const anomalies = bouncySources.map((s, i) => ({
      id: `vis-bounce-${i}`,
      entity: `Source: ${s.utm_source}`,
      entity_type: 'visitor',
      metric: 'bounce_rate',
      severity: Number(s.rate) > 80 ? 'error' : 'warning',
      description: `${s.utm_source} has ${s.rate}% bounce rate (${s.bounces}/${s.sessions} sessions)`,
      detected_at: new Date(),
      factors: { bounce_rate: Number(s.rate), sessions: Number(s.sessions) },
    }));

    // Visitors without conversion
    const unconverted = await safeCount(
      'SELECT COUNT(*) as count FROM "visitors" WHERE lead_id IS NULL AND total_sessions >= 2',
    );
    if (unconverted > 0) {
      anomalies.push({
        id: 'vis-unconverted',
        entity: 'Returning Visitors',
        entity_type: 'visitor',
        metric: 'conversion',
        severity: unconverted > 10 ? 'warning' : 'info',
        description: `${unconverted} returning visitors have not converted to leads`,
        detected_at: new Date(),
        factors: { bounce_rate: 0, sessions: unconverted },
      });
    }

    return anomalies;
  },

  async getForecasts() {
    const visitorWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "visitors" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    const sessionWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "visitor_sessions" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    return {
      leads_30d: buildForecast(visitorWeeks),
      enrollments_30d: buildForecast(sessionWeeks),
    };
  },

  async getRiskEntities() {
    // Low-engagement visitors (many sessions, no conversion)
    const lowEngagement = await safeQuery<{ id: string; total_sessions: string; total_pageviews: string; utm_source: string }>(
      `SELECT id, total_sessions, total_pageviews, COALESCE(utm_source, 'direct') as utm_source
       FROM "visitors"
       WHERE lead_id IS NULL AND total_sessions >= 2
       ORDER BY total_sessions DESC
       LIMIT 20`,
    );

    return lowEngagement.map((v) => ({
      entity: `Visitor ${v.id.slice(0, 8)}... (${v.utm_source})`,
      entity_type: 'visitor',
      risk_score: Math.min(90, Number(v.total_sessions) * 20),
      factors: {
        sessions: Number(v.total_sessions),
        pageviews: Number(v.total_pageviews),
        source: v.utm_source,
        converted: false,
      },
      last_activity: null,
    }));
  },
};

// ─── Strategy: Cohorts ──────────────────────────────────────────────────────

const cohortStrategy: EntityStrategy = {
  async getKPIs() {
    const totalCohorts = await safeCount('SELECT COUNT(*) as count FROM "cohorts"');
    const totalEnrollments = await safeCount('SELECT COUNT(*) as count FROM "enrollments"');
    const activeEnrollments = await safeCount(
      `SELECT COUNT(*) as count FROM "enrollments" WHERE status = 'active'`,
    );

    // Completion stats
    const completedLessons = await safeCount(
      `SELECT COUNT(*) as count FROM "lesson_instances" WHERE status = 'completed'`,
    );
    const totalLessons = await safeCount('SELECT COUNT(*) as count FROM "lesson_instances"');
    const completionRate = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    return {
      risk_level: { score: totalCohorts === 0 ? 50 : 10, label: riskLabel(totalCohorts === 0 ? 50 : 10), delta: 0 },
      active_alerts: { count: 0, delta: 0 },
      lead_trend: { value: `${totalEnrollments}`, delta: 0, total: totalCohorts },
      system_health: { score: completionRate, label: `${completionRate}% completion` },
      agent_health: { running: activeEnrollments, errored: 0, total: totalEnrollments, idle: 0, paused: 0 },
      process_activity: { count_24h: completedLessons, delta: 0 },
    };
  },

  async getAnomalies() {
    return [];
  },

  async getForecasts() {
    const enrollWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "enrollments" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );
    return { leads_30d: buildForecast(enrollWeeks), enrollments_30d: buildForecast([]) };
  },

  async getRiskEntities() {
    return [];
  },
};

// ─── Strategy: Curriculum ────────────────────────────────────────────────────

const curriculumStrategy: EntityStrategy = {
  async getKPIs() {
    const totalModules = await safeCount('SELECT COUNT(*) as count FROM "curriculum_modules"');
    const totalLessons = await safeCount('SELECT COUNT(*) as count FROM "curriculum_lessons"');
    const totalSections = await safeCount('SELECT COUNT(*) as count FROM "mini_sections"');

    // Lesson completion
    const completedInstances = await safeCount(
      `SELECT COUNT(*) as count FROM "lesson_instances" WHERE status = 'completed'`,
    );
    const totalInstances = await safeCount('SELECT COUNT(*) as count FROM "lesson_instances"');
    const completionRate = totalInstances > 0 ? Math.round((completedInstances / totalInstances) * 100) : 0;

    // Content coverage
    const publishedSections = await safeCount(
      `SELECT COUNT(*) as count FROM "mini_sections" WHERE status = 'published' OR status = 'generated'`,
    );
    const coverageRate = totalSections > 0 ? Math.round((publishedSections / totalSections) * 100) : 0;

    return {
      risk_level: { score: 100 - coverageRate, label: `${coverageRate}% published`, delta: 0 },
      active_alerts: { count: totalSections - publishedSections, delta: 0 },
      lead_trend: { value: `${totalLessons}`, delta: 0, total: totalModules },
      system_health: { score: completionRate, label: `${completionRate}% completion` },
      agent_health: { running: publishedSections, errored: 0, total: totalSections, idle: 0, paused: 0 },
      process_activity: { count_24h: totalInstances, delta: 0 },
    };
  },

  async getAnomalies() {
    // Unpublished sections
    const unpublished = await safeQuery<{ id: string; title: string; status: string }>(
      `SELECT id, title, status FROM "mini_sections"
       WHERE status NOT IN ('published', 'generated')
       ORDER BY created_at DESC LIMIT 20`,
    );
    return unpublished.map((s, i) => ({
      id: `curr-${s.id}-${i}`,
      entity: s.title || `Section ${s.id.slice(0, 8)}`,
      entity_type: 'curriculum',
      metric: 'status',
      severity: 'warning' as string,
      description: `Section "${s.title || s.id.slice(0, 8)}" is ${s.status} (not published)`,
      detected_at: new Date(),
      factors: { status: s.status },
    }));
  },

  async getForecasts() {
    const sectionWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "mini_sections" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );
    return { leads_30d: buildForecast(sectionWeeks), enrollments_30d: buildForecast([]) };
  },

  async getRiskEntities() {
    return [];
  },
};

// ─── Strategy: System ────────────────────────────────────────────────────────

const systemStrategy: EntityStrategy = {
  async getKPIs() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const processCount24h = await SystemProcess.count({ where: { created_at: { [Op.gte]: oneDayAgo } } });
    const processCountPrev = await SystemProcess.count({
      where: { created_at: { [Op.gte]: twoDaysAgo, [Op.lt]: oneDayAgo } },
    });
    const processDelta = pctDelta(processCount24h, processCountPrev);

    const errorProcesses = await safeCount(
      `SELECT COUNT(*) as count FROM "system_processes" WHERE status = 'error' AND created_at >= NOW() - INTERVAL '24 hours'`,
    );

    const totalEmails = await safeCount('SELECT COUNT(*) as count FROM "scheduled_emails"');
    const pendingEmails = await safeCount(
      `SELECT COUNT(*) as count FROM "scheduled_emails" WHERE status = 'pending'`,
    );
    const sentEmails = await safeCount(
      `SELECT COUNT(*) as count FROM "scheduled_emails" WHERE status = 'sent'`,
    );
    const deliveryRate = totalEmails > 0 ? Math.round((sentEmails / totalEmails) * 100) : 0;

    const totalComms = await safeCount(
      `SELECT COUNT(*) as count FROM "communication_logs" WHERE created_at >= NOW() - INTERVAL '24 hours'`,
    );

    return {
      risk_level: { score: errorProcesses > 10 ? 70 : errorProcesses > 0 ? 30 : 5, label: riskLabel(errorProcesses > 10 ? 70 : 30), delta: 0 },
      active_alerts: { count: errorProcesses, delta: 0 },
      lead_trend: { value: `${processCount24h}`, delta: processDelta, total: await SystemProcess.count() },
      system_health: { score: deliveryRate, label: `${deliveryRate}% email delivery` },
      agent_health: { running: sentEmails, errored: pendingEmails, total: totalEmails, idle: 0, paused: 0 },
      process_activity: { count_24h: processCount24h + totalComms, delta: processDelta },
    };
  },

  async getAnomalies() {
    const errorProcesses = await safeQuery<{ id: string; process_name: string; error_message: string; created_at: string }>(
      `SELECT id, process_name, error_message, created_at FROM "system_processes"
       WHERE status = 'error' AND created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC LIMIT 20`,
    );
    return errorProcesses.map((p, i) => ({
      id: `sys-${p.id}-${i}`,
      entity: p.process_name,
      entity_type: 'system',
      metric: 'process_error',
      severity: 'error' as string,
      description: p.error_message || `Process "${p.process_name}" failed`,
      detected_at: p.created_at,
      factors: { process_name: p.process_name },
    }));
  },

  async getForecasts() {
    const processWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "system_processes" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    const emailWeeks = await safeQuery<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
       FROM "scheduled_emails" WHERE created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`,
    );

    return {
      leads_30d: buildForecast(processWeeks),
      enrollments_30d: buildForecast(emailWeeks),
    };
  },

  async getRiskEntities() {
    // Processes with high error rates by module
    const errorModules = await safeQuery<{ source_module: string; errors: string; total: string }>(
      `SELECT source_module, COUNT(CASE WHEN status = 'error' THEN 1 END) as errors, COUNT(*) as total
       FROM "system_processes"
       WHERE created_at >= NOW() - INTERVAL '7 days' AND source_module IS NOT NULL
       GROUP BY source_module
       HAVING COUNT(CASE WHEN status = 'error' THEN 1 END) > 0
       ORDER BY errors DESC
       LIMIT 20`,
    );
    return errorModules.map((m) => ({
      entity: m.source_module,
      entity_type: 'system',
      risk_score: Math.min(100, Math.round((Number(m.errors) / Math.max(Number(m.total), 1)) * 100)),
      factors: { errors: Number(m.errors), total: Number(m.total) },
      last_activity: null,
    }));
  },
};

// ─── Department → Entity Mapping ──────────────────────────────────────────────
// Maps organizational departments to their closest Business Map entity type
// so department drill-downs show relevant KPIs instead of global data.

const DEPT_ENTITY_MAP: Record<string, string> = {
  intelligence: 'system',
  operations: 'system',
  orchestration: 'agents',
  infrastructure: 'system',
  platform: 'system',
  security: 'system',
  growth: 'leads',
  marketing: 'campaigns',
  admissions: 'leads',
  education: 'curriculum',
  student_success: 'students',
  alumni: 'students',
  // These departments are cross-cutting — use global strategy
  // executive, governance, finance, strategy, partnerships, reporting
};

// ─── Strategy Router ──────────────────────────────────────────────────────────

function resolveEntityStrategy(entityType?: string, entityName?: string): EntityStrategy {
  // Department drill-down: map to closest entity type
  if (entityType === 'department' && entityName) {
    const slug = entityName.toLowerCase().replace(/\s+/g, '_');
    const mapped = DEPT_ENTITY_MAP[slug];
    if (mapped) return resolveEntityStrategy(mapped);
    return globalStrategy;
  }

  switch (entityType) {
    case 'campaigns': return campaignStrategy;
    case 'leads': return leadStrategy;
    case 'students': return studentStrategy;
    case 'agents': return agentStrategy;
    case 'visitors': return visitorStrategy;
    case 'cohorts': return cohortStrategy;
    case 'curriculum': return curriculumStrategy;
    case 'system': return systemStrategy;
    default: return globalStrategy;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getIntelligenceKPIs(entityType?: string, entityName?: string) {
  const strategy = resolveEntityStrategy(entityType, entityName);
  return strategy.getKPIs();
}

export async function getAnomalies(entityType?: string, entityName?: string) {
  const strategy = resolveEntityStrategy(entityType, entityName);
  return strategy.getAnomalies();
}

export async function getForecasts(entityType?: string, entityName?: string) {
  const strategy = resolveEntityStrategy(entityType, entityName);
  return strategy.getForecasts();
}

export async function getRiskEntities(entityType?: string, entityName?: string) {
  const strategy = resolveEntityStrategy(entityType, entityName);
  return strategy.getRiskEntities();
}
