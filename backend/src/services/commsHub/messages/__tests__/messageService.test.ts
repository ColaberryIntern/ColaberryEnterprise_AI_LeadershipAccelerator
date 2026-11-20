/** CH6.5 the Compose service: the message view, recipients (history kept), send time, approve and schedule. */
type Row = Record<string, any>;
const messages = new Map<string, Row>();
let drafts: Row[] = [];
let dests: Row[] = [];
let deliveries: Row[] = [];
const reconciled: string[] = [];
const withUpdate = (r: Row): Row => Object.assign(r, { update: jest.fn(async (p: Row) => Object.assign(r, p)) });

jest.mock('../../../../config/database', () => ({ sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({ LOCK: { UPDATE: 'UPDATE' } })) } }));
jest.mock('../../../../models/CommsHubMessage', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => messages.get(id) ?? null) } }));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => ({ id: 'e1', title: 'Demo Tuesday', starts_at: new Date('2026-12-02T00:00:00Z'), ends_at: null, repeat_rule: null, join_url: null, registration_url: null, hosts: [], thumbnail_id: 't7' })) } }));
jest.mock('../../../../models/CommsHubDraft', () => ({ __esModule: true, default: { findAll: jest.fn(async () => [...drafts].sort((a, b) => b.version - a.version)) } }));
jest.mock('../../../../models/CommsHubDestination', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => dests),
    destroy: jest.fn(async ({ where }: Row) => { dests = dests.filter((d) => !where.id.includes(d.id)); }),
    create: jest.fn(async (r: Row) => { const d = { id: `d${dests.length + 10}`, ...r }; dests.push(d); return d; }),
  },
}));
jest.mock('../../../../models/CommsHubApproval', () => ({ __esModule: true, default: { findOne: jest.fn(async () => null) } }));
jest.mock('../../../../models/CommsHubDelivery', () => ({ __esModule: true, default: { findAll: jest.fn(async ({ where }: Row) => deliveries.filter((x) => (where.destination_id as string[]).includes(x.destination_id))) } }));
jest.mock('../../../../models/Cohort', () => ({ __esModule: true, default: { findAll: jest.fn(async () => [{ id: 'c1', name: 'November 2026' }]) } }));
jest.mock('../../activityLog', () => ({ logActivity: jest.fn(async () => undefined) }));
const mockApprove = jest.fn(async () => undefined);
const mockSchedule = jest.fn(async () => undefined);
jest.mock('../approvals', () => {
  const actual = jest.requireActual('../approvals');
  return { MessageRuleError: actual.MessageRuleError, approveMessage: (...a: unknown[]) => mockApprove(...(a as [])), scheduleMessage: (...a: unknown[]) => mockSchedule(...(a as [])), reconcileApproval: jest.fn(async (_id: string, reason: string) => { reconciled.push(reason); return true; }) };
});
jest.mock('../drafting', () => ({ recommendDestinations: jest.fn(async () => [{ channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members', label: 'Everyone in the program', reason: 'x' }]) }));

import { approveAndSchedule, destinationOptions, messageView, setDestinations, setSendTime } from '../messageService';

const JACKIE = { id: 'jackie-1', label: 'Jackie' };
const NOW = new Date('2026-11-20T15:00:00Z');
const d = (o: Row) => ({ id: `dr${o.version}${o.channel}`, title: null, author: 'ai', instruction: null, created_at: NOW, ...o });

beforeEach(() => {
  messages.clear(); reconciled.length = 0; deliveries = []; jest.clearAllMocks();
  messages.set('m1', withUpdate({ id: 'm1', status: 'needs_approval', kind: 'reminder', tone: null, notes: null, subject: null, include: { thumbnail: true }, send_at: null, created_by: 'jackie-1', plan_kind: null, occurrence_starts_at: null, event_id: 'e1' }));
  drafts = [
    d({ channel: 'community_post', version: 1, body: 'old' }),
    d({ channel: 'community_post', version: 2, body: 'Demo Tuesday is on Tuesday, December 1 at 6:00 PM CST.' }),
    d({ channel: 'in_app', version: 1, title: 'Demo Tuesday', body: 'Starts at 7 pm' }),
  ];
  dests = [{ id: 'd1', message_id: 'm1', channel: 'community_post', target_type: 'cohort_feed', target_id: 'c1', label: 'November 2026 feed' }];
});

describe('CH6.5 messageView', () => {
  it('the latest version per channel, every version newest first, the event, and the validator problems the gates will raise', async () => {
    const v = await messageView('m1', NOW);
    expect(v.drafts.community_post!.version).toBe(2);
    expect(v.versions.map((x) => `${x.channel}${x.version}`)).toEqual(['community_post2', 'community_post1', 'in_app1']);
    expect(v.event).toEqual({ id: 'e1', title: 'Demo Tuesday', when: 'Tuesday, December 1 · 6:00 PM CST', thumbnail_id: 't7' });
    expect(v.problems.join(' ')).toMatch(/in-app notification must say the date/);
    expect(v.destinations[0]).toMatchObject({ target_id: 'c1', has_delivery: false });
    expect(v.recommended).toHaveLength(1);
  });
});

describe('CH6.5 recipients', () => {
  it('adding one re-checks the approval (destinations_changed)', async () => {
    await setDestinations('m1', [
      { channel: 'community_post', target_type: 'cohort_feed', target_id: 'c1', label: 'November 2026 feed' },
      { channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members', label: 'Everyone' },
    ], JACKIE, NOW);
    expect(dests.map((x) => x.target_id)).toEqual(['c1', 'all_members']);
    expect(reconciled).toEqual(['destinations_changed']);
  });

  it('the same list again changes nothing and re-checks nothing', async () => {
    await setDestinations('m1', [{ channel: 'community_post', target_type: 'cohort_feed', target_id: 'c1', label: 'x' }], JACKIE, NOW);
    expect(reconciled).toEqual([]);
  });

  it('a recipient already sent to cannot be removed (its history stays); one never sent to can', async () => {
    deliveries = [{ destination_id: 'd1' }];
    await expect(setDestinations('m1', [], JACKIE, NOW)).rejects.toMatchObject({ reason: 'has_delivery' });
    expect(dests).toHaveLength(1);
    deliveries = [];
    await setDestinations('m1', [], JACKIE, NOW);
    expect(dests).toEqual([]);
  });

  it('a sent or sending message cannot change its recipients', async () => {
    messages.get('m1')!.status = 'sent';
    await expect(setDestinations('m1', [], JACKIE, NOW)).rejects.toMatchObject({ reason: 'locked' });
  });

  it('the options: each open cohort feed, everyone in-app, and each cohort in-app', async () => {
    expect((await destinationOptions()).map((o) => `${o.channel}:${o.target_id}`)).toEqual(['community_post:c1', 'in_app:all_members', 'in_app:c1']);
  });
});

describe('CH6.5 send time and approve', () => {
  it('a new time is saved and re-checks the approval; the same time does nothing; a past time is refused', async () => {
    await setSendTime('m1', new Date('2026-12-01T00:00:00Z'), JACKIE, NOW);
    expect(messages.get('m1')!.send_at).toEqual(new Date('2026-12-01T00:00:00Z'));
    expect(reconciled).toEqual(['send_time_changed']);
    await setSendTime('m1', new Date('2026-12-01T00:00:00Z'), JACKIE, NOW);
    expect(reconciled).toHaveLength(1);
    await expect(setSendTime('m1', new Date('2026-11-01T00:00:00Z'), JACKIE, NOW)).rejects.toMatchObject({ reason: 'past' });
  });

  it('Approve and schedule approves (validated, hashed) and then schedules', async () => {
    await approveAndSchedule('m1', JACKIE, NOW);
    expect(mockApprove).toHaveBeenCalledWith('m1', JACKIE, NOW);
    expect(mockSchedule).toHaveBeenCalledWith('m1', JACKIE);
  });
});
