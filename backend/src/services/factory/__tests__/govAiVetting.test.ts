const query = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => query(...a), define: jest.fn() } }));
const FLAGS = { govAiVetting: true };
jest.mock('../../../config/featureFlags', () => ({ FLAGS }));
const vettingUpdate = jest.fn();
const vettingFindOne = jest.fn();
jest.mock('../../../models/GovAiVetting', () => ({ __esModule: true, default: { update: (...a: any[]) => vettingUpdate(...a), findOne: (...a: any[]) => vettingFindOne(...a) } }));
const jobFindOne = jest.fn();
jest.mock('../../../models/GovExtractionJob', () => ({ __esModule: true, default: { findOne: (...a: any[]) => jobFindOne(...a) } }));
const bundleFindOne = jest.fn();
jest.mock('../../../models/GovSourceBundle', () => ({ __esModule: true, default: { findOne: (...a: any[]) => bundleFindOne(...a) } }));
const qualFindOne = jest.fn();
const qualFindAll = jest.fn();
jest.mock('../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => qualFindOne(...a), findAll: (...a: any[]) => qualFindAll(...a) } }));
const extractBundlePayload = jest.fn();
jest.mock('../proposal/govExtractionJobService', () => ({ extractBundlePayload: (...a: any[]) => extractBundlePayload(...a) }));
const fetchFeed = jest.fn();
jest.mock('../opportunities/oppPulseClient', () => ({ fetchBestFitOpportunities: (...a: any[]) => fetchFeed(...a) }));
const listServices = jest.fn();
jest.mock('../serviceCatalog', () => ({ listServiceOfferings: (...a: any[]) => listServices(...a) }));
const fitCall = jest.fn();
jest.mock('../govCapabilityFit', () => ({ assessCapabilityFit: (...a: any[]) => fitCall(...a) }));
const goNoGo = jest.fn();
jest.mock('../govAiGoNoGo', () => ({ generateGoNoGo: (...a: any[]) => goNoGo(...a) }));
const summary = jest.fn();
const questions = jest.fn();
jest.mock('../govBidNarrative', () => ({ generateProposalSummary: (...a: any[]) => summary(...a), generateClarificationQuestions: (...a: any[]) => questions(...a) }));
const lookupContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: (...a: any[]) => lookupContainer(...a) }));
const claimSlot = jest.fn();
jest.mock('../opportunities/govDailySlot', () => ({ claimDailySlot: (...a: any[]) => claimSlot(...a) }));
jest.mock('../govPipeline', () => ({ resolveGovCloseDate: (r: any) => r?.closeDate ?? null }));

import { BACKFILL_PER_DAY, claimVetting, ensureVettingRow, finalizeExhausted, loadAiVettingView, runGovAiVettingCatchup, runVetting, startGovAiVetting } from '../govAiVetting';

const K = { tenantId: 'ten-1', qualificationKey: 'gws:abc', sha256: 'a'.repeat(64) };
const CAND = { id: 'R1', text: 'Vendor must hold an active StateRAMP authorization at submission.', extractedText: 'Vendor must hold an active StateRAMP authorization at submission.' };
const claimOk = (attempts = 1) => query.mockResolvedValueOnce([{ id: 'row-1', attempts }]);
const saved = () => vettingUpdate.mock.calls.map((c) => c[0]);

beforeEach(() => {
  jest.resetAllMocks();
  FLAGS.govAiVetting = true;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jobFindOne.mockResolvedValue({ result_json: { candidates: [CAND] } });
  qualFindOne.mockResolvedValue({ get: () => ({ requirements_json: { provenance: { title: 'Saved title', agency: 'Saved agency' } } }) });
  fetchFeed.mockResolvedValue({ source: 'live', opportunities: [{ uuid: 'abc', title: 'Feed title', agency: 'Feed agency', closeDate: '2026-12-01', fitScore: 75, priorityScore: 70, estimatedValue: 500000, sourceUrl: 'https://b.example/1' }] });
  listServices.mockResolvedValue([{ id: 's1', name: 'Software' }]);
  fitCall.mockResolvedValue({ capabilities: [{ name: 'A', assessment: 'have' }, { name: 'B', assessment: 'partial' }] });
  goNoGo.mockResolvedValue({ verdict: 'pursue', reason: 'Good fit.', quote: null });
  summary.mockResolvedValue({ whatTheyWant: 'x', whatWedBuild: 'y' });
  questions.mockResolvedValue({ questions: [] });
  vettingUpdate.mockResolvedValue([1]);
  claimSlot.mockResolvedValue(true);
});

describe('runVetting: happy path', () => {
  it('runs every check and saves the verdict with the results', async () => {
    claimOk();
    expect(await runVetting(K)).toBe(true);
    const [row] = saved();
    expect(row).toMatchObject({ status: 'completed', verdict: 'pursue', reason: 'Good fit.', coverage_pct: 100 });
    expect(row.fit_json).toBeTruthy();
    expect(row.summary_json).toBeTruthy();
    expect(row.questions_json).toBeTruthy();
    expect(row.opportunity_json).toMatchObject({ title: 'Feed title', fitScore: 75 });
  });
  it('reads the catalog for this tenant, active services only', async () => {
    claimOk();
    await runVetting(K);
    expect(listServices).toHaveBeenCalledWith({ tenantId: 'ten-1', status: 'active' });
  });
  it('a verified quote found in the extracted text survives into the save', async () => {
    claimOk();
    goNoGo.mockResolvedValue({ verdict: 'pass', reason: 'A wall.', quote: 'hold an active StateRAMP authorization' });
    await runVetting(K);
    expect(saved()[0]).toMatchObject({ verdict: 'pass', reason_quote: 'hold an active StateRAMP authorization' });
  });
  it('uses saved provenance, not the June snapshot, when the feed is degraded', async () => {
    claimOk();
    fetchFeed.mockResolvedValue({ source: 'snapshot', opportunities: [{ uuid: 'abc', title: 'Stale June title' }] });
    await runVetting(K);
    expect(saved()[0].opportunity_json).toMatchObject({ title: 'Saved title', agency: 'Saved agency' });
  });
});

describe('claiming', () => {
  it('a second caller gets nothing and runs nothing (one winner)', async () => {
    query.mockResolvedValueOnce([]);
    expect(await runVetting(K)).toBe(false);
    expect(fitCall).not.toHaveBeenCalled();
    expect(vettingUpdate).not.toHaveBeenCalled();
  });
  it('counts the attempt in the claim and refuses a row at the cap', async () => {
    query.mockResolvedValueOnce([{ id: 'r', attempts: 2 }]);
    expect(await claimVetting(K)).toEqual({ id: 'r', attempts: 2 });
    const [sql, opts] = query.mock.calls[0];
    expect(sql).toMatch(/attempts = attempts \+ 1/);
    expect(sql).toMatch(/attempts < :max/);
    expect(sql).toMatch(/status = 'queued' OR \(status = 'running' AND updated_at < NOW\(\)/);
    expect(opts.replacements).toMatchObject({ max: 3, stale: 30 });
  });
  it('re-uploading known bytes only moves last_uploaded_at, so it does not re-run', async () => {
    query.mockResolvedValueOnce([]);
    await ensureVettingRow(K);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(tenant_id, qualification_key, sha256\) DO UPDATE SET last_uploaded_at = NOW\(\)/);
    expect(sql).not.toMatch(/DO UPDATE SET[^;]*status/);
  });
  it('a process that died on its last attempt gets finalized as inconclusive', async () => {
    query.mockResolvedValueOnce([]);
    await finalizeExhausted();
    const [sql, opts] = query.mock.calls[0];
    expect(sql).toMatch(/verdict = 'inconclusive'/);
    expect(sql).toMatch(/error_class = 'attempts_exhausted'/);
    expect(sql).toMatch(/attempts >= :max AND \(status = 'queued' OR \(status = 'running' AND updated_at/);
    expect(opts.replacements.max).toBe(3);
  });
});

describe('failure paths', () => {
  it('a failed fit is a retry, not 0% coverage and never a pass', async () => {
    claimOk(1);
    fitCall.mockResolvedValue({ capabilities: [], error: 'down' });
    goNoGo.mockResolvedValue({ verdict: 'pass', reason: 'x', quote: null });
    await runVetting(K);
    expect(saved()[0]).toMatchObject({ status: 'queued' });
    expect(saved()[0].verdict).toBeUndefined();
    expect(goNoGo).not.toHaveBeenCalled();
  });
  it('a failed go/no-go is a retry', async () => {
    claimOk(1);
    goNoGo.mockResolvedValue({ verdict: null, reason: '', quote: null, error: 'down' });
    await runVetting(K);
    expect(saved()[0]).toMatchObject({ status: 'queued' });
  });
  it('the third failure completes as inconclusive, never hidden', async () => {
    claimOk(3);
    goNoGo.mockResolvedValue({ verdict: null, reason: '', quote: null, error: 'down' });
    await runVetting(K);
    expect(saved()[0]).toMatchObject({ status: 'completed', verdict: 'inconclusive' });
    expect(saved()[0].error_class).toBeTruthy();
  });
  it('a summary or questions error is non-fatal and the verdict is still saved', async () => {
    claimOk();
    summary.mockResolvedValue({ error: 'down' });
    questions.mockResolvedValue({ error: 'down' });
    await runVetting(K);
    expect(saved()[0]).toMatchObject({ verdict: 'pursue', summary_json: null, questions_json: null });
  });
  it('a throwing catalog read is recorded, and runVetting never throws', async () => {
    claimOk();
    listServices.mockRejectedValue(new Error('db'));
    await expect(runVetting(K)).resolves.toBe(true);
    expect(saved()[0]).toMatchObject({ status: 'queued' });
  });
  it('a failed save leaves recovery to the stale reclaim and never throws', async () => {
    claimOk();
    vettingUpdate.mockRejectedValue(new Error('db'));
    await expect(runVetting(K)).resolves.toBe(true);
  });
});

describe('where the requirements come from', () => {
  it('no completed job: extracts from the stored ZIP', async () => {
    claimOk();
    jobFindOne.mockResolvedValue(null);
    bundleFindOne.mockResolvedValue({ id: 'b1' });
    extractBundlePayload.mockResolvedValue({ candidates: [CAND] });
    await runVetting(K);
    expect(extractBundlePayload).toHaveBeenCalledWith('ten-1', 'gws:abc', 'b1');
    expect(saved()[0].verdict).toBe('pursue');
  });
  it('no stored ZIP record: inconclusive zip_bytes_missing, no retry', async () => {
    claimOk(1);
    jobFindOne.mockResolvedValue(null);
    bundleFindOne.mockResolvedValue(null);
    await runVetting(K);
    expect(saved()[0]).toMatchObject({ status: 'completed', verdict: 'inconclusive', error_class: 'zip_bytes_missing' });
  });
  it('a record whose file cannot be read is retried, since it could be local to one instance', async () => {
    claimOk(1);
    jobFindOne.mockResolvedValue(null);
    bundleFindOne.mockResolvedValue({ id: 'b1' });
    extractBundlePayload.mockRejectedValue(new Error('Source bundle is missing from the store.'));
    await runVetting(K);
    expect(saved()[0]).toMatchObject({ status: 'queued' });
  });
  it('zero candidates: inconclusive no_requirements_extracted, with no AI call and no retry', async () => {
    claimOk(1);
    jobFindOne.mockResolvedValue({ result_json: { candidates: [] } });
    await runVetting(K);
    expect(saved()[0]).toMatchObject({ status: 'completed', verdict: 'inconclusive', error_class: 'no_requirements_extracted' });
    expect(fitCall).not.toHaveBeenCalled();
    expect(goNoGo).not.toHaveBeenCalled();
  });
});

describe('startGovAiVetting', () => {
  it('flag off: nothing runs', () => {
    FLAGS.govAiVetting = false;
    startGovAiVetting(K);
    expect(query).not.toHaveBeenCalled();
  });
  it('an op:gov: key: nothing runs', () => {
    startGovAiVetting({ ...K, qualificationKey: 'op:gov:abc' });
    expect(query).not.toHaveBeenCalled();
  });
  it('a throwing claim is swallowed, so it can never fail the extraction job', async () => {
    query.mockRejectedValue(new Error('db'));
    expect(() => startGovAiVetting(K)).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
});

describe('loadAiVettingView', () => {
  it('is null before any upload', async () => {
    vettingFindOne.mockResolvedValue(null);
    expect(await loadAiVettingView('ten-1', 'gws:abc')).toBeNull();
  });
  it('reads the newest upload, scoped to the tenant, and returns the saved results with what extraction found', async () => {
    vettingFindOne.mockResolvedValue({ sha256: 's', status: 'completed', verdict: 'pursue', reason: 'r', reason_quote: 'q', coverage_pct: 80, fit_json: { capabilities: [] }, summary_json: { whatTheyWant: 'x' }, questions_json: null });
    jobFindOne.mockResolvedValue({ result_json: { candidates: [CAND], items: [], files: [], extraction: { mode: 'deterministic+ai' } } });
    const view: any = await loadAiVettingView('ten-1', 'gws:abc');
    expect(vettingFindOne).toHaveBeenCalledWith({ where: { tenant_id: 'ten-1', qualification_key: 'gws:abc' }, order: [['last_uploaded_at', 'DESC']] });
    expect(view).toMatchObject({ status: 'completed', verdict: 'pursue', quote: 'q', coveragePct: 80, summary: { whatTheyWant: 'x' } });
    expect(view.extraction.candidates).toEqual([CAND]);
  });
  it('a still-running row has no results yet', async () => {
    vettingFindOne.mockResolvedValue({ sha256: 's', status: 'running' });
    jobFindOne.mockResolvedValue(null);
    expect(await loadAiVettingView('ten-1', 'gws:abc')).toMatchObject({ status: 'running', verdict: null, extraction: null });
  });
});

describe('runGovAiVettingCatchup', () => {
  const zipRec = (id: string, closeDate?: string) => ({ get: () => ({ canonical_opportunity_id: `gws:${id}`, closeDate, requirements_json: { reviewedDocuments: [{ method: 'solicitation_zip', sha256: `sha-${id}` }] } }) });

  it('flag off: nothing', async () => {
    FLAGS.govAiVetting = false;
    expect((await runGovAiVettingCatchup()).skipped).toBe('disabled');
    expect(claimSlot).not.toHaveBeenCalled();
  });
  it('only one instance a day runs it, so the backfill cap holds across instances', async () => {
    claimSlot.mockResolvedValue(false);
    expect(await runGovAiVettingCatchup()).toMatchObject({ skipped: 'already_ran_today', backfilled: 0 });
    expect(qualFindAll).not.toHaveBeenCalled();
  });
  it(`backfills at most ${BACKFILL_PER_DAY}, older ZIPs with a stored bundle and no row`, async () => {
    query.mockResolvedValue([]);
    lookupContainer.mockResolvedValue({ tenant: { id: 'ten-1' } });
    qualFindAll.mockResolvedValue(Array.from({ length: 14 }, (_, i) => zipRec(String(i))));
    vettingFindOne.mockResolvedValue(null);
    bundleFindOne.mockResolvedValue({ id: 'b' });
    expect((await runGovAiVettingCatchup()).backfilled).toBe(BACKFILL_PER_DAY);
  });
  it('skips a past deadline, no ZIP, no bundle, an existing row, and op:gov: keys', async () => {
    query.mockResolvedValue([]);
    lookupContainer.mockResolvedValue({ tenant: { id: 'ten-1' } });
    qualFindAll.mockResolvedValue([
      zipRec('past', '2020-01-01'),
      { get: () => ({ canonical_opportunity_id: 'gws:nozip', requirements_json: {} }) },
      { get: () => ({ canonical_opportunity_id: 'op:gov:x', requirements_json: { reviewedDocuments: [{ method: 'solicitation_zip', sha256: 's' }] } }) },
      zipRec('hasrow'),
      zipRec('nobundle'),
    ]);
    vettingFindOne.mockImplementation(async ({ where }: any) => (where.qualification_key === 'gws:hasrow' ? { id: 'x' } : null));
    bundleFindOne.mockResolvedValue(null);
    expect((await runGovAiVettingCatchup()).backfilled).toBe(0);
  });
  it('never backfills an older attested ZIP over a newer upload, because its row would count as the newest', async () => {
    query.mockResolvedValue([]);
    lookupContainer.mockResolvedValue({ tenant: { id: 'ten-1' } });
    qualFindAll.mockResolvedValue([zipRec('replaced')]);
    // The attested sha is sha-replaced, but the newest stored ZIP is newer-zip, which already has its row.
    bundleFindOne.mockResolvedValue({ id: 'b', sha256: 'newer-zip' });
    vettingFindOne.mockImplementation(async ({ where }: any) => (where.sha256 === 'newer-zip' ? { id: 'newer-row' } : null));
    expect((await runGovAiVettingCatchup()).backfilled).toBe(0);
    expect(bundleFindOne.mock.calls[0][0].order).toEqual([['created_at', 'DESC']]);
  });
  it('backfills the newest stored ZIP when it has no row, even if an older ZIP does', async () => {
    query.mockResolvedValue([]);
    lookupContainer.mockResolvedValue({ tenant: { id: 'ten-1' } });
    qualFindAll.mockResolvedValue([zipRec('uploadedwhileoff')]);
    bundleFindOne.mockResolvedValue({ id: 'b', sha256: 'newer-zip' });
    vettingFindOne.mockImplementation(async ({ where }: any) => (where.sha256 === 'old-zip' ? { id: 'old-row' } : null));
    expect((await runGovAiVettingCatchup()).backfilled).toBe(1);
  });
  it('retries queued rows, and finishes stuck ones before and after', async () => {
    query.mockImplementation(async (sql: string) => {
      if (/SELECT tenant_id/.test(sql)) return [{ tenant_id: 'ten-1', qualification_key: 'gws:abc', sha256: 's' }];
      if (/SET status = 'running'/.test(sql)) return [{ id: 'row-1', attempts: 2 }];
      return [];
    });
    lookupContainer.mockResolvedValue(null);
    expect(await runGovAiVettingCatchup()).toEqual({ retried: 1, backfilled: 0 });
    expect(query.mock.calls.filter(([s]) => /attempts_exhausted/.test(s))).toHaveLength(2);
  });
});
