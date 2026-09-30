/**
 * planHash (pure) and planStore (I/O, with sequelize mocked).
 *
 * The invariant under test is the one the pilot broke: the plan a human reviews
 * must be the plan that ships. `publishPlan` promotes an existing row and never
 * regenerates, and a hash re-check makes a silent substitution impossible.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => mockQuery(...a) } }));

import { hashPlan, canonicalPlanJson } from '../planHash';
import { savePlanDraft, publishPlan, getPlan, saveIntake, PlanStoreError } from '../planStore';
import { BuildPlan } from '../planContract';
import { GateResult } from '../planGate';

const plan: BuildPlan = {
  project_name: 'Sponsor Dashboard',
  descriptor: 'Corporate seat management',
  requirements: [{ id: 'REQ-001', statement: 'A manager can build a roster.', kind: 'FUNC', priority: 'must', cluster: 'Roster' }],
  releases: [{ key: 'r0', name: 'Skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [{
    id: 'STORY-001', release: 'r0', title: 'Manager builds a roster',
    narrative: 'As a manager, I want to add employees, so that I can buy seats.',
    fulfills: ['REQ-001'], owner_agent: 'Roster',
    acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Trust - audited.'],
    task_guidance: 'g', failure_paths: ['x'], blocked_by: [],
  }],
};

const passingGate: GateResult = { ok: true, violations: [] };
const row = (over: Record<string, unknown> = {}) => ({
  id: 'p1', project_id: 'proj-1', version: 1, status: 'draft',
  plan_json: plan, plan_sha256: hashPlan(plan), gate_ok: true, gate_violations: [],
  model: 'gpt-4o', attempts: 1, correlation_id: null, published_at: null, created_at: 'now',
  ...over,
});

beforeEach(() => mockQuery.mockReset());

// ── the hash is the identity ────────────────────────────────────────────────
describe('planHash', () => {
  it('is stable across runs', () => {
    expect(hashPlan(plan)).toBe(hashPlan(plan));
  });

  it('ignores key ORDER — a reordered but identical plan hashes the same', () => {
    const reordered = {
      stories: plan.stories, releases: plan.releases,
      descriptor: plan.descriptor, requirements: plan.requirements,
      project_name: plan.project_name,
    } as BuildPlan;
    expect(hashPlan(reordered)).toBe(hashPlan(plan));
  });

  it('changes when any content changes', () => {
    const altered: BuildPlan = { ...plan, stories: [{ ...plan.stories[0], title: 'Different' }] };
    expect(hashPlan(altered)).not.toBe(hashPlan(plan));
  });

  it('changes when a story moves release — the skew defect must be detectable', () => {
    const moved: BuildPlan = { ...plan, stories: [{ ...plan.stories[0], release: 'r1' }] };
    expect(hashPlan(moved)).not.toBe(hashPlan(plan));
  });

  it('produces canonical JSON with sorted keys', () => {
    expect(canonicalPlanJson(plan).indexOf('"descriptor"'))
      .toBeLessThan(canonicalPlanJson(plan).indexOf('"project_name"'));
  });
});

// ── save ────────────────────────────────────────────────────────────────────
describe('savePlanDraft', () => {
  it('stores the plan with its hash as a draft', async () => {
    mockQuery.mockResolvedValueOnce([row()]);
    const stored = await savePlanDraft('proj-1', plan, { gate: passingGate, model: 'gpt-4o', attempts: 1 });
    expect(stored.status).toBe('draft');
    expect(stored.plan_sha256).toBe(hashPlan(plan));
  });

  it('lets the database pick the next version, so concurrent saves cannot collide', async () => {
    mockQuery.mockResolvedValueOnce([row({ version: 3 })]);
    await savePlanDraft('proj-1', plan, { gate: passingGate });
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(/COALESCE\(MAX\(version\), 0\) \+ 1/);
  });

  it('records the gate outcome alongside the plan', async () => {
    mockQuery.mockResolvedValueOnce([row({ gate_ok: false })]);
    const failing: GateResult = { ok: false, violations: [{ rule: 'release_unbalanced', message: 'r0 holds 8' }] };
    await savePlanDraft('proj-1', plan, { gate: failing });
    const opts = mockQuery.mock.calls[0][1];
    expect(opts.replacements.gateOk).toBe(false);
    expect(JSON.parse(opts.replacements.violations)[0].rule).toBe('release_unbalanced');
  });
});

// ── publish: the invariant ──────────────────────────────────────────────────
describe('publishPlan — the reviewed plan is the published plan', () => {
  it('promotes the SAME row and never regenerates', async () => {
    mockQuery
      .mockResolvedValueOnce([row()])                                        // getPlan
      .mockResolvedValueOnce([row({ status: 'published', published_at: 'now' })])  // UPDATE
      .mockResolvedValueOnce([]);                                            // supersede
    const published = await publishPlan('proj-1', 1, hashPlan(plan));
    expect(published.status).toBe('published');
    // Byte-identical: what was reviewed is what shipped.
    expect(hashPlan(published.plan)).toBe(hashPlan(plan));
    // No INSERT anywhere — nothing was regenerated.
    for (const call of mockQuery.mock.calls) expect(String(call[0])).not.toMatch(/INSERT INTO build_plans/);
  });

  it('REFUSES to publish when the stored plan changed since review', async () => {
    const tampered: BuildPlan = { ...plan, stories: [{ ...plan.stories[0], title: 'Swapped' }] };
    mockQuery.mockResolvedValueOnce([row({ plan_json: tampered, plan_sha256: hashPlan(tampered) })]);
    await expect(publishPlan('proj-1', 1, hashPlan(plan)))
      .rejects.toMatchObject({ error_class: 'HashMismatch' });
  });

  it('fails clearly when the version does not exist', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(publishPlan('proj-1', 9)).rejects.toBeInstanceOf(PlanStoreError);
  });

  it('is idempotent — republishing returns the same row without a second UPDATE', async () => {
    mockQuery.mockResolvedValueOnce([row({ status: 'published', published_at: 'earlier' })]);
    const result = await publishPlan('proj-1', 1);
    expect(result.published_at).toBe('earlier');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('supersedes any previously published version', async () => {
    mockQuery
      .mockResolvedValueOnce([row({ version: 2 })])
      .mockResolvedValueOnce([row({ version: 2, status: 'published' })])
      .mockResolvedValueOnce([]);
    await publishPlan('proj-1', 2);
    expect(String(mockQuery.mock.calls[2][0])).toMatch(/status = 'superseded'/);
  });
});

// ── read ────────────────────────────────────────────────────────────────────
describe('getPlan', () => {
  it('returns the latest version when none is given', async () => {
    mockQuery.mockResolvedValueOnce([row({ version: 4 })]);
    const p = await getPlan('proj-1');
    expect(p?.version).toBe(4);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/ORDER BY version DESC/);
  });

  it('returns null rather than throwing when there is no plan', async () => {
    mockQuery.mockResolvedValueOnce([]);
    expect(await getPlan('proj-1')).toBeNull();
  });
});

// ── intake ──────────────────────────────────────────────────────────────────
describe('saveIntake', () => {
  it('is idempotent on project_id — a re-submit updates rather than stacks', async () => {
    mockQuery.mockResolvedValueOnce([{ project_id: 'proj-1', status: 'captured' }]);
    await saveIntake({ project_id: 'proj-1', idea: 'a sponsor dashboard' });
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/ON CONFLICT \(project_id\) DO UPDATE/);
  });

  it('stores the idea verbatim — the brain-dump is the point', async () => {
    const idea = 'A'.repeat(4000);
    mockQuery.mockResolvedValueOnce([{ project_id: 'proj-1', status: 'captured' }]);
    await saveIntake({ project_id: 'proj-1', idea });
    expect(mockQuery.mock.calls[0][1].replacements.idea).toBe(idea);
    expect(mockQuery.mock.calls[0][1].replacements.idea).toHaveLength(4000);
  });

  it('defaults size and status without inventing other values', async () => {
    mockQuery.mockResolvedValueOnce([{ project_id: 'proj-1', status: 'captured' }]);
    await saveIntake({ project_id: 'proj-1', idea: 'x' });
    const r = mockQuery.mock.calls[0][1].replacements;
    expect(r.size).toBe('project');
    expect(r.status).toBe('captured');
    expect(r.users).toBeNull();
    expect(r.target_weeks).toBeNull();
  });
});
