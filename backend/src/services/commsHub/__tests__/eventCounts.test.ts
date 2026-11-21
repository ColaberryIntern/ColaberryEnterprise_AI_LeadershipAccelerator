const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockFindByPk = jest.fn();
jest.mock('../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: (...a: unknown[]) => mockFindByPk(...a) } }));
const mockList = jest.fn();
jest.mock('../eventbrite/registrants', () => ({ listRegistrants: (...a: unknown[]) => mockList(...a) }));

import { eventCounts, EventCountsNotFound, watchCounts } from '../eventCounts';

/**
 * CH9.7 registered / watched live / watched the replay. Live and replay are told apart by when each
 * person first started watching; staff and test viewers never count; and an unknown number is null
 * with a reason, never 0.
 */
const START = new Date('2026-12-04T00:30:00Z');
const END = new Date('2026-12-04T02:00:00Z');
const stream = (o: Record<string, unknown> = {}) => ({ id: 'o1', content_started_at: START, ended_at: END, ...o });
const viewer = (enrollment: string, at: Date, occ = 'o1') => ({ occurrence_id: occ, enrollment_id: enrollment, first_seen_at: at });
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('watchCounts (pure)', () => {
  it('first seen at or before the end is live; after is the replay; the boundary instant is live', () => {
    const r = watchCounts([stream()], [viewer('a', new Date(START.getTime() + 60_000)), viewer('b', END), viewer('c', new Date(END.getTime() + 1))]);
    expect(r).toEqual({ watched_live: { value: 2, reason: null }, watched_replay: { value: 1, reason: null } });
  });
  it('one person across two dates of a series counts once per kind', () => {
    const r = watchCounts([stream(), stream({ id: 'o2' })], [viewer('a', START), viewer('a', START, 'o2'), viewer('a', new Date(END.getTime() + 5), 'o2')]);
    expect([r.watched_live.value, r.watched_replay.value]).toEqual([1, 1]);
  });
  it('never streamed: both unknown, "Not streamed yet", never 0', () => {
    expect(watchCounts([stream({ content_started_at: null, ended_at: null })], [])).toEqual({
      watched_live: { value: null, reason: 'Not streamed yet.' }, watched_replay: { value: null, reason: 'Not streamed yet.' },
    });
    expect(watchCounts([], []).watched_live.value).toBeNull();
  });
  it('still live: everyone so far is live, and there is no replay yet', () => {
    const r = watchCounts([stream({ ended_at: null })], [viewer('a', START), viewer('b', new Date('2026-12-04T05:00:00Z'))]);
    expect(r.watched_live).toEqual({ value: 2, reason: null });
    expect(r.watched_replay).toEqual({ value: null, reason: 'The stream has not ended yet, so there is no replay.' });
  });
  it('streamed with nobody watching is a real 0', () => {
    expect(watchCounts([stream()], [])).toEqual({ watched_live: { value: 0, reason: null }, watched_replay: { value: 0, reason: null } });
  });
});

describe('eventCounts', () => {
  it('an Eventbrite event managed in the hub: registered from its registrants; the viewer query leaves out staff and test', async () => {
    mockFindByPk.mockResolvedValue({ id: 'hub-1', ccpp_event_id: '777', registration_url: 'https://eb' });
    mockList.mockResolvedValue({ eventbrite: 'ok', rows: [{}, {}, {}] });
    mockQuery.mockResolvedValueOnce([stream()]).mockResolvedValueOnce([viewer('a', START)]);
    expect(await eventCounts('hub-1')).toEqual({ registered: { value: 3, reason: null }, watched_live: { value: 1, reason: null }, watched_replay: { value: 0, reason: null } });
    expect(mockQuery.mock.calls[1][0]).toMatch(/is_staff = false AND is_test = false/);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({ eventId: 'hub-1' });
  });
  it('Eventbrite unreadable: registered is unknown (not a partial count)', async () => {
    mockFindByPk.mockResolvedValue({ id: 'hub-1', ccpp_event_id: '777', registration_url: null });
    mockList.mockResolvedValue({ eventbrite: 'unavailable', rows: [{}] });
    mockQuery.mockResolvedValue([]);
    expect((await eventCounts('hub-1')).registered).toEqual({ value: null, reason: 'Eventbrite could not be read just now.' });
    // Not connected on the server is a different, permanent fact, and says so.
    mockList.mockResolvedValue({ eventbrite: 'not_configured', rows: [] });
    expect((await eventCounts('hub-1')).registered).toEqual({ value: null, reason: 'Eventbrite is not connected on this server.' });
  });
  it('a hub-made event: registration is not tracked here, said why', async () => {
    mockFindByPk.mockResolvedValue({ id: 'hub-2', ccpp_event_id: null, registration_url: 'https://forms.test/x' });
    mockQuery.mockResolvedValue([]);
    expect((await eventCounts('hub-2')).registered).toEqual({ value: null, reason: 'Registration for this event is taken outside the hub.' });
    mockFindByPk.mockResolvedValue({ id: 'hub-3', ccpp_event_id: null, registration_url: null });
    expect((await eventCounts('hub-3')).registered.reason).toBe('This event has no registration.');
    expect(mockList).not.toHaveBeenCalled();
  });
  it('telemetry unreadable: both watch counts unknown with the reason, logged; never 0', async () => {
    mockFindByPk.mockResolvedValue({ id: 'hub-1', ccpp_event_id: null, registration_url: null });
    mockQuery.mockRejectedValue(new Error('relation "broadcast_viewer_people" does not exist'));
    const r = await eventCounts('hub-1');
    expect([r.watched_live, r.watched_replay]).toEqual([{ value: null, reason: 'Viewing numbers are unavailable right now.' }, { value: null, reason: 'Viewing numbers are unavailable right now.' }]);
    expect(JSON.parse(errSpy.mock.calls[0][0]).event).toBe('comms_hub_counts_watch_failed');
  });
  it('a missing event is EventCountsNotFound', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(eventCounts('nope')).rejects.toBeInstanceOf(EventCountsNotFound);
  });
});
