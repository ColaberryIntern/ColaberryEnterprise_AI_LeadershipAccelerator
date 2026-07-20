/**
 * feedRanker unit tests — the transparent value model. Covers the soft score
 * (priority/pin/recency/freshness), the hard suppressors (frequency cap, cooldown,
 * dismiss), and the diversity re-ranking. Pure → `now` is injected.
 */
import { scoreCandidate, rankCandidates, type RankCandidate } from '../feedRanker';
import { DEFAULT_FEED_POLICY } from '../feedConfigService';

const NOW = new Date('2026-07-20T00:00:00Z');
const base = (o: Partial<RankCandidate>): RankCandidate => ({
  ref: 'card:1', type: 't', surface: 'class', priority: 0, pinned_until: null,
  released_at: NOW, frequency_cap: null, cooldown_days: null, seen_count: 0, last_seen_at: null, ...o,
});

describe('scoreCandidate — soft value model', () => {
  it('pins boost hard and label "pinned"', () => {
    const pinned = scoreCandidate(base({ pinned_until: new Date('2026-07-25T00:00:00Z') }), DEFAULT_FEED_POLICY, NOW);
    const plain = scoreCandidate(base({}), DEFAULT_FEED_POLICY, NOW);
    expect(pinned.score).toBeGreaterThan(plain.score);
    expect(pinned.reasons).toContain('pinned');
  });

  it('a fresh, unseen item outranks an old, seen one', () => {
    const fresh = scoreCandidate(base({ released_at: NOW, seen_count: 0 }), DEFAULT_FEED_POLICY, NOW);
    const stale = scoreCandidate(base({ released_at: new Date('2026-01-01T00:00:00Z'), seen_count: 3 }), DEFAULT_FEED_POLICY, NOW);
    expect(fresh.score).toBeGreaterThan(stale.score);
    expect(fresh.reasons).toEqual(expect.arrayContaining(['fresh', 'not seen']));
  });

  it('higher priority raises the score', () => {
    const hi = scoreCandidate(base({ priority: 80 }), DEFAULT_FEED_POLICY, NOW);
    const lo = scoreCandidate(base({ priority: 0 }), DEFAULT_FEED_POLICY, NOW);
    expect(hi.score).toBeGreaterThan(lo.score);
    expect(hi.reasons).toContain('high priority');
  });
});

describe('scoreCandidate — hard suppressors', () => {
  it('suppresses at the frequency cap', () => {
    const r = scoreCandidate(base({ frequency_cap: 2, seen_count: 2 }), DEFAULT_FEED_POLICY, NOW);
    expect(r.suppressed).toBe(true);
    expect(r.reasons[0]).toMatch(/frequency cap/);
  });

  it('suppresses inside the cooldown window', () => {
    const r = scoreCandidate(base({ cooldown_days: 7, last_seen_at: new Date('2026-07-18T00:00:00Z') }), DEFAULT_FEED_POLICY, NOW);
    expect(r.suppressed).toBe(true);
    expect(r.reasons[0]).toMatch(/cooldown/);
  });

  it('a dismissed item is suppressed', () => {
    const r = scoreCandidate(base({ dismissed: true }), DEFAULT_FEED_POLICY, NOW);
    expect(r.suppressed).toBe(true);
  });

  it('policy defaults apply when the item has no per-item cap', () => {
    const policy = { ...DEFAULT_FEED_POLICY, defaultFrequencyCap: 1 };
    expect(scoreCandidate(base({ seen_count: 1 }), policy, NOW).suppressed).toBe(true);
    expect(scoreCandidate(base({ seen_count: 0 }), policy, NOW).suppressed).toBe(false);
  });
});

describe('rankCandidates', () => {
  it('drops suppressed, sorts by score desc, and never repeats a type back-to-back', () => {
    const cands = [
      base({ ref: 'a', type: 'news', priority: 90 }),
      base({ ref: 'b', type: 'news', priority: 80 }),
      base({ ref: 'c', type: 'quote', priority: 10 }),
      base({ ref: 'd', type: 'x', frequency_cap: 1, seen_count: 5 }), // suppressed
    ];
    const out = rankCandidates(cands, DEFAULT_FEED_POLICY, NOW);
    expect(out.map((c) => c.ref)).not.toContain('d');           // suppressed dropped
    for (let i = 1; i < out.length; i++) expect(out[i].type).not.toBe(out[i - 1].type); // diversity
    expect(out[0].type).toBe('news');                            // highest score first
  });
});
