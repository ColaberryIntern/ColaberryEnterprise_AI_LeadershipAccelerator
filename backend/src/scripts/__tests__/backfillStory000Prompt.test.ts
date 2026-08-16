/**
 * The sweep decision inside `backfillStory000Prompt` — the one that could not
 * see the column it was breaking.
 *
 * ── WHAT HAPPENED ────────────────────────────────────────────────────────────
 *
 * #1490 took `COMMAND_CENTER_ACCEPTANCE` from three criteria to five. This
 * script rewrote `student_tasks.build` on all 20 published builds and reported
 * clean. It never selected `student_tasks.acceptance`, so 19 of 20 students
 * ended up with a prompt listing five criteria, a checklist showing three, and
 * a verifier grading against five.
 *
 * The decision that produced that outcome — `next === current`, on `build`
 * alone — lived inline in the sweep loop, where no test could reach it. It is
 * exported now for exactly that reason, and the first test below is the row it
 * could never see.
 */
jest.mock('../../config/database', () => ({
  __esModule: true,
  sequelize: { query: jest.fn(), close: jest.fn() },
}));

import { story000RowUpdate, SweepRow } from '../backfillStory000Prompt';
import { COMMAND_CENTER_ACCEPTANCE } from '../../services/sbp/commandCenterStory';
import { commandCenterTaskColumns } from '../../services/sbp/commandCenterTaskColumns';
import { BuildPlan } from '../../services/sbp/planContract';

function plan(): BuildPlan {
  return {
    project_name: 'Student Engagement Monitoring Tool',
    descriptor: 'watches who is falling behind',
    requirements: [
      { id: 'REQ-001', statement: 'The system must flag a student who misses two sessions.', kind: 'FUNC', priority: 'must', cluster: 'core' },
    ],
    releases: [{ key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
    stories: [{
      id: 'STORY-001', release: 'r0', title: 'Flag the missed sessions',
      narrative: 'As an instructor, I want the misses flagged, so that I can act.',
      fulfills: ['REQ-001'], owner_agent: 'Monitoring Agent',
      acceptance: ['Given two misses, when the run happens, then the student is flagged.'],
      task_guidance: 'guidance', failure_paths: ['attendance feed down'],
    }],
  };
}

/** A swept row, with whatever the task row currently holds. */
function row(current: { build?: string | null; acceptance?: unknown }): SweepRow {
  return {
    project_id: 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef',
    enrollment_id: 'aced5b39-0000-4000-8000-000000000001',
    email: 'student@test.com',
    enrollment_status: 'active',
    cohort_name: 'July 2026',
    cohort_start: null,
    plan_version: 2,
    plan_json: plan(),
    task_id: 'task-1',
    task_status: 'in_progress',
    verified_at: null,
    current_build: current.build ?? null,
    current_acceptance: current.acceptance ?? null,
  };
}

const CURRENT = () => commandCenterTaskColumns(plan(), null);
/** What every build published before #1490 still carried. */
const THREE_CRITERIA = COMMAND_CENTER_ACCEPTANCE.slice(0, 3);

describe('the row the sweep could not see', () => {
  it('flags a row whose prompt is current and whose criteria are three versions behind', () => {
    // THE DEFECT, EXACTLY. On the second run after #1490 every one of the 19
    // broken rows looked like this: `build` already rewritten and identical,
    // `acceptance` still holding three lines. The old rule reported
    // `unchanged` and skipped it — and would have skipped it forever.
    const { drift } = story000RowUpdate(
      row({ build: CURRENT().build, acceptance: [...THREE_CRITERIA] }),
      plan(),
    );

    expect(drift).toEqual({
      needs_update: true,
      build_changed: false,
      acceptance_changed: true,
    });
  });

  it('offers both columns to write, not just the one it noticed', () => {
    const { next } = story000RowUpdate(
      row({ build: CURRENT().build, acceptance: [...THREE_CRITERIA] }),
      plan(),
    );

    expect(next.acceptance).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
    expect(next.acceptance).toHaveLength(5);
    expect(next.build.length).toBeGreaterThan(3000);
  });

  it('CONVERGES: re-running against the repaired row reports nothing to do', () => {
    // The property the old script did not have. A rewrite that leaves a row
    // stale in a column it never reads can never fix itself, which is why this
    // survived a whole release and had to be found by a human.
    const repaired = story000RowUpdate(
      row({ build: CURRENT().build, acceptance: [...THREE_CRITERIA] }),
      plan(),
    ).next;

    const { drift } = story000RowUpdate(
      row({ build: repaired.build, acceptance: repaired.acceptance }),
      plan(),
    );

    expect(drift.needs_update).toBe(false);
  });
});

describe('the sweep still behaves as it did on everything else', () => {
  it('flags a row whose prompt is stale', () => {
    const { drift } = story000RowUpdate(
      row({ build: 'the prompt from two releases ago', acceptance: [...COMMAND_CENTER_ACCEPTANCE] }),
      plan(),
    );

    expect(drift).toEqual({ needs_update: true, build_changed: true, acceptance_changed: false });
  });

  it('leaves a row alone when both columns are already current', () => {
    const cols = CURRENT();

    expect(story000RowUpdate(row({ build: cols.build, acceptance: cols.acceptance }), plan()).drift)
      .toEqual({ needs_update: false, build_changed: false, acceptance_changed: false });
  });

  it('treats a never-populated row as needing both columns', () => {
    const { drift } = story000RowUpdate(row({}), plan());

    expect(drift).toEqual({ needs_update: true, build_changed: true, acceptance_changed: true });
  });

  it('keeps the due dates in the prompt by deriving the schedule from the cohort start', () => {
    // Rendering with a null schedule would silently strip the dates out — a
    // regression disguised as a backfill. Pinned because the schedule
    // derivation is the easiest thing to lose in a rewrite of this loop.
    const dated = { ...row({}), cohort_start: '2026-07-06' };
    const { next } = story000RowUpdate(dated, plan());

    expect(next.build).toMatch(/Demo day is \d{4}-\d{2}-\d{2}/);
    expect(story000RowUpdate(row({}), plan()).next.build).not.toContain('Demo day is');
  });
});
