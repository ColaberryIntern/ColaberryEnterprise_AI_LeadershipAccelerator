/**
 * W22 (Ali, 2026-11-17): "business accounts should start in the old format mode and not use the campus."
 *
 * The server sends default_nav 'classic' for a business (org manager) account. What this pins:
 *  1. The client reads it, and only when the campus is on; anything else is dropped.
 *  2. The default applies only when this browser holds no nav choice. A stored choice wins.
 *  3. With the classic default in force the first-visit campus landing does not fire.
 */
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../../utils/participantToken', () => ({
  getParticipantToken: () => 'tok-1',
  isReadOnlyParticipantSession: () => false,
}));
jest.mock('../../../services/onboardingApi', () => ({}));
jest.mock('../../../pages/portal/scheduleCache', () => ({ loadSchedule: jest.fn() }));
jest.mock('../../../pages/portal/today/explorerFirstWin', () => ({ needsFirstLesson: () => false, FIRST_LESSON_HREF: '/x' }));
jest.mock('../CampusContext', () => ({ useCampus: jest.fn() }));

/* eslint-disable import/first */
import axios from 'axios';
import { fetchCampusFlags } from '../campusApi';
import { CAMPUS_SETTINGS_KEY, readStoredNav, startingNav } from '../campusSettings';
import { shouldLandOnCampus } from '../useCampusLanding';
/* eslint-enable import/first */

const get = axios.get as jest.Mock;

describe('W22: the flags carry the business default', () => {
  beforeEach(() => get.mockReset());

  it('reads default_nav classic when the campus is on', async () => {
    get.mockResolvedValue({ data: { campus: true, default_nav: 'classic' } });
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: true, defaultNav: 'classic' });
  });

  it('drops it when the campus is off, and drops junk values', async () => {
    get.mockResolvedValue({ data: { campus: false, default_nav: 'classic' } });
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: false });
    get.mockResolvedValue({ data: { campus: true, default_nav: 'mall' } });
    await expect(fetchCampusFlags()).resolves.toEqual({ campus: true });
  });
});

describe('W22: a choice the person made always wins', () => {
  afterEach(() => window.localStorage.clear());

  it('no stored choice: a business account starts in classic', () => {
    expect(readStoredNav()).toBeNull();
    expect(startingNav(readStoredNav(), { campus: true, defaultNav: 'classic' })).toBe('classic');
  });

  it('a stored campus choice keeps the campus', () => {
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus' }));
    expect(readStoredNav()).toBe('campus');
    expect(startingNav(readStoredNav(), { campus: true, defaultNav: 'classic' })).toBeNull();
  });

  it('a learner (no default) keeps whatever is in state', () => {
    expect(startingNav(null, { campus: true })).toBeNull();
  });

  it('the campus off: no default is adopted', () => {
    expect(startingNav(null, { campus: false, defaultNav: 'classic' })).toBeNull();
  });

  it('unreadable storage reads as no choice', () => {
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, '{not json');
    expect(readStoredNav()).toBeNull();
  });
});

describe('W22: classic in force means no campus landing', () => {
  it('does not land on the campus when the campus is not active', () => {
    expect(shouldLandOnCampus({ ready: true, active: false, pathname: '/portal/today', search: '', landed: false })).toBe(false);
    expect(shouldLandOnCampus({ ready: true, active: true, pathname: '/portal/today', search: '', landed: false })).toBe(true);
  });
});
