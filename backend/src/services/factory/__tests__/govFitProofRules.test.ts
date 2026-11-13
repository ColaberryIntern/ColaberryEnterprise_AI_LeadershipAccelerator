import { applyFitProofRules, findPossibleProof, meaningfulTokens, DOWNGRADE_REASON, EMPTY_PROOF, ProofContext, ProofCandidate } from '../govFitProofRules';
import type { CapabilityItem } from '../govCapabilityFit';

const cap = (o: Partial<CapabilityItem>): CapabilityItem => ({ id: 'CAP-01', name: 'Dashboards', why: 'w', assessment: 'have', matchedServiceId: 'S1', rationale: 'r', ...o });
const cand = (id: string, terms: string[], o: Partial<ProofCandidate> = {}): ProofCandidate =>
  ({ caseStudyId: id, title: `Case ${id}`, sourceKind: 'inside', terms, confirmedServiceIds: [], ...o });
const ctx = (o: Partial<ProofContext> = {}): ProofContext => ({ available: true, evidenceByService: {}, candidates: [], ...o });
const EV = { caseStudyId: 'cs1', title: 'Pricing model', sourceKind: 'outside' as const };

describe('applyFitProofRules: evidence on have', () => {
  it("attaches the matched service's confirmed case studies, inside first", () => {
    const inside = { caseStudyId: 'cs2', title: 'Zeta build', sourceKind: 'inside' as const };
    const [out] = applyFitProofRules([cap({})], ctx({ evidenceByService: { S1: [EV, inside] } }), { requireProof: false });
    expect(out.evidence).toEqual([inside, EV]);
    expect(out.assessment).toBe('have');
  });

  it('caps evidence at 5', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ caseStudyId: `c${i}`, title: `T${i}`, sourceKind: 'inside' as const }));
    expect(applyFitProofRules([cap({})], ctx({ evidenceByService: { S1: many } }), { requireProof: false })[0].evidence).toHaveLength(5);
  });
});

describe('applyFitProofRules: the downgrade rule', () => {
  it('flag OFF: an unproven have stays have, with an honest empty evidence list', () => {
    const [out] = applyFitProofRules([cap({})], ctx(), { requireProof: false });
    expect(out).toMatchObject({ assessment: 'have', evidence: [] });
    expect(out.downgradedFrom).toBeUndefined();
  });

  it('flag ON: an unproven have becomes partial with the reason, and gets possibleProof', () => {
    const [out] = applyFitProofRules([cap({ name: 'Pricing optimization model' })],
      ctx({ candidates: [cand('x', ['Econometric pricing optimization'])] }), { requireProof: true });
    expect(out).toMatchObject({ assessment: 'partial', downgradedFrom: 'have', downgradeReason: DOWNGRADE_REASON, matchedServiceId: 'S1' });
    expect(out.evidence).toBeUndefined();
    expect(out.possibleProof?.map((p) => p.caseStudyId)).toEqual(['x']);
  });

  it('flag ON: a PROVEN have stays have', () => {
    expect(applyFitProofRules([cap({})], ctx({ evidenceByService: { S1: [EV] } }), { requireProof: true })[0]).toMatchObject({ assessment: 'have', evidence: [EV] });
  });

  it('never downgrades when proof could not be loaded, and attaches no proof fields at all', () => {
    const input = [cap({}), cap({ id: 'CAP-02', assessment: 'new', matchedServiceId: null })];
    expect(applyFitProofRules(input, EMPTY_PROOF, { requireProof: true })).toEqual(input);
  });

  it('only touches the fields it owns: id, name, why, rationale, matchedServiceId and the 1G detail are unchanged', () => {
    const gap = cap({ id: 'CAP-09', assessment: 'new', matchedServiceId: null, whatItIs: 'a', whatThisBidGivesUs: 'b', toDeliver: 'c' });
    const [out] = applyFitProofRules([gap], ctx(), { requireProof: true });
    const { possibleProof, ...rest } = out;
    expect(rest).toEqual(gap);
    expect(possibleProof).toEqual([]);
  });

  it('is idempotent: applying the rules to their own output changes nothing (both flag states)', () => {
    const c = ctx({ evidenceByService: { S2: [EV] }, candidates: [cand('x', ['dashboard reporting analytics'])] });
    const input = [cap({ name: 'Reporting dashboards' }), cap({ id: 'CAP-02', matchedServiceId: 'S2' }), cap({ id: 'CAP-03', assessment: 'new', matchedServiceId: null, name: 'Analytics dashboards' })];
    for (const requireProof of [false, true]) {
      const once = applyFitProofRules(input, c, { requireProof });
      expect(applyFitProofRules(once, c, { requireProof })).toEqual(once);
    }
  });

  it('is total on garbage', () => {
    expect(applyFitProofRules(null as never, ctx(), { requireProof: true })).toEqual([]);
  });
});

describe('findPossibleProof (deterministic keyword overlap)', () => {
  const gap = { name: 'Predictive pricing analytics', why: 'The buyer wants demand forecasting', matchedServiceId: 'S1' };

  it('needs at least two distinct meaningful shared words', () => {
    expect(findPossibleProof(gap, [cand('one', ['pricing'])])).toEqual([]);
    expect(findPossibleProof(gap, [cand('two', ['pricing', 'forecasting engine'])]).map((p) => p.matchedTerms)).toEqual([['forecasting', 'pricing']]);
  });

  it('folds simple plurals and ignores stopwords/generic words', () => {
    expect(findPossibleProof({ name: 'Dashboards and reports', why: '', matchedServiceId: null }, [cand('a', ['dashboard', 'report'])])).toHaveLength(1);
    expect(findPossibleProof({ name: 'Provide services and systems support', why: 'the city needs a solution', matchedServiceId: null },
      [cand('b', ['provide services systems support solution city'])])).toEqual([]);
  });

  it("excludes a record already confirmed for the capability's own service, and marks one linked elsewhere", () => {
    const out = findPossibleProof(gap, [
      cand('mine', ['pricing forecasting'], { confirmedServiceIds: ['S1'] }),
      cand('other', ['pricing forecasting'], { confirmedServiceIds: ['S7'] }),
      cand('loose', ['pricing forecasting']),
    ]);
    expect(out.map((p) => [p.caseStudyId, p.linkedElsewhere])).toEqual([['loose', false], ['other', true]]);
  });

  it('orders by overlap, then inside before outside, then title; caps at 3', () => {
    const out = findPossibleProof(gap, [
      cand('o2', ['pricing forecasting'], { sourceKind: 'outside', title: 'A outside' }),
      cand('i2', ['pricing forecasting'], { title: 'B inside' }),
      cand('i3', ['pricing forecasting predictive'], { title: 'C three words' }),
      cand('i4', ['pricing forecasting'], { title: 'D inside' }),
    ]);
    expect(out.map((p) => p.caseStudyId)).toEqual(['i3', 'i2', 'i4']);
  });

  it('a capability with only generic words matches nothing', () => {
    expect(meaningfulTokens('the system shall provide services')).toEqual(new Set());
    expect(findPossibleProof({ name: 'Services', why: 'support', matchedServiceId: null }, [cand('a', ['anything at all here'])])).toEqual([]);
  });
});
