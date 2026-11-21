/** CH6.4 the promotion plan: Central send times across DST, idempotent per event + kind + occurrence, per occurrence for a series, never approved here. */
type Row = Record<string, any>;
const events = new Map<string, Row>();
let messages: Row[] = [];
const planned: Row[] = [];
const cancelled: string[] = [];
const withUpdate = (r: Row): Row => Object.assign(r, { update: jest.fn(async (p: Row) => Object.assign(r, p)) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockMatches(row: any, where: any): boolean {
  const { Op } = jest.requireActual('sequelize');
  return Reflect.ownKeys(where).every((key) => {
    const v = where[key as never] as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (key === Op.or) return (v as unknown[]).some((w) => mockMatches(row, w));
    const cell = row[key as string];
    if (v === null || typeof v !== 'object' || v instanceof Date) return cell === v;
    return Reflect.ownKeys(v).every((op) => {
      const x = v[op as never];
      if (op === Op.in) return (x as unknown[]).includes(cell);
      if (op === Op.ne) return x === null ? cell !== null && cell !== undefined : cell !== x;
      if (op === Op.is) return x === null ? cell === null || cell === undefined : cell === x;
      if (op === Op.gte) return cell !== null && cell !== undefined && cell >= x;
      throw new Error(`mockMatches: unsupported operator ${String(op)}`);
    });
  });
}

jest.mock('../../../../models/CommsHubEvent', () => ({
  __esModule: true,
  // findAll evaluates the Sequelize where the service passes (Op.or / Op.in / Op.ne / Op.gte / Op.is), so a wrong filter shows up here.
  default: { findByPk: jest.fn(async (id: string) => events.get(id) ?? null), findAll: jest.fn(async ({ where }: Row) => [...events.values()].filter((e) => mockMatches(e, where))) },
}));
jest.mock('../../../../models/CommsHubMessage', () => ({
  __esModule: true,
  // Honors the Op.in / Op.ne filters the service uses, so a wrong filter would show up here.
  default: {
    findAll: jest.fn(async ({ where }: Row) => {
      const ops = (w: Row | undefined): unknown[] | null | undefined => (w ? Object.getOwnPropertySymbols(w).map((sym) => w[sym as never])[0] as never : undefined);
      const kindIn = ops(where.plan_kind); const statusIn = ops(where.status);
      return messages.filter((m) => m.event_id === where.event_id
        && (kindIn === undefined || (kindIn === null ? m.plan_kind != null : (kindIn as unknown[]).includes(m.plan_kind)))
        && (statusIn === undefined || (statusIn as unknown[]).includes(m.status)));
    }),
  },
}));
jest.mock('../../activityLog', () => ({ logActivity: jest.fn(async () => undefined) }));
jest.mock('../approvals', () => {
  const actual = jest.requireActual('../approvals');
  return { MessageRuleError: actual.MessageRuleError, cancelMessage: jest.fn(async (id: string) => { cancelled.push(id); const m = messages.find((x) => x.id === id); if (m) m.status = 'cancelled'; }) };
});
// The drafting call is the real createPlanMessage's job (tested in drafting.test); here it is an idempotent store.
jest.mock('../drafting', () => ({
  createPlanMessage: jest.fn(async (e: Row, plan: Row) => {
    const hit = messages.find((m) => m.event_id === e.id && m.plan_kind === plan.kind && m.status !== 'cancelled' && m.occurrence_starts_at.getTime() === plan.occurrence.getTime());
    if (hit) return { message: hit, created: false };
    const m = { id: `m${messages.length + 1}`, event_id: e.id, plan_kind: plan.kind, occurrence_starts_at: plan.occurrence, send_at: plan.sendAt, status: 'needs_approval' };
    messages.push(m); planned.push(m);
    return { message: m, created: true };
  }),
}));
jest.mock('../../../../models/CommsHubDraft', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../models/CommsHubDestination', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../models/CommsHubApproval', () => ({ __esModule: true, default: {} }));

import { ensurePlan, ensurePlansForUpcoming, readPlan, sendTimeFor, setPlan } from '../promotionPlan';

const JACKIE = { id: 'jackie-1', label: 'Jackie' };
const ev = (o: Row = {}): Row => withUpdate({ id: 'e1', status: 'scheduled', starts_at: new Date('2026-12-02T00:00:00Z'), ends_at: new Date('2026-12-02T01:00:00Z'), repeat_rule: null, promotion_plan: ['announcement', 'reminder', 'starting_soon'], ...o });
const iso = (d: Date): string => d.toISOString();

beforeEach(() => { events.clear(); messages = []; planned.length = 0; cancelled.length = 0; jest.clearAllMocks(); });

describe('CH6.4 attempt 2: early-morning times around the clock changes (a single-pass conversion was an hour off here)', () => {
  it.each([
    ['2027-03-15T09:00:00Z', '2027-03-14T09:00:00.000Z'], // Mon Mar 15 4:00 AM CDT -> Sun Mar 14 4:00 AM CDT
    ['2026-11-02T09:00:00Z', '2026-11-01T09:00:00.000Z'], // Mon Nov 2 3:00 AM CST -> Sun Nov 1 3:00 AM CST
    ['2027-03-16T07:00:00Z', '2027-03-15T07:00:00.000Z'], // Tue Mar 16 2:00 AM CDT -> Mon Mar 15 2:00 AM CDT
    ['2026-11-03T09:00:00Z', '2026-11-02T09:00:00.000Z'], // Tue Nov 3 3:00 AM CST -> Mon Nov 2 3:00 AM CST
  ])('event %s: reminder %s, the same Central clock time the day before', (start, reminder) => {
    expect(iso(sendTimeFor('reminder', new Date(start), null))).toBe(reminder);
  });
});

describe('CH6.4 send times on the Central calendar', () => {
  it('a 6:00 PM CST Tuesday (Dec 1): announcement Fri Nov 27 12:00 PM, reminder Mon Nov 30 6:00 PM, 1 hour before, thanks Wed 10:00 AM', () => {
    const s = new Date('2026-12-02T00:00:00Z'); const e = new Date('2026-12-02T01:00:00Z');
    expect(iso(sendTimeFor('announcement', s, e))).toBe('2026-11-27T18:00:00.000Z');
    expect(iso(sendTimeFor('reminder', s, e))).toBe('2026-12-01T00:00:00.000Z');
    expect(iso(sendTimeFor('starting_soon', s, e))).toBe('2026-12-01T23:00:00.000Z');
    expect(iso(sendTimeFor('recording_thanks', s, e))).toBe('2026-12-02T16:00:00.000Z');
  });

  it('across the autumn change: event Tue Nov 3 6:00 PM CST; the announcement (Fri Oct 30) is still CDT', () => {
    const s = new Date('2026-11-04T00:00:00Z');
    expect(iso(sendTimeFor('announcement', s, null))).toBe('2026-10-30T17:00:00.000Z'); // 12:00 PM CDT
    expect(iso(sendTimeFor('reminder', s, null))).toBe('2026-11-03T00:00:00.000Z'); // Mon Nov 2, 6:00 PM CST
  });

  it('across the spring change: event Mon Mar 15 2027 6:00 PM CDT; the reminder falls ON the change day (Sun Mar 14)', () => {
    const s = new Date('2027-03-15T23:00:00Z');
    expect(iso(sendTimeFor('announcement', s, null))).toBe('2027-03-11T18:00:00.000Z'); // Thu Mar 11 12:00 PM CST
    expect(iso(sendTimeFor('reminder', s, null))).toBe('2027-03-14T23:00:00.000Z'); // Sun Mar 14 6:00 PM CDT
  });

  it('an event that crosses midnight Central (11 PM Dec 1 to 1 AM Dec 2): thanks is the day after it ENDS, Dec 3', () => {
    expect(iso(sendTimeFor('recording_thanks', new Date('2026-12-02T05:00:00Z'), new Date('2026-12-02T07:00:00Z')))).toBe('2026-12-03T16:00:00.000Z');
  });
});

describe('CH6.4 ensurePlan', () => {
  const NOW = new Date('2026-11-20T15:00:00Z');

  it('a one-off within the window: one needs_approval message per ticked row, at its send time', async () => {
    const e = ev();
    const r = await ensurePlan(e as never, JACKIE, NOW);
    expect(r).toMatchObject({ created: 3, existing: 0 });
    expect(planned.map((m) => [m.plan_kind, iso(m.send_at), m.status])).toEqual([
      ['announcement', '2026-11-27T18:00:00.000Z', 'needs_approval'],
      ['reminder', '2026-12-01T00:00:00.000Z', 'needs_approval'],
      ['starting_soon', '2026-12-01T23:00:00.000Z', 'needs_approval'],
    ]);
  });

  it('IDEMPOTENT: running it again (re-ticking) creates nothing new', async () => {
    const e = ev();
    await ensurePlan(e as never, JACKIE, NOW);
    expect(await ensurePlan(e as never, JACKIE, NOW)).toMatchObject({ created: 0, existing: 3 });
    expect(messages).toHaveLength(3);
  });

  it('a weekly series: each occurrence in the next 14 days gets its own messages; later ones come as the window moves', async () => {
    const e = ev({ starts_at: new Date('2026-11-25T00:00:00Z'), ends_at: new Date('2026-11-25T01:00:00Z'), repeat_rule: { freq: 'weekly', until: '2027-01-31' }, promotion_plan: ['reminder'] });
    await ensurePlan(e as never, JACKIE, NOW);
    expect(planned.map((m) => iso(m.occurrence_starts_at))).toEqual(['2026-11-25T00:00:00.000Z', '2026-12-02T00:00:00.000Z']);
    await ensurePlan(e as never, JACKIE, new Date('2026-11-27T15:00:00Z'));
    expect(planned.map((m) => iso(m.occurrence_starts_at))).toEqual(['2026-11-25T00:00:00.000Z', '2026-12-02T00:00:00.000Z', '2026-12-09T00:00:00.000Z']);
  });

  it('short notice: a late announcement still goes out soon while the event is more than a day away', async () => {
    const r = await ensurePlan(ev() as never, JACKIE, new Date('2026-11-30T15:00:00Z')); // 33 hours before
    expect(r.skipped).toEqual([]);
    expect(planned.map((m) => [m.plan_kind, iso(m.send_at)])).toEqual([
      ['announcement', '2026-11-30T15:05:00.000Z'], ['reminder', '2026-12-01T00:00:00.000Z'], ['starting_soon', '2026-12-01T23:00:00.000Z'],
    ]);
  });

  it('a reminder (or a late announcement within a day) whose moment has passed is skipped with the reason, not sent late', async () => {
    const r = await ensurePlan(ev() as never, JACKIE, new Date('2026-12-01T01:00:00Z')); // 23 hours before
    expect(r.skipped.map((x) => x.kind)).toEqual(['announcement', 'reminder']);
    expect(r.skipped[0].reason).toBe('its send time has already passed');
    expect(planned.map((m) => m.plan_kind)).toEqual(['starting_soon']);
  });

  it('Recording and thanks is created only after the occurrence ends (and within 3 days), at 10:00 AM the day after', async () => {
    const e = ev({ promotion_plan: ['recording_thanks'] });
    await ensurePlan(e as never, JACKIE, new Date('2026-12-02T00:30:00Z')); // during the event
    expect(planned).toEqual([]);
    await ensurePlan(e as never, JACKIE, new Date('2026-12-02T02:00:00Z')); // after it ended
    expect(planned.map((m) => [m.plan_kind, iso(m.send_at)])).toEqual([['recording_thanks', '2026-12-02T16:00:00.000Z']]);
    messages = []; planned.length = 0;
    await ensurePlan(e as never, JACKIE, new Date('2026-12-08T00:00:00Z')); // too long after
    expect(planned).toEqual([]);
  });

  it('a cancelled or draft event gets nothing', async () => {
    for (const status of ['cancelled', 'draft']) {
      expect((await ensurePlan(ev({ status, promotion_plan: ['announcement', 'reminder', 'starting_soon', 'recording_thanks'] }) as never, JACKIE, new Date('2026-12-02T02:00:00Z'))).created).toBe(0);
    }
  });

  it('an ENDED one-off (its stream ended through the live panel) gets exactly one Recording and thanks, 10:00 AM Central the next day, needs_approval; nothing else', async () => {
    const e = ev({ status: 'ended', promotion_plan: ['announcement', 'reminder', 'starting_soon', 'recording_thanks'] });
    await ensurePlan(e as never, JACKIE, new Date('2026-12-02T02:00:00Z'));
    expect(planned.map((m) => [m.plan_kind, iso(m.send_at), m.status])).toEqual([['recording_thanks', '2026-12-02T16:00:00.000Z', 'needs_approval']]);
  });

  it('one model reply per row is reused across the dates of a series', async () => {
    const { createPlanMessage } = jest.requireMock('../drafting');
    const e = ev({ starts_at: new Date('2026-11-25T00:00:00Z'), ends_at: new Date('2026-11-25T01:00:00Z'), repeat_rule: { freq: 'weekly', until: '2027-01-31' }, promotion_plan: ['reminder'] });
    (createPlanMessage as jest.Mock).mockImplementationOnce(async (ev2: Row, plan: Row) => {
      const m = { id: 'x1', event_id: ev2.id, plan_kind: plan.kind, occurrence_starts_at: plan.occurrence, send_at: plan.sendAt, status: 'needs_approval' };
      messages.push(m);
      return { message: m, created: true, reply: { the: 'reply' } };
    });
    await ensurePlan(e as never, JACKIE, NOW);
    expect((createPlanMessage as jest.Mock).mock.calls[0][4]).toBeUndefined();
    expect((createPlanMessage as jest.Mock).mock.calls[1][4]).toEqual({ the: 'reply' });
  });
});

describe('CH6.4 setPlan and readPlan', () => {
  const NOW = new Date('2026-11-20T15:00:00Z');

  it('ticking saves the rows and drafts what is due; unticking cancels that row\'s messages that are not approved yet', async () => {
    events.set('e1', ev({ promotion_plan: [] }));
    await setPlan('e1', ['announcement', 'reminder'], JACKIE, NOW);
    expect(events.get('e1')!.promotion_plan).toEqual(['announcement', 'reminder']);
    expect(messages.map((m) => m.plan_kind)).toEqual(['announcement', 'reminder']);
    messages.find((m) => m.plan_kind === 'announcement')!.status = 'approved';
    const { plan } = await setPlan('e1', [], JACKIE, NOW);
    expect(cancelled).toEqual(['m2']); // the reminder (needs_approval); the approved announcement is left alone
    expect(plan.rows.map((r) => [r.kind, r.ticked])).toEqual([['announcement', false], ['reminder', false], ['starting_soon', false], ['recording_thanks', false]]);
  });

  it('untick then tick again: a fresh message is drafted (the cancelled one stays as history), exactly one live message', async () => {
    events.set('e1', ev({ promotion_plan: [] }));
    await setPlan('e1', ['reminder'], JACKIE, NOW);
    await setPlan('e1', [], JACKIE, NOW);
    await setPlan('e1', ['reminder'], JACKIE, NOW);
    expect(messages.map((m) => [m.plan_kind, m.status])).toEqual([['reminder', 'cancelled'], ['reminder', 'needs_approval']]);
    expect((await readPlan('e1', NOW)).rows[1]).toMatchObject({ kind: 'reminder', ticked: true, next: { status: 'needs_approval' } });
  });

  it('an ended event may still set its plan (only the thanks applies); the worker hook includes ended events', async () => {
    events.set('e1', ev({ status: 'ended', promotion_plan: [] }));
    await setPlan('e1', ['recording_thanks'], JACKIE, new Date('2026-12-02T02:00:00Z'));
    expect(messages.map((m) => m.plan_kind)).toEqual(['recording_thanks']);
    messages = []; planned.length = 0;
    expect(await ensurePlansForUpcoming(JACKIE, new Date('2026-12-02T02:00:00Z'))).toBe(1);
  });

  it('readPlan shows each row with its next message', async () => {
    events.set('e1', ev());
    await ensurePlan(events.get('e1') as never, JACKIE, NOW);
    const p = await readPlan('e1', NOW);
    expect(p.rows[0]).toMatchObject({ kind: 'announcement', label: 'Announcement', timing: '4 days before, 12:00 PM', ticked: true, next: { status: 'needs_approval', send_at: '2026-11-27T18:00:00.000Z' } });
    expect(p.rows[3]).toMatchObject({ kind: 'recording_thanks', ticked: false, next: null });
  });

  it('a closed or unknown event is refused', async () => {
    events.set('e1', ev({ status: 'cancelled' }));
    await expect(setPlan('e1', ['reminder'], JACKIE, NOW)).rejects.toMatchObject({ status: 409 });
    await expect(setPlan('nope', ['reminder'], JACKIE, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it('the worker hook keeps every planned event current', async () => {
    events.set('e1', ev());
    events.set('e2', ev({ id: 'e2', promotion_plan: [] }));
    expect(await ensurePlansForUpcoming(JACKIE, NOW)).toBe(3);
  });

  it('CH7.2: the worker hook (every minute) skips ended events past the thanks window; a recent one or a series still counts', async () => {
    const FindAll = jest.requireMock('../../../../models/CommsHubEvent').default.findAll as jest.Mock;
    const now = new Date('2026-12-20T12:00:00Z');
    events.set('old', ev({ id: 'old', status: 'ended', ends_at: new Date('2026-12-02T01:00:00Z'), updated_at: new Date('2026-12-02T02:00:00Z'), promotion_plan: ['recording_thanks'] }));
    events.set('recent', ev({ id: 'recent', status: 'ended', starts_at: new Date('2026-12-18T00:00:00Z'), ends_at: new Date('2026-12-18T01:00:00Z'), updated_at: new Date('2026-12-18T02:00:00Z'), promotion_plan: [] }));
    events.set('series', ev({ id: 'series', status: 'ended', ends_at: new Date('2026-10-01T01:00:00Z'), updated_at: new Date('2026-10-01T02:00:00Z'), repeat_rule: { freq: 'weekly' }, promotion_plan: [] }));
    events.set('next', ev({ id: 'next', status: 'scheduled', promotion_plan: [] }));
    await ensurePlansForUpcoming(JACKIE, now);
    const seen = (await FindAll.mock.results[FindAll.mock.results.length - 1].value as Array<{ id: string }>).map((e) => e.id).sort();
    expect(seen).toEqual(['next', 'recent', 'series']);
  });
});
