/**
 * The single-file outside import: idempotency, fail-soft, and the concurrent-duplicate race. The record writer and
 * the lookup are mocked here (their SQL is exercised for real in caseStudyOutsideIntake.integration.test.ts); the
 * parser, the LLM and the suggestion pass are injected stubs. No network, no OpenAI.
 */
const createOutsideRecord = jest.fn();
const findExistingImport = jest.fn();
jest.mock('../caseStudyOutsideRecord', () => ({
  createOutsideRecord: (...a: unknown[]) => createOutsideRecord(...a),
  findExistingImport: (...a: unknown[]) => findExistingImport(...a),
}));

import fs from 'fs';
import path from 'path';
import { importOutsideFile, sha256 } from '../caseStudyOutsideIntake';
import type { OutsideCaseStudyAnalysis } from '../caseStudyOutsideAnalysis';

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'outside-case-studies', 'AgTech_-_Advanced_Econometric_Pricing_Model.pdf'));
const HASH = sha256(FIXTURE);
const ctx = { tenantId: 't1', actor: 'ali@colaberry.com', correlationId: 'corr-1' };
const analysis: OutsideCaseStudyAnalysis = {
  title: 'Advanced Econometric Pricing Model', industry: 'AgTech', year: 2024, clientDescriptor: 'a major agriculture science company',
  summary: 'A hybrid pricing model.', problem: null, approach: null, outcomes: [], techStack: ['XGBoost'],
  metrics: [{ label: 'Wavelength bands', value: '5', verified: false }], capabilities: ['Pricing optimization'],
  keywords: ['pricing'], suggestedNaics: ['541511'],
};
const file = { bytes: FIXTURE, fileName: 'AgTech_-_Advanced_Econometric_Pricing_Model.pdf', mimeType: 'application/pdf', sourceKind: 'external_document' as const };

function deps(over: Record<string, unknown> = {}) {
  return {
    extract: jest.fn().mockResolvedValue({ ok: true, text: 'Econometric Pricing Model', truncated: false, errorClass: null, error: null }),
    analyze: jest.fn().mockResolvedValue({ analysis, cached: false, error: null, errorClass: null }),
    storeOriginal: jest.fn().mockResolvedValue(undefined),
    suggest: jest.fn().mockResolvedValue({ inserted: 2 }),
    ...over,
  };
}

let logSpy: jest.SpyInstance; let errSpy: jest.SpyInstance; let warnSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  findExistingImport.mockResolvedValue(null);
  createOutsideRecord.mockResolvedValue({ caseStudyId: 'cs-new', slug: 'advanced-econometric-pricing-model-1234abcd', title: analysis.title });
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { logSpy.mockRestore(); errSpy.mockRestore(); warnSpy.mockRestore(); });

describe('importOutsideFile', () => {
  it('creates a draft from the AgTech fixture, stores it by hash, and runs the suggestion pass', async () => {
    const d = deps();
    const res = await importOutsideFile(file, ctx, d);
    expect(res).toMatchObject({ status: 'created', alreadyImported: false, caseStudyId: 'cs-new', analysisError: null, suggestionsInserted: 2 });
    expect(d.storeOriginal).toHaveBeenCalledWith(`${HASH}.pdf`, FIXTURE);
    expect(createOutsideRecord).toHaveBeenCalledWith(expect.objectContaining({
      contentHash: HASH, sourceKind: 'external_document', storageKey: `${HASH}.pdf`, analysis, analysisError: null, actor: ctx.actor,
    }));
    expect(d.suggest).toHaveBeenCalledWith({ caseStudyId: 'cs-new', tenantId: 't1', suggestedBy: 'outside-intake:ali@colaberry.com' });
    expect(JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]))).toMatchObject({ event: 'case_study_outside_import', outcome: 'success', correlation_id: 'corr-1' });
  });

  it('a second import of the same bytes returns alreadyImported and does NOTHING else', async () => {
    findExistingImport.mockResolvedValue({ caseStudyId: 'cs-old', contentHash: HASH });
    const d = deps();
    const res = await importOutsideFile(file, ctx, d);
    expect(res).toMatchObject({ status: 'already_imported', alreadyImported: true, caseStudyId: 'cs-old' });
    expect(findExistingImport).toHaveBeenCalledWith({ contentHash: HASH });
    for (const fn of [d.storeOriginal, d.extract, d.analyze, d.suggest]) expect(fn).not.toHaveBeenCalled();
    expect(createOutsideRecord).not.toHaveBeenCalled();
  });

  it('LLM failure still creates the draft, with analysisError and analysis null', async () => {
    const d = deps({ analyze: jest.fn().mockResolvedValue({ analysis: null, cached: false, error: 'The AI analysis could not be generated right now.', errorClass: 'UpstreamError' }) });
    const res = await importOutsideFile(file, ctx, d);
    expect(res).toMatchObject({ status: 'created', analysisError: 'The AI analysis could not be generated right now.' });
    expect(createOutsideRecord).toHaveBeenCalledWith(expect.objectContaining({ analysis: null, analysisError: expect.any(String) }));
    expect(JSON.parse(String(warnSpy.mock.calls.at(-1)?.[0]))).toMatchObject({ outcome: 'partial' });
  });

  it('a parse failure skips the LLM and still creates the draft with the parse reason', async () => {
    const d = deps({ extract: jest.fn().mockResolvedValue({ ok: false, text: '', truncated: false, errorClass: 'NoText', error: 'No extractable text - scanned.' }) });
    const res = await importOutsideFile(file, ctx, d);
    expect(res).toMatchObject({ status: 'created', analysisError: 'No extractable text - scanned.' });
    expect(d.analyze).not.toHaveBeenCalled();
  });

  it('a concurrent duplicate (unique violation) is reported as already imported, not as a failure', async () => {
    createOutsideRecord.mockRejectedValue(Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' }));
    findExistingImport.mockResolvedValueOnce(null).mockResolvedValueOnce({ caseStudyId: 'cs-winner', contentHash: HASH });
    const res = await importOutsideFile(file, ctx, deps());
    expect(res).toMatchObject({ status: 'already_imported', alreadyImported: true, caseStudyId: 'cs-winner' });
  });

  it('a database failure is one failed result with a fixed sentence - it never throws', async () => {
    createOutsideRecord.mockRejectedValue(new Error('connection terminated: password=hunter2'));
    const res = await importOutsideFile(file, ctx, deps());
    expect(res).toMatchObject({ status: 'failed', errorClass: 'DatabaseError', caseStudyId: null });
    expect(res.error).not.toMatch(/hunter2/);
  });

  it('a failed suggestion pass is fail-soft: the draft still lands in Intake', async () => {
    const res = await importOutsideFile(file, ctx, deps({ suggest: jest.fn().mockRejectedValue(new Error('db blip')) }));
    expect(res).toMatchObject({ status: 'created', suggestionsInserted: null, error: null });
    expect(JSON.parse(String(warnSpy.mock.calls[0][0]))).toMatchObject({ event: 'case_study_outside_suggest_failed' });
  });

  it('refuses an unsupported type and an empty file before touching storage or the database', async () => {
    const d = deps();
    expect(await importOutsideFile({ ...file, fileName: 'sheet.xlsx', mimeType: 'application/vnd.ms-excel' }, ctx, d)).toMatchObject({ status: 'failed', errorClass: 'UnsupportedType' });
    expect(await importOutsideFile({ ...file, bytes: Buffer.alloc(0) }, ctx, d)).toMatchObject({ status: 'failed', errorClass: 'EmptyFile' });
    expect(d.storeOriginal).not.toHaveBeenCalled();
    expect(findExistingImport).not.toHaveBeenCalled();
  });

  it('a storage failure fails that file without creating a record', async () => {
    const res = await importOutsideFile(file, ctx, deps({ storeOriginal: jest.fn().mockRejectedValue(new Error('ENOSPC')) }));
    expect(res).toMatchObject({ status: 'failed', errorClass: 'StorageError' });
    expect(createOutsideRecord).not.toHaveBeenCalled();
  });
});
