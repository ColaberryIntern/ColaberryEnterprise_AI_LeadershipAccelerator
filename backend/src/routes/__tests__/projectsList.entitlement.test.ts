/**
 * `GET /api/portal/projects` — proving the LIST endpoint is actually reached by
 * the guards that were written for it.
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * The path was declared TWICE: once in `projectRoutes.ts` and once in
 * `projectsPortalRoutes.ts`. `participantRoutes.ts` mounts them in that order
 * (`router.use(projectRoutes)` at ~408, `router.use(projectsPortalRoutes)` at
 * ~421), and Express stops at the first layer that answers — so the
 * `projectRoutes` copy won every request and TWO deliberate guards never ran:
 *
 *   1. `requireContentEntitlement('projects')`, mounted at participantRoutes:420
 *      — i.e. AFTER the winning handler, so it could not fire for this path.
 *   2. the `projectApiEnabled` dark-ship flag checked by `gate()` inside
 *      `projectsPortalRoutes`.
 *
 * Verified against production before the fix: the live endpoint answered with
 * `active_project_id` + `capability_count` (the projectRoutes shape) and no
 * `Cache-Control: no-store` (which `gate()` always sets), while a sibling path
 * only projectsPortalRoutes declares DID return `no-store`. The duplicate, not
 * the mount, was the whole defect.
 *
 * THE APP BUILT BELOW IS THE POINT. It reproduces those three mounts in the real
 * order with the REAL routers and the REAL middleware. A suite that mounted only
 * `projectsPortalRoutes` would pass on the broken tree, because it would have
 * removed the shadowing router that was causing the bug. Keeping `projectRoutes`
 * mounted is what makes this a regression test: re-add a `GET /api/portal/projects`
 * there and these tests go red again.
 */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-projects-list-gate';

/** A member who has paid — entitled under `hasFullCurriculumAccess`. */
const PAID_ENROLLMENT = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
/** Enrolled but unpaid — the free-preview tier the paywall is built to refuse. */
const UNPAID_ENROLLMENT = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

// Mutable so each test can put the two flags in the position it is describing.
// `mock`-prefixed as jest requires for a factory closure.
const mockEnv = {
  jwtSecret: JWT_SECRET,
  projectApiEnabled: true,
  contentPageGateEnabled: false,
};
jest.mock('../../config/env', () => ({ __esModule: true, env: mockEnv }));

// ── entitlement inputs ───────────────────────────────────────────────────────
// `resolveContentPageAccess` reads Enrollment + Cohort; `isStaffEnrollment`
// reads CommunityMember; `activeCompEnrollmentIds` reads Subscription. Stubbing
// the DATA (not the predicate) keeps the real rule under test — a mock of
// `contentEntitlement` itself would just agree with whatever it was told.
const enrollmentRows: Record<string, any> = {
  [PAID_ENROLLMENT]: { id: PAID_ENROLLMENT, payment_status: 'paid', cohort_id: null, access_starts_at: null, active_project_id: 'p1' },
  [UNPAID_ENROLLMENT]: { id: UNPAID_ENROLLMENT, payment_status: 'pending', cohort_id: null, access_starts_at: null, active_project_id: 'p1' },
};
jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: { findByPk: async (id: unknown) => enrollmentRows[String(id)] ?? null },
  Cohort: { findByPk: async () => null },
  // Only touched if the (removed) projectRoutes copy runs — see the shape assertion.
  Capability: { count: async () => 0 },
  RequirementsMap: { count: async () => 0 },
}));
jest.mock('../../models/CommunityMember', () => ({
  __esModule: true,
  default: { findOne: async () => null }, // nobody here is staff
}));
jest.mock('../../services/subscriptionService', () => ({
  __esModule: true,
  activeCompEnrollmentIds: async () => new Set<string>(), // nobody here is comped
}));

// ── the list payload, per handler ────────────────────────────────────────────
// The two handlers return DIFFERENT shapes, which is exactly how these tests
// tell which one answered:
//   projectsPortalRoutes (DTO)  → { projects: [{ ..., health_score }] }
//   projectRoutes       (old)   → { projects: [...], active_project_id }
jest.mock('../../services/projects/projectReadService', () => ({
  __esModule: true,
  listEnrollmentProjectsSummary: async () => ([{
    id: 'p1',
    name: 'Student Early Warning',
    organization_name: null,
    project_stage: 'discovery',
    requirements_completion_pct: null,
    health_score: null,
    is_active: true,
  }]),
  getActiveProjectTree: async () => null,
  getOwnedProjectTree: async () => null,
}));
jest.mock('../../services/projectService', () => ({
  __esModule: true,
  listProjectsForEnrollment: async () => ([{ id: 'p1', name: 'Student Early Warning', project_stage: 'discovery', setup_status: {}, requirements_document: 'x', created_at: '2026-01-01' }]),
  getProjectByEnrollment: async () => null,
  listArchivedProjectsForEnrollment: async () => [],
}));

// ── static imports the routers drag in that this suite does not exercise ─────
jest.mock('../../services/openaiInstrumented', () => ({ __esModule: true, getInstrumentedOpenAI: () => ({}) }));
jest.mock('../../services/agents/tools/attachmentSchema', () => {
  const { z } = require('zod');
  return { __esModule: true, attachmentsSchema: z.array(z.any()).optional() };
});
jest.mock('../../services/projects/projectWriteService', () => ({
  __esModule: true,
  setTaskStatus: async () => null,
  setTaskStatusByStory: async () => null,
  importProject: async () => ({ id: 'x' }),
  setCommandCenterUrl: async () => null,
}));

import projectRoutes from '../projectRoutes';
import projectsPortalRoutes from '../projectsPortalRoutes';
import { requireParticipant } from '../../middlewares/participantAuth';
import { requireContentEntitlement } from '../../middlewares/requireContentEntitlement';

// The three mounts from participantRoutes.ts, in their real order.
const app = express();
app.use(express.json());
app.use(projectRoutes);
app.use('/api/portal/projects', requireParticipant, requireContentEntitlement('projects'));
app.use(projectsPortalRoutes);

const tokenFor = (enrollmentId: string) =>
  jwt.sign({ sub: enrollmentId, email: 's@test.com', cohort_id: 'c1', role: 'participant' }, JWT_SECRET);

const getList = (enrollmentId: string) =>
  request(app).get('/api/portal/projects').set('Authorization', `Bearer ${tokenFor(enrollmentId)}`);

beforeEach(() => {
  mockEnv.projectApiEnabled = true;
  mockEnv.contentPageGateEnabled = false;
});

// ─────────────────────────────────────────────────────────────────────────────
describe('the route is not shadowed', () => {
  it('projectRoutes does not declare GET /api/portal/projects', () => {
    const shadow = (projectRoutes as any).stack.some(
      (l: any) => l.route && l.route.path === '/api/portal/projects' && l.route.methods?.get,
    );
    expect(shadow).toBe(false);
  });

  it('the DTO handler answers the list — not the legacy summary shape', async () => {
    const res = await getList(PAID_ENROLLMENT);

    expect(res.status).toBe(200);
    // `gate()` sets this on every projectsPortalRoutes answer; projectRoutes never did.
    expect(res.headers['cache-control']).toBe('no-store');
    // The legacy handler put the active pointer at the top level. The DTO carries
    // it per-item as `is_active` instead, so its absence identifies the winner.
    expect(res.body).not.toHaveProperty('active_project_id');
    expect(res.body.projects[0]).toHaveProperty('health_score');
    expect(res.body.projects[0]).not.toHaveProperty('capability_count');
  });
});

describe('requireContentEntitlement actually runs on this path', () => {
  it('flag ON: an entitled (paid) caller is served', async () => {
    mockEnv.contentPageGateEnabled = true;

    const res = await getList(PAID_ENROLLMENT);

    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
  });

  it('flag ON: an unentitled (unpaid) caller is refused with 402', async () => {
    mockEnv.contentPageGateEnabled = true;

    const res = await getList(UNPAID_ENROLLMENT);

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('content_requires_paid');
    expect(res.body.upgrade.feature).toBe('projects');
    // The refusal must not leak the list it was protecting.
    expect(res.body).not.toHaveProperty('projects');
  });

  it('flag OFF: the gate is inert and the same unpaid caller is served', async () => {
    mockEnv.contentPageGateEnabled = false;

    const res = await getList(UNPAID_ENROLLMENT);

    // This is the production position of the flag today, and the reason removing
    // the shadow locks nobody out: with CONTENT_PAGE_GATE_ENABLED unset the gate
    // calls next() for everyone, entitled or not.
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
  });
});

describe('the projectApiEnabled dark-ship flag is honoured', () => {
  it('flag ON: the list is served', async () => {
    mockEnv.projectApiEnabled = true;

    const res = await getList(PAID_ENROLLMENT);

    expect(res.status).toBe(200);
  });

  it('flag OFF: the list 404s instead of falling through to a second handler', async () => {
    mockEnv.projectApiEnabled = false;

    const res = await getList(PAID_ENROLLMENT);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Projects API not enabled');
  });
});
