/**
 * GET /api/admin/factory/case-studies/:caseStudyId/source-file - the original document behind an outside case study.
 * Real files in a temp directory; the import row lookup is mocked so no database is needed.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-source-'));
const HASH = 'a'.repeat(64);
fs.writeFileSync(path.join(DIR, `${HASH}.pdf`), '%PDF-1.4 test');
fs.writeFileSync(path.join(DIR, `${'b'.repeat(64)}.docx`), 'docx bytes');
fs.writeFileSync(path.join(os.tmpdir(), 'cs-source-secret.txt'), 'outside the storage dir');

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../../../services/caseStudy/caseStudyOutsideIntake', () => ({ CASE_STUDY_EXTERNAL_DIR: DIR }));
const findOne = jest.fn();
jest.mock('../../../models/CaseStudyExternalImport', () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => findOne(...a) } }));

import express from 'express';
import request from 'supertest';
import routes, { disposition } from '../caseStudySourceFileRoutes';
import { findSourceFile, resolveStorageKey } from '../../../services/caseStudy/caseStudySourceFile';

const app = express();
app.use(routes);
const ID = '11111111-1111-4111-8111-111111111111';
const url = (id = ID, q = ''): string => `/api/admin/factory/case-studies/${id}/source-file${q}`;

beforeEach(() => findOne.mockReset());

describe('source-file route', () => {
  it('serves an outside PDF inline, under its imported filename', async () => {
    findOne.mockResolvedValue({ storage_key: `${HASH}.pdf`, original_filename: 'Energy Demand Forecasting.pdf' });
    const r = await request(app).get(url());
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(r.headers['content-disposition']).toMatch(/^inline; filename="Energy Demand Forecasting.pdf"/);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { case_study_id: ID } }));
  });

  it('?download=1 sends the PDF as an attachment; a DOCX is always an attachment', async () => {
    findOne.mockResolvedValue({ storage_key: `${HASH}.pdf`, original_filename: 'a.pdf' });
    expect((await request(app).get(url(ID, '?download=1'))).headers['content-disposition']).toMatch(/^attachment;/);
    findOne.mockResolvedValue({ storage_key: `${'b'.repeat(64)}.docx`, original_filename: 'b.docx' });
    const r = await request(app).get(url());
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/^attachment;/);
  });

  it('an inside case study (no import row) is a 404 with a sentence', async () => {
    findOne.mockResolvedValue(null);
    const r = await request(app).get(url());
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/no original document/);
  });

  it('a stored key that tries to leave the directory is a 404, never a read', async () => {
    for (const key of ['../cs-source-secret.txt', '/etc/passwd', `${HASH}.exe`, `../${HASH}.pdf`, null]) {
      findOne.mockResolvedValue({ storage_key: key, original_filename: 'x' });
      expect((await request(app).get(url())).status).toBe(404);
    }
  });

  it('a well-formed key whose file is gone is a 404', async () => {
    findOne.mockResolvedValue({ storage_key: `${'c'.repeat(64)}.pdf`, original_filename: 'gone.pdf' });
    expect((await request(app).get(url())).status).toBe(404);
  });

  it('a malformed id is a 400 and never reaches the database', async () => {
    expect((await request(app).get(url('not-a-uuid'))).status).toBe(400);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('a database failure is a logged 500, not a crash', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    findOne.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const r = await request(app).get(url());
    expect(r.status).toBe(500);
    expect(log.mock.calls[0][0]).toContain('case_study_source_file_failed');
    log.mockRestore();
  });

  it('is idempotent: the same request twice gives the same bytes', async () => {
    findOne.mockResolvedValue({ storage_key: `${HASH}.pdf`, original_filename: 'a.pdf' });
    const [a, b] = [await request(app).get(url()), await request(app).get(url())];
    expect(a.body).toEqual(b.body);
  });
});

describe('helpers', () => {
  it('disposition keeps non-ASCII names safe for the header', () => {
    expect(disposition('inline', 'Café · Report.pdf')).toBe(`inline; filename="Caf_ _ Report.pdf"; filename*=UTF-8''${encodeURIComponent('Café · Report.pdf')}`);
  });
  it('resolveStorageKey accepts only hash-named files inside the directory', () => {
    expect(resolveStorageKey(DIR, `${HASH}.pdf`)).toBe(path.resolve(DIR, `${HASH}.pdf`));
    expect(resolveStorageKey(DIR, `${HASH.slice(1)}.pdf`)).toBeNull();
  });
  it('findSourceFile marks only PDFs as viewable in the page', async () => {
    const f = await findSourceFile(ID, { findImport: async () => ({ storage_key: `${'b'.repeat(64)}.docx`, original_filename: '' }), dir: DIR, exists: async () => true });
    expect(f).toMatchObject({ inline: false, filename: `${'b'.repeat(64)}.docx` });
  });
});
