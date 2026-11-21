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
import { CONNECTED_DEMO_STORY_ID, CONNECTED_DEMO_ACCEPTANCE } from '../connectedDemoStory';

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

// "Today" is pinned before the cohort starts. Left to the real clock, the never-born-late floor
// lifted every date to the run day once the calendar passed these schedules (2026-11-20), and the
// republish test could no longer see the due date move.
const NOW = new Date('2026-09-01T00:00:00.000Z');

const publish = (over: { schedule?: Schedule | null } = {}) =>
  materializePlanAsTasks(PROJECT, ENROLLMENT, plan, { schedule: over.schedule ?? schedule, now: NOW });

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
    await materializePlanAsTasks(PROJECT, ENROLLMENT, plan, { schedule: scheduleFrom('2026-10-05T00:00:00.000Z'), now: NOW });

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

/**
 * STORY-900, the Connected Demo row.
 *
 * Added with the same three guarantees the suite above holds for STORY-000, because a board row
 * created by auto-publish is replayed every time a plan regenerates. The fourth property is the
 * one specific to this row: the flag is OFF by default, so a board materialized by any existing
 * caller must contain exactly the rows it contains today.
 */
describe('STORY-900 on the board', () => {
  const publishDemo = (over: { schedule?: Schedule | null } = {}) =>
    materializePlanAsTasks(PROJECT, ENROLLMENT, plan, {
      schedule: over.schedule ?? schedule,
      now: NOW,
      connectedDemo: true,
    });

  it('creates NO row when the flag is omitted', async () => {
    await publish();
    expect(taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)).toBeUndefined();
  });

  it('creates exactly one row when the flag is on', async () => {
    await publishDemo();
    const rows = taskTable.all.filter((r) => r.story_id === CONNECTED_DEMO_STORY_ID);
    expect(rows).toHaveLength(1);
  });

  it('creates ONE row across two publishes, which is the replay guarantee', async () => {
    await publishDemo();
    const afterFirst = taskTable.creates;
    await publishDemo();
    expect(taskTable.all.filter((r) => r.story_id === CONNECTED_DEMO_STORY_ID)).toHaveLength(1);
    // Nothing new created at all on the second pass: not a second demo row, not anything else.
    expect(taskTable.creates).toBe(afterFirst);
  });

  it('is blocked by the Command Center, on the row rather than only in the prompt', async () => {
    await publishDemo();
    const row = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    expect(row.blocked_by).toEqual([COMMAND_CENTER_STORY_ID]);
  });

  it('carries the prompt AND the criteria, which come from one call', async () => {
    await publishDemo();
    const row = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    expect(typeof row.build).toBe('string');
    expect(row.build.length).toBeGreaterThan(200);
    expect(Array.isArray(row.acceptance)).toBe(true);
    expect(row.acceptance.length).toBeGreaterThan(3);
    // The pair has to agree. Splitting them put 19 of 20 live builds three versions behind.
    expect(row.acceptance).toEqual([...CONNECTED_DEMO_ACCEPTANCE]);
  });

  it('falls due AFTER the Command Center, and never on a weekend', async () => {
    await publishDemo();
    const cc = taskTable.find((r) => r.story_id === COMMAND_CENTER_STORY_ID)!;
    const demo = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    expect(new Date(demo.due_on).getTime()).toBeGreaterThan(new Date(cc.due_on).getTime());
    const day = new Date(demo.due_on).getUTCDay();
    expect(day).not.toBe(0);
    expect(day).not.toBe(6);
  });

  it('slides over a weekend rather than landing on one', async () => {
    // A Friday cohort start puts the Command Center on Friday, so the naive "+1 day" would put
    // the demo on a Saturday and the student would see it overdue on Monday morning.
    const friday = scheduleFrom('2026-09-11T00:00:00.000Z');
    await materializePlanAsTasks(PROJECT, ENROLLMENT, plan, {
      schedule: friday, now: NOW, connectedDemo: true,
    });
    const demo = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    const day = new Date(demo.due_on).getUTCDay();
    expect([1, 2, 3, 4, 5]).toContain(day);
  });

  it('materializes without a schedule, with no due date, rather than failing', async () => {
    await materializePlanAsTasks(PROJECT, ENROLLMENT, plan, { schedule: null, now: NOW, connectedDemo: true });
    const row = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    expect(row.due_on).toBeNull();
  });

  it('does not reopen a demo the student already finished', async () => {
    await publishDemo();
    const row = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    await row.update({ status: 'complete' });
    await publishDemo();
    expect(taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!.status).toBe('complete');
  });

  it('adds exactly one row to the board compared with the flag off', async () => {
    await publish();
    const withoutDemo = taskTable.all.length;
    taskTable.reset();
    await publishDemo();
    expect(taskTable.all.length).toBe(withoutDemo + 1);
  });
});

/**
 * The keep-complete override, tested where it actually bites.
 *
 * A mutation setting `keepComplete = false` for the demo row SURVIVED, and the reason matters:
 * the expression is `status: keepComplete ? 'complete' : demoRow.status`, and when the row is
 * already complete BOTH branches yield 'complete'. The flag does not protect the status at all.
 *
 * What protects it is the presence of that `status:` key after the `...demoAttrs` spread, since
 * the spread carries `status: 'not_started'` and would otherwise reset a finished task. The flag
 * drives `result.preservedComplete`, which is the number an operator reads to know a republish
 * did not quietly reopen work. Both are asserted here, separately, because they are different
 * guarantees that happened to share one line.
 */
/**
 * The attributes a verifier proved could be gutted with this suite green.
 *
 * Nine mutations were run against the T8 diff beyond the ones the task's own spec covered, and
 * eight survived. Six of them are below. They are asserted now rather than "later" because T10
 * is the change that turns the flag on: an unpinned attribute is harmless while no board has the
 * row, and becomes a student's problem the day one does.
 *
 * `due_baseline_on` is the sharpest of them. `services/internship/nudgeBrief/deadline.ts` reads
 * `due_baseline_on` and NEVER `due_on`, so a null baseline is not a cosmetic gap - it is a task
 * that silently cannot appear in a deadline brief. The invariant the row is created under is
 * `due_baseline_on === due_on` at first publish, and `due_on >= due_baseline_on` forever after.
 */
describe('STORY-900 row attributes, each pinned to the thing that reads it', () => {
  const publishDemo = () =>
    materializePlanAsTasks(PROJECT, ENROLLMENT, plan, { schedule, now: NOW, connectedDemo: true });

  it('writes due_baseline_on equal to due_on at creation, because the nudge brief reads only the baseline', async () => {
    await publishDemo();
    const row = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    expect(row.due_baseline_on).not.toBeNull();
    expect(new Date(row.due_baseline_on).getTime()).toBe(new Date(row.due_on).getTime());
  });

  it('never rewrites the baseline on a republish, even when the due date moves', async () => {
    // The other direction, and the one that makes the baseline worth having: a plan that quietly
    // re-dated its own original deadlines would hide exactly the lesson a slipping build teaches.
    await publishDemo();
    const first = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    const baseline = new Date(first.due_baseline_on).getTime();
    await first.update({ due_on: new Date('2027-01-04T00:00:00.000Z') });
    await publishDemo();
    const after = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    expect(new Date(after.due_baseline_on).getTime()).toBe(baseline);
  });

  it('groups under the same release as the Command Center, not a release that does not exist', async () => {
    await publishDemo();
    const cc = taskTable.find((r) => r.story_id === COMMAND_CENTER_STORY_ID)!;
    const demo = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    expect(demo.release_key).toBe(cc.release_key);
    // And it is a release the PLAN actually declares, so the row cannot be orphaned off the board.
    expect(plan.releases.map((r: { key: string }) => r.key)).toContain(demo.release_key);
  });

  it('sits immediately after the Command Center in position, so the board reads in build order', async () => {
    await publishDemo();
    const cc = taskTable.find((r) => r.story_id === COMMAND_CENTER_STORY_ID)!;
    const demo = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    expect(demo.position).toBe(cc.position + 1);
    /*
     * No other row IN THE SAME LIST may share that slot: dropping the position counter would
     * collide the demo with the first plan story and make the order arbitrary.
     *
     * Scoped to the list because `position` is per-list, not global - the first assertion of this
     * was global and found two rows legitimately sharing position 0 in different releases. The
     * code was right and the test was wrong, which is worth saying rather than quietly narrowing.
     */
    const sameList = taskTable.all.filter((r) => r.task_list_id === demo.task_list_id);
    expect(sameList.filter((r) => r.position === demo.position)).toHaveLength(1);
    expect(sameList.length).toBeGreaterThan(2);
  });

  it('counts itself in the result, so the published count matches the rows written', async () => {
    const result = await publishDemo();
    expect(result.tasks).toBe(taskTable.all.length);
  });

  it('carries a narrative and a description, because the board shows both', async () => {
    await publishDemo();
    const row = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    expect(typeof row.narrative).toBe('string');
    expect(row.narrative.length).toBeGreaterThan(40);
    expect(typeof row.description).toBe('string');
    expect(row.description.length).toBeGreaterThan(5);
    expect(row.title.length).toBeGreaterThan(5);
  });
});

describe('STORY-900 keep-complete, the part that actually protects the row', () => {
  const publishDemo = () =>
    materializePlanAsTasks(PROJECT, ENROLLMENT, plan, { schedule, now: NOW, connectedDemo: true });

  it('counts the finished demo in preservedComplete on a republish', async () => {
    await publishDemo();
    const row = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    await row.update({ status: 'complete' });
    const second = await publishDemo();
    expect(second.preservedComplete).toBeGreaterThanOrEqual(1);
  });

  it('reports zero preserved when nothing was finished, so the count means something', async () => {
    await publishDemo();
    const second = await publishDemo();
    expect(second.preservedComplete).toBe(0);
  });

  it('does not reset an in-progress demo to not_started either', async () => {
    // The spread carries status: 'not_started'. Any status the student has moved to must survive
    // a republish, not only 'complete'.
    await publishDemo();
    const row = taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!;
    await row.update({ status: 'in_progress' });
    await publishDemo();
    expect(taskTable.find((r) => r.story_id === CONNECTED_DEMO_STORY_ID)!.status).toBe('in_progress');
  });
});
