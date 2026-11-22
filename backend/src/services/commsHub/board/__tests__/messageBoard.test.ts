/**
 * CH7.4 the board: each scope asks for its own statuses (a filter can only narrow it), the schedule is
 * bounded to 7 days with send-on-approval rows first, and a row carries plain failure words, who
 * missed it, and who approved it. The activity log names each change in words. Failure reasons never
 * show a raw provider error.
 */
type Any = Record<string, any>;
let msgs: Any[] = [];
// Sequelize where objects are keyed by Op symbols.
let lastWhere: Record<string | symbol, any> = {};
let lastOrder: unknown;
let deliveries: Any[] = [];
let destinations: Any[] = [];
let drafts: Any[] = [];
let events: Any[] = [];
let activity: Any[] = [];

jest.mock('../../../../models/CommsHubMessage', () => ({ __esModule: true, default: { findAll: jest.fn(async (o: Any) => { lastWhere = o.where ?? {}; lastOrder = o.order; return msgs; }) } }));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findAll: jest.fn(async () => events) } }));
jest.mock('../../../../models/CommsHubDestination', () => ({ __esModule: true, default: { findAll: jest.fn(async () => destinations) } }));
jest.mock('../../../../models/CommsHubDraft', () => ({ __esModule: true, default: { findAll: jest.fn(async () => drafts) } }));
jest.mock('../../../../models/CommsHubDelivery', () => ({ __esModule: true, default: { findAll: jest.fn(async () => deliveries) } }));
jest.mock('../../../../models/CommsHubActivity', () => ({ __esModule: true, default: { findAll: jest.fn(async () => activity) } }));
jest.mock('../../activityLog', () => ({ listActivity: jest.fn(async () => activity) }));
jest.mock('../../messages/promotionPlan', () => ({ PLAN_LABEL: { reminder: { label: 'Reminder, 1 day before' }, announcement: { label: 'Announcement' } } }));

import { Op } from 'sequelize';
import { listBoard, SCOPE_STATUSES } from '../messageBoard';
import { activityFeed } from '../activityFeed';
import { failureReason } from '../failureReason';
import { personLabel } from '../labels';

const NOW = new Date('2026-11-20T16:00:00Z');
const D = (iso: string): Date => new Date(iso);
const msg = (o: Any): Any => ({ id: 'm1', status: 'scheduled', kind: 'reminder', plan_kind: 'reminder', subject: null, event_id: 'e1', include: { join_link: true }, send_at: D('2026-11-23T00:00:00Z'), created_at: NOW, updated_at: NOW, ...o });

beforeEach(() => {
  msgs = [msg({})];
  events = [{ id: 'e1', title: 'Demo Tuesday', status: 'scheduled', thumbnail_id: 't1' }];
  destinations = [{ id: 'd1', message_id: 'm1', channel: 'community_post', label: 'November cohort', target_id: 'c1' }, { id: 'd2', message_id: 'm1', channel: 'in_app', label: 'All members', target_id: 'all_members' }];
  drafts = [{ message_id: 'm1', channel: 'in_app', body: 'In-app text' }, { message_id: 'm1', channel: 'community_post', body: '  Tomorrow at 6:00 PM Central:\n Demo Tuesday.  ' }];
  deliveries = [];
  activity = [{ id: 'a1', entity_id: 'm1', action: 'message.approved', actor_label: 'jackie.k@colaberry.com', entity_type: 'message', created_at: NOW }];
});

describe('scopes and filters', () => {
  it.each(Object.entries(SCOPE_STATUSES))('%s asks only for its statuses', async (scope, statuses) => {
    await listBoard({ scope: scope as never }, NOW);
    expect(lastWhere.status[Op.in]).toEqual(statuses);
  });

  it('a status filter narrows the scope and can never widen it (history cannot list drafts)', async () => {
    await listBoard({ scope: 'history', status: ['failed', 'draft'] }, NOW);
    expect(lastWhere.status[Op.in]).toEqual(['failed']);
    expect(await listBoard({ scope: 'history', status: ['draft'] }, NOW)).toEqual([]);
  });

  it('the schedule is the next 7 days, with send-on-approval rows first; history is newest first', async () => {
    await listBoard({ scope: 'schedule' }, NOW);
    const [inWindow, onApproval] = lastWhere[Op.or];
    expect(inWindow.send_at[Op.lte].toISOString()).toBe('2026-11-27T16:00:00.000Z');
    expect(onApproval.status[Op.in]).toEqual(['needs_approval', 'approved', 'sending']);
    expect(lastOrder).toEqual([['send_at', 'ASC NULLS FIRST'], ['created_at', 'ASC']]);
    await listBoard({ scope: 'history' }, NOW);
    expect(lastOrder).toEqual([['updated_at', 'DESC']]);
  });

  it('event and channel filters are applied', async () => {
    await listBoard({ scope: 'schedule', event_id: 'e1', channel: 'in_app' }, NOW);
    expect(lastWhere.event_id).toBe('e1');
    expect(lastWhere.id[Op.in]).toEqual(['m1', 'm1']);
  });
});

describe('a row', () => {
  it('names the event and step, previews the feed text, lists recipients, and says who approved it', async () => {
    const [r] = await listBoard({ scope: 'schedule' }, NOW);
    expect(r).toEqual(expect.objectContaining({
      title: 'Demo Tuesday: reminder, 1 day before', preview: 'Tomorrow at 6:00 PM Central: Demo Tuesday.',
      destinations: [{ channel: 'community_post', label: 'November cohort' }, { channel: 'in_app', label: 'All members' }],
      approved_by: 'Jackie K', event: { id: 'e1', title: 'Demo Tuesday', thumbnail_id: 't1' },
      include: { thumbnail: true, join_link: true, registration_link: false }, failure: null,
    }));
  });

  it('a partly sent message says who missed it and how many tries, in plain words', async () => {
    msgs = [msg({ status: 'partially_failed' })];
    deliveries = [
      { message_id: 'm1', destination_id: 'd1', status: 'sent', attempt_count: 1, error: null },
      { message_id: 'm1', destination_id: 'd2', status: 'failed', attempt_count: 4, error: 'UpstreamUnavailable: 503 from https://internal.example/x?token=abc' },
    ];
    const [r] = await listBoard({ scope: 'history' }, NOW);
    expect(r.deliveries).toEqual({ total: 2, sent: 1, failed: 1, pending: 0, cancelled: 0 });
    expect(r.failure).toEqual({ reason: 'Some recipients did not receive it after every try.', missed: ['All members'], attempts: 4 });
    expect(JSON.stringify(r)).not.toMatch(/token|503|internal/);
  });

  it('a message stopped by a cancelled event says so; a subject message is titled by its subject', async () => {
    msgs = [msg({ status: 'cancelled' }), msg({ id: 'm2', event_id: null, plan_kind: null, kind: 'update', subject: 'Holiday hours', status: 'sent' })];
    events = [{ id: 'e1', title: 'Demo Tuesday', status: 'cancelled', thumbnail_id: null }];
    const [a, b] = await listBoard({ scope: 'history' }, NOW);
    expect(a.failure?.reason).toBe('Stopped automatically when the event was cancelled.');
    expect([b.title, b.failure, b.preview]).toEqual(['Holiday hours', null, null]);
  });
});

describe('failure words and names', () => {
  it.each([
    ['failed', ['approval_changed: the message changed'], 'Not sent: the message changed after it was approved. Approve it again to send it.'],
    ['failed', ['SendAbandonedError: gave up after 480000 ms'], 'Stopped: the send took too long to finish.'],
    ['failed', ['TypeError: secret stack'], 'Nothing was delivered after every try.'],
    ['cancelled', [null], 'Cancelled before it went out.'],
  ])('%s %j', (status, errors, words) => { expect(failureReason(status, errors)).toBe(words); });

  it('people are named by the name part of their sign-in', () => {
    expect([personLabel('jackie@colaberry.com'), personLabel('Scheduled sender'), personLabel(null)]).toEqual(['Jackie', 'Scheduled sender', null]);
  });
});

describe('activity log', () => {
  it('reads as sentences about the message or event; an unknown action still shows', async () => {
    msgs = [msg({})];
    activity = [
      { id: 'a1', created_at: NOW, actor_label: 'jackie@colaberry.com', action: 'message.approved', entity_type: 'message', entity_id: 'm1' },
      { id: 'a2', created_at: NOW, actor_label: null, action: 'sending.paused', entity_type: 'settings', entity_id: null },
      { id: 'a3', created_at: NOW, actor_label: 'Scheduled sender', action: 'message.new_thing', entity_type: 'message', entity_id: 'gone' },
      { id: 'a4', created_at: NOW, actor_label: 'taiwo@colaberry.com', action: 'event.updated', entity_type: 'event', entity_id: 'e1' },
    ];
    const rows = await activityFeed(20);
    expect(rows.map((r) => [r.who, r.did, r.about])).toEqual([
      ['Jackie', 'approved', 'Demo Tuesday: reminder'],
      ['Someone', 'paused all sending', null],
      ['Scheduled sender', 'message new thing', null],
      ['Taiwo', 'edited an event', 'Demo Tuesday'],
    ]);
  });

  it('CH9.1 and CH9.3: a problem report, and registrants viewed or downloaded, name the event from the detail and never a person', async () => {
    msgs = [];
    activity = [
      { id: 'b1', created_at: NOW, actor_label: 'jackie@colaberry.com', action: 'registrants.exported', entity_type: 'eventbrite_event', entity_id: null, detail: { ccpp_event_id: '777', title: 'AI Open House', rows: 12 } },
      { id: 'b2', created_at: NOW, actor_label: 'taiwo@colaberry.com', action: 'registrants.viewed', entity_type: 'eventbrite_event', entity_id: null, detail: { ccpp_event_id: '777', title: 'AI Open House', rows: 12 } },
      { id: 'b3', created_at: NOW, actor_label: 'jackie@colaberry.com', action: 'bug.reported', entity_type: 'report', entity_id: null, detail: { summary: 'Stuck', route: '/admin/comms-hub' } },
    ];
    expect((await activityFeed(20)).map((r) => [r.who, r.did, r.about])).toEqual([
      ['Jackie', 'downloaded the registrants of', 'AI Open House'],
      ['Taiwo', 'viewed the registrants of', 'AI Open House'],
      ['Jackie', 'reported a problem', null],
    ]);
  });
});
