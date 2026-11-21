const mockQuery = jest.fn();
const mockTx = { LOCK: { UPDATE: 'UPDATE' } };
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a), transaction: async (fn: (t: unknown) => unknown) => fn(mockTx) } }));
const mockFindOne = jest.fn();
const mockFindAll = jest.fn();
const mockFindByPk = jest.fn();
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => mockFindOne(...a), findAll: (...a: unknown[]) => mockFindAll(...a), findByPk: (...a: unknown[]) => mockFindByPk(...a) } }));
const mockActivity = jest.fn();
jest.mock('../../activityLog', () => ({ logActivity: (...a: unknown[]) => mockActivity(...a), WORKER_ACTOR: { id: null, label: 'Scheduled sender' } }));
const mockCalendar = jest.fn(async () => 0);
jest.mock('../../eventWriteThrough', () => ({ syncCalendarRows: (...a: unknown[]) => mockCalendar(...(a as [])) }));
const mockCascade = jest.fn(async () => ({ voided: 1, plan_cancelled: 0 }));
jest.mock('../../messages/eventCascade', () => ({ cascadeEventEdit: (...a: unknown[]) => mockCascade(...(a as [])) }));
// eventService's canonical() is pure; the real one is reproduced so dates and nulls compare as they do in production.
jest.mock('../../eventService', () => {
  const canonical = (v: unknown): string => {
    if (v instanceof Date) return JSON.stringify(v.toISOString());
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    if (v && typeof v === 'object') { const o = v as Record<string, unknown>; return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`; }
    return JSON.stringify(v ?? null);
  };
  return { canonical, toView: (e: { id: string }) => ({ id: e.id }) };
});
jest.mock('../registrants', () => ({ findPublicEvent: jest.fn() }));
jest.mock('../eventbriteEvents', () => ({ listEventbriteEvents: jest.fn() }));
jest.mock('../eventbriteSource', () => ({ PAST_DAYS: 90, UPCOMING_DAYS: 180 }));

import {
  adoptEventbriteEvent, applyEventbriteFields, eventbriteFields, syncAdoptedEvents, syncAdoptedEventsIfDue, __resetSyncClock,
  AdoptEndedError, AdoptNotFoundError, AdoptUnavailableError, SYNC_EVERY_MS,
} from '../adoption';
import type { EventbriteEventView } from '../eventbriteEvents';

/**
 * CH9.5 managing an Eventbrite event in the hub: one hub event per Eventbrite event however many
 * times it is adopted; Eventbrite owns the title, times, link and picture, the hub owns the rest;
 * a moved date voids approvals; nothing is ever deleted for going missing; one bad event never
 * stops the sync.
 */
const NOW = new Date('2026-11-21T22:00:00.000Z');
const ACTOR = { id: 'u-jackie', label: 'jackie@colaberry.com' };
const EB = (o: Partial<EventbriteEventView> = {}): EventbriteEventView => ({
  ccpp_event_id: '777', title: 'AI Open House', starts_at: '2026-12-04T00:30:00.000Z', ends_at: '2026-12-04T02:00:00.000Z',
  registration_url: 'https://www.eventbrite.com/e/ai-open-house-777777', image_url: 'https://img.test/a.png', registered: 3, eventbrite_status: 'live', ...o,
});
/** A hub row as Sequelize would hand it over: fields, get(), update(). */
function row(o: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {
    id: 'hub-1', ccpp_event_id: '777', status: 'scheduled', title: 'AI Open House',
    starts_at: new Date('2026-12-04T00:30:00.000Z'), ends_at: new Date('2026-12-04T02:00:00.000Z'),
    registration_url: 'https://www.eventbrite.com/e/ai-open-house-777777', source_image_url: 'https://img.test/a.png', ccpp_missing_since: null,
    thumbnail_id: 't-1', hosts: [{ name: 'Aleem' }], placement: { calendar: false, events_page: true, campus_rail: false }, ...o,
  };
  r.get = (k: string) => r[k];
  r.update = jest.fn(async (patch: Record<string, unknown>) => { Object.assign(r, patch); return r; });
  return r as Record<string, unknown> & { update: jest.Mock };
}
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); __resetSyncClock(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('eventbriteFields (pure)', () => {
  it('keeps an end only when it is after the start (the table requires it), and clips the title to 255', () => {
    expect(eventbriteFields(EB({ ends_at: '2026-12-04T00:30:00.000Z' })).ends_at).toBeNull();
    expect(eventbriteFields(EB({ ends_at: null })).ends_at).toBeNull();
    expect(eventbriteFields(EB({ title: 'x'.repeat(300) })).title).toHaveLength(255);
    expect(eventbriteFields(EB()).source_image_url).toBe('https://img.test/a.png');
  });
});

describe('adoptEventbriteEvent', () => {
  const find = (v: EventbriteEventView | null | 'unavailable') => jest.fn(async () => v);
  it('refuses a non-public event (404), an unreadable list (503) and an event already over (409), writing nothing', async () => {
    await expect(adoptEventbriteEvent('999', ACTOR, { findEvent: find(null) })).rejects.toBeInstanceOf(AdoptNotFoundError);
    await expect(adoptEventbriteEvent('777', ACTOR, { findEvent: find('unavailable') })).rejects.toBeInstanceOf(AdoptUnavailableError);
    await expect(adoptEventbriteEvent('777', ACTOR, { findEvent: find(EB({ starts_at: '2026-11-20T00:00:00.000Z', ends_at: '2026-11-20T01:00:00.000Z' })), now: () => NOW.getTime() }))
      .rejects.toBeInstanceOf(AdoptEndedError);
    expect(mockQuery).not.toHaveBeenCalled();
  });
  it('an event happening right now can still be managed (it has not ended)', async () => {
    mockQuery.mockResolvedValue([{ id: 'hub-1' }]); mockFindOne.mockResolvedValue(row());
    const r = await adoptEventbriteEvent('777', ACTOR, { findEvent: find(EB({ starts_at: '2026-11-21T21:30:00.000Z', ends_at: '2026-11-21T23:00:00.000Z' })), now: () => NOW.getTime() });
    expect(r.created).toBe(true);
  });
  it('creates one hub event with the partial-index upsert, all members, the Events page only, and logs it', async () => {
    mockQuery.mockResolvedValue([{ id: 'hub-1' }]); mockFindOne.mockResolvedValue(row());
    const r = await adoptEventbriteEvent('777', ACTOR, { findEvent: find(EB()), now: () => NOW.getTime() });
    expect(r).toEqual({ event: { id: 'hub-1' }, created: true });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(ccpp_event_id\) WHERE ccpp_event_id IS NOT NULL DO NOTHING/);
    expect(sql).toMatch(/'\{"kind":"all_members"\}'::jsonb/);
    expect(sql).toMatch(/'\{"calendar":false,"events_page":true,"campus_rail":false\}'::jsonb/);
    expect(opts.replacements).toMatchObject({ ccppEventId: '777', title: 'AI Open House', eventType: 'open_house', registrationUrl: EB().registration_url, sourceImageUrl: EB().image_url, actorId: 'u-jackie' });
    expect(opts.replacements.startsAt).toEqual(new Date(EB().starts_at));
    expect(mockCalendar).toHaveBeenCalledTimes(1);
    expect(mockActivity).toHaveBeenCalledWith(ACTOR, 'event.adopted', 'event', 'hub-1', { ccpp_event_id: '777', title: 'AI Open House' }, mockTx);
  });
  it('adopting again is the same hub event, created false, with no second activity row (idempotent)', async () => {
    mockQuery.mockResolvedValue([]); mockFindOne.mockResolvedValue(row());
    const r = await adoptEventbriteEvent('777', ACTOR, { findEvent: find(EB()), now: () => NOW.getTime() });
    expect(r).toEqual({ event: { id: 'hub-1' }, created: false });
    expect(mockActivity).not.toHaveBeenCalled();
    expect(mockCalendar).not.toHaveBeenCalled();
  });
  it('a title without "open house" is a session', async () => {
    mockQuery.mockResolvedValue([{ id: 'hub-1' }]); mockFindOne.mockResolvedValue(row());
    await adoptEventbriteEvent('777', ACTOR, { findEvent: find(EB({ title: 'AI Friday Trends' })), now: () => NOW.getTime() });
    expect(mockQuery.mock.calls[0][1].replacements.eventType).toBe('session');
  });
});

describe('applyEventbriteFields', () => {
  it('cancelled and ended events are left alone', async () => {
    for (const status of ['cancelled', 'ended']) {
      const r = row({ status });
      // eslint-disable-next-line no-await-in-loop
      expect(await applyEventbriteFields(r as never, EB({ title: 'Changed' }), ACTOR, NOW, mockTx as never)).toEqual([]);
      expect(r.update).not.toHaveBeenCalled();
    }
  });
  it('nothing changed: no write, no activity, no cascade (a second sync is a no-op)', async () => {
    const r = row();
    expect(await applyEventbriteFields(r as never, EB(), ACTOR, NOW, mockTx as never)).toEqual([]);
    expect(r.update).not.toHaveBeenCalled();
    expect(mockCascade).not.toHaveBeenCalled();
  });
  it('a moved date updates only Eventbrite-owned fields and voids approvals through the edit cascade', async () => {
    const r = row();
    const changed = await applyEventbriteFields(r as never, EB({ starts_at: '2026-12-05T00:30:00.000Z', ends_at: '2026-12-05T02:00:00.000Z' }), ACTOR, NOW, mockTx as never);
    expect(changed).toEqual(['starts_at', 'ends_at']);
    const patch = r.update.mock.calls[0][0];
    expect(Object.keys(patch).sort()).toEqual(['ccpp_missing_since', 'ends_at', 'registration_url', 'source_image_url', 'starts_at', 'title', 'updated_by']);
    // The hub-owned fields are exactly as they were.
    expect([r.thumbnail_id, r.hosts, r.placement]).toEqual(['t-1', [{ name: 'Aleem' }], { calendar: false, events_page: true, campus_rail: false }]);
    expect(mockCascade).toHaveBeenCalledWith(r, ['starts_at', 'ends_at'], ACTOR, NOW, mockTx);
    expect(mockActivity).toHaveBeenCalledWith(ACTOR, 'event.synced_from_eventbrite', 'event', 'hub-1', { changed: ['starts_at', 'ends_at'], ccpp_event_id: '777' }, mockTx);
  });
  it('an event that came back clears its "missing" flag even when nothing else changed', async () => {
    const r = row({ ccpp_missing_since: new Date('2026-11-20T00:00:00Z') });
    expect(await applyEventbriteFields(r as never, EB(), ACTOR, NOW, mockTx as never)).toEqual([]);
    expect(r.update.mock.calls[0][0].ccpp_missing_since).toBeNull();
    expect(mockCascade).not.toHaveBeenCalled();
  });
});

describe('syncAdoptedEvents', () => {
  const ok = (events: EventbriteEventView[]) => ({ status: 'ok', window: 'upcoming', events, fetched_at: 'x' });
  it('does nothing when either Eventbrite list is unavailable (it cannot tell "removed" from "down")', async () => {
    const list = jest.fn().mockResolvedValueOnce(ok([])).mockResolvedValueOnce({ ...ok([]), status: 'unavailable' });
    expect((await syncAdoptedEvents(NOW, { list })).status).toBe('skipped_unavailable');
    expect(mockFindAll).not.toHaveBeenCalled();
  });
  it('updates an event Eventbrite changed, flags one missing inside the window once, and never deletes', async () => {
    const moved = row({ id: 'hub-1', ccpp_event_id: '777' });
    const gone = row({ id: 'hub-2', ccpp_event_id: '888', starts_at: new Date('2026-12-10T00:00:00Z') });
    const aged = row({ id: 'hub-3', ccpp_event_id: '999', starts_at: new Date('2026-07-01T00:00:00Z') }); // older than the past window
    const flagged = row({ id: 'hub-4', ccpp_event_id: '555', starts_at: new Date('2026-12-11T00:00:00Z'), ccpp_missing_since: new Date('2026-11-20T00:00:00Z') });
    mockFindAll.mockResolvedValue([moved, gone, aged, flagged]);
    mockFindByPk.mockResolvedValue(moved);
    const list = jest.fn().mockResolvedValueOnce(ok([EB({ title: 'AI Open House (new title)' })])).mockResolvedValueOnce(ok([]));
    const res = await syncAdoptedEvents(NOW, { list });
    expect(res).toEqual({ status: 'synced', checked: 4, updated: 1, missing: 1, failed: 0 });
    expect(moved.title).toBe('AI Open House (new title)');
    expect(gone.update).toHaveBeenCalledWith({ ccpp_missing_since: NOW });
    expect(aged.update).not.toHaveBeenCalled();
    expect(flagged.update).not.toHaveBeenCalled();
    expect(mockActivity).toHaveBeenCalledWith(expect.objectContaining({ label: 'Scheduled sender' }), 'event.missing_from_eventbrite', 'event', 'hub-2', { ccpp_event_id: '888', title: 'AI Open House' });
    // Only active managed events are read (Op keys are symbols, so read them directly).
    const { Op } = jest.requireActual('sequelize');
    expect(mockFindAll.mock.calls[0][0].where.status[Op.in]).toEqual(['draft', 'scheduled', 'live']);
    expect(mockFindAll.mock.calls[0][0].where.ccpp_event_id[Op.ne]).toBeNull();
  });
  it('one failing event is logged with its class and the rest still sync', async () => {
    const bad = row({ id: 'hub-1', ccpp_event_id: '777' });
    const good = row({ id: 'hub-2', ccpp_event_id: '888' });
    mockFindAll.mockResolvedValue([bad, good]);
    mockFindByPk.mockImplementation(async (id: string) => { if (id === 'hub-1') throw Object.assign(new Error('deadlock'), { name: 'SequelizeDatabaseError' }); return good; });
    const list = jest.fn().mockResolvedValueOnce(ok([EB({ title: 'X' }), EB({ ccpp_event_id: '888', title: 'Y' })])).mockResolvedValueOnce(ok([]));
    const res = await syncAdoptedEvents(NOW, { list });
    expect([res.failed, res.updated]).toEqual([1, 1]);
    const line = JSON.parse(errSpy.mock.calls[0][0]);
    expect([line.event, line.error_class]).toEqual(['comms_hub_eventbrite_sync_event_failed', 'SequelizeDatabaseError']);
  });
});

describe('syncAdoptedEventsIfDue', () => {
  it('runs at most once every 15 minutes', async () => {
    const { listEventbriteEvents } = jest.requireMock('../eventbriteEvents');
    (listEventbriteEvents as jest.Mock).mockResolvedValue({ status: 'unavailable', window: 'upcoming', events: [], fetched_at: 'x' });
    expect(await syncAdoptedEventsIfDue(NOW)).not.toBeNull();
    expect(await syncAdoptedEventsIfDue(new Date(NOW.getTime() + 60_000))).toBeNull();
    expect(await syncAdoptedEventsIfDue(new Date(NOW.getTime() + SYNC_EVERY_MS))).not.toBeNull();
  });
});
