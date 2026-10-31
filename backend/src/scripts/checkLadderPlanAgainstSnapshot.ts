/**
 * Run the pure migration planner against a snapshot of REAL production rows.
 *
 * A pre-flight check, not a test, which is why it lives in `scripts/` rather than `__tests__/`: it
 * needs a snapshot file that is deliberately not in the repo, so as a jest test it would skip
 * silently and prove nothing.
 *
 * **It is the reason Phase 2 did not orphan 17 stories.** Every fixture in the migration's unit
 * tests generates its story ids at today's column width and therefore matches the generator by
 * construction, so the whole suite was green. Against the real rows the planner reported 17
 * stories as unrecognised -- their ids had been truncated by the old `varchar(60)` column -- and
 * it would have left them under a superseded release and inserted a duplicate of each beside them.
 *
 * Run it before applying a migration like this one, and treat a non-zero exit as a reason to stop.
 *
 *   npx ts-node --transpile-only src/scripts/checkLadderPlanAgainstSnapshot.ts <snapshot.json>
 *
 * The snapshot is produced read-only from the production container:
 *   SELECT id, story_id, task_list_id, release_key, position, status, verified_at IS NOT NULL
 *     FROM student_tasks WHERE project_id = <each domain project>
 * plus the same for `student_task_lists`, keyed by domain. The three ladder columns do not exist
 * in production until this phase deploys, so they come through as null -- which is exactly the
 * state the first real run will see.
 */
import * as fs from 'fs';
import { planDomainMigration } from '../services/agentDomain/agentDomainAutonomyReleaseMigration';

interface Snapshot {
  [domainKey: string]: {
    project_id: string;
    lists: { id: string; cluster: string; title: string; position: number }[];
    stories: {
      id: string; story_id: string; task_list_id: string; release_key: string | null;
      position: number; capability_id: string | null; autonomy_stage: string | null;
      story_kind: string | null; status: string; verified: boolean;
    }[];
  };
}

function main(): void {
  const file = process.argv[2];
  if (!file) {
      console.error('usage: checkLadderPlanAgainstSnapshot <snapshot.json>');
    process.exit(1);
  }
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as Snapshot;

  let totalCreate = 0;
  let totalReparent = 0;
  let totalInsert = 0;
  let totalUnrecognised = 0;
  let verifiedBefore = 0;
  const problems: string[] = [];

  console.log('domain                lists  reparent  insert  unrecognised  verified_rows');
  console.log('-'.repeat(84));

  for (const [domainKey, state] of Object.entries(snapshot)) {
    const plan = planDomainMigration(domainKey, state.lists, state.stories);
    const verified = state.stories.filter((s) => s.verified).length;

    totalCreate += plan.lists_to_create.length;
    totalReparent += plan.stories_to_reparent.length;
    totalInsert += plan.stories_to_insert.length;
    totalUnrecognised += plan.unrecognised_stories.length;
    verifiedBefore += verified;

    console.log(
      `${domainKey.padEnd(20)} ${String(plan.lists_to_create.length).padStart(5)} `
      + `${String(plan.stories_to_reparent.length).padStart(9)} `
      + `${String(plan.stories_to_insert.length).padStart(7)} `
      + `${String(plan.unrecognised_stories.length).padStart(13)} `
      + `${String(verified).padStart(14)}`,
    );

    // Every verified row must be re-parented and nothing else. A verified row that the plan does
    // not recognise would be a row about to be left behind under a superseded release.
    const touched = new Set(plan.stories_to_reparent.map((s) => s.id));
    for (const s of state.stories.filter((x) => x.verified)) {
      if (!touched.has(s.id)) problems.push(`${domainKey}: verified row ${s.story_id} not re-parented`);
    }
    for (const sid of plan.unrecognised_stories) {
      problems.push(`${domainKey}: unrecognised row ${sid}`);
    }
  }

  console.log('-'.repeat(84));
  console.log(
    `TOTAL                ${String(totalCreate).padStart(5)} ${String(totalReparent).padStart(9)} `
    + `${String(totalInsert).padStart(7)} ${String(totalUnrecognised).padStart(13)} `
    + `${String(verifiedBefore).padStart(14)}`,
  );

  if (problems.length > 0) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  ${p}`);
    process.exit(1);
  }
  console.log('\nno problems: every existing row is accounted for, every verified row moves with it');
}

main();
