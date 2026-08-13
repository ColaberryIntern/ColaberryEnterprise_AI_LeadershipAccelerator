/**
 * Reese Phase 2 — shared message-generation module used by both a new
 * outreach thread (T005) and a follow-up (T006). Confirms every message is a
 * real LLM completion grounded in the caller's real signal data (never a
 * templated string), and that an empty completion is a hard failure, not a
 * silently swallowed fallback.
 */
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../learnerContextService', () => ({ getLearnerContextBlock: jest.fn() }));

import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { getLearnerContextBlock } from '../../learnerContextService';
import { generateOutreachMessage } from '../reeseOutreachMessageService';

const mockGetInstrumentedOpenAI = getInstrumentedOpenAI as unknown as jest.Mock;
const mockGetLearnerContextBlock = getLearnerContextBlock as unknown as jest.Mock;

// Module-scoped OpenAI client cache (same convention as reeseReplyService.ts) —
// ONE stable mock function reference across the whole file, reset (not
// replaced) between tests.
const mockCreateCompletion = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLearnerContextBlock.mockResolvedValue('LEARNER CONTEXT BLOCK');
  mockCreateCompletion.mockReset();
  mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: 'A real, grounded outreach message.' } }] });
  mockGetInstrumentedOpenAI.mockReturnValue({ chat: { completions: { create: mockCreateCompletion } } });
});

describe('generateOutreachMessage', () => {
  it('grounds the prompt in the REAL signal_snapshot data, not a fixed string', async () => {
    await generateOutreachMessage({
      enrollmentId: 'student-1',
      signalType: 'inactivity',
      signalSnapshot: { daysSinceActive: 11, completionPct: 4 },
      goal: 'Confirm re-engagement within 7 days.',
      isFollowUp: false,
      attemptNumber: 1,
    });

    const [{ messages }] = mockCreateCompletion.mock.calls[0];
    const systemPrompt = messages[0].content as string;
    expect(systemPrompt).toContain('11 days');
    expect(systemPrompt).toContain('4%');
    expect(systemPrompt).toContain('Confirm re-engagement within 7 days.');
  });

  it('frames a first message as INITIATING contact, not a reply', async () => {
    await generateOutreachMessage({
      enrollmentId: 'student-1',
      signalType: 'behavior_anomaly',
      signalSnapshot: { idleCount: 5, lessonTitle: 'Intro to Agents', windowHours: 24 },
      goal: 'Confirm student is unstuck.',
      isFollowUp: false,
      attemptNumber: 1,
    });

    const [{ messages }] = mockCreateCompletion.mock.calls[0];
    expect(messages[0].content).toContain('INITIATING');
    expect(messages[0].content).toContain('Intro to Agents');
  });

  it('frames a follow-up as a continuation, referencing the real attempt number', async () => {
    await generateOutreachMessage({
      enrollmentId: 'student-1',
      signalType: 'inactivity',
      signalSnapshot: { daysSinceActive: 18, completionPct: 4 },
      goal: 'Confirm re-engagement within 7 days.',
      isFollowUp: true,
      attemptNumber: 2,
    });

    const [{ messages }] = mockCreateCompletion.mock.calls[0];
    expect(messages[0].content).toContain('follow-up message 2 of at most 3');
  });

  it('degrades gracefully if learner context lookup fails, still produces a real message', async () => {
    mockGetLearnerContextBlock.mockRejectedValue(new Error('learner context down'));

    const message = await generateOutreachMessage({
      enrollmentId: 'student-1',
      signalType: 'inactivity',
      signalSnapshot: { daysSinceActive: 11, completionPct: 4 },
      goal: 'Confirm re-engagement within 7 days.',
      isFollowUp: false,
      attemptNumber: 1,
    });

    expect(message).toBe('A real, grounded outreach message.');
  });

  it('failure path: throws (never returns a fallback template) when the completion is empty', async () => {
    mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '' } }] });

    await expect(
      generateOutreachMessage({
        enrollmentId: 'student-1',
        signalType: 'inactivity',
        signalSnapshot: { daysSinceActive: 11, completionPct: 4 },
        goal: 'Confirm re-engagement within 7 days.',
        isFollowUp: false,
        attemptNumber: 1,
      }),
    ).rejects.toThrow(/empty completion/);
  });
});
