import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * Access + validation contract for the admin Case Study API (T013 AC2, AC4, AC5).
 *
 * THE TRAP THIS FILE EXISTS FOR. `mgmtSectionGate` holds a hardcoded
 * prefix → section table and is DENY-BY-DEFAULT for scoped management roles. A
 * route family missing from that table still works for a legacy admin token and
 * for mgmt `owner`/`admin`, and 403s for curriculum / revenue / admissions /
 * support / community_organizer on every single call. It half-works, it looks
 * fine in every manual check an owner-account admin can run, and
 * `scripts/lint-route-auth.js` cannot see it — that linter substring-scans a
 * route file for one of five guard names and knows nothing about sections.
 *
 * So the proof here is not "the table has a row" (a row could name the wrong
 * section). It is a REAL scoped token, through the REAL gate and the REAL
 * `requireAdmin`, reaching the handler.
 *
 * REAL MIDDLEWARE. `authMiddleware` and `mgmtSectionGate` are never mocked in
 * this file; only `config/env` (for a known signing secret), the Case Study
 * services (so no database is touched, and so "did the service get called" is
 * observable) and `aiEventService` (the fire-and-forget auth-failure telemetry
 * that would otherwise reach for a model).
 */

jest.mock('../../../config/env', () => ({
  env: { jwtSecret: 'test-secret', nodeEnv: 'test' },
}));
jest.mock('../../../services/aiEventService', () => ({
  emitAiEvent: jest.fn().mockResolvedValue(undefined),
}));

const listCaseStudies = jest.fn();
const getCaseStudy = jest.fn();
const createCaseStudyFromProject = jest.fn();
const createCaseStudyFromRepoCollection = jest.fn();
const updateCaseStudy = jest.fn();
const archiveCaseStudy = jest.fn();
const listRepositories = jest.fn();
const attachRepository = jest.fn();
const setRepositoryRole = jest.fn();
const setRepositoryPathScope = jest.fn();
const removeRepository = jest.fn();
const syncCaseStudy = jest.fn();
const listSyncRuns = jest.fn();
const applyHumanOverride = jest.fn();
const approveSnapshot = jest.fn();
const previewSurfaceProjection = jest.fn();
const publishCaseStudy = jest.fn();
const unpublishCaseStudy = jest.fn();

const ALL_SERVICE_MOCKS = [
  listCaseStudies, getCaseStudy, createCaseStudyFromProject, createCaseStudyFromRepoCollection,
  updateCaseStudy, archiveCaseStudy, listRepositories, attachRepository, setRepositoryRole,
  removeRepository, setRepositoryPathScope, syncCaseStudy, listSyncRuns, applyHumanOverride, approveSnapshot,
  previewSurfaceProjection, publishCaseStudy, unpublishCaseStudy,
];

jest.mock('../../../services/caseStudy/caseStudyRepoCollection', () => ({
  CASE_STUDY_REPO_ROLES: [
    'primary', 'frontend', 'backend', 'agents', 'data', 'infra', 'docs', 'evals', 'demo', 'other',
  ] as const,
  attachRepository: (...a: unknown[]) => attachRepository(...a),
  listRepositories: (...a: unknown[]) => listRepositories(...a),
  removeRepository: (...a: unknown[]) => removeRepository(...a),
  setRepositoryRole: (...a: unknown[]) => setRepositoryRole(...a),
  setRepositoryPathScope: (...a: unknown[]) => setRepositoryPathScope(...a),
  isCaseStudyRepoError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyAdminService', () => ({
  listCaseStudies: (...a: unknown[]) => listCaseStudies(...a),
  getCaseStudy: (...a: unknown[]) => getCaseStudy(...a),
  createCaseStudyFromProject: (...a: unknown[]) => createCaseStudyFromProject(...a),
  createCaseStudyFromRepoCollection: (...a: unknown[]) => createCaseStudyFromRepoCollection(...a),
  updateCaseStudy: (...a: unknown[]) => updateCaseStudy(...a),
  archiveCaseStudy: (...a: unknown[]) => archiveCaseStudy(...a),
  isCaseStudyAdminError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyAdminReview', () => ({
  applyHumanOverride: (...a: unknown[]) => applyHumanOverride(...a),
  approveSnapshot: (...a: unknown[]) => approveSnapshot(...a),
  listSyncRuns: (...a: unknown[]) => listSyncRuns(...a),
  previewSurfaceProjection: (...a: unknown[]) => previewSurfaceProjection(...a),
}));
jest.mock('../../../services/caseStudy/caseStudySyncService', () => ({
  syncCaseStudy: (...a: unknown[]) => syncCaseStudy(...a),
  isCaseStudySyncError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyPublicationService', () => ({
  publishCaseStudy: (...a: unknown[]) => publishCaseStudy(...a),
  unpublishCaseStudy: (...a: unknown[]) => unpublishCaseStudy(...a),
  isCaseStudyPublicationError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyProjectSource', () => ({
  isCaseStudyProjectSourceError: () => false,
}));
jest.mock('../../../services/caseStudy/caseStudyEvidenceSource', () => ({
  isCaseStudyEvidenceSourceError: () => false,
}));

import caseStudyAdminRoutes from '../caseStudyAdminRoutes';
import { mgmtSectionGate, pathToSection } from '../../../middlewares/mgmtSectionGate';
import { roleCanAccessSection } from '../../../services/access/mgmtRoles';

const ID = '11111111-1111-4111-8111-111111111111';
const SNAP = '22222222-2222-4222-8222-222222222222';
const REPO = '33333333-3333-4333-8333-333333333333';
const BASE = '/api/admin/case-studies';

const app = express();
app.use(express.json());
// The same order `routes/adminRoutes.ts` uses: the section gate runs once,
// before every admin sub-router.
app.use(mgmtSectionGate);
app.use(caseStudyAdminRoutes);

const token = (payload: Record<string, unknown>): string =>
  jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', ...payload }, 'test-secret');

/** A legacy full admin: no `mgmt_role`, so `mgmtSectionGate` passes it untouched. */
const LEGACY_ADMIN = token({ role: 'admin' });
/** A bridge-minted scoped staff token. THIS is the one the trap breaks. */
const CURRICULUM = token({ role: 'admin', mgmt_role: 'curriculum' });
/** Scoped to the student-story surface only — the negative control. */
const SUPPORT = token({ role: 'admin', mgmt_role: 'support' });

type Call = { method: 'get' | 'post' | 'patch' | 'delete'; url: string; body?: object };

/** Every endpoint the router declares, as a callable request. */
const ENDPOINTS: readonly Call[] = [
  { method: 'get', url: BASE },
  { method: 'post', url: `${BASE}/from-project`, body: { projectId: ID } },
  { method: 'post', url: `${BASE}/from-repositories`, body: { title: 'X', repositories: ['a/b'] } },
  { method: 'get', url: `${BASE}/${ID}` },
  { method: 'patch', url: `${BASE}/${ID}`, body: { title: 'X' } },
  { method: 'post', url: `${BASE}/${ID}/archive` },
  { method: 'get', url: `${BASE}/${ID}/repositories` },
  { method: 'post', url: `${BASE}/${ID}/repositories`, body: { reference: 'a/b' } },
  { method: 'patch', url: `${BASE}/${ID}/repositories/${REPO}`, body: { role: 'docs' } },
  { method: 'delete', url: `${BASE}/${ID}/repositories/${REPO}` },
  { method: 'post', url: `${BASE}/${ID}/sync`, body: {} },
  { method: 'get', url: `${BASE}/${ID}/sync-runs` },
  { method: 'post', url: `${BASE}/${ID}/overrides`, body: { path: 'identity.title', value: 'X' } },
  { method: 'post', url: `${BASE}/${ID}/snapshots/${SNAP}/approve` },
  { method: 'get', url: `${BASE}/${ID}/preview` },
  { method: 'post', url: `${BASE}/${ID}/publish`, body: {} },
  { method: 'post', url: `${BASE}/${ID}/unpublish`, body: {} },
];

type Req = ReturnType<ReturnType<typeof request>['get']>;

const send = (call: Call, bearer?: string): Req => {
  const agent = request(app) as unknown as Record<Call['method'], (url: string) => Req>;
  const req = agent[call.method](call.url);
  if (bearer) req.set('Authorization', `Bearer ${bearer}`);
  return call.body ? req.send(call.body) : req;
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const mock of ALL_SERVICE_MOCKS) mock.mockResolvedValue({ ok: true });
});

/* ──────────────────────────────────────────────────────────────── AC5: 401 ── */

describe('unauthenticated requests (AC5) — REAL requireAdmin', () => {
  it.each(ENDPOINTS)(
    '$method $url with no Authorization header is 401 and reaches no service',
    async (call) => {
      const res = await send(call);
      expect(res.status).toBe(401);
      for (const mock of ALL_SERVICE_MOCKS) expect(mock).not.toHaveBeenCalled();
    },
  );

  it('a malformed bearer token is 401, not 500', async () => {
    const res = await send(ENDPOINTS[0], 'not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(listCaseStudies).not.toHaveBeenCalled();
  }, 20000);

  it('a token signed with the wrong secret is 401', async () => {
    const forged = jwt.sign({ sub: 'x', email: 'x@y.z', role: 'admin' }, 'wrong-secret');
    const res = await send(ENDPOINTS[0], forged);
    expect(res.status).toBe(401);
    expect(listCaseStudies).not.toHaveBeenCalled();
  });

  it('an authenticated NON-admin role is 403, not 401 or 200', async () => {
    const res = await send(ENDPOINTS[0], token({ role: 'participant' }));
    expect(res.status).toBe(403);
    expect(listCaseStudies).not.toHaveBeenCalled();
  });
});

/* ──────────────────────────────── AC2: the mgmtSectionGate PATH_SECTION row ── */

describe('mgmtSectionGate PATH_SECTION entry (AC2)', () => {
  it('maps the new prefix to a section — an unmapped prefix is 403 for every scoped role', () => {
    expect(pathToSection(BASE)).toBe('program');
  });

  it('maps every nested path under it, not only the collection root', () => {
    expect(pathToSection(`${BASE}/${ID}`)).toBe('program');
    expect(pathToSection(`${BASE}/${ID}/publish`)).toBe('program');
    expect(pathToSection(`${BASE}/${ID}/snapshots/${SNAP}/approve`)).toBe('program');
  });

  it('does not capture a sibling prefix (segment-boundary match)', () => {
    expect(pathToSection('/api/admin/case-studies-export')).toBeNull();
  });

  it('picks a section the Program roles already hold — no new SECTION_KEY needed', () => {
    expect(roleCanAccessSection('curriculum', 'program')).toBe(true);
    expect(roleCanAccessSection('owner', 'program')).toBe(true);
    expect(roleCanAccessSection('admin', 'program')).toBe(true);
    expect(roleCanAccessSection('support', 'program')).toBe(false);
  });

  it('a SCOPED curriculum token actually REACHES the route (the whole point)', async () => {
    const res = await send(ENDPOINTS[0], CURRICULUM);

    expect(res.status).toBe(200);
    expect(listCaseStudies).toHaveBeenCalledTimes(1);
  });

  it.each(ENDPOINTS)(
    'a scoped curriculum token is not 403 on $method $url',
    async (call) => {
      const res = await send(call, CURRICULUM);
      expect(res.status).not.toBe(403);
    },
  );

  it('a legacy admin token (no mgmt_role) still passes', async () => {
    const res = await send(ENDPOINTS[0], LEGACY_ADMIN);
    expect(res.status).toBe(200);
    expect(listCaseStudies).toHaveBeenCalledTimes(1);
  });

  it('a scoped role WITHOUT the program section is 403 and reaches no service', async () => {
    const res = await send(ENDPOINTS[0], SUPPORT);
    expect(res.status).toBe(403);
    expect(listCaseStudies).not.toHaveBeenCalled();
  });
});

/* ─────────────────────────────────── AC4: Zod 400 before any service call ── */

/** Each entry is a request that must be refused by Zod at the route boundary. */
const MALFORMED: readonly { name: string; call: Call }[] = [
  { name: 'list with limit=0', call: { method: 'get', url: `${BASE}?limit=0` } },
  { name: 'list with limit=9999', call: { method: 'get', url: `${BASE}?limit=9999` } },
  { name: 'list with an unknown status', call: { method: 'get', url: `${BASE}?status=live` } },
  { name: 'list with a non-uuid projectId', call: { method: 'get', url: `${BASE}?projectId=nope` } },
  { name: 'create-from-Project with no projectId', call: { method: 'post', url: `${BASE}/from-project`, body: {} } },
  { name: 'create-from-Project with a non-uuid projectId', call: { method: 'post', url: `${BASE}/from-project`, body: { projectId: 'nope' } } },
  { name: 'create-from-repos with an empty list', call: { method: 'post', url: `${BASE}/from-repositories`, body: { title: 'X', repositories: [] } } },
  { name: 'create-from-repos with 21 repositories', call: { method: 'post', url: `${BASE}/from-repositories`, body: { title: 'X', repositories: Array(21).fill('a/b') } } },
  { name: 'read with a non-uuid id', call: { method: 'get', url: `${BASE}/nope` } },
  { name: 'patch with an empty body', call: { method: 'patch', url: `${BASE}/${ID}`, body: {} } },
  { name: 'patch with an unknown status', call: { method: 'patch', url: `${BASE}/${ID}`, body: { status: 'live' } } },
  { name: 'patch with a non-boolean consent flag', call: { method: 'patch', url: `${BASE}/${ID}`, body: { organizationNamingConsent: 'yes' } } },
  { name: 'archive with a non-uuid id', call: { method: 'post', url: `${BASE}/nope/archive` } },
  { name: 'attach with no reference', call: { method: 'post', url: `${BASE}/${ID}/repositories`, body: {} } },
  { name: 'attach with an unknown role', call: { method: 'post', url: `${BASE}/${ID}/repositories`, body: { reference: 'a/b', role: 'wizard' } } },
  { name: 'set role with an unknown role', call: { method: 'patch', url: `${BASE}/${ID}/repositories/${REPO}`, body: { role: 'wizard' } } },
  { name: 'remove with a non-uuid repositoryId', call: { method: 'delete', url: `${BASE}/${ID}/repositories/nope` } },
  { name: 'sync with an unknown trigger', call: { method: 'post', url: `${BASE}/${ID}/sync`, body: { trigger: 'cron' } } },
  { name: 'sync-runs with a negative offset', call: { method: 'get', url: `${BASE}/${ID}/sync-runs?offset=-1` } },
  { name: 'override with no path', call: { method: 'post', url: `${BASE}/${ID}/overrides`, body: { value: 'X' } } },
  { name: 'approve with a non-uuid snapshotId', call: { method: 'post', url: `${BASE}/${ID}/snapshots/nope/approve` } },
  { name: 'preview with an unknown surfaceKey', call: { method: 'get', url: `${BASE}/${ID}/preview?surfaceKey=intranet` } },
  { name: 'publish with an unknown surfaceKey', call: { method: 'post', url: `${BASE}/${ID}/publish`, body: { surfaceKey: 'intranet' } } },
  { name: 'unpublish with an unknown surfaceKey', call: { method: 'post', url: `${BASE}/${ID}/unpublish`, body: { surfaceKey: 'intranet' } } },
];

describe('Zod validation at the route boundary (AC4)', () => {
  it.each(MALFORMED)(
    '$name is 400 and never reaches a service',
    async ({ call }) => {
      const res = await send(call, LEGACY_ADMIN);

      expect(res.status).toBe(400);
      expect(res.body.error_class).toBe('ValidationError');
      for (const mock of ALL_SERVICE_MOCKS) expect(mock).not.toHaveBeenCalled();
    },
  );

  it('names the offending field so an admin can fix it', async () => {
    const res = await request(app).post(`${BASE}/from-project`)
      .set('Authorization', `Bearer ${LEGACY_ADMIN}`).send({ projectId: 'nope' });

    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'projectId' })]),
    );
  });

  it('a well-formed request DOES reach its service (the validation is not a wall)', async () => {
    const res = await request(app).post(`${BASE}/${ID}/publish`)
      .set('Authorization', `Bearer ${LEGACY_ADMIN}`).send({ surfaceKey: 'enterprise' });

    expect(res.status).toBe(200);
    expect(publishCaseStudy).toHaveBeenCalledWith(expect.objectContaining({
      caseStudyId: ID, surfaceKey: 'enterprise', actor: 'staff@colaberry.com',
    }));
  });

  it('defaults an omitted surfaceKey to enterprise — the only Phase 1 surface', async () => {
    await request(app).post(`${BASE}/${ID}/publish`)
      .set('Authorization', `Bearer ${LEGACY_ADMIN}`).send({});

    expect(publishCaseStudy).toHaveBeenCalledWith(
      expect.objectContaining({ surfaceKey: 'enterprise' }),
    );
  });
});
