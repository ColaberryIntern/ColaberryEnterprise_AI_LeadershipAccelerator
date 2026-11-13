/**
 * The 413 path of POST /api/admin/factory/case-studies/external, in its own suite because the per-file cap is read
 * when the multer config module loads: the cap is mocked down to 10 bytes here so the real AgTech fixture (465 KB)
 * trips multer's LIMIT_FILE_SIZE exactly as a 51 MB deck would in production.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../../../config/upload', () => ({ DOCUMENT_UPLOAD_MAX_BYTES: 10 }));
// Its own temp directory: the main route suite asserts on the shared one, and jest runs the two in parallel.
jest.mock('os', () => {
  const actual = jest.requireActual('os');
  const own = jest.requireActual('fs').mkdtempSync(jest.requireActual('path').join(actual.tmpdir(), 'csx-limits-'));
  return { ...actual, tmpdir: () => own };
});
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: () => (req: { admin?: unknown }, _res: unknown, next: () => void) => { req.admin = { email: 'ali@colaberry.com' }; next(); },
}));
const lookupGovContractsContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: () => lookupGovContractsContainer() }));
const importUploadedFiles = jest.fn();
jest.mock('../../../services/caseStudy/caseStudyOutsideIntakeBatch', () => ({
  importUploadedFiles: (...a: unknown[]) => importUploadedFiles(...a), importDriveFile: jest.fn(), importDriveFolder: jest.fn(),
}));
jest.mock('../../../services/caseStudy/caseStudyIntakeQueue', () => ({ listIntakeCaseStudies: jest.fn() }));

import express from 'express';
import request from 'supertest';
import routes from '../caseStudyOutsideIntakeRoutes';
import { CASE_STUDY_EXTERNAL_TMP_DIR } from '../../../config/caseStudyExternalUpload';

const app = express();
app.use(express.json());
app.use(routes);
const FIXTURE = path.join(__dirname, '..', '..', '..', 'services', 'caseStudy', '__tests__', 'fixtures', 'outside-case-studies', 'AgTech_-_Advanced_Econometric_Pricing_Model.pdf');

describe('POST /external - over the per-file cap', () => {
  it('answers 413 with a sentence, imports nothing, and leaves no temp file behind', async () => {
    lookupGovContractsContainer.mockResolvedValue({ tenant: { id: 't1' } });
    const before = fs.readdirSync(CASE_STUDY_EXTERNAL_TMP_DIR).length;
    const res = await request(app).post('/api/admin/factory/case-studies/external').attach('files', FIXTURE);
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Each file must be 50 MB or smaller.' });
    expect(importUploadedFiles).not.toHaveBeenCalled();
    // The partial file must not survive. Its write stream can still be closing when the 413 is sent, so the
    // removal (the route's tracked-path delete, then multer's own cleanup once its pending write settles) is
    // polled for up to 3 s rather than asserted at one instant. A real leak still fails this.
    const deadline = Date.now() + 3000;
    while (fs.readdirSync(CASE_STUDY_EXTERNAL_TMP_DIR).length !== before && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(fs.readdirSync(CASE_STUDY_EXTERNAL_TMP_DIR).length).toBe(before);
  });
});
