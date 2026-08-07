/**
 * Voice/tone assertions for buildReeseSystemPrompt(), per CLAUDE.md's mandatory
 * test-type list: happy path + failure/boundary case, not just "a prompt exists."
 */
jest.mock('../../learnerContextService', () => ({
  getLearnerContextBlock: jest.fn(),
}));

import { getLearnerContextBlock } from '../../learnerContextService';
import { buildReeseSystemPrompt } from '../reeseSystemPrompt';

const mockLearnerContext = getLearnerContextBlock as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildReeseSystemPrompt', () => {
  it('happy path: contains "Reese", omits "Cory", and includes locked persona guardrails', async () => {
    mockLearnerContext.mockResolvedValue('LEARNER PROFILE: Jane, VP Engineering at Acme.');
    const prompt = await buildReeseSystemPrompt('enrollment-1');

    expect(prompt).toContain('Reese');
    // Case-insensitive: the source persona's name must never leak into the live
    // prompt text, in any casing (a prior review caught a literal
    // "docs/CORY_PERSONA_SPEC.md" citation inside the persona block - fixed).
    expect(prompt.toLowerCase()).not.toContain('cory');
    // A guardrail phrase drawn directly from the locked spec (never fakes confidence /
    // openly AI disclosure).
    expect(prompt.toLowerCase()).toMatch(/never fake confidence|openly ai/);
    // They/them framing marker from the locked spec.
    expect(prompt.toLowerCase()).toContain('they/them');
    // Learner context was actually injected.
    expect(prompt).toContain('LEARNER PROFILE: Jane, VP Engineering at Acme.');
  });

  it('boundary/failure: getLearnerContextBlock rejecting does not crash prompt building; a valid non-empty prompt is still returned', async () => {
    mockLearnerContext.mockRejectedValue(new Error('learner context service unavailable'));
    const prompt = await buildReeseSystemPrompt('enrollment-2');

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Reese');
  });

  it('boundary: an empty learner-context string (new/unknown student) still returns a valid persona-only prompt', async () => {
    mockLearnerContext.mockResolvedValue('');
    const prompt = await buildReeseSystemPrompt('enrollment-3');

    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Reese');
  });
});
