/**
 * OH1t: the next Open House session is kept on our side by the scheduler, and anyone who
 * registered before it existed gets the countdown booked.
 */
const query = jest.fn();
const getCurrentOpenHouseEvent = jest.fn();
const findOpenHouseCountdownCampaign = jest.fn();
const grantEventReminderPermission = jest.fn();
const enrollLeadInSequence = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
jest.mock('../openHouseEventService', () => ({ getCurrentOpenHouseEvent: () => getCurrentOpenHouseEvent() }));
jest.mock('../cohortService', () => ({ getOrCreateExplorerCohort: async () => ({ id: 'cohort-x' }) }));
jest.mock('../centralDate', () => ({
  CENTRAL_TZ: 'America/Chicago',
  instantToWallClock: (d: Date) => (d.getTime() === new Date('2026-12-04T00:30:00Z').getTime() ? '2026-12-03T18:30:00' : '2026-12-03T19:30:00'),
}));
jest.mock('../openHouseCountdown', () => ({
  findOpenHouseCountdownCampaign: () => findOpenHouseCountdownCampaign(),
  grantEventReminderPermission: (...a: unknown[]) => grantEventReminderPermission(...a),
}));
jest.mock('../sequenceService', () => ({ enrollLeadInSequence: (...a: unknown[]) => enrollLeadInSequence(...a) }));

import {
  ensureNextOpenHouseSession, bookCountdownForEarlierRegistrants, syncOpenHouseCountdown, UNBOOKED_REGISTRANTS_SQL,
} from '../openHouseSessionSync';

const quiet = () => undefined;
const EVENT = { announced: true, event_id: '2004289647289', name: 'Open House', starts_at: '2026-12-04T00:30:00Z', ends_at: null };
const sqlCalls = () => query.mock.calls.map((c) => String(c[0]));

beforeEach(() => { jest.clearAllMocks(); });

describe('ensureNextOpenHouseSession', () => {
  it('does nothing when no Open House is announced', async () => {
    getCurrentOpenHouseEvent.mockResolvedValue({ announced: false });
    expect(await ensureNextOpenHouseSession({}, quiet)).toEqual({ outcome: 'no_event' });
    expect(query).not.toHaveBeenCalled();
  });

  it('inserts a scheduled session in Central time when none exists', async () => {
    getCurrentOpenHouseEvent.mockResolvedValue(EVENT);
    query.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
    const r = await ensureNextOpenHouseSession({}, quiet);
    expect(r.outcome).toBe('created');
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    const insert = query.mock.calls[1];
    expect(String(insert[0])).toMatch(/INSERT INTO live_sessions[\s\S]*'scheduled'/);
    expect(insert[1].replacements).toMatchObject({ date: '2026-12-03', start: '18:30', end: '19:30', eventId: EVENT.event_id });
  });

  it('updates the existing row in place, never its status or reminder stamps', async () => {
    getCurrentOpenHouseEvent.mockResolvedValue(EVENT);
    query.mockResolvedValueOnce([{ id: 'sess-1' }]).mockResolvedValueOnce(undefined);
    expect(await ensureNextOpenHouseSession({}, quiet)).toMatchObject({ outcome: 'updated', id: 'sess-1' });
    const update = String(query.mock.calls[1][0]);
    expect(update).toMatch(/^UPDATE live_sessions SET title/);
    expect(update).not.toMatch(/status|reminder/);
  });

  it('writes nothing on a dry run', async () => {
    getCurrentOpenHouseEvent.mockResolvedValue(EVENT);
    query.mockResolvedValueOnce([]);
    expect(await ensureNextOpenHouseSession({ dryRun: true }, quiet)).toMatchObject({ outcome: 'dry_run', would: 'insert' });
    expect(sqlCalls().some((s) => /INSERT|UPDATE/.test(s))).toBe(false);
  });
});

describe('UNBOOKED_REGISTRANTS_SQL', () => {
  it('counts a countdown row for THIS session in any status as already booked', () => {
    expect(UNBOOKED_REGISTRANTS_SQL).toMatch(/metadata->>'event_session_id' = CAST\(:sessionId AS text\)/);
    expect(UNBOOKED_REGISTRANTS_SQL).not.toMatch(/se\.status/);
  });
  it('leaves removed enrollments alone and only looks at upcoming sessions', () => {
    expect(UNBOOKED_REGISTRANTS_SQL).toMatch(/cl\.status = 'removed'/);
    expect(UNBOOKED_REGISTRANTS_SQL).toMatch(/s\.status IN \('scheduled', 'live'\)/);
  });
});

describe('bookCountdownForEarlierRegistrants', () => {
  it('books nothing while the countdown campaign is not active', async () => {
    findOpenHouseCountdownCampaign.mockResolvedValue({ id: 'c1', status: 'paused', sequence_id: 's1' });
    expect(await bookCountdownForEarlierRegistrants('sess-1', quiet)).toMatchObject({ campaign: 'not_active', candidates: 0 });
    expect(query).not.toHaveBeenCalled();
    expect(enrollLeadInSequence).not.toHaveBeenCalled();
  });

  it('grants the permission, then books each unbooked registrant, and survives one failure', async () => {
    findOpenHouseCountdownCampaign.mockResolvedValue({ id: 'c1', status: 'active', sequence_id: 's1' });
    query.mockResolvedValueOnce([{ lead_id: 1 }, { lead_id: 2 }, { lead_id: 3 }]);
    const order: string[] = [];
    grantEventReminderPermission.mockImplementation(async (_c: string, id: number) => { order.push(`grant${id}`); return 'granted'; });
    enrollLeadInSequence
      .mockImplementationOnce(async () => { order.push('book1'); return [{}, {}, {}]; })
      .mockImplementationOnce(async () => { throw new Error('test lead'); })
      .mockImplementationOnce(async () => { order.push('book3'); return []; });
    const r = await bookCountdownForEarlierRegistrants('sess-1', quiet);
    expect(r).toEqual({ campaign: 'ok', candidates: 3, booked: 1, rows: 3, nothing_booked: 1, errors: 1 });
    expect(order.slice(0, 2)).toEqual(['grant1', 'book1']);
    expect(enrollLeadInSequence).toHaveBeenCalledWith(1, 's1', 'c1');
    expect(query.mock.calls[0][1].replacements).toEqual({ sessionId: 'sess-1', campaignId: 'c1' });
  });
});

describe('syncOpenHouseCountdown', () => {
  it('never throws, even when the event source is down', async () => {
    getCurrentOpenHouseEvent.mockRejectedValue(new Error('CCPP down'));
    await expect(syncOpenHouseCountdown(quiet)).resolves.toEqual({ session: null, booking: null });
  });

  it('books only after a session was created or updated', async () => {
    getCurrentOpenHouseEvent.mockResolvedValue({ announced: false });
    expect((await syncOpenHouseCountdown(quiet)).booking).toBeNull();
    expect(findOpenHouseCountdownCampaign).not.toHaveBeenCalled();

    getCurrentOpenHouseEvent.mockResolvedValue(EVENT);
    query.mockResolvedValueOnce([{ id: 'sess-1' }]).mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);
    findOpenHouseCountdownCampaign.mockResolvedValue({ id: 'c1', status: 'active', sequence_id: 's1' });
    const r = await syncOpenHouseCountdown(quiet);
    expect(r.session).toMatchObject({ outcome: 'updated', id: 'sess-1' });
    expect(r.booking).toMatchObject({ campaign: 'ok', candidates: 0 });
  });
});
