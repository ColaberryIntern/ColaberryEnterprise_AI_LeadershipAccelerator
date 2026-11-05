const FLAGS = { govAiVetting: true };
jest.mock('../../../../config/featureFlags', () => ({ FLAGS }));
const jobFindOne = jest.fn();
const jobCreate = jest.fn();
const jobFindByPk = jest.fn();
jest.mock('../../../../models/GovExtractionJob', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => jobFindOne(...a), create: (...a: any[]) => jobCreate(...a), findByPk: (...a: any[]) => jobFindByPk(...a) },
}));
const loadBundle = jest.fn();
jest.mock('../govSourceBundleStore', () => ({ loadGovSourceBundleScoped: (...a: any[]) => loadBundle(...a) }));
jest.mock('fs/promises', () => ({ __esModule: true, default: { readFile: async () => Buffer.from('zip') } }));
const extractProposal = jest.fn();
jest.mock('../proposalExtractor', () => ({ extractProposal: (...a: any[]) => extractProposal(...a) }));
jest.mock('../govRequirementItems', () => ({ buildRequirementItems: () => [] }));
jest.mock('../govRequirementExtractAI', () => ({ applyAiComprehension: async (r: any) => ({ requirements: r.requirements, aiMeta: { mode: 'deterministic+ai' } }) }));
const ensureVettingRow = jest.fn();
const startGovAiVetting = jest.fn();
const noteExtractionFailed = jest.fn();
jest.mock('../../govAiVetting', () => ({
  ensureVettingRow: (...a: any[]) => ensureVettingRow(...a),
  noteExtractionFailed: (...a: any[]) => noteExtractionFailed(...a),
  startGovAiVetting: (...a: any[]) => startGovAiVetting(...a),
}));

import { startGovExtraction } from '../govExtractionJobService';

const GWS = { tenantId: 't', qualificationKey: 'gws:abc', sourceBundleId: 'b', sha256: 's' };
const job = (over: any = {}) => {
  const j: any = { id: 'j1', tenant_id: 't', qualification_key: over.qualification_key ?? 'gws:abc', source_bundle_id: 'b', sha256: 's', update: jest.fn(async (f: any) => Object.assign(j, f)), ...over };
  return j;
};
const settle = async () => { for (let i = 0; i < 12; i += 1) await new Promise((r) => setImmediate(r)); };

beforeEach(() => {
  jest.resetAllMocks();
  FLAGS.govAiVetting = true;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jobFindOne.mockResolvedValue(null);
  jobCreate.mockResolvedValue({ id: 'j1' });
  loadBundle.mockResolvedValue({ path: '/x' });
  extractProposal.mockResolvedValue({ requirements: [], fileCount: 1, files: [], dossier: null });
});

describe('the AI checks start on their own after extraction', () => {
  it('marks the ZIP as analyzing at upload, then starts the checks when extraction completes', async () => {
    const j = job();
    jobFindByPk.mockResolvedValue(j);
    await startGovExtraction(GWS);
    expect(ensureVettingRow).toHaveBeenCalledWith({ tenantId: 't', qualificationKey: 'gws:abc', sha256: 's' });
    await settle();
    expect(j.status).toBe('completed');
    expect(startGovAiVetting).toHaveBeenCalledWith({ tenantId: 't', qualificationKey: 'gws:abc', sha256: 's' });
  });
  it('flag off: neither step runs, and extraction is unchanged', async () => {
    FLAGS.govAiVetting = false;
    const j = job();
    jobFindByPk.mockResolvedValue(j);
    await startGovExtraction(GWS);
    await settle();
    expect(j.status).toBe('completed');
    expect(ensureVettingRow).not.toHaveBeenCalled();
    expect(startGovAiVetting).not.toHaveBeenCalled();
  });
  it('an op:gov: pursuit gets no vetting', async () => {
    const j = job({ qualification_key: 'op:gov:abc' });
    jobFindByPk.mockResolvedValue(j);
    await startGovExtraction({ ...GWS, qualificationKey: 'op:gov:abc' });
    await settle();
    expect(ensureVettingRow).not.toHaveBeenCalled();
    expect(startGovAiVetting).not.toHaveBeenCalled();
  });
  it('a failed row write does not stop the upload or the extraction', async () => {
    const j = job();
    jobFindByPk.mockResolvedValue(j);
    ensureVettingRow.mockRejectedValue(new Error('db'));
    await expect(startGovExtraction(GWS)).resolves.toEqual({ jobId: 'j1' });
    await settle();
    expect(j.status).toBe('completed');
  });
  it('a throwing vetting start does not fail a completed extraction', async () => {
    const j = job();
    jobFindByPk.mockResolvedValue(j);
    startGovAiVetting.mockImplementation(() => { throw new Error('boom'); });
    await startGovExtraction(GWS);
    await settle();
    expect(j.status).toBe('completed');
  });
  it('a failed extraction does not start the checks; the row waits for the catch-up to retry', async () => {
    const j = job();
    jobFindByPk.mockResolvedValue(j);
    extractProposal.mockRejectedValue(new Error('bad zip'));
    await startGovExtraction(GWS);
    await settle();
    expect(j.status).toBe('failed');
    expect(startGovAiVetting).not.toHaveBeenCalled();
    expect(noteExtractionFailed).toHaveBeenCalledWith({ tenantId: 't', qualificationKey: 'gws:abc', sha256: 's' }); // so the screen doesn't say "running"
  });
  it('re-uploading bytes whose job is still running reuses the job, but they become the newest upload (A, B, A reads A)', async () => {
    jobFindOne.mockResolvedValue({ id: 'existing' });
    expect(await startGovExtraction(GWS)).toEqual({ jobId: 'existing' });
    expect(jobCreate).not.toHaveBeenCalled();
    expect(ensureVettingRow).toHaveBeenCalledTimes(1);
    expect(ensureVettingRow).toHaveBeenCalledWith({ tenantId: GWS.tenantId, qualificationKey: GWS.qualificationKey, sha256: GWS.sha256 });
  });
});
