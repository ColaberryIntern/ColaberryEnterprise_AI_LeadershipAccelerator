/**
 * Generic prompt-assembly tests. Reese's own reeseSystemPrompt.test.ts still covers
 * the Reese-wrapper's exact byte-for-byte output unchanged; this file proves the
 * EXTRACTED generic core works for an arbitrary persona block, not just Reese's.
 */
jest.mock('../../learnerContextService', () => ({
  getLearnerContextBlock: jest.fn(),
}));
jest.mock('../../managerDirectiveService', () => ({
  getActiveDirectiveTexts: jest.fn(),
}));
jest.mock('../../agentMemoryProposalService', () => ({
  getApprovedMemoryTexts: jest.fn(),
}));
// Reese Agentic AI Employee mission, Capability 8 — agentContextLayers.ts
// calls real services backed by real models (AgentRoleCharter,
// MetricReliabilityRecord); mocked wholesale here since this file only
// needs its 2 new layers to render predictable, non-empty text, not their
// own real logic (agentContextLayers.test.ts covers that).
jest.mock('../agentContextLayers', () => ({
  buildRoleCharterBlock: jest.fn(() => Promise.resolve('')),
  buildReliabilityStateBlock: jest.fn(() => Promise.resolve('DATA RELIABILITY STATE: No data sources are currently flagged unreliable — all known sources are healthy.')),
}));

import { getLearnerContextBlock } from '../../learnerContextService';
import { getActiveDirectiveTexts } from '../../managerDirectiveService';
import { getApprovedMemoryTexts } from '../../agentMemoryProposalService';
import { buildRoleCharterBlock } from '../agentContextLayers';
import { buildAgentSystemPrompt } from '../agentSystemPrompt';

const mockLearnerContext = getLearnerContextBlock as unknown as jest.Mock;
const mockActiveDirectives = getActiveDirectiveTexts as unknown as jest.Mock;
const mockApprovedMemory = getApprovedMemoryTexts as unknown as jest.Mock;
const mockRoleCharter = buildRoleCharterBlock as unknown as jest.Mock;

const CURRICULUM_QA_PERSONA = `You are CurriculumQA, a review agent that checks generated curriculum content for
factual and pedagogical quality before it reaches students.

VOICE PRINCIPLES (locked):
- Precise over vague. Cite the exact line or claim under review.
- Never fake confidence — flag uncertainty rather than approve blind.

GUARDRAILS (never do these):
- Never approve content you have not actually checked.
- Neutral pronouns — you are referred to as "they/them," never gendered.`;

beforeEach(() => {
  jest.clearAllMocks();
  mockApprovedMemory.mockResolvedValue([]);
});

describe('buildAgentSystemPrompt', () => {
  it('happy path: contains the supplied persona block and injects real learner context', async () => {
    mockLearnerContext.mockResolvedValue('LEARNER PROFILE: Jane, VP Engineering at Acme.');
    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-1');

    expect(prompt).toContain('CurriculumQA');
    expect(prompt.toLowerCase()).toContain('they/them');
    expect(prompt).toContain('LEARNER PROFILE: Jane, VP Engineering at Acme.');
  });

  it('boundary/failure: getLearnerContextBlock rejecting does not crash prompt building; a valid non-empty prompt is still returned', async () => {
    mockLearnerContext.mockRejectedValue(new Error('learner context service unavailable'));
    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-2');

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('CurriculumQA');
  });

  it('boundary: an empty learner-context string still returns a valid persona-only prompt', async () => {
    mockLearnerContext.mockResolvedValue('');
    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-3');

    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('CurriculumQA');
  });

  it('default closing line is used when options are omitted', async () => {
    mockLearnerContext.mockResolvedValue('');
    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-4');
    expect(prompt).toContain('direct-message conversation');
  });

  it('custom closing line overrides the default when supplied', async () => {
    mockLearnerContext.mockResolvedValue('');
    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-5', {
      closingLine: '\nThis is an asynchronous review queue, not a live chat.',
    });
    expect(prompt).toContain('asynchronous review queue');
    expect(prompt).not.toContain('direct-message conversation');
  });
});

describe('buildAgentSystemPrompt — manager directive injection (Checkpoint C, 2026-08-28)', () => {
  it('regression: omitting agentId never calls getActiveDirectiveTexts, getApprovedMemoryTexts, or buildRoleCharterBlock at all — no directive/memory/role-charter block, though the new universal layers (safety rules, reliability state) still appear regardless of agentId', async () => {
    mockLearnerContext.mockResolvedValue('');
    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-6');

    expect(mockActiveDirectives).not.toHaveBeenCalled();
    expect(mockApprovedMemory).not.toHaveBeenCalled();
    expect(mockRoleCharter).not.toHaveBeenCalled();
    expect(prompt).not.toContain('MANAGER DIRECTIVES');
    expect(prompt).not.toContain('APPROVED MEMORY');
    expect(prompt).not.toContain('ROLE CHARTER');
    expect(prompt).toContain('PLATFORM SAFETY RULES');
    expect(prompt).toContain('DATA RELIABILITY STATE');
  });

  it('happy path: agentId with active directives injects a real MANAGER DIRECTIVES block', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockActiveDirectives.mockResolvedValue(['Always loop in the manager on financial tickets.', 'Never discuss pricing before Tuesday.']);

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-7', { agentId: 'agent-1' });

    expect(mockActiveDirectives).toHaveBeenCalledWith('agent-1');
    expect(prompt).toContain('MANAGER DIRECTIVES');
    expect(prompt).toContain('Always loop in the manager on financial tickets.');
    expect(prompt).toContain('Never discuss pricing before Tuesday.');
    expect(prompt).toContain('never grant you anything beyond what you already have');
  });

  it('boundary: agentId given but zero active directives — no directive block, no crash', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockActiveDirectives.mockResolvedValue([]);

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-8', { agentId: 'agent-2' });

    expect(mockActiveDirectives).toHaveBeenCalledWith('agent-2');
    expect(prompt).not.toContain('MANAGER DIRECTIVES');
  });

  it('the directive block never appears inside the persona block itself — it is additive text, never mutating what was passed in', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockActiveDirectives.mockResolvedValue(['Escalate any unresolved thread after 48 hours.']);

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-9', { agentId: 'agent-3' });

    const personaEndIndex = prompt.indexOf('GUARDRAILS') + 'GUARDRAILS'.length;
    const directiveIndex = prompt.indexOf('MANAGER DIRECTIVES');
    expect(directiveIndex).toBeGreaterThan(personaEndIndex);
  });
});

describe('buildAgentSystemPrompt — approved memory injection (Checkpoint E, 2026-08-31)', () => {
  it('happy path: agentId with approved memory injects a real APPROVED MEMORY block — the actual proof approval state is read by the runtime, not a dead flag', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockActiveDirectives.mockResolvedValue([]);
    mockApprovedMemory.mockResolvedValue(['This learner responds best to worked examples before theory.']);

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-10', { agentId: 'agent-4' });

    expect(mockApprovedMemory).toHaveBeenCalledWith('agent-4');
    expect(prompt).toContain('APPROVED MEMORY');
    expect(prompt).toContain('This learner responds best to worked examples before theory.');
  });

  it('boundary: agentId given but zero approved memories — no memory block, no crash', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockActiveDirectives.mockResolvedValue([]);
    mockApprovedMemory.mockResolvedValue([]);

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-11', { agentId: 'agent-5' });

    expect(mockApprovedMemory).toHaveBeenCalledWith('agent-5');
    expect(prompt).not.toContain('APPROVED MEMORY');
  });

  it('directives and approved memory can both appear in the same prompt, as two distinct additive blocks', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockActiveDirectives.mockResolvedValue(['Escalate unresolved threads after 48 hours.']);
    mockApprovedMemory.mockResolvedValue(['This learner prefers written feedback over live calls.']);

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-12', { agentId: 'agent-6' });

    expect(prompt).toContain('MANAGER DIRECTIVES');
    expect(prompt).toContain('APPROVED MEMORY');
    expect(prompt.indexOf('APPROVED MEMORY')).toBeGreaterThan(prompt.indexOf('MANAGER DIRECTIVES'));
  });
});

describe('buildAgentSystemPrompt — runtime context layers (Capability 8, 2026-09-08)', () => {
  it('platform safety rules are always the first content in the prompt, ahead of the persona block', async () => {
    mockLearnerContext.mockResolvedValue('');

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-13');

    const safetyIndex = prompt.indexOf('PLATFORM SAFETY RULES');
    const personaIndex = prompt.indexOf('CurriculumQA');
    expect(safetyIndex).toBeGreaterThanOrEqual(0);
    expect(safetyIndex).toBeLessThan(personaIndex);
  });

  it('the reliability-state layer always appears, even with no agentId and no learner context', async () => {
    mockLearnerContext.mockResolvedValue('');

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-14');

    expect(prompt).toContain('DATA RELIABILITY STATE');
  });

  it('happy path: a real role charter (agentId set, charter exists) is injected between safety rules and the persona block', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockActiveDirectives.mockResolvedValue([]);
    mockRoleCharter.mockResolvedValue('ROLE CHARTER: You are the Curriculum Reviewer. Check content before it reaches students.');

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-15', { agentId: 'agent-7' });

    expect(mockRoleCharter).toHaveBeenCalledWith('agent-7');
    const safetyIndex = prompt.indexOf('PLATFORM SAFETY RULES');
    const charterIndex = prompt.indexOf('ROLE CHARTER');
    const personaIndex = prompt.indexOf('CurriculumQA');
    expect(safetyIndex).toBeLessThan(charterIndex);
    expect(charterIndex).toBeLessThan(personaIndex);
  });

  it('boundary: agentId set but no charter written yet (empty string) means no ROLE CHARTER block, no crash', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockActiveDirectives.mockResolvedValue([]);
    mockRoleCharter.mockResolvedValue('');

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-16', { agentId: 'agent-8' });

    expect(prompt).not.toContain('ROLE CHARTER');
  });

  it('extraBlocksBeforeClosing lands before the closing line, not appended after the whole prompt', async () => {
    mockLearnerContext.mockResolvedValue('');

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-17', {
      extraBlocksBeforeClosing: ['STUDENT SUCCESS 360: real evidence block.'],
    });

    const extraIndex = prompt.indexOf('STUDENT SUCCESS 360');
    const closingIndex = prompt.indexOf('direct-message conversation');
    expect(extraIndex).toBeGreaterThanOrEqual(0);
    expect(extraIndex).toBeLessThan(closingIndex);
  });

  it('empty/falsy entries in extraBlocksBeforeClosing are skipped, never rendered as blank sections', async () => {
    mockLearnerContext.mockResolvedValue('');

    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-18', {
      extraBlocksBeforeClosing: ['', 'REAL BLOCK: present.'],
    });

    expect(prompt).toContain('REAL BLOCK: present.');
    // no stray leading blank line from the skipped empty entry
    expect(prompt).not.toContain('\n\n\nREAL BLOCK');
  });
});
