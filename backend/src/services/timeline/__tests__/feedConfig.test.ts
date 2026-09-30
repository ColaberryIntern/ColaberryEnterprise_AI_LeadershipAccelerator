/**
 * feedConfigService.normalizePolicy — clamps + validates the global feed policy so
 * a bad/partial patch from the admin UI can never produce an invalid policy.
 */
import { normalizePolicy, DEFAULT_FEED_POLICY } from '../feedConfigService';

describe('normalizePolicy', () => {
  it('returns the defaults for empty/null input', () => {
    expect(normalizePolicy(null)).toEqual(DEFAULT_FEED_POLICY);
    expect(normalizePolicy({})).toEqual(DEFAULT_FEED_POLICY);
  });

  it('clamps out-of-range numbers', () => {
    const p = normalizePolicy({ todayCadence: 999, explorationPct: 5, recencyHalfLifeDays: 0, priorityWeight: -1 });
    expect(p.todayCadence).toBe(20);        // max
    expect(p.explorationPct).toBe(1);       // max
    expect(p.recencyHalfLifeDays).toBe(1);  // min
    expect(p.priorityWeight).toBe(0);       // min
  });

  it('keeps only valid ambient providers', () => {
    expect(normalizePolicy({ ambientProviders: ['blog', 'bogus', 'podcast'] as any }).ambientProviders).toEqual(['blog', 'podcast']);
    // an all-invalid list becomes empty (= ambient off), not the default
    expect(normalizePolicy({ ambientProviders: ['nope'] as any }).ambientProviders).toEqual([]);
  });

  it('preserves valid values', () => {
    const p = normalizePolicy({ todayCadence: 3, ambientProviders: ['testimonial'], defaultFrequencyCap: 2, defaultCooldownDays: 5 });
    expect(p.todayCadence).toBe(3);
    expect(p.ambientProviders).toEqual(['testimonial']);
    expect(p.defaultFrequencyCap).toBe(2);
    expect(p.defaultCooldownDays).toBe(5);
  });
});
