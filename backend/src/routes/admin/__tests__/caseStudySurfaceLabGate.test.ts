/**
 * The surface lab gate — a non-allowlisted admin cannot get a non-enterprise
 * preview.
 *
 * WHY THIS IS PROVED IN TWO PLACES AND NEITHER STANDS IN FOR THE OTHER.
 *
 * 1. BEHAVIOUR. The gate is chained exactly as `adminRoutes.ts` chains it —
 *    path-scoped, `requireAdmin` first, above the real `caseStudyAdminRoutes` —
 *    and the assertions are HTTP status codes through the real middleware. A
 *    passing unit test of the predicate would not catch a gate mounted after the
 *    router it is supposed to guard.
 * 2. WIRING. `adminRoutes.ts` is read as SOURCE, the same technique
 *    `adminRoutesMountOrder.test.ts` uses, because Express flattens `router.use`
 *    layers into an array whose provenance is not recoverable at runtime. That
 *    suite exists because a one-line reorder in this exact file silently
 *    disabled the section gate and fifty suites stayed green.
 *
 * REAL MIDDLEWARE. `authMiddleware` and the gate are never mocked; mocking
 * either would make this suite assert on itself. What is mocked is `config/env`
 * (a known signing secret and a settable allowlist) and the Case Study services
 * (so importing the router does not drag in the Sequelize model graph).
 */

const envMock: { jwtSecret: string; nodeEnv: string; caseStudySurfaceLabUserIds: string } = {
  jwtSecret: 'test-secret', nodeEnv: 'test', caseStudySurfaceLabUserIds: 'off',
};
jest.mock('../../../config/env', () => ({ env: envMock }));
jest.mock('../../../services/aiEventService', () => ({
  emitAiEvent: jest.fn().mockResolvedValue(undefined),
}));

const previewSurfaceProjection = jest.fn();

jest.mock('../../../services/caseStudy/caseStudyRepoCollection', () => ({
  CASE_STUDY_REPO_ROLES: ['primary', 'other'] as const,
  attachRepository: jest.fn(), listRepositories: jest.fn(),
  removeRepository: jest.fn(), setRepositoryRole: jest.fn(),
  isCaseStudyRepoError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyAdminService', () => ({
  listCaseStudies: jest.fn(), getCaseStudy: jest.fn(),
  createCaseStudyFromProject: jest.fn(), createCaseStudyFromRepoCollection: jest.fn(),
  updateCaseStudy: jest.fn(), archiveCaseStudy: jest.fn(),
  isCaseStudyAdminError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyAdminReview', () => ({
  applyHumanOverride: jest.fn(), approveSnapshot: jest.fn(), listSyncRuns: jest.fn(),
  previewSurfaceProjection: (...a: unknown[]) => previewSurfaceProjection(...a),
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

/* eslint-disable import/first */
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import caseStudyAdminRoutes from '../caseStudyAdminRoutes';
import { requireAdmin } from '../../../middlewares/authMiddleware';
import { caseStudySurfaceLabGate } from '../../../middlewares/caseStudySurfaceLabGate';
/* eslint-enable import/first */

const ID = '11111111-1111-4111-8111-111111111111';
const BASE = '/api/admin/case-studies';

/** The chain `adminRoutes.ts` builds, in the same order, with nothing else in it. */
const app = express();
app.use(express.json());
app.use(`${BASE}/:id/preview`, requireAdmin, caseStudySurfaceLabGate);
app.use(caseStudyAdminRoutes);

const tokenFor = (sub: string): string =>
  jwt.sign({ sub, email: `${sub}@colaberry.com`, role: 'admin' }, 'test-secret');

const ALLOWED = tokenFor('admin-allowed');
const OTHER = tokenFor('admin-other');

beforeEach(() => {
  previewSurfaceProjection.mockReset();
  previewSurfaceProjection.mockResolvedValue({ surfaceKey: 'training', projection: null });
  envMock.caseStudySurfaceLabUserIds = 'off';
});

describe('default OFF — the lab is closed until somebody is named', () => {
  it('refuses a non-enterprise preview for an admin with a perfectly valid token', async () => {
    const res = await request(app)
      .get(`${BASE}/${ID}/preview`).query({ surfaceKey: 'training' })
      .set('Authorization', `Bearer ${OTHER}`);

    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('SurfaceLabNotAuthorized');
    // THE LOAD-BEARING ASSERTION. A 403 whose body still carried the projection
    // would be the preview it is refusing to serve.
    expect(res.body.projection).toBeUndefined();
    expect(res.body.surface).toBeUndefined();
    expect(res.body.decision).toBeUndefined();
    // And the service was never reached at all.
    expect(previewSurfaceProjection).not.toHaveBeenCalled();
  });

  it('refuses every restricted surface, not just the one somebody remembered', async () => {
    for (const surfaceKey of ['training', 'ai-flotation', 'refactored']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .get(`${BASE}/${ID}/preview`).query({ surfaceKey })
        .set('Authorization', `Bearer ${OTHER}`);
      expect(res.status).toBe(403);
    }
    expect(previewSurfaceProjection).not.toHaveBeenCalled();
  });

  it('leaves the enterprise preview working for every admin', async () => {
    // The gate refuses a REQUEST, not a route. Breaking the existing review desk
    // for every admin in order to protect three unpublishable surfaces would be
    // a worse outcome than the one being prevented.
    const res = await request(app)
      .get(`${BASE}/${ID}/preview`).query({ surfaceKey: 'enterprise' })
      .set('Authorization', `Bearer ${OTHER}`);
    expect(res.status).toBe(200);
    expect(previewSurfaceProjection).toHaveBeenCalled();
  });

  it('leaves a preview with NO surfaceKey working — it defaults to enterprise downstream', async () => {
    const res = await request(app)
      .get(`${BASE}/${ID}/preview`).set('Authorization', `Bearer ${OTHER}`);
    expect(res.status).toBe(200);
    expect(previewSurfaceProjection).toHaveBeenCalledWith(
      expect.objectContaining({ surfaceKey: 'enterprise' }),
    );
  });

  it('leaves every other Case Study admin route untouched', async () => {
    const res = await request(app)
      .get(`${BASE}/${ID}/sync-runs`).set('Authorization', `Bearer ${OTHER}`);
    expect(res.status).not.toBe(403);
  });
});

describe('an allowlisted admin', () => {
  it('reaches the restricted surface when their id is on the list', async () => {
    envMock.caseStudySurfaceLabUserIds = 'someone-else,admin-allowed';
    const res = await request(app)
      .get(`${BASE}/${ID}/preview`).query({ surfaceKey: 'training' })
      .set('Authorization', `Bearer ${ALLOWED}`);
    expect(res.status).toBe(200);
    expect(previewSurfaceProjection).toHaveBeenCalledWith(
      expect.objectContaining({ surfaceKey: 'training' }),
    );
  });

  it('does NOT open the lab for a different admin on the same deployment', async () => {
    envMock.caseStudySurfaceLabUserIds = 'admin-allowed';
    const res = await request(app)
      .get(`${BASE}/${ID}/preview`).query({ surfaceKey: 'refactored' })
      .set('Authorization', `Bearer ${OTHER}`);
    expect(res.status).toBe(403);
  });

  it('opens for everyone on "all"', async () => {
    envMock.caseStudySurfaceLabUserIds = 'all';
    const res = await request(app)
      .get(`${BASE}/${ID}/preview`).query({ surfaceKey: 'ai-flotation' })
      .set('Authorization', `Bearer ${OTHER}`);
    expect(res.status).toBe(200);
  });
});

describe('the gate is authorization, not decoration', () => {
  it('answers 401 to an unauthenticated caller before it considers the allowlist', async () => {
    envMock.caseStudySurfaceLabUserIds = 'all';
    const res = await request(app).get(`${BASE}/${ID}/preview`).query({ surfaceKey: 'training' });
    expect(res.status).toBe(401);
  });

  it('is not satisfied by an admin token minted for a different signing secret', async () => {
    envMock.caseStudySurfaceLabUserIds = 'all';
    const forged = jwt.sign({ sub: 'admin-other', email: 'x@y.z', role: 'admin' }, 'wrong-secret');
    const res = await request(app)
      .get(`${BASE}/${ID}/preview`).query({ surfaceKey: 'training' })
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('refuses a non-admin role even when their id is on the allowlist', async () => {
    // The allowlist NARROWS admin access. It never grants it.
    envMock.caseStudySurfaceLabUserIds = 'student-1';
    const student = jwt.sign(
      { sub: 'student-1', email: 's@c.com', role: 'participant' }, 'test-secret',
    );
    const res = await request(app)
      .get(`${BASE}/${ID}/preview`).query({ surfaceKey: 'training' })
      .set('Authorization', `Bearer ${student}`);
    expect(res.status).toBe(403);
    expect(previewSurfaceProjection).not.toHaveBeenCalled();
  });
});

describe('adminRoutes.ts wires the gate the way it must be wired', () => {
  const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'adminRoutes.ts'), 'utf8',
  );
  const lines = SOURCE.split('\n');
  const indexOfCode = (needle: string): number =>
    lines.findIndex((line) => line.split('//')[0].includes(needle));

  it('mounts the gate PATH-SCOPED, never as a bare router.use', () => {
    // A bare `router.use(caseStudySurfaceLabGate)` in an admin sub-router
    // applies to every request that reaches adminRoutes afterwards — including
    // other routers' paths. That has caused a production outage in this repo.
    expect(SOURCE).toContain("router.use('/api/admin/case-studies/:id/preview'");
    expect(SOURCE).not.toMatch(/router\.use\(\s*caseStudySurfaceLabGate\s*\)/);
  });

  it('mounts the gate ABOVE the router it guards', () => {
    const gate = indexOfCode('caseStudySurfaceLabGate)');
    const router = indexOfCode('router.use(caseStudyAdminRoutes)');
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(router).toBeGreaterThanOrEqual(0);
    expect(gate).toBeLessThan(router);
  });

  it('mounts requireAdmin on the same scoped path, so req.admin exists when the gate reads it', () => {
    const line = lines.find((l) => l.includes("'/api/admin/case-studies/:id/preview'")) ?? '';
    expect(line).toContain('requireAdmin');
    expect(line.indexOf('requireAdmin')).toBeLessThan(line.indexOf('caseStudySurfaceLabGate'));
  });

  it('names no personal identifier anywhere in the authorization path', () => {
    // The rule the whole design turns on: an email or user id compiled into a
    // conditional is a permission that cannot be granted, revoked or audited.
    const gateSource = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'middlewares', 'caseStudySurfaceLabGate.ts'), 'utf8',
    );
    const accessSource = fs.readFileSync(
      path.join(
        __dirname, '..', '..', '..', 'services', 'caseStudy', 'caseStudySurfaceLabAccess.ts',
      ), 'utf8',
    );
    [gateSource, accessSource].forEach((src) => {
      expect(src).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    });
  });
});
