/**
 * managerGoalIntentService — Reese Agentic AI Employee mission, Capability 8's
 * CHANGE_GOAL slice of the manager-intent classifier. Pure logic: pins real
 * trigger-phrase + metric + numeric-target detection (both metrics, both
 * comparisons), the honest confirmation-card text, and that a confirmed
 * change actually calls the real createGoal() with the pending record's
 * real fields — never a bare write disconnected from what was proposed.
 */
const mockCreateGoal = jest.fn();
jest.mock('../agentGoalService', () => ({
  createGoal: (...a: any[]) => mockCreateGoal(...a),
}));

import {
  applyConfirmedGoalChange,
  buildGoalConfirmationCardText,
  detectChangeGoalIntent,
  toPendingGoalConfirmation,
} from '../managerGoalIntentService';

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateGoal.mockResolvedValue({ id: 'goal-1' });
});

describe('detectChangeGoalIntent', () => {
  it.each([
    ['Set a goal: monthly cost at most $500.', 'monthly_cost_usd', 'at_most', 500],
    ['Change the goal — budget should be at most $1,200.', 'monthly_cost_usd', 'at_most', 1200],
    ['Update your goal so spend is at least $200 per month.', 'monthly_cost_usd', 'at_least', 200],
  ])('cost goal: %p', (message, metricKey, comparison, targetValue) => {
    const result = detectChangeGoalIntent(message);
    expect(result).not.toBeNull();
    expect(result?.metricKey).toBe(metricKey);
    expect(result?.comparison).toBe(comparison);
    expect(result?.targetValue).toBe(targetValue);
    expect(result?.reason).toBe(message);
  });

  it.each([
    ['Set a goal: open tickets at most 5.', 'open_ticket_count', 'at_most', 5],
    ['New goal — tickets should be at least 2.', 'open_ticket_count', 'at_least', 2],
  ])('ticket goal: %p', (message, metricKey, comparison, targetValue) => {
    const result = detectChangeGoalIntent(message);
    expect(result?.metricKey).toBe(metricKey);
    expect(result?.comparison).toBe(comparison);
    expect(result?.targetValue).toBe(targetValue);
  });

  it('honesty boundary: a goal-change trigger phrase with no known metric named — no detection, no guessing', () => {
    expect(detectChangeGoalIntent('Set a goal for next week.')).toBeNull();
  });

  it('honesty boundary: a goal-change trigger + a metric keyword but no parseable numeric target — no detection', () => {
    expect(detectChangeGoalIntent('Set a goal: keep the monthly cost reasonable.')).toBeNull();
  });

  it('honesty boundary: mentions cost and a number with no goal-change trigger phrase — no detection', () => {
    expect(detectChangeGoalIntent('The monthly cost was $500 last month.')).toBeNull();
  });

  it('boundary: empty message', () => {
    expect(detectChangeGoalIntent('')).toBeNull();
  });

  it('boundary: a dollar amount with commas parses correctly', () => {
    const result = detectChangeGoalIntent('Set a goal: cost at most $1,250.50.');
    expect(result?.targetValue).toBe(1250.5);
  });
});

describe('buildGoalConfirmationCardText', () => {
  it('restates what was understood, states the real effect, asks for confirmation', () => {
    const text = buildGoalConfirmationCardText({ metricKey: 'monthly_cost_usd', comparison: 'at_most', targetValue: 500, reason: 'Set a goal: monthly cost at most $500.' });

    expect(text).toContain('monthly cost');
    expect(text).toContain('$500');
    expect(text).toContain('Set a goal: monthly cost at most $500.');
    expect(text).toContain('confirm');
  });

  it('ticket goal: uses the ticket-count label and plain numeric target, not a dollar sign', () => {
    const text = buildGoalConfirmationCardText({ metricKey: 'open_ticket_count', comparison: 'at_least', targetValue: 3, reason: 'Set a goal: tickets at least 3.' });

    expect(text).toContain('open ticket count');
    expect(text).toContain('at least 3');
    expect(text).not.toContain('$3');
  });
});

describe('toPendingGoalConfirmation', () => {
  it('carries every real field forward and tags intentType', () => {
    const pending = toPendingGoalConfirmation({ metricKey: 'monthly_cost_usd', comparison: 'at_most', targetValue: 500, reason: 'Set a goal: monthly cost at most $500.' });

    expect(pending.intentType).toBe('CHANGE_GOAL');
    expect(pending.metricKey).toBe('monthly_cost_usd');
    expect(pending.comparison).toBe('at_most');
    expect(pending.targetValue).toBe(500);
    expect(pending.reason).toBe('Set a goal: monthly cost at most $500.');
    expect(typeof pending.detectedAt).toBe('string');
  });
});

describe('applyConfirmedGoalChange', () => {
  it('calls the real createGoal() with the pending record\'s exact fields', async () => {
    const pending = { intentType: 'CHANGE_GOAL' as const, metricKey: 'monthly_cost_usd', comparison: 'at_most' as const, targetValue: 500, reason: 'Set a goal: monthly cost at most $500.', detectedAt: '2026-09-08T00:00:00.000Z' };

    const result = await applyConfirmedGoalChange('agent-1', pending, 'ali@colaberry.com', 'org-member-1');

    expect(mockCreateGoal).toHaveBeenCalledWith('agent-1', 'org-member-1', 'ali@colaberry.com', 'monthly_cost_usd', 'at_most', 500);
    expect(result.summary).toContain('monthly cost');
    expect(result.summary).toContain('$500');
  });

  it('a null org member id (super admin) is passed through unchanged, not fabricated', async () => {
    const pending = { intentType: 'CHANGE_GOAL' as const, metricKey: 'open_ticket_count', comparison: 'at_least' as const, targetValue: 2, reason: 'New goal — tickets at least 2.', detectedAt: '2026-09-08T00:00:00.000Z' };

    await applyConfirmedGoalChange('agent-1', pending, 'ali@colaberry.com', null);

    expect(mockCreateGoal).toHaveBeenCalledWith('agent-1', null, 'ali@colaberry.com', 'open_ticket_count', 'at_least', 2);
  });
});
