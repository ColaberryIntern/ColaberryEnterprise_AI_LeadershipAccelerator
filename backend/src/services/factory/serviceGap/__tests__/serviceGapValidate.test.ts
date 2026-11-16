import { retrieveCandidates } from '../serviceGapRetrieval';
import { finalizeRecommendation, GapMalformedOutput, insufficientRecommendation, normalizeDecision } from '../serviceGapValidate';
import { CATALOG, ev } from './serviceGapFixtures';

const ctxFor = (evidence = ev()) => {
  const refs = new Map(retrieveCandidates(evidence, CATALOG).map((c, i) => [`S${i + 1}`, c] as const));
  return { refs, catalog: CATALOG, evidence };
};
const refOf = (ctx: ReturnType<typeof ctxFor>, name: string): string => Array.from(ctx.refs.entries()).find(([, s]) => s.name === name)![0];
const cand = (ref: string, cap: number, buyer: number, deliv = 50) => ({ ref, capabilityOverlap: cap, buyerProblemOverlap: buyer, deliverableOverlap: deliv, reason: 'r' });

describe('finalizeRecommendation - decision categories', () => {
  it('EXPAND_EXISTING keeps the exact proposed change against the real service (digital-twin fixture)', () => {
    const ctx = ctxFor();
    const cv = refOf(ctx, 'Computer Vision & Industrial AI');
    const r = finalizeRecommendation({
      decision: 'EXPAND_EXISTING', targetRef: cv, maturity: 'implemented_demo', candidates: [cand(cv, 55, 60)],
      expansion: { descriptionAddition: 'Adds digital-twin predictive maintenance.', keywordsToAdd: ['digital twin', 'predictive maintenance'] },
      verdict: 'Expand Computer Vision & Industrial AI with predictive maintenance.',
    }, ctx);
    expect(r.decision).toBe('EXPAND_EXISTING');
    expect(r.expansion).toMatchObject({ serviceName: 'Computer Vision & Industrial AI', keywordsToAdd: ['digital twin', 'predictive maintenance'] });
    expect(r.proposedService).toBeNull();
  });

  it('MATCH_EXISTING: bot flows map to the existing agents service, no new-service draft (bot-flows fixture)', () => {
    const e = ev({ title: 'Bot Flows for Customer Program Eligibility', analysis: { ...ev().analysis!, summary: 'Chatbot workflow automation that checks customer program eligibility and routes cases; delivered bot flows and an agent handoff.', capabilities: ['Chatbot automation'], keywords: ['eligibility', 'chatbot', 'automation'] } });
    const ctx = ctxFor(e);
    const ag = refOf(ctx, 'AI Agents & Managed AI Workforce');
    const r = finalizeRecommendation({ decision: 'MATCH_EXISTING', targetRef: ag, maturity: 'client_deployed', candidates: [cand(ag, 85, 80, 80)] }, ctx);
    expect(r).toMatchObject({ decision: 'MATCH_EXISTING', target: { serviceName: 'AI Agents & Managed AI Workforce' }, proposedService: null, confidence: 'high' });
  });

  it('a governance synonym is NOT proposed when governance already exists (high-overlap guard)', () => {
    const ctx = ctxFor(ev({ title: 'Testing AI Actions Before They Reach Customers' }));
    const gov = refOf(ctx, 'Responsible AI Governance & Assurance');
    const r = finalizeRecommendation({
      decision: 'PROPOSE_NEW', candidates: [cand(gov, 88, 75)], proposedService: { name: 'AI Action Testing & QA' },
    }, ctx);
    expect(r.decision).toBe('MATCH_EXISTING');
    expect(r.target?.serviceName).toBe('Responsible AI Governance & Assurance');
    expect(r.reasonCodes).toContain('high_overlap_guard');
    expect(r.proposedService).toBeNull();
  });

  it('a proposal whose name already exists becomes a match to that service (duplicate_name)', () => {
    const ctx = ctxFor();
    const r = finalizeRecommendation({ decision: 'PROPOSE_NEW', proposedService: { name: 'Assurance & Governance, Responsible AI' } }, ctx);
    expect(r).toMatchObject({ decision: 'MATCH_EXISTING', target: { serviceName: 'Responsible AI Governance & Assurance' } });
    expect(r.reasonCodes).toContain('duplicate_name');
  });

  it('PROPOSE_NEW: a genuinely new service comes back as a full Growth draft with UNVERIFIED codes only', () => {
    const ctx = ctxFor();
    const r = finalizeRecommendation({
      decision: 'PROPOSE_NEW', maturity: 'internally_validated', capabilityNovelty: 80, candidates: [cand(refOf(ctx, 'Computer Vision & Industrial AI'), 40, 30)],
      serviceFamily: 'Industrial digital twins',
      proposedService: { name: 'Industrial Digital Twins & Predictive Maintenance', category: 'AI Engineering', buyerValue: 'Fewer unplanned outages.', deliverables: ['Twin model', 'Alerting'], keywords: ['Digital Twin'], naics: ['541512', '5415', '1234567'], psc: ['da01', 'TOO-LONG'] },
    }, ctx);
    expect(r.decision).toBe('PROPOSE_NEW');
    expect(r.proposedService).toMatchObject({ suggestedStatus: 'growth', naicsSuggestionsUnverified: ['541512'], pscSuggestionsUnverified: ['DA01'], keywords: ['digital twin'] });
    expect(r.scores.duplicateRiskScore).not.toBeNull();
    expect(r.scores.commercialPotentialScore).toBeNull();
    expect(r.target).toBeNull();
  });

  it('research-only work never gets better than LOW confidence', () => {
    const ctx = ctxFor();
    const r = finalizeRecommendation({ decision: 'PROPOSE_NEW', maturity: 'research_concept', proposedService: { name: 'Thermal Aging Forecasting' } }, ctx);
    expect(r.confidence).toBe('low');
    expect(r.reasonCodes).toContain('research_only');
  });

  it('flags a retired namesake rather than silently proposing it', () => {
    const r = finalizeRecommendation({ decision: 'PROPOSE_NEW', proposedService: { name: 'Documentation and Training' } }, ctxFor());
    expect(r.decision).toBe('PROPOSE_NEW');
    expect(r.duplicateWarnings.join(' ')).toMatch(/retired service has this name/);
  });
});

describe('finalizeRecommendation - the model cannot point outside what we sent', () => {
  it('drops refs that were not sent (another tenant, an invented service, an injected id)', () => {
    const ctx = ctxFor();
    const r = finalizeRecommendation({
      decision: 'MATCH_EXISTING', targetRef: 'S99', candidates: [{ ref: '00000000-0000-4000-8000-000000000005' }, { ref: 'S99' }],
    }, ctx);
    expect(r.decision).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.reasonCodes).toContain('target_not_in_catalog');
    // Nothing the model named survives; what remains is OUR retrieval ranking over the refs we sent, labeled as such.
    const sent = new Set(Array.from(ctx.refs.values()).map((s) => s.id));
    expect(r.candidates.every((c) => sent.has(c.serviceId) && c.reason.includes('keyword retrieval only'))).toBe(true);
    expect(r.candidates.map((c) => c.serviceId)).not.toContain('00000000-0000-4000-8000-000000000005');
    expect(r.reasonCodes).toContain('fit_from_retrieval');
  });

  it('decision follows the target\'s REAL status (existing on a Growth service -> LINK_GROWTH, and back)', () => {
    const e = ev({ analysis: { ...ev().analysis!, keywords: ['geospatial', 'gis', 'satellite'] } });
    const ctx = ctxFor(e);
    const geo = refOf(ctx, 'Geospatial Analytics');
    expect(finalizeRecommendation({ decision: 'MATCH_EXISTING', targetRef: geo }, ctx).decision).toBe('LINK_GROWTH');
    const cv = refOf(ctx, 'Computer Vision & Industrial AI');
    expect(finalizeRecommendation({ decision: 'LINK_GROWTH', targetRef: cv }, ctx).decision).toBe('MATCH_EXISTING');
  });

  it('names come from OUR catalog, never from the model text', () => {
    const ctx = ctxFor();
    const cv = refOf(ctx, 'Computer Vision & Industrial AI');
    const r = finalizeRecommendation({ decision: 'MATCH_EXISTING', targetRef: cv, candidates: [{ ...cand(cv, 70, 70), serviceName: 'HACKED' }] }, ctx);
    expect(r.candidates[0].serviceName).toBe('Computer Vision & Industrial AI');
  });

  it('an expansion with no actual change is a plain match', () => {
    const ctx = ctxFor();
    const r = finalizeRecommendation({ decision: 'EXPAND_EXISTING', targetRef: refOf(ctx, 'Computer Vision & Industrial AI'), expansion: {} }, ctx);
    expect(r.decision).toBe('MATCH_EXISTING');
  });

  it('an unreadable decision is a malformed answer (stored as failed, not guessed)', () => {
    expect(() => finalizeRecommendation({ decision: 'CREATE_SERVICE_NOW' }, ctxFor())).toThrow(GapMalformedOutput);
    expect(() => finalizeRecommendation('not json', ctxFor())).toThrow(GapMalformedOutput);
  });

  it('clamps scores and lists (oversized / hostile input)', () => {
    const ctx = ctxFor();
    const cv = refOf(ctx, 'Computer Vision & Industrial AI');
    const r = finalizeRecommendation({
      decision: 'MATCH_EXISTING', targetRef: cv, capabilityNovelty: 9999, verdict: 'x'.repeat(5000),
      candidates: [cand(cv, 500, -20)], missingInformation: Array.from({ length: 50 }, (_, i) => `m${i}`),
    }, ctx);
    expect(r.candidates[0].capabilityOverlap).toBe(100);
    expect(r.candidates[0].buyerProblemOverlap).toBe(0);
    expect(r.verdict.length).toBeLessThanOrEqual(300);
    expect(r.missingInformation).toHaveLength(6);
    expect(r.scores.noveltyScore).toBeLessThanOrEqual(100);
  });

  it('the abstain record says what is missing and has no target', () => {
    const r = insufficientRecommendation(ev(), 'thin_source', ['What was delivered']);
    expect(r).toMatchObject({ decision: 'INSUFFICIENT_EVIDENCE', target: null, confidence: 'low', missingInformation: ['What was delivered'] });
  });
});

// Regression: on production gpt-4o-mini answered with labels and sentences, so every analysis failed as "unusable".
describe('normalizeDecision - real answers seen in production', () => {
  it.each([
    ['Match existing.', 'MATCH_EXISTING'],
    ['Expand S1 with predictive maintenance for thermal aging.', 'EXPAND_EXISTING'],
    ['Propose a new service for automated customer service solutions using bot flows.', 'PROPOSE_NEW'],
    ['Propose new service for automated customer service solutions.', 'PROPOSE_NEW'],
    ['Insufficient evidence.', 'INSUFFICIENT_EVIDENCE'],
    ['Link to Growth service.', 'LINK_GROWTH'],
    ['link_growth', 'LINK_GROWTH'],
    ['MATCH_EXISTING', 'MATCH_EXISTING'],
  ])('%s -> %s', (raw, code) => expect(normalizeDecision(raw)).toBe(code));

  it('still refuses anything that does not start like a decision', () => {
    for (const raw of ['CREATE_SERVICE_NOW', 'The case study is great', '', null, 42]) expect(normalizeDecision(raw)).toBeNull();
  });

  it('a sentence decision flows through the normal guards (label + S-ref verdict on a Growth target)', () => {
    const ctx = ctxFor();
    const cv = refOf(ctx, 'Computer Vision & Industrial AI');
    const r = finalizeRecommendation({ decision: 'Match existing.', targetRef: cv, verdict: `Match to ${cv}.`, candidates: [cand(cv, 80, 75, 70)] }, ctx);
    expect(['MATCH_EXISTING', 'LINK_GROWTH']).toContain(r.decision);
    expect(r.verdict).not.toMatch(/\bS\d+\b/);
    expect(r.verdict).toContain('Computer Vision & Industrial AI');
    expect(r.reasonCodes).toContain('verdict_replaced');
  });

  it('a copied placeholder verdict ("Propose Y.") is replaced with the proposed name', () => {
    const ctx = ctxFor();
    const r = finalizeRecommendation({ decision: 'Propose a new service', verdict: 'Propose Y.', proposedService: { name: 'Quantum Ledger Forensics' } }, ctx);
    expect(r.decision).toBe('PROPOSE_NEW');
    expect(r.verdict).toBe('Propose Quantum Ledger Forensics.');
  });

  it('alternatives written as labels are kept, unreadable ones dropped', () => {
    const ctx = ctxFor();
    const r = finalizeRecommendation({ decision: 'INSUFFICIENT_EVIDENCE', alternativesConsidered: [{ decision: 'Propose new', whyNot: 'thin' }, { decision: '???', whyNot: 'x' }] }, ctx);
    expect(r.alternativesConsidered).toEqual([{ decision: 'PROPOSE_NEW', whyNot: 'thin' }]);
  });
});

// GD3 regression: 14 one-case-study Growth services got through because the model returned no overlap scores.
describe('anti-bloat (GD3)', () => {
  it('no model scores: existing fit comes from retrieval instead of n/a, and the proposal names its closest existing service', () => {
    const ctx = ctxFor();
    const r = finalizeRecommendation({ decision: 'PROPOSE_NEW', candidates: [], proposedService: { name: 'Quantum Ledger Forensics' } }, ctx);
    expect(r.decision).toBe('PROPOSE_NEW');
    expect(r.scores.existingFitScore).not.toBeNull();
    expect(r.reasonCodes).toContain('fit_from_retrieval');
    expect(r.closestExisting).toMatchObject({ serviceName: expect.any(String), fit: expect.any(Number) });
    expect(r.closestExisting!.status).not.toBe('retired');
  });

  it('a near-identical name to a live service becomes that service (similar_name_guard), not a new one', () => {
    const ctx = ctxFor();
    const r = finalizeRecommendation({ decision: 'PROPOSE_NEW', proposedService: { name: 'Computer Vision Industrial Inspection' } }, ctx);
    expect(['MATCH_EXISTING', 'LINK_GROWTH']).toContain(r.decision);
    expect(r.target?.serviceName).toBe('Computer Vision & Industrial AI');
    expect(r.reasonCodes).toContain('similar_name_guard');
    expect(r.closestExisting).toBeNull();
  });

  it('closestExisting is only set on a proposal', () => {
    const ctx = ctxFor();
    const cv = refOf(ctx, 'Computer Vision & Industrial AI');
    expect(finalizeRecommendation({ decision: 'MATCH_EXISTING', targetRef: cv, candidates: [cand(cv, 80, 75)] }, ctx).closestExisting).toBeNull();
  });
});
