/**
 * agentManagerConversationService — AI Workforce Management, Checkpoint C.
 * Pins the find-or-create conversation semantics, the real turn-by-turn
 * persistence, and that a send never does anything beyond
 * persist+reply — no side effects on directives, inbox items, or anything
 * else (the deliberate non-goal boundary for this first slice).
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockConversationFindOrCreate = jest.fn();
jest.mock('../../models/AgentManagerConversation', () => ({
  __esModule: true,
  default: { findOrCreate: (...a: any[]) => mockConversationFindOrCreate(...a) },
}));

const mockMessageCreate = jest.fn();
const mockMessageFindAll = jest.fn();
jest.mock('../../models/AgentManagerMessage', () => ({
  __esModule: true,
  default: {
    create: (...a: any[]) => mockMessageCreate(...a),
    findAll: (...a: any[]) => mockMessageFindAll(...a),
  },
}));

jest.mock('../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../agentBlueprint/agentManagerConversationPrompt', () => ({
  buildAgentManagerConversationSystemPrompt: jest.fn(),
}));
// Reese Agentic AI Employee mission, Checkpoint B — agentManagerConversationService.ts
// now imports managerReliabilityIntentService.ts, which imports ticketService.ts,
// which imports { Ticket, TicketActivity } from '../models' — the barrel, which
// triggers the full association graph (models/index.ts) at module-load time. This
// test's own AiAgent mock is a plain object with no hasMany/belongsTo, so letting the
// real barrel load crashes it — the exact same class of failure CI caught earlier
// this session for agentRecentActivitySummary.ts's own barrel import. Mocked
// wholesale here (this file only needs the detection path to return "not a
// reliability message" for its own unrelated test messages, never the real logic —
// that's agentManagerConversationService.reliabilityConfirmation.test.ts's job).
jest.mock('../managerReliabilityIntentService', () => ({
  detectReliabilityIntent: jest.fn(() => null),
  detectConfirmationReply: jest.fn(() => 'ambiguous'),
  buildConfirmationCardText: jest.fn(() => ''),
  toPendingConfirmation: jest.fn(),
  applyConfirmedReliabilityChange: jest.fn(),
}));

import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { buildAgentManagerConversationSystemPrompt } from '../agentBlueprint/agentManagerConversationPrompt';
import { getConversationHistory, sendManagerMessage, AgentNotFoundError } from '../agentManagerConversationService';

const mockGetInstrumentedOpenAI = getInstrumentedOpenAI as unknown as jest.Mock;
const mockBuildPrompt = buildAgentManagerConversationSystemPrompt as unknown as jest.Mock;
const mockCreateCompletion = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateCompletion.mockReset();
  mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: 'Here is my answer.' } }] });
  mockGetInstrumentedOpenAI.mockReturnValue({ chat: { completions: { create: mockCreateCompletion } } });
  mockBuildPrompt.mockResolvedValue('SYSTEM PROMPT');
});

describe('getConversationHistory', () => {
  it('happy path: finds/creates the conversation and returns its message history', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockConversationFindOrCreate.mockResolvedValue([{ id: 'conv-1' }, false]);
    mockMessageFindAll.mockResolvedValue([
      { id: 'm1', role: 'manager', content: 'Hi', created_at: new Date() },
      { id: 'm2', role: 'agent', content: 'Hello', created_at: new Date() },
    ]);

    const result = await getConversationHistory('agent-1', 'manager@colaberry.com');

    expect(result?.conversationId).toBe('conv-1');
    expect(result?.messages).toHaveLength(2);
  });

  it('boundary: a nonexistent agent returns null', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await getConversationHistory('does-not-exist', 'manager@colaberry.com');

    expect(result).toBeNull();
    expect(mockConversationFindOrCreate).not.toHaveBeenCalled();
  });

  it('boundary: a real agent with no prior conversation returns an empty message list, not an error', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockConversationFindOrCreate.mockResolvedValue([{ id: 'conv-1' }, true]);
    mockMessageFindAll.mockResolvedValue([]);

    const result = await getConversationHistory('agent-1', 'manager@colaberry.com');

    expect(result?.messages).toEqual([]);
  });
});

describe('sendManagerMessage', () => {
  it('happy path: persists the manager turn, calls the real LLM with a real assembled prompt, persists and returns the agent reply', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1', agent_name: 'Reese', system_prompt: 'You are Reese.' });
    mockConversationFindOrCreate.mockResolvedValue([{ id: 'conv-1' }, false]);
    mockMessageFindAll
      .mockResolvedValueOnce([{ id: 'm1', role: 'manager', content: 'How are you doing?', created_at: new Date() }])
      .mockResolvedValueOnce([
        { id: 'm1', role: 'manager', content: 'How are you doing?', created_at: new Date() },
        { id: 'm2', role: 'agent', content: 'Here is my answer.', created_at: new Date() },
      ]);

    const result = await sendManagerMessage('agent-1', 'manager@colaberry.com', 'org-member-1', 'How are you doing?');

    expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({ role: 'manager', content: 'How are you doing?' }));
    expect(mockBuildPrompt).toHaveBeenCalledWith('agent-1', 'Reese', 'You are Reese.');
    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({ role: 'agent', content: 'Here is my answer.' }));
    expect(result.messages).toHaveLength(2);
  });

  it('real per-agent cost tracking: getInstrumentedOpenAI is tagged with this agent\'s real id, from the start (not a later retrofit)', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1', agent_name: 'Reese', system_prompt: 'You are Reese.' });
    mockConversationFindOrCreate.mockResolvedValue([{ id: 'conv-1' }, false]);
    mockMessageFindAll.mockResolvedValue([]);

    await sendManagerMessage('agent-1', 'manager@colaberry.com', null, 'hi');

    expect(mockGetInstrumentedOpenAI).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 'agent-1' }));
  });

  it('BREAK: a nonexistent agent throws AgentNotFoundError and never calls the LLM', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(sendManagerMessage('does-not-exist', 'manager@colaberry.com', null, 'hi')).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it('boundary: an empty/whitespace LLM reply degrades to an honest fallback line, never an empty persisted message', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1', agent_name: 'Reese', system_prompt: 'You are Reese.' });
    mockConversationFindOrCreate.mockResolvedValue([{ id: 'conv-1' }, false]);
    mockMessageFindAll.mockResolvedValue([]);
    mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

    await sendManagerMessage('agent-1', 'manager@colaberry.com', null, 'hi');

    const agentTurnCall = mockMessageCreate.mock.calls.find((c) => c[0].role === 'agent');
    expect(agentTurnCall[0].content.length).toBeGreaterThan(0);
  });
});
