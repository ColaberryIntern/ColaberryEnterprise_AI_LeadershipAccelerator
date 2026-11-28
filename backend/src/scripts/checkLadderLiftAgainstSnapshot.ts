/**
 * Run the pure ladder-lift planner against a snapshot of REAL production rows.
 *
 * A pre-flight check, not a test, which is why it lives in `scripts/` rather than `__tests__/`:
 * it needs a snapshot file that is deliberately not in the repo, so as a jest test it would skip
 * silently and prove nothing. It is the same instrument as `checkLadderPlanAgainstSnapshot.ts`,
 * pointed at a different planner, and it exists for the same reason that one does.
 *
 * **It is what makes this change provable before it ships.** `liftCapabilityLadders.ts` cannot run
 * in production until the image carrying it is deployed, so without this there is no way to see
 * the real plan before merging a write against ten real builders' boards. The unit tests cannot
 * close that gap: their fixtures are transcribed from a measurement, which makes them a good
 * record of one day and no guarantee about the next.
 *
 * It also caught a concrete thing. The planner's first version knew four rungs while production
 * had grown to seven, and against invented fixtures that was invisible.
 *
 *   npx ts-node --transpile-only src/scripts/checkLadderLiftAgainstSnapshot.ts <snapshot.json>
 *
 * The snapshot is produced read-only from the production database:
 *
 *   SELECT json_object_agg(domain_key, stories) FROM (
 *     SELECT d.domain_key, json_agg(json_build_object(
 *              'id', t.id, 'story_id', t.story_id, 'story_kind', t.story_kind,
 *              'position', t.position, 'status', t.status,
 *              'verified_at', t.verified_at, 'task_list_id', t.task_list_id)
 *            ORDER BY t.position, t.story_id, t.id) AS stories
 *       FROM student_tasks t
 *       JOIN agent_domain_projects d ON d.student_project_id = t.project_id
 *      GROUP BY d.domain_key) x;
 *
 * A non-zero exit is a reason to stop, not a detail to read past.
 */
import * as fs from 'fs';
import {
  assertProgressPreserved,
  isFinished,
  planLadderLift,
  rungOf,
  type BoardStory,
} from '../services/agentDomain/capabilityLadderLift';

interface SnapshotStory extends BoardStory {
  readonly task_list_id: string;
}
type Snapshot = Record<string, SnapshotStory[]>;

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: checkLadderLiftAgainstSnapshot <snapshot.json>');
    process.exit(1);
  }
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as Snapshot;
  const domains = Object.keys(snapshot).sort();

  let problems = 0;
  let totalPositions = 0;
  let totalStatuses = 0;
  const verifiedBefore: string[] = [];
  const verifiedAfter: string[] = [];

  for (const domainKey of domains) {
    const board = snapshot[domainKey];
    const plan = planLadderLift(board);

    const ladder = board.filter((s) => s.story_kind === 'capability_ladder');
    const positions = ladder.map((s) => s.position);
    const lists = new Set(board.map((s) => s.task_list_id));

    console.log(`\n${domainKey}`);
    console.log(
      `  ${board.length} stories in ${lists.size} list(s); `
      + `${ladder.length} rungs at positions ${Math.min(...positions)}-${Math.max(...positions)}`,
    );
    console.log(`  plan: ${plan.positions.length} position change(s), ${plan.statuses.length} status change(s)`);
    totalPositions += plan.positions.length;
    totalStatuses += plan.statuses.length;

    // Where the rungs END UP, which is the acceptance criterion in one line.
    const after = new Map(plan.positions.map((p) => [p.id, p.to]));
    const landed = ladder
      .map((s) => ({ rung: rungOf(s), to: after.get(s.id) ?? s.position }))
      .sort((a, b) => a.to - b.to);
    console.log(`  rungs land at: ${landed.map((l) => `${l.to}:${l.rung}`).join(' ')}`);

    for (const c of plan.statuses) console.log(`    ${c.rung}: ${c.from} -> ${c.to}`);

    // Verified work, counted before and after, so the Kalkidan guarantee is a number not a hope.
    for (const s of board.filter(isFinished)) {
      verifiedBefore.push(`${domainKey}:${s.story_id}`);
      const change = plan.statuses.find((c) => c.id === s.id);
      if (!change) verifiedAfter.push(`${domainKey}:${s.story_id}`);
    }

    if (lists.size > 1) {
      console.log(`  PROBLEM: stories span ${lists.size} task lists; position is list-scoped`);
      problems += 1;
    }
    for (const p of plan.problems) {
      console.log(`  PROBLEM: ${p}`);
      problems += 1;
    }
    for (const r of assertProgressPreserved(board, plan)) {
      console.log(`  REFUSED: ${r}`);
      problems += 1;
    }

    // Replay the plan and check the invariants that matter on the resulting board.
    const result = board.map((s) => ({
      ...s,
      position: after.get(s.id) ?? s.position,
      status: plan.statuses.find((c) => c.id === s.id)?.to ?? s.status,
    }));
    const dupes = [...new Set(result.map((s) => s.position))]
      .filter((p) => result.filter((s) => s.position === p).length > 1);
    if (dupes.length) {
      console.log(`  PROBLEM: ${dupes.length} position(s) still shared after the plan`);
      problems += 1;
    }
    if (result.length !== board.length) {
      console.log('  PROBLEM: the plan changes how many stories the board has');
      problems += 1;
    }
    const second = planLadderLift(result);
    if (second.positions.length || second.statuses.length) {
      console.log(
        `  PROBLEM: not idempotent — a second run would change `
        + `${second.positions.length} position(s), ${second.statuses.length} status(es)`,
      );
      problems += 1;
    }
  }

  console.log(`\n${domains.length} board(s): ${totalPositions} position change(s), ${totalStatuses} status change(s)`);
  console.log(`verified rungs before: ${verifiedBefore.length}; still verified after: ${verifiedAfter.length}`);
  for (const v of verifiedBefore.filter((v) => !verifiedAfter.includes(v))) {
    console.log(`  LOST: ${v}`);
  }
  console.log(problems === 0 ? '\nOK — no problems' : `\n${problems} problem(s)`);
  if (problems > 0 || verifiedAfter.length !== verifiedBefore.length) process.exitCode = 1;
}

if (require.main === module) main();
