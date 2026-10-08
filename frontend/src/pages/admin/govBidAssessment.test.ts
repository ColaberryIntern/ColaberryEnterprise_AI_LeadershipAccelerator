import { assessBid, screenKnockouts, bidAssessmentMermaid, PWIN_FACTORS, type BidAssessmentInput } from './govBidAssessment';
import type { EstablishedRequirement } from '../../services/factoryApi';

const base = (o: Partial<BidAssessmentInput> = {}): BidAssessmentInput => ({
  established: [], serviceMatches: [], capability: 'none', priorPursuitCount: 0,
  daysLeft: 30, estimatedValue: 500_000, openSubmissionCount: 0, establishedCount: 0, ...o,
});
const req = (id: string, text: string, extra: Partial<EstablishedRequirement> = {}): EstablishedRequirement =>
  ({ id, text, applicability: 'always', dueStage: 'submission', bindingStatus: 'x', ...extra });

const soc = req('REQ-052', 'Provide current SOC 2 Type II certification with a description');
const refs = req('REQ-064', 'Vendor shall provide a minimum of 5 local government references.');
const sam = req('R1', 'Offeror must be registered in SAM.gov');

describe('screenKnockouts (Stage A — eligibility gate)', () => {
  it('flags SOC 2 as a certification knockout, long-lead, and conditional when unmet', () => {
    const ko = screenKnockouts(base({ established: [soc], daysLeft: 13 }));
    expect(ko).toHaveLength(1);
    expect(ko[0].category).toBe('certification');
    expect(ko[0].status).toBe('conditional');
    expect(ko[0].longLead).toBe(true);
    expect(ko[0].basis).toMatch(/long-lead/); // tight window < 60 days
  });

  it('passes a knockout that has evidence of record', () => {
    expect(screenKnockouts(base({ established: [req('R1', 'registered in SAM.gov', { evidenceRef: { docId: 'D1' } })] }))[0].status).toBe('pass');
  });

  it('passes a knockout a matching capability covers', () => {
    const ko = screenKnockouts(base({ established: [soc], serviceMatches: [{ id: 's', name: 'SOC 2 compliance', strength: 'strong', matchedKeywords: ['soc 2'], category: null, score: 9, reason: '', categoryMatched: true, matchedNaics: [] }] }));
    expect(ko[0].status).toBe('pass');
  });

  it('honors an operator status override (mark SOC 2 hard-fail)', () => {
    expect(screenKnockouts(base({ established: [soc], operatorKnockoutOverrides: { 'REQ-052': 'hard_fail' } }))[0].status).toBe('hard_fail');
  });

  it('categorizes SAM, set-aside, references and ignores non-eligibility requirements', () => {
    expect(screenKnockouts(base({ established: [sam] }))[0].category).toBe('sam');
    expect(screenKnockouts(base({ established: [refs] }))[0].category).toBe('past_performance');
    expect(screenKnockouts(base({ established: [req('X', 'The system shall render a dashboard view') ] }))).toHaveLength(0);
  });
});

describe('assessBid (Stage B — band, caps, economics)', () => {
  it('a hard-fail is an automatic no-bid: score 0 and no award economics', () => {
    const r = assessBid(base({ established: [soc], operatorKnockoutOverrides: { 'REQ-052': 'hard_fail' } }));
    expect(r.band).toBe('no_bid');
    expect(r.score).toBe(0);
    expect(r.expectedValue).toBeNull();
    expect(r.probabilityOfAward).toBeNull();
  });

  it('open conditional gaps cap the verdict at bid-with-conditions', () => {
    const r = assessBid(base({ established: [soc, refs] }));
    expect(r.band).toBe('bid_with_conditions');
    expect(r.conditionalCount).toBeGreaterThanOrEqual(2);
    expect(r.preliminary).toBe(true);
  });

  it('a preliminary score (judgment factors unrated) never auto-no-bids', () => {
    expect(assessBid(base()).band).toBe('bid_with_conditions');
  });

  it('a fully-rated strong recompete bids, capped at 70%', () => {
    const r = assessBid(base({ capability: 'strong', priorPursuitCount: 2, pursuitType: 'recompete', operatorFactors: { relationship: 5, competition: 5, price_to_win: 5, teaming: 5, strategic: 5 } }));
    expect(r.band).toBe('bid');
    expect(r.preliminary).toBe(false);
    expect(r.pwin).toBe(70); // recompete realism cap
    expect(r.expectedValue).toBe(Math.round(500_000 * 1 * (r.pwin! / 100)));
    expect(r.probabilityOfAward).toBe(r.pwin! / 100);
  });

  it('new business is capped at 40% unless the relationship is strong', () => {
    const r = assessBid(base({ capability: 'strong', pursuitType: 'new', operatorFactors: { relationship: 1, competition: 5, price_to_win: 5, teaming: 5, strategic: 5 } }));
    expect(r.pwin).toBe(40);
    expect(r.pwinRaw!).toBeGreaterThan(40);
  });

  it('a fully-rated weak pursuit resolves to no-bid', () => {
    expect(assessBid(base({ capability: 'none', operatorFactors: { relationship: 0, competition: 0, price_to_win: 0, teaming: 0, strategic: 0 } })).band).toBe('no_bid');
  });

  it('bid ROI = expected value / bid cost', () => {
    const r = assessBid(base({ capability: 'strong', priorPursuitCount: 2, pursuitType: 'recompete', operatorFactors: { relationship: 5, competition: 5, price_to_win: 5, teaming: 5, strategic: 5 }, bidCostEstimate: 50_000 }));
    expect(r.bidRoi).toBe(Math.round((r.expectedValue! / 50_000) * 10) / 10);
  });

  it('factor weights sum to 1.0', () => {
    expect(Math.round(PWIN_FACTORS.reduce((s, f) => s + f.weight, 0) * 100) / 100).toBe(1);
  });
});

describe('bidAssessmentMermaid', () => {
  it('highlights the knockout node on a hard fail and the conditional node on a gap', () => {
    expect(bidAssessmentMermaid(assessBid(base({ established: [soc], operatorKnockoutOverrides: { 'REQ-052': 'hard_fail' } })))).toContain('class KO current');
    expect(bidAssessmentMermaid(assessBid(base({ established: [soc] })))).toContain('class COND current');
    expect(bidAssessmentMermaid(assessBid(base({ established: [soc] })))).toContain('flowchart TD');
  });
});
