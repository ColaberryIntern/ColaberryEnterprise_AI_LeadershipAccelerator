import { Op } from 'sequelize';
import AdminUser from '../models/AdminUser';
import Ticket from '../models/Ticket';
import type AiAgent from '../models/AiAgent';
import { buildCreatorIdMatchList } from './agentBlueprint/legacyCreatorAliases';

/**
 * agentWorkStatusIntentService — Reese Agentic AI Employee mission,
 * Checkpoint F, first slice (2026-09-06). A manager asking "what are you
 * working on" or "what's overdue" gets a real, deterministic answer built
 * from this agent's real Ticket rows — never an LLM's best guess at its own
 * workload. Same shape and same reasoning as
 * managerReliabilityIntentService.ts's detectReliabilityIntent(): a loose,
 * keyword-based detector is the right tradeoff here too, because a false
 * positive just returns a real (if unwanted) status report, never a write —
 * there is nothing here for a false positive to damage.
 *
 * Reuses agentDetailService.ts's own ticket-matching where-clause
 * (assigned_to_type:'ai_staff' OR legacy created_by_id alias, via
 * buildCreatorIdMatchList()) rather than re-deriving it — that query is the
 * single source of truth for "which tickets belong to this agent" and this
 * module answers a narrower question over the exact same row set.
 *
 * Imports Ticket/AdminUser directly, never the `../models` barrel — see
 * agentManagerConversationService.test.ts's own header comment for why: the
 * barrel triggers the full association graph (models/index.ts) at
 * module-load time, which crashes a unit test whose AiAgent mock is a plain
 * object with no association methods.
 */

export type WorkStatusQueryType = 'in_progress' | 'overdue';

const IN_PROGRESS_TRIGGER_PHRASES = [
  'what are you working on',
  'what are you currently working on',
  "what've you been working on",
  'what have you been working on',
  'what is on your plate',
  "what's on your plate",
  'what are your open tasks',
];

const OVERDUE_TRIGGER_PHRASES = [
  'what is overdue',
  "what's overdue",
  'anything overdue',
  'what are you behind on',
  "what's late",
  'is anything late',
];

/** Pure, deterministic. Checked in overdue-first order so a message
 * mentioning both ("what's overdue on your plate") resolves to the more
 * specific, more actionable answer. */
export function detectWorkStatusQuery(messageText: string): WorkStatusQueryType | null {
  const lower = messageText.toLowerCase();
  if (OVERDUE_TRIGGER_PHRASES.some((p) => lower.includes(p))) return 'overdue';
  if (IN_PROGRESS_TRIGGER_PHRASES.some((p) => lower.includes(p))) return 'in_progress';
  return null;
}

const MAX_LISTED = 5;

function formatLine(t: { ticket_number: number | null; title: string; due_date?: Date | null }, withDueDate: boolean): string {
  const num = t.ticket_number ? `#${t.ticket_number} ` : '';
  const due = withDueDate && t.due_date ? ` (due ${new Date(t.due_date).toISOString().slice(0, 10)})` : '';
  return `- ${num}${t.title}${due}`;
}

function formatList(rows: Array<{ ticket_number: number | null; title: string; due_date?: Date | null }>, withDueDate: boolean): string {
  const listed = rows.slice(0, MAX_LISTED).map((t) => formatLine(t, withDueDate)).join('\n');
  const remainder = rows.length - MAX_LISTED;
  return remainder > 0 ? `${listed}\n...and ${remainder} more.` : listed;
}

/**
 * Real answer, grounded entirely in this agent's own Ticket rows. An agent
 * with no linked staff identity (no AdminUser row) honestly has nothing to
 * check against — that's disclosed rather than silently falling through to
 * the LLM, which is the same "discard rather than guess" posture Checkpoint
 * D's evidence-provenance gate established for this mission.
 */
export async function buildWorkStatusReply(agent: AiAgent, queryType: WorkStatusQueryType): Promise<string> {
  const adminUser = await AdminUser.findOne({ where: { agent_id: agent.id } });
  if (!adminUser) {
    return `${agent.agent_name} doesn't have a linked staff identity, so there's no ticket queue to check.`;
  }

  const matchIds = buildCreatorIdMatchList(adminUser.id, agent);
  const identityWhere = {
    [Op.or]: [
      { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: matchIds } },
      { created_by_id: { [Op.in]: matchIds } },
    ],
  };

  if (queryType === 'overdue') {
    const rows = await Ticket.findAll({
      where: { ...identityWhere, due_date: { [Op.lte]: new Date() }, status: { [Op.notIn]: ['done', 'cancelled'] } },
      order: [['due_date', 'ASC']],
    });
    if (rows.length === 0) return "Nothing of mine is overdue right now.";
    return `${rows.length} of mine ${rows.length === 1 ? 'is' : 'are'} overdue:\n${formatList(rows as any[], true)}`;
  }

  const rows = await Ticket.findAll({
    where: { ...identityWhere, status: 'in_progress' },
    order: [['updated_at', 'DESC']],
  });
  if (rows.length === 0) return "I'm not actively working on anything right now.";
  return `I'm currently working on ${rows.length}:\n${formatList(rows as any[], false)}`;
}
