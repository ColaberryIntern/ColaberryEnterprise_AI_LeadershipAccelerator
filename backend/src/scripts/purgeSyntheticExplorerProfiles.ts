import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { syntheticEmailSql } from '../services/leads/syntheticContacts';

/**
 * Remove Explorer Growth rows that belong to test-fixture Explorers. C96 (2026-10-31).
 *
 * WHY THIS EXISTS. The daily points smoke test signs up a real Explorer in production
 * (`e2e-points-…@colaberry-test.local`). Until C96 the identity bridge gave each one a journey profile, so on
 * 2026-10-31 there were 55 test profiles of 761 and 762 test score snapshots of 17,482, all counted in Explorer
 * Growth. C96 stops new ones at the bridge; this removes the ones already there.
 *
 * WHAT IT TOUCHES. Only Explorer Growth state keyed by `enrollment_id`: decisions, score snapshots, experiment
 * assignments, then profiles (children first). It never deletes an enrollment, a lead, points or an email row:
 * those are the smoke test's own evidence, and the test reads them.
 *
 * PREVIEW BY DEFAULT. Without `--apply` it prints the counts and changes nothing. With `--apply` all four deletes
 * run in one transaction, so a failure leaves nothing half-removed. Re-running is a no-op (idempotent): the second
 * run finds zero rows.
 *
 * Run:
 *   node dist/scripts/purgeSyntheticExplorerProfiles.js           (preview)
 *   node dist/scripts/purgeSyntheticExplorerProfiles.js --apply   (delete)
 */

/** Children before the profile; each is keyed by enrollment_id. */
export const PURGE_TABLES = [
  'explorer_journey_decisions',
  'explorer_score_snapshots',
  'explorer_experiment_assignments',
  'explorer_journey_profiles',
] as const;

/** The fixture enrollments, by the same rule every other guard uses. */
export function fixtureEnrollmentsSql(): string {
  return `SELECT e.id FROM enrollments e WHERE ${syntheticEmailSql('e.email')}`;
}

async function countFor(table: string, tx?: Transaction): Promise<number> {
  const rows = await sequelize.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${table} WHERE enrollment_id IN (${fixtureEnrollmentsSql()})`,
    { type: QueryTypes.SELECT, transaction: tx },
  );
  return Number(rows[0]?.n ?? 0);
}

export async function purgeSyntheticExplorerProfiles(apply: boolean): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (!apply) {
    for (const t of PURGE_TABLES) counts[t] = await countFor(t);
    return counts;
  }
  await sequelize.transaction(async (tx) => {
    for (const t of PURGE_TABLES) {
      counts[t] = await countFor(t, tx);
      await sequelize.query(`DELETE FROM ${t} WHERE enrollment_id IN (${fixtureEnrollmentsSql()})`, { transaction: tx });
    }
  });
  return counts;
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  purgeSyntheticExplorerProfiles(apply)
    .then((counts) => {
      console.log(JSON.stringify({ event: 'purge_synthetic_explorer_profiles', mode: apply ? 'apply' : 'preview', counts }));
      return sequelize.close();
    })
    .catch(async (err) => {
      console.error(JSON.stringify({
        event: 'purge_synthetic_explorer_profiles_failed',
        error_class: err?.name || 'Error',
        message: err?.message,
        note: apply ? 'transaction rolled back; nothing was deleted' : 'preview only',
      }));
      await sequelize.close().catch((closeErr) => console.error(JSON.stringify({
        event: 'purge_synthetic_explorer_profiles_close_failed', error_class: closeErr?.name || 'Error',
      })));
      process.exit(1);
    });
}
