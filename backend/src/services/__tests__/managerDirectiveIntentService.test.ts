/**
 * managerDirectiveIntentService — Reese Agentic AI Employee mission,
 * Capability 8's INSTRUCT slice of the manager-intent classifier. Pure
 * logic: pins real trigger-phrase detection, that the manager's own
 * message becomes the directive text verbatim, the honest confirmation-card
 * text, and that a confirmed directive actually calls the real
 * createDirective() with the pending record's real text.
 */
const mockCreateDirective = jest.fn();
jest.mock('../managerDirectiveService', () => ({
  createDirective: (...a: any[]) => mockCreateDirective(...a),
}));

import {
  applyConfirmedDirective,
  buildDirectiveConfirmationCardText,
  detectInstructIntent,
  toPendingDirectiveConfirmation,
} from '../managerDirectiveIntentService';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateDirective.mockResolvedValue({ id: 'directive-1' });
});

describe('detectInstructIntent', () => {
  it.each([
    'New directive: always loop in the manager before closing a ticket.',
    'From now on, always CC me on financial tickets.',
    'Going forward, never discuss pricing before Tuesday.',
    "Here's your instruction: always ask before quarantining a metric.",
    'Standing rule: escalate anything over $500.',
  ])('trigger phrase: %p', (message) => {
    const result = detectInstructIntent(message);
    expect(result).not.toBeNull();
    expect(result?.directiveText).toBe(message);
  });

  it('honesty boundary: an ordinary imperative sentence with no standing-directive trigger phrase — no detection, no guessing', () => {
    expect(detectInstructIntent('Please close that ticket.')).toBeNull();
  });

  it('boundary: empty message', () => {
    expect(detectInstructIntent('')).toBeNull();
  });

  it('the manager\'s own message becomes the directive text verbatim, whitespace-trimmed only', () => {
    const result = detectInstructIntent('  From now on, always confirm before emailing a student.  ');
    expect(result?.directiveText).toBe('From now on, always confirm before emailing a student.');
  });
});

describe('buildDirectiveConfirmationCardText', () => {
  it('restates what was understood, states the real ongoing effect, asks for confirmation', () => {
    const text = buildDirectiveConfirmationCardText({ directiveText: 'From now on, always CC me on financial tickets.' });

    expect(text).toContain('From now on, always CC me on financial tickets.');
    expect(text).toContain('standing directive');
    expect(text).toContain('confirm');
  });
});

describe('toPendingDirectiveConfirmation', () => {
  it('carries the real directive text forward and tags intentType', () => {
    const pending = toPendingDirectiveConfirmation({ directiveText: 'Standing rule: escalate anything over $500.' });

    expect(pending.intentType).toBe('INSTRUCT');
    expect(pending.directiveText).toBe('Standing rule: escalate anything over $500.');
    expect(typeof pending.detectedAt).toBe('string');
  });
});

describe('applyConfirmedDirective', () => {
  it('calls the real createDirective() with the pending record\'s exact text', async () => {
    const pending = { intentType: 'INSTRUCT' as const, directiveText: 'Standing rule: escalate anything over $500.', detectedAt: '2026-09-09T00:00:00.000Z' };

    const result = await applyConfirmedDirective('agent-1', pending, 'ali@colaberry.com', 'org-member-1');

    expect(mockCreateDirective).toHaveBeenCalledWith('agent-1', 'org-member-1', 'ali@colaberry.com', 'Standing rule: escalate anything over $500.');
    expect(result.summary).toContain('Standing rule: escalate anything over $500.');
  });

  it('a null org member id (super admin) is passed through unchanged, not fabricated', async () => {
    const pending = { intentType: 'INSTRUCT' as const, directiveText: 'From now on, always CC me.', detectedAt: '2026-09-09T00:00:00.000Z' };

    await applyConfirmedDirective('agent-1', pending, 'ali@colaberry.com', null);

    expect(mockCreateDirective).toHaveBeenCalledWith('agent-1', null, 'ali@colaberry.com', 'From now on, always CC me.');
  });
});
