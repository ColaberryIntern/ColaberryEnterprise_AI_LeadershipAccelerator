/**
 * CH7.1 connectors: community post and in-app notification, through the existing community services,
 * as the "Colaberry Team" identity. Models and the community services are mocked; the scratch-DB
 * proof is connectors.integration.test.ts.
 */
type Row = Record<string, unknown>;
let posts: Row[] = [];
let notifications: Row[] = [];
let enrollments: Row[] = [];
let members: Row[] = [];
const cohorts = new Map<string, Row>([['c-nov', { id: 'c-nov', status: 'open' }], ['c-exp', { id: 'c-exp', status: 'open' }], ['c-old', { id: 'c-old', status: 'completed' }]]);

const mockCreatePost = jest.fn();
const mockCreateNotification = jest.fn();
jest.mock('../../../communityService', () => ({ createPost: (...a: unknown[]) => mockCreatePost(...a) }));
jest.mock('../../../communityNotificationService', () => ({ createNotification: (...a: unknown[]) => mockCreateNotification(...a) }));
// CH9.6: who an event's registrants are is registrantAudience's job (its own tests); here, that the connector routes to it.
const mockRegistrantIds = jest.fn();
jest.mock('../../eventbrite/registrantAudience', () => ({ registrantEnrollmentIds: (...a: unknown[]) => mockRegistrantIds(...a) }));
jest.mock('../../../../models/Cohort', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(async (id: string) => cohorts.get(id) ?? null),
    findAll: jest.fn(async ({ where }: { where: Row }) => [...cohorts.values()].filter((c) => c.status === where.status)),
  },
}));
const inOf = (v: unknown): unknown[] => { const sym = Object.getOwnPropertySymbols(v as object)[0]; return (v as Record<symbol, unknown[]>)[sym]; };
jest.mock('../../../../models/Enrollment', () => ({
  __esModule: true,
  default: {
    findOrCreate: jest.fn(async ({ where, defaults }: { where: Row; defaults: Row }) => {
      const found = enrollments.find((e) => e.email === where.email);
      if (found) return [found, false];
      const row = { id: 'enr-team', ...defaults };
      enrollments.push(row);
      return [row, true];
    }),
    findAll: jest.fn(async ({ where }: { where: Row }) => {
      const ids = inOf(where.cohort_id);
      return enrollments.filter((e) => ids.includes(e.cohort_id) && e.status === where.status && e.portal_enabled === where.portal_enabled);
    }),
  },
}));
jest.mock('../../../../models/CommunityMember', () => ({
  __esModule: true,
  default: {
    findOrCreate: jest.fn(async ({ where, defaults }: { where: Row; defaults: Row }) => {
      const found = members.find((m) => m.enrollment_id === where.enrollment_id);
      if (found) return [found, false];
      const row = { id: `mem-${String(where.enrollment_id)}`, ...defaults };
      members.push(row);
      return [row, true];
    }),
    findAll: jest.fn(async ({ where }: { where: Row }) => { const ids = inOf(where.enrollment_id); return members.filter((m) => ids.includes(m.enrollment_id)); }),
  },
}));
jest.mock('../../../../models/CommunityPost', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async ({ where }: { where: Row }) => {
      const since = Object.values(Object.getOwnPropertySymbols(where.created_at as object).map((s) => (where.created_at as Record<symbol, Date>)[s]))[0];
      return posts.filter((p) => p.member_id === where.member_id && p.cohort_id === where.cohort_id && p.body === where.body && p.status === where.status && (p.created_at as Date) >= since);
    }),
  },
}));
// Deliveries that already recorded a post as theirs (provider_message_id), by delivery id.
let recorded: Array<{ id: string; provider_message_id: string }> = [];
jest.mock('../../../../models/CommsHubDelivery', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async ({ where }: { where: Row }) => {
      const ids = inOf(where.provider_message_id);
      const notId = Object.getOwnPropertySymbols(where.id as object).map((s) => (where.id as Record<symbol, string>)[s])[0];
      return recorded.filter((r) => ids.includes(r.provider_message_id) && r.id !== notId);
    }),
  },
}));
jest.mock('../../../../models/CommunityNotification', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async ({ where }: { where: Row }) => {
      const ids = inOf(where.member_id);
      return notifications.filter((n) => n.source_id === where.source_id && n.notification_type === where.notification_type && ids.includes(n.member_id));
    }),
  },
}));

import { connectorFor, ConnectorPermanentError } from '..';
import { audienceEnrollmentIds } from '../inAppConnector';
import { __resetTeamIdentityForTests, TEAM_EMAIL } from '../teamIdentity';
import Enrollment from '../../../../models/Enrollment';

const SINCE = new Date('2026-11-20T15:00:00Z');
const delivery = (o: Row = {}) => ({
  deliveryId: 'dl1', messageId: 'msg-1', since: SINCE,
  destination: { target_type: 'cohort_feed', target_id: 'c-nov' },
  draft: { title: null, body: 'Demo Tuesday is Tuesday, December 1 at 6:00 PM CST.' },
  ...o,
}) as never;

beforeEach(() => {
  posts = []; notifications = []; members = []; recorded = [];
  enrollments = [
    { id: 'e-ada', cohort_id: 'c-nov', status: 'active', portal_enabled: true },
    { id: 'e-bo', cohort_id: 'c-nov', status: 'active', portal_enabled: true },
    { id: 'e-new', cohort_id: 'c-nov', status: 'active', portal_enabled: true }, // never opened the community
    { id: 'e-gone', cohort_id: 'c-nov', status: 'withdrawn', portal_enabled: true },
    { id: 'e-exp', cohort_id: 'c-exp', status: 'active', portal_enabled: true },
    { id: 'e-past', cohort_id: 'c-old', status: 'active', portal_enabled: true },
    { id: 'e-agent', cohort_id: null, status: 'active', portal_enabled: false },
  ];
  members = ['e-ada', 'e-bo', 'e-gone', 'e-exp', 'e-past', 'e-agent'].map((e) => ({ id: `mem-${e}`, enrollment_id: e }));
  __resetTeamIdentityForTests();
  mockCreatePost.mockReset().mockImplementation(async (enrollmentId: string, input: Row, opts: Row) => {
    const p = { id: `post-${posts.length + 1}`, member_id: `mem-${enrollmentId}`, cohort_id: opts.cohortId, body: input.body, status: 'visible', created_at: new Date('2026-11-20T15:01:00Z') };
    posts.push(p);
    return p;
  });
  mockCreateNotification.mockReset().mockImplementation(async (recipient: string, _actor: string, type: string, source: string, id: string) => {
    notifications.push({ member_id: `mem-${recipient}`, notification_type: type, source_type: source, source_id: id });
  });
});

describe('Colaberry Team identity', () => {
  it('is made once: an enrollment with no cohort, portal off, an undeliverable address, test payment mode, and a staff profile', async () => {
    await connectorFor('community_post').send(delivery());
    await connectorFor('community_post').send(delivery({ destination: { target_type: 'cohort_feed', target_id: 'c-exp' } }));
    expect(Enrollment.findOrCreate).toHaveBeenCalledTimes(1); // cached after the first send
    const team = enrollments.find((e) => e.email === TEAM_EMAIL)!;
    expect(team).toEqual(expect.objectContaining({ cohort_id: null, portal_enabled: false, payment_mode: 'test', full_name: 'Colaberry Team' }));
    expect(TEAM_EMAIL.endsWith('.invalid')).toBe(true);
    expect(members.find((m) => m.enrollment_id === 'enr-team')).toEqual(expect.objectContaining({ display_name: 'Colaberry Team', role: 'staff' }));
  });
});

describe('community post connector', () => {
  it('happy: posts the draft into that cohort feed through createPost, as Colaberry Team, with no points', async () => {
    const r = await connectorFor('community_post').send(delivery({ media_urls: ['https://example.com/banner.png'] }));
    expect(mockCreatePost).toHaveBeenCalledWith('enr-team', { body: 'Demo Tuesday is Tuesday, December 1 at 6:00 PM CST.', category: 'General', media_urls: ['https://example.com/banner.png'] }, { cohortId: 'c-nov', reward: false });
    expect(r).toEqual({ provider_message_id: 'post-1', reached: 1, already_done: false });
  });

  it('retry after a crash: the post an earlier attempt made is returned, not posted twice', async () => {
    await connectorFor('community_post').send(delivery());
    const again = await connectorFor('community_post').send(delivery());
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    expect(again).toEqual({ provider_message_id: 'post-1', reached: 1, already_done: true });
  });

  it('the same words posted before this delivery was claimed are not mistaken for this one', async () => {
    posts.push({ id: 'old', member_id: 'mem-enr-team', cohort_id: 'c-nov', body: 'Demo Tuesday is Tuesday, December 1 at 6:00 PM CST.', status: 'visible', created_at: new Date('2026-11-01') });
    const r = await connectorFor('community_post').send(delivery());
    expect(r.already_done).toBe(false);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
  });

  it('a post with the same words that ANOTHER delivery recorded is not adopted: this delivery still posts', async () => {
    await connectorFor('community_post').send(delivery({ deliveryId: 'dl-other', messageId: 'msg-2' }));
    recorded.push({ id: 'dl-other', provider_message_id: 'post-1' });
    const r = await connectorFor('community_post').send(delivery());
    expect(mockCreatePost).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ provider_message_id: 'post-2', reached: 1, already_done: false });
    // ...while this delivery's own unrecorded post is still found on its retry.
    const again = await connectorFor('community_post').send(delivery());
    expect(again).toEqual({ provider_message_id: 'post-2', reached: 1, already_done: true });
  });

  it("media goes through the composer's own rule: a relative or non-http link is refused, not posted", async () => {
    await expect(connectorFor('community_post').send(delivery({ media_urls: ['/api/comms-hub/thumbnails/e1/3x1.png'] }))).rejects.toMatchObject({ reason: 'bad_media' });
    await expect(connectorFor('community_post').send(delivery({ media_urls: ['javascript:alert(1)'] }))).rejects.toMatchObject({ reason: 'bad_media' });
    await expect(connectorFor('community_post').send(delivery({ draft: { title: null, body: 'x'.repeat(10001) } }))).rejects.toMatchObject({ reason: 'too_long' });
    expect(mockCreatePost).not.toHaveBeenCalled();
    await connectorFor('community_post').send(delivery({ media_urls: ['/api/portal/community/media/abc.png'] }));
    expect(mockCreatePost.mock.calls[0][1].media_urls).toEqual(['/api/portal/community/media/abc.png']);
  });

  it('failure: the community service throws, and the error reaches the worker (the delivery fails with it)', async () => {
    mockCreatePost.mockRejectedValueOnce(new Error('database is down'));
    await expect(connectorFor('community_post').send(delivery())).rejects.toThrow('database is down');
  });

  it('refusals the worker must not retry: wrong destination type, missing cohort, empty post', async () => {
    await expect(connectorFor('community_post').send(delivery({ destination: { target_type: 'in_app_audience', target_id: 'all_members' } }))).rejects.toBeInstanceOf(ConnectorPermanentError);
    await expect(connectorFor('community_post').send(delivery({ destination: { target_type: 'cohort_feed', target_id: 'nope' } }))).rejects.toMatchObject({ reason: 'cohort_missing' });
    await expect(connectorFor('community_post').send(delivery({ draft: { title: null, body: '   ' } }))).rejects.toMatchObject({ reason: 'empty_body' });
    expect(mockCreatePost).not.toHaveBeenCalled();
  });
});

describe('in-app connector', () => {
  const inApp = (target: string) => delivery({ destination: { target_type: 'in_app_audience', target_id: target }, draft: { title: 'Demo Tuesday, Dec 1', body: '6:00 PM CST' } });

  it('audiences: a cohort is its active, portal-enabled members with a profile; all_members is every open cohort', async () => {
    expect((await audienceEnrollmentIds('c-nov')).sort()).toEqual(['e-ada', 'e-bo']);
    expect((await audienceEnrollmentIds('all_members')).sort()).toEqual(['e-ada', 'e-bo', 'e-exp']);
  });

  it('happy: one announcement per member through createNotification, Colaberry Team as the actor, the message as the source', async () => {
    const r = await connectorFor('in_app').send(inApp('c-nov'));
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith('e-ada', 'enr-team', 'announcement', 'comms_hub', 'msg-1');
    expect(r).toEqual({ provider_message_id: 'msg-1', reached: 2, already_done: false });
  });

  it('retry and overlap: nobody is notified twice for one message (a crash mid-way, or all members plus their cohort)', async () => {
    mockCreateNotification.mockImplementationOnce(async (recipient: string, _a: string, type: string, source: string, id: string) => {
      notifications.push({ member_id: `mem-${recipient}`, notification_type: type, source_type: source, source_id: id });
    }).mockRejectedValueOnce(new Error('connection reset'));
    await expect(connectorFor('in_app').send(inApp('c-nov'))).rejects.toThrow('connection reset');
    expect(notifications).toHaveLength(1);
    const retry = await connectorFor('in_app').send(inApp('c-nov'));
    expect(retry.reached).toBe(1);
    expect(notifications.map((n) => n.member_id).sort()).toEqual(['mem-e-ada', 'mem-e-bo']);
    const all = await connectorFor('in_app').send(inApp('all_members'));
    expect(all.reached).toBe(1); // only the Explorer member is new
    const again = await connectorFor('in_app').send(inApp('all_members'));
    expect(again).toEqual({ provider_message_id: 'msg-1', reached: 0, already_done: true });
  });

  it('an audience with nobody in it reaches no one and is not an error', async () => {
    enrollments = enrollments.filter((e) => e.cohort_id !== 'c-nov' || e.status !== 'active');
    const r = await connectorFor('in_app').send(inApp('c-nov'));
    expect(r).toEqual({ provider_message_id: 'msg-1', reached: 0, already_done: false });
  });

  it('refusals: wrong destination type, missing cohort, empty notification', async () => {
    await expect(connectorFor('in_app').send(delivery())).rejects.toMatchObject({ reason: 'bad_destination' });
    await expect(connectorFor('in_app').send(inApp('nope'))).rejects.toMatchObject({ reason: 'cohort_missing' });
    await expect(connectorFor('in_app').send(delivery({ destination: { target_type: 'in_app_audience', target_id: 'c-nov' }, draft: { title: ' ', body: '' } }))).rejects.toMatchObject({ reason: 'empty_body' });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

describe('CH9.6 in-app to an event\'s registrants', () => {
  const toRegistrants = (o: Row = {}) => delivery({ destination: { target_type: 'event_registrants', target_id: 'hub-1' }, draft: { title: 'AI Open House', body: 'Starts in one hour.' }, ...o });

  it('notifies the registrants who are on the platform, once each, as Colaberry Team', async () => {
    mockRegistrantIds.mockResolvedValue(['e-ada', 'e-exp']);
    const r = await connectorFor('in_app').send(toRegistrants());
    expect(mockRegistrantIds).toHaveBeenCalledWith('hub-1');
    expect(mockCreateNotification.mock.calls.map((c) => c[0]).sort()).toEqual(['e-ada', 'e-exp']);
    expect(mockCreateNotification).toHaveBeenCalledWith('e-ada', 'enr-team', 'announcement', 'comms_hub', 'msg-1');
    expect(r).toEqual({ provider_message_id: 'msg-1', reached: 2, already_done: false });
  });

  it('a retry, or a registrant who is also in the "everyone" audience of the same message, is notified once', async () => {
    mockRegistrantIds.mockResolvedValue(['e-ada']);
    await connectorFor('in_app').send(delivery({ destination: { target_type: 'in_app_audience', target_id: 'c-nov' }, draft: { title: 'x', body: 'y' } }));
    const r = await connectorFor('in_app').send(toRegistrants());
    expect(r).toEqual({ provider_message_id: 'msg-1', reached: 0, already_done: true });
    expect(notifications.filter((n) => n.member_id === 'mem-e-ada')).toHaveLength(1);
  });

  it('Eventbrite unreadable at send time: the error reaches the worker, which retries, and nobody is notified', async () => {
    mockRegistrantIds.mockRejectedValue(Object.assign(new Error('The Eventbrite registrant list is unavailable right now; this send will be retried.'), { name: 'UpstreamUnavailable' }));
    const err = await connectorFor('in_app').send(toRegistrants()).catch((e: Error) => e);
    expect(err).not.toBeInstanceOf(ConnectorPermanentError);
    expect((err as Error).name).toBe('UpstreamUnavailable');
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('nobody on the platform among the registrants reaches no one, and is not an error', async () => {
    mockRegistrantIds.mockResolvedValue([]);
    expect(await connectorFor('in_app').send(toRegistrants())).toEqual({ provider_message_id: 'msg-1', reached: 0, already_done: false });
  });

  it('the community post connector still refuses registrants (in-app only)', async () => {
    await expect(connectorFor('community_post').send(toRegistrants())).rejects.toBeInstanceOf(ConnectorPermanentError);
  });
});
