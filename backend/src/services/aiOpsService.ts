import { Op, fn, col } from 'sequelize';
import AiAgent from '../models/AiAgent';
import AiAgentActivityLog from '../models/AiAgentActivityLog';
import CampaignHealth from '../models/CampaignHealth';
import CampaignError from '../models/CampaignError';
import AiSystemEvent from '../models/AiSystemEvent';
import { Campaign, ScheduledEmail } from '../models';
import { calculateNextRun, formatNextRun } from '../utils/cronNextRun';

// --- Overview (enhanced) ---

export async function getOverview() {
  const agents = await AiAgent.findAll();
  const running = agents.filter((a) => a.status === 'running').length;
  const idle = agents.filter((a) => a.status === 'idle' && a.enabled).length;
  const paused = agents.filter((a) => a.status === 'paused').length;
  const disabled = agents.filter((a) => !a.enabled).length;
  const errored = agents.filter((a) => a.status === 'error').length;

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
  const repairsToday = await AiAgentActivityLog.count({
    where: {
      created_at: { [Op.gte]: todayStart },
      action: { [Op.iLike]: '%repair%' },
      result: 'success',
    },
  });
  const campaignsScanned = healthRecords.filter(
    (h) => h.last_scan_at && new Date(h.last_scan_at) >= todayStart,
  ).length;

  return {
    active_agents: running,
    total_agents: agents.length,
    running,
    idle,
    paused,
    disabled,
    errored,
    avg_health_score: avgHealth,
    unresolved_errors: unresolvedErrors,
    actions_today: actionsToday,
    repairs_today: repairsToday,
    campaigns_scanned: campaignsScanned,
    agents_summary: agents.map((a) => ({
      id: a.id,
      name: a.agent_name,
      type: a.agent_type,
      status: a.status,
      category: a.category,
      enabled: a.enabled,
      last_run_at: a.last_run_at,
      run_count: a.run_count,
      error_count: a.error_count,
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

// --- Agent Registry ---

export async function getAgentRegistry(params?: { category?: string; status?: string; enabled?: string }) {
  const where: Record<string, any> = {};
  if (params?.category) where.category = params.category;
  if (params?.status) where.status = params.status;
  if (params?.enabled !== undefined) where.enabled = params.enabled === 'true';

  const agents = await AiAgent.findAll({ where, order: [['category', 'ASC'], ['agent_name', 'ASC']] });

  return agents.map((a) => {
    const plain = a.toJSON() as Record<string, any>;
    if (a.schedule) {
      plain.next_run_at = calculateNextRun(a.schedule);
      plain.next_run_label = formatNextRun(a.schedule);
    }
    return plain;
  });
}

export async function getAgentDetail(agentId: string) {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new Error('Agent not found');

  const recentActivity = await AiAgentActivityLog.findAll({
    where: { agent_id: agentId },
    order: [['created_at', 'DESC']],
    limit: 20,
    include: [{ model: Campaign, as: 'campaign', attributes: ['name', 'status'] }],
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const actionsToday = await AiAgentActivityLog.count({
    where: { agent_id: agentId, created_at: { [Op.gte]: todayStart } },
  });
  const errorsToday = await AiAgentActivityLog.count({
    where: { agent_id: agentId, result: 'failed', created_at: { [Op.gte]: todayStart } },
  });

  const agentPlain = agent.toJSON() as Record<string, any>;
  if (agent.schedule) {
    agentPlain.next_run_at = calculateNextRun(agent.schedule);
    agentPlain.next_run_label = formatNextRun(agent.schedule);
  }

  return {
    agent: agentPlain,
    recent_activity: recentActivity,
    actions_today: actionsToday,
    errors_today: errorsToday,
  };
}

export async function controlAgent(agentId: string, action: string) {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new Error('Agent not found');

  switch (action) {
    case 'pause':
      await agent.update({ status: 'paused', updated_at: new Date() });
      break;
    case 'resume':
      await agent.update({ status: 'idle', updated_at: new Date() });
      break;
    case 'enable':
      await agent.update({ enabled: true, updated_at: new Date() });
      break;
    case 'disable':
      await agent.update({ enabled: false, updated_at: new Date() });
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }

  return agent;
}

// --- Execution Trace ---

export async function getExecutionTrace(traceId: string) {
  const items = await AiAgentActivityLog.findAll({
    where: { trace_id: traceId },
    order: [['created_at', 'ASC']],
    include: [
      { model: AiAgent, as: 'agent', attributes: ['agent_name', 'agent_type', 'category'] },
      { model: Campaign, as: 'campaign', attributes: ['name', 'status'] },
    ],
  });

  return { trace_id: traceId, steps: items, total: items.length };
}

// --- Activity Detail ---

export async function getActivityDetail(activityId: string) {
  const activity = await AiAgentActivityLog.findByPk(activityId, {
    include: [
      { model: AiAgent, as: 'agent', attributes: ['agent_name', 'agent_type', 'category', 'description'] },
      { model: Campaign, as: 'campaign', attributes: ['name', 'status', 'type'] },
    ],
  });
  if (!activity) throw new Error('Activity not found');
  return activity;
}

// --- Error Detail ---

export async function getErrorDetail(errorId: string) {
  const error = await CampaignError.findByPk(errorId, {
    include: [
      { model: Campaign, as: 'campaign', attributes: ['name', 'status', 'type'] },
      {
        model: AiAgentActivityLog,
        as: 'repairAttempt',
        attributes: ['id', 'agent_id', 'action', 'result', 'reason', 'created_at', 'trace_id'],
        include: [{ model: AiAgent, as: 'agent', attributes: ['agent_name'] }],
      },
    ],
  });
  if (!error) throw new Error('Error not found');

  // Get retry history (other errors for same campaign + component)
  const retryHistory = await CampaignError.findAll({
    where: {
      campaign_id: error.campaign_id,
      component: error.component,
      id: { [Op.ne]: error.id },
    },
    order: [['created_at', 'DESC']],
    limit: 10,
    attributes: ['id', 'severity', 'error_message', 'resolved', 'resolved_by', 'retry_count', 'created_at'],
  });

  return { error, retry_history: retryHistory };
}

// --- Campaign Timeline ---

export async function getCampaignTimeline(campaignId: string) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  // Get activity logs for this campaign
  const activities = await AiAgentActivityLog.findAll({
    where: { campaign_id: campaignId },
    order: [['created_at', 'DESC']],
    limit: 50,
    include: [{ model: AiAgent, as: 'agent', attributes: ['agent_name', 'agent_type'] }],
  });

  // Get errors for this campaign
  const errors = await CampaignError.findAll({
    where: { campaign_id: campaignId },
    order: [['created_at', 'DESC']],
    limit: 50,
  });

  // Get system events for this campaign
  const events = await AiSystemEvent.findAll({
    where: { entity_type: 'campaign', entity_id: campaignId },
    order: [['created_at', 'DESC']],
    limit: 50,
  });

  // Merge and sort chronologically
  type TimelineEntry = {
    type: 'activity' | 'error' | 'event';
    timestamp: Date;
    data: any;
  };

  const timeline: TimelineEntry[] = [
    ...activities.map((a) => ({
      type: 'activity' as const,
      timestamp: a.created_at,
      data: a,
    })),
    ...errors.map((e) => ({
      type: 'error' as const,
      timestamp: e.created_at,
      data: e,
    })),
    ...events.map((e) => ({
      type: 'event' as const,
      timestamp: e.created_at,
      data: e,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { campaign_id: campaignId, campaign_name: campaign.name, timeline: timeline.slice(0, 100) };
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

// --- Agent Discovery & Health Scores ---

export async function scanAndDiscoverAgents() {
  const countBefore = await AiAgent.count();
  const { seedAgentRegistry } = await import('./agentRegistrySeed');

  await seedAgentRegistry();

  const totalRegistered = await AiAgent.count();

  return {
    synced: true,
    total_registered: totalRegistered,
    new_agents: Math.max(0, totalRegistered - countBefore),
  };
}

export async function getAgentHealthScores() {
  const agents = await AiAgent.findAll();

  return agents.map((a) => {
    const errorRate = a.run_count > 0 ? a.error_count / a.run_count : 0;
    const healthScore = Math.max(
      0,
      Math.round(100 - (a.error_count / Math.max(a.run_count, 1)) * 200 - (a.status === 'error' ? 30 : 0)),
    );

    return {
      agent_id: a.id,
      agent_name: a.agent_name,
      health_score: healthScore,
      status: a.status,
      error_rate: Math.round(errorRate * 100) / 100,
      category: a.category,
    };
  });
}
