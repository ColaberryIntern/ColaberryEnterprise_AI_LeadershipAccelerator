import {
  generateGovBuildPlanAI, assembleGovDatedPlan, __clearGovBuildPlanAICache,
  type GovBuildPlanAIRequest,
} from '../govBuildPlanAI';
import type { BuildPlan } from '../../sbp/planContract';

jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
import { getInstrumentedOpenAI } from '../../openaiInstrumented';

// A minimal, plan-shaped BuildPlan (passes decomposeService.isPlanShaped) returned by the fake model.
const PLAN: BuildPlan = {
  project_name: 'TxDOT Claims Search DB',
  descriptor: 'An auto/property/casualty claims search database service',
  requirements: [{ id: 'REQ-001', statement: 'Exchange work orders with the agency system', kind: 'FUNC', priority: 'must', cluster: 'Integration', from_dimensions: [] }],
  releases: [
    { key: 'r0', name: 'Walking skeleton', goal: 'thin end-to-end', demo: 'audit trail holds', week_start: 1, week_end: 2 },
    { key: 'r1', name: 'Operator dashboard', goal: 'roles', demo: 'role-based access', week_start: 3, week_end: 4 },
  ],
  stories: [
    { id: 'STORY-001', release: 'r0', title: 'Exchange a work order', narrative: 'As an operator…', fulfills: ['REQ-001'], owner_agent: 'Integrator', acceptance: ['Given a work order', 'When it is sent', 'Trust the exchange is audit-logged'], task_guidance: 'POST to the agency endpoint', failure_paths: ['endpoint down'], blocked_by: [] },
    { id: 'STORY-002', release: 'r1', title: 'Role-based dashboard', narrative: 'As an admin…', fulfills: ['REQ-001'], owner_agent: 'UI', acceptance: ['Given a role', 'When I sign in', 'Trust access is checked server-side'], task_guidance: 'guard routes by role', failure_paths: ['missing role'], blocked_by: ['STORY-001'] },
  ],
};

const fakeClient = (createImpl: () => any) => ({ chat: { completions: { create: jest.fn(createImpl) } } });
const okCreate = () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(PLAN) } }] });

const baseReq: GovBuildPlanAIRequest = {
  requirements: [{ id: 'REQ-001', text: 'Exchange work orders with the agency system' }],
  title: 'Claims Search DB', buyer: 'TxDOT', buildSpec: 'A lengthy spec.', deadline: '2026-10-19', now: '2026-10-01',
};

describe('govBuildPlanAI (advisory, reuses the SBP engine, fail-soft)', () => {
  const OLD = process.env.OPENAI_API_KEY;
  beforeEach(() => { __clearGovBuildPlanAICache(); (getInstrumentedOpenAI as jest.Mock).mockReset(); process.env.OPENAI_API_KEY = 'test-key'; });
  afterAll(() => { if (OLD === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = OLD; });

  it('no API key → error, never calls the model', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await generateGovBuildPlanAI(baseReq);
    expect(r.error).toBeTruthy();
    expect(r.plan).toBeNull();
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });

  it('empty requirements → error, never calls the model', async () => {
    const r = await generateGovBuildPlanAI({ ...baseReq, requirements: [] });
    expect(r.error).toBeTruthy();
    expect(getInstrumentedOpenAI).not.toHaveBeenCalled();
  });

  it('success → a dated plan; every story has a due date on/before the deadline, every release a window', async () => {
    const client = fakeClient(okCreate);
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    const r = await generateGovBuildPlanAI(baseReq);
    expect(r.error).toBeUndefined();
    expect(r.plan).not.toBeNull();
    expect(r.plan!.stories[0].id).toBe('STORY-000');            // the Command Center leads the preview
    expect(r.plan!.stories).toHaveLength(3);                    // STORY-000 + the 2 plan stories
    expect(r.plan!.releases).toHaveLength(2);
    for (const s of r.plan!.stories) {
      expect(s.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.dueDate <= '2026-10-19').toBe(true);          // the deadline rail
      expect(Array.isArray(s.acceptance)).toBe(true);
    }
    for (const rel of r.plan!.releases) {
      expect(rel.startDate <= rel.endDate).toBe(true);
      expect(rel.endDate <= '2026-10-19').toBe(true);
    }
    expect(r.cached).toBe(false);
  });

  it('caches by input hash — a second identical call does not re-call the model', async () => {
    const client = fakeClient(okCreate);
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    expect((await generateGovBuildPlanAI(baseReq)).cached).toBe(false);
    const afterFirst = client.chat.completions.create.mock.calls.length; // decompose (+ any gate/repair passes)
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    expect((await generateGovBuildPlanAI(baseReq)).cached).toBe(true);
    expect(client.chat.completions.create).toHaveBeenCalledTimes(afterFirst); // the 2nd call hit the cache — no new model calls
  });

  it('a decomposition error returns an error field, not a throw (fails soft)', async () => {
    const client = fakeClient(() => Promise.reject(new Error('boom')));
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    const r = await generateGovBuildPlanAI({ ...baseReq, now: '2026-10-02' }); // different input → dodge cache
    expect(r.error).toBeTruthy();
    expect(r.plan).toBeNull();
  });

  it('a plan with blocking gate violations it cannot repair → error (fail closed, never a broken plan)', async () => {
    // REQ-999 is a `must` requirement no story fulfills → must_uncovered (a BLOCKING gate rule); the fake model
    // cannot repair it, so after the repair passes the plan is still not publishable and the service must error.
    const PLAN_BAD: BuildPlan = {
      ...PLAN,
      requirements: [...PLAN.requirements, { id: 'REQ-999', statement: 'An uncovered must-have', kind: 'FUNC', priority: 'must', cluster: 'Gap', from_dimensions: [] }],
    };
    const client = fakeClient(() => Promise.resolve({ choices: [{ message: { content: JSON.stringify(PLAN_BAD) } }] }));
    (getInstrumentedOpenAI as jest.Mock).mockReturnValue(client);
    const r = await generateGovBuildPlanAI({ ...baseReq, title: 'Blocking plan case' }); // distinct input → own cache
    expect(r.error).toBeTruthy();
    expect(r.plan).toBeNull();
  });
});

describe('assembleGovDatedPlan (pure, deterministic)', () => {
  it('places every story on/before the deadline and orders release windows', () => {
    const { plan, verdict } = assembleGovDatedPlan(PLAN, new Date('2026-10-19'), new Date('2026-10-01'));
    expect(typeof verdict).toBe('string');
    expect(plan.stories.every((s) => s.dueDate <= '2026-10-19')).toBe(true);
    const last = plan.stories.map((s) => s.dueDate).sort().slice(-1)[0];
    expect(last <= '2026-10-19').toBe(true);                 // the load-bearing deadline rail
    expect(plan.releases.every((r) => r.startDate <= r.endDate)).toBe(true);
    expect(plan.unscheduled).toBe(false);
  });

  it('no deadline → unscheduled flag, still a valid dated plan', () => {
    const { plan } = assembleGovDatedPlan(PLAN, null, new Date('2026-10-01'));
    expect(plan.unscheduled).toBe(true);
    expect(plan.stories.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.dueDate))).toBe(true);
  });

  it('a TIGHT deadline (2 days out) still clamps every due date on/before it — the clamp rail', () => {
    // The raw schedule window would run ~a week out; the clamp forces every due date ≤ the deadline.
    const { plan } = assembleGovDatedPlan(PLAN, new Date('2026-10-03'), new Date('2026-10-01'));
    expect(plan.stories.every((s) => s.dueDate <= '2026-10-03')).toBe(true);
    expect(plan.releases.every((r) => r.endDate <= '2026-10-03')).toBe(true);
  });
});
