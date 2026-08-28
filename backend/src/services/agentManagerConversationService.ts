import AiAgent from '../models/AiAgent';
import AgentManagerConversation from '../models/AgentManagerConversation';
import AgentManagerMessage from '../models/AgentManagerMessage';
import { getInstrumentedOpenAI } from './openaiInstrumented';
import { buildAgentManagerConversationSystemPrompt } from './agentBlueprint/agentManagerConversationPrompt';

// AI Workforce Management, Checkpoint C — Direct Agent Communication, first
// slice. Generic by construction — works off AiAgent.id, not hardcoded to
// any one agent. Purely conversational: sending a message never creates a
// ManagerDirective, approves an inbox item, or changes anything beyond the
// conversation history itself — intent classification and confirmation
// cards for durable-state-creating requests are real, deliberately deferred
// scope (see AgentManagerMessage.ts's own header comment).

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

  await AgentManagerMessage.create({ conversation_id: conversation.id, role: 'agent', content: replyText });

  const finalRows = await AgentManagerMessage.findAll({
    where: { conversation_id: conversation.id },
    order: [['created_at', 'ASC']],
    limit: HISTORY_LIMIT,
  });
  return { conversationId: conversation.id, agentId, messages: finalRows.map(toMessageView) };
}
