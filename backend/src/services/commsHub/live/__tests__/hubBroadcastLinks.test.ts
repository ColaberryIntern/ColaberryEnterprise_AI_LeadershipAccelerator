/** CH5.3 the hub <-> broadcast joins: shapes, and they degrade to "nothing" (logged) instead of failing a page. */
const mockQuery = jest.fn();
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { hubThumbnailsForOccurrences, occurrencesForEvents } from '../hubBroadcastLinks';

beforeEach(() => mockQuery.mockReset());

describe('hubThumbnailsForOccurrences', () => {
  it('maps each hub occurrence to its event\'s chosen picture on the public route, and only hub refs with a picture', async () => {
    mockQuery.mockResolvedValue([{ occurrence_id: 'o1', event_id: 'e1', thumbnail_id: 't7' }]);
    expect([...(await hubThumbnailsForOccurrences(['o1', 'o2'])).entries()]).toEqual([['o1', '/api/comms-hub/thumbnails/e1/16x9.png?v=t7']]);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/r\.source_type = 'community_event'/);
    expect(sql).toMatch(/split_part\(r\.source_id, '@', 1\)/);
    expect(sql).toMatch(/e\.thumbnail_id IS NOT NULL/);
    // Exactly the public route's conditions, so the URL never 404s (a cancelled event, one off the Events page).
    expect(sql).toMatch(/e\.status IN \('scheduled', 'live', 'ended'\)/);
    expect(sql).toMatch(/\(e\.placement->>'events_page'\)::boolean/);
    expect(opts.replacements).toEqual({ ids: ['o1', 'o2'] });
  });

  it('no ids: no query; a failed query: an empty map, logged', async () => {
    expect((await hubThumbnailsForOccurrences([])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new Error('db down'));
    expect((await hubThumbnailsForOccurrences(['o1'])).size).toBe(0);
    expect(spy.mock.calls[0][0]).toContain('comms_hub_replay_thumbnails_failed');
    spy.mockRestore();
  });
});

describe('occurrencesForEvents', () => {
  it('groups every prepared date by its hub event id', async () => {
    mockQuery.mockResolvedValue([
      { event_id: 'e1', occurrence_id: 'o1', editorial_state: 'live', scheduled_start_at: '2026-12-02T00:00:00.000Z' },
      { event_id: 'e1', occurrence_id: 'o2', editorial_state: 'scheduled', scheduled_start_at: null },
    ]);
    const m = await occurrencesForEvents(['e1', 'e2']);
    expect(m.get('e1')).toEqual([
      { occurrence_id: 'o1', editorial_state: 'live', scheduled_start_at: new Date('2026-12-02T00:00:00.000Z') },
      { occurrence_id: 'o2', editorial_state: 'scheduled', scheduled_start_at: null },
    ]);
    expect(m.has('e2')).toBe(false);
  });

  it('a failed query: an empty map, so cards still load (without Watch live)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new Error('db down'));
    expect((await occurrencesForEvents(['e1'])).size).toBe(0);
    spy.mockRestore();
  });
});
