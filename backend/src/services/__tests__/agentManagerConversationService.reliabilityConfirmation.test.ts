/**
 * agentManagerConversationService — reliability confirmation workflow
 * integration (Reese Agentic AI Employee mission, Checkpoint B). Pins the
 * real two-turn state machine at the point it actually lives — inside
 * sendManagerMessage() — not just the pure detector in isolation
 * (managerReliabilityIntentService.test.ts already covers that). The core
 * safety property under test: a reliability declaration is NEVER applied
 * on the same turn it's first detected, and the normal LLM reply path is
 * NEVER invoked while a reliability turn is being handled.
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) } }));

const mockConversationFindOrCreate = jest.fn();
jest.mock('../../models/AgentManagerConversation', () => ({
  __esModule: true,
  default: { findOrCreate: (...a: any[]) => mockConversationFindOrCreate(...a) },
}));

const mockMessageCreate = jest.fn();
const mockMessageFindAll = jest.fn();
jest.mock('../../models/AgentManagerMessage', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => mockMessageCreate(...a), findAll: (...a: any[]) => mockMessageFindAll(...a) },
}));

jest.mock('../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../agentBlueprint/agentManagerConversationPrompt', () => ({ buildAgentManagerConversationSystemPrompt: jest.fn() }));

const mockDeclareReliabilityChange = jest.fn();
const mockRestoreMetric = jest.fn();
jest.mock('../metricReliabilityService', () => ({
  declareReliabilityChange: (...a: any[]) => mockDeclareReliabilityChange(...a),
  restoreMetric: (...a: any[]) => mockRestoreMetric(...a),
}));

import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { sendManagerMessage } from '../agentManagerConversationService';

const mockGetInstrumentedOpenAI = getInstrumentedOpenAI as unknown as jest.Mock;
const mockCreateCompletion = jest.fn();

function fakeConversation(overrides: Record<string, any> = {}) {
  return { id: 'conv-1', pending_reliability_confirmation: null, update: jest.fn().mockResolvedValue(undefined), ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: 'Normal reply.' } }] });
  mockGetInstrumentedOpenAI.mockReturnValue({ chat: { completions: { create: mockCreateCompletion } } });
  mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1', agent_name: 'Reese', system_prompt: 'You are Reese.' });
  mockMessageFindAll.mockResolvedValue([]);
  mockDeclareReliabilityChange.mockResolvedValue({});
  mockRestoreMetric.mockResolvedValue({});
});

describe('sendManagerMessage — reliability confirmation workflow', () => {
  it('detection turn: a fresh reliability declaration produces a confirmation card, sets pending state, and never calls the LLM or writes durable state', async () => {
    const conversation = fakeConversation();
    mockConversationFindOrCreate.mockResolvedValue([conversation, false]);

    const result = await sendManagerMessage('agent-1', 'ali@colaberry.com', null, 'Attendance is broken.');

    expect(mockCreateCompletion).not.toHaveBeenCalled();
    expect(mockDeclareReliabilityChange).not.toHaveBeenCalled();
    expect(conversation.update).toHaveBeenCalledWith(expect.objectContaining({
      pending_reliability_confirmation: expect.objectContaining({ direction: 'quarantine', sourceSystem: 'attendance' }),
    }));
    const agentTurn = mockMessageCreate.mock.calls.find((c) => c[0].role === 'agent');
    expect(agentTurn[0].content).toContain('confirm');
    expect(result.conversationId).toBe('conv-1');
  });

  it('confirmation turn: a pending declaration + a real "confirm" reply applies the change for real and clears pending state', async () => {
    const pending = { direction: 'quarantine', sourceSystem: 'attendance', metricKey: 'attendance.*', scopeType: 'global', scopeValue: null, reason: 'Attendance is broken.', detectedAt: '2026-09-04T00:00:00.000Z' };
    const conversation = fakeConversation({ pending_reliability_confirmation: pending });
    mockConversationFindOrCreate.mockResolvedValue([conversation, false]);

    await sendManagerMessage('agent-1', 'ali@colaberry.com', null, 'confirm');

    expect(mockDeclareReliabilityChange).toHaveBeenCalledWith(expect.objectContaining({ sourceSystem: 'attendance', status: 'quarantined', declaredByEmail: 'ali@colaberry.com' }));
    expect(conversation.update).toHaveBeenCalledWith({ pending_reliability_confirmation: null });
    expect(mockCreateCompletion).not.toHaveBeenCalled();
    const agentTurn = mockMessageCreate.mock.calls.find((c) => c[0].role === 'agent');
    expect(agentTurn[0].content).toContain('quarantined');
  });

  it('cancel turn: a pending declaration + a "cancel" reply clears pending state without ever writing durable state', async () => {
    const pending = { direction: 'quarantine', sourceSystem: 'attendance', metricKey: 'attendance.*', scopeType: 'global', scopeValue: null, reason: 'Attendance is broken.', detectedAt: '2026-09-04T00:00:00.000Z' };
    const conversation = fakeConversation({ pending_reliability_confirmation: pending });
    mockConversationFindOrCreate.mockResolvedValue([conversation, false]);

    await sendManagerMessage('agent-1', 'ali@colaberry.com', null, 'cancel');

    expect(mockDeclareReliabilityChange).not.toHaveBeenCalled();
    expect(mockRestoreMetric).not.toHaveBeenCalled();
    expect(conversation.update).toHaveBeenCalledWith({ pending_reliability_confirmation: null });
  });

  it('ambiguous turn: a pending declaration + an unrelated reply is treated as a real cancel, never left lingering for a later out-of-context confirm', async () => {
    const pending = { direction: 'quarantine', sourceSystem: 'attendance', metricKey: 'attendance.*', scopeType: 'global', scopeValue: null, reason: 'Attendance is broken.', detectedAt: '2026-09-04T00:00:00.000Z' };
    const conversation = fakeConversation({ pending_reliability_confirmation: pending });
    mockConversationFindOrCreate.mockResolvedValue([conversation, false]);

    await sendManagerMessage('agent-1', 'ali@colaberry.com', null, 'What time is the next session?');

    expect(mockDeclareReliabilityChange).not.toHaveBeenCalled();
    expect(conversation.update).toHaveBeenCalledWith({ pending_reliability_confirmation: null });
  });

  it('regression: a normal message with no pending state and no reliability keywords goes through the unchanged LLM reply path', async () => {
    const conversation = fakeConversation();
    mockConversationFindOrCreate.mockResolvedValue([conversation, false]);

    const result = await sendManagerMessage('agent-1', 'ali@colaberry.com', null, 'How is Victor doing this week?');

    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    expect(conversation.update).not.toHaveBeenCalled();
    expect(mockDeclareReliabilityChange).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
