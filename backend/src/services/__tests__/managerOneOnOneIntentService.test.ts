/**
 * managerOneOnOneIntentService — Reese Agentic AI Employee mission,
 * Capability 8's SCHEDULE slice of the manager-intent classifier. Pure
 * logic: pins real trigger-phrase detection, that the manager's own message
 * becomes the agenda verbatim (never summarized/reworded), the honest
 * confirmation-card text, and that a confirmed schedule actually calls the
 * real createOneOnOne() with the pending record's real agenda.
 */
const mockCreateOneOnOne = jest.fn();
jest.mock('../agentOneOnOneService', () => ({
  createOneOnOne: (...a: any[]) => mockCreateOneOnOne(...a),
}));

import {
  applyConfirmedOneOnOneSchedule,
  buildOneOnOneConfirmationCardText,
  detectScheduleOneOnOneIntent,
  toPendingOneOnOneConfirmation,
} from '../managerOneOnOneIntentService';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateOneOnOne.mockResolvedValue({ id: 'oneOnOne-1' });
});

describe('detectScheduleOneOnOneIntent', () => {
  it.each([
    "Let's schedule a 1:1 to talk about the July cohort.",
    'Can we schedule a one-on-one for next week?',
    'Please set up a check-in soon.',
    'Book a 1:1 for Thursday.',
  ])('trigger phrase: %p', (message) => {
    const result = detectScheduleOneOnOneIntent(message);
    expect(result).not.toBeNull();
    expect(result?.agenda).toBe(message);
  });

  it('honesty boundary: no scheduling trigger phrase — no detection, no guessing', () => {
    expect(detectScheduleOneOnOneIntent('How is the July cohort doing?')).toBeNull();
  });

  it('boundary: empty message', () => {
    expect(detectScheduleOneOnOneIntent('')).toBeNull();
  });

  it('the manager\'s own message becomes the agenda verbatim, whitespace-trimmed only — never summarized or reworded', () => {
    const result = detectScheduleOneOnOneIntent('  Schedule a 1:1 about the new intake process.  ');
    expect(result?.agenda).toBe('Schedule a 1:1 about the new intake process.');
  });
});

describe('buildOneOnOneConfirmationCardText', () => {
  it('restates what was understood, states the real effect, asks for confirmation', () => {
    const text = buildOneOnOneConfirmationCardText({ agenda: "Let's schedule a 1:1 to talk about the July cohort." });

    expect(text).toContain("Let's schedule a 1:1 to talk about the July cohort.");
    expect(text).toContain('1:1');
    expect(text).toContain('confirm');
  });
});

describe('toPendingOneOnOneConfirmation', () => {
  it('carries the real agenda forward and tags intentType', () => {
    const pending = toPendingOneOnOneConfirmation({ agenda: "Let's schedule a 1:1." });

    expect(pending.intentType).toBe('SCHEDULE_ONE_ON_ONE');
    expect(pending.agenda).toBe("Let's schedule a 1:1.");
    expect(typeof pending.detectedAt).toBe('string');
  });
});

describe('applyConfirmedOneOnOneSchedule', () => {
  it('calls the real createOneOnOne() with the pending record\'s exact agenda', async () => {
    const pending = { intentType: 'SCHEDULE_ONE_ON_ONE' as const, agenda: "Let's schedule a 1:1 to talk about the July cohort.", detectedAt: '2026-09-08T00:00:00.000Z' };

    const result = await applyConfirmedOneOnOneSchedule('agent-1', pending, 'ali@colaberry.com', 'org-member-1');

    expect(mockCreateOneOnOne).toHaveBeenCalledWith('agent-1', 'org-member-1', 'ali@colaberry.com', "Let's schedule a 1:1 to talk about the July cohort.");
    expect(result.summary).toContain('scheduled');
    expect(result.summary).toContain("Let's schedule a 1:1 to talk about the July cohort.");
  });

  it('a null org member id (super admin) is passed through unchanged, not fabricated', async () => {
    const pending = { intentType: 'SCHEDULE_ONE_ON_ONE' as const, agenda: "Let's schedule a 1:1.", detectedAt: '2026-09-08T00:00:00.000Z' };

    await applyConfirmedOneOnOneSchedule('agent-1', pending, 'ali@colaberry.com', null);

    expect(mockCreateOneOnOne).toHaveBeenCalledWith('agent-1', null, 'ali@colaberry.com', "Let's schedule a 1:1.");
  });
});
