/**
 * The shared Fit wrapper: both flag states, explicit override, fail-soft proof loading, titles passed to the model
 * only when they exist, and the raw model output kept for the regression script.
 */
const FLAGS: Record<string, boolean> = {};
jest.mock('../../../config/featureFlags', () => ({ FLAGS }));
const listServices = jest.fn();
jest.mock('../serviceCatalog', () => ({ listServiceOfferings: (...a: unknown[]) => listServices(...a) }));
const fitCall = jest.fn();
jest.mock('../govCapabilityFit', () => ({ assessCapabilityFit: (...a: unknown[]) => fitCall(...a) }));

import { assessCapabilityFitWithProof } from '../govCapabilityFitWithProof';
import { DOWNGRADE_REASON, ProofContext } from '../govFitProofRules';

const HAVE = { id: 'CAP-01', name: 'Dashboards', why: 'w', assessment: 'have', matchedServiceId: 'S1', rationale: 'r' };
const NEW = { id: 'CAP-02', name: 'Pricing forecasting', why: 'w', assessment: 'new', matchedServiceId: null, rationale: 'r' };
const proof = (o: Partial<ProofContext> = {}): ProofContext => ({ available: true, evidenceByService: {}, candidates: [], ...o });
const input = { tenantId: 't1', requirements: [{ id: 'R1', text: 'x' }], title: 'T', buyer: 'B' };
let errSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  delete FLAGS.govFitRequireProof;
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  listServices.mockResolvedValue([{ id: 'S1', name: 'Dash', description: 'd', category: 'c', keywords: ['k'], status: 'active' }, { id: 'S2', name: 'Other' }]);
  fitCall.mockResolvedValue({ capabilities: [HAVE, NEW], cached: false, generatedAt: 'g' });
});
afterEach(() => errSpy.mockRestore());

describe('assessCapabilityFitWithProof', () => {
  it('reads ACTIVE services for the tenant and passes titles only for services that have evidence', async () => {
    const ev = { caseStudyId: 'cs1', title: 'Fleet dashboard', sourceKind: 'inside' as const };
    await assessCapabilityFitWithProof(input, { loadProof: async () => proof({ evidenceByService: { S1: [ev] } }) });
    expect(listServices).toHaveBeenCalledWith({ tenantId: 't1', status: 'active' });
    const sent = fitCall.mock.calls[0][0].services;
    expect(sent[0]).toEqual({ id: 'S1', name: 'Dash', description: 'd', category: 'c', keywords: ['k'], evidenceTitles: ['Fleet dashboard'] });
    expect(sent[1]).toEqual({ id: 'S2', name: 'Other', description: undefined, category: undefined, keywords: undefined });
    expect('evidenceTitles' in sent[1]).toBe(false);
  });

  it('flag OFF (default): have stays have with evidence []; the gap gets possibleProof; proof reported', async () => {
    const out = await assessCapabilityFitWithProof(input, { loadProof: async () => proof() });
    expect(out.fit.capabilities[0]).toMatchObject({ assessment: 'have', evidence: [] });
    expect(out.fit.capabilities[0].downgradedFrom).toBeUndefined();
    expect(out.fit.capabilities[1]).toMatchObject({ assessment: 'new', possibleProof: [] });
    expect(out.fit.proof).toEqual({ available: true, requireProof: false });
    expect(out.rawCapabilities).toEqual([HAVE, NEW]);
  });

  it('flag ON via FLAGS: the unproven have is downgraded with the reason', async () => {
    FLAGS.govFitRequireProof = true;
    const out = await assessCapabilityFitWithProof(input, { loadProof: async () => proof() });
    expect(out.fit.capabilities[0]).toMatchObject({ assessment: 'partial', downgradedFrom: 'have', downgradeReason: DOWNGRADE_REASON });
    expect(out.fit.proof).toEqual({ available: true, requireProof: true });
    expect(out.rawCapabilities[0].assessment).toBe('have');
  });

  it('an explicit requireProof overrides the flag both ways', async () => {
    FLAGS.govFitRequireProof = true;
    expect((await assessCapabilityFitWithProof({ ...input, requireProof: false }, { loadProof: async () => proof() })).fit.capabilities[0].assessment).toBe('have');
    FLAGS.govFitRequireProof = false;
    expect((await assessCapabilityFitWithProof({ ...input, requireProof: true }, { loadProof: async () => proof() })).fit.capabilities[0].assessment).toBe('partial');
  });

  it('a proof load failure falls back to the pre-SV2 fit: no titles, no proof fields, NO downgrade even with the flag on', async () => {
    FLAGS.govFitRequireProof = true;
    const out = await assessCapabilityFitWithProof(input, { loadProof: async () => { throw new RangeError('pool exhausted'); } });
    expect(fitCall.mock.calls[0][0].services.some((s: Record<string, unknown>) => 'evidenceTitles' in s)).toBe(false);
    expect(out.fit.capabilities).toEqual([HAVE, NEW]);
    expect(out.fit.proof).toEqual({ available: false, requireProof: true });
    expect(JSON.parse(String(errSpy.mock.calls[0][0]))).toMatchObject({ event: 'gov_fit_proof_load_failed', error_class: 'RangeError' });
  });

  it('returns a failed fit untouched for the caller to handle', async () => {
    fitCall.mockResolvedValue({ capabilities: [], cached: false, generatedAt: 'g', error: 'down' });
    const out = await assessCapabilityFitWithProof(input, { loadProof: async () => proof() });
    expect(out.fit).toEqual({ capabilities: [], cached: false, generatedAt: 'g', error: 'down' });
  });

  it('a catalog failure still throws (as before SV2), so the route answers 500 and vetting retries', async () => {
    listServices.mockRejectedValue(new Error('db'));
    await expect(assessCapabilityFitWithProof(input, { loadProof: async () => proof() })).rejects.toThrow('db');
  });
});
