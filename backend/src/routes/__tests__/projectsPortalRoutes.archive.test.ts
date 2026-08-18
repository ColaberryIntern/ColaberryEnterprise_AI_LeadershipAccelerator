/**
 * Archive/restore, exercised THROUGH THE HTTP SURFACE with the real
 * participant-auth middleware and real JWTs.
 *
 * WHY AT THIS LAYER, NOT ONLY THE SERVICE
 * ---------------------------------------
 * The hazard this feature has to survive is not "the UI offers the wrong
 * button". It is a request arriving at the endpoint that no UI would ever send.
 * `fcce50ef-fe01-471d-a3ff-cd6948d092c2` is the platform's own project record —
 * ~144,238 rows across 15+ tables, the BuildManifest telemetry target named in
 * CLAUDE.md, hardcoded as PROJECT_ID in six backfill scripts — and it sits on a
 * REAL enrollment (Ali's), so every ownership check in the system passes for it.
 * A guard proven only in a service unit test leaves open the question of whether
 * the route actually reaches that guard. These tests answer it with a `curl`-
 * shaped request.
 *
 * `requireParticipant` is deliberately NOT mocked. The unauthenticated and
 * wrong-student cases are the two that matter here, and mocking the middleware
 * that decides them would be testing a stub.
 */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';

const JWT_SECRET = 'test-secret-for-archive-suite';

/** The platform's own project record. The row that must never be archivable. */
const PLATFORM_PROJECT = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';
/** Ali's enrollment — the one the platform record actually sits on. */
const OWNER_ENROLLMENT = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
/** Ali's real build. Archivable. */
const OWN_PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';
/** A different student entirely. */
const OTHER_ENROLLMENT = '11111111-2222-4333-8444-555555555555';
const OTHER_PROJECT = '99999999-8888-4777-8666-555555555555';

jest.mock('../../config/env', () => ({
  env: { projectApiEnabled: true, jwtSecret: 'test-secret-for-archive-suite' },
}));

// ── model stubs: an in-memory `projects` table ────────────────────────────────
interface Row { id: string; enrollment_id: string; name: string | null; archived_at: Date | null }
let rows: Row[] = [];
let activePointer: Record<string, string | null> = {};

const findProject = (id: unknown) => rows.find((r) => r.id === String(id)) ?? null;

/**
 * A faithful-enough `projects` table. `findAll` honours the three clauses the
 * real service builds — `enrollment_id`, `archived_at IS NULL` / `IS NOT NULL`,
 * and `id NOT IN (...)` — using the ACTUAL sequelize `Op` symbols, so the
 * platform-record exclusion is exercised rather than assumed. A stub that
 * ignored `Op.notIn` would let every one of these tests pass against a service
 * with no guard in it at all, which is the failure mode worth designing out.
 */
jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: {
    findByPk: async (id: unknown) => {
      const r = rows.find((x) => x.id === String(id));
      return r ? { ...r, get: () => ({ ...r }) } : null;
    },
    findAll: async ({ where }: any) => {
      const excluded: string[] = (where.id?.[Op.notIn] ?? []).map(String);
      const wantsArchived = where.archived_at != null && Op.ne in where.archived_at;
      return rows
        .filter((r) => r.enrollment_id === String(where.enrollment_id))
        .filter((r) => (wantsArchived ? r.archived_at != null
          : where.archived_at === null ? r.archived_at == null : true))
        .filter((r) => !excluded.includes(r.id))
        .map((r) => ({ ...r, get: () => ({ ...r }) }));
    },
    update: async (values: any, opts: any) => {
      const r = findProject(opts.where.id);
      if (r) r.archived_at = values.archived_at ?? null;
      return [r ? 1 : 0];
    },
  },
}));
jest.mock('../../models/ProjectArtifact', () => ({ __esModule: true, default: {} }));
// Model modules run `Model.init(..., { sequelize })` at import time, which needs a
// real Sequelize instance. Stubbing the modules is how the rest of this repo's
// unit suites avoid standing up Postgres to test control flow.
jest.mock('../../models/EvidenceRecord', () => ({
  __esModule: true,
  default: { findAll: async () => [] },
}));
// Static imports of the route module that have nothing to do with archiving but
// drag in their own model graphs (the mentor tool chain, the task-status writer).
// Stubbed so this suite loads the router without standing up 200+ models.
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

jest.mock('../../models/StudentTask', () => ({
  __esModule: true,
  default: { count: async () => 0, findAll: async () => [] },
}));
jest.mock('../../models/StudentTaskList', () => ({
  __esModule: true,
  default: { count: async () => 0 },
}));
jest.mock('../../models/GitHubConnection', () => ({
  __esModule: true,
  default: { findOne: async () => null },
}));
jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: {
    findByPk: async (id: unknown) => {
      const key = String(id);
      if (!(key in activePointer)) return null;
      return { id: key, active_project_id: activePointer[key] };
    },
    update: async (values: any, opts: any) => {
      activePointer[String(opts.where.id)] = values.active_project_id ?? null;
      return [1];
    },
  },
}));
jest.mock('../../config/database', () => ({
  __esModule: true,
  sequelize: {
    transaction: async (fn: any) => fn({}),
    query: async () => [[], []],
  },
}));
// NOTE: `services/projectService` is deliberately NOT mocked. Its real
// `listArchivableProjectsForEnrollment` is what decides where the active pointer
// goes after an archive, and that query carries the platform-record exclusion —
// mocking it would replace the thing under test with a stub that agrees.

import projectsPortalRoutes from '../projectsPortalRoutes';

const app = express();
app.use(express.json());
app.use(projectsPortalRoutes);

const tokenFor = (enrollmentId: string) =>
  jwt.sign({ sub: enrollmentId, email: 's@test.com', cohort_id: 'c1', role: 'participant' }, JWT_SECRET);

beforeEach(() => {
  rows = [
    { id: PLATFORM_PROJECT, enrollment_id: OWNER_ENROLLMENT, name: null, archived_at: null },
    { id: OWN_PROJECT, enrollment_id: OWNER_ENROLLMENT, name: 'Student Early Warning', archived_at: null },
    { id: OTHER_PROJECT, enrollment_id: OTHER_ENROLLMENT, name: 'Someone Elses Build', archived_at: null },
  ];
  activePointer = { [OWNER_ENROLLMENT]: OWN_PROJECT, [OTHER_ENROLLMENT]: OTHER_PROJECT };
});

// ─────────────────────────────────────────────────────────────────────────────
describe('the platform project record cannot be archived through the API', () => {
  it('refuses POST .../archive on fcce50ef with 403, even from its real owner', async () => {
    const res = await request(app)
      .post(`/api/portal/projects/${PLATFORM_PROJECT}/archive`)
      .set('Authorization', `Bearer ${tokenFor(OWNER_ENROLLMENT)}`)
      .send({ confirm_name: 'Colaberry Enterprise AI Accelerator' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('This project is part of the platform itself and cannot be archived.');
    // The row is untouched — the refusal happened before any write.
    expect(findProject(PLATFORM_PROJECT)!.archived_at).toBeNull();
  });

  it('refuses it in UPPER CASE too — the guard is not defeated by letter case', async () => {
    const res = await request(app)
      .post(`/api/portal/projects/${PLATFORM_PROJECT.toUpperCase()}/archive`)
      .set('Authorization', `Bearer ${tokenFor(OWNER_ENROLLMENT)}`)
      .send({ confirm_name: 'anything' });

    expect(res.status).toBe(403);
    expect(findProject(PLATFORM_PROJECT)!.archived_at).toBeNull();
  });

  it('refuses the archive-preview too, so no client can even price the action', async () => {
    const res = await request(app)
      .get(`/api/portal/projects/${PLATFORM_PROJECT}/archive-preview`)
      .set('Authorization', `Bearer ${tokenFor(OWNER_ENROLLMENT)}`);

    expect(res.status).toBe(403);
  });

  it('is excluded from the archivable listing query itself, not just the handler', async () => {
    const { listArchivableProjectsForEnrollment } = await import('../../services/projectService');
    const archivable = await listArchivableProjectsForEnrollment(OWNER_ENROLLMENT);
    const ids = archivable.map((p) => String(p.id));

    // Exactly one archivable project on this enrollment, and it is the student's
    // own build — not the platform record that sits beside it.
    expect(ids).toEqual([OWN_PROJECT]);
  });
});

describe('a student may only archive a project on their own enrollment', () => {
  it('answers 401 when there is no Authorization header at all', async () => {
    const res = await request(app).post(`/api/portal/projects/${OWN_PROJECT}/archive`).send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
    expect(findProject(OWN_PROJECT)!.archived_at).toBeNull();
  });

  it('answers 401 on a token signed with the wrong secret', async () => {
    const forged = jwt.sign(
      { sub: OWNER_ENROLLMENT, email: 's@test.com', cohort_id: 'c1', role: 'participant' },
      'not-the-real-secret',
    );
    const res = await request(app)
      .post(`/api/portal/projects/${OWN_PROJECT}/archive`)
      .set('Authorization', `Bearer ${forged}`)
      .send({ confirm_name: 'Student Early Warning' });

    expect(res.status).toBe(401);
    expect(findProject(OWN_PROJECT)!.archived_at).toBeNull();
  });

  it("answers 404 — not 403 — when student B aims at student A's project", async () => {
    const res = await request(app)
      .post(`/api/portal/projects/${OWN_PROJECT}/archive`)
      .set('Authorization', `Bearer ${tokenFor(OTHER_ENROLLMENT)}`)
      .send({ confirm_name: 'Student Early Warning' });

    // 404 on purpose: a 403 would confirm the id belongs to somebody.
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Project not found');
    expect(findProject(OWN_PROJECT)!.archived_at).toBeNull();
    expect(activePointer[OWNER_ENROLLMENT]).toBe(OWN_PROJECT);
  });

  it("refuses student B's attempt to RESTORE student A's archived project", async () => {
    findProject(OWN_PROJECT)!.archived_at = new Date('2026-08-17T10:00:00Z');
    const res = await request(app)
      .post(`/api/portal/projects/${OWN_PROJECT}/restore`)
      .set('Authorization', `Bearer ${tokenFor(OTHER_ENROLLMENT)}`)
      .send({});

    expect(res.status).toBe(404);
    expect(findProject(OWN_PROJECT)!.archived_at).not.toBeNull();
  });
});

describe('the confirmation is a deliberate act, verified server-side', () => {
  it('rejects an archive whose typed name does not match the server name', async () => {
    const res = await request(app)
      .post(`/api/portal/projects/${OWN_PROJECT}/archive`)
      .set('Authorization', `Bearer ${tokenFor(OWNER_ENROLLMENT)}`)
      .send({ confirm_name: 'Student Early Warnin' }); // one character short

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Type the project name exactly to confirm.');
    expect(findProject(OWN_PROJECT)!.archived_at).toBeNull();
  });

  it('rejects an archive with no confirm_name at all', async () => {
    const res = await request(app)
      .post(`/api/portal/projects/${OWN_PROJECT}/archive`)
      .set('Authorization', `Bearer ${tokenFor(OWNER_ENROLLMENT)}`)
      .send({});

    expect(res.status).toBe(400);
    expect(findProject(OWN_PROJECT)!.archived_at).toBeNull();
  });

  it('accepts the exact name and archives, repointing the active project', async () => {
    const res = await request(app)
      .post(`/api/portal/projects/${OWN_PROJECT}/archive`)
      .set('Authorization', `Bearer ${tokenFor(OWNER_ENROLLMENT)}`)
      .send({ confirm_name: 'Student Early Warning' });

    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(true);
    expect(findProject(OWN_PROJECT)!.archived_at).not.toBeNull();

    // THE CENTRAL ASSERTION OF THE WHOLE FEATURE: archiving the active project
    // must never hand the student the platform record as a replacement.
    expect(res.body.active_project_id).not.toBe(PLATFORM_PROJECT);
    expect(res.body.active_project_id).toBeNull();
    expect(activePointer[OWNER_ENROLLMENT]).toBeNull();
  });
});
