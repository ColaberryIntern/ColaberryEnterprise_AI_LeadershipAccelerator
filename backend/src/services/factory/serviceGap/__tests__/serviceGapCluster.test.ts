import { clusterRecommendations, countRecommendations } from '../serviceGapCluster';
import { insufficientRecommendation } from '../serviceGapValidate';
import type { GapAnalysisView, GapRecommendation } from '../serviceGapTypes';
import { ev } from './serviceGapFixtures';

const base = insufficientRecommendation(ev(), 'x', []);
const rec = (over: Partial<GapRecommendation>, scores: Partial<GapRecommendation['scores']> = {}): GapRecommendation => ({
  ...base, reasonCodes: [], missingInformation: [], ...over, scores: { ...base.scores, noveltyScore: 60, evidenceReadinessScore: 50, ...scores },
});
const view = (caseStudyId: string, r: GapRecommendation, over: Partial<GapAnalysisView> = {}): GapAnalysisView => ({
  id: `a-${caseStudyId}`, caseStudyId, status: r.decision === 'INSUFFICIENT_EVIDENCE' ? 'insufficient' : 'ok', decision: r.decision, recommendation: r,
  error: null, errorClass: null, stale: false, promptVersion: 'v', modelVersion: 'm', analyzedAt: '2026-11-15T00:00:00.000Z',
  reviewState: 'open', reviewNote: null, reviewedBy: null, reviewedAt: null, ...over,
});
const proposal = (name: string, family: string, readiness = 50) => rec({
  decision: 'PROPOSE_NEW', serviceFamily: family,
  proposedService: { name, category: null, buyerValue: null, scope: null, deliverables: [], targetBuyer: null, differentiators: [], keywords: [], naicsSuggestionsUnverified: [], pscSuggestionsUnverified: [], suggestedStatus: 'growth' },
}, { evidenceReadinessScore: readiness, duplicateRiskScore: 20 });
const toService = (id: string, name: string, decision: GapRecommendation['decision'] = 'MATCH_EXISTING') => rec({ decision, target: { serviceId: id, serviceName: name, status: 'active' } });

describe('clusterRecommendations', () => {
  it('groups similar proposals into ONE candidate service, named after the best-evidenced member', () => {
    const c = clusterRecommendations([
      view('c1', proposal('Industrial Digital Twins', 'Predictive maintenance', 40)),
      view('c2', proposal('Digital Twins for Industrial Assets', 'Industrial digital twins', 70)),
      view('c3', proposal('Farmer Risk Scoring', 'Agricultural credit risk', 50)),
    ]);
    const twins = c.find((x) => x.caseStudyIds.includes('c1'))!;
    expect(twins.caseStudyIds.sort()).toEqual(['c1', 'c2']);
    expect(twins.title).toBe('Digital Twins for Industrial Assets');
    expect(c.filter((x) => x.kind === 'new_service')).toHaveLength(2);
  });

  it('groups existing-service recommendations by service; an expansion makes the cluster an expansion', () => {
    const c = clusterRecommendations([view('a', toService('s1', 'Gov')), view('b', toService('s1', 'Gov', 'EXPAND_EXISTING')), view('d', toService('s2', 'Agents'))]);
    const gov = c.find((x) => x.serviceId === 's1')!;
    expect(gov).toMatchObject({ kind: 'existing_service', decision: 'EXPAND_EXISTING', caseStudyIds: ['a', 'b'] });
  });

  it('leaves out dismissed, accepted and insufficient recommendations', () => {
    expect(clusterRecommendations([
      view('a', proposal('X Service', 'x'), { reviewState: 'dismissed' }),
      view('b', toService('s1', 'Gov'), { reviewState: 'accepted' }),
      view('c', rec({ decision: 'INSUFFICIENT_EVIDENCE' })),
    ])).toEqual([]);
  });

  it('ranks reuse across case studies above a single case, and is deterministic', () => {
    const vs = [view('a', proposal('Solo Thing', 'solo')), view('b', toService('s1', 'Gov')), view('c', toService('s1', 'Gov'))];
    const one = clusterRecommendations(vs);
    expect(one.map((c) => c.key)).toEqual(clusterRecommendations([...vs].reverse()).map((c) => c.key));
    expect(one[0].caseStudyIds).toHaveLength(2);
  });
});

describe('countRecommendations', () => {
  it('counts only the current intake; a case never analyzed is "not analyzed", a failed one needs review', () => {
    const latest = new Map([
      ['a', view('a', proposal('P', 'p'))], ['b', view('b', toService('s', 'S'), { stale: true })],
      ['c', view('c', rec({ decision: 'INSUFFICIENT_EVIDENCE' }))], ['gone', view('gone', proposal('Q', 'q'))],
      ['f', { ...view('f', rec({})), status: 'failed', decision: null, recommendation: null }],
    ]);
    expect(countRecommendations(['a', 'b', 'c', 'd', 'f'], latest)).toEqual({
      analyzed: 3, notAnalyzed: 1, stale: 1, failed: 1, newServiceProposals: 1, expandExisting: 0, matchExisting: 1, linkGrowth: 0, needsReview: 2,
    });
  });
});
