const mockPresence = jest.fn();
const mockEvents = jest.fn();
const mockBoard = jest.fn();
const mockList = jest.fn();
jest.mock('../../campus/campusPresenceService', () => ({ getCampusPresence: (...a: unknown[]) => mockPresence(...a) }));
jest.mock('../../publicEventsService', () => ({ getUpcomingPublicEvents: (...a: unknown[]) => mockEvents(...a) }));
jest.mock('../../community/boardStreamService', () => ({ boardHappening: (...a: unknown[]) => mockBoard(...a) }));
jest.mock('../../campus/campusAudience', () => ({ campusAudienceFor: () => Promise.resolve('member') }));
jest.mock('../../colaberryTv/tvService', () => ({ listForViewer: (...a: unknown[]) => mockList(...a) }));
// eslint-disable-next-line import/first
import { campusPulse, getHappening } from '../happeningService';

/** Campus v20 N2 (C133): every chip comes from real data; a failing source drops its chip (null), never the whole strip. */
const NOW = Date.parse('2026-11-11T17:00:00Z');

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockPresence.mockResolvedValue({ areas: { commons: { count: 5 }, lecture: { count: 2 }, quad: { count: 6 } } });
  mockEvents.mockResolvedValue([
    { id: 'past', title: 'Earlier', starts_at: new Date(NOW - 3600_000), timezone: 'America/Chicago' },
    { id: 'e2', title: 'Later', starts_at: new Date(NOW + 2 * 86400_000), timezone: 'America/Chicago' },
    { id: 'e1', title: 'AI Internship Presentation Event', starts_at: new Date(NOW + 86400_000), timezone: 'America/Chicago' },
  ]);
  mockBoard.mockResolvedValue({ open_questions: 3, latest_win: { id: 'w', title: 'What I built', author: 'Lena' } });
  mockList.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
});
afterEach(() => jest.restoreAllMocks());

it('composes the five parts from their sources, scoped to the viewer and cohort', async () => {
  const h = await getHappening('enr-1', 'coh-1', NOW);
  expect(h).toEqual({
    on_campus: { count: 13, busiest: 'commons', busiest_count: 5 },
    next_event: { id: 'e1', title: 'AI Internship Presentation Event', starts_at: new Date(NOW + 86400_000).toISOString(), timezone: 'America/Chicago' },
    open_questions: 3,
    latest_win: { id: 'w', title: 'What I built', author: 'Lena' },
    shorts: 2,
  });
  expect(mockPresence.mock.calls[0].slice(0, 2)).toEqual(['enr-1', 'coh-1']);
  expect(mockBoard).toHaveBeenCalledWith('enr-1');
});

it('a failing source is null and logged; the others still answer', async () => {
  mockPresence.mockRejectedValue(new Error('connect ETIMEDOUT'));
  mockEvents.mockRejectedValue(new Error('CCPP down'));
  const h = await getHappening('enr-1', null, NOW);
  expect(h.on_campus).toBeNull();
  expect(h.next_event).toBeNull();
  expect(h.open_questions).toBe(3);
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('colaberry_now_happening_part_failed'));
});

it('no data is no chip: nobody on campus, no upcoming event', async () => {
  mockPresence.mockResolvedValue({ areas: {} });
  mockEvents.mockResolvedValue([]);
  const h = await getHappening('enr-1', null, NOW);
  expect([h.on_campus, h.next_event]).toEqual([null, null]);
});

it('campusPulse: the Quad counts in the total but is never the busiest', () => {
  expect(campusPulse({ quad: { count: 9 } })).toEqual({ count: 9, busiest: null, busiest_count: 0 });
  expect(campusPulse({ quad: { count: 1 }, studio: { count: 1 } })).toEqual({ count: 2, busiest: 'studio', busiest_count: 1 });
  expect(campusPulse({})).toBeNull();
});
