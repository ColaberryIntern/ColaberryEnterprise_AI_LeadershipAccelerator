/**
 * The lifecycle admin API: section-gated, flag-dark, Zod-validated, and honest about status codes.
 *
 * Three kinds of assertion, because each catches a different class of mistake:
 *   - SOURCE-level, on the route file's own text, because `lint-route-auth` is a required check
 *     and because a guard that is present-but-not-applied would pass a behavioural test.
 *   - GATE-level, on `pathToSection`, because the section gate is DENY-BY-DEFAULT: an unmapped
 *     path 403s a scoped role with nothing explaining why, and nothing else would catch that.
 *   - BEHAVIOURAL, through supertest with the services doubled.
 */
import fs from 'fs';
import path from 'path';

const requireSection = jest.fn(() => (req: any, _res: any, next: any) => {
  req.admin = { email: 'admin@test', role: 'DELIVERY_OWNER' };
  next();
});
jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: (...a: any[]) => requireSection(...a) }));

// The flag, so both states are reachable. Default ON here; individual tests flip it off.
const FLAGS = { lifecycleEnforcement: true };
jest.mock('../../../config/featureFlags', () => ({
  FLAGS,
  isDev: false,
  isProd: true,
}));

const readLifecycleStatus = jest.fn();
const requestTransition = jest.fn();
const approveLifecycleBlueprint = jest.fn();
jest.mock('../../../services/lifecycle/lifecycleStatus', () => ({
  readLifecycleStatus: (...a: any[]) => readLifecycleStatus(...a),
  requestTransition: (...a: any[]) => requestTransition(...a),
  approveLifecycleBlueprint: (...a: any[]) => approveLifecycleBlueprint(...a),
}));

// The composition module. A factory that enumerates exports silently deletes every one it omits,
// so this is complete FOR THE ROUTE: `composeBlueprint` is the only symbol the route imports.
// The composition's own behaviour is tested in its own suite; what is tested here is the route's
// contract around it — status codes, the id-mismatch refusal, and that both issue lists reach the
// response.
const composeBlueprint = jest.fn();
jest.mock('../../../services/lifecycle/generation/blueprintComposition', () => ({
  composeBlueprint: (...a: any[]) => composeBlueprint(...a),
}));

// Partial mocks that KEEP the real helpers, because the route calls refusalStatus and
// approvalErrorStatus for real and a factory that enumerates exports would delete them.
jest.mock('../../../services/lifecycle/lifecycleTransition', () => ({
  ...jest.requireActual('../../../services/lifecycle/lifecycleTransition'),
}));
jest.mock('../../../services/lifecycle/blueprintApproval', () => ({
  ...jest.requireActual('../../../services/lifecycle/blueprintApproval'),
}));

import express from 'express';
import request from 'supertest';
import { pathToSection } from '../../../middlewares/mgmtSectionGate';
import {
  ApprovalConflictError, ApprovalGateError, SelfApprovalError, ManifestNotFoundError,
} from '../../../services/lifecycle/blueprintApproval';
import router from '../projectLifecycleRoutes';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const MANIFEST = '22222222-2222-4222-8222-222222222222';

function app() {
  const a = express();
  a.use(express.json());
  a.use(router);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  FLAGS.lifecycleEnforcement = true;
});

describe('SOURCE: the guard is on every route, as the required lint demands', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'projectLifecycleRoutes.ts'), 'utf8');

  it('applies requireSection to every router handler', () => {
    const handlers = src.match(/router\.(get|post|put|patch|delete)\(/g) ?? [];
    const guarded = src.match(/requireSection\(SECTION\)/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    expect(guarded).toHaveLength(handlers.length);
  });

  it('POSITIVE CONTROL: the handler pattern does match a route declaration', () => {
    expect("router.post('/x', h)").toMatch(/router\.(get|post|put|patch|delete)\(/);
  });

  it('imports no model or database connection at module scope', () => {
    // A static model import would init Sequelize at module load and break every route test
    // that stubs config/database — the reason at factoryRoutes.ts:9-11.
    // Match IMPORT STATEMENTS, not any occurrence of the string. This file's own doc comment
    // explains why not to import config/database, and a bare substring match flagged that prose
    // as a violation. `lint-route-auth.js:19` records the same weakness in itself, where a file's
    // prose containing "requireAdmin" satisfied the guard check.
    const valueImports = src.split('\n')
      .filter((l) => /^import\s/.test(l))
      .filter((l) => !/^import\s+type\b/.test(l));
    expect(valueImports.some((l) => /from\s+'[./]*models\//.test(l))).toBe(false);
    expect(valueImports.some((l) => /from\s+'[./]*config\/database'/.test(l))).toBe(false);
    // POSITIVE CONTROL: the predicate does flag a real offender.
    expect(["import X from '../../models/Thing';"].some((l) => /from\s+'[./]*models\//.test(l))).toBe(true);
  });
});

describe('GATE: the section gate classifies this surface', () => {
  it('maps the prefix to the program section', () => {
    // Deny-by-default: an unmapped path reaches a bare 403 with nothing explaining why.
    expect(pathToSection('/api/admin/project-lifecycle')).toBe('program');
  });

  it('maps its sub-paths to the same section', () => {
    expect(pathToSection(`/api/admin/project-lifecycle/${PROJECT}`)).toBe('program');
    expect(pathToSection(`/api/admin/project-lifecycle/${PROJECT}/transition`)).toBe('program');
    expect(pathToSection(`/api/admin/project-lifecycle/${PROJECT}/approve`)).toBe('program');
    expect(pathToSection(`/api/admin/project-lifecycle/${PROJECT}/compose`)).toBe('program');
  });

  it('does not claim a neighbouring path that merely shares a prefix', () => {
    expect(pathToSection('/api/admin/project-lifecyclesomething')).not.toBe('program');
  });
});

describe('ships dark: the disabled answer is explicit, never a soft success', () => {
  beforeEach(() => { FLAGS.lifecycleEnforcement = false; });

  it.each([
    ['get', `/api/admin/project-lifecycle/${PROJECT}?kind=student`],
    ['post', `/api/admin/project-lifecycle/${PROJECT}/transition`],
    ['post', `/api/admin/project-lifecycle/${PROJECT}/approve`],
  ])('%s %s returns 409 lifecycleDisabled', async (method, url) => {
    const res = await (request(app()) as any)[method](url).send({});
    expect(res.status).toBe(409);
    expect(res.body.lifecycleDisabled).toBe(true);
    // The point: NOT a 200, and not an empty list. A disabled feature answering 200 with nothing
    // is indistinguishable from a feature that ran and found nothing.
    expect(res.status).not.toBe(200);
    expect(res.body.remedy).toMatch(/ENABLE_PROJECT_LIFECYCLE/);
  });

  it('does not reach the service at all when disabled', async () => {
    await request(app()).get(`/api/admin/project-lifecycle/${PROJECT}?kind=student`);
    expect(readLifecycleStatus).not.toHaveBeenCalled();
  });
});

describe('GET status', () => {
  it('returns stage, blockers and next actor', async () => {
    readLifecycleStatus.mockResolvedValue({
      projectId: PROJECT, kind: 'student', stage: 'requirements_ready', condition: null,
      conditionReason: null, completedStages: ['discovery'], nextStage: 'process_ready',
      blockers: [{ rule: 'process_without_tasks', message: 'Process P-1 has no tasks.', subject: 'P-1' }],
      nextActorRole: 'architecture.approve', nextAction: '1 thing(s) must be resolved before process_ready.',
    });
    const res = await request(app()).get(`/api/admin/project-lifecycle/${PROJECT}?kind=student`);
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('requirements_ready');
    expect(res.body.blockers).toHaveLength(1);
    expect(res.body.nextActorRole).toBe('architecture.approve');
  });

  it('400s a non-uuid project id, with the issue list', async () => {
    const res = await request(app()).get('/api/admin/project-lifecycle/not-a-uuid?kind=student');
    expect(res.status).toBe(400);
    expect(res.body.issues[0].message).toMatch(/UUID/);
    expect(readLifecycleStatus).not.toHaveBeenCalled();
  });

  it('400s a missing or invalid kind rather than guessing the identity table', async () => {
    expect((await request(app()).get(`/api/admin/project-lifecycle/${PROJECT}`)).status).toBe(400);
    expect((await request(app()).get(`/api/admin/project-lifecycle/${PROJECT}?kind=guess`)).status).toBe(400);
  });

  it('404s when no lifecycle is registered', async () => {
    readLifecycleStatus.mockResolvedValue(null);
    const res = await request(app()).get(`/api/admin/project-lifecycle/${PROJECT}?kind=student`);
    expect(res.status).toBe(404);
  });

  it('HONOURS the guard\'s own status — a cross-tenant row is 404, not 403', async () => {
    // The guard deliberately throws 404 for another tenant's row, because a 403 confirms the row
    // exists. Hardcoding 403 in the route would convert that back into an existence oracle.
    const err: any = new Error('Not found');
    err.name = 'TenantAccessError'; err.status = 404; err.errorClass = 'TenantIsolationViolation';
    readLifecycleStatus.mockRejectedValue(err);
    const res = await request(app()).get(`/api/admin/project-lifecycle/${PROJECT}?kind=student`);
    expect(res.status).toBe(404);
    expect(res.body.error).not.toMatch(/tenant|permission/i);
  });

  it('still 403s a genuine permission denial', async () => {
    const err: any = new Error('Missing permission: project.read');
    err.name = 'TenantAccessError'; err.status = 403;
    readLifecycleStatus.mockRejectedValue(err);
    expect((await request(app()).get(`/api/admin/project-lifecycle/${PROJECT}?kind=student`)).status).toBe(403);
  });

  it('500s an unexpected failure without leaking the message', async () => {
    readLifecycleStatus.mockRejectedValue(new Error('connection string postgres://u:p@h/db'));
    const res = await request(app()).get(`/api/admin/project-lifecycle/${PROJECT}?kind=student`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/postgres:\/\//);
  });
});

describe('POST transition', () => {
  it('applies an allowed transition', async () => {
    requestTransition.mockResolvedValue({
      allowed: true, from: 'discovery', to: 'requirements_ready',
      gaps: [], blocking: [], advisory: [], nextCondition: null, message: 'Advanced to requirements_ready.',
    });
    const res = await request(app())
      .post(`/api/admin/project-lifecycle/${PROJECT}/transition`)
      .send({ kind: 'student', to: 'requirements_ready' });
    expect(res.status).toBe(200);
    expect(res.body.to).toBe('requirements_ready');
  });

  it('422s unmet prerequisites WITH the gap list, so the refusal is actionable', async () => {
    requestTransition.mockResolvedValue({
      allowed: false, refusal: 'prerequisites_unmet', from: 'process_ready', to: 'allocation_ready',
      gaps: [], blocking: [
        { rule: 'task_without_accountable_human', message: 'Task T-4 has no accountable human.', subject: 'T-4' },
      ],
      advisory: [], nextCondition: null, message: 'allocation_ready is not ready: 1 thing(s) still missing.',
    });
    const res = await request(app())
      .post(`/api/admin/project-lifecycle/${PROJECT}/transition`)
      .send({ kind: 'student', to: 'allocation_ready' });
    expect(res.status).toBe(422);
    expect(res.body.gaps[0].subject).toBe('T-4');
  });

  it('409s an illegal edge, distinctly from a 422', async () => {
    requestTransition.mockResolvedValue({
      allowed: false, refusal: 'illegal_edge', from: 'discovery', to: 'building',
      gaps: [], blocking: [], advisory: [], nextCondition: null, message: 'A project at discovery cannot move to building.',
    });
    const res = await request(app())
      .post(`/api/admin/project-lifecycle/${PROJECT}/transition`)
      .send({ kind: 'student', to: 'building' });
    expect(res.status).toBe(409);
  });

  it('403s a permission refusal', async () => {
    requestTransition.mockResolvedValue({
      allowed: false, refusal: 'forbidden', from: 'launch_ready', to: 'operating',
      gaps: [], blocking: [], advisory: [], nextCondition: null, message: 'Entering operating requires release.deploy.',
    });
    expect((await request(app())
      .post(`/api/admin/project-lifecycle/${PROJECT}/transition`)
      .send({ kind: 'student', to: 'operating' })).status).toBe(403);
  });

  it('400s an unknown target stage before reaching the service', async () => {
    const res = await request(app())
      .post(`/api/admin/project-lifecycle/${PROJECT}/transition`)
      .send({ kind: 'student', to: 'not_a_stage' });
    expect(res.status).toBe(400);
    expect(requestTransition).not.toHaveBeenCalled();
  });

  it('does NOT accept a client-supplied `from`', async () => {
    requestTransition.mockResolvedValue({
      allowed: true, from: 'discovery', to: 'requirements_ready',
      gaps: [], blocking: [], advisory: [], nextCondition: null, message: 'ok',
    });
    await request(app())
      .post(`/api/admin/project-lifecycle/${PROJECT}/transition`)
      .send({ kind: 'student', to: 'requirements_ready', from: 'launch_ready' });
    // A stale tab supplying `from` is how a project walks backwards through an edge that was
    // legal when the page loaded. The service is called without it.
    expect(requestTransition.mock.calls[0][0]).not.toHaveProperty('from');
  });
});

describe('POST approve', () => {
  const body = { manifestId: MANIFEST, expectedRevision: 4, scope: 'full' };

  it('201s a new approval', async () => {
    approveLifecycleBlueprint.mockResolvedValue({
      alreadyApproved: false,
      approval: { approved_by: 'owner@test', approved_at: new Date('2026-10-01T12:00:00Z'), revision: 4 },
    });
    const res = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/approve`).send(body);
    expect(res.status).toBe(201);
    expect(res.body.alreadyApproved).toBe(false);
  });

  it('200s an idempotent hit and returns the ORIGINAL approver', async () => {
    approveLifecycleBlueprint.mockResolvedValue({
      alreadyApproved: true,
      approval: { approved_by: 'first@test', approved_at: new Date('2026-09-01T12:00:00Z'), revision: 4 },
    });
    const res = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/approve`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.alreadyApproved).toBe(true);
    expect(res.body.approvedBy).toBe('first@test');
  });

  it('never takes the approver from the request body', async () => {
    approveLifecycleBlueprint.mockResolvedValue({
      alreadyApproved: false, approval: { approved_by: 'admin@test', approved_at: new Date(), revision: 4 },
    });
    await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/approve`)
      .send({ ...body, approvedBy: 'attacker@evil.test', approved_by: 'attacker@evil.test' });
    const passed = approveLifecycleBlueprint.mock.calls[0][0];
    expect(passed.admin.email).toBe('admin@test');
    expect(JSON.stringify(passed)).not.toMatch(/attacker@evil/);
  });

  it('requires expectedRevision — no default that would approve whatever is current', async () => {
    const res = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/approve`)
      .send({ manifestId: MANIFEST, scope: 'full' });
    expect(res.status).toBe(400);
    expect(approveLifecycleBlueprint).not.toHaveBeenCalled();
  });

  it('409s a stale revision and reports the real one so a UI can refresh', async () => {
    // A REAL instance: approvalErrorStatus maps by instanceof, which is the stronger check, so a
    // hand-rolled object with the right `name` would not exercise the real mapping.
    approveLifecycleBlueprint.mockRejectedValue(new ApprovalConflictError(7));
    const res = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/approve`).send(body);
    expect(res.status).toBe(409);
    expect(res.body.currentRevision).toBe(7);
  });

  it('422s a gate failure with its issues', async () => {
    approveLifecycleBlueprint.mockRejectedValue(
      new ApprovalGateError(['allocation_unknown', 'proposer_unrecorded']),
    );
    const res = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/approve`).send(body);
    expect(res.status).toBe(422);
    expect(res.body.issues).toHaveLength(2);
  });

  it('403s self-approval', async () => {
    approveLifecycleBlueprint.mockRejectedValue(
      new SelfApprovalError('architect@test proposed this blueprint and cannot also approve it.'),
    );
    expect((await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/approve`).send(body)).status).toBe(403);
  });

  it('404s an unknown manifest', async () => {
    approveLifecycleBlueprint.mockRejectedValue(new ManifestNotFoundError());
    expect((await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/approve`).send(body)).status).toBe(404);
  });
});

describe('POST /compose, the first non-test caller the pipeline has ever had', () => {
  // A minimal body that satisfies the SHALLOW schema. It is not a realistic blueprint and is
  // not meant to be: the composition is mocked here, and its real behaviour is covered by
  // `blueprintComposition.test.ts` against the generation fixtures.
  const body = (over: Record<string, unknown> = {}) => ({
    kind: 'delivery',
    understanding: [], allocation: [], agents: [], effort: [],
    project: { id: PROJECT },
    declaration: { declaration: {}, origin: 'model_turn' },
    bindings: [], workspaceStates: [], policies: [],
    design: null,
    ...over,
  });

  const composed = (refusals: unknown[] = [], advisories: unknown[] = []) => ({
    draft: refusals.length === 0 ? { ok: true } : null,
    selectedDesign: null,
    refusals,
    advisories,
  });

  it('409s with lifecycleDisabled when the flag is off, and never composes', async () => {
    FLAGS.lifecycleEnforcement = false;
    const r = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`).send(body());
    expect(r.status).toBe(409);
    expect(r.body.lifecycleDisabled).toBe(true);
    // The flag check is a REFUSAL, not a skip: nothing downstream may run behind it.
    expect(composeBlueprint).not.toHaveBeenCalled();
  });

  it('400s on a body that fails the schema, naming the issues', async () => {
    const r = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`)
      .send({ kind: 'delivery' });
    expect(r.status).toBe(400);
    expect(Array.isArray(r.body.issues)).toBe(true);
    expect(r.body.issues.length).toBeGreaterThan(0);
    expect(composeBlueprint).not.toHaveBeenCalled();
  });

  it('REFUSES a body whose project is not the project in the URL', async () => {
    // Composing project B under project A’s URL would file B’s blueprint against A. Refused
    // rather than reconciled, because choosing one of the two would be guessing.
    const other = '33333333-3333-4333-8333-333333333333';
    const r = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`)
      .send(body({ project: { id: other } }));
    expect(r.status).toBe(400);
    expect(r.body.errorClass).toBe('ProjectIdMismatch');
    expect(composeBlueprint).not.toHaveBeenCalled();
  });

  it('422s when the blueprint refuses, and returns EVERY refusal plus the advisories', async () => {
    // 422 rather than 400: the request was well formed and the BLUEPRINT is not ready, which
    // is a different thing for a client to act on.
    composeBlueprint.mockReturnValue(composed(
      [{ stage: 'controls', code: 'A' }, { stage: 'design', code: 'B' }],
      [{ stage: 'workspaces', code: 'W' }],
    ));
    const r = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`).send(body());
    expect(r.status).toBe(422);
    expect(r.body.composed).toBe(false);
    // ALL of them, not the first: a reviewer needs one pass, not a queue of round trips.
    expect(r.body.refusals.map((x: any) => x.code)).toEqual(['A', 'B']);
    // And the advisories are carried, because one dropped from the response is a validation
    // result the reviewer cannot see.
    expect(r.body.advisories.map((x: any) => x.code)).toEqual(['W']);
  });

  it('200s when nothing refuses', async () => {
    composeBlueprint.mockReturnValue(composed());
    const r = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`).send(body());
    expect(r.status).toBe(200);
    expect(r.body.composed).toBe(true);
    expect(r.body.refusals).toEqual([]);
  });

  it('converts roleIds to a SET, because the validator calls .has on it', async () => {
    // Passing the array straight through would reach `validateControlSpec` as an Array, whose
    // `.has` is undefined — a 500 at the point a policy names a role, i.e. only on the inputs
    // that matter. Asserted on the call argument rather than on the response, because the
    // response is identical either way.
    composeBlueprint.mockReturnValue(composed());
    await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`)
      .send(body({ roleIds: ['role-a', 'role-b'] }));
    const arg = composeBlueprint.mock.calls[0][0];
    expect(arg.roleIds instanceof Set).toBe(true);
    expect(arg.roleIds.has('role-a')).toBe(true);
  });

  it('threads the correlation id from the header into the composition', async () => {
    composeBlueprint.mockReturnValue(composed());
    await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`)
      .set('X-Correlation-ID', 'corr-abc').send(body());
    expect(composeBlueprint.mock.calls[0][0].correlationId).toBe('corr-abc');
  });
});
