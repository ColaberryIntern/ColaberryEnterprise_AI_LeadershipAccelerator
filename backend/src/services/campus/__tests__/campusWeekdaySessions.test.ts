const mockFindCohort = jest.fn();
const mockFindApp = jest.fn();
jest.mock('../../internship/internshipCohortService', () => {
  const actual = jest.requireActual('../../internship/internshipCohortService');
  return { ...actual, findInternshipCohort: (...a: unknown[]) => mockFindCohort(...a) };
});
jest.mock('../../internship/internshipApplicationService', () => ({ findLatestApplication: (...a: unknown[]) => mockFindApp(...a) }));
// eslint-disable-next-line import/first
import { getWeekdaySessions, sessionsFor } from '../campusWeekdaySessions';
// eslint-disable-next-line import/first
import { DEFAULT_INTERNSHIP_SETTINGS } from '../../internship/internshipCohortService';
// eslint-disable-next-line import/first
import type { RequiredMeeting } from '../../internship/internshipCohortService';

/**
 * Campus round 7 (C63): the weekly sessions. Every member sees the public Tue / Wed / Fri sessions; only an ACTIVE intern sees the
 * Monday call, and that is decided here on the server. No internship cohort, no sessions.
 */
const MEETINGS: RequiredMeeting[] = [
  { day: 'Friday', kind: 'trends', time: '9:00 AM', timezone: 'CT', audience: 'public', title: 'AI Friday Trends', room_id: 'r-pub', room_name: 'Colaberry AI Sessions' },
  { day: 'Monday', kind: 'standup', time: '9:00 AM', timezone: 'CT', audience: 'interns_only', title: 'Intern standup', room_id: 'r-int', room_name: 'AI Internship' },
  { day: 'Tuesday', kind: 'presentation', time: '10:00 AM', timezone: 'CT', audience: 'public', title: 'AI Internship Presentation' },
];

describe('sessionsFor (pure)', () => {
  it('a member who is not an intern never gets the Monday call', () => {
    expect(sessionsFor(MEETINGS, false).map((s) => s.title)).toEqual(['AI Internship Presentation', 'AI Friday Trends']);
  });
  it('an intern gets every session, in weekday order, Monday first', () => {
    expect(sessionsFor(MEETINGS, true).map((s) => [s.day, s.time, s.audience])).toEqual([
      ['monday', '9:00 AM', 'interns_only'], ['tuesday', '10:00 AM', 'public'], ['friday', '9:00 AM', 'public'],
    ]);
  });
  it('missing room fields are null, never invented; a missing audience counts as public; a missing title falls back to kind', () => {
    const [s] = sessionsFor([{ day: 'Wednesday', kind: 'strategy', time: '10:00 AM' }], false);
    expect(s).toEqual({ day: 'wednesday', time: '10:00 AM', title: 'strategy', audience: 'public', room_id: null, room_name: null, join_url: null, registration_url: null });
  });
  it('a meeting with no time or an unknown day is dropped (no guessing)', () => {
    expect(sessionsFor([{ day: 'Monday', kind: 'x' }, { day: 'Someday', kind: 'y', time: '9:00 AM' }, { day: 'Friday', kind: 'z', time: ' ' }], true)).toEqual([]);
  });
  it('empty in, empty out', () => { expect(sessionsFor([], true)).toEqual([]); });
});

describe('getWeekdaySessions', () => {
  beforeEach(() => { mockFindCohort.mockReset(); mockFindApp.mockReset(); });
  it('an active intern: intern true, the Monday call included', async () => {
    mockFindCohort.mockResolvedValue({ settings_json: { required_meetings: MEETINGS } });
    mockFindApp.mockResolvedValue({ state: 'active' });
    const r = await getWeekdaySessions('enr-1');
    expect(mockFindApp).toHaveBeenCalledWith('enr-1');
    expect(r.intern).toBe(true);
    expect(r.sessions.map((s) => s.day)).toEqual(['monday', 'tuesday', 'friday']);
  });
  it.each([['no application', null], ['an applicant in process', { state: 'interview_scheduled' }], ['a former intern', { state: 'completed' }]])(
    '%s is not an intern: no Monday call', async (_n, app) => {
      mockFindCohort.mockResolvedValue({ settings_json: { required_meetings: MEETINGS } });
      mockFindApp.mockResolvedValue(app);
      const r = await getWeekdaySessions('enr-2');
      expect(r.intern).toBe(false);
      expect(r.sessions.some((s) => s.audience === 'interns_only')).toBe(false);
    });
  it('the cohort with no stored meetings uses the defaults (Monday interns-only, three public)', async () => {
    mockFindCohort.mockResolvedValue({ settings_json: {} });
    mockFindApp.mockResolvedValue(null);
    const r = await getWeekdaySessions('enr-3');
    expect(r.sessions).toHaveLength(DEFAULT_INTERNSHIP_SETTINGS.required_meetings.filter((m) => m.audience !== 'interns_only').length);
  });
  it('a staff preview of the intern view (previewIntern) includes the Monday call for a non-intern', async () => {
    mockFindCohort.mockResolvedValue({ settings_json: { required_meetings: MEETINGS } });
    mockFindApp.mockResolvedValue(null);
    const r = await getWeekdaySessions('staff-1', { previewIntern: true });
    expect(r.intern).toBe(true);
    expect(r.sessions[0].audience).toBe('interns_only');
  });
  it('no internship cohort: no sessions', async () => {
    mockFindCohort.mockResolvedValue(null);
    mockFindApp.mockResolvedValue({ state: 'active' });
    expect(await getWeekdaySessions('enr-4')).toEqual({ intern: true, sessions: [] });
  });
  it('a database error propagates (the route answers 500)', async () => {
    mockFindCohort.mockRejectedValue(new Error('connect ETIMEDOUT'));
    mockFindApp.mockResolvedValue(null);
    await expect(getWeekdaySessions('enr-5')).rejects.toThrow('ETIMEDOUT');
  });
});
