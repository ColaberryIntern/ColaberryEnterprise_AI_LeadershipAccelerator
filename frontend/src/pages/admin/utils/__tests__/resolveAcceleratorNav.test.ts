import { resolveAcceleratorNav } from '../resolveAcceleratorNav';

const KNOWN_TABS = ['cohorts', 'sessions', 'participants', 'curriculum', 'class-dashboard'];
const KNOWN_COHORTS = ['cohort-a', 'cohort-b'];

describe('resolveAcceleratorNav', () => {
  it('no params -> no change (regression: default-cohort behavior preserved)', () => {
    const result = resolveAcceleratorNav({ tab: null, cohort: null }, KNOWN_TABS, KNOWN_COHORTS, 'cohorts', 'cohort-a');
    expect(result).toEqual({ consumedParams: false });
  });

  it('a tab param matching a known tab resolves to it', () => {
    const result = resolveAcceleratorNav({ tab: 'sessions', cohort: null }, KNOWN_TABS, KNOWN_COHORTS, 'cohorts', 'cohort-a');
    expect(result.nextTab).toBe('sessions');
    expect(result.consumedParams).toBe(true);
  });

  it('an UNKNOWN tab param does not crash or blank the page — no nextTab set', () => {
    const result = resolveAcceleratorNav({ tab: 'not-a-real-tab', cohort: null }, KNOWN_TABS, KNOWN_COHORTS, 'cohorts', 'cohort-a');
    expect(result.nextTab).toBeUndefined();
    expect(result.consumedParams).toBe(true); // still clears the bad param from the URL
  });

  it('a cohort param matching a cohort already in the list resolves to it', () => {
    const result = resolveAcceleratorNav({ tab: null, cohort: 'cohort-b' }, KNOWN_TABS, KNOWN_COHORTS, 'sessions', 'cohort-a');
    expect(result.nextCohortId).toBe('cohort-b');
    expect(result.needsCohortFetch).toBeUndefined();
  });

  it('a cohort param NOT in the list signals needsCohortFetch instead of being silently ignored', () => {
    const result = resolveAcceleratorNav({ tab: null, cohort: 'cohort-closed-999' }, KNOWN_TABS, KNOWN_COHORTS, 'sessions', 'cohort-a');
    expect(result.needsCohortFetch).toBe('cohort-closed-999');
    expect(result.nextCohortId).toBeUndefined();
  });

  it('is idempotent — calling twice with the same params returns the same result both times', () => {
    const params = { tab: 'participants', cohort: 'cohort-b' };
    const first = resolveAcceleratorNav(params, KNOWN_TABS, KNOWN_COHORTS, 'cohorts', 'cohort-a');
    const second = resolveAcceleratorNav(params, KNOWN_TABS, KNOWN_COHORTS, 'cohorts', 'cohort-a');
    expect(first).toEqual(second);
  });

  it('requesting the tab/cohort that is already active still reports consumedParams so a repeated click clears the URL', () => {
    const result = resolveAcceleratorNav({ tab: 'sessions', cohort: 'cohort-a' }, KNOWN_TABS, KNOWN_COHORTS, 'sessions', 'cohort-a');
    expect(result.consumedParams).toBe(true);
    expect(result.nextTab).toBeUndefined(); // already active, no redundant setState
    expect(result.nextCohortId).toBeUndefined();
  });

  it('a second, different quick-nav click resolves independently of the first (the actual bug scenario)', () => {
    // Simulates: user clicks "Sessions" for cohort-a, then immediately clicks
    // "Participants" for cohort-b — the second call must resolve fresh, not reuse
    // stale state from the first.
    const afterFirstClick = resolveAcceleratorNav({ tab: 'sessions', cohort: 'cohort-a' }, KNOWN_TABS, KNOWN_COHORTS, 'cohorts', 'cohort-a');
    expect(afterFirstClick.nextTab).toBe('sessions');

    const afterSecondClick = resolveAcceleratorNav({ tab: 'participants', cohort: 'cohort-b' }, KNOWN_TABS, KNOWN_COHORTS, 'sessions', 'cohort-a');
    expect(afterSecondClick.nextTab).toBe('participants');
    expect(afterSecondClick.nextCohortId).toBe('cohort-b');
  });
});
