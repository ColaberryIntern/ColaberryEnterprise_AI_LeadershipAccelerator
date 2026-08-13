import {
  EXPLORER_SIGNAL_DEFINITIONS,
  STILL_UNINSTRUMENTED,
  isKnownSignal,
  getSignalDefinition,
  signalsInBand,
  writableSignals,
  decayedWeight,
  highestTier,
} from '../explorerSignalDefinitions';
import type { ExplorerSignalBand } from '../../../types/explorerGrowth';

const BANDS: ExplorerSignalBand[] = ['engagement', 'intent', 'friction'];

describe('table integrity', () => {
  it('gives every signal a positive weight and a cap at least as large', () => {
    for (const [name, def] of Object.entries(EXPLORER_SIGNAL_DEFINITIONS)) {
      expect(def.weight).toBeGreaterThan(0);
      expect(def.cap).toBeGreaterThanOrEqual(def.weight);
      expect(BANDS).toContain(def.band);
      expect(def.source).toBeTruthy();
      if (def.halfLifeDays !== null) expect(def.halfLifeDays).toBeGreaterThan(0);
    }
  });

  it('covers all three bands', () => {
    for (const band of BANDS) expect(signalsInBand(band).length).toBeGreaterThan(0);
  });

  it('puts a tier on intent signals and ONLY on intent signals', () => {
    // The tier gate is what stops twenty page views manufacturing readiness.
    // A tier on a non-intent signal would leak into that gate.
    for (const [name, def] of Object.entries(EXPLORER_SIGNAL_DEFINITIONS)) {
      if (def.band === 'intent') {
        expect([1, 2, 3, 4]).toContain(def.tier);
      } else {
        expect(def.tier).toBeUndefined();
      }
    }
  });

  it('covers all four intent tiers', () => {
    const tiers = new Set(
      Object.values(EXPLORER_SIGNAL_DEFINITIONS)
        .filter((d) => d.band === 'intent')
        .map((d) => d.tier),
    );
    expect([...tiers].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("EPIC 2's own outputs are present, or the writer has no alphabet", () => {
  // The cycle-1 plan audit caught this as a hard contradiction: the writer
  // rejects any event type absent from this table, so if nothing here is
  // sourced from student_navigation_events, the first writer can accept nothing
  // and the real-database read-back has nothing to write.
  it('defines at least one signal sourced from student_navigation_events', () => {
    expect(writableSignals().length).toBeGreaterThan(0);
  });

  it('defines the §6.1 portal-session signal at weight 2, cap 10, 7d half-life', () => {
    const def = getSignalDefinition('portal_session');
    expect(def).toMatchObject({
      band: 'engagement',
      weight: 2,
      cap: 10,
      halfLifeDays: 7,
      source: 'student_navigation_events',
    });
  });

  it.each(['enrollment_form_started', 'payment_attempted_no_completion'])(
    'defines %s, which this epic instruments',
    (signal) => {
      expect(isKnownSignal(signal)).toBe(true);
    },
  );
});

describe('signals still dark after this epic are absent, not defined-but-dead', () => {
  // A definition for a signal nothing emits makes a score look computed when a
  // whole dimension is unlit.
  it.each([
    'internship_page_view',
    'internship_application_started',
    'certification_progress',
    'failed_event_registration',
  ])('%s is absent from the table', (signal) => {
    expect(isKnownSignal(signal)).toBe(false);
  });

  it('documents each absent signal with a reason', () => {
    expect(STILL_UNINSTRUMENTED.length).toBeGreaterThan(0);
    for (const entry of STILL_UNINSTRUMENTED) {
      expect(entry.reason.length).toBeGreaterThan(20);
      expect(isKnownSignal(entry.signal)).toBe(false);
    }
  });
});

describe('decayedWeight — the house curve, 2^(-age/halfLife)', () => {
  const now = new Date('2026-08-12T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it('gives full weight at age zero', () => {
    // card_completed: weight 6, half-life 21d
    expect(decayedWeight('card_completed', now, now)).toBeCloseTo(6, 6);
  });

  it('halves at exactly one half-life', () => {
    expect(decayedWeight('card_completed', daysAgo(21), now)).toBeCloseTo(3, 6);
  });

  it('quarters at two half-lives', () => {
    expect(decayedWeight('card_completed', daysAgo(42), now)).toBeCloseTo(1.5, 6);
  });

  it('approaches zero at ten half-lives', () => {
    expect(decayedWeight('card_completed', daysAgo(210), now)).toBeLessThan(0.01);
  });

  it('never decays a signal whose half-life is null', () => {
    // A hard bounce does not become untrue with time.
    expect(decayedWeight('email_hard_bounce', daysAgo(365), now)).toBe(30);
  });

  it('clamps a future-dated occurrence to full weight rather than amplifying', () => {
    // Clock skew must not let a signal contribute MORE than its weight.
    const future = new Date(now.getTime() + 5 * 86_400_000);
    expect(decayedWeight('card_completed', future, now)).toBe(6);
  });

  it('returns 0 for an unknown signal rather than guessing a weight', () => {
    expect(decayedWeight('not_a_real_signal', now, now)).toBe(0);
  });
});

describe('highestTier — the HIGH_INTENT gate input', () => {
  it('returns 0 when no intent signals are present', () => {
    expect(highestTier(['card_completed', 'streak_day'])).toBe(0);
  });

  it('ignores engagement signals entirely', () => {
    expect(highestTier(['portal_session', 'live_session_attended'])).toBe(0);
  });

  it('returns the highest tier, not the most recent or most frequent', () => {
    expect(highestTier(['pricing_page_view', 'strategy_call_booked', 'enrollment_cta_click'])).toBe(4);
  });

  it('caps a pile of tier-1 views at tier 1 — views are not readiness', () => {
    // The rule the whole tiering exists to enforce.
    const manyViews = Array(20).fill('pricing_page_view');
    expect(highestTier(manyViews)).toBe(1);
  });
});
