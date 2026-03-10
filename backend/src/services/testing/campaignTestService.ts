import { Op } from 'sequelize';
import { Campaign, CampaignTestRun, CampaignTestStep } from '../../models';

export async function getTestRuns(campaignId?: string) {
  const where: Record<string, any> = {};
  if (campaignId) where.campaign_id = campaignId;

  return CampaignTestRun.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: 50,
    include: [
      { model: Campaign, as: 'campaign', attributes: ['name', 'status', 'type'] },
    ],
  });
}

export async function getTestRunDetail(testRunId: string) {
  const run = await CampaignTestRun.findByPk(testRunId, {
    include: [
      { model: Campaign, as: 'campaign', attributes: ['name', 'status', 'type'] },
      { model: CampaignTestStep, as: 'steps', order: [['created_at', 'ASC']] },
    ],
  });
  if (!run) throw new Error('Test run not found');
  return run;
}

export interface QASummary {
  campaigns_tested_today: number;
  pass_rate: number;
  failures_today: number;
  avg_score: number;
  recent_runs: any[];
  campaigns_by_status: Record<string, number>;
}

export async function getQASummary(): Promise<QASummary> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayRuns = await CampaignTestRun.findAll({
    where: { created_at: { [Op.gte]: todayStart } },
    include: [{ model: Campaign, as: 'campaign', attributes: ['name', 'status', 'type'] }],
    order: [['created_at', 'DESC']],
  });

  const campaignsTested = new Set(todayRuns.map((r) => r.campaign_id)).size;
  const passed = todayRuns.filter((r) => r.status === 'passed').length;
  const failed = todayRuns.filter((r) => r.status === 'failed').length;
  const scores = todayRuns.filter((r) => r.score != null).map((r) => r.score!);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  // Get campaigns by QA status
  const campaigns = await Campaign.findAll({
    where: { status: 'active' },
    attributes: ['id', 'qa_status'],
  });
  const byStatus: Record<string, number> = {};
  for (const c of campaigns) {
    const qs = (c as any).qa_status || 'untested';
    byStatus[qs] = (byStatus[qs] || 0) + 1;
  }

  // Get recent runs (last 20 across all campaigns)
  const recentRuns = await CampaignTestRun.findAll({
    order: [['created_at', 'DESC']],
    limit: 20,
    include: [{ model: Campaign, as: 'campaign', attributes: ['name', 'status', 'type'] }],
  });

  return {
    campaigns_tested_today: campaignsTested,
    pass_rate: todayRuns.length > 0 ? Math.round((passed / todayRuns.length) * 100) : 0,
    failures_today: failed,
    avg_score: avgScore,
    recent_runs: recentRuns,
    campaigns_by_status: byStatus,
  };
}
