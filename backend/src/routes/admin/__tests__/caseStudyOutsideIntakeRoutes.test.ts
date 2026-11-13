/**
 * The outside-intake admin API: auth, validation, tenant scope, real multipart parsing of the AgTech fixture, and
 * per-file results. The batch services are mocked (they have their own suites); multer and Zod run for real.
 *
 * The guard mock enforces a bearer header, so "unauthenticated -> 401" is exercised for every route, and a source
 * check at the bottom asserts each route declaration carries `requireSection('program')` itself (the CI lint is
 * per FILE; see caseStudyServiceLinkRoutes.test.ts for why that is not enough).
 */
import fs from 'fs';
import path from 'path';

const requireSection = jest.fn((_section: string) => (req: any, res: any, next: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- express middleware stub
  if (!req.headers.authorization) { res.status(401).json({ error: 'Authentication required' }); return; }
  req.admin = { email: 'ali@colaberry.com' };
  next();
});
jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: (s: string) => requireSection(s) }));

const lookupGovContractsContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: () => lookupGovContractsContainer() }));

const importUploadedFiles = jest.fn();
const importDriveFile = jest.fn();
const importDriveFolder = jest.fn();
jest.mock('../../../services/caseStudy/caseStudyOutsideIntakeBatch', () => ({
  importUploadedFiles: (...a: unknown[]) => importUploadedFiles(...a),
  importDriveFile: (...a: unknown[]) => importDriveFile(...a),
  importDriveFolder: (...a: unknown[]) => importDriveFolder(...a),
}));
const listIntakeCaseStudies = jest.fn();
jest.mock('../../../services/caseStudy/caseStudyIntakeQueue', () => ({ listIntakeCaseStudies: (...a: unknown[]) => listIntakeCaseStudies(...a) }));

import express from 'express';
import request from 'supertest';
import routes from '../caseStudyOutsideIntakeRoutes';
import { CASE_STUDY_EXTERNAL_TMP_DIR } from '../../../config/caseStudyExternalUpload';

const app = express();
app.use(express.json());
app.use(routes);

const URL = '/api/admin/factory/case-studies/external';
const FIXTURE = path.join(__dirname, '..', '..', '..', 'services', 'caseStudy', '__tests__', 'fixtures', 'outside-case-studies', 'AgTech_-_Advanced_Econometric_Pricing_Model.pdf');
const AUTH = { Authorization: 'Bearer t' };
const result = (status: string, extra: Record<string, unknown> = {}) => ({ fileName: 'f.pdf', status, alreadyImported: status === 'already_imported', caseStudyId: 'cs1', title: 'T', analysisError: null, suggestionsInserted: 1, error: null, errorClass: null, ...extra });

let errSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  lookupGovContractsContainer.mockResolvedValue({ tenant: { id: 't1' } });
  importUploadedFiles.mockImplementation(async (files: { path: string }[]) => {
    for (const f of files) fs.rmSync(f.path, { force: true }); // what the real batch does
    return { results: files.map(() => result('created')), note: null };
  });
});
afterEach(() => errSpy.mockRestore());

const tmpCountAtStart = fs.readdirSync(CASE_STUDY_EXTERNAL_TMP_DIR).length;
afterAll(() => {
  // No test in this suite may leave an upload behind in the temp dir.
  expect(fs.readdirSync(CASE_STUDY_EXTERNAL_TMP_DIR).length).toBe(tmpCountAtStart);
});

describe('POST /external - uploads', () => {
  it('accepts the real AgTech PDF as multipart and returns per-file results with a summary', async () => {
    const res = await request(app).post(URL).set(AUTH).attach('files', FIXTURE);
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ created: 1, alreadyImported: 0, failed: 0, needsManualDetails: 0 });
    const [files, ctx] = importUploadedFiles.mock.calls[0];
    expect(files[0]).toMatchObject({ originalName: 'AgTech_-_Advanced_Econometric_Pricing_Model.pdf', mimeType: 'application/pdf', size: 465038 });
    expect(ctx).toMatchObject({ tenantId: 't1', actor: 'ali@colaberry.com' });
  });

  it('answers 200 with mixed per-file outcomes rather than failing the batch', async () => {
    importUploadedFiles.mockImplementation(async (files: { path: string }[]) => {
      for (const f of files) fs.rmSync(f.path, { force: true }); // what the real batch does
      return { results: [result('created', { analysisError: 'scanned' }), result('already_imported'), result('failed', { error: 'x', errorClass: 'DatabaseError' })], note: null };
    });
    const res = await request(app).post(URL).set(AUTH).attach('files', FIXTURE);
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ created: 1, alreadyImported: 1, failed: 1, needsManualDetails: 1 });
  });

  it('400s an unsupported file type with a sentence, never calling the importer', async () => {
    const res = await request(app).post(URL).set(AUTH).attach('files', Buffer.from('a,b'), 'sheet.csv');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a PDF, DOCX or PPTX/);
    expect(importUploadedFiles).not.toHaveBeenCalled();
  });

  it('400s more than four files', async () => {
    let r = request(app).post(URL).set(AUTH);
    for (let i = 0; i < 5; i += 1) r = r.attach('files', Buffer.from('%PDF-1.4'), `f${i}.pdf`);
    const before = fs.readdirSync(CASE_STUDY_EXTERNAL_TMP_DIR).length;
    const res = await r;
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most 4 files/);
    // The four files multer already wrote before refusing the fifth must not be left in the temp dir.
    expect(fs.readdirSync(CASE_STUDY_EXTERNAL_TMP_DIR).length).toBe(before);
  });

  it('400s files and a Drive id together', async () => {
    const res = await request(app).post(URL).set(AUTH).field('driveFileId', 'abcdefghijk').attach('files', FIXTURE);
    expect(res.status).toBe(400);
    expect(importUploadedFiles).not.toHaveBeenCalled();
  });
});

describe('POST /external - Drive', () => {
  it('imports one Drive file by id', async () => {
    importDriveFile.mockResolvedValue({ results: [result('created')], note: null });
    const res = await request(app).post(URL).set(AUTH).send({ driveFileId: '1AbC_def-GHIjkl' });
    expect(res.status).toBe(200);
    expect(importDriveFile).toHaveBeenCalledWith('1AbC_def-GHIjkl', expect.objectContaining({ tenantId: 't1' }));
  });

  it('imports a Drive folder and passes its note through', async () => {
    importDriveFolder.mockResolvedValue({ results: [], note: 'No PDF, DOCX or PPTX files were found directly in that folder.' });
    const res = await request(app).post(URL).set(AUTH).send({ driveFolderId: 'folder_ABC-123' });
    expect(res.status).toBe(200);
    expect(res.body.note).toMatch(/No PDF/);
  });

  it('400s an empty body, both ids, an unknown key, and an id that could inject into a Drive query', async () => {
    for (const body of [{}, { driveFileId: 'abcdefghijk', driveFolderId: 'abcdefghijk' }, { driveFileId: 'abcdefghijk', extra: 1 },
      { driveFolderId: "x' or name contains 'y" }, { driveFileId: 'short' }]) {
      const res = await request(app).post(URL).set(AUTH).send(body);
      expect(res.status).toBe(400);
    }
    expect(importDriveFile).not.toHaveBeenCalled();
    expect(importDriveFolder).not.toHaveBeenCalled();
  });
});

describe('scope and auth', () => {
  it('503s when the gov workspace cannot be resolved, and deletes the uploaded temp file', async () => {
    lookupGovContractsContainer.mockResolvedValue(null);
    const before = fs.readdirSync(CASE_STUDY_EXTERNAL_TMP_DIR).length;
    const res = await request(app).post(URL).set(AUTH).attach('files', FIXTURE);
    expect(res.status).toBe(503);
    expect(importUploadedFiles).not.toHaveBeenCalled();
    expect(fs.readdirSync(CASE_STUDY_EXTERNAL_TMP_DIR).length).toBe(before);
  });

  it('401s an unauthenticated import and an unauthenticated intake read', async () => {
    expect((await request(app).post(URL).send({ driveFileId: 'abcdefghijk' })).status).toBe(401);
    expect((await request(app).get('/api/admin/factory/case-studies/intake')).status).toBe(401);
    expect(importDriveFile).not.toHaveBeenCalled();
    expect(listIntakeCaseStudies).not.toHaveBeenCalled();
  });

  it('every route declaration carries its own requireSection(program)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'caseStudyOutsideIntakeRoutes.ts'), 'utf8');
    const declarations = src.match(/router\.(get|post|put|patch|delete)\([\s\S]*?async \(/g) ?? [];
    expect(declarations.length).toBe(2);
    expect(declarations.filter((d) => !d.includes("requireSection('program')"))).toEqual([]);
  });
});

describe('GET /intake', () => {
  it("lists the tenant's intake queue", async () => {
    listIntakeCaseStudies.mockResolvedValue([{ id: 'cs1', suggestions: [] }]);
    const res = await request(app).get('/api/admin/factory/case-studies/intake').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.intake).toHaveLength(1);
    expect(listIntakeCaseStudies).toHaveBeenCalledWith({ tenantId: 't1' });
  });

  it('503s without a workspace and 500s (fixed sentence) on a failure', async () => {
    lookupGovContractsContainer.mockResolvedValueOnce(null);
    expect((await request(app).get('/api/admin/factory/case-studies/intake').set(AUTH)).status).toBe(503);
    listIntakeCaseStudies.mockRejectedValue(new Error('secret detail'));
    const res = await request(app).get('/api/admin/factory/case-studies/intake').set(AUTH);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret detail/);
  });
});
