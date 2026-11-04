/**
 * reanalyzeProposalBlueprint — the service orchestration. I/O (models, bundle store, extractor, document sync, fs)
 * is mocked; the PURE core (buildProposalBlueprint, deriveProposalDocuments, diffBlueprints, readGovProvenanceFacts)
 * runs for real so the test proves the real integration. Asserts: 409 (bundle_missing) when no qualification or no
 * bundle; the happy path writes the next version, syncs documents, and returns a diff; the version increments.
 */
const qualFindOne = jest.fn();
const blueprintFindOne = jest.fn();
const blueprintCreate = jest.fn();
const reqFindAll = jest.fn();
const loadLatestBundle = jest.fn();
const extractProposalMock = jest.fn();
const syncDocs = jest.fn();
const readFileMock = jest.fn();

jest.mock('../../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => qualFindOne(...a) } }));
jest.mock('../../../../models/GovProposalBlueprint', () => ({ __esModule: true, default: { findOne: (...a: any[]) => blueprintFindOne(...a), create: (...a: any[]) => blueprintCreate(...a) } }));
jest.mock('../../../../models/ContractRequirement', () => ({ __esModule: true, default: { findAll: (...a: any[]) => reqFindAll(...a) } }));
jest.mock('../govSourceBundleStore', () => ({ loadLatestGovSourceBundle: (...a: any[]) => loadLatestBundle(...a) }));
jest.mock('../proposalExtractor', () => ({ extractProposal: (...a: any[]) => extractProposalMock(...a) }));
jest.mock('../govProposalDocumentStore', () => ({ syncProposalDocuments: (...a: any[]) => syncDocs(...a) }));
jest.mock('fs/promises', () => ({ __esModule: true, default: { readFile: (...a: any[]) => readFileMock(...a) }, readFile: (...a: any[]) => readFileMock(...a) }));

import { reanalyzeProposalBlueprint, BlueprintReanalysisError } from '../reanalyzeProposalBlueprint';

const SOLICITATION = `RFP DIR-2027 — STATE OF TEXAS, Department of Information Resources (DIR).
Proposals will be evaluated on the following criteria: Technical Approach (40 points), Cost (30 points). Award on a best value basis.
The technical proposal shall not exceed 20 pages. Respondents must complete a HUB Subcontracting Plan.`;

beforeEach(() => {
  jest.clearAllMocks();
  qualFindOne.mockResolvedValue({ tenant_id: 'T1', canonical_opportunity_id: 'gws:abc', requirements_json: {} });
  loadLatestBundle.mockResolvedValue({ path: '/vol/x.zip', mime: 'application/zip', filename: 'rfp.zip', sha256: 'deadbeef' });
  readFileMock.mockResolvedValue(Buffer.from('zip'));
  extractProposalMock.mockResolvedValue({ perFileText: [{ name: 'RFP.pdf', text: SOLICITATION }], blocks: [], requirements: [], dossier: {}, fileCount: 1, files: [] });
  reqFindAll.mockResolvedValue([{ get: () => ({ canonical_req_id: 'R1', statement: 'Provide a technical approach narrative.', kind: 'compliance', section: null }) }]);
  blueprintFindOne.mockResolvedValue(null);
  blueprintCreate.mockResolvedValue({ id: 'bp1' });
  syncDocs.mockResolvedValue([]);
});

describe('reanalyzeProposalBlueprint — missing package', () => {
  it('throws bundle_missing when there is no qualification', async () => {
    qualFindOne.mockResolvedValue(null);
    await expect(reanalyzeProposalBlueprint('dp-1', 'me')).rejects.toMatchObject({ name: 'BlueprintReanalysisError', reason: 'bundle_missing' });
    expect(blueprintCreate).not.toHaveBeenCalled();
  });
  it('throws bundle_missing when the stored bundle is gone', async () => {
    loadLatestBundle.mockResolvedValue(null);
    await expect(reanalyzeProposalBlueprint('dp-1', 'me')).rejects.toBeInstanceOf(BlueprintReanalysisError);
  });
});

describe('reanalyzeProposalBlueprint — happy path', () => {
  it('writes version 1, records the source sha, syncs documents, and returns a first-blueprint diff', async () => {
    const result = await reanalyzeProposalBlueprint('dp-1', 'me-1');
    expect(result.version).toBe(1);
    expect(result.blueprint.rules.some((r) => r.key === 'page_limit' && r.value === '20')).toBe(true);
    expect(result.blueprint.buyerType).toBe('state_agency');
    expect(result.diff.summary.some((s) => /First blueprint/.test(s))).toBe(true);
    expect(result.documentCount).toBeGreaterThan(0);
    // persisted with the source sha + the pure blueprint
    const createArg = blueprintCreate.mock.calls[0][0];
    expect(createArg).toMatchObject({ delivery_project_id: 'dp-1', version: 1, source_sha256: 'deadbeef', created_by_identity_id: 'me-1' });
    // documents synced from the blueprint
    expect(syncDocs).toHaveBeenCalledWith('dp-1', expect.any(Array));
    expect(syncDocs.mock.calls[0][1].every((d: any) => d.blueprintVersion === 1)).toBe(true);
  });

  it('increments the version off the previous blueprint', async () => {
    blueprintFindOne.mockResolvedValue({ version: 2, blueprint_json: { rules: [], forms: [], scoring: { basis: null, basisQuote: null, totalPoints: null, factors: [] }, addenda: [], eliminationRisks: [], buyerType: null, droppedRuleCount: 0, sourceFiles: [], generatedAt: 'x' } });
    const result = await reanalyzeProposalBlueprint('dp-1', 'me-1');
    expect(result.version).toBe(3);
  });

  it('throws extract_failed (not an unhandled rejection) when the ZIP read fails', async () => {
    readFileMock.mockRejectedValue(new Error('EIO'));
    await expect(reanalyzeProposalBlueprint('dp-1', 'me')).rejects.toMatchObject({ reason: 'extract_failed' });
  });
});
