import AiAgent from '../models/AiAgent';
import AgentManagerConversation from '../models/AgentManagerConversation';
import AgentManagerMessage from '../models/AgentManagerMessage';
import { getInstrumentedOpenAI } from './openaiInstrumented';
import { buildAgentManagerConversationSystemPrompt } from './agentBlueprint/agentManagerConversationPrompt';
import {
  applyConfirmedReliabilityChange, buildConfirmationCardText, detectConfirmationReply, detectReliabilityIntent, toPendingConfirmation,
} from './managerReliabilityIntentService';
import {
  applyConfirmedGoalChange, buildGoalConfirmationCardText, detectChangeGoalIntent, toPendingGoalConfirmation,
} from './managerGoalIntentService';
import {
  applyConfirmedOneOnOneSchedule, buildOneOnOneConfirmationCardText, detectScheduleOneOnOneIntent, toPendingOneOnOneConfirmation,
} from './managerOneOnOneIntentService';
import {
  applyConfirmedDirective, buildDirectiveConfirmationCardText, detectInstructIntent, toPendingDirectiveConfirmation,
} from './managerDirectiveIntentService';
import {
  applyConfirmedAssignWork, buildAssignWorkConfirmationCardText, detectAssignWorkIntent, toPendingAssignWorkConfirmation,
} from './managerAssignWorkIntentService';
import {
  applyConfirmedApprove, applyConfirmedReject, buildApproveConfirmationCardText, buildRejectConfirmationCardText,
  detectApproveIntent, detectRejectIntent, resolvePendingApprovalTarget, toPendingApproveConfirmation, toPendingRejectConfirmation,
} from './managerApprovalDecisionIntentService';
import { detectWorkStatusQuery, buildWorkStatusReply } from './agentWorkStatusIntentService';
import { detectUncertaintyQuery, buildUncertaintyReply } from './agentUncertaintyIntentService';
import { detectInterventionIntentQuery, buildInterventionIntentReply } from './agentInterventionIntentService';

// AI Workforce Management, Checkpoint C — Direct Agent Communication, first
// slice. Generic by construction — works off AiAgent.id, not hardcoded to
// any one agent. Purely conversational: sending a message never creates a
// ManagerDirective, approves an inbox item, or changes anything beyond the
// conversation history itself — full intent classification and confirmation
// cards for EVERY durable-state-creating request remain real, deliberately
// deferred scope (see AgentManagerMessage.ts's own header comment).
//
// Reese Agentic AI Employee mission, Checkpoint B (2026-09-04) narrows that
// deferral by one real slice: reliability-declaration intent
// (QUARANTINE_METRIC/RESTORE_METRIC) is now detected and gated behind a real
// confirmation turn — see managerReliabilityIntentService.ts.
//
// Capability 8 (2026-09-08/09/10) narrows it by six more, all riding the
// generic `pending_intent_confirmation` column instead of a dedicated one:
// CHANGE_GOAL (managerGoalIntentService.ts), SCHEDULE
// (managerOneOnOneIntentService.ts, 1:1 check-ins), INSTRUCT
// (managerDirectiveIntentService.ts, standing directives), ASSIGN_WORK
// (managerAssignWorkIntentService.ts, real tickets via the Org Chart's own
// hierarchy-authorized task assignment), and APPROVE/REJECT
// (managerApprovalDecisionIntentService.ts, real decisions on a pending
// ProposedAgentAction — the same object and the same executor the Manager
// Inbox UI's own approve/reject buttons already use). See
// handlePendingGenericIntentConfirmation/handleNewGenericIntentDetection
// below for how the column dispatches across intent types. Every other
// intent (ASK/CORRECT/COACH/REPORT_DATA_ISSUE/...) is still purely
// conversational, unchanged.

const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const HISTORY_LIMIT = 20;

export class AgentNotFoundError extends Error {
  readonly error_class = 'AgentNotFoundError' as const;
  readonly status = 404;

  constructor(agentId: string) {
    super(`Agent "${agentId}" does not exist.`);
    this.name = 'AgentNotFoundError';
  }
}

export interface ConversationMessageView {
  id: string;
  role: 'manager' | 'agent';
  content: string;
  createdAt: Date;
}

export interface ConversationView {
  conversationId: string;
  agentId: string;
  messages: ConversationMessageView[];
}

function toMessageView(row: AgentManagerMessage): ConversationMessageView {
  return { id: row.id, role: row.role, content: row.content, createdAt: row.created_at };
}

/** Authorization (is the caller allowed to talk to this agent) is the route
 * layer's job (requireAgentManagerOrAdmin) — same convention as every other
 * service in this mission. Trusts it already happened. */
async function getOrCreateConversation(
  agentId: string,
  participantEmail: string,
  participantOrgMemberId: string | null,
): Promise<AgentManagerConversation> {
  const [conversation] = await AgentManagerConversation.findOrCreate({
    where: { agent_id: agentId, participant_email: participantEmail },
    defaults: { agent_id: agentId, participant_email: participantEmail, participant_org_member_id: participantOrgMemberId },
  });
  return conversation;
}

/** `null` return means the agent itself doesn't exist. A manager with no
 * prior conversation gets a real, freshly created (empty) one — the honest
 * "nothing said yet" state, not an error. */
export async function getConversationHistory(agentId: string, participantEmail: string): Promise<ConversationView | null> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) return null;

  const conversation = await getOrCreateConversation(agentId, participantEmail, null);
  const rows = await AgentManagerMessage.findAll({
    where: { conversation_id: conversation.id },
    order: [['created_at', 'ASC']],
    limit: HISTORY_LIMIT,
  });
  return { conversationId: conversation.id, agentId, messages: rows.map(toMessageView) };
}

/**
 * Returns the reply text to send AND persist if this message was handled by
 * the reliability-confirmation flow, or `null` if the normal LLM reply path
 * should run instead. Never mutates durable reliability state on the SAME
 * turn a declaration is first detected — that only happens on a real,
 * separate confirming reply, matching the mission's "no casual sentence
 * silently mutates durable governance state" requirement.
 */
async function handlePendingOrNewReliabilityIntent(
  conversation: AgentManagerConversation,
  messageText: string,
  participantEmail: string,
): Promise<string | null> {
  const pending = conversation.pending_reliability_confirmation;

  if (pending) {
    const verdict = detectConfirmationReply(messageText);
    if (verdict === 'confirm') {
      await conversation.update({ pending_reliability_confirmation: null });
      const { summary } = await applyConfirmedReliabilityChange(pending, participantEmail);
      return summary;
    }
    // 'cancel' or 'ambiguous' both clear the pending state — a durable
    // governance change never lingers waiting for a confirmation that may
    // never come; the manager can always say it again.
    await conversation.update({ pending_reliability_confirmation: null });
    return `Okay, no change made — ${pending.sourceSystem} stays as it was. Let me know if you did want to change that.`;
  }

  const detected = detectReliabilityIntent(messageText);
  if (detected) {
    await conversation.update({ pending_reliability_confirmation: toPendingConfirmation(detected) });
    return buildConfirmationCardText(detected);
  }

  return null;
}

function genericIntentCancelText(pending: NonNullable<AgentManagerConversation['pending_intent_confirmation']>): string {
  if (pending.intentType === 'CHANGE_GOAL') {
    return 'Okay, no change made — the goal stays as it was. Let me know if you did want to change that.';
  }
  if (pending.intentType === 'SCHEDULE_ONE_ON_ONE') {
    return 'Okay, no 1:1 scheduled. Let me know if you did want to set one up.';
  }
  if (pending.intentType === 'INSTRUCT') {
    return 'Okay, no directive saved. Let me know if you did want to set one.';
  }
  if (pending.intentType === 'ASSIGN_WORK') {
    return 'Okay, no task assigned. Let me know if you did want to assign one.';
  }
  if (pending.intentType === 'APPROVE') {
    return 'Okay, nothing approved. Let me know if you did want to approve it.';
  }
  return 'Okay, nothing rejected. Let me know if you did want to reject it.';
}

/**
 * Reese Agentic AI Employee mission, Capability 8 — handles a PENDING
 * confirmation on the generic `pending_intent_confirmation` column,
 * dispatching by `intentType` to whichever intent actually detected it
 * (CHANGE_GOAL, SCHEDULE_ONE_ON_ONE, ...). Checked AFTER the reliability
 * handler (which owns its own dedicated column and keeps priority) — a
 * conversation is never left with two different pending confirmations
 * competing for the same short "confirm"/"cancel" reply. Returns null only
 * when nothing is pending; a fresh detection is handleNewGenericIntentDetection's
 * job below.
 */
async function handlePendingGenericIntentConfirmation(
  agentId: string,
  conversation: AgentManagerConversation,
  messageText: string,
  participantEmail: string,
  participantOrgMemberId: string | null,
): Promise<string | null> {
  const pending = conversation.pending_intent_confirmation;
  if (!pending) return null;

  const verdict = detectConfirmationReply(messageText);
  if (verdict === 'confirm') {
    await conversation.update({ pending_intent_confirmation: null });
    if (pending.intentType === 'CHANGE_GOAL') {
      const { summary } = await applyConfirmedGoalChange(agentId, pending, participantEmail, participantOrgMemberId);
      return summary;
    }
    if (pending.intentType === 'SCHEDULE_ONE_ON_ONE') {
      const { summary } = await applyConfirmedOneOnOneSchedule(agentId, pending, participantEmail, participantOrgMemberId);
      return summary;
    }
    if (pending.intentType === 'INSTRUCT') {
      const { summary } = await applyConfirmedDirective(agentId, pending, participantEmail, participantOrgMemberId);
      return summary;
    }
    if (pending.intentType === 'ASSIGN_WORK') {
      const { summary } = await applyConfirmedAssignWork(agentId, pending, participantEmail, participantOrgMemberId);
      return summary;
    }
    if (pending.intentType === 'APPROVE') {
      const { summary } = await applyConfirmedApprove(pending, participantEmail);
      return summary;
    }
    const { summary } = await applyConfirmedReject(pending, participantEmail);
    return summary;
  }

  await conversation.update({ pending_intent_confirmation: null });
  return genericIntentCancelText(pending);
}

/**
 * Reese Agentic AI Employee mission, Capability 8 — tries each generic
 * intent's detector in turn against a FRESH message (no pending confirmation
 * already in play — that's handlePendingGenericIntentConfirmation's job).
 * Order is the priority when a message could plausibly match more than one
 * — CHANGE_GOAL first since it shipped first, SCHEDULE_ONE_ON_ONE next.
 * Adding a new intent here is the one place future intents plug in.
 */
async function handleNewGenericIntentDetection(
  conversation: AgentManagerConversation,
  messageText: string,
): Promise<string | null> {
  const goalDetected = detectChangeGoalIntent(messageText);
  if (goalDetected) {
    await conversation.update({ pending_intent_confirmation: toPendingGoalConfirmation(goalDetected) });
    return buildGoalConfirmationCardText(goalDetected);
  }

  const oneOnOneDetected = detectScheduleOneOnOneIntent(messageText);
  if (oneOnOneDetected) {
    await conversation.update({ pending_intent_confirmation: toPendingOneOnOneConfirmation(oneOnOneDetected) });
    return buildOneOnOneConfirmationCardText(oneOnOneDetected);
  }

  const directiveDetected = detectInstructIntent(messageText);
  if (directiveDetected) {
    await conversation.update({ pending_intent_confirmation: toPendingDirectiveConfirmation(directiveDetected) });
    return buildDirectiveConfirmationCardText(directiveDetected);
  }

  const assignWorkDetected = detectAssignWorkIntent(messageText);
  if (assignWorkDetected) {
    await conversation.update({ pending_intent_confirmation: toPendingAssignWorkConfirmation(assignWorkDetected) });
    return buildAssignWorkConfirmationCardText(assignWorkDetected);
  }

  // APPROVE/REJECT are the one pair where "which proposal" never appears in
  // the manager's own message text — resolvePendingApprovalTarget() is a
  // real DB read, unlike every detector above, and 'none'/'ambiguous' are
  // honest outcomes surfaced directly rather than ever guessing which
  // pending proposal was meant.
  if (detectApproveIntent(messageText)) {
    const target = await resolvePendingApprovalTarget(conversation.agent_id);
    if (target === 'none') return "There's nothing pending for me to approve right now.";
    if (target === 'ambiguous') return "You have more than one pending item — head to the Manager Inbox to pick the right one.";
    await conversation.update({ pending_intent_confirmation: toPendingApproveConfirmation(target) });
    return buildApproveConfirmationCardText(target);
  }

  if (detectRejectIntent(messageText)) {
    const target = await resolvePendingApprovalTarget(conversation.agent_id);
    if (target === 'none') return "There's nothing pending for me to reject right now.";
    if (target === 'ambiguous') return "You have more than one pending item — head to the Manager Inbox to pick the right one.";
    await conversation.update({ pending_intent_confirmation: toPendingRejectConfirmation(target) });
    return buildRejectConfirmationCardText(target);
  }

  return null;
}

/**
 * Reese Agentic AI Employee mission, Checkpoint F — a manager asking about
 * this agent's real workload ("what are you working on" / "what's
 * overdue") gets a deterministic answer built from real Ticket rows, never
 * an LLM guess. Checked AFTER the reliability flow (which owns any pending
 * multi-turn confirmation) and BEFORE the normal LLM path.
 */
async function handleWorkStatusQuery(agent: AiAgent, messageText: string): Promise<string | null> {
  const queryType = detectWorkStatusQuery(messageText);
  if (!queryType) return null;
  return buildWorkStatusReply(agent, queryType);
}

/** Reese Agentic AI Employee mission, Capability 7 — "What are you
 * uncertain about?" Checked alongside handleWorkStatusQuery, same
 * deterministic-before-LLM posture. */
async function handleUncertaintyQuery(agent: AiAgent, messageText: string): Promise<string | null> {
  if (!detectUncertaintyQuery(messageText)) return null;
  return buildUncertaintyReply(agent);
}

/** Reese Agentic AI Employee mission, Capability 7 — "Which students need
 * me?" / "What did you promise to follow up on?" / "Which interventions
 * are working?" Same deterministic-before-LLM posture as the other checks. */
async function handleInterventionIntentQuery(agent: AiAgent, messageText: string): Promise<string | null> {
  const queryType = detectInterventionIntentQuery(messageText);
  if (!queryType) return null;
  return buildInterventionIntentReply(agent, queryType);
}

/** Persists the agent's turn and returns the refreshed conversation view —
 * the one shared tail every reply path (reliability card, work-status
 * answer, normal LLM reply) ends with. */
async function persistAgentReplyAndReturnView(
  conversation: AgentManagerConversation,
  agentId: string,
  replyText: string,
): Promise<ConversationView> {
  await AgentManagerMessage.create({ conversation_id: conversation.id, role: 'agent', content: replyText });
  const rows = await AgentManagerMessage.findAll({
    where: { conversation_id: conversation.id },
    order: [['created_at', 'ASC']],
    limit: HISTORY_LIMIT,
  });
  return { conversationId: conversation.id, agentId, messages: rows.map(toMessageView) };
}

/**
 * Sends a manager's message and returns the agent's real reply. Persists
 * both turns. Real per-call cost is tracked against this agent's real id
 * (getInstrumentedOpenAI's agent_id tag) — same fix this session already
 * shipped for Reese's own reply path, applied generically here from the
 * start rather than retrofitted later.
 */
export async function sendManagerMessage(
  agentId: string,
  participantEmail: string,
  participantOrgMemberId: string | null,
  messageText: string,
): Promise<ConversationView> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new AgentNotFoundError(agentId);

  const conversation = await getOrCreateConversation(agentId, participantEmail, participantOrgMemberId);

  await AgentManagerMessage.create({ conversation_id: conversation.id, role: 'manager', content: messageText });

  // Reese Agentic AI Employee mission, Checkpoint B — reliability confirmation
  // workflow. Checked BEFORE the normal LLM reply path, and returns early on
  // a match: a pending confirmation or a freshly detected declaration is
  // handled deterministically, never left to an LLM to phrase or forget.
  const reliabilityReply = await handlePendingOrNewReliabilityIntent(conversation, messageText, participantEmail);
  if (reliabilityReply !== null) {
    return persistAgentReplyAndReturnView(conversation, agentId, reliabilityReply);
  }

  // Reese Agentic AI Employee mission, Capability 8 — the generic pending-
  // intent-confirmation column (CHANGE_GOAL, SCHEDULE_ONE_ON_ONE, ...).
  // Checked right after reliability (same "pending confirmation owns the
  // next reply" posture) and before every purely-informational query below.
  const pendingIntentReply = await handlePendingGenericIntentConfirmation(agentId, conversation, messageText, participantEmail, participantOrgMemberId);
  if (pendingIntentReply !== null) {
    return persistAgentReplyAndReturnView(conversation, agentId, pendingIntentReply);
  }

  const newIntentReply = await handleNewGenericIntentDetection(conversation, messageText);
  if (newIntentReply !== null) {
    return persistAgentReplyAndReturnView(conversation, agentId, newIntentReply);
  }

  const workStatusReply = await handleWorkStatusQuery(agent, messageText);
  if (workStatusReply !== null) {
    return persistAgentReplyAndReturnView(conversation, agentId, workStatusReply);
  }

  const uncertaintyReply = await handleUncertaintyQuery(agent, messageText);
  if (uncertaintyReply !== null) {
    return persistAgentReplyAndReturnView(conversation, agentId, uncertaintyReply);
  }

  const interventionIntentReply = await handleInterventionIntentQuery(agent, messageText);
  if (interventionIntentReply !== null) {
    return persistAgentReplyAndReturnView(conversation, agentId, interventionIntentReply);
  }

  const recent = await AgentManagerMessage.findAll({
    where: { conversation_id: conversation.id },
    order: [['created_at', 'DESC']],
    limit: HISTORY_LIMIT,
  });
  const ordered = recent.slice().reverse();

  const systemPrompt = await buildAgentManagerConversationSystemPrompt(agentId, agent.agent_name, agent.system_prompt);
  const openai = getInstrumentedOpenAI({ workflow_id: 'agent_manager_conversation', agent_id: agentId });
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...ordered.map((m) => ({ role: (m.role === 'manager' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.content })),
    ],
    temperature: 0.7,
    max_tokens: 500,
  });
  const replyText = completion.choices[0]?.message?.content?.trim() || "I don't have a reply for that right now.";

  return persistAgentReplyAndReturnView(conversation, agentId, replyText);
}
