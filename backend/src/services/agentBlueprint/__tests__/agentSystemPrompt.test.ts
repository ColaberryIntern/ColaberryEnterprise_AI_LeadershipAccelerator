/**
 * Generic prompt-assembly tests. Reese's own reeseSystemPrompt.test.ts still covers
 * the Reese-wrapper's exact byte-for-byte output unchanged; this file proves the
 * EXTRACTED generic core works for an arbitrary persona block, not just Reese's.
 */
jest.mock('../../learnerContextService', () => ({
  getLearnerContextBlock: jest.fn(),
}));

import { getLearnerContextBlock } from '../../learnerContextService';
import { buildAgentSystemPrompt } from '../agentSystemPrompt';

const mockLearnerContext = getLearnerContextBlock as unknown as jest.Mock;

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
