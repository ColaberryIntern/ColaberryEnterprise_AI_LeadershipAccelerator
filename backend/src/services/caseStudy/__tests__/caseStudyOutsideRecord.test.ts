/**
 * What one outside import WRITES, asserted row by row: the draft is private and anonymized, the original is attached,
 * provenance says every claim came from an outside document, metrics are pending/unpublishable, and everything goes
 * through ONE transaction with the idempotency row written last. Models are mocked.
 */
const order: string[] = [];
const calls: Record<string, unknown[]> = {};
const rec = (name: string, ret: unknown) => jest.fn((row: unknown, opts: unknown) => { order.push(name); calls[name] = [row, opts]; return Promise.resolve(ret); });
const TX = { id: 'tx' };
const csCreate = rec('case_studies', { id: 'cs1' });
const artCreate = rec('case_study_artifacts', { id: 'art1' });
const evCreate = rec('case_study_evidence', { id: 'ev1' });
const metricBulk = rec('case_study_metrics', []);
const impCreate = rec('case_study_external_imports', { id: 'imp1' });
const impFindOne = jest.fn();
const transaction = jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(TX));

jest.mock('../../../config/database', () => ({ sequelize: { transaction: (fn: (t: unknown) => Promise<unknown>) => transaction(fn) } }));
jest.mock('../../../models/CaseStudy', () => ({ __esModule: true, default: { create: (...a: unknown[]) => csCreate(...(a as [unknown, unknown])) } }));
jest.mock('../../../models/CaseStudyArtifact', () => ({ __esModule: true, default: { create: (...a: unknown[]) => artCreate(...(a as [unknown, unknown])) } }));
jest.mock('../../../models/CaseStudyEvidence', () => ({ __esModule: true, default: { create: (...a: unknown[]) => evCreate(...(a as [unknown, unknown])) } }));
jest.mock('../../../models/CaseStudyMetric', () => ({ __esModule: true, default: { bulkCreate: (...a: unknown[]) => metricBulk(...(a as [unknown, unknown])) } }));
jest.mock('../../../models/CaseStudyExternalImport', () => ({ __esModule: true, default: {
  create: (...a: unknown[]) => impCreate(...(a as [unknown, unknown])), findOne: (...a: unknown[]) => impFindOne(...a),
} }));
jest.mock('../caseStudyAdminStore', () => ({
  slugifyCaseStudyTitle: (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
}));

import { createOutsideRecord, findExistingImport, outsideSlug, titleFromFileName, OutsideRecordInput } from '../caseStudyOutsideRecord';

const HASH = 'ab12cd34'.padEnd(64, '0');
const base: OutsideRecordInput = {
  contentHash: HASH, sourceKind: 'external_drive', fileName: 'AgTech_-_Pricing.pdf', mimeType: 'application/pdf', sizeBytes: 465038,
  storageKey: `${HASH}.pdf`, driveFileId: 'drive123456', driveModifiedTime: '2024-05-20T23:04:00.000Z',
  analysis: {
    title: 'Advanced Econometric Pricing Model', industry: 'AgTech', year: 2024, clientDescriptor: 'a major agriculture science company',
    summary: 'A hybrid pricing model.', problem: null, approach: null, outcomes: [], techStack: [],
    metrics: [{ label: 'Wavelength bands', value: '5', verified: false }, { label: 'Regions', value: 'several', verified: false }],
    capabilities: ['Pricing optimization'], keywords: ['pricing'], suggestedNaics: ['541511'],
  },
  analysisError: null, actor: 'ali@colaberry.com',
};

beforeEach(() => { jest.clearAllMocks(); order.length = 0; for (const k of Object.keys(calls)) delete calls[k]; });

describe('createOutsideRecord', () => {
  it('writes all five rows inside ONE transaction, the idempotency row last', async () => {
    const out = await createOutsideRecord(base);
    expect(out).toEqual({ caseStudyId: 'cs1', slug: 'advanced-econometric-pricing-model-ab12cd34', title: 'Advanced Econometric Pricing Model' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['case_studies', 'case_study_artifacts', 'case_study_evidence', 'case_study_metrics', 'case_study_external_imports']);
    for (const name of order) expect(calls[name][1]).toEqual({ transaction: TX });
  });

  it('makes a private, anonymized DRAFT with the outside source kind', async () => {
    await createOutsideRecord(base);
    expect(calls.case_studies[0]).toMatchObject({
      status: 'draft', source_type: 'external_drive', visibility: 'private', organization_is_anonymized: true,
      organization_identity_mode: 'anonymized', organization_naming_consent: false,
      organization_display_name: 'a major agriculture science company', industry: 'AgTech', primary_capability: 'Pricing optimization',
      created_by: 'ali@colaberry.com',
    });
  });

  it('attaches the original as a file artifact pointing at the Drive id, and writes outside-document provenance', async () => {
    await createOutsideRecord(base);
    expect(calls.case_study_artifacts[0]).toMatchObject({ case_study_id: 'cs1', source_type: 'file', source_ref: 'drive123456', artifact_type: 'document', visibility: 'private', status: 'candidate' });
    expect(calls.case_study_evidence[0]).toMatchObject({
      source_type: 'artifact', source_ref: 'art1', verification_class: 'pending', is_publicly_openable: false,
      metadata: expect.objectContaining({ provenance: 'outside_document', content_hash: HASH, analysis_status: 'analyzed' }),
    });
  });

  it('writes every extracted figure as a PENDING, self-reported, unpublishable metric', async () => {
    await createOutsideRecord(base);
    const rows = calls.case_study_metrics[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toMatchObject({ verification_class: 'pending', verification_method: 'self', publishable: false, is_headline: false });
    expect(rows.map((r) => r.metric_key)).toEqual(['outside-claim-1', 'outside-claim-2']);
  });

  it('fail-soft draft: no analysis -> title from the file name, storage key as source_ref, no metric rows, error recorded', async () => {
    await createOutsideRecord({ ...base, analysis: null, analysisError: 'scanned', driveFileId: null, sourceKind: 'external_document' });
    expect(calls.case_studies[0]).toMatchObject({ title: 'AgTech - Pricing', canonical_summary: null, organization_display_name: null });
    expect(calls.case_study_artifacts[0]).toMatchObject({ source_ref: `${HASH}.pdf` });
    expect(order).not.toContain('case_study_metrics');
    expect(calls.case_study_external_imports[0]).toMatchObject({ analysis_status: 'failed', analysis_error: 'scanned', analysis: null });
  });

  it('propagates a unique violation from the import row so the caller can report alreadyImported', async () => {
    impCreate.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' })));
    await expect(createOutsideRecord(base)).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
  });
});

describe('helpers', () => {
  it('titleFromFileName and outsideSlug are deterministic and bounded', () => {
    expect(titleFromFileName('AgTech_-_Advanced_Econometric_Pricing_Model.pdf')).toBe('AgTech - Advanced Econometric Pricing Model');
    expect(titleFromFileName('.pdf')).toBe('Outside case study');
    expect(outsideSlug('X'.repeat(400), HASH).length).toBeLessThanOrEqual(160);
    expect(outsideSlug('Same Title', HASH)).toBe(outsideSlug('Same Title', HASH));
  });

  it('findExistingImport looks up by hash, or by Drive id AND modifiedTime', async () => {
    impFindOne.mockResolvedValueOnce({ case_study_id: 'cs9', content_hash: HASH }).mockResolvedValueOnce(null);
    expect(await findExistingImport({ contentHash: HASH })).toEqual({ caseStudyId: 'cs9', contentHash: HASH });
    expect(await findExistingImport({ driveFileId: 'd1', driveModifiedTime: '2024-05-20T00:00:00Z' })).toBeNull();
    expect(impFindOne.mock.calls[1][0]).toEqual({ where: { drive_file_id: 'd1', drive_modified_time: new Date('2024-05-20T00:00:00Z') } });
  });
});
