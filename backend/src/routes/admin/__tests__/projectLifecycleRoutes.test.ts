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

// The review module. Complete FOR THE ROUTE: these are the only two symbols it imports. The
// service's own behaviour (idempotency, the derived permission, the revision guard) is tested in
// `blueprintChangeRequest.test.ts`; what is tested here is the route's contract around it, which
// is almost entirely STATUS CODES - the one place a 404-for-422 mistake hides.
const compareBlueprintRevisions = jest.fn();
const requestBlueprintChanges = jest.fn();
jest.mock('../../../services/lifecycle/blueprintChangeRequest', () => ({
  compareBlueprintRevisions: (...a: any[]) => compareBlueprintRevisions(...a),
  requestBlueprintChanges: (...a: any[]) => requestBlueprintChanges(...a),
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
import { composeBody } from '../../../schemas/projectLifecycleSchema';

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

  it('the Zod body covers every field composeBlueprint requires', () => {
    // WHY THIS EXISTS. The handler casts the parsed body with `as unknown as`, because the
    // schema is deliberately shallow. That cast means a field added to
    // `BlueprintCompositionInput` would NOT be a compile error at the route — it would arrive
    // as `undefined` and the validator would refuse it as malformed input, reporting a domain
    // refusal for what is really a wiring gap.
    //
    // THIS LIST IS HAND-MAINTAINED, and that is a real limitation rather than a hidden one:
    // TypeScript types do not exist at runtime, so nothing can derive it. What keeps it honest
    // is the positive control below — without that, a list that had silently emptied would
    // still pass.
    const required = [
      'understanding', 'project', 'allocation', 'agents', 'effort', 'declaration',
      'bindings', 'workspaceStates', 'policies', 'design',
    ];
    const shape = Object.keys(composeBody.shape);
    for (const field of required) {
      expect(shape).toContain(field);
    }
    // POSITIVE CONTROL: the assertion above holds vacuously for an empty list, and it can
    // detect a field that is genuinely absent.
    expect(required.length).toBe(10);
    expect(shape).not.toContain('aFieldTheSchemaDoesNotHave');
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

  it('a body whose project carries NO id still composes, rather than 400ing', () => {
    // THE MISSING OPERAND CONTROL. The mismatch guard is compound:
    // `typeof bodyProjectId === 'string' && bodyProjectId !== p.data.projectId`. Deleting the
    // typeof half left every test green, because no fixture had a project without an id — so
    // half the guard was untested. A project with no id is not a MISMATCH, it is a body the
    // validators will refuse on their own terms, and conflating the two would 400 it.
    composeBlueprint.mockReturnValue(composed());
    return request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`)
      .send(body({ project: {} }))
      .then((r) => {
        expect(r.status).toBe(200);
        expect(composeBlueprint).toHaveBeenCalled();
      });
  });

  it('500s when the composition throws, rather than reporting a clean compose', async () => {
    // The catch path returned 200 under mutation with every test green. A 500 here is the
    // honest answer: the blueprint was neither composed nor refused, and saying `composed:
    // false` would be indistinguishable from a blueprint that genuinely has refusals.
    composeBlueprint.mockImplementation(() => { throw new Error('validator exploded'); });
    const r = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`)
      .send(body());
    expect(r.status).toBe(500);
    expect(r.body.composed).toBeUndefined();
    // and the message does not leak the internal error text
    expect(r.body.error).not.toMatch(/exploded/);
  });

  it('200s when nothing refuses', async () => {
    composeBlueprint.mockReturnValue(composed());
    const r = await request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`).send(body());
    expect(r.status).toBe(200);
    expect(r.body.composed).toBe(true);
    expect(r.body.refusals).toEqual([]);
  });

  it('carries the SELECTED DESIGN through to the response body', () => {
    // The route had its own copy of this field and nulling it survived all 40 route tests,
    // because nothing asserted it. The reviewer needs the ref: it is what an approval binds
    // to, so a response that drops it leaves the UI unable to say WHICH design was approved.
    composeBlueprint.mockReturnValue({
      ...composed(),
      selectedDesign: { selectedDesignRef: 'alt-x@vc3' },
    });
    return request(app()).post(`/api/admin/project-lifecycle/${PROJECT}/compose`)
      .send(body())
      .then((r) => {
        expect(r.status).toBe(200);
        expect(r.body.selectedDesign).toEqual({ selectedDesignRef: 'alt-x@vc3' });
      });
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

describe('GET /revisions/compare', () => {
  const url = (qs: string) => `/api/admin/project-lifecycle/${PROJECT}/revisions/compare?${qs}`;

  const comparedPayload = {
    state: 'compared',
    from: { id: 'm-1', revision: 1, status: 'superseded', contentSha256: 'a' },
    to: { id: 'm-2', revision: 2, status: 'approved', contentSha256: 'b' },
    diff: {
      collections: [{ collection: 'sources', identity: 'pinned', added: [], removed: [], revised: ['req-1'] }],
      changed: true,
      unreadable: [],
    },
  };

  it('200s a comparison and passes the diff through intact', async () => {
    compareBlueprintRevisions.mockResolvedValue(comparedPayload);
    const res = await request(app()).get(url('kind=student'));
    expect(res.status).toBe(200);
    // The IDS survive the route, not just a changed flag.
    expect(res.body.diff.collections[0].revised).toEqual(['req-1']);
    expect(compareBlueprintRevisions).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT, kind: 'student', fromRevision: undefined, toRevision: undefined,
    }));
  });

  it('forwards explicit revision bounds as NUMBERS, not strings', async () => {
    // They arrive as query strings. Passed through unconverted they would be compared against
    // numeric revisions and match nothing, and the route would 404 a revision that exists.
    compareBlueprintRevisions.mockResolvedValue(comparedPayload);
    await request(app()).get(url('kind=delivery&from=1&to=3'));
    const arg = compareBlueprintRevisions.mock.calls[0][0];
    expect([arg.fromRevision, arg.toRevision]).toEqual([1, 3]);
    expect(typeof arg.fromRevision).toBe('number');
  });

  it('200s a single-revision answer rather than inventing an empty diff', async () => {
    compareBlueprintRevisions.mockResolvedValue({
      state: 'single_revision', only: { id: 'm-1', revision: 1, status: 'approved', contentSha256: 'a' },
    });
    const res = await request(app()).get(url('kind=student'));
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('single_revision');
  });

  it('404s a project with no blueprint', async () => {
    compareBlueprintRevisions.mockResolvedValue({ state: 'no_manifest' });
    const res = await request(app()).get(url('kind=student'));
    expect(res.status).toBe(404);
    expect(res.body.state).toBe('no_manifest');
  });

  it('404s an unknown revision AND reports the ones that exist', async () => {
    compareBlueprintRevisions.mockResolvedValue({
      state: 'revision_not_found', requested: [9], available: [2, 1],
    });
    const res = await request(app()).get(url('kind=student&from=9&to=1'));
    expect(res.status).toBe(404);
    expect(res.body.available).toEqual([2, 1]);
  });

  it('400s a non-UUID project id before any service runs', async () => {
    const res = await request(app()).get('/api/admin/project-lifecycle/not-a-uuid/revisions/compare?kind=student');
    expect(res.status).toBe(400);
    expect(compareBlueprintRevisions).not.toHaveBeenCalled();
  });

  it('400s a missing kind rather than guessing one', async () => {
    const res = await request(app()).get(url(''));
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path)).toContain('kind');
    expect(compareBlueprintRevisions).not.toHaveBeenCalled();
  });

  it('400s revision 0, which is not a revision', async () => {
    const res = await request(app()).get(url('kind=student&from=0&to=1'));
    expect(res.status).toBe(400);
    expect(compareBlueprintRevisions).not.toHaveBeenCalled();
  });

  it('409s with lifecycleDisabled when the flag is off', async () => {
    FLAGS.lifecycleEnforcement = false;
    const res = await request(app()).get(url('kind=student'));
    expect(res.status).toBe(409);
    expect(res.body.lifecycleDisabled).toBe(true);
    expect(compareBlueprintRevisions).not.toHaveBeenCalled();
  });

  it('lets a tenancy denial keep its OWN status', async () => {
    compareBlueprintRevisions.mockRejectedValue(
      Object.assign(new Error('not your tenant'), { name: 'TenantAccessError', status: 403 }),
    );
    const res = await request(app()).get(url('kind=student'));
    expect(res.status).toBe(403);
  });

  it('500s an unexpected failure without leaking the message', async () => {
    compareBlueprintRevisions.mockRejectedValue(new Error('connection string postgres://u:p@h/db'));
    const res = await request(app()).get(url('kind=student'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
  });
});

describe('POST /request-changes', () => {
  const url = `/api/admin/project-lifecycle/${PROJECT}/request-changes`;
  const body = { kind: 'student', revision: 2, text: 'tighten the acceptance criteria' };

  // Mirrors ChangeRequestRefused's three fields. The real class's shape is pinned by
  // blueprintChangeRequest.test.ts, which asserts name/status/refusal on a real rejection.
  const refused = (status: number, refusal: string, message = 'refused') =>
    Object.assign(new Error(message), { name: 'ChangeRequestRefused', status, refusal });

  it('200s a recorded request', async () => {
    requestBlueprintChanges.mockResolvedValue({
      applied: true, revision: 2, text: body.text, conditionReason: 'CHANGES_REQUESTED r2: x',
    });
    const res = await request(app()).post(url).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: true, revision: 2, condition: 'awaiting_input' });
  });

  it('200s an IDENTICAL RESUBMIT with applied:false - not a 409', async () => {
    // The end state the caller asked for is the end state that exists. A 409 would make a UI
    // tell the reviewer their request failed, and they would send it again.
    requestBlueprintChanges.mockResolvedValue({
      applied: false, revision: 2, text: body.text, conditionReason: 'x',
    });
    const res = await request(app()).post(url).send(body);
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(false);
  });

  it('does not echo the submitted text back in the response', async () => {
    // The response carries the decision, not the payload. Echoing it would copy free text a
    // reviewer typed into anything that records responses.
    requestBlueprintChanges.mockResolvedValue({
      applied: true, revision: 2, text: body.text, conditionReason: 'CHANGES_REQUESTED r2: ' + body.text,
    });
    const res = await request(app()).post(url).send(body);
    expect(JSON.stringify(res.body)).not.toContain('acceptance criteria');
  });

  it('400s empty text, which is not a change request', async () => {
    const res = await request(app()).post(url).send({ ...body, text: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path)).toContain('text');
    expect(requestBlueprintChanges).not.toHaveBeenCalled();
  });

  it('400s a missing revision rather than defaulting to the newest', async () => {
    const res = await request(app()).post(url).send({ kind: 'student', text: 'fix it' });
    expect(res.status).toBe(400);
    expect(requestBlueprintChanges).not.toHaveBeenCalled();
  });

  it('400s a body with no kind', async () => {
    const res = await request(app()).post(url).send({ revision: 2, text: 'fix it' });
    expect(res.status).toBe(400);
    expect(requestBlueprintChanges).not.toHaveBeenCalled();
  });

  it('403s an insufficient permission, carrying the machine-readable refusal', async () => {
    requestBlueprintChanges.mockRejectedValue(refused(403, 'insufficient_permission'));
    const res = await request(app()).post(url).send(body);
    expect(res.status).toBe(403);
    expect(res.body.refusal).toBe('insufficient_permission');
  });

  it('404s a revision that does not exist', async () => {
    requestBlueprintChanges.mockRejectedValue(refused(404, 'revision_not_found'));
    const res = await request(app()).post(url).send(body);
    expect(res.status).toBe(404);
    expect(res.body.refusal).toBe('revision_not_found');
  });

  it('409s with lifecycleDisabled when the flag is off', async () => {
    FLAGS.lifecycleEnforcement = false;
    const res = await request(app()).post(url).send(body);
    expect(res.status).toBe(409);
    expect(res.body.lifecycleDisabled).toBe(true);
    expect(requestBlueprintChanges).not.toHaveBeenCalled();
  });

  it('500s an unexpected failure without leaking the message', async () => {
    requestBlueprintChanges.mockRejectedValue(new Error('connection string postgres://u:p@h/db'));
    const res = await request(app()).post(url).send(body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
  });
});
