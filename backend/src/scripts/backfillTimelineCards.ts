/**
 * CLI: backfill the legacy curriculum hierarchy into the Timeline Engine.
 *
 *   npx ts-node src/scripts/backfillTimelineCards.ts <cohortId>
 *   npx ts-node src/scripts/backfillTimelineCards.ts --all
 *
 * Idempotent (MIGRATION_PLAN.md §3): safe to re-run; a second run produces an
 * identical end state. Additive only — never mutates legacy rows — so it is
 * safe to run before the TIMELINE_ENGINE_ENABLED cutover. Prints a per-cohort
 * summary of cards created/updated, progress rows migrated, and warnings.
 */
import { backfillCohort } from '../services/timeline/backfillService';
import Cohort from '../models/Cohort';

async function main(): Promise<void> {
  const arg = process.argv[2];
  const all = process.argv.includes('--all');

  let cohortIds: string[] = [];
  if (all) {
    const cohorts = await Cohort.findAll();
    cohortIds = cohorts.map((c) => c.id);
  } else if (arg && !arg.startsWith('--')) {
    cohortIds = [arg];
  } else {
    console.error('Usage: backfillTimelineCards <cohortId> | --all');
    process.exit(1);
    return;
  }

  const summaries = [];
  for (const id of cohortIds) {
    const r = await backfillCohort(id);
    summaries.push(r);
    console.log(
      `[backfill] cohort ${id}: +${r.cards_created} cards, ~${r.cards_updated} updated, ` +
      `${r.progress_migrated} progress rows, ${r.warnings.length} warnings`
    );
    r.warnings.slice(0, 10).forEach((w) => console.warn(`  ! ${w}`));
  }
  console.log(`[backfill] done: ${summaries.length} cohort(s)`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[backfill] failed:', e);
  process.exit(1);
});
