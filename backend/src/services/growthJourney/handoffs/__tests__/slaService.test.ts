import { Op } from 'sequelize';

/**
 * T409 - the SLA sweep, behaviourally over an in-memory handoff table: an
 * overdue queued or assigned row expires exactly once with one scoped ledger
 * row; accepted, future and undated rows are untouched; the brand narrows; the
 * kill switch stops the first write; one row failing stops nothing; a row taken
 * between the read and the write (a human accept, a sweep in flight) is left alone.
 */

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (Array.isArray(cond)) return cond.includes(v);
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<symbol, unknown>;
      if (Op.lt in c) return v !== null && (v as Date) < (c[Op.lt] as Date);
    }
    return v === cond;
  });
}

const rows: Row[] = [];
const updateFailures = new Set<string>();
/** Something that happens between the sweep's read and its write, keyed by row id (a human accept; a sweep in flight). */
const betweenReadAndWrite = new Map<string, () => void>();
const asModel = (r: Row) => ({ ...r });
/** The static, conditional UPDATE ... WHERE id = ? AND status IN (...): affected rows counted, like Postgres. */
const update = jest.fn(async (...a: unknown[]) => {
  const [patch, opts] = a as [Row, { where: Row }];
  const id = opts.where.id as string;
  if (updateFailures.has(id)) throw Object.assign(new Error('deadlock detected'), { name: 'SequelizeDatabaseError' });
  betweenReadAndWrite.get(id)?.();
  const hit = rows.filter((r) => matches(r, opts.where));
  for (const r of hit) Object.assign(r, patch);
  return [hit.length];
});
const findAll = jest.fn(async (...a: unknown[]) => {
  const { where, order, limit } = a[0] as { where: Row; order: unknown; limit: number };
  const hit = rows.filter((r) => matches(r, where));
  expect(order).toEqual([['sla_due_at', 'ASC']]);
  hit.sort((a, b) => (a.sla_due_at as Date).getTime() - (b.sla_due_at as Date).getTime());
  return hit.slice(0, limit).map(asModel);
});
const isKillSwitchActive = jest.fn();
const logEvent = jest.fn();

jest.mock('../../../../models', () => ({ GrowthJourneyHandoff: { findAll: (...a: unknown[]) => findAll(...a), update: (...a: unknown[]) => update(...a) } }));
jest.mock('../../../launchSafety', () => ({ isKillSwitchActive: (...a: unknown[]) => isKillSwitchActive(...a) }));
jest.mock('../../../ledgerService', () => ({ logEvent: (...a: unknown[]) => logEvent(...a) }));
const redactForLogs = jest.fn((s: string) => jest.requireActual('../../../../utils/piiRedaction').redactForLogs(s));
jest.mock('../../../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => redactForLogs(s) }));

import { DEFAULT_SWEEP_LIMIT, EXPIRABLE_STATUSES, expireOverdueHandoffs, HANDOFF_EXPIRED_EVENT } from '../slaService';

const AS_OF = new Date('2026-09-17T04:25:00Z');
const D = (s: string) => new Date(s);
const handoff = (over: Row): Row => ({
  id: 'h', tenant_id: 't-colaberry', brand_id: 'b-ent', subject_ref: 'lead:501', lead_id: 501, owner_queue: 'sales', status: 'queued',
  assigned_to_type: null, assigned_to_id: null, ticket_id: null, sla_due_at: D('2026-09-16T12:00:00Z'), expired_at: null, ...over,
});
const warned = () => (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  rows.length = 0;
  updateFailures.clear();
  betweenReadAndWrite.clear();
  findAll.mockClear();
  update.mockClear();
  logEvent.mockReset().mockResolvedValue(undefined);
  isKillSwitchActive.mockReset().mockResolvedValue(false);
  redactForLogs.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('what expires', () => {
  it('a queued and an assigned row past sla_due_at become expired at the sweep clock, each with one scoped ledger row of ids and the status it came from', async () => {
    rows.push(
      handoff({ id: 'h-q', status: 'queued' }),
      handoff({ id: 'h-a', status: 'assigned', assigned_to_type: 'admin_user', assigned_to_id: 'u-7', ticket_id: 'tk-1', sla_due_at: D('2026-09-15T12:00:00Z') }),
    );
    const r = await expireOverdueHandoffs({ brandId: 'b-ent', asOf: AS_OF });
    expect(r).toEqual({ skipped: false, scanned: 2, expired: 2, raced: 0, failed: [], expired_ids: ['h-a', 'h-q'] });
    expect(update).toHaveBeenCalledWith({ status: 'expired', expired_at: AS_OF }, { where: { id: 'h-q', status: ['queued', 'assigned'] } });
    expect(rows.map((x) => [x.id, x.status, x.expired_at])).toEqual([['h-q', 'expired', AS_OF], ['h-a', 'expired', AS_OF]]);
    expect(logEvent).toHaveBeenCalledTimes(2);
    expect(logEvent).toHaveBeenCalledWith(
      HANDOFF_EXPIRED_EVENT, 'growth_journey', 'growth_journey_handoff', 'h-a',
      { handoff_id: 'h-a', subject_ref: 'lead:501', lead_id: 501, owner_queue: 'sales', from: 'assigned', sla_due_at: D('2026-09-15T12:00:00Z'), ticket_id: 'tk-1', assigned_to_type: 'admin_user', assigned_to_id: 'u-7' },
      { tenant_id: 't-colaberry', brand_id: 'b-ent' },
    );
    expect(HANDOFF_EXPIRED_EVENT).toBe('growth_journey.handoff.expired');
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain('@');
  });

  it('exactly once: the same sweep over the same clock finds nothing the second time - the moved row is outside the where clause, not behind a flag', async () => {
    rows.push(handoff({ id: 'h-q' }));
    expect(await expireOverdueHandoffs({ asOf: AS_OF })).toMatchObject({ expired: 1 });
    expect(await expireOverdueHandoffs({ asOf: AS_OF })).toEqual({ skipped: false, scanned: 0, expired: 0, raced: 0, failed: [], expired_ids: [] });
    expect(await expireOverdueHandoffs({ asOf: new Date(AS_OF.getTime() + 86_400_000) })).toMatchObject({ scanned: 0, expired: 0 });
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(findAll).toHaveBeenLastCalledWith(expect.objectContaining({ where: { status: ['queued', 'assigned'], sla_due_at: { [Op.lt]: expect.any(Date) } } }));
  });

  it("an accepted row past its SLA is the human's and stays; a queued row due in the future, one with no SLA, and dispositioned / returned / cancelled rows are untouched", async () => {
    rows.push(
      handoff({ id: 'h-acc', status: 'accepted' }),
      handoff({ id: 'h-future', status: 'queued', sla_due_at: D('2026-09-18T12:00:00Z') }),
      handoff({ id: 'h-nosla', status: 'queued', sla_due_at: null }),
      handoff({ id: 'h-disp', status: 'dispositioned' }),
      handoff({ id: 'h-ret', status: 'returned_to_ai' }),
      handoff({ id: 'h-can', status: 'cancelled' }),
      handoff({ id: 'h-exp', status: 'expired', expired_at: D('2026-09-16T13:00:00Z') }),
    );
    const r = await expireOverdueHandoffs({ asOf: AS_OF });
    expect(r).toMatchObject({ scanned: 0, expired: 0 });
    expect(rows.every((x) => x.id === 'h-exp' ? x.status === 'expired' : x.status !== 'expired')).toBe(true);
    expect(logEvent).not.toHaveBeenCalled();
    expect(EXPIRABLE_STATUSES).toEqual(['queued', 'assigned']);
  });

  it('a brand narrows the sweep to its own rows; without one every brand is swept', async () => {
    rows.push(handoff({ id: 'h-ent', brand_id: 'b-ent' }), handoff({ id: 'h-cpn', brand_id: 'b-cpn', tenant_id: 't-cpn' }));
    expect(await expireOverdueHandoffs({ brandId: 'b-cpn', asOf: AS_OF })).toMatchObject({ expired: 1, expired_ids: ['h-cpn'] });
    expect(rows.find((x) => x.id === 'h-ent')?.status).toBe('queued');
    expect(logEvent).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String), 'h-cpn', expect.any(Object), { tenant_id: 't-cpn', brand_id: 'b-cpn' });
    expect(await expireOverdueHandoffs({ asOf: AS_OF })).toMatchObject({ expired: 1, expired_ids: ['h-ent'] });
  });

  it('oldest due first, bounded by the limit; the rest wait for the next tick', async () => {
    rows.push(handoff({ id: 'h-3', sla_due_at: D('2026-09-16T03:00:00Z') }), handoff({ id: 'h-1', sla_due_at: D('2026-09-16T01:00:00Z') }), handoff({ id: 'h-2', sla_due_at: D('2026-09-16T02:00:00Z') }));
    expect(await expireOverdueHandoffs({ asOf: AS_OF, limit: 2 })).toMatchObject({ scanned: 2, expired: 2, expired_ids: ['h-1', 'h-2'] });
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));
    expect(await expireOverdueHandoffs({ asOf: AS_OF })).toMatchObject({ expired: 1, expired_ids: ['h-3'] });
    expect(findAll).toHaveBeenLastCalledWith(expect.objectContaining({ limit: DEFAULT_SWEEP_LIMIT }));
  });
});

describe('gates and failure', () => {
  it('the kill switch is read before the first read and stops the sweep: nothing read, nothing written, nothing logged', async () => {
    rows.push(handoff({ id: 'h-q' }));
    isKillSwitchActive.mockResolvedValue(true);
    expect(await expireOverdueHandoffs({ asOf: AS_OF })).toEqual({ skipped: true, reason: 'kill_switch_active' });
    expect(findAll).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('queued');
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("one row's update failing is one failed entry with its class and a warning through the redactor - no ledger row for it - and the next row still expires", async () => {
    rows.push(handoff({ id: 'h-bad', sla_due_at: D('2026-09-16T01:00:00Z') }), handoff({ id: 'h-ok', sla_due_at: D('2026-09-16T02:00:00Z') }));
    updateFailures.add('h-bad');
    const r = await expireOverdueHandoffs({ asOf: AS_OF });
    expect(r).toEqual({ skipped: false, scanned: 2, expired: 1, raced: 0, failed: [{ handoff_id: 'h-bad', error_class: expect.any(String) }], expired_ids: ['h-ok'] });
    expect(rows.map((x) => [x.id, x.status])).toEqual([['h-bad', 'queued'], ['h-ok', 'expired']]);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent.mock.calls[0][3]).toBe('h-ok');
    const line = warned().find((l) => l.includes('growth_journey.handoff.expire_failed'));
    expect(JSON.parse(line as string)).toMatchObject({ handoff_id: 'h-bad', brand_id: 'b-ent', owner_queue: 'sales', from: 'queued', error_class: expect.any(String) });
    expect(redactForLogs).toHaveBeenCalledTimes(1);
  });

  it('a row taken between the read and the write - a human accepted it, or a sweep in flight expired it - is left alone: 0 rows affected, no ledger row, counted as raced; the next row still expires', async () => {
    rows.push(handoff({ id: 'h-taken', sla_due_at: D('2026-09-16T01:00:00Z') }), handoff({ id: 'h-inflight', sla_due_at: D('2026-09-16T02:00:00Z') }), handoff({ id: 'h-ok', sla_due_at: D('2026-09-16T03:00:00Z') }));
    betweenReadAndWrite.set('h-taken', () => { const r = rows.find((x) => x.id === 'h-taken') as Row; r.status = 'accepted'; r.accepted_at = AS_OF; });
    betweenReadAndWrite.set('h-inflight', () => { const r = rows.find((x) => x.id === 'h-inflight') as Row; r.status = 'expired'; r.expired_at = D('2026-09-17T04:24:59Z'); });
    const r = await expireOverdueHandoffs({ asOf: AS_OF });
    expect(r).toEqual({ skipped: false, scanned: 3, expired: 1, raced: 2, failed: [], expired_ids: ['h-ok'] });
    expect(rows.map((x) => [x.id, x.status, x.expired_at])).toEqual([['h-taken', 'accepted', null], ['h-inflight', 'expired', D('2026-09-17T04:24:59Z')], ['h-ok', 'expired', AS_OF]]);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent.mock.calls[0][3]).toBe('h-ok');
    expect(warned()).toEqual([]);
  });

  it('a ledger write failing after the row moved is that row failed (the status stays moved - the next sweep cannot find it - and the class is reported), the next row still expires', async () => {
    rows.push(handoff({ id: 'h-1', sla_due_at: D('2026-09-16T01:00:00Z') }), handoff({ id: 'h-2', sla_due_at: D('2026-09-16T02:00:00Z') }));
    logEvent.mockRejectedValueOnce(Object.assign(new Error('ledger unavailable'), { name: 'SequelizeConnectionError' }));
    const r = await expireOverdueHandoffs({ asOf: AS_OF });
    expect(r).toMatchObject({ expired: 1, failed: [{ handoff_id: 'h-1', error_class: expect.any(String) }], expired_ids: ['h-2'] });
    expect(rows.map((x) => x.status)).toEqual(['expired', 'expired']);
  });
});
