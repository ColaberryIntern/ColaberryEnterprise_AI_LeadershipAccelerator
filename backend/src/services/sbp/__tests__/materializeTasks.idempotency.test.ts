/**
 * materializeTasks — replay safety.
 *
 * Auto-publish makes this the hot path rather than an operator's occasional
 * button, so the replay guarantee has to be proven rather than assumed. A
 * republish (a regenerated plan, a retried publish after a transient failure, a
 * student who ran the wizard twice) must land on the same rows.
 *
 * Three things this suite holds:
 *   1. Publishing twice creates nothing the second time — no duplicate lists,
 *      no duplicate tasks, no second STORY-000.
 *   2. Work the student already finished stays finished. Republishing may not
 *      quietly reopen a completed task.
 *   3. The ORIGINAL deadline survives. `due_baseline_on` is written once, so a
 *      slipping plan cannot rewrite the date it was first promised for.
 *
 * The model layer is faked in-memory rather than mocked call-by-call, because
 * the property under test is "what does the table look like afterwards", and a
 * `toHaveBeenCalledTimes` assertion cannot see a table.
 */

// ── an in-memory stand-in for the two Sequelize models ──────────────────────
interface FakeRow { [k: string]: any; update: (patch: any, opts?: any) => Promise<FakeRow> }

function makeRow(attrs: Record<string, any>): FakeRow {
  const row: any = { ...attrs };
  row.update = async (patch: Record<string, any>) => { Object.assign(row, patch); return row; };
  return row as FakeRow;
}

/** A table keyed on the same columns the real partial-unique indexes use. */
class FakeTable {
  readonly rows = new Map<string, FakeRow>();
  creates = 0;
  private seq = 0;

  constructor(private readonly keyOf: (where: Record<string, any>) => string) {}

  async findOrCreate({ where, defaults }: { where: Record<string, any>; defaults?: Record<string, any> }): Promise<[FakeRow, boolean]> {
    const key = this.keyOf(where);
    const existing = this.rows.get(key);
    if (existing) return [existing, false];
    this.seq += 1;
    this.creates += 1;
    const row = makeRow({ id: `row-${this.seq}`, ...defaults });
    this.rows.set(key, row);
    return [row, true];
  }

  reset(): void { this.rows.clear(); this.creates = 0; this.seq = 0; }
  find(pred: (r: FakeRow) => boolean): FakeRow | undefined { return [...this.rows.values()].find(pred); }
  get all(): FakeRow[] { return [...this.rows.values()]; }
}

const listTable = new FakeTable((w) => `${w.project_id}|${w.cluster}`);
const taskTable = new FakeTable((w) => `${w.project_id}|${w.story_id}`);

jest.mock('../../../models/StudentTaskList', () => ({
  __esModule: true,
  default: { findOrCreate: (o: any) => listTable.findOrCreate(o) },
}));
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: { findOrCreate: (o: any) => taskTable.findOrCreate(o) },
}));
jest.mock('../../../config/database', () => ({
  sequelize: { transaction: (fn: any) => fn({}) },
}));

import { materializePlanAsTasks } from '../materializeTasks';
import { BuildPlan } from '../planContract';
import { buildSchedule, Schedule } from '../buildSchedule';
import { COMMAND_CENTER_STORY_ID } from '../commandCenterStory';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT = '22222222-2222-2222-2222-222222222222';

const story = (id: string, release: string, title: string, fulfills: string[]) => ({
  id, release, title,
  narrative: `As a manager, I want ${title.toLowerCase()}, so that the roster is right.`,
  fulfills, owner_agent: 'Roster',
  acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Trust - the audit log records it.'],
  task_guidance: 'Build it.', failure_paths: ['duplicate email'], blocked_by: [],
});

const plan: BuildPlan = {
  project_name: 'Sponsor Dashboard',
  descriptor: 'Corporate seat management',
  requirements: [
    { id: 'REQ-001', statement: 'A manager can build a roster.', kind: 'FUNC', priority: 'must', cluster: 'Roster' },
    { id: 'REQ-002', statement: 'A manager can revoke a seat.', kind: 'FUNC', priority: 'must', cluster: 'Roster' },
  ],
  releases: [
    { key: 'r0', name: 'Skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 },
    { key: 'r1', name: 'Seats', goal: 'g', demo: 'd', week_start: 3, week_end: 4 },
  ],
  stories: [
    story('STORY-001', 'r0', 'Manager builds a roster', ['REQ-001']),
    story('STORY-002', 'r1', 'Manager revokes a seat', ['REQ-002']),
  ],
};

const scheduleFrom = (isoStart: string): Schedule => buildSchedule({
  window: { cohortStart: new Date(isoStart) },
  releases: plan.releases,
  storiesByRelease: new Map(plan.releases.map((r) => [r.key, plan.stories.filter((s) => s.release === r.key).map((s) => s.id)])),
});

const schedule = scheduleFrom('2026-09-07T00:00:00.000Z');

const publish = (over: { schedule?: Schedule | null } = {}) =>
  materializePlanAsTasks(PROJECT, ENROLLMENT, plan, { schedule: over.schedule ?? schedule });

beforeEach(() => { listTable.reset(); taskTable.reset(); });

// ── 1. publishing twice is a no-op ──────────────────────────────────────────
describe('publishing twice', () => {
  it('creates the rows once and nothing the second time', async () => {
    const first = await publish();
    const listsAfterFirst = listTable.rows.size;
    const tasksAfterFirst = taskTable.rows.size;
    const createsAfterFirst = { lists: listTable.creates, tasks: taskTable.creates };

    const second = await publish();

    // Same reported shape…
    expect(second.lists).toBe(first.lists);
    expect(second.tasks).toBe(first.tasks);
    // …and, the part that matters, no new rows behind it.
    expect(listTable.rows.size).toBe(listsAfterFirst);
    expect(taskTable.rows.size).toBe(tasksAfterFirst);
    expect(listTable.creates).toBe(createsAfterFirst.lists);
    expect(taskTable.creates).toBe(createsAfterFirst.tasks);
  });

  it('does not mint a second Command Center', async () => {
    await publish();
    await publish();
    await publish();
    const commandCenters = taskTable.all.filter((r) => r.story_id === COMMAND_CENTER_STORY_ID);
    expect(commandCenters).toHaveLength(1);
  });

  it('keeps one row per story however many times it runs', async () => {
    await publish();
    await publish();
    const storyIds = taskTable.all.map((r) => r.story_id);
    expect(new Set(storyIds).size).toBe(storyIds.length);
    expect(storyIds).toContain('STORY-001');
    expect(storyIds).toContain('STORY-002');
  });
});

// ── 2. finished work stays finished ─────────────────────────────────────────
describe('a task the student already completed', () => {
  it('is not reopened by a republish, and is reported as preserved', async () => {
    await publish();
    const done = taskTable.find((r) => r.story_id === 'STORY-001')!;
    await done.update({ status: 'complete' });

    const again = await publish();

    expect(done.status).toBe('complete');
    expect(again.preservedComplete).toBeGreaterThanOrEqual(1);
  });

  it('still refreshes everything ELSE on that task — the prompt is updated in place', async () => {
    await publish();
    const done = taskTable.find((r) => r.story_id === 'STORY-001')!;
    await done.update({ status: 'complete', build: 'a stale prompt from the first plan' });

    await publish();

    expect(done.status).toBe('complete');
    expect(done.build).not.toBe('a stale prompt from the first plan');
    expect(done.build).toContain('STORY-001');
  });

  it('leaves an in-progress task alone rather than resetting it to not_started', async () => {
    await publish();
    const wip = taskTable.find((r) => r.story_id === 'STORY-002')!;
    await wip.update({ status: 'in_progress' });

    await publish();

    expect(wip.status).toBe('in_progress');
  });
});

// ── 3. the original deadline is the original deadline ───────────────────────
describe('due dates on a republish', () => {
  it('moves due_on with the new schedule but never rewrites due_baseline_on', async () => {
    await publish();
    const task = taskTable.find((r) => r.story_id === 'STORY-001')!;
    const baseline = task.due_baseline_on;
    expect(baseline).toBeInstanceOf(Date);

    // The cohort slips a month; the plan is republished against new dates.
    await materializePlanAsTasks(PROJECT, ENROLLMENT, plan, { schedule: scheduleFrom('2026-10-05T00:00:00.000Z') });

    expect(task.due_baseline_on).toEqual(baseline);   // what we first promised
    expect(task.due_on).not.toEqual(baseline);        // what we now expect
  });

  it('materializes without dates when the cohort has none, and stays replayable', async () => {
    await materializePlanAsTasks(PROJECT, ENROLLMENT, plan, { schedule: null });
    const created = taskTable.creates;
    await materializePlanAsTasks(PROJECT, ENROLLMENT, plan, { schedule: null });
    expect(taskTable.creates).toBe(created);
    expect(taskTable.find((r) => r.story_id === 'STORY-001')!.due_on).toBeNull();
  });
});
