/**
 * A refused override of a validated section reaches the wire with the
 * validator's per-field refusals, not only a sentence.
 *
 * WHY THIS TEST EXISTS. The review desk's `sendError` serialised a tagged
 * error as `{error, error_class}` and nothing else, so the visual story
 * validator's `details.errors[{path, code, message}]` (the whole point of
 * validating on the way in) never left the server, and the Studio panel that
 * prints them beside their rows had nothing to print. The T12 verifier found
 * the gap by tracing the path end to end; this is the assertion that keeps it
 * closed. The service is mocked to throw the REAL error class, so the route's
 * own `isTagged` and `sendError` are what is exercised.
 */

/* eslint-disable import/first */
// `databaseUrl` because `caseStudyAdminStore` (required for the real error class)
// reaches `models` -> `config/database`, which constructs Sequelize at load. It never connects.
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', databaseUrl: 'postgres://mock:mock@localhost:5432/mock' } }));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

const applyHumanOverride = jest.fn();
const publishCaseStudy = jest.fn();

jest.mock('../../../services/caseStudy/caseStudyRepoCollection', () => ({
  CASE_STUDY_REPO_ROLES: ['primary', 'frontend', 'backend', 'agents', 'data', 'infra', 'docs', 'evals', 'demo', 'other'] as const,
  attachRepository: jest.fn(), listRepositories: jest.fn(), removeRepository: jest.fn(),
  setRepositoryRole: jest.fn(), setRepositoryPathScope: jest.fn(), isCaseStudyRepoError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyAdminService', () => {
  // The real predicate, so the route recognises the real error class thrown below.
  const store = jest.requireActual('../../../services/caseStudy/caseStudyAdminStore');
  return {
    listCaseStudies: jest.fn(), getCaseStudy: jest.fn(), createCaseStudyFromProject: jest.fn(),
    createCaseStudyFromRepoCollection: jest.fn(), updateCaseStudy: jest.fn(), archiveCaseStudy: jest.fn(),
    isCaseStudyAdminError: store.isCaseStudyAdminError,
  };
});
jest.mock('../../../services/caseStudy/caseStudyAdminReview', () => ({
  applyHumanOverride: (...a: unknown[]) => applyHumanOverride(...a),
  approveSnapshot: jest.fn(), listSyncRuns: jest.fn(), previewSurfaceProjection: jest.fn(),
}));
jest.mock('../../../services/caseStudy/caseStudySyncService', () => ({ syncCaseStudy: jest.fn(), isCaseStudySyncError: () => false }));
jest.mock('../../../services/caseStudy/caseStudyPublicationService', () => {
  const actual = jest.requireActual('../../../services/caseStudy/caseStudyPublicationService');
  return {
    publishCaseStudy: (...a: unknown[]) => publishCaseStudy(...a), unpublishCaseStudy: jest.fn(),
    isCaseStudyPublicationError: actual.isCaseStudyPublicationError,
  };
});
jest.mock('../../../services/caseStudy/caseStudyProjectSource', () => ({ isCaseStudyProjectSourceError: () => false }));
jest.mock('../../../services/caseStudy/caseStudyEvidenceSource', () => ({ isCaseStudyEvidenceSourceError: () => false }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import caseStudyAdminRoutes from '../caseStudyAdminRoutes';
import { CaseStudyAdminError } from '../../../services/caseStudy/caseStudyAdminStore';
/* eslint-enable import/first */

const ID = '11111111-1111-4111-8111-111111111111';
const app = express();
app.use(express.json());
app.use(caseStudyAdminRoutes);
const ADMIN = jwt.sign({ sub: 'staff-1', email: 'staff@example.test', role: 'admin' }, 'test-secret');

beforeEach(() => { jest.clearAllMocks(); });

describe('POST /api/admin/case-studies/:id/overrides, refused by the visual story validator', () => {
  it('answers 400 with the validator errors verbatim and the path that was being written', async () => {
    applyHumanOverride.mockRejectedValue(new CaseStudyAdminError('ValidationError',
      'The visual story was not saved: 2 problem(s), the first at "workflow.panels[1].nodes[3]": unreachable',
      {
        path: 'visualStory',
        errors: [
          { path: 'workflow.panels[1].nodes[3]', code: 'node_unreachable', message: 'no path from the initial step reaches "advance"' },
          { path: 'charts[0].parts[1].denominator', code: 'comparison_bar_needs_denominator', message: 'a literal bar needs its denominator' },
        ],
      }));
    const res = await request(app).post(`/api/admin/case-studies/${ID}/overrides`)
      .set('Authorization', `Bearer ${ADMIN}`).send({ path: 'visualStory', value: { schemaVersion: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(res.body.path).toBe('visualStory');
    expect(res.body.errors).toEqual([
      expect.objectContaining({ path: 'workflow.panels[1].nodes[3]', code: 'node_unreachable' }),
      expect.objectContaining({ path: 'charts[0].parts[1].denominator', code: 'comparison_bar_needs_denominator' }),
    ]);
  });

  it('carries no errors key when the refusal has none, so the body shape is stable for every other tagged error', async () => {
    applyHumanOverride.mockRejectedValue(new CaseStudyAdminError('CaseStudyNotFound', 'No such Case Study.', { case_study_id: ID }));
    const res = await request(app).post(`/api/admin/case-studies/${ID}/overrides`)
      .set('Authorization', `Bearer ${ADMIN}`).send({ path: 'identity.title', value: 'X' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No such Case Study.', error_class: 'CaseStudyNotFound' });
  });
});
