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

import { getLearnerContextBlock } from '../../learnerContextService';
import { getActiveDirectiveTexts } from '../../managerDirectiveService';
import { getApprovedMemoryTexts } from '../../agentMemoryProposalService';
import { buildAgentSystemPrompt } from '../agentSystemPrompt';

const mockLearnerContext = getLearnerContextBlock as unknown as jest.Mock;
const mockActiveDirectives = getActiveDirectiveTexts as unknown as jest.Mock;
const mockApprovedMemory = getApprovedMemoryTexts as unknown as jest.Mock;

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
  it('regression: omitting agentId never calls getActiveDirectiveTexts at all (byte-for-byte backward compat with every pre-Checkpoint-C caller)', async () => {
    mockLearnerContext.mockResolvedValue('');
    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA, 'enrollment-6');

    expect(mockActiveDirectives).not.toHaveBeenCalled();
    expect(mockApprovedMemory).not.toHaveBeenCalled();
    expect(prompt).not.toContain('MANAGER DIRECTIVES');
    expect(prompt).not.toContain('APPROVED MEMORY');
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
