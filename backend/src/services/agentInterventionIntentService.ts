import { Op } from 'sequelize';
import AdminUser from '../models/AdminUser';
import Ticket from '../models/Ticket';
import ReeseOutreach from '../models/ReeseOutreach';
import Enrollment from '../models/Enrollment';
import type AiAgent from '../models/AiAgent';
import { buildCreatorIdMatchList } from './agentBlueprint/legacyCreatorAliases';

/**
 * agentInterventionIntentService — Reese Agentic AI Employee mission,
 * Capability 7's remaining aggregate manager questions answerable from
 * existing `ReeseOutreach` data, no new schema: "Which students need me?",
 * "What did you promise to follow up on?", "Which interventions are
 * working?". The other 2 named questions ("Why did you contact this
 * student?", "What evidence did you exclude?") are per-student, requiring
 * real entity extraction from free text to know WHICH student — genuinely
 * Capability 8 territory ("manager intent classification"), not a
 * mechanical extension of this deterministic-aggregate-query pattern.
 * Deliberately not attempted here.
 *
 * `ReeseOutreach` has no per-agent ownership column (same situation as
 * `StudentAssessment`), so scoping to the calling agent's own rows goes
 * through the same real identity match `agentWorkStatusIntentService.ts`
 * already uses (`buildCreatorIdMatchList()` against the linked
 * `reese_autonomous_outreach` ticket's `assigned_to_id`/`created_by_id`) —
 * never a second, drifting definition of ownership.
 */

export type InterventionIntentQueryType = 'needs_attention' | 'follow_up_commitments' | 'intervention_outcomes';

const NEEDS_ATTENTION_PHRASES = [
  'which students need me',
  'who needs me',
  'who needs my attention',
  'which students need attention',
];

const FOLLOW_UP_PHRASES = [
  'what did you promise to follow up on',
  'what have you promised to follow up on',
  'what are your follow-up commitments',
  'what follow-ups do you have',
];

const INTERVENTION_OUTCOMES_PHRASES = [
  'which interventions are working',
  'what interventions are working',
  'are your interventions working',
  'how are your interventions doing',
];

export function detectInterventionIntentQuery(messageText: string): InterventionIntentQueryType | null {
  const lower = messageText.toLowerCase();
  if (NEEDS_ATTENTION_PHRASES.some((p) => lower.includes(p))) return 'needs_attention';
  if (FOLLOW_UP_PHRASES.some((p) => lower.includes(p))) return 'follow_up_commitments';
  if (INTERVENTION_OUTCOMES_PHRASES.some((p) => lower.includes(p))) return 'intervention_outcomes';
  return null;
}

const MAX_LISTED = 5;

/** This agent's own real outreach ticket ids — the same identity-match
 * where-clause agentDetailService.ts / agentWorkStatusIntentService.ts
 * already use, scoped to this one ticket type. */
async function getOwnedOutreachTicketIds(agent: AiAgent): Promise<string[]> {
  const adminUser = await AdminUser.findOne({ where: { agent_id: agent.id } });
  if (!adminUser) return [];

  const matchIds = buildCreatorIdMatchList(adminUser.id, agent);
  const tickets = await Ticket.findAll({
    where: {
      type: 'reese_autonomous_outreach',
      [Op.or]: [
        { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: matchIds } },
        { created_by_id: { [Op.in]: matchIds } },
      ],
    },
    attributes: ['id'],
  });
  return tickets.map((t) => t.id);
}

async function namesByEnrollmentId(enrollmentIds: string[]): Promise<Map<string, string>> {
  const enrollments = await Enrollment.findAll({ where: { id: { [Op.in]: enrollmentIds } }, attributes: ['id', 'full_name'] });
  return new Map(enrollments.map((e: any) => [e.id, e.full_name]));
}

async function buildNeedsAttentionReply(agent: AiAgent): Promise<string> {
  const ticketIds = await getOwnedOutreachTicketIds(agent);
  if (ticketIds.length === 0) return "Nothing needs me right now.";

  const rows = await ReeseOutreach.findAll({
    where: { ticket_id: { [Op.in]: ticketIds }, status: 'active' },
    order: [['last_contacted_at', 'DESC']],
  });
  if (rows.length === 0) return "Nothing needs me right now — every open thread has been resolved.";

  const nameById = await namesByEnrollmentId(rows.map((r) => r.enrollment_id));
  const lines = rows.slice(0, MAX_LISTED).map((r) => {
    const name = nameById.get(r.enrollment_id) || r.enrollment_id;
    return `- ${name} (${r.signal_type.replace('_', ' ')})`;
  }).join('\n');
  const remainder = rows.length - MAX_LISTED;
  const more = remainder > 0 ? `\n...and ${remainder} more.` : '';

  return `${rows.length} student${rows.length === 1 ? '' : 's'} need${rows.length === 1 ? 's' : ''} me:\n${lines}${more}`;
}

async function buildFollowUpCommitmentsReply(agent: AiAgent): Promise<string> {
  const ticketIds = await getOwnedOutreachTicketIds(agent);
  if (ticketIds.length === 0) return "I don't have any open follow-up commitments right now.";

  const rows = await ReeseOutreach.findAll({
    where: { ticket_id: { [Op.in]: ticketIds }, status: 'active', next_follow_up_due_at: { [Op.ne]: null } },
    order: [['next_follow_up_due_at', 'ASC']],
  });
  if (rows.length === 0) return "I don't have any open follow-up commitments right now.";

  const nameById = await namesByEnrollmentId(rows.map((r) => r.enrollment_id));
  const lines = rows.slice(0, MAX_LISTED).map((r) => {
    const name = nameById.get(r.enrollment_id) || r.enrollment_id;
    const due = r.next_follow_up_due_at ? new Date(r.next_follow_up_due_at).toISOString().slice(0, 10) : 'unknown';
    return `- ${name} — due ${due}`;
  }).join('\n');
  const remainder = rows.length - MAX_LISTED;
  const more = remainder > 0 ? `\n...and ${remainder} more.` : '';

  return (
    `${rows.length} open follow-up commitment${rows.length === 1 ? '' : 's'}:\n${lines}${more}\n\n` +
    `(These are my autonomous outreach follow-ups — I don't yet track promises made in direct conversation.)`
  );
}

async function buildInterventionOutcomesReply(agent: AiAgent): Promise<string> {
  const ticketIds = await getOwnedOutreachTicketIds(agent);
  if (ticketIds.length === 0) return "I don't have enough resolved interventions yet to tell what's working.";

  const rows = await ReeseOutreach.findAll({
    where: { ticket_id: { [Op.in]: ticketIds }, status: { [Op.in]: ['goal_met', 'signal_cleared', 'escalated'] } },
    attributes: ['status'],
  });
  if (rows.length === 0) return "I don't have enough resolved interventions yet to tell what's working.";

  const goalMet = rows.filter((r) => r.status === 'goal_met').length;
  const signalCleared = rows.filter((r) => r.status === 'signal_cleared').length;
  const escalated = rows.filter((r) => r.status === 'escalated').length;

  return (
    `Of ${rows.length} resolved intervention${rows.length === 1 ? '' : 's'}: ${goalMet} the student replied and the goal was met, ` +
    `${signalCleared} the risk signal cleared on its own, ${escalated} needed human review.`
  );
}

export async function buildInterventionIntentReply(agent: AiAgent, queryType: InterventionIntentQueryType): Promise<string> {
  if (queryType === 'needs_attention') return buildNeedsAttentionReply(agent);
  if (queryType === 'follow_up_commitments') return buildFollowUpCommitmentsReply(agent);
  return buildInterventionOutcomesReply(agent);
}
