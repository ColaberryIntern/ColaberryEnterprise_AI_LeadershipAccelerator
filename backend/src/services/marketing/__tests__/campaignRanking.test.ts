import { resolveAllRankings, resolveRanking, RANKING_LADDERS } from '../campaignRanking';
import type { TrustOracle } from '../needsAttentionQueue';

/**
 * Objective-aware ranking: not every campaign ranked on likes.
 *
 * The acceptance criterion is that an engagement campaign ranks on governed engagement and an
 * acquisition campaign ranks on CPL/ROAS. The complication this suite has to face honestly is
 * that CPL and ROAS are `unavailable` in the real registry - so "rank on CPL" resolves, today,
 * to a stated FALLBACK. That fallback is the correct behaviour, and it is tested as such rather
 * than papered over by an oracle that pretends spend data exists.
 */

const REALISTIC: TrustOracle = {
  mayCompute: (k) => ['marketing.campaign_leads', 'marketing.campaign_engagement'].includes(k),
  reasonFor: (k) => ({
    'marketing.cost_per_lead': 'no ad-spend source',
    'marketing.roas': 'no ad-spend or revenue source',
    'marketing.impressions': 'no provider metric ingestion',
    'marketing.campaign_visitors': 'not a valid count',
  }[k] ?? ''),
};

const ALL_TRUSTED: TrustOracle = { mayCompute: () => true, reasonFor: () => '' };

describe('different objectives rank on different metrics', () => {
  it('an engagement campaign ranks on engagement', () => {
    const r = resolveRanking('consideration', REALISTIC);
    expect(r.rung?.metricKey).toBe('marketing.campaign_engagement');
    expect(r.fallback).toBe(false);
  });

  it('an acquisition campaign does NOT rank on engagement', () => {
    // The criterion, stated negatively: two objectives, two different sort keys.
    const acquisition = resolveRanking('conversion', REALISTIC);
    const engagement = resolveRanking('consideration', REALISTIC);
    expect(acquisition.rung?.metricKey).not.toBe(engagement.rung?.metricKey);
  });

  it('with spend data available, an acquisition campaign ranks on CPL, ascending', () => {
    // The ladder's first choice, proven reachable so the fallback below is not the only path.
    const r = resolveRanking('conversion', ALL_TRUSTED);
    expect(r.rung?.metricKey).toBe('marketing.cost_per_lead');
    expect(r.rung?.direction).toBe('asc'); // lower cost is better
    expect(r.fallback).toBe(false);
  });
});

describe('an untrusted primary metric produces a STATED fallback, not a silent one', () => {
  it('acquisition falls through CPL and ROAS to leads, and says so', () => {
    const r = resolveRanking('conversion', REALISTIC);
    expect(r.rung?.metricKey).toBe('marketing.campaign_leads');
    expect(r.fallback).toBe(true);
    // The reason names what was skipped AND why, in the registry's words.
    expect(r.reason).toMatch(/instead of cost per lead \(no ad-spend source\)/);
    expect(r.reason).toMatch(/roas \(no ad-spend or revenue source\)/);
  });

  it('never resolves to a rung the oracle distrusts', () => {
    for (const objective of Object.keys(RANKING_LADDERS) as (keyof typeof RANKING_LADDERS)[]) {
      const r = resolveRanking(objective === 'unset' ? null : objective, REALISTIC);
      if (r.rung) expect(REALISTIC.mayCompute(r.rung.metricKey)).toBe(true);
    }
  });

  it('awareness does NOT fall through to leads - it reports that it cannot be ranked', () => {
    // Ranking a reach campaign on leads is precisely the wrong-job error. When nothing on the
    // awareness ladder is trusted, the honest answer is "cannot be ranked yet", not "here is
    // a number from a different objective".
    const r = resolveRanking('awareness', REALISTIC);
    expect(r.rung).toBeNull();
    expect(r.fallback).toBe(true);
    expect(r.reason).toMatch(/cannot be ranked honestly yet/);
    expect(r.reason).toMatch(/impressions is no provider metric ingestion/);
  });

  it('a campaign with no funnel stage ranks on leads and says it is a default', () => {
    const r = resolveRanking(null, REALISTIC);
    expect(r.rung?.metricKey).toBe('marketing.campaign_leads');
    expect(r.reason).toMatch(/No funnel stage is set/);
  });
});

describe('the ladder follows the registry, not a hardcoded list', () => {
  it('if leads were ever distrusted, acquisition would report unrankable rather than lie', () => {
    const nothing: TrustOracle = { mayCompute: () => false, reasonFor: () => 'gone' };
    const r = resolveRanking('conversion', nothing);
    expect(r.rung).toBeNull();
  });

  it('resolves every objective in one pass, one decision each', () => {
    const all = resolveAllRankings(REALISTIC);
    expect(Object.keys(all).sort()).toEqual(['advocacy', 'awareness', 'consideration', 'conversion', 'retention', 'unset']);
    expect(all.consideration.rung?.column).toBe('engagement_count');
    expect(all.conversion.rung?.column).toBe('leads_count');
    expect(all.awareness.rung).toBeNull();
  });

  it('every resolved ranking carries a reason, fallback or not', () => {
    // The UI shows the reason unconditionally. A blank one would be a sort order with no
    // explanation, which is the original defect in a different shirt.
    for (const r of Object.values(resolveAllRankings(REALISTIC))) {
      expect(r.reason.length).toBeGreaterThan(20);
    }
  });
});
