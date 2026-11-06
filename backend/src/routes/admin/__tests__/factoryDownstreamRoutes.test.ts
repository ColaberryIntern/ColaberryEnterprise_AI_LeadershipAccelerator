/**
 * L10.9 - the two routes that give the flow renderer and the delivery bridge a caller.
 *
 * WHAT THESE TESTS ARE FOR. The bug this router fixes was not a wrong result, it was NO CALLER:
 * both modules were correct, tested, deployed and referenced by nothing. So the thing worth
 * pinning is that the HTTP path actually reaches them and returns their real output - not that
 * the modules work, which their own suites already prove.
 *
 * `loadFactoryProject` is mocked rather than the three models, because this router's job is
 * routing, not loading; the loader has its own tests pinning the track-selection rule.
 */
import fs from 'fs';
import path from 'path';

const requireSection = jest.fn((section?: string) => Object.assign(
  (req: any, _res: any, next: any) => { req.admin = { email: 'admin@test' }; next(); },
  { section },
));
jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: (...a: any[]) => requireSection(...a) }));

const loadFactoryProject = jest.fn();
jest.mock('../../../services/lifecycle/generation/gatherCompositionInput', () => ({
  loadFactoryProject: (...a: any[]) => loadFactoryProject(...a),
}));

import express from 'express';
import request from 'supertest';
import router from '../factoryDownstreamRoutes';

const app = express();
app.use(express.json());
app.use(router);

/**
 * Captured at IMPORT time, before any `clearAllMocks`.
 *
 * The router registers its guards when the module loads, so reading `requireSection.mock.calls`
 * inside a test reads a list `beforeEach` has already emptied - which looks exactly like an
 * ungated router.
 */
const GUARD_SECTIONS = requireSection.mock.calls.map((c) => c[0]);

const ID = '80b35be2-a0e9-4068-945b-328e9438bbc7';

/**
 * A decomposition shaped like Herriman's stored one: an AI task in a named team with a human
 * approver, and a human task on the single console. Small, but it exercises every branch the
 * renderer has a visual rule for, so a blank SVG cannot pass.
 */
function project(over: Record<string, unknown> = {}) {
  return {
    delivery_project_id: ID,
    // Titles kept SHORT on purpose: the renderer wraps a long title across several <text>
    // elements, so asserting on a long string would fail for a layout reason and read as a
    // missing title. `source_evidence` is the citation field - not `citations`, which is the
    // guess that cost two probes.
    tasks: [
      { id: 't-compile', kind: 'TASK', title: 'Compile Bid', method: 'LLM', source_evidence: ['blk-1'] },
      { id: 't-review', kind: 'TASK', title: 'Review Bid', method: 'HUMAN', source_evidence: ['blk-2'] },
    ],
    allocation: [
      { task_id: 't-compile', execution_class: 'ai_with_approval', rationale: 'drafting' },
      { task_id: 't-review', execution_class: 'human', rationale: 'judgment' },
    ],
    roles: [{ id: 'role-pm', name: 'Proposal Manager', definition: 'owns the bid' }],
    assignments: [
      { task_id: 't-compile', role_id: 'role-pm', responsibility: 'PERFORMER', executor: { type: 'agent', id: 'a1' } },
      { task_id: 't-compile', role_id: 'role-pm', responsibility: 'APPROVER', executor: { type: 'person', id: 'p1' } },
      { task_id: 't-review', role_id: 'role-pm', responsibility: 'PERFORMER', executor: { type: 'person', id: 'p1' } },
    ],
    transitions: [],
    processes: [],
    requirements: [],
    role_map: [],
    source_blocks: [],
    agent_teams: [{
      id: 'team-doc', name: 'Docs', subject: 'Documentation',
      task_ids: ['t-compile'], approver_role_id: 'role-pm',
      execution_policy: 'agent_with_review', approval_policy: 'internal_review',
      autonomy_stage: null, trust_dimensions: [],
    }],
    surfaces: [{ id: 'surf', name: 'Bid Console', kind: 'console', task_ids: ['t-review'] }],
    ...over,
  };
}

const loaded = (over: Record<string, unknown> = {}) => ({
  ok: true, project: project(over), documentVersion: 1, trackType: 'solution_build',
  approvalStatus: 'draft', hadSourceBlocks: true,
});

beforeEach(() => {
  jest.clearAllMocks();
  loadFactoryProject.mockResolvedValue(loaded());
});

describe('GET /contract/:id/flow — the renderer finally has a caller', () => {
  it('returns the rendered SVG for the stored decomposition', async () => {
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/flow`);
    expect(res.status).toBe(200);
    expect(res.body.svg).toMatch(/^<svg/);
    expect(res.body.svg).toContain('</svg>');
    expect(loadFactoryProject).toHaveBeenCalledWith(ID);
  });

  it('renders the real content, not an empty frame', async () => {
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/flow`);
    // The task titles and the team subject are what make it a flow rather than a blank canvas.
    expect(res.body.svg).toContain('Compile Bid');
    expect(res.body.svg).toContain('Documentation');
    expect(res.body.svg).toContain('Bid Console');
  });

  it('carries the document version, so a reader knows which revision they are looking at', async () => {
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/flow`);
    expect(res.body).toMatchObject({ documentVersion: 1, trackType: 'solution_build', approvalStatus: 'draft' });
  });

  it('404s when nothing has been generated, rather than rendering an empty diagram', async () => {
    loadFactoryProject.mockResolvedValue({ ok: false, reason: 'no_decomposition' });
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/flow`);
    expect(res.status).toBe(404);
    expect(res.body.svg).toBeUndefined();
  });

  it('400s a non-uuid id without touching the loader', async () => {
    const res = await request(app).get('/api/admin/factory/contract/not-a-uuid/flow');
    expect(res.status).toBe(400);
    expect(loadFactoryProject).not.toHaveBeenCalled();
  });

  it('500s without leaking the error when the loader throws', async () => {
    loadFactoryProject.mockRejectedValue(new Error('connection terminated: secret-dsn'));
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/flow`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret-dsn');
  });
});

describe('GET /contract/:id/delivery — the bridge finally has a caller', () => {
  it('returns stories carrying the five contract fields', async () => {
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/delivery`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.stories)).toBe(true);
    expect(res.body.stories.length).toBeGreaterThan(0);
    for (const key of ['executionPolicy', 'approvalPolicy', 'trustDimensions', 'riskLevel', 'evidenceRequired']) {
      expect(Object.keys(res.body.stories[0])).toContain(key);
    }
  });

  it('reports the release verdict and the deployment refusals, which are different questions', async () => {
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/delivery`);
    expect(res.body.release).toBeDefined();
    // assertDeploymentAuthorized always returns at least one refusal by policy: ready is not authorized.
    expect(Array.isArray(res.body.deploymentRefusals)).toBe(true);
    expect(res.body.deploymentRefusals.length).toBeGreaterThan(0);
  });

  it('surfaces REQUIREMENT_LINK_UNAVAILABLE rather than passing block ids off as requirement ids', async () => {
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/delivery`);
    const rules = (res.body.gaps ?? []).map((g: any) => g.rule);
    expect(rules).toContain('REQUIREMENT_LINK_UNAVAILABLE');
  });

  it('defaults to the commercial_standard profile and echoes which one was used', async () => {
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/delivery`);
    expect(res.body.profileKey).toBe('commercial_standard');
  });

  it('accepts a known profile', async () => {
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/delivery?profileKey=internal_tool`);
    expect(res.status).toBe(200);
    expect(res.body.profileKey).toBe('internal_tool');
  });

  /**
   * THE REASON THE PROFILE IS VALIDATED AT ALL. `mandatoryChecksFor` falls back to the full
   * check list for a key it does not know, so a typo would silently change which checks a
   * release is judged against and the response would look completely ordinary.
   */
  it('400s an unknown profile instead of silently widening the mandatory checks', async () => {
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/delivery?profileKey=comercial_standard`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unknown release profile');
  });

  it('404s when nothing has been generated', async () => {
    loadFactoryProject.mockResolvedValue({ ok: false, reason: 'no_decomposition' });
    const res = await request(app).get(`/api/admin/factory/contract/${ID}/delivery`);
    expect(res.status).toBe(404);
  });
});

describe('the gate', () => {
  it('section-gates both routes behaviourally', () => {
    expect(GUARD_SECTIONS).toEqual(['program', 'program']);
  });

  /** The route-auth lint is a required CI check; this pins the guard at the source too. */
  it('declares requireSection(program) on every route in the source', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'factoryDownstreamRoutes.ts'), 'utf8');
    const routes = src.match(/^router\.get\(/gm) ?? [];
    // Matched at the CALL SITE shape (newline, indent, trailing comma) so the header comment,
    // which also names the guard, is not counted as a third route.
    const guards = src.match(/^ {2}requireSection\('program'\),$/gm) ?? [];
    expect(routes.length).toBe(2);
    expect(guards.length).toBe(routes.length);
  });

  /**
   * The bridge never manufactures check results, so the route must not accept them from a
   * caller - otherwise a request could declare its own release green.
   */
  it('does not read checkResults from the request', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'factoryDownstreamRoutes.ts'), 'utf8');
    expect(src).not.toMatch(/checkResults:\s*(req\.|parsed)/);
  });
});
