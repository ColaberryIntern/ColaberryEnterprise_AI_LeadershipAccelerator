/**
 * T602 (Growth Journey Phase 6, the hardening set) — the ledger's one bounded
 * read. Every property the module claims, driven from the caller's side:
 * bounded (ids, type, window, a capped limit, newest first), timed (SET LOCAL
 * inside its own transaction, before the read, on that transaction), and
 * fail-open by contract (a timeout is `timed_out: true` with no rows; any other
 * failure is no rows with its class; nothing throws).
 */
const m = { transaction: jest.fn(), query: jest.fn(), findAll: jest.fn() };
const TX = { id: 'tx-1', LOCK: { UPDATE: 'UPDATE' } };

jest.mock('../../../config/database', () => ({ sequelize: { transaction: (...a: unknown[]) => m.transaction(...a), query: (...a: unknown[]) => m.query(...a) } }));
jest.mock('../../../models', () => ({ EventLedger: { findAll: (...a: unknown[]) => m.findAll(...a) } }));

import { Op } from 'sequelize';
import { LEDGER_READ_DEFAULT_ROWS, LEDGER_READ_MAX_ROWS, LEDGER_READ_TIMEOUT_MS, readJourneyEvents } from '../ledgerRead';

const row = (entity_id: string, event_type: string, created_at: Date, payload: Record<string, unknown> | null = null) => ({
  get: (k: string) => ({ entity_id, event_type, created_at, payload } as Record<string, unknown>)[k],
});
const SINCE = new Date('2026-09-21T00:00:00Z');
const AT = new Date('2026-09-21T12:00:00Z');

let warn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  m.transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(TX));
  m.query.mockResolvedValue([]);
  m.findAll.mockResolvedValue([]);
});
afterEach(() => warn.mockRestore());

describe('bounded', () => {
  it('an empty id list is an empty answer: no transaction, no query, no read', async () => {
    expect(await readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: [] })).toEqual({ rows: [], timed_out: false });
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.query).not.toHaveBeenCalled();
    expect(m.findAll).not.toHaveBeenCalled();
  });

  it('the where is the entity type, the ids as IN, the event type and the lower bound; newest first; the default row cap', async () => {
    await readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: ['d1', 'd2'], eventType: 'growth_journey.execution.refused', since: SINCE });
    expect(m.findAll).toHaveBeenCalledTimes(1);
    expect(m.findAll.mock.calls[0][0]).toEqual({
      where: { entity_type: 'growth_journey_decision', entity_id: { [Op.in]: ['d1', 'd2'] }, event_type: 'growth_journey.execution.refused', created_at: { [Op.gte]: SINCE } },
      attributes: ['entity_id', 'event_type', 'created_at', 'payload'],
      order: [['created_at', 'DESC']],
      limit: LEDGER_READ_DEFAULT_ROWS,
      transaction: TX,
    });
  });

  it('without an event type or a lower bound, neither is in the where', async () => {
    await readJourneyEvents({ entityType: 'growth_journey_handoff', entityIds: ['h1'] });
    expect(m.findAll.mock.calls[0][0].where).toEqual({ entity_type: 'growth_journey_handoff', entity_id: { [Op.in]: ['h1'] } });
  });

  it.each([
    [7, 7],
    [0, 1],
    [-5, 1],
    [2.9, 2],
    [LEDGER_READ_MAX_ROWS + 1, LEDGER_READ_MAX_ROWS],
    [Number.MAX_SAFE_INTEGER, LEDGER_READ_MAX_ROWS],
  ])('a limit of %s is applied as %s: at least one, never past the cap, whole', async (asked, applied) => {
    await readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: ['d1'], limit: asked });
    expect(m.findAll.mock.calls[0][0].limit).toBe(applied);
  });

  it('the rows come back as plain values, the payload null when the ledger holds none', async () => {
    m.findAll.mockResolvedValue([row('d2', 'growth_journey.execution.refused', AT, { reason: 'x' }), row('d1', 'growth_journey.execution.refused', SINCE)]);
    expect(await readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: ['d1', 'd2'] })).toEqual({
      rows: [
        { entity_id: 'd2', event_type: 'growth_journey.execution.refused', created_at: AT, payload: { reason: 'x' } },
        { entity_id: 'd1', event_type: 'growth_journey.execution.refused', created_at: SINCE, payload: null },
      ],
      timed_out: false,
    });
  });
});

describe('timed: SET LOCAL inside its own transaction, before the read', () => {
  it('one transaction; the SET LOCAL is the first statement on it, with the module\'s timeout; the read carries the same transaction', async () => {
    const order: string[] = [];
    m.query.mockImplementation(async (sql: string, opts: { transaction: unknown }) => { order.push(`query:${sql}:${opts.transaction === TX}`); return []; });
    m.findAll.mockImplementation(async (q: { transaction: unknown }) => { order.push(`findAll:${q.transaction === TX}`); return []; });
    await readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: ['d1'] });
    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual([`query:SET LOCAL statement_timeout = ${LEDGER_READ_TIMEOUT_MS}:true`, 'findAll:true']);
    expect(LEDGER_READ_TIMEOUT_MS).toBe(5000);
  });

  it('is LOCAL, never a session SET: the text says so, and nothing is issued outside the transaction', async () => {
    await readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: ['d1'] });
    const [sql, opts] = m.query.mock.calls[0] as [string, { transaction: unknown }];
    expect(sql).toMatch(/^SET LOCAL statement_timeout = \d+$/);
    expect(opts).toEqual({ transaction: TX });
  });
});

describe('fail-open by contract', () => {
  const timeout = (shape: 'original' | 'parent' | 'message') => {
    const e = new Error(shape === 'message' ? 'canceling statement due to statement timeout' : 'query failed');
    if (shape !== 'message') Object.assign(e, { [shape]: { code: '57014' } });
    return e;
  };

  it.each(['original', 'parent', 'message'] as const)('a statement timeout (%s) answers timed_out with no rows and TimeoutError, and warns', async (shape) => {
    m.findAll.mockRejectedValue(timeout(shape));
    await expect(readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: ['d1', 'd2'], eventType: 'growth_journey.execution.refused' })).resolves.toEqual({ rows: [], timed_out: true, error_class: 'TimeoutError' });
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line).toMatchObject({ service: 'growth-journey', level: 'warn', outcome: 'failure', event: 'growth_journey.ledger.read_failed', entity_type: 'growth_journey_decision', event_type: 'growth_journey.execution.refused', ids: 2, limit: LEDGER_READ_DEFAULT_ROWS, timed_out: true, error_class: 'TimeoutError' });
    expect(JSON.stringify(line)).not.toContain('d1');
  });

  it('the SET LOCAL itself failing is the same answer as the read failing: no rows, its class, no throw', async () => {
    m.query.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    await expect(readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: ['d1'] })).resolves.toEqual({ rows: [], timed_out: false, error_class: 'SequelizeConnectionError' });
    expect(m.findAll).not.toHaveBeenCalled();
  });

  it('any other failure is no rows with its class, timed_out false', async () => {
    m.findAll.mockRejectedValue(Object.assign(new Error('boom'), { code: 'ECONNREFUSED' }));
    await expect(readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: ['d1'] })).resolves.toEqual({ rows: [], timed_out: false, error_class: 'UpstreamUnavailable' });
  });

  it('a transaction that cannot be opened is the same contract', async () => {
    m.transaction.mockRejectedValue(new Error('no connection'));
    await expect(readJourneyEvents({ entityType: 'growth_journey_decision', entityIds: ['d1'] })).resolves.toMatchObject({ rows: [], timed_out: false });
  });
});
