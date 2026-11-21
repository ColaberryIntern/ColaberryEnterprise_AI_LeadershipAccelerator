/**
 * The authenticated publish control: who may publish what, and in which order.
 *
 * Two properties carry this file.
 *
 * 1. HORIZONTAL AUTHORIZATION. The project id is an explicit parameter, so it can be pointed at
 *    somebody else's project. It is authorized rather than trusted, and the sibling's state is
 *    asserted unchanged afterwards - a 403 that still performed the write is not a 403.
 * 2. MULTI-PROJECT. An enrollment can own several projects (`models/Project.ts:164-166`), and the
 *    portfolio precedent resolves the target with an unordered `findOne` on `enrollment_id` and
 *    no archived filter. The test at the bottom is the one that precedent would fail, and it is
 *    the whole reason this service exists rather than a copy of it.
 *
 * The producer is spied rather than stubbed away, because the third thing this file has to prove
 * is that `generateConnectedDemo` is CALLED from production code at all. Until this route landed
 * it had zero importers outside its own test.
 */
const generateConnectedDemo = jest.fn();
jest.mock('../sbp/connectedDemoStore', () => ({
  __esModule: true,
  generateConnectedDemo: (...a: unknown[]) => generateConnectedDemo(...a),
}));

const getPublishedPlan = jest.fn();
jest.mock('../sbp/planStore', () => ({
  __esModule: true,
  getPublishedPlan: (...a: unknown[]) => getPublishedPlan(...a),
}));

const findByPk = jest.fn();
jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => findByPk(...a) },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
import {
  getConnectedDemoShare,
  setConnectedDemoShare,
  ConnectedDemoShareError,
  SetConnectedDemoShareSchema,
} from '../connectedDemoShareService';

type Loose = Record<string, unknown>;

const OWNER = 'enr-owner-0000';
const STRANGER = 'enr-stranger-11';
// Valid v4 UUIDs: version nibble 4, variant nibble 8-b. Zod 4's .uuid() enforces BOTH, and the
// first version of these fixtures used 1111-1111 throughout, which has an invalid variant and
// made every schema assertion fail for a reason that had nothing to do with the schema.
const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '22222222-2222-4222-9222-222222222222';

/** A fake project row with the two methods the service uses. */
function fakeProject(over: Loose = {}) {
  const row: Loose = {
    id: PROJECT_A,
    enrollment_id: OWNER,
    archived_at: null,
    demo_share_enabled: false,
    demo_share_token: 'tok-a',
    demo_spec: null,
    ...over,
  };
  row.update = jest.fn(async (patch: Loose) => { Object.assign(row, patch); return row; });
  row.reload = jest.fn(async () => row);
  return row;
}

const SPEC = { schema_version: 2, events: [{ event_id: 'e1' }, { event_id: 'e2' }] };

const DATA_MODEL = { app_name: 'Dispatch console', tables: [{ name: 'shift' }] };

beforeEach(() => {
  generateConnectedDemo.mockReset();
  getPublishedPlan.mockReset();
  findByPk.mockReset();
  getPublishedPlan.mockResolvedValue({
    plan: { project_name: 'p', descriptor: 'd', requirements: [], releases: [], stories: [] },
    plan_sha256: 'abc123def456',
    version: 3,
  });
});

describe('authorization', () => {
  it('404s a project that does not exist', async () => {
    findByPk.mockResolvedValue(null);
    await expect(getConnectedDemoShare(OWNER, PROJECT_A)).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
  });

  it('404s an ARCHIVED project, because it is not theirs to publish any more', async () => {
    // Not 403: "forbidden" would imply somebody else may publish it.
    findByPk.mockResolvedValue(fakeProject({ archived_at: new Date() }));
    await expect(getConnectedDemoShare(OWNER, PROJECT_A)).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
  });

  it('403s a project owned by another enrollment', async () => {
    findByPk.mockResolvedValue(fakeProject({ enrollment_id: OWNER }));
    await expect(getConnectedDemoShare(STRANGER, PROJECT_A)).rejects.toMatchObject({
      error_class: 'ForbiddenError',
    });
  });

  it('HORIZONTAL: a 403 on publish leaves the target UNCHANGED', async () => {
    // A 403 that still performed the write is not a 403. This is the assertion that says so.
    const victim = fakeProject({ enrollment_id: OWNER, demo_share_enabled: false });
    findByPk.mockResolvedValue(victim);

    await expect(
      setConnectedDemoShare(STRANGER, { project_id: PROJECT_A, enabled: true, data_model: DATA_MODEL }),
    ).rejects.toMatchObject({ error_class: 'ForbiddenError' });

    expect(victim.demo_share_enabled).toBe(false);
    expect(victim.update).not.toHaveBeenCalled();
    expect(generateConnectedDemo).not.toHaveBeenCalled();
  });

  it('HORIZONTAL: a 403 on revoke cannot turn somebody else\'s demo off either', async () => {
    const victim = fakeProject({ enrollment_id: OWNER, demo_share_enabled: true, demo_spec: SPEC });
    findByPk.mockResolvedValue(victim);
    await expect(
      setConnectedDemoShare(STRANGER, { project_id: PROJECT_A, enabled: false }),
    ).rejects.toMatchObject({ error_class: 'ForbiddenError' });
    expect(victim.demo_share_enabled).toBe(true);
  });

  it('lets the OWNER through, so the refusals above are not refusing everyone', async () => {
    findByPk.mockResolvedValue(fakeProject({ demo_spec: SPEC }));
    await expect(getConnectedDemoShare(OWNER, PROJECT_A)).resolves.toMatchObject({
      project_id: PROJECT_A,
    });
  });
});

describe('MULTI-PROJECT: the test the portfolio precedent would fail', () => {
  it('publishes exactly the project named, and leaves the sibling alone', async () => {
    // One enrollment, two live projects. The precedent resolves with an unordered
    // `findOne({ where: { enrollment_id } })`, so it would publish whichever row came back first.
    const a = fakeProject({ id: PROJECT_A, demo_spec: SPEC, demo_share_token: 'tok-a' });
    const b = fakeProject({ id: PROJECT_B, demo_spec: SPEC, demo_share_token: 'tok-b' });
    findByPk.mockImplementation(async (id: string) => (id === PROJECT_A ? a : b));

    const result = await setConnectedDemoShare(OWNER, { project_id: PROJECT_B, enabled: true });

    expect(result.project_id).toBe(PROJECT_B);
    expect(b.demo_share_enabled).toBe(true);
    // The one that matters: the sibling is untouched.
    expect(a.demo_share_enabled).toBe(false);
    expect(a.update).not.toHaveBeenCalled();
    expect(result.url).toContain('tok-b');
    expect(result.url).not.toContain('tok-a');
  });

  it('looks the project up BY ID, not by enrollment', async () => {
    findByPk.mockResolvedValue(fakeProject({ demo_spec: SPEC }));
    await getConnectedDemoShare(OWNER, PROJECT_A);
    expect(findByPk).toHaveBeenCalledWith(PROJECT_A);
  });
});

describe('publishing generates first, and that ordering is the invariant', () => {
  it('CALLS generateConnectedDemo when the project has no spec: the production call site', async () => {
    const project = fakeProject({ demo_spec: null });
    findByPk.mockResolvedValue(project);
    generateConnectedDemo.mockImplementation(async () => {
      project.demo_spec = SPEC; // what the real producer persists
      return { shareToken: 'tok-a', shareEnabled: false, spec: SPEC, eventCount: 2 };
    });

    await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true, data_model: DATA_MODEL });

    expect(generateConnectedDemo).toHaveBeenCalledTimes(1);
    const arg = generateConnectedDemo.mock.calls[0][0] as Loose;
    expect(arg.projectId).toBe(PROJECT_A);
    expect(arg.dataModel).toBe(DATA_MODEL);
    expect(arg.planSha).toBe('abc123def456');
    expect(arg.planVersion).toBe('3');
  });

  it('generates BEFORE it enables, so the row is never published with nothing to serve', async () => {
    const order: string[] = [];
    const project = fakeProject({ demo_spec: null });
    project.update = jest.fn(async (patch: Loose) => {
      if (patch.demo_share_enabled === true) order.push('enable');
      Object.assign(project, patch);
      return project;
    });
    findByPk.mockResolvedValue(project);
    generateConnectedDemo.mockImplementation(async () => {
      order.push('generate');
      project.demo_spec = SPEC;
      return { shareToken: 'tok-a', shareEnabled: false, spec: SPEC, eventCount: 2 };
    });

    await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true, data_model: DATA_MODEL });
    expect(order).toEqual(['generate', 'enable']);
  });

  it('does NOT regenerate when a spec already exists', async () => {
    findByPk.mockResolvedValue(fakeProject({ demo_spec: SPEC }));
    await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true });
    expect(generateConnectedDemo).not.toHaveBeenCalled();
  });

  it('REFUSES to enable a specless project with no data model, and enables nothing', async () => {
    const project = fakeProject({ demo_spec: null });
    findByPk.mockResolvedValue(project);
    await expect(
      setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true }),
    ).rejects.toMatchObject({ error_class: 'DataModelRequired' });
    expect(project.demo_share_enabled).toBe(false);
    expect(project.update).not.toHaveBeenCalled();
  });

  it('refuses when there is no published plan to build from, and enables nothing', async () => {
    const project = fakeProject({ demo_spec: null });
    findByPk.mockResolvedValue(project);
    getPublishedPlan.mockResolvedValue(null);
    await expect(
      setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true, data_model: DATA_MODEL }),
    ).rejects.toMatchObject({ error_class: 'NotFoundError' });
    expect(project.demo_share_enabled).toBe(false);
  });

  it('a producer refusal does NOT leave the project enabled', async () => {
    // The producer refuses an invalid data model or a spec carrying restricted values. That
    // refusal must not be followed by an enable.
    const project = fakeProject({ demo_spec: null });
    findByPk.mockResolvedValue(project);
    generateConnectedDemo.mockRejectedValue(
      Object.assign(new Error('nope'), { error_class: 'ConnectedDemoContentRefused' }),
    );
    await expect(
      setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true, data_model: DATA_MODEL }),
    ).rejects.toThrow('nope');
    expect(project.demo_share_enabled).toBe(false);
    expect(project.update).not.toHaveBeenCalled();
  });
});

describe('revoking', () => {
  it('turns the demo off and stops returning a url', async () => {
    const project = fakeProject({ demo_share_enabled: true, demo_spec: SPEC });
    findByPk.mockResolvedValue(project);
    const result = await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: false });
    expect(result.enabled).toBe(false);
    expect(result.url).toBeNull();
  });

  it('LEAVES the spec in place, so turning it back on is not a different demo', async () => {
    const project = fakeProject({ demo_share_enabled: true, demo_spec: SPEC });
    findByPk.mockResolvedValue(project);
    await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: false });
    expect(project.demo_spec).toBe(SPEC);
    expect(project.update).toHaveBeenCalledWith({ demo_share_enabled: false });
  });

  it('re-enables without regenerating, and the url comes back the same', async () => {
    const project = fakeProject({ demo_share_enabled: true, demo_spec: SPEC });
    findByPk.mockResolvedValue(project);
    const before = await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true });
    await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: false });
    const after = await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true });
    expect(after.url).toBe(before.url);
    expect(generateConnectedDemo).not.toHaveBeenCalled();
  });
});

describe('idempotency', () => {
  it('enabling twice lands in the same state and generates once', async () => {
    const project = fakeProject({ demo_spec: null });
    findByPk.mockResolvedValue(project);
    generateConnectedDemo.mockImplementation(async () => {
      project.demo_spec = SPEC;
      return { shareToken: 'tok-a', shareEnabled: false, spec: SPEC, eventCount: 2 };
    });

    const a = await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true, data_model: DATA_MODEL });
    const b = await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: true, data_model: DATA_MODEL });
    expect(a).toEqual(b);
    expect(generateConnectedDemo).toHaveBeenCalledTimes(1);
  });

  it('revoking twice is a no-op the second time', async () => {
    const project = fakeProject({ demo_share_enabled: true, demo_spec: SPEC });
    findByPk.mockResolvedValue(project);
    const a = await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: false });
    const b = await setConnectedDemoShare(OWNER, { project_id: PROJECT_A, enabled: false });
    expect(a).toEqual(b);
  });
});

describe('the reported state', () => {
  it('hides the url while the demo is off', async () => {
    findByPk.mockResolvedValue(fakeProject({ demo_share_enabled: false, demo_spec: SPEC }));
    const state = await getConnectedDemoShare(OWNER, PROJECT_A);
    expect(state.url).toBeNull();
    expect(state.has_spec).toBe(true);
  });

  it('counts the events, so the Command Center can say how much the demo shows', async () => {
    findByPk.mockResolvedValue(fakeProject({ demo_share_enabled: true, demo_spec: SPEC }));
    expect((await getConnectedDemoShare(OWNER, PROJECT_A)).event_count).toBe(2);
  });

  it('reports zero events and no spec for a project that has never generated one', async () => {
    findByPk.mockResolvedValue(fakeProject({ demo_spec: null }));
    const state = await getConnectedDemoShare(OWNER, PROJECT_A);
    expect(state).toMatchObject({ has_spec: false, event_count: 0, enabled: false, url: null });
  });

  it('never returns a url the public route would refuse', async () => {
    // Enabled but tokenless should not produce a link. The two halves travel together.
    findByPk.mockResolvedValue(fakeProject({ demo_share_enabled: true, demo_share_token: null, demo_spec: SPEC }));
    expect((await getConnectedDemoShare(OWNER, PROJECT_A)).url).toBeNull();
  });
});

describe('input validation', () => {
  it('requires a uuid project_id', () => {
    expect(SetConnectedDemoShareSchema.safeParse({ project_id: 'not-a-uuid', enabled: true }).success).toBe(false);
  });

  it('requires enabled to be a boolean, not a string', () => {
    expect(SetConnectedDemoShareSchema.safeParse({ project_id: PROJECT_A, enabled: 'true' }).success).toBe(false);
  });

  it('accepts a well-formed request with and without a data model', () => {
    expect(SetConnectedDemoShareSchema.safeParse({ project_id: PROJECT_A, enabled: false }).success).toBe(true);
    expect(SetConnectedDemoShareSchema.safeParse({ project_id: PROJECT_A, enabled: true, data_model: DATA_MODEL }).success).toBe(true);
  });

  it('carries a stable error_class on every refusal, so a route can map it to a status', () => {
    for (const cls of ['NotFoundError', 'ForbiddenError', 'DataModelRequired'] as const) {
      expect(new ConnectedDemoShareError(cls, 'x').error_class).toBe(cls);
    }
  });
});
