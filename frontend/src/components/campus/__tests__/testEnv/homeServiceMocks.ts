/**
 * jest.mock factories for the services the campus home reads (WP-1 test harness; no imports, so a factory can require it):
 *
 *   jest.mock('../../../services/onboardingApi', () => require('./testEnv/homeServiceMocks').onboardingApi(jest.requireActual('../../../services/onboardingApi')));
 *   jest.mock('../../../services/communityApi', () => require('./testEnv/homeServiceMocks').communityApi(jest.requireActual('../../../services/communityApi')));
 *
 * Not a test (CI ignores testEnv/).
 */
type Mod = Record<string, unknown>;
export const onboardingApi = (actual: Mod): Mod => ({
  ...actual,
  fetchOnboardingProfile: () => Promise.resolve({ profile: { full_name: 'Test Learner' } }),
  fetchStreak: () => Promise.resolve({ count: 0, claimed_today: false, week: [], total_streak_points: 0, next_points: 0 }),
  // WP-4: the gate claims the streak on Enter (Q9); here the server says it was already claimed, so nothing is awarded
  claimDailyStreak: () => Promise.resolve({ awarded: false, points: 0, streak: { count: 0, claimed_today: true, week: [], total_streak_points: 0, next_points: 0 } }),
  fetchPortalFlags: () => Promise.resolve({}),
});
export const communityApi = (actual: Mod): Mod => ({ ...actual, fetchUnreadNotificationCount: () => Promise.resolve(0) });
