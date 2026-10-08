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
const loadLatestManifestRefs = jest.fn();
jest.mock('../../../services/lifecycle/blueprintChangeRequest', () => ({
  compareBlueprintRevisions: (...a: any[]) => compareBlueprintRevisions(...a),
  requestBlueprintChanges: (...a: any[]) => requestBlueprintChanges(...a),
  loadLatestManifestRefs: (...a: any[]) => loadLatestManifestRefs(...a),
}));

// The traversal is NOT mocked. It is pure, it is the thing the route is supposed to be wired to,
// and a mock here would let the route pass while calling nothing — the producer-with-no-consumer
// failure this repo has shipped before. `linkedViews` has its own suite for the traversal rules;
// what these tests add is that the route reaches it and maps its answers to status codes.

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
import reviewRouter from '../projectLifecycleReviewRoutes';
import { composeBody, approveBody } from '../../../schemas/projectLifecycleSchema';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const MANIFEST = '22222222-2222-4222-8222-222222222222';

function app() {
  const a = express();
  a.use(express.json());
  a.use(router);
  // BOTH routers, because the review handlers moved to their own file when the first one
  // reached 496 lines. Mounting only one would 404 half this suite.
  a.use(reviewRouter);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  FLAGS.lifecycleEnforcement = true;
});

describe('SOURCE: the guard is on every route, as the required lint demands', () => {
  /**
   * BOTH lifecycle route files, and that is the point of the loop.
   *
   * The review handlers moved to `projectLifecycleReviewRoutes.ts` when the first file reached
   * 496 lines. `lint-route-auth` reads per FILE and is satisfied by one occurrence of a guard
   * name anywhere in the text, so the new file would pass it with two of its three routes
   * unguarded. The per-ROUTE guarantee is this assertion's job, and scoping it to one file
   * silently dropped three routes out of coverage the moment they moved.
   */
  const FILES = ['projectLifecycleRoutes.ts', 'projectLifecycleReviewRoutes.ts'];
  const sources = FILES.map((f) => ({
    file: f,
    text: fs.readFileSync(path.join(__dirname, '..', f), 'utf8'),
  }));
  const src = sources[0].text;

  it('covers every lifecycle route file that exists, so none can be added unwatched', () => {
    // Derived from the directory rather than trusted: a third route file added later and not
    // listed above would be checked by nothing.
    const onDisk = fs.readdirSync(path.join(__dirname, '..'))
      .filter((f) => /^projectLifecycle.*Routes\.ts$/.test(f))
      .sort();
    expect(onDisk).toEqual(FILES.slice().sort());
  });

  it('applies requireSection to every router handler, in every file', () => {
    const unbalanced = sources
      .map(({ file, text }) => ({
        file,
        handlers: (text.match(/router\.(get|post|put|patch|delete)\(/g) ?? []).length,
        guarded: (text.match(/requireSection\(SECTION\)/g) ?? []).length,
      }))
      .filter((r) => r.handlers === 0 || r.handlers !== r.guarded);
    // Named, not counted: which file is short a guard is the only useful output.
    expect(unbalanced).toEqual([]);
    expect(sources).toHaveLength(2);
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
    const valueImports = sources.flatMap(({ file, text }) => text.split('\n')
      .filter((l) => /^import\s/.test(l))
      .filter((l) => !/^import\s+type\b/.test(l))
      .map((l) => ({ file, line: l })));
    expect(valueImports.filter((i) => /from\s+'[./]*models\//.test(i.line))).toEqual([]);
    expect(valueImports.filter((i) => /from\s+'[./]*config\/database'/.test(i.line))).toEqual([]);
    // Non-vacuity: both files really do have import statements to inspect.
    expect(valueImports.length).toBeGreaterThan(8);
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

describe('GET /linked', () => {
  const url = (qs: string) => `/api/admin/project-lifecycle/${PROJECT}/linked?${qs}`;

  /** A refs object shaped like the real thing, with one requirement and one real edge. */
  const refs = () => ({
    origin: 'factory',
    projectId: PROJECT,
    sources: [{ id: 'REQ-1', revision: 2, source: 'contract_requirements' }],
    processes: [{ id: 'PROC-1', revision: 2, source: 'x' }],
    businessTasks: [],
    assignments: [],
    agents: { runtime: [], builder: [] },
    surfaces: [],
    policies: [],
    designDecisions: [],
    downstream: [],
    trackMappings: {
      proposalSections: [{ canonicalReqId: 'REQ-1', sectionRef: 'L.3.1' }],
      solutionStories: [],
    },
  });

  it('200s the connections of the selected record, through the REAL traversal', async () => {
    loadLatestManifestRefs.mockResolvedValue({ refs: refs(), revision: 2 });
    const res = await request(app()).get(url('kind=delivery&entityId=REQ-1'));
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('linked');
    expect(res.body.revision).toBe(2);
    expect(res.body.entity).toEqual({ id: 'REQ-1', viewKind: 'requirements', collection: 'sources' });
    expect(res.body.groups).toEqual([
      { target: 'proposal_sections', via: 'track_proposal_section', ids: ['L.3.1'] },
    ]);
    expect(res.body.unlinked).toBeNull();
  });

  it('200s the explicit no-edge state, which is NOT an empty response', async () => {
    loadLatestManifestRefs.mockResolvedValue({ refs: refs(), revision: 2 });
    const res = await request(app()).get(url('kind=delivery&entityId=PROC-1'));
    expect(res.status).toBe(200);
    expect(res.body.groups).toEqual([]);
    expect(res.body.unlinked.kind).toBe('no_edge_recorded');
    // The response says which edges DO exist, so the answer is actionable rather than blank.
    expect(res.body.unlinked.detail).toContain('requirement-to-proposal-section');
  });

  it('200s "not in this manifest" as its own answer, distinct from having no edges', async () => {
    loadLatestManifestRefs.mockResolvedValue({ refs: refs(), revision: 2 });
    const res = await request(app()).get(url('kind=delivery&entityId=NOPE-1'));
    expect(res.status).toBe(200);
    expect(res.body.entity).toBeNull();
    expect(res.body.unlinked.kind).toBe('entity_not_in_manifest');
  });

  it('404s a project with no blueprint', async () => {
    loadLatestManifestRefs.mockResolvedValue(null);
    const res = await request(app()).get(url('kind=student&entityId=REQ-1'));
    expect(res.status).toBe(404);
    expect(res.body.state).toBe('no_manifest');
  });

  it('accepts a COMPOSITE entity id, colons and slashes included', async () => {
    // Assignment ids are `${role_id}:${responsibility}`. This is why entityId is a query
    // parameter: as a path segment a responsibility containing a slash would 404.
    const r = refs();
    (r as any).assignments = [{ id: 'DELIVERY_OWNER:Approve / sign', revision: 2, source: 'x' }];
    loadLatestManifestRefs.mockResolvedValue({ refs: r, revision: 2 });
    const res = await request(app())
      .get(`/api/admin/project-lifecycle/${PROJECT}/linked`)
      .query({ kind: 'delivery', entityId: 'DELIVERY_OWNER:Approve / sign' });
    expect(res.status).toBe(200);
    expect(res.body.entity.collection).toBe('assignments');
  });

  it('400s a missing entityId rather than guessing a record', async () => {
    const res = await request(app()).get(url('kind=student'));
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path)).toContain('entityId');
    expect(loadLatestManifestRefs).not.toHaveBeenCalled();
  });

  it('400s a blank entityId', async () => {
    const res = await request(app()).get(url('kind=student&entityId=%20%20'));
    expect(res.status).toBe(400);
    expect(loadLatestManifestRefs).not.toHaveBeenCalled();
  });

  it('400s a missing kind', async () => {
    const res = await request(app()).get(url('entityId=REQ-1'));
    expect(res.status).toBe(400);
    expect(loadLatestManifestRefs).not.toHaveBeenCalled();
  });

  it('400s a non-UUID project id', async () => {
    const res = await request(app())
      .get('/api/admin/project-lifecycle/not-a-uuid/linked?kind=student&entityId=REQ-1');
    expect(res.status).toBe(400);
    expect(loadLatestManifestRefs).not.toHaveBeenCalled();
  });

  it('409s with lifecycleDisabled when the flag is off', async () => {
    FLAGS.lifecycleEnforcement = false;
    const res = await request(app()).get(url('kind=student&entityId=REQ-1'));
    expect(res.status).toBe(409);
    expect(res.body.lifecycleDisabled).toBe(true);
    expect(loadLatestManifestRefs).not.toHaveBeenCalled();
  });

  it('reads with READ intent: the refs loader is the audited read, not a write', async () => {
    loadLatestManifestRefs.mockResolvedValue({ refs: refs(), revision: 2 });
    await request(app()).get(url('kind=student&entityId=REQ-1'));
    expect(loadLatestManifestRefs).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT, kind: 'student',
    }));
  });

  it('lets a tenancy denial keep its own status', async () => {
    loadLatestManifestRefs.mockRejectedValue(
      Object.assign(new Error('not your tenant'), { name: 'TenantAccessError', status: 403 }),
    );
    const res = await request(app()).get(url('kind=student&entityId=REQ-1'));
    expect(res.status).toBe(403);
  });

  it('500s an unexpected failure without leaking the message', async () => {
    loadLatestManifestRefs.mockRejectedValue(new Error('connection string postgres://u:p@h/db'));
    const res = await request(app()).get(url('kind=student&entityId=REQ-1'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
  });

  it('tolerates a malformed refs payload instead of 500ing', async () => {
    // `refs_json` is declared `unknown`. A hand-edited or legacy row reaches the traversal with
    // the same static type as a well-formed one.
    loadLatestManifestRefs.mockResolvedValue({ refs: 'not an object', revision: 1 });
    const res = await request(app()).get(url('kind=student&entityId=REQ-1'));
    expect(res.status).toBe(200);
    expect(res.body.unlinked.kind).toBe('entity_not_in_manifest');
  });
});

describe('LC-14 per ROUTE, over a route list derived from the source', () => {
  /**
   * PER ROUTE, not per file, and the list is parsed out of the source rather than typed here.
   *
   * `lint-route-auth` reads per FILE and is satisfied by one occurrence of a guard name anywhere
   * in the text, so an unguarded route inside a guarded file passes it. A hand-written list of
   * cases has the same blind spot one level up: it cannot fail for a route nobody added to it.
   * Deriving the list means a new lifecycle route is swept the moment it exists.
   *
   * Three of LC-14's four clauses are evidenced here. The fourth — no worker or job bypass — has
   * no path to test, so an absence tripwire stands in for it in `lifecyclePersonas.test.ts`, and
   * LC-14 is recorded PARTIAL rather than claimed whole.
   */
  const FILES = ['projectLifecycleRoutes.ts', 'projectLifecycleReviewRoutes.ts'];

  /** Every `router.<verb>(` declaration in both files, as a method and a concrete path. */
  const routes = FILES.flatMap((file) => {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const out: Array<{ file: string; method: string; path: string; body: string }> = [];
    const re = /router\.(get|post|put|patch|delete)\(\s*`\$\{PREFIX\}([^`]*)`/g;
    let m: RegExpExecArray | null = re.exec(text);
    while (m !== null) {
      out.push({
        file,
        method: m[1],
        // The declared suffix with its one param substituted for a real UUID.
        path: `/api/admin/project-lifecycle${m[2].replace(':projectId', PROJECT)}`,
        body: '',
      });
      m = re.exec(text);
    }
    return out;
  });

  it('found every route in both files, and the parser is not silently matching nothing', () => {
    // Non-vacuity: every sweep below iterates this list, so an empty or short list would make
    // all of them pass without exercising a single route.
    expect(routes.length).toBe(7);
    expect(routes.filter((r) => r.path.includes(':'))).toEqual([]);
    expect(new Set(routes.map((r) => r.file)).size).toBe(2);
    // POSITIVE CONTROL: the pattern does match a real declaration.
    expect('router.get(`${PREFIX}/:projectId/x`, h)')
      .toMatch(/router\.(get|post|put|patch|delete)\(\s*`\$\{PREFIX\}([^`]*)`/);
  });

  it('DIRECT API BYPASS: every route refuses when the feature flag is off', async () => {
    // The flag check runs before validation in every handler, so an empty body still reaches it.
    // A new route that forgets the check answers something other than 409 and is named here.
    FLAGS.lifecycleEnforcement = false;
    const wrong: string[] = [];
    for (const r of routes) {
      const res = await (request(app()) as any)[r.method](r.path).send({});
      if (res.status !== 409 || res.body?.lifecycleDisabled !== true) {
        wrong.push(`${r.method.toUpperCase()} ${r.path} -> ${res.status}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('DIRECT API BYPASS: every route is behind requireSection, per route not per file', () => {
    const unbalanced = FILES.map((file) => {
      const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      return {
        file,
        handlers: (text.match(/router\.(get|post|put|patch|delete)\(/g) ?? []).length,
        guarded: (text.match(/requireSection\(SECTION\)/g) ?? []).length,
      };
    }).filter((r) => r.handlers === 0 || r.handlers !== r.guarded);
    expect(unbalanced).toEqual([]);
  });

  it('CROSS-TENANT READ: every route maps a tenancy denial to the guard’s own status', () => {
    // Asserted on the source, because each handler reaches a different service and a
    // behavioural sweep would need a different double per route. The exception list is explicit
    // so a handler losing its branch cannot hide in a count.
    const NO_TENANT_BRANCH: Record<string, string> = {
      '/compose': 'composeBlueprint is pure and touches no tenant-scoped row, so it cannot raise '
        + 'TenantAccessError. The branch was removed rather than left as an expectation nothing '
        + 'could reach - a mutation deleting it survived every test.',
    };
    const missing: string[] = [];
    for (const file of FILES) {
      const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      // One block per handler: split on the declaration, keep what follows it.
      const blocks = text.split(/router\.(?:get|post|put|patch|delete)\(/).slice(1);
      const paths = [...text.matchAll(/router\.(?:get|post|put|patch|delete)\(\s*`\$\{PREFIX\}([^`]*)`/g)]
        .map((m) => m[1]);
      blocks.forEach((block, i) => {
        const suffix = paths[i] ?? `#${i}`;
        const excused = Object.keys(NO_TENANT_BRANCH).some((k) => suffix.endsWith(k));
        if (!block.includes('TenantAccessError') && !excused) missing.push(`${file}${suffix}`);
      });
    }
    expect(missing).toEqual([]);
  });

  it('CROSS-TENANT READ: a denial keeps the guard’s status rather than becoming a 500', async () => {
    // The behavioural half, on one representative route per service seam. The guard's own
    // status is authoritative: flattening it to 500 would tell an operator the system broke
    // when it had correctly refused them.
    readLifecycleStatus.mockRejectedValue(
      Object.assign(new Error('other tenant'), { name: 'TenantAccessError', status: 403 }),
    );
    const res = await request(app()).get(`/api/admin/project-lifecycle/${PROJECT}?kind=student`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('other tenant');
  });

  it('FORGED APPROVAL: the approver is never read from the request body', async () => {
    // The schema has no field for it, so a body carrying one cannot reach the service even if a
    // handler tried to pass it along.
    const withForgedApprover = {
      manifestId: MANIFEST,
      expectedRevision: 1,
      scope: 'documented',
      approvedBy: 'someone-else',
      approver: 'someone-else',
      approvedByIdentityId: 'someone-else',
      admin: { email: 'attacker@test', role: 'DELIVERY_OWNER' },
    };
    // The service's real result shape: the handler reads `alreadyApproved` and `approval.*`,
    // and answers 201 for a new approval, 200 for an idempotent hit.
    approveLifecycleBlueprint.mockResolvedValue({
      alreadyApproved: false,
      approval: { approved_by: 'admin@test', approved_at: '2026-10-08T00:00:00.000Z', revision: 1 },
    });
    const res = await request(app())
      .post(`/api/admin/project-lifecycle/${PROJECT}/approve`)
      .send(withForgedApprover);
    expect(res.status).toBe(201);
    // The recorded approver is the authenticated identity, never the body's claim.
    expect(res.body.approvedBy).toBe('admin@test');

    const passed = approveLifecycleBlueprint.mock.calls[0][0];
    // Nothing the body offered about identity survives into the service call.
    for (const forged of ['approvedBy', 'approver', 'approvedByIdentityId']) {
      expect(Object.prototype.hasOwnProperty.call(passed, forged)).toBe(false);
    }
    // The admin is the one the guard put on the request, not the one in the body.
    expect(passed.admin.email).toBe('admin@test');
    expect(JSON.stringify(passed)).not.toContain('attacker@test');
    expect(JSON.stringify(passed)).not.toContain('someone-else');
  });

  it('FORGED APPROVAL: the approve schema declares no approver field at all', () => {
    // A parse that silently dropped the field would also pass the test above; this asserts the
    // contract rather than one handler's behaviour.
    const parsed = approveBody.safeParse({
      manifestId: MANIFEST, expectedRevision: 2, scope: 'full',
      approvedBy: 'x', approver: 'y',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('unreachable');
    expect(Object.keys(parsed.data).sort()).toEqual(['expectedRevision', 'manifestId', 'scope']);
  });
});
