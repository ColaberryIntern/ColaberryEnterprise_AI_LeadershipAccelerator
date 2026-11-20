/** CH6.4 the promotion plan: Central send times across DST, idempotent per event + kind + occurrence, per occurrence for a series, never approved here. */
type Row = Record<string, any>;
const events = new Map<string, Row>();
let messages: Row[] = [];
const planned: Row[] = [];
const cancelled: string[] = [];
const withUpdate = (r: Row): Row => Object.assign(r, { update: jest.fn(async (p: Row) => Object.assign(r, p)) });

jest.mock('../../../../models/CommsHubEvent', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async (id: string) => events.get(id) ?? null), findAll: jest.fn(async () => [...events.values()].filter((e) => ['scheduled', 'live'].includes(e.status))) },
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
    const hit = messages.find((m) => m.event_id === e.id && m.plan_kind === plan.kind && m.occurrence_starts_at.getTime() === plan.occurrence.getTime());
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

  it('a row whose moment has passed is skipped with the reason, not sent late', async () => {
    const r = await ensurePlan(ev() as never, JACKIE, new Date('2026-11-30T15:00:00Z'));
    expect(r.skipped).toEqual([{ kind: 'announcement', occurrence: '2026-12-02T00:00:00.000Z', reason: 'its send time has already passed' }]);
    expect(planned.map((m) => m.plan_kind)).toEqual(['reminder', 'starting_soon']);
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

  it('a cancelled, draft or ended event gets nothing', async () => {
    for (const status of ['cancelled', 'draft', 'ended']) expect((await ensurePlan(ev({ status }) as never, JACKIE, NOW)).created).toBe(0);
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
});
