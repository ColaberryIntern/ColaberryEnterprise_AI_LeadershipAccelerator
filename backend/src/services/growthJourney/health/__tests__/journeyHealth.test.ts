/**
 * The journey health reader (Phase 6, T609).
 *
 * Every field from fixture rows, plus the four places the plan did not match the schema:
 * the TTL that actually ages a `pending_review` receipt, the hold that is not in the ledger,
 * the fourth cron state, and the capped refusal read. And the rule that governs the whole
 * surface: no address reaches a response, including as an object KEY.
 */

const executionFindAll = jest.fn();
const executionCount = jest.fn();
const decisionFindAll = jest.fn();
const scheduledFindAll = jest.fn();
const controlFindAll = jest.fn();
const agentFindAll = jest.fn();

jest.mock('../../../../models', () => ({
  AiAgent: { findAll: (...a: unknown[]) => agentFindAll(...a) },
  GrowthJourneyDecision: { findAll: (...a: unknown[]) => decisionFindAll(...a) },
  GrowthJourneyExecution: { findAll: (...a: unknown[]) => executionFindAll(...a), count: (...a: unknown[]) => executionCount(...a) },
  GrowthJourneyExecutionControl: { findAll: (...a: unknown[]) => controlFindAll(...a) },
  ScheduledEmail: { findAll: (...a: unknown[]) => scheduledFindAll(...a) },
}));

const readJourneyEvents = jest.fn();
// The real LEDGER_READ_DEFAULT_ROWS travels with the mock: the cap cells compare against it, and a
// mock that omitted it would leave them comparing against `undefined` and passing for the wrong reason.
jest.mock('../../ledgerRead', () => ({
  readJourneyEvents: (...a: unknown[]) => readJourneyEvents(...a),
  LEDGER_READ_DEFAULT_ROWS: 500,
}));

import { Op } from 'sequelize';

import { PROPOSAL_TTL_HOURS } from '../../execution/proposalFiler';
import { LEDGER_READ_DEFAULT_ROWS } from '../../ledgerRead';
import { buildJourneyHealth, CRON_SLACK_MINUTES, MAX_HEALTH_CONTROLS, MAX_HEALTH_DECISIONS, MAX_HEALTH_ROWS, periodMinutes } from '../journeyHealth';

const NOW = new Date('2026-09-29T18:00:00.000Z');
const HOUR = 3_600_000;

/** A Sequelize-ish row: `get(key)`, because the reader never spreads an instance. */
const row = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });

beforeEach(() => {
  executionFindAll.mockResolvedValue([]);
  executionCount.mockResolvedValue(0);
  decisionFindAll.mockResolvedValue([]);
  scheduledFindAll.mockResolvedValue([]);
  controlFindAll.mockResolvedValue([]);
  agentFindAll.mockResolvedValue([]);
  readJourneyEvents.mockResolvedValue({ rows: [], timed_out: false });
});

afterEach(() => jest.clearAllMocks());

describe('receipts: counted by status, with the age of the oldest', () => {
  it('groups by status and reports max age in hours, sorted by status', async () => {
    executionFindAll.mockResolvedValue([
      row({ status: 'pending_review', created_at: new Date(NOW.getTime() - 2 * HOUR) }),
      row({ status: 'pending_review', created_at: new Date(NOW.getTime() - 9 * HOUR) }),
      row({ status: 'approved', created_at: new Date(NOW.getTime() - 1 * HOUR) }),
    ]);
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.receipts).toEqual([
      { status: 'approved', count: 1, max_age_hours: 1 },
      { status: 'pending_review', count: 2, max_age_hours: 9 },
    ]);
  });

  it('no receipts -> an empty list, not a zero row invented for each status', async () => {
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.receipts).toEqual([]);
  });
});

describe('stuck_pending_review: keyed on the constant that actually ages the receipt', () => {
  it('counts pending_review older than PROPOSAL_TTL_HOURS and reports the threshold it used', async () => {
    executionCount.mockResolvedValue(4);
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.stuck_pending_review).toEqual({ count: 4, over_hours: PROPOSAL_TTL_HOURS });

    // The predicate is the point: `pending_review` older than the PROPOSAL ttl. The plan
    // named APPROVED_TTL_HOURS, which expires a different status; both are 72 today, so the
    // wrong constant would have produced the right number until someone changed one.
    const where = executionCount.mock.calls[0][0].where;
    expect(where.status).toBe('pending_review');
    // `Op.lt` is a Symbol key, so it has to be read as one - Object.values skips it.
    const cutoff = where.created_at[Op.lt] as Date;
    expect(cutoff).toBeInstanceOf(Date);
    expect(NOW.getTime() - cutoff.getTime()).toBe(PROPOSAL_TTL_HOURS * HOUR);
  });
});

describe('held: the send-time hold, which is NOT in the ledger', () => {
  it('counts only journey_hold rows, grouped by reason, and ignores other cancellations', async () => {
    scheduledFindAll.mockResolvedValue([
      row({ metadata: { blocked_reason: 'journey_hold:pause:brand' } }),
      row({ metadata: { blocked_reason: 'journey_hold:pause:brand' } }),
      row({ metadata: { blocked_reason: 'journey_hold:kill_switch' } }),
      row({ metadata: { blocked_reason: 'unsubscribed_by_contact' } }), // not a journey hold
      row({ metadata: null }),
      row({ metadata: {} }),
    ]);
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.held).toEqual({
      total: 3,
      by_reason: { 'journey_hold:pause:brand': 2, 'journey_hold:kill_switch': 1 },
    });
    // the plan's separate field is the same read reported again, never a second count
    expect(h.journey_hold_rows).toBe(3);
  });
});

describe('refused: from the bounded ledger read, and honest when capped', () => {
  it('groups refusals by reason and reports ledger_read ok', async () => {
    decisionFindAll.mockResolvedValue([row({ id: 'd1' }), row({ id: 'd2' })]);
    readJourneyEvents.mockResolvedValue({
      rows: [
        { entity_id: 'd1', payload: { reason: 'contact_policy:cooldown' } },
        { entity_id: 'd2', payload: { reason: 'contact_policy:cooldown' } },
        { entity_id: 'd2', payload: { reason: 'brand_boundary' } },
      ],
      timed_out: false,
    });
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.refused).toEqual({
      total: 3,
      by_reason: { 'contact_policy:cooldown': 2, brand_boundary: 1 },
      capped: false,
    });
    expect(h.ledger_read).toBe('ok');
    expect(readJourneyEvents).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'growth_journey_decision', entityIds: ['d1', 'd2'], eventType: 'growth_journey.execution.refused' }),
    );
  });

  it('more decisions than the cap -> capped true, and only the cap is read', async () => {
    const many = Array.from({ length: MAX_HEALTH_DECISIONS + 1 }, (_, i) => row({ id: `d${i}` }));
    decisionFindAll.mockResolvedValue(many);
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.refused.capped).toBe(true);
    expect(readJourneyEvents.mock.calls[0][0].entityIds).toHaveLength(MAX_HEALTH_DECISIONS);
  });

  it('a payload with no reason -> "unknown", never an empty key', async () => {
    decisionFindAll.mockResolvedValue([row({ id: 'd1' })]);
    readJourneyEvents.mockResolvedValue({ rows: [{ entity_id: 'd1', payload: null }], timed_out: false });
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.refused.by_reason).toEqual({ unknown: 1 });
  });

  it('a ledger TIMEOUT -> ledger_read timed_out and the rest of the report still present', async () => {
    decisionFindAll.mockResolvedValue([row({ id: 'd1' })]);
    readJourneyEvents.mockResolvedValue({ rows: [], timed_out: true, error_class: 'StatementTimeout' });
    executionCount.mockResolvedValue(2);
    controlFindAll.mockResolvedValue([row({ kind: 'pause' })]);

    const h = await buildJourneyHealth({ now: NOW });
    expect(h.ledger_read).toBe('timed_out');
    expect(h.refused).toEqual({ total: 0, by_reason: {}, capped: false });
    // fail open: an unreadable ledger costs the refusal counts and nothing else
    expect(h.stuck_pending_review.count).toBe(2);
    expect(h.controls).toEqual({ pause: 1, rollout: 0 });
    expect(h.crons).toHaveLength(3);
  });

  it('a ledger failure that is not a timeout -> ledger_read failed', async () => {
    decisionFindAll.mockResolvedValue([row({ id: 'd1' })]);
    readJourneyEvents.mockResolvedValue({ rows: [], timed_out: false, error_class: 'SequelizeDatabaseError' });
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.ledger_read).toBe('failed');
  });

  it('no decisions in the window -> the ledger is not read at all', async () => {
    const h = await buildJourneyHealth({ now: NOW });
    expect(readJourneyEvents).not.toHaveBeenCalled();
    expect(h.ledger_read).toBe('ok');
    expect(h.refused.total).toBe(0);
  });
});

describe('crons: disabled is a state, read from the LIVE row', () => {
  const agent = (agent_name: string, enabled: boolean, last_run_at: Date | null) =>
    row({ agent_name, enabled, last_run_at });

  it('no ai_agents rows at all -> all three disabled, none late or never', async () => {
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.crons).toHaveLength(3);
    expect(h.crons.map((c) => c.agent)).toEqual([
      'GrowthJourneyShadowDecisions',
      'GrowthJourneyExecutor',
      'GrowthJourneyHandoffDigest',
    ]);
    // An unregistered agent is not scheduled, so it is dark rather than overdue. And
    // /health/full derives overall_status from its checks, so a correctly dark subsystem
    // must not report a problem or the whole platform reads degraded forever.
    expect(h.crons.every((c) => c.state === 'disabled')).toBe(true);
    expect(h.crons.every((c) => c.last_run_at === null)).toBe(true);
  });

  it('a row with enabled:false -> disabled, however recently it ran', async () => {
    agentFindAll.mockResolvedValue([agent('GrowthJourneyExecutor', false, new Date(NOW.getTime() - 5 * 60_000))]);
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.crons.find((c) => c.agent === 'GrowthJourneyExecutor')!.state).toBe('disabled');
  });

  it('ENABLED and recently run -> on_time, which is the state the seed registry could never produce', async () => {
    // The bug this cell exists for: the registry's `enabled: false` is a seed default,
    // honoured on first creation only. A reader keyed on the registry would answer
    // `disabled` forever even after an operator enabled the row - so this reads ai_agents.
    agentFindAll.mockResolvedValue([agent('GrowthJourneyExecutor', true, new Date(NOW.getTime() - 5 * 60_000))]);
    const h = await buildJourneyHealth({ now: NOW });
    const exec = h.crons.find((c) => c.agent === 'GrowthJourneyExecutor')!;
    expect(exec.state).toBe('on_time');
    expect(exec.minutes_since).toBe(5);
    expect(exec.last_run_at).toBe(new Date(NOW.getTime() - 5 * 60_000).toISOString());
  });

  it('ENABLED and stale past its period plus the slack -> late', async () => {
    // the executor runs every 15 min, so the threshold is 15 + 30 = 45
    agentFindAll.mockResolvedValue([agent('GrowthJourneyExecutor', true, new Date(NOW.getTime() - 46 * 60_000))]);
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.crons.find((c) => c.agent === 'GrowthJourneyExecutor')!.state).toBe('late');
  });

  it('ENABLED and inside the slack -> still on_time, so a slightly late tick is not an alarm', async () => {
    agentFindAll.mockResolvedValue([agent('GrowthJourneyExecutor', true, new Date(NOW.getTime() - 44 * 60_000))]);
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.crons.find((c) => c.agent === 'GrowthJourneyExecutor')!.state).toBe('on_time');
  });

  it('ENABLED and never run -> never', async () => {
    agentFindAll.mockResolvedValue([agent('GrowthJourneyExecutor', true, null)]);
    const h = await buildJourneyHealth({ now: NOW });
    const exec = h.crons.find((c) => c.agent === 'GrowthJourneyExecutor')!;
    expect(exec.state).toBe('never');
    expect(exec.minutes_since).toBeNull();
  });
});

describe('periodMinutes: only the two shapes the registry uses, and no guessing', () => {
  it.each([
    ['*/15 14-22 * * 1-5', 15],
    ['30 12 * * 1-5', 24 * 60],
    ['20 4 * * *', 24 * 60],
    ['0 * * * *', 60],
  ] as Array<[string, number]>)('%s -> %i minutes', (schedule, expected) => {
    expect(periodMinutes(schedule)).toBe(expected);
  });

  it.each([
    ['not a cron'],
    ['*/0 * * * *'],
    ['@daily'],
    ['*/15 14-22 * *'],
  ] as Array<[string]>)('%s -> null, so the agent is never called late on a guess', (schedule) => {
    expect(periodMinutes(schedule)).toBeNull();
  });

  it('the slack is real: a run one period old is on_time, well past it is late', () => {
    // periodMinutes('*/15 ...') is 15, so the late threshold is 15 + CRON_SLACK_MINUTES
    expect(periodMinutes('*/15 14-22 * * 1-5')! + CRON_SLACK_MINUTES).toBe(45);
  });
});

describe('the window is clamped, never trusted', () => {
  it.each([
    [undefined, 24],
    [0, 1],
    [-5, 1],
    [1_000_000, 720],
    [48, 48],
  ] as Array<[number | undefined, number]>)('ledgerWindowHours %s -> %i', async (given, expected) => {
    const h = await buildJourneyHealth({ now: NOW, ledgerWindowHours: given });
    expect(h.window_hours).toBe(expected);
  });
});

describe('no address reaches the report, including as an object key', () => {
  it('an address anywhere in a JSONB reason never reaches the report, key or value', async () => {
    scheduledFindAll.mockResolvedValue([row({ metadata: { blocked_reason: 'journey_hold:someone@example.com' } })]);
    decisionFindAll.mockResolvedValue([row({ id: 'd1' })]);
    readJourneyEvents.mockResolvedValue({
      rows: [{ entity_id: 'd1', payload: { reason: 'refused:person@example.com' } }],
      timed_out: false,
    });

    const h = await buildJourneyHealth({ now: NOW });
    const serialised = JSON.stringify(h);
    expect(serialised).not.toContain('@example.com');
    expect(serialised).not.toContain('someone');
    expect(serialised).not.toContain('person@');
  });

  it('a held row whose reason carries an address is still COUNTED, under a safe key', async () => {
    // The bug this cell exists for: `safeKey` answers the bare word 'redacted' for
    // anything holding an address, so testing the `journey_hold:` prefix on the
    // SCRUBBED value dropped the row from the count entirely - an under-count caused
    // by the privacy rule rather than by a cap. The prefix is tested on the raw value
    // and the key is built afterwards, so the hold is counted and the key is safe.
    scheduledFindAll.mockResolvedValue([
      row({ metadata: { blocked_reason: 'journey_hold:someone@example.com' } }),
      row({ metadata: { blocked_reason: 'journey_hold:pause:brand' } }),
    ]);
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.held.total).toBe(2);
    expect(h.journey_hold_rows).toBe(2);
    expect(h.held.by_reason).toEqual({ 'journey_hold:redacted': 1, 'journey_hold:pause:brand': 1 });
    expect(JSON.stringify(h)).not.toContain('@');
  });

  it('a very long JSONB reason is capped, so one row cannot bloat the response', async () => {
    scheduledFindAll.mockResolvedValue([row({ metadata: { blocked_reason: `journey_hold:${'x'.repeat(5_000)}` } })]);
    const h = await buildJourneyHealth({ now: NOW });
    const keys = Object.keys(h.held.by_reason);
    expect(keys).toHaveLength(1);
    expect(keys[0].length).toBeLessThanOrEqual(64);
  });
});

describe('freshness: the report says when it was computed', () => {
  it('carries as_of, the exact `now` it was given', async () => {
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.as_of).toBe(NOW.toISOString());
  });
});

describe('every bounded read declares itself when it hits its cap', () => {
  it('nothing capped -> truncated is empty, which is the normal answer', async () => {
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.truncated).toEqual([]);
    expect(h.refused.capped).toBe(false);
  });

  it('receipts at the row cap -> truncated names it, because the OLDEST rows are the dropped ones', async () => {
    // DESC + a cap means max_age_hours understates too, not just the count.
    executionFindAll.mockResolvedValue(
      Array.from({ length: MAX_HEALTH_ROWS }, () => row({ status: 'completed', created_at: NOW })),
    );
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.truncated).toContain('receipts');
  });

  it('held at the row cap -> truncated names it', async () => {
    scheduledFindAll.mockResolvedValue(
      Array.from({ length: MAX_HEALTH_ROWS }, () => row({ metadata: { blocked_reason: 'journey_hold:pause:brand' } })),
    );
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.truncated).toContain('held');
    expect(h.held.total).toBe(MAX_HEALTH_ROWS);
  });

  it('controls at the row cap -> truncated names it', async () => {
    controlFindAll.mockResolvedValue(Array.from({ length: MAX_HEALTH_CONTROLS }, () => row({ kind: 'pause' })));
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.truncated).toContain('controls');
  });

  it('THE LEDGER ROW CAP counts as capped, even when the decision cap was not reached', async () => {
    // The defect this cell exists for. 3 decisions is far under MAX_HEALTH_DECISIONS,
    // so the decision cap is not hit - but the ledger returned its own full page, so
    // `total` is exactly the limit and `by_reason` is truncated. Reporting capped:false
    // here served a floor as a total, in the one field whose comment denied it.
    decisionFindAll.mockResolvedValue([row({ id: 'd1' }), row({ id: 'd2' }), row({ id: 'd3' })]);
    readJourneyEvents.mockResolvedValue({
      rows: Array.from({ length: LEDGER_READ_DEFAULT_ROWS }, () => ({ entity_id: 'd1', payload: { reason: 'contact_policy:cooldown' } })),
      timed_out: false,
    });
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.refused.total).toBe(LEDGER_READ_DEFAULT_ROWS);
    expect(h.refused.capped).toBe(true);
    expect(h.truncated).toContain('refused');
  });

  it('the ledger limit is passed EXPLICITLY, so the comparison is against a number this file chose', async () => {
    decisionFindAll.mockResolvedValue([row({ id: 'd1' })]);
    await buildJourneyHealth({ now: NOW });
    expect(readJourneyEvents.mock.calls[0][0].limit).toBe(LEDGER_READ_DEFAULT_ROWS);
  });

  it('several caps at once -> every one is named, in report order', async () => {
    executionFindAll.mockResolvedValue(Array.from({ length: MAX_HEALTH_ROWS }, () => row({ status: 'completed', created_at: NOW })));
    scheduledFindAll.mockResolvedValue(Array.from({ length: MAX_HEALTH_ROWS }, () => row({ metadata: { blocked_reason: 'journey_hold:x' } })));
    controlFindAll.mockResolvedValue(Array.from({ length: MAX_HEALTH_CONTROLS }, () => row({ kind: 'rollout' })));
    const h = await buildJourneyHealth({ now: NOW });
    expect(h.truncated).toEqual(['receipts', 'held', 'controls']);
  });

  it('held is read NEWEST FIRST, so a floor is at least a recent floor', async () => {
    await buildJourneyHealth({ now: NOW });
    expect(scheduledFindAll.mock.calls[0][0].order).toEqual([['created_at', 'DESC']]);
  });
});
