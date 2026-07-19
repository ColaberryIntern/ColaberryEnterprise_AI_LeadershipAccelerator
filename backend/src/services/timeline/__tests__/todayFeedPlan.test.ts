/**
 * Pure planner invariants for the Today Timeline v2 engagement engine (Phase 1).
 * No I/O — exercises todayFeedPlan.planSlots directly.
 */
import { planSlots } from '../todayFeedPlan';
import type { AmbientProviderSlug } from '../ambientPool';

const P3: AmbientProviderSlug[] = ['blog', 'podcast', 'testimonial'];
const base = { cadence: 2, anchoredPlaced: 0, ambientPlaced: 0 };

describe('planSlots — bounds & counts', () => {
  it('count 0 → no slots', () => {
    const r = planSlots({ ...base, count: 0, anchoredAvailable: 10, providers: P3 });
    expect(r.slots).toHaveLength(0);
    expect(r.anchoredUsed).toBe(0);
    expect(r.ambientUsed).toBe(0);
  });

  it('anchoredUsed + ambientUsed always equals slots produced', () => {
    const r = planSlots({ ...base, count: 9, anchoredAvailable: 4, providers: P3 });
    expect(r.anchoredUsed + r.ambientUsed).toBe(r.slots.length);
  });

  it('no anchored and no providers → stops immediately (empty)', () => {
    const r = planSlots({ ...base, count: 5, anchoredAvailable: 0, providers: [] });
    expect(r.slots).toHaveLength(0);
  });

  it('anchored-only (no providers) places anchored then stops at exhaustion', () => {
    const r = planSlots({ ...base, count: 5, anchoredAvailable: 3, providers: [] });
    expect(r.slots.map((s) => s.kind)).toEqual(['anchored', 'anchored', 'anchored']);
    expect(r.anchoredUsed).toBe(3);
    expect(r.ambientUsed).toBe(0);
  });
});

describe('planSlots — cadence', () => {
  it('cadence 2 with ample anchored → A A m A A m', () => {
    const r = planSlots({ ...base, count: 6, anchoredAvailable: 100, providers: P3 });
    expect(r.slots.map((s) => s.kind)).toEqual(['anchored', 'anchored', 'ambient', 'anchored', 'anchored', 'ambient']);
    expect(r.anchoredUsed).toBe(4);
    expect(r.ambientUsed).toBe(2);
  });

  it('anchoredPlaced continuity resumes mid-cadence', () => {
    // one anchored already placed this cadence → A m A
    const r = planSlots({ ...base, anchoredPlaced: 1, count: 3, anchoredAvailable: 100, providers: P3 });
    expect(r.slots.map((s) => s.kind)).toEqual(['anchored', 'ambient', 'anchored']);
  });

  it('anchored exhausting mid-page switches the tail to pure ambient', () => {
    const r = planSlots({ ...base, cadence: 5, count: 4, anchoredAvailable: 1, providers: P3 });
    expect(r.slots.map((s) => s.kind)).toEqual(['anchored', 'ambient', 'ambient', 'ambient']);
    expect(r.anchoredUsed).toBe(1);
    expect(r.ambientUsed).toBe(3);
  });
});

describe('planSlots — ambient alternation & continuity', () => {
  it('pure ambient never repeats a provider back-to-back (len > 1)', () => {
    const r = planSlots({ ...base, count: 12, anchoredAvailable: 0, providers: P3 });
    expect(r.ambientUsed).toBe(12);
    for (let i = 1; i < r.slots.length; i++) {
      expect(r.slots[i].provider).not.toBe(r.slots[i - 1].provider);
    }
  });

  it('round-robins in order from a fresh feed', () => {
    const r = planSlots({ ...base, count: 3, anchoredAvailable: 0, providers: P3 });
    expect(r.slots.map((s) => s.provider)).toEqual(['blog', 'podcast', 'testimonial']);
  });

  it('ambientPlaced continuity advances the round-robin across pages', () => {
    const r = planSlots({ ...base, ambientPlaced: 1, count: 2, anchoredAvailable: 0, providers: P3 });
    expect(r.slots.map((s) => s.provider)).toEqual(['podcast', 'testimonial']);
  });

  it('single provider keeps serving it (no skip-loop crash)', () => {
    const r = planSlots({ ...base, count: 3, anchoredAvailable: 0, providers: ['blog'] });
    expect(r.slots.map((s) => s.provider)).toEqual(['blog', 'blog', 'blog']);
  });
});

describe('planSlots — determinism', () => {
  it('same inputs → identical output', () => {
    const args = { ...base, count: 15, anchoredAvailable: 6, providers: P3 };
    expect(planSlots({ ...args })).toEqual(planSlots({ ...args }));
  });
});
