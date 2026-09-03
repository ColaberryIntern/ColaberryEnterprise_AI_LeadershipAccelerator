import AiAgent from '../models/AiAgent';
import OrgMember from '../models/OrgMember';
import AgentReportSubscription, {
  AgentReportContentSection,
  AgentReportCadence,
} from '../models/AgentReportSubscription';

// AI Workforce Management, Checkpoint D. Generic by construction — works
// off AiAgent.id, not hardcoded to any one agent. Report generation and
// delivery (AgentReportRun, the cron dispatch, sendRawEmail()) are a
// separate, later piece — this service only manages what was requested.

const DEFAULT_TIMEZONE = 'America/Chicago';

export class AgentNotFoundError extends Error {
  readonly error_class = 'AgentNotFoundError' as const;
  readonly status = 404;

  constructor(agentId: string) {
    super(`Agent "${agentId}" does not exist.`);
    this.name = 'AgentNotFoundError';
  }
}

export class ReportSubscriptionNotFoundError extends Error {
  readonly error_class = 'ReportSubscriptionNotFoundError' as const;
  readonly status = 404;

  constructor(id: string) {
    super(`Report subscription "${id}" does not exist.`);
    this.name = 'ReportSubscriptionNotFoundError';
  }
}

export interface AgentReportSubscriptionView {
  id: string;
  agentId: string;
  contentScope: AgentReportContentSection[];
  cadence: AgentReportCadence;
  deliveryHourLocal: number;
  timezone: string;
  channel: string;
  enabled: boolean;
  createdByEmail: string;
  createdAt: Date;
}

function toView(row: AgentReportSubscription): AgentReportSubscriptionView {
  return {
    id: row.id,
    agentId: row.agent_id,
    contentScope: row.content_scope,
    cadence: row.cadence,
    deliveryHourLocal: row.delivery_hour_local,
    timezone: row.timezone,
    channel: row.channel,
    enabled: row.enabled,
    createdByEmail: row.created_by_email,
    createdAt: row.createdAt,
  };
}

/**
 * A `super_admin` creator has no `OrgMember` row (the auth gate never
 * resolves one on that bypass path — see agentManagerAuthMiddleware.ts),
 * so an explicit input timezone is used first; otherwise the creator's own
 * real `OrgMember.timezone` is read; otherwise the repo-wide default. Never
 * fabricated — always one of those three real sources.
 */
async function resolveTimezone(orgMemberId: string | null, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  if (orgMemberId) {
    const member = await OrgMember.findByPk(orgMemberId);
    if (member?.timezone) return member.timezone;
  }
  return DEFAULT_TIMEZONE;
}

/** Authorization is the route layer's job (requireAgentManagerOrAdmin) —
 * same convention as every other service in this mission. Trusts it
 * already happened. */
export async function createReportSubscription(
  agentId: string,
  orgMemberId: string | null,
  createdByEmail: string,
  contentScope: AgentReportContentSection[],
  cadence: AgentReportCadence,
  deliveryHourLocal: number,
  explicitTimezone?: string,
): Promise<AgentReportSubscriptionView> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new AgentNotFoundError(agentId);

  const timezone = await resolveTimezone(orgMemberId, explicitTimezone);

  const row = await AgentReportSubscription.create({
    agent_id: agentId,
    subscriber_org_member_id: orgMemberId,
    created_by_email: createdByEmail,
    content_scope: contentScope,
    cadence,
    delivery_hour_local: deliveryHourLocal,
    timezone,
    channel: 'email',
    enabled: true,
  });
  return toView(row);
}

/** `null` return means the agent itself doesn't exist. A real agent with
 * zero subscriptions returns an empty array — the honest "nobody has
 * subscribed yet" state, not an error. Returns both enabled and disabled
 * subscriptions (a manager pausing their own report shouldn't make it
 * disappear from their own list). */
export async function listReportSubscriptions(agentId: string): Promise<AgentReportSubscriptionView[] | null> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) return null;

  const rows = await AgentReportSubscription.findAll({ where: { agent_id: agentId } });
  return rows.map(toView);
}

/** Idempotent-in-effect: setting `enabled` to the value it already is
 * writes the same state again rather than erroring — a manager toggling
 * a switch twice in a row should never fail. */
export async function updateReportSubscription(
  id: string,
  updates: Partial<{
    contentScope: AgentReportContentSection[];
    cadence: AgentReportCadence;
    deliveryHourLocal: number;
    timezone: string;
    enabled: boolean;
  }>,
): Promise<AgentReportSubscriptionView> {
  const row = await AgentReportSubscription.findByPk(id);
  if (!row) throw new ReportSubscriptionNotFoundError(id);

  const patch: Record<string, unknown> = {};
  if (updates.contentScope !== undefined) patch.content_scope = updates.contentScope;
  if (updates.cadence !== undefined) patch.cadence = updates.cadence;
  if (updates.deliveryHourLocal !== undefined) patch.delivery_hour_local = updates.deliveryHourLocal;
  if (updates.timezone !== undefined) patch.timezone = updates.timezone;
  if (updates.enabled !== undefined) patch.enabled = updates.enabled;

  if (Object.keys(patch).length > 0) {
    await row.update(patch);
  }
  return toView(row);
}
