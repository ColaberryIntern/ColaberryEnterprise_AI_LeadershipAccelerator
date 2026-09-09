const decisionFindAll = jest.fn();
const decisionUpdate = jest.fn();
const campaignFindByPk = jest.fn();
const scheduledCreate = jest.fn();
const isEnabled = jest.fn();

jest.mock('../../../models', () => ({
  ExplorerJourneyDecision: {
    findAll: (...a: unknown[]) => decisionFindAll(...a),
    update: (...a: unknown[]) => decisionUpdate(...a),
  },
  Campaign: { findByPk: (...a: unknown[]) => campaignFindByPk(...a) },
}));
jest.mock('../../../models/ScheduledEmail', () => ({
  __esModule: true,
  default: { create: (...a: unknown[]) => scheduledCreate(...a) },
}));
jest.mock('../../../config/explorerGrowthFlags', () => ({
  ...jest.requireActual('../../../config/explorerGrowthFlags'),
  isExplorerFeatureEnabled: (...a: unknown[]) => isEnabled(...a),
}));

import { runExplorerExecution, executeDecision, DECISION_FRESHNESS_HOURS } from '../explorerExecutor';

/**
 * EPIC 6 — the last switch before a learner receives something.
 *
 * The executor sends nothing itself: it creates a pending ScheduledEmail and
 * the existing engine does the rest, which is what routes every send through
 * evaluateSend, the validator and the fact guard. So these tests are mostly
 * about what it REFUSES to queue.
 */

const NOW = new Date('2026-09-09T12:00:00Z');
const FRESH = new Date(NOW.getTime() - 60 * 60 * 1000);
const STALE = new Date(NOW.getTime() - (DECISION_FRESHNESS_HOURS + 1) * 3_600_000);

const decision = (over: Record<string, unknown> = {}) => ({
  id: 'dec-1',
  lead_id: 42,
  selected_action: 'SEND_EMAIL',
  selected_campaign_id: 'camp-1',
  selected_sequence_step: 0,
  channel: 'email',
  executed: false,
  scheduled_email_id: null,
  created_at: FRESH,
  ...over,
});

const result = () => ({ attempted: 0, queued: 0, skipped: 0, reasons: {} as Record<string, number> });

beforeEach(() => {
  jest.clearAllMocks();
  isEnabled.mockReturnValue(true);
  campaignFindByPk.mockResolvedValue({ id: 'camp-1', status: 'active', sequence_id: 'seq-1' });
  scheduledCreate.mockResolvedValue({ id: 'sched-1' });
  decisionUpdate.mockResolvedValue([1]);
  decisionFindAll.mockResolvedValue([]);
});

describe('the flag is the last switch', () => {
  it('does nothing at all when execution is off', async () => {
    isEnabled.mockReturnValue(false);

    const r = await runExplorerExecution(NOW);

    expect(r).toEqual({ skipped: true });
    expect(decisionFindAll).not.toHaveBeenCalled();
    expect(scheduledCreate).not.toHaveBeenCalled();
  });

  it('reads the flag through isExplorerFeatureEnabled, so the master switch still governs', async () => {
    await runExplorerExecution(NOW);
    expect(isEnabled).toHaveBeenCalledWith('execution', expect.anything());
  });
});

describe('it queues work rather than sending', () => {
  it('creates a pending scheduled email and marks the decision executed', async () => {
    const r = result();
    await executeDecision(decision() as never, NOW, r);

    expect(scheduledCreate).toHaveBeenCalledTimes(1);
    expect(scheduledCreate.mock.calls[0][0]).toMatchObject({
      lead_id: 42,
      campaign_id: 'camp-1',
      status: 'pending',
      channel: 'email',
    });
    expect(r.queued).toBe(1);
  });

  it('carries NO subject or body', async () => {
    // The engine generates at send time, which is what routes the copy through
    // messageValidatorService and the fact guard. Pre-rendering here bypasses
    // both.
    await executeDecision(decision() as never, NOW, result());

    const payload = scheduledCreate.mock.calls[0][0];
    expect(payload.subject).toBeUndefined();
    expect(payload.body).toBeUndefined();
  });

  it('links the decision to the scheduled email', async () => {
    await executeDecision(decision() as never, NOW, result());

    expect(decisionUpdate).toHaveBeenCalledWith(
      { executed: true, scheduled_email_id: 'sched-1' },
      { where: { id: 'dec-1' } },
    );
  });

  it('marks executed only AFTER the row exists', async () => {
    // The reverse order leaves a decision claiming an email that was never
    // queued, and nothing retries it.
    const order: string[] = [];
    scheduledCreate.mockImplementation(async () => { order.push('create'); return { id: 'sched-1' }; });
    decisionUpdate.mockImplementation(async () => { order.push('update'); return [1]; });

    await executeDecision(decision() as never, NOW, result());

    expect(order).toEqual(['create', 'update']);
  });
});

describe('what it refuses to queue', () => {
  it.each([
    ['already executed', { executed: true }, 'already_executed'],
    ['already has a scheduled email', { scheduled_email_id: 'sched-9' }, 'already_executed'],
    ['a WAIT decision', { selected_action: 'WAIT' }, 'not_a_send'],
    ['a lesson recommendation', { selected_action: 'RECOMMEND_LESSON' }, 'not_a_send'],
    ['no lead', { lead_id: null }, 'no_lead'],
    ['no campaign', { selected_campaign_id: null }, 'no_campaign'],
    ['a stale decision', { created_at: STALE }, 'stale_decision'],
  ])('refuses %s', async (_label, over, reason) => {
    const r = result();
    await executeDecision(decision(over) as never, NOW, r);

    expect(scheduledCreate).not.toHaveBeenCalled();
    expect(r.queued).toBe(0);
    expect(r.reasons[reason]).toBe(1);
  });

  it('refuses when the campaign has been paused since the decision', async () => {
    // Pausing a campaign is how a human stops a send. It has to work on
    // decisions already made — the Governor's verdict is a proposal, not a
    // warrant.
    campaignFindByPk.mockResolvedValue({ id: 'camp-1', status: 'paused', sequence_id: 'seq-1' });

    const r = result();
    await executeDecision(decision() as never, NOW, r);

    expect(scheduledCreate).not.toHaveBeenCalled();
    expect(r.reasons.campaign_not_active).toBe(1);
  });

  it('refuses when the campaign has vanished', async () => {
    campaignFindByPk.mockResolvedValue(null);
    const r = result();
    await executeDecision(decision() as never, NOW, r);
    expect(r.reasons.campaign_not_active).toBe(1);
  });
});

describe('idempotency — the property that stops duplicate emails', () => {
  it('queues nothing on a second pass over the same decision', async () => {
    const r = result();
    const d = decision();

    await executeDecision(d as never, NOW, r);
    expect(r.queued).toBe(1);

    // Second pass sees the row as the database now has it.
    await executeDecision({ ...d, executed: true, scheduled_email_id: 'sched-1' } as never, NOW, r);

    expect(scheduledCreate).toHaveBeenCalledTimes(1);
    expect(r.queued).toBe(1);
  });
});

describe('one bad decision does not stop the batch', () => {
  it('keeps going and leaves the failure unexecuted for the next run', async () => {
    decisionFindAll.mockResolvedValue([decision({ id: 'bad' }), decision({ id: 'good' })]);
    scheduledCreate
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ id: 'sched-2' });

    const r = (await runExplorerExecution(NOW)) as { queued: number; reasons: Record<string, number> };

    expect(r.queued).toBe(1);
    expect(r.reasons.error).toBe(1);
    // The failed one was never marked executed, so it is retried.
    expect(decisionUpdate).toHaveBeenCalledTimes(1);
    expect(decisionUpdate.mock.calls[0][1]).toEqual({ where: { id: 'good' } });
  });
});
