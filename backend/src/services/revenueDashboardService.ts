import { Op, fn, col, literal } from 'sequelize';
import { Lead, Activity, Appointment } from '../models';
import { sequelize } from '../config/database';

const PIPELINE_STAGES = [
  'new_lead', 'contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'enrolled', 'lost',
];

const PRICE_PER_ENROLLMENT = 4500;

export async function getRevenueDashboard() {
  // Pipeline counts
  const pipelineCounts: Record<string, number> = {};
  for (const stage of PIPELINE_STAGES) {
    pipelineCounts[stage] = await Lead.count({ where: { pipeline_stage: stage } });
  }

  // Funnel conversions (stage-to-stage)
  const totalActive = PIPELINE_STAGES
    .filter((s) => s !== 'lost')
    .reduce((sum, s) => sum + (pipelineCounts[s] || 0), 0);

  const funnelConversions = [];
  for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
    const from = PIPELINE_STAGES[i];
    const to = PIPELINE_STAGES[i + 1];
    if (from === 'lost') continue;
    const fromCount = pipelineCounts[from] || 0;
    // Count leads that made it past this stage
    const pastThisStage = PIPELINE_STAGES.slice(i + 1)
      .filter((s) => s !== 'lost')
      .reduce((sum, s) => sum + (pipelineCounts[s] || 0), 0);
    const rate = fromCount + pastThisStage > 0
      ? ((pastThisStage / (fromCount + pastThisStage)) * 100).toFixed(1)
      : '0.0';
    funnelConversions.push({ from, to, rate: parseFloat(rate) });
  }

  // Lead velocity — leads per week over last 12 weeks
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const weeklyLeads = await Lead.findAll({
    attributes: [
      [fn('to_char', col('created_at'), 'IYYY-"W"IW'), 'week'],
      [fn('COUNT', col('id')), 'count'],
    ],
    where: {
      created_at: { [Op.gte]: twelveWeeksAgo },
    },
    group: [fn('to_char', col('created_at'), 'IYYY-"W"IW')],
    order: [[fn('to_char', col('created_at'), 'IYYY-"W"IW'), 'ASC']],
    raw: true,
  }) as any[];

  const leadVelocity = weeklyLeads.map((w: any) => ({
    week: w.week,
    count: parseInt(w.count, 10),
  }));

  // Conversion by source
  const sources = await Lead.findAll({
    attributes: [
      'form_type',
      [fn('COUNT', col('id')), 'total'],
      [fn('SUM', literal(`CASE WHEN pipeline_stage = 'enrolled' THEN 1 ELSE 0 END`)), 'enrolled'],
    ],
    group: ['form_type'],
    raw: true,
  }) as any[];

  const conversionBySource = sources
    .filter((s: any) => s.form_type)
    .map((s: any) => ({
      source: s.form_type,
      total: parseInt(s.total, 10),
      enrolled: parseInt(s.enrolled, 10),
      rate: parseInt(s.total, 10) > 0
        ? parseFloat(((parseInt(s.enrolled, 10) / parseInt(s.total, 10)) * 100).toFixed(1))
        : 0,
    }));

  // Revenue forecast
  const qualifiedLeads = (pipelineCounts['meeting_scheduled'] || 0)
    + (pipelineCounts['proposal_sent'] || 0)
    + (pipelineCounts['negotiation'] || 0);
  const historicalRate = totalActive > 0
    ? (pipelineCounts['enrolled'] || 0) / totalActive
    : 0.1; // default 10%
  const projectedEnrollments = Math.round(qualifiedLeads * Math.max(historicalRate, 0.1));
  const projectedRevenue = projectedEnrollments * PRICE_PER_ENROLLMENT;
  const actualRevenue = (pipelineCounts['enrolled'] || 0) * PRICE_PER_ENROLLMENT;

  // Upcoming appointments (next 7 days)
  const now = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const upcomingAppointments = await Appointment.findAll({
    where: {
      scheduled_at: { [Op.gte]: now, [Op.lte]: nextWeek },
      status: 'scheduled',
    },
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'name', 'company'] }],
    order: [['scheduled_at', 'ASC']],
    limit: 10,
  });

  // Recent activities
  const recentActivities = await Activity.findAll({
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'name'] }],
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  return {
    pipelineCounts,
    funnelConversions,
    leadVelocity,
    conversionBySource,
    revenueForecast: {
      actualRevenue,
      projectedEnrollments,
      projectedRevenue,
      pipelineValue: qualifiedLeads * PRICE_PER_ENROLLMENT,
      enrolled: pipelineCounts['enrolled'] || 0,
      qualifiedLeads,
    },
    upcomingAppointments,
    recentActivities,
  };
}
