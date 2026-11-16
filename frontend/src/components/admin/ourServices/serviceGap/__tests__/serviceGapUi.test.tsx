import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import GapRecommendationPanel, { type GapPanelProps } from '../GapRecommendationPanel';
import AiServiceOpportunities from '../AiServiceOpportunities';
import IntakeCard from '../../IntakeCard';
import { counterTiles, mergeExpansion, mergeNaics } from '../serviceGapModel';
import type { GapAnalysis, GapRecommendation, GapOpportunities } from '../../../../../services/serviceGapApi';
import type { IntakeSummaryItem } from '../../../../../services/ourServicesApi';
import type { ServiceGapState } from '../useServiceGap';

jest.mock('../../../../../services/ourServicesApi', () => ({ getCaseStudySourceFile: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root | null = null;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(ui); });
}
afterEach(() => { if (root) { const r = root; act(() => { r.unmount(); }); container.remove(); root = null; } });
const q = (sel: string): HTMLElement | null => container.querySelector(sel);
const click = async (el: Element | null): Promise<void> => { await act(async () => { (el as HTMLElement).click(); }); };

const rec = (over: Partial<GapRecommendation> = {}): GapRecommendation => ({
  decision: 'MATCH_EXISTING', verdict: 'Link to AI Agents & Managed AI Workforce.', target: { serviceId: 'svc-ag', serviceName: 'AI Agents & Managed AI Workforce', status: 'active' },
  maturity: 'client_deployed', serviceFamily: 'Agents', confidence: 'high',
  candidates: [{ serviceId: 'svc-ag', serviceName: 'AI Agents & Managed AI Workforce', status: 'active', retrievalScore: 40, capabilityOverlap: 80, buyerProblemOverlap: 80, deliverableOverlap: 60, missingCapabilities: [], reason: 'r' }],
  scores: { existingFitScore: 76, noveltyScore: 30, evidenceReadinessScore: 80, duplicateRiskScore: null, commercialPotentialScore: null },
  proposedService: null, expansion: null, duplicateWarnings: [], alternativesConsidered: [], missingInformation: [],
  evidence: [{ kind: 'document_claim', text: 'Bots check eligibility.' }], reasonCodes: [],
  naics: [{ code: '541511', title: 'Custom Computer Programming Services', onTarget: true }, { code: '611420', title: 'Computer Training', onTarget: false }],
  naicsWarnings: [], ...over,
});
const analysis = (r: GapRecommendation | null, over: Partial<GapAnalysis> = {}): GapAnalysis => ({
  id: 'a1', caseStudyId: 'cs1', status: r ? (r.decision === 'INSUFFICIENT_EVIDENCE' ? 'insufficient' : 'ok') : 'failed', decision: r?.decision ?? null,
  recommendation: r, error: r ? null : 'The AI analysis could not be generated right now.', errorClass: r ? null : 'UpstreamError', stale: false,
  promptVersion: 'service-gap-v1', modelVersion: 'm', analyzedAt: '2026-11-15T20:00:00.000Z', reviewState: 'open', reviewNote: null, reviewedBy: null, reviewedAt: null, ...over,
});
const panel = (over: Partial<GapPanelProps> = {}): GapPanelProps => ({
  analysis: analysis(rec()), available: true, busy: false, serviceCurrent: () => ({ description: 'Builds vision systems.', keywords: ['vision'], naicsCodes: ['541511'] }),
  onAnalyze: jest.fn(), onAdoptExisting: jest.fn(), onReviewProposal: jest.fn(), onApplyExpansion: jest.fn(), onAddNaics: jest.fn(), onDismiss: jest.fn(), ...over,
});
const draft = { name: 'Industrial Digital Twins', category: 'AI Engineering', buyerValue: 'Fewer outages.', scope: 'Twin plus alerting.', deliverables: ['Twin model'], targetBuyer: 'Plant operators', differentiators: [], keywords: ['digital twin'], naicsSuggestionsUnverified: ['541512'], pscSuggestionsUnverified: [], suggestedStatus: 'growth' as const };

describe('mergeExpansion (pure)', () => {
  const ex = { serviceId: 's', serviceName: 'CV', descriptionAddition: 'Adds digital twins.', keywordsToAdd: ['Digital Twin', 'vision'], scopeChange: null };
  it('appends once and merges keywords case-insensitively; applying again changes nothing (idempotent)', () => {
    const once = mergeExpansion({ description: 'Builds vision systems.', keywords: ['vision'], naicsCodes: [] }, ex);
    expect(once).toEqual({ description: 'Builds vision systems. Adds digital twins.', keywords: ['vision', 'Digital Twin'], naicsCodes: [], naicsAdded: [], changed: true });
    expect(mergeExpansion(once, ex).changed).toBe(false);
  });
  it('handles an empty service (boundary)', () => {
    expect(mergeExpansion({ description: null, keywords: [], naicsCodes: [] }, { ...ex, keywordsToAdd: [] }).description).toBe('Adds digital twins.');
  });
  it('adds only the NAICS the service lacks; a NAICS-only expansion still counts as a change, and re-applying is a no-op', () => {
    const cur = { description: 'Adds digital twins.', keywords: ['Digital Twin', 'vision'], naicsCodes: ['541511'] };
    const once = mergeExpansion(cur, { ...ex, naicsToAdd: ['541511', '541715'] });
    expect(once).toMatchObject({ naicsCodes: ['541511', '541715'], naicsAdded: ['541715'], changed: true });
    expect(mergeExpansion(once, { ...ex, naicsToAdd: ['541715'] }).changed).toBe(false);
  });
  it('mergeNaics ignores malformed and duplicate codes', () => {
    expect(mergeNaics(['541511'], ['541511', '5415', '541512', '541512'])).toEqual({ codes: ['541511', '541512'], added: ['541512'] });
  });
});

describe('counterTiles', () => {
  it('match tile includes growth matches; tones stay calm when there is nothing to act on', () => {
    const t = counterTiles({ analyzed: 5, notAnalyzed: 2, stale: 0, failed: 1, newServiceProposals: 0, expandExisting: 1, matchExisting: 2, linkGrowth: 1, needsReview: 2 }, 8);
    expect(t.find((x) => x.key === 'match')!.value).toBe(3);
    expect(t.find((x) => x.key === 'new')!.tone).toBe('text-secondary');
    expect(t.find((x) => x.key === 'analyzed')!.label).toBe('Analyzed of 8');
  });
});

describe('GapRecommendationPanel states', () => {
  it('match: decision, verdict, existing fit only (no new-service numbers), Use existing calls back', async () => {
    const p = panel();
    await render(<GapRecommendationPanel {...p} />);
    expect(q('[data-testid="gap-decision"]')!.textContent).toContain('Use existing service');
    expect(q('[data-testid="gap-verdict"]')!.textContent).toBe('Link to AI Agents & Managed AI Workforce.');
    expect(container.textContent).toContain('Existing fit');
    expect(container.textContent).not.toContain('Novelty');
    await click(q('[data-testid="gap-use-existing"]'));
    expect(p.onAdoptExisting).toHaveBeenCalled();
  });

  it('propose new: separate new-service signals, full draft with UNVERIFIED codes, review pre-fills (never creates)', async () => {
    const p = panel({ familySize: 2, analysis: analysis(rec({ decision: 'PROPOSE_NEW', target: null, proposedService: draft, verdict: 'Propose Industrial Digital Twins.', duplicateWarnings: ['Similar to existing active service "CV".'], scores: { existingFitScore: 40, noveltyScore: 70, evidenceReadinessScore: 55, duplicateRiskScore: 20, commercialPotentialScore: null } })) });
    await render(<GapRecommendationPanel {...p} />);
    expect(container.textContent).toContain('Novelty');
    expect(container.textContent).toContain('Duplicate risk');
    expect(q('[data-testid="gap-proposed-service"]')!.textContent).toContain('Unverified suggestions');
    expect(q('[data-testid="gap-duplicate-warnings"]')!.textContent).toContain('Similar to existing');
    expect(q('[data-testid="gap-use-existing"]')).toBeNull();
    expect(q('[data-testid="gap-family-wait"]')).toBeNull();
    await click(q('[data-testid="gap-review-proposal"]'));
    expect(p.onReviewProposal).toHaveBeenCalledWith(draft);
    await click(q('[data-testid="gap-dismiss"]'));
    expect(p.onDismiss).toHaveBeenCalledWith('Not a new service');
  });

  it('expand: shows the exact diff and needs a second confirm before writing', async () => {
    const p = panel({ analysis: analysis(rec({ decision: 'EXPAND_EXISTING', expansion: { serviceId: 'svc-cv', serviceName: 'Computer Vision', descriptionAddition: 'Adds digital twins.', keywordsToAdd: ['digital twin'], scopeChange: null } })) });
    await render(<GapRecommendationPanel {...p} />);
    expect(q('[data-testid="gap-expansion"]')!.textContent).toContain('Adds digital twins.');
    expect(q('[data-testid="gap-apply-expansion"]')).toBeNull();
    const apply = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Apply change…')!;
    await click(apply);
    expect(p.onApplyExpansion).not.toHaveBeenCalled();
    await click(q('[data-testid="gap-apply-expansion"]'));
    expect(p.onApplyExpansion).toHaveBeenCalledWith({ description: 'Builds vision systems.', keywords: ['vision'], naicsCodes: ['541511'] });
  });

  it('not analyzed / failed / unavailable / dismissed / stale are explicit states, never a blank guess', async () => {
    const onAnalyze = jest.fn();
    await render(<GapRecommendationPanel {...panel({ analysis: undefined, onAnalyze })} />);
    await click(q('[data-testid="gap-analyze"]'));
    expect(onAnalyze).toHaveBeenCalledWith(false);
    act(() => { root!.unmount(); }); container.remove();
    await render(<GapRecommendationPanel {...panel({ analysis: analysis(null) })} />);
    expect(container.textContent).toContain('could not be generated');
    act(() => { root!.unmount(); }); container.remove();
    await render(<GapRecommendationPanel {...panel({ available: false })} />);
    expect(container.textContent).toContain('Manual linking below still works');
    act(() => { root!.unmount(); }); container.remove();
    await render(<GapRecommendationPanel {...panel({ analysis: analysis(rec(), { reviewState: 'dismissed', reviewedBy: 'admin@example.test', reviewNote: 'Not a new service' }) })} />);
    expect(container.textContent).toContain('Recommendation dismissed by admin@example.test: Not a new service');
    act(() => { root!.unmount(); }); container.remove();
    await render(<GapRecommendationPanel {...panel({ analysis: analysis(rec(), { stale: true }) })} />);
    expect(container.textContent).toContain('Stale');
  });

  it('NAICS: titles shown, marked against what the service carries NOW; adding the missing ones needs a second confirm', async () => {
    const p = panel();
    await render(<GapRecommendationPanel {...p} />);
    const box = q('[data-testid="gap-naics"]')!;
    expect(box.textContent).toContain('541511Custom Computer Programming Services');
    expect(box.textContent).toContain('On service');
    expect(box.textContent).toContain('Not on service');
    await click(Array.from(box.querySelectorAll('button')).find((b) => b.textContent === 'Add 1 NAICS to AI Agents & Managed AI Workforce…')!);
    expect(p.onAddNaics).not.toHaveBeenCalled();
    expect(q('[data-testid="gap-add-naics"]')!.textContent).toBe('Confirm: add 611420');
    await click(q('[data-testid="gap-add-naics"]'));
    expect(p.onAddNaics).toHaveBeenCalledWith({ description: 'Builds vision systems.', keywords: ['vision'], naicsCodes: ['541511'] });
  });

  it('NAICS: no add button when the service already has every code; warnings for non-work codes; old analyses without NAICS render', async () => {
    await render(<GapRecommendationPanel {...panel({ serviceCurrent: () => ({ description: null, keywords: [], naicsCodes: ['541511', '611420', '221118'] }), analysis: analysis(rec({ naicsWarnings: ['"AI Agents" carries NAICS 221118, which is not a work-performed code.'] })) })} />);
    expect(container.textContent).not.toContain('Add 1 NAICS');
    expect(container.textContent).toContain('221118, which is not a work-performed code');
    act(() => { root!.unmount(); }); container.remove();
    const old = rec(); delete (old as Partial<GapRecommendation>).naics; delete (old as Partial<GapRecommendation>).naicsWarnings;
    await render(<GapRecommendationPanel {...panel({ analysis: analysis(old) })} />);
    expect(q('[data-testid="gap-naics"]')).toBeNull();
    expect(q('[data-testid="gap-verdict"]')).not.toBeNull();
  });

  it('NAICS on a new-service proposal: titles only, no on/off-service marks and no add button', async () => {
    await render(<GapRecommendationPanel {...panel({ analysis: analysis(rec({ decision: 'PROPOSE_NEW', target: null, proposedService: draft, naics: [{ code: '541512', title: 'Computer Systems Design Services', onTarget: false }] })) })} />);
    const box = q('[data-testid="gap-naics"]')!;
    expect(box.textContent).toContain('Computer Systems Design Services');
    expect(box.textContent).not.toContain('on service');
    expect(box.querySelector('button')).toBeNull();
  });

  it('GD3 anti-bloat: a proposal with 1 case study in its family offers "Use closest", not "Review proposed service"', async () => {
    const closest = { serviceId: 'svc-ag', serviceName: 'AI Agents & Managed AI Workforce', status: 'active' as const, fit: 58 };
    const p = panel({ familySize: 1, analysis: analysis(rec({ decision: 'PROPOSE_NEW', target: null, proposedService: draft, closestExisting: closest })) });
    await render(<GapRecommendationPanel {...p} />);
    expect(q('[data-testid="gap-family-wait"]')!.textContent).toContain('1 of 2 case studies');
    expect(q('[data-testid="gap-family-wait"]')!.textContent).toContain('AI Agents & Managed AI Workforce');
    expect(q('[data-testid="gap-review-proposal"]')).toBeNull();
    await click(q('[data-testid="gap-use-closest"]'));
    expect(p.onAdoptExisting).toHaveBeenCalled();
  });

  it('GD3 anti-bloat: no close service found still blocks the proposal and says so; no family size means 1', async () => {
    await render(<GapRecommendationPanel {...panel({ analysis: analysis(rec({ decision: 'PROPOSE_NEW', target: null, proposedService: draft, closestExisting: null })) })} />);
    expect(q('[data-testid="gap-family-wait"]')!.textContent).toContain('No close existing service was found');
    expect(q('[data-testid="gap-use-closest"]')).toBeNull();
    expect(q('[data-testid="gap-review-proposal"]')).toBeNull();
  });

  it('labels outside material as a document claim, not a fact', async () => {
    await render(<GapRecommendationPanel {...panel()} />);
    expect(container.textContent).toContain('Document claim');
  });
});

describe('IntakeCard with the AI panel', () => {
  const item: IntakeSummaryItem = {
    id: 'cs1', title: 'Bot Flows', slug: null, status: 'draft', sourceKind: 'outside', industry: 'Utilities', createdAt: null, keywords: [], analysisError: null,
    suggestions: [{ linkId: 'l-ag', serviceId: 'svc-ag', serviceName: 'AI Agents & Managed AI Workforce', matchScore: 4, rationale: null }],
  } as unknown as IntakeSummaryItem;
  const gapProps = (over: Partial<GapPanelProps> & { pinnedServiceId?: string } = {}) => {
    const { onReviewProposal, ...rest } = panel(over);
    void onReviewProposal;
    return rest;
  };

  it('"Use existing" arrives pre-ticked but still needs the Link click', async () => {
    const onLink = jest.fn().mockResolvedValue(undefined);
    await render(<IntakeCard item={item} growthServiceIds={new Set()} onLink={onLink} onPropose={jest.fn()} gap={gapProps({ pinnedServiceId: 'svc-ag' })} />);
    expect((q('#pick-cs1-l-ag') as HTMLInputElement).checked).toBe(true);
    expect(onLink).not.toHaveBeenCalled();
  });

  it('"Review proposed service" opens the existing form pre-filled; submitting passes the draft extras', async () => {
    const onPropose = jest.fn().mockResolvedValue(undefined);
    const a = analysis(rec({ decision: 'PROPOSE_NEW', target: null, proposedService: draft }));
    await render(<IntakeCard item={item} growthServiceIds={new Set()} onLink={jest.fn()} onPropose={onPropose} gap={gapProps({ analysis: a, familySize: 2 })} />);
    await click(q('[data-testid="gap-review-proposal"]'));
    expect((q('#ns-name-cs1') as HTMLInputElement).value).toBe('Industrial Digital Twins');
    expect((q('#ns-cat-cs1') as HTMLInputElement).value).toBe('AI Engineering');
    expect(onPropose).not.toHaveBeenCalled();
    await act(async () => { (q('form') as HTMLFormElement).requestSubmit(); });
    expect(onPropose).toHaveBeenCalledWith(item, 'Industrial Digital Twins', 'AI Engineering', { description: 'Fewer outages. Twin plus alerting.', keywords: ['digital twin'], naicsCodes: ['541512'] });
  });

  it('without gap props the card renders exactly as before (no panel)', async () => {
    await render(<IntakeCard item={item} growthServiceIds={new Set()} onLink={jest.fn()} onPropose={jest.fn()} />);
    expect(q('[data-testid="gap-panel"]')).toBeNull();
  });
});

describe('AiServiceOpportunities', () => {
  const opp: GapOpportunities = {
    generatedAt: '2026-11-15T20:00:00.000Z', intakeCount: 3,
    counters: { analyzed: 3, notAnalyzed: 0, stale: 1, failed: 0, newServiceProposals: 2, expandExisting: 0, matchExisting: 1, linkGrowth: 0, needsReview: 0 },
    clusters: [{ key: 'new:cs1', kind: 'new_service', decision: 'PROPOSE_NEW', title: 'Industrial Digital Twins', serviceId: null, caseStudyIds: ['cs1', 'cs2'], analysisIds: ['a1', 'a2'], rank: 60, meanNovelty: 70, meanReadiness: 50, maxDuplicateRisk: 20, duplicateWarnings: [], anyStale: true }],
    byCaseStudy: {}, run: null,
  };
  const state = (over: Partial<ServiceGapState> = {}): ServiceGapState => ({
    data: opp, error: null, notice: null, busy: new Set(), run: null, pinned: {},
    analyze: jest.fn(), startBatch: jest.fn(), review: jest.fn(), dismissCluster: jest.fn(), adoptExisting: jest.fn(), applyExpansion: jest.fn(), addNaics: jest.fn(), dismissNotice: jest.fn(), ...over,
  });

  it('shows counters, one cluster over two case studies, and jumps to a card', async () => {
    const onJump = jest.fn();
    await render(<AiServiceOpportunities gap={state()} titles={{ cs1: 'Twin A', cs2: 'Twin B' }} onJumpToCase={onJump} />);
    expect(container.textContent).toContain('New service proposals');
    expect(container.textContent).toContain('1 recommendation is stale');
    const cluster = q('[data-testid="gap-cluster-new_service"]')!;
    expect(cluster.textContent).toContain('2 case studies');
    await click(Array.from(cluster.querySelectorAll('button')).find((b) => b.textContent === 'Show case studies')!);
    await click(Array.from(cluster.querySelectorAll('button')).find((b) => b.textContent === 'Twin B')!);
    expect(onJump).toHaveBeenCalledWith('cs2');
  });

  it('the batch button starts a run, and is disabled while one is running', async () => {
    const g = state();
    await render(<AiServiceOpportunities gap={g} titles={{}} onJumpToCase={jest.fn()} />);
    await click(q('[data-testid="gap-batch"]'));
    expect(g.startBatch).toHaveBeenCalled();
    act(() => { root!.unmount(); }); container.remove();
    await render(<AiServiceOpportunities gap={state({ run: { id: 'r', status: 'running', total: 10, analyzed: 3, reused: 1, failed: 1, lastError: null, startedBy: null, startedAt: '', finishedAt: null } })} titles={{}} onJumpToCase={jest.fn()} />);
    expect((q('[data-testid="gap-batch"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[data-testid="gap-run-status"]')!.textContent).toContain('5 of 10 done');
    expect(q('[data-testid="gap-run-status"]')!.textContent).toContain('1 failed');
  });

  it('dismissing a cluster records the review for its members', async () => {
    const g = state();
    await render(<AiServiceOpportunities gap={g} titles={{}} onJumpToCase={jest.fn()} />);
    await click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Not a new service')!);
    expect(g.dismissCluster).toHaveBeenCalledWith(opp.clusters[0]);
  });
});
