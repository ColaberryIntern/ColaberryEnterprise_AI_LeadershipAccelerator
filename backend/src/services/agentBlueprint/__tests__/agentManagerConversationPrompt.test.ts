/**
 * buildAgentManagerConversationSystemPrompt — AI Workforce Management,
 * Checkpoint C. Pins the honest-empty-persona fallback (never fabricates a
 * persona for an agent with no configured system_prompt) and real directive
 * injection. Checkpoint E adds real approved-memory injection, on the same
 * pattern.
 */
jest.mock('../../managerDirectiveService', () => ({ getActiveDirectiveTexts: jest.fn() }));
jest.mock('../../agentMemoryProposalService', () => ({ getApprovedMemoryTexts: jest.fn() }));
jest.mock('../agentRecentActivitySummary', () => ({ getRecentActivitySummary: jest.fn() }));
// Reese Agentic AI Employee mission, Capability 8 — same isolation reasoning
// as agentSystemPrompt.test.ts: mocked wholesale so this file doesn't need
// to also stub AgentRoleCharter/MetricReliabilityRecord.
jest.mock('../agentContextLayers', () => ({
  buildRoleCharterBlock: jest.fn(() => Promise.resolve('')),
  buildReliabilityStateBlock: jest.fn(() => Promise.resolve('DATA RELIABILITY STATE: No data sources are currently flagged unreliable — all known sources are healthy.')),
}));

import { getActiveDirectiveTexts } from '../../managerDirectiveService';
import { getApprovedMemoryTexts } from '../../agentMemoryProposalService';
import { getRecentActivitySummary } from '../agentRecentActivitySummary';
import { buildRoleCharterBlock, buildReliabilityStateBlock } from '../agentContextLayers';
import { buildAgentManagerConversationSystemPrompt } from '../agentManagerConversationPrompt';

const mockActiveDirectives = getActiveDirectiveTexts as unknown as jest.Mock;
const mockApprovedMemory = getApprovedMemoryTexts as unknown as jest.Mock;
const mockRecentActivity = getRecentActivitySummary as unknown as jest.Mock;
const mockRoleCharter = buildRoleCharterBlock as unknown as jest.Mock;
const mockReliabilityState = buildReliabilityStateBlock as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockApprovedMemory.mockResolvedValue([]);
  mockRecentActivity.mockResolvedValue({ tickets: [], events: [] });
  mockRoleCharter.mockResolvedValue('');
  mockReliabilityState.mockResolvedValue('DATA RELIABILITY STATE: No data sources are currently flagged unreliable — all known sources are healthy.');
});

describe('buildAgentManagerConversationSystemPrompt', () => {
  it('happy path: uses the agent\'s real system_prompt as the base persona', async () => {
    mockActiveDirectives.mockResolvedValue([]);

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese, a mentor.');

    expect(prompt).toContain('You are Reese, a mentor.');
    expect(prompt).not.toContain('No system prompt has been configured');
  });

  it('boundary: an agent with no system_prompt gets an honest, minimal frame — never a fabricated persona', async () => {
    mockActiveDirectives.mockResolvedValue([]);

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-2', 'NewAgent', null);

    expect(prompt).toContain('NewAgent');
    expect(prompt).toContain('No system prompt has been configured for you yet');
  });

  it('happy path: active directives are injected', async () => {
    mockActiveDirectives.mockResolvedValue(['Always be concise.']);

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(mockActiveDirectives).toHaveBeenCalledWith('agent-1');
    expect(prompt).toContain('MANAGER DIRECTIVES');
    expect(prompt).toContain('Always be concise.');
  });

  it('boundary: zero active directives means no directive block', async () => {
    mockActiveDirectives.mockResolvedValue([]);

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(prompt).not.toContain('MANAGER DIRECTIVES');
  });

  it('always frames this as a manager conversation and forbids pretending to be human', async () => {
    mockActiveDirectives.mockResolvedValue([]);

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(prompt.toLowerCase()).toContain('manager');
    expect(prompt.toLowerCase()).toContain('never pretend to be human');
  });
});

describe('buildAgentManagerConversationSystemPrompt — approved memory injection (Checkpoint E, 2026-08-31)', () => {
  it('happy path: real approved memory is injected, proving approval state is actually read by this runtime path', async () => {
    mockActiveDirectives.mockResolvedValue([]);
    mockApprovedMemory.mockResolvedValue(['This student prefers async follow-ups over live calls.']);

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(mockApprovedMemory).toHaveBeenCalledWith('agent-1');
    expect(prompt).toContain('APPROVED MEMORY');
    expect(prompt).toContain('This student prefers async follow-ups over live calls.');
  });

  it('boundary: zero approved memories means no memory block, no crash', async () => {
    mockActiveDirectives.mockResolvedValue([]);
    mockApprovedMemory.mockResolvedValue([]);

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(prompt).not.toContain('APPROVED MEMORY');
  });
});

describe('buildAgentManagerConversationSystemPrompt — recent activity injection (2026-09-04)', () => {
  it('happy path: real recent tickets and real recent activity are both injected, so "what have you worked on" can be answered honestly', async () => {
    mockActiveDirectives.mockResolvedValue([]);
    mockRecentActivity.mockResolvedValue({
      tickets: [{ title: 'Student flagged inactivity risk', status: 'done', updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }],
      events: [{ eventType: 'llm.call', model: 'gpt-4o-mini', costUsd: 0.000091, createdAt: new Date(Date.now() - 60 * 60 * 1000) }],
    });

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(prompt).toContain('YOUR REAL RECENT WORK');
    expect(prompt).toContain('Student flagged inactivity risk');
    expect(prompt).toContain('gpt-4o-mini');
    expect(prompt).not.toContain('no recent tickets or recorded activity');
  });

  it('honesty boundary: zero tickets and zero events means an honest "no recent activity" line, never a fabricated one', async () => {
    mockActiveDirectives.mockResolvedValue([]);
    mockRecentActivity.mockResolvedValue({ tickets: [], events: [] });

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(prompt).toContain('You have no recent tickets or recorded activity yet');
    expect(prompt).not.toContain('YOUR REAL RECENT WORK');
  });
});

describe('buildAgentManagerConversationSystemPrompt — runtime context layers (Capability 8, 2026-09-08)', () => {
  it('platform safety rules are always first, and reliability state always appears — previously missing entirely from this path', async () => {
    mockActiveDirectives.mockResolvedValue([]);

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(prompt.indexOf('PLATFORM SAFETY RULES')).toBe(1); // leading '\n' at index 0
    expect(prompt).toContain('DATA RELIABILITY STATE');
    expect(prompt.indexOf('PLATFORM SAFETY RULES')).toBeLessThan(prompt.indexOf('You are Reese.'));
  });

  it('happy path: a real role charter is fetched for this agent and injected ahead of the persona', async () => {
    mockActiveDirectives.mockResolvedValue([]);
    mockRoleCharter.mockResolvedValue('ROLE CHARTER: You are the Student Success Mentor. Keep students engaged.');

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(mockRoleCharter).toHaveBeenCalledWith('agent-1');
    expect(prompt).toContain('ROLE CHARTER');
    expect(prompt.indexOf('ROLE CHARTER')).toBeLessThan(prompt.indexOf('You are Reese.'));
  });

  it('a real active reliability issue surfaces on the manager path — the exact gap discovery found (this layer previously did not exist here at all)', async () => {
    mockActiveDirectives.mockResolvedValue([]);
    mockReliabilityState.mockResolvedValue('DATA RELIABILITY STATE (do not trust or cite these sources until restored):\n- attendance (attendance.*): quarantined — broken');

    const prompt = await buildAgentManagerConversationSystemPrompt('agent-1', 'Reese', 'You are Reese.');

    expect(prompt).toContain('attendance (attendance.*): quarantined');
  });
});
