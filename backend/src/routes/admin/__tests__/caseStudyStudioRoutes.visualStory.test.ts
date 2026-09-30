/**
 * The Studio's visual-story routes: refused without an admin, 404 for a record
 * the service cannot find, and the documented payload shape on success. The
 * service is mocked; the router's job is to parse, call and map, and that is
 * all that is asserted here.
 */

/* eslint-disable import/first */
jest.mock('../../../config/env', () => ({
  env: { jwtSecret: 'test-secret', nodeEnv: 'test', databaseUrl: 'postgres://mock:mock@localhost:5432/mock' },
}));
jest.mock('../../../services/caseStudy/caseStudyStoryline', () => ({ clearStoryline: jest.fn(), getStoryline: jest.fn(), saveStoryline: jest.fn() }));
jest.mock('../../../services/caseStudy/caseStudyRepoProof', () => ({ proveRepository: jest.fn() }));
jest.mock('../../../services/caseStudy/caseStudyStoryDraftGenerator', () => ({ generateStoryDraft: jest.fn() }));
jest.mock('../../../services/caseStudy/caseStudyAiDraftStore', () => ({ listDrafts: jest.fn(), promoteDraft: jest.fn(), proposeDrafts: jest.fn(), rejectDraft: jest.fn() }));
jest.mock('../../../services/caseStudy/caseStudyArtifactPromotion', () => ({ listArtifacts: jest.fn(), setArtifactStatus: jest.fn() }));
jest.mock('../../../services/caseStudy/caseStudyChartService', () => ({ listCharts: jest.fn(), resolveChart: jest.fn(), saveChart: jest.fn(), setChartApproval: jest.fn() }));
jest.mock('../../../services/caseStudy/caseStudyQuoteService', () => ({ createQuote: jest.fn(), listQuotes: jest.fn(), setQuoteApproval: jest.fn() }));

const draftVisualStory = jest.fn();
const readVisualStoryState = jest.fn();
jest.mock('../../../services/caseStudy/caseStudyVisualStoryService', () => ({
  draftVisualStory: (...a: unknown[]) => draftVisualStory(...a),
  readVisualStoryState: (...a: unknown[]) => readVisualStoryState(...a),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { CaseStudyAdminError } from '../../../services/caseStudy/caseStudyAdminStore';
import caseStudyStudioRoutes from '../caseStudyStudioRoutes';
/* eslint-enable import/first */

const CS = '55555555-5555-4555-8555-555555555555';
const READ = `/api/admin/case-studies/${CS}/visual-story`;
const GENERATE = `/api/admin/case-studies/${CS}/visual-story/generate`;

const app = express();
app.use(express.json());
app.use(caseStudyStudioRoutes);

const ADMIN = jwt.sign({ sub: 'admin-1', email: 'admin@example.test', role: 'admin' }, 'test-secret', { expiresIn: '10m' });
const STUDENT = jwt.sign({ sub: 'u1', email: 'student@example.test', role: 'student' }, 'test-secret', { expiresIn: '10m' });

const state = {
  snapshotId: 'snap-1', version: 3, current: null, stale: false,
  validation: { ok: true, errors: [] }, limits: { nodesPerPanel: 16 },
};

beforeEach(() => { jest.clearAllMocks(); });

describe('visual-story routes', () => {
  it('refuse an unauthenticated and a non-admin caller before calling the service', async () => {
    expect((await request(app).get(READ)).status).toBe(401);
    expect((await request(app).post(GENERATE)).status).toBe(401);
    expect((await request(app).get(READ).set('Authorization', `Bearer ${STUDENT}`)).status).toBe(403);
    expect((await request(app).post(GENERATE).set('Authorization', `Bearer ${STUDENT}`)).status).toBe(403);
    expect(readVisualStoryState).not.toHaveBeenCalled();
    expect(draftVisualStory).not.toHaveBeenCalled();
  });

  it('400 on a malformed id, without calling the service', async () => {
    const res = await request(app).get('/api/admin/case-studies/not-a-uuid/visual-story').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(readVisualStoryState).not.toHaveBeenCalled();
  });

  it('404 with the service error class when the record or snapshot is missing', async () => {
    readVisualStoryState.mockRejectedValue(new CaseStudyAdminError('CaseStudyNotFound', 'No such Case Study.'));
    draftVisualStory.mockRejectedValue(new CaseStudyAdminError('SnapshotNotFound', 'No snapshot.', { case_study_id: CS }));
    const read = await request(app).get(READ).set('Authorization', `Bearer ${ADMIN}`);
    expect(read.status).toBe(404);
    expect(read.body.error_class).toBe('CaseStudyNotFound');
    const gen = await request(app).post(GENERATE).set('Authorization', `Bearer ${ADMIN}`);
    expect(gen.status).toBe(404);
    expect(gen.body).toMatchObject({ error_class: 'SnapshotNotFound', case_study_id: CS });
  });

  it('GET returns the state as the service shaped it', async () => {
    readVisualStoryState.mockResolvedValue(state);
    const res = await request(app).get(READ).set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(state);
    expect(readVisualStoryState).toHaveBeenCalledWith(CS);
  });

  it('POST generate returns draft, reasons, draftValidation and the current state, and takes no body', async () => {
    const draft = { schemaVersion: 1, enabled: false, surfaces: [] };
    draftVisualStory.mockResolvedValue({ ...state, draft, reasons: ['one'], draftValidation: { ok: true, errors: [] } });
    const res = await request(app).post(GENERATE).set('Authorization', `Bearer ${ADMIN}`).send({ anything: 'ignored' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['current', 'draft', 'draftValidation', 'limits', 'reasons', 'snapshotId', 'stale', 'validation', 'version']);
    expect(res.body.draft).toEqual(draft);
    expect(draftVisualStory).toHaveBeenCalledWith(CS);
  });
});
