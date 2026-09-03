import express from 'express';
import request from 'supertest';

/**
 * The repository PATCH endpoint, which now carries TWO fields.
 *
 * WHY THIS FILE. `PATCH .../repositories/:repositoryId` used to require `role`.
 * It now accepts `role`, `pathScope`, or both, and the interesting cases are the
 * ones a happy-path test never reaches:
 *
 *   · an EMPTY body. Before the schema's `.refine`, `{}` was a valid request
 *     that changed nothing and answered 200 — which an admin reads as "saved".
 *     That is the worst possible outcome for a field whose whole purpose is to
 *     narrow what a published Case Study claims to be about.
 *   · `pathScope: []`, which must be ACCEPTED, because it is how a scope is
 *     cleared. A schema that rejects empty arrays as "missing" makes a wrong
 *     scope permanent.
 *   · both fields at once, where the ORDER matters: setting the role may demote
 *     another repository, so the scope must be applied second for the returned
 *     record to reflect everything the caller asked for.
 *
 * Auth is stubbed to a pass-through here on purpose — `caseStudyAdminRoutes.access.test.ts`
 * already proves this route family is guarded and section-gated with the REAL
 * middleware. Repeating that here would test the stub.
 */

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAnyAdmin: jest.fn(),
  requireSalesOrAdmin: jest.fn(),
  requireSection: jest.fn(() => jest.fn()),
}));

const setRepositoryRole = jest.fn();
const setRepositoryPathScope = jest.fn();

jest.mock('../../../services/caseStudy/caseStudyRepoCollection', () => ({
  CASE_STUDY_REPO_ROLES: [
    'primary', 'frontend', 'backend', 'agents', 'data', 'infra', 'docs', 'evals', 'demo', 'other',
  ] as const,
  attachRepository: jest.fn(),
  listRepositories: jest.fn(),
  removeRepository: jest.fn(),
  setRepositoryRole: (...a: unknown[]) => setRepositoryRole(...a),
  setRepositoryPathScope: (...a: unknown[]) => setRepositoryPathScope(...a),
  isCaseStudyRepoError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyAdminService', () => ({
  listCaseStudies: jest.fn(), getCaseStudy: jest.fn(),
  createCaseStudyFromProject: jest.fn(), createCaseStudyFromRepoCollection: jest.fn(),
  updateCaseStudy: jest.fn(), archiveCaseStudy: jest.fn(),
  isCaseStudyAdminError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyAdminReview', () => ({
  applyHumanOverride: jest.fn(), approveSnapshot: jest.fn(),
  listSyncRuns: jest.fn(), previewSurfaceProjection: jest.fn(),
}));
jest.mock('../../../services/caseStudy/caseStudySyncService', () => ({
  syncCaseStudy: jest.fn(), isCaseStudySyncError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyPublicationService', () => ({
  publishCaseStudy: jest.fn(), unpublishCaseStudy: jest.fn(),
  isCaseStudyPublicationError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyProjectSource', () => ({
  isCaseStudyProjectSourceError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyEvidenceSource', () => ({
  isCaseStudyEvidenceSourceError: () => false,
}));

import caseStudyAdminRoutes from '../caseStudyAdminRoutes';
// The CONSTANT, never a literal: a hardcoded 21 silently stopped being
// over the bound the moment the bound moved, and the test then asserted
// nothing while still passing.
import { MAX_SCOPE_PREFIXES } from '../../../services/caseStudy/repoPathScope';

const ID = '11111111-1111-4111-8111-111111111111';
const REPO = '33333333-3333-4333-8333-333333333333';
const URL = `/api/admin/case-studies/${ID}/repositories/${REPO}`;

const app = express();
app.use(express.json());
app.use(caseStudyAdminRoutes);

const RECORD = { id: REPO, collectionId: 'c1', repoOwner: 'acme', repoName: 'monorepo' };

beforeEach(() => {
  jest.clearAllMocks();
  setRepositoryRole.mockResolvedValue({ ...RECORD, role: 'primary' });
  setRepositoryPathScope.mockResolvedValue({ ...RECORD, pathScope: ['backend/src'] });
});

describe('PATCH a repository source', () => {
  it('sets the path scope alone', async () => {
    const res = await request(app).patch(URL).send({ pathScope: ['backend/src'] });
    expect(res.status).toBe(200);
    expect(setRepositoryPathScope).toHaveBeenCalledWith(
      expect.objectContaining({ caseStudyId: ID, repositoryId: REPO, pathScope: ['backend/src'] }),
    );
    // The role must NOT be touched by a scope-only request; doing so would reset
    // a deliberately-chosen role every time an admin corrected a path.
    expect(setRepositoryRole).not.toHaveBeenCalled();
  });

  it('still sets the role alone, exactly as before', async () => {
    const res = await request(app).patch(URL).send({ role: 'backend' });
    expect(res.status).toBe(200);
    expect(setRepositoryRole).toHaveBeenCalledWith(expect.objectContaining({ role: 'backend' }));
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
  });

  it('accepts an empty scope, because that is how a scope is CLEARED', async () => {
    setRepositoryPathScope.mockResolvedValue(RECORD);
    const res = await request(app).patch(URL).send({ pathScope: [] });
    expect(res.status).toBe(200);
    expect(setRepositoryPathScope).toHaveBeenCalledWith(
      expect.objectContaining({ pathScope: [] }),
    );
  });

  it('REFUSES an empty body rather than answering 200 to a no-op', async () => {
    const res = await request(app).patch(URL).send({});
    expect(res.status).toBe(400);
    expect(setRepositoryRole).not.toHaveBeenCalled();
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
  });

  it('applies the role first and the scope second when both are sent', async () => {
    const res = await request(app).patch(URL).send({ role: 'primary', pathScope: ['backend/src'] });
    expect(res.status).toBe(200);
    expect(setRepositoryRole).toHaveBeenCalled();
    expect(setRepositoryPathScope).toHaveBeenCalled();
    // Ordering, asserted by invocation order rather than by reading the handler:
    // the role change may demote a sibling, so the scope write must come last for
    // the returned record to be the final state.
    expect(setRepositoryRole.mock.invocationCallOrder[0])
      .toBeLessThan(setRepositoryPathScope.mock.invocationCallOrder[0]);
    expect(res.body).toEqual(expect.objectContaining({ pathScope: ['backend/src'] }));
  });

  it('refuses more prefixes than the bound allows', async () => {
    const res = await request(app).patch(URL)
      .send({ pathScope: Array.from({ length: MAX_SCOPE_PREFIXES + 1 }, (_, i) => `dir${i}`) });
    expect(res.status).toBe(400);
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
  });

  it('refuses a prefix that is only whitespace', async () => {
    // Trimmed to empty, and an empty prefix matches EVERY path — a scope that
    // silently means "the whole repository" while looking scoped in the admin UI.
    const res = await request(app).patch(URL).send({ pathScope: ['   '] });
    expect(res.status).toBe(400);
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
  });
});
