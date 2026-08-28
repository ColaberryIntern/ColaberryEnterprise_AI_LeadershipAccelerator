/**
 * Voice/tone assertions for buildReeseSystemPrompt(), per CLAUDE.md's mandatory
 * test-type list: happy path + failure/boundary case, not just "a prompt exists."
 */
jest.mock('../../learnerContextService', () => ({
  getLearnerContextBlock: jest.fn(),
}));
jest.mock('../reeseIdentitySeed', () => ({
  getReeseAgentId: jest.fn(),
}));
jest.mock('../../managerDirectiveService', () => ({
  getActiveDirectiveTexts: jest.fn(),
}));

import { getLearnerContextBlock } from '../../learnerContextService';
import { getReeseAgentId } from '../reeseIdentitySeed';
import { getActiveDirectiveTexts } from '../../managerDirectiveService';
import { buildReeseSystemPrompt } from '../reeseSystemPrompt';

const mockLearnerContext = getLearnerContextBlock as unknown as jest.Mock;
const mockGetReeseAgentId = getReeseAgentId as unknown as jest.Mock;
const mockActiveDirectives = getActiveDirectiveTexts as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Real Reese resolves to a real agent id in production; default her to that
  // shape here so existing voice/tone tests exercise the real code path
  // (agentId resolved, zero active directives) rather than the degraded one.
  mockGetReeseAgentId.mockResolvedValue('reese-agent-id');
  mockActiveDirectives.mockResolvedValue([]);
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

describe('buildReeseSystemPrompt — manager directive injection (Checkpoint C, 2026-08-28)', () => {
  it('happy path: an active directive for Reese\'s real agent id is injected into her live prompt', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockActiveDirectives.mockResolvedValue(['Always suggest a mentor session after the third unresolved question in one thread.']);

    const prompt = await buildReeseSystemPrompt('enrollment-4');

    expect(mockActiveDirectives).toHaveBeenCalledWith('reese-agent-id');
    expect(prompt).toContain('MANAGER DIRECTIVES');
    expect(prompt).toContain('Always suggest a mentor session after the third unresolved question in one thread.');
  });

  it('boundary/failure: getReeseAgentId rejecting degrades to the exact pre-Checkpoint-C behavior (no directive block, no crash, no directive lookup attempted)', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockGetReeseAgentId.mockRejectedValue(new Error('identity not seeded yet'));

    const prompt = await buildReeseSystemPrompt('enrollment-5');

    expect(prompt).toContain('Reese');
    expect(prompt).not.toContain('MANAGER DIRECTIVES');
    expect(mockActiveDirectives).not.toHaveBeenCalled();
  });

  it('boundary: getReeseAgentId resolving to null (identity genuinely not seeded) also degrades cleanly', async () => {
    mockLearnerContext.mockResolvedValue('');
    mockGetReeseAgentId.mockResolvedValue(null);

    const prompt = await buildReeseSystemPrompt('enrollment-6');

    expect(prompt).toContain('Reese');
    expect(prompt).not.toContain('MANAGER DIRECTIVES');
    expect(mockActiveDirectives).not.toHaveBeenCalled();
  });
});
