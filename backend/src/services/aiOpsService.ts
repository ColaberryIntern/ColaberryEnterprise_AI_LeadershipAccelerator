import { Op, fn, col } from 'sequelize';
import AiAgent from '../models/AiAgent';
import AiAgentActivityLog from '../models/AiAgentActivityLog';
import CampaignHealth from '../models/CampaignHealth';
import CampaignError from '../models/CampaignError';
import AiSystemEvent from '../models/AiSystemEvent';
import { Campaign, ScheduledEmail } from '../models';

// --- Overview ---

export async function getOverview() {
  const agents = await AiAgent.findAll();
  const activeAgents = agents.filter((a) => a.status === 'running').length;

  const healthRecords = await CampaignHealth.findAll();
  const avgHealth =
    healthRecords.length > 0
      ? Math.round(healthRecords.reduce((sum, h) => sum + h.health_score, 0) / healthRecords.length)
      : 100;

  const unresolvedErrors = await CampaignError.count({ where: { resolved: false } });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const actionsToday = await AiAgentActivityLog.count({
    where: { created_at: { [Op.gte]: todayStart } },
  });

  return {
    active_agents: activeAgents,
    total_agents: agents.length,
    avg_health_score: avgHealth,
    unresolved_errors: unresolvedErrors,
    actions_today: actionsToday,
    agents_summary: agents.map((a) => ({
      id: a.id,
      name: a.agent_name,
      type: a.agent_type,
      status: a.status,
      last_run_at: a.last_run_at,
    })),
  };
}

// --- Agents ---

export async function getAgents() {
  return AiAgent.findAll({ order: [['agent_name', 'ASC']] });
}

export async function updateAgent(agentId: string, updates: Record<string, any>) {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new Error('Agent not found');
  await agent.update({ ...updates, updated_at: new Date() });
  return agent;
}

// --- Activity Log ---

export async function getActivityLog(params: {
  agent_id?: string;
  campaign_id?: string;
  action?: string;
  result?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const where: Record<string, any> = {};
  if (params.agent_id) where.agent_id = params.agent_id;
  if (params.campaign_id) where.campaign_id = params.campaign_id;
  if (params.action) where.action = { [Op.iLike]: `%${params.action}%` };
  if (params.result) where.result = params.result;
  if (params.from || params.to) {
    where.created_at = {};
    if (params.from) where.created_at[Op.gte] = new Date(params.from);
    if (params.to) where.created_at[Op.lte] = new Date(params.to);
  }

  const limit = Math.min(params.limit || 50, 100);
  const offset = ((params.page || 1) - 1) * limit;

  const { rows, count } = await AiAgentActivityLog.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
    include: [{ model: AiAgent, as: 'agent', attributes: ['agent_name', 'agent_type'] }],
  });

  return { items: rows, total: count, page: params.page || 1, limit };
}

// --- Campaign Health ---

export async function getHealthRecords() {
  return CampaignHealth.findAll({
    order: [['health_score', 'ASC']],
    include: [{ model: Campaign, as: 'campaign', attributes: ['name', 'status', 'type'] }],
  });
}

// --- Errors ---

export async function getErrors(params: {
  campaign_id?: string;
  component?: string;
  severity?: string;
  resolved?: string;
  page?: number;
  limit?: number;
}) {
  const where: Record<string, any> = {};
  if (params.campaign_id) where.campaign_id = params.campaign_id;
  if (params.component) where.component = params.component;
  if (params.severity) where.severity = params.severity;
  if (params.resolved !== undefined) where.resolved = params.resolved === 'true';

  const limit = Math.min(params.limit || 50, 100);
  const offset = ((params.page || 1) - 1) * limit;

  const { rows, count } = await CampaignError.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
    include: [{ model: Campaign, as: 'campaign', attributes: ['name', 'status'] }],
  });

  return { items: rows, total: count, page: params.page || 1, limit };
}

export async function resolveError(errorId: string) {
  const error = await CampaignError.findByPk(errorId);
  if (!error) throw new Error('Error not found');
  await error.update({ resolved: true, resolved_at: new Date(), resolved_by: 'admin' });
  return error;
}

// --- Events ---

export async function getEvents(params: {
  source?: string;
  event_type?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const where: Record<string, any> = {};
  if (params.source) where.source = params.source;
  if (params.event_type) where.event_type = { [Op.iLike]: `%${params.event_type}%` };
  if (params.from || params.to) {
    where.created_at = {};
    if (params.from) where.created_at[Op.gte] = new Date(params.from);
    if (params.to) where.created_at[Op.lte] = new Date(params.to);
  }

  const limit = Math.min(params.limit || 50, 100);
  const offset = ((params.page || 1) - 1) * limit;

  const { rows, count } = await AiSystemEvent.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  return { items: rows, total: count, page: params.page || 1, limit };
}

// --- Campaign Restart ---

export async function restartCampaignActions(campaignId: string) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const [updated] = await ScheduledEmail.update(
    { status: 'pending', scheduled_for: new Date(Date.now() + 5 * 60 * 1000) },
    {
      where: {
        campaign_id: campaignId,
        status: 'failed',
      },
    },
  );

  return { campaign_id: campaignId, requeued: updated };
}
