import {
  scoreLearner,
  ENGAGEMENT_SUB_BAND_CAPS,
  TIER_1_INTENT_CEILING,
} from '../explorerScoringService';
import { EXPLORER_SIGNAL_DEFINITIONS } from '../explorerSignalDefinitions';
import type { ExplorerSignalReadout, ExplorerIntentTier } from '../../../types/explorerGrowth';

const NOW = new Date('2026-08-20T12:00:00Z');

type Sig = { signal: string; contribution: number };

/** Build a readout without touching the reader — this service is pure. */
function readout(opts: {
  engagement?: Sig[];
  intent?: Sig[];
  friction?: Sig[];
  recentIntentTier?: ExplorerIntentTier | 0;
}): ExplorerSignalReadout {
  const band = (b: 'engagement' | 'intent' | 'friction', sigs: Sig[] = []) => ({
    band: b,
    total: sigs.reduce((a, s) => a + s.contribution, 0),
    signals: sigs.map((s) => ({ ...s, occurrences: 1, lastOccurredAt: NOW })),
  });
  return {
    enrollment_id: 'e1',
    lead_id: null,
    asOf: NOW,
    bands: {
      engagement: band('engagement', opts.engagement),
      intent: band('intent', opts.intent),
      friction: band('friction', opts.friction),
    },
    highestIntentTier: opts.recentIntentTier ?? 0,
    recentIntentTier: opts.recentIntentTier ?? 0,
    lastEngagementAt: opts.engagement?.length ? NOW : null,
  };
}

describe('empty and boundary', () => {
  it('scores a learner with no signals at zero, not NaN', async () => {
    expect(scoreLearner(readout({}))).toMatchObject({ e: 0, i: 0, f: 0 });
  });

  it('clamps every score to 0-100', () => {
    const r = scoreLearner(
      readout({
        engagement: [{ signal: 'points_earned', contribution: 9999 }],
        intent: [{ signal: 'strategy_call_booked', contribution: 9999 }],
        friction: [{ signal: 'payment_failed', contribution: 9999 }],
        recentIntentTier: 4,
      }),
    );
    expect(r.e).toBeLessThanOrEqual(100);
    expect(r.i).toBe(100);
    expect(r.f).toBe(100);
  });
});

describe('E: each sub-band caps INDEPENDENTLY (§7.2)', () => {
  it('caps achievement at 35 however much accumulates there', () => {
    // "Engaged" means breadth. One loud signal must not carry the score.
    const r = scoreLearner(
      readout({ engagement: [{ signal: 'points_earned', contribution: 500 }] }),
    );
    expect(r.bands.engagement.achievement).toBe(35);
    expect(r.e).toBe(35);
  });

  it('caps progress at 35 and recency at 30', () => {
    const r = scoreLearner(
      readout({
        engagement: [
          { signal: 'card_completed', contribution: 500 },
          { signal: 'portal_session', contribution: 500 },
        ],
      }),
    );
    expect(r.bands.engagement.progress).toBe(35);
    expect(r.bands.engagement.recency).toBe(30);
    expect(r.e).toBe(65);
  });

  it('reaches 100 only across all three sub-bands', () => {
    const r = scoreLearner(
      readout({
        engagement: [
          { signal: 'points_earned', contribution: 500 },
          { signal: 'card_completed', contribution: 500 },
          { signal: 'portal_session', contribution: 500 },
        ],
      }),
    );
    expect(r.e).toBe(100);
    expect(ENGAGEMENT_SUB_BAND_CAPS.achievement + ENGAGEMENT_SUB_BAND_CAPS.progress + ENGAGEMENT_SUB_BAND_CAPS.recency).toBe(100);
  });

  it('routes each signal to the sub-band §7.2 assigns it', () => {
    const r = scoreLearner(
      readout({
        engagement: [
          { signal: 'streak_day', contribution: 10 }, // achievement
          { signal: 'assignment_submitted', contribution: 10 }, // progress
          { signal: 'live_session_attended', contribution: 10 }, // recency
        ],
      }),
    );
    expect(r.bands.engagement).toEqual({ achievement: 10, progress: 10, recency: 10 });
  });

  it('ignores a signal with no subBand rather than defaulting it into a band', () => {
    // A silent default would let a mis-declared signal inflate a score invisibly.
    const r = scoreLearner(
      readout({ engagement: [{ signal: 'not_a_real_signal', contribution: 50 }] }),
    );
    expect(r.e).toBe(0);
  });
});

describe('I: the tier gate — views are not readiness', () => {
  it('caps a tier-1-only learner at 40 however much view weight accumulates', () => {
    const r = scoreLearner(
      readout({
        intent: [{ signal: 'pricing_page_view', contribution: 95 }],
        recentIntentTier: 1,
      }),
    );
    expect(r.i).toBe(TIER_1_INTENT_CEILING);
    expect(r.bands.intent.tierCapped).toBe(true);
  });

  it('lifts the cap once a RECENT tier-3 signal appears', () => {
    const r = scoreLearner(
      readout({
        intent: [{ signal: 'enrollment_form_started', contribution: 95 }],
        recentIntentTier: 3,
      }),
    );
    expect(r.i).toBe(95);
    expect(r.bands.intent.tierCapped).toBe(false);
  });

  it('keeps the cap when the only tier-3 signal is STALE', () => {
    // recentIntentTier is windowed; a commitment from a year ago is not
    // readiness today, and the lifetime tier would exempt them permanently.
    const r = scoreLearner(
      readout({
        intent: [{ signal: 'enrollment_form_started', contribution: 95 }],
        recentIntentTier: 0,
      }),
    );
    expect(r.i).toBe(TIER_1_INTENT_CEILING);
  });

  it('keeps the ceiling below every §8 intent threshold', () => {
    // CONSIDERING_NEXT_STEP 45, HIGH_INTENT 60, ENROLLMENT_READY 70. If the
    // ceiling ever rose to 45+, tier-1 traffic alone could reach a commercial
    // state — the exact failure the tiering exists to prevent.
    expect(TIER_1_INTENT_CEILING).toBeLessThan(45);
  });

  it('does not cap a below-ceiling score upward', () => {
    const r = scoreLearner(
      readout({ intent: [{ signal: 'pricing_page_view', contribution: 12 }], recentIntentTier: 1 }),
    );
    expect(r.i).toBe(12);
  });
});

describe('F: friction is passed through, never re-decayed', () => {
  it('sums friction contributions as given', () => {
    const r = scoreLearner(
      readout({ friction: [{ signal: 'email_hard_bounce', contribution: 30 }] }),
    );
    expect(r.f).toBe(30);
  });

  it('crosses the 25 suppression threshold at the documented point', () => {
    expect(scoreLearner(readout({ friction: [{ signal: 'x', contribution: 24 }] })).f).toBeLessThan(25);
    expect(scoreLearner(readout({ friction: [{ signal: 'x', contribution: 25 }] })).f).toBeGreaterThanOrEqual(25);
  });
});

describe('purity', () => {
  it('returns identical scores for the same readout, twice', () => {
    const r = readout({
      engagement: [{ signal: 'card_completed', contribution: 12 }],
      intent: [{ signal: 'pricing_page_view', contribution: 20 }],
      recentIntentTier: 1,
    });
    expect(scoreLearner(r)).toEqual(scoreLearner(r));
  });

  it('does not mutate the readout it is given', () => {
    const r = readout({ engagement: [{ signal: 'card_completed', contribution: 12 }] });
    const before = JSON.stringify(r);
    scoreLearner(r);
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe('the definitions table stays complete', () => {
  it('gives EVERY engagement signal a subBand', () => {
    // Iterated rather than listed, so a future signal cannot be added without
    // one — an unclassified signal would be silently dropped from E.
    const missing = Object.entries(EXPLORER_SIGNAL_DEFINITIONS)
      .filter(([, d]) => d.band === 'engagement' && !d.subBand)
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('gives no NON-engagement signal a subBand', () => {
    const stray = Object.entries(EXPLORER_SIGNAL_DEFINITIONS)
      .filter(([, d]) => d.band !== 'engagement' && d.subBand)
      .map(([name]) => name);
    expect(stray).toEqual([]);
  });
});
