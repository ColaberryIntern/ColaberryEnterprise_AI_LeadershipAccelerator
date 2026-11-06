/**
 * Give every existing monthly batch the private room C10.14 now mints automatically.
 *
 * `createCohort` calls `ensureRoomForCohort` as of C10.14, so batches created from
 * here on get a room without anyone remembering. The five batches that already
 * exist predate that code: November 2026 (open, the one that runs next, with its
 * 7 December orientation) and December 2026 through March 2027. Without this they
 * would ship the feature and still have nowhere to meet.
 *
 * Scope: accelerator cohorts only, and only those not `completed`. Completed
 * batches are history - April and July 2026 have finished, and July already has a
 * hand-made room (`cohort-july-2026-class`). `ensureRoomForCohort` independently
 * refuses the Explorer prospect pool and the internship, so passing one here is a
 * no-op rather than a hazard.
 *
 * Idempotent: `ensureRoomForCohort` is a `findOrCreate` on the deterministic slug
 * `cohort-<id>`, so a second run finds every room and creates nothing. Re-running
 * after a partial run is always safe.
 *
 * Usage:
 *   npx ts-node backfillBatchRooms.ts              (dry run - default, no writes)
 *   npx ts-node backfillBatchRooms.ts --execute    (creates the missing rooms)
 */

import { Op } from 'sequelize';
import { Cohort } from '../models';
import CommunityRoom from '../models/CommunityRoom';
import {
  BATCH_COHORT_TYPE,
  cohortRoomSlug,
  ensureRoomForCohort,
} from '../services/communityRooms/cohortRoomService';

export interface BackfillRow {
  cohort: string;
  cohortId: string;
  slug: string;
  action: 'created' | 'already-had-one' | 'would-create';
}

export async function run(execute: boolean): Promise<BackfillRow[]> {
  const batches = await Cohort.findAll({
    where: {
      cohort_type: BATCH_COHORT_TYPE,
      status: { [Op.ne]: 'completed' },
    } as any,
    order: [['start_date', 'ASC']],
  });

  const rows: BackfillRow[] = [];
  for (const cohort of batches) {
    const slug = cohortRoomSlug(cohort.id);
    const existing = await CommunityRoom.findOne({ where: { slug } });

    if (existing) {
      rows.push({ cohort: cohort.name, cohortId: cohort.id, slug, action: 'already-had-one' });
      continue;
    }
    if (!execute) {
      rows.push({ cohort: cohort.name, cohortId: cohort.id, slug, action: 'would-create' });
      continue;
    }
    await ensureRoomForCohort(cohort as any);
    rows.push({ cohort: cohort.name, cohortId: cohort.id, slug, action: 'created' });
  }
  return rows;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const rows = await run(execute);

  console.log(`=== Batch rooms (${execute ? 'EXECUTE' : 'DRY RUN'}) ===`);
  for (const r of rows) console.log(`[${r.action}] ${r.cohort} -> ${r.slug}`);

  const made = rows.filter((r) => r.action === 'created').length;
  const pending = rows.filter((r) => r.action === 'would-create').length;
  const had = rows.filter((r) => r.action === 'already-had-one').length;
  console.log(`\n${rows.length} batch(es): ${had} already had a room, ${execute ? `${made} created` : `${pending} would be created`}.`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Script failed:', err);
      process.exit(1);
    });
}
