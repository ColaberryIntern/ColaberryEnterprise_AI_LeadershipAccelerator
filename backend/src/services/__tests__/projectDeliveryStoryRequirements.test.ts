/**
 * A story's requirements, on the delivery board.
 *
 * Ali, 2026-09-29: "I would even like to be able to see the story requirements
 * if I click on it."
 *
 * The traceability already existed and nothing read it back: materializeTasks
 * writes the plan story's `fulfills` onto the task row, and the gantt payload
 * selected neither it nor `acceptance`. The statements live one table further
 * out, in the published plan, so the two are joined here rather than in the
 * browser.
 *
 * What these defend is the degraded case. Plenty of projects have no published
 * plan — every hand-authored one, and everything imported before the pipeline —
 * and for those the honest answer is the requirement ID with no sentence, never
 * a blank line and never an error.
 */
const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
// `projectReleaseMeta` is deliberately NOT mocked: it has no imports at all, so
// it reaches no database and there is nothing to isolate. Stubbing it by hand
// cost a run when the factory omitted `extractLandsWhen` — a partial mock
// factory silently deletes every export it does not name.

import { getProjectGantt } from '../projectDeliveryDetail';

const PROJECT = 'proj-1';

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1', title: 'Ingest the listing feed', status: 'not_started',
  release_key: 'r0', due_on: '2026-10-01', due_baseline_on: '2026-10-01',
  verified_at: null, blocked_by: [], narrative: 'As an agent…',
  fulfills: ['REQ-001'], acceptance: ['Given a feed, when it syncs, then rows land.'],
  build: '', position: 0, ...over,
});

/** tasks query, release titles query, then the published-plan lookup. */
const respond = (tasks: unknown[], planJson: unknown | undefined) => {
  mockQuery.mockReset();
  mockQuery
    .mockResolvedValueOnce(tasks)                                   // student_tasks
    .mockResolvedValueOnce([])                                      // release titles
    .mockResolvedValueOnce(planJson === undefined ? [] : [{ plan_json: planJson }]);
};

beforeEach(() => jest.clearAllMocks());

describe('the story carries its own traceability', () => {
  it('selects fulfills and acceptance, which nothing read before', async () => {
    respond([task()], undefined);
    await getProjectGantt(PROJECT);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('fulfills');
    expect(sql).toContain('acceptance');
  });

  it('returns them on the task', async () => {
    respond([task()], undefined);
    const g = await getProjectGantt(PROJECT);
    const t = g.releases.flatMap((r) => r.tasks)[0];
    expect(t.fulfills).toEqual(['REQ-001']);
    expect(t.acceptance).toEqual(['Given a feed, when it syncs, then rows land.']);
  });

  it('answers an empty array, never null, when the columns hold nothing', async () => {
    // A task written by the manual import path has neither. An empty array is
    // the honest "which requirements" answer; null would make every consumer
    // guard for it.
    respond([task({ fulfills: null, acceptance: undefined })], undefined);
    const t = (await getProjectGantt(PROJECT)).releases.flatMap((r) => r.tasks)[0];
    expect(t.fulfills).toEqual([]);
    expect(t.acceptance).toEqual([]);
  });
});

describe('the requirement statements', () => {
  it('come from the PUBLISHED plan, keyed by id', async () => {
    respond([task()], {
      requirements: [
        { id: 'REQ-001', statement: 'An agent sees listing velocity by street.' },
        { id: 'REQ-002', statement: 'Stale prices are never shown.' },
      ],
    });
    const g = await getProjectGantt(PROJECT);
    expect(g.requirements['REQ-001']).toBe('An agent sees listing velocity by street.');
    expect(g.requirements['REQ-002']).toBe('Stale prices are never shown.');
  });

  it('asks only for the published plan, newest version', async () => {
    respond([task()], undefined);
    await getProjectGantt(PROJECT);
    const sql = String(mockQuery.mock.calls[2][0]);
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain('ORDER BY version DESC');
  });

  it('is empty for a project with no published plan, rather than an error', async () => {
    // Every hand-authored project is this case. The board must still render,
    // and the story must still show its requirement IDS.
    respond([task()], undefined);
    const g = await getProjectGantt(PROJECT);
    expect(g.requirements).toEqual({});
    expect(g.releases.flatMap((r) => r.tasks)[0].fulfills).toEqual(['REQ-001']);
  });

  it('survives a plan whose JSON carries no requirements', async () => {
    respond([task()], { releases: [], stories: [] });
    expect((await getProjectGantt(PROJECT)).requirements).toEqual({});
  });

  it('skips a requirement missing an id or a statement rather than inventing one', async () => {
    respond([task()], {
      requirements: [
        { id: 'REQ-001', statement: 'Real.' },
        { id: 'REQ-002' },
        { statement: 'Orphaned.' },
      ],
    });
    expect(await getProjectGantt(PROJECT).then((g) => g.requirements)).toEqual({ 'REQ-001': 'Real.' });
  });

  it('fails soft when the plan lookup throws, because the board is the point', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce([task()])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('build_plans is unreachable'));
    const g = await getProjectGantt(PROJECT);
    expect(g.requirements).toEqual({});
    expect(g.releases.flatMap((r) => r.tasks)).toHaveLength(1);
  });
});
