/**
 * Pure planner invariants for the Today Timeline v2 engagement engine (Phase 1).
 * No I/O — exercises todayFeedPlan.planSlots directly.
 */
import { planSlots, anchoredWeekAllowed, weekStartedForToday, WeekGateCard } from '../todayFeedPlan';
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

describe('anchoredWeekAllowed — free-tier / current-week gate', () => {
  it('paid members see any week', () => {
    for (const w of [0, 1, 5, 12, null]) expect(anchoredWeekAllowed(w, false)).toBe(true);
  });
  it('free/Explorer members see ONLY Week 0 curriculum', () => {
    expect(anchoredWeekAllowed(0, true)).toBe(true);
    for (const w of [1, 2, 5, 12]) expect(anchoredWeekAllowed(w, true)).toBe(false);
  });
  it('free members do not see non-week (null) curriculum', () => {
    expect(anchoredWeekAllowed(null, true)).toBe(false);
  });
});

describe('weekStartedForToday — Today-only same-week self-unlock', () => {
  const c = (o: Partial<WeekGateCard> & Pick<WeekGateCard, 'id'>): WeekGateCard => ({
    type: 'quiz', bucket: 'learn', week: 1, order: 0, status: 'available', ...o,
  });

  it('zero completions in week N: only the entry (lowest-order) card shows', () => {
    const entry = c({ id: 'w1-first', order: 0 });
    const rest = c({ id: 'w1-second', order: 1 });
    const cards = [entry, rest];
    expect(weekStartedForToday(entry, cards)).toBe(true);
    expect(weekStartedForToday(rest, cards)).toBe(false);
  });

  it('>=1 completed card in week N shows the rest of that week', () => {
    const entry = c({ id: 'w1-first', order: 0, status: 'completed' });
    const rest = c({ id: 'w1-second', order: 1 });
    const cards = [entry, rest];
    expect(weekStartedForToday(rest, cards)).toBe(true);
  });

  it('week 0 always shows regardless of completions', () => {
    const w0a = c({ id: 'w0-a', week: 0, order: 0 });
    const w0b = c({ id: 'w0-b', week: 0, order: 1 });
    expect(weekStartedForToday(w0b, [w0a, w0b])).toBe(true);
  });

  it('non-completable types (announcements) always show, never gated', () => {
    const ann = c({ id: 'ann', type: 'announcement', order: 5 }); // highest order, would never be "entry"
    const entry = c({ id: 'w1-first', order: 0 });
    const rest = c({ id: 'w1-second', order: 1 });
    const cards = [ann, entry, rest];
    expect(weekStartedForToday(ann, cards)).toBe(true);
    expect(weekStartedForToday(rest, cards)).toBe(false); // unaffected by the announcement's presence
  });

  it('an announcement is never counted as the "entry card" for a completable sibling', () => {
    // ann has the lowest order but is non-completable — the entry-card exemption
    // must fall to the lowest-order COMPLETABLE card instead, or week 1 could
    // never start (the announcement can't be "completed").
    const ann = c({ id: 'ann', type: 'announcement', order: 0 });
    const entry = c({ id: 'w1-first', order: 1 });
    const rest = c({ id: 'w1-second', order: 2 });
    const cards = [ann, entry, rest];
    expect(weekStartedForToday(entry, cards)).toBe(true);
    expect(weekStartedForToday(rest, cards)).toBe(false);
  });

  it('REGRESSION (prod bug 2026-08-02): a reflect/advance-bucket card tied at order 0 with an earlier-bucket card is never chosen as the entry card, regardless of UUID sort order', () => {
    // Reproduces the exact live shape: an `evaluation` (bucket 'reflect', order 0)
    // and a `learn`-bucket card (order 0) tied on raw order. `order` is scored PER
    // BUCKET, not globally across the week, so a raw (order, id) sort can let the
    // evaluation win purely by UUID string luck — it must never win against an
    // earlier pedagogical bucket, no matter how the ids compare.
    const evalCard = c({ id: 'aaaaaaaa-0000-0000-0000-000000000000', type: 'evaluation', bucket: 'reflect', order: 0 });
    const learnCard = c({ id: 'zzzzzzzz-0000-0000-0000-000000000000', bucket: 'learn', order: 0 });
    const cards = [evalCard, learnCard];
    // Sanity: 'aaaa...' sorts before 'zzzz...' — a naive (order,id) sort would
    // have picked evalCard as "entry" here. Bucket sequence must override that.
    expect(weekStartedForToday(evalCard, cards)).toBe(false);
    expect(weekStartedForToday(learnCard, cards)).toBe(true);
  });

  it('bucket sequence still respects order-within-bucket when buckets differ', () => {
    const preClass = c({ id: 'pc', bucket: 'pre_class', order: 0 });
    const build = c({ id: 'b1', bucket: 'build', order: 0 });
    const cards = [preClass, build];
    expect(weekStartedForToday(preClass, cards)).toBe(true);
    expect(weekStartedForToday(build, cards)).toBe(false);
  });
});
