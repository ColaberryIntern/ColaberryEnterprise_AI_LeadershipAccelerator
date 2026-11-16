/**
 * Roll back Career Prep v27 CP1.2: drop the seven Career Prep tables (and their data).
 *
 *   node dist/scripts/dropCareerPrepTables.js --yes
 *
 * Destructive and irreversible for Career Prep data (observations, plans, sessions), so it refuses
 * to run without --yes, and it is run only on Ali's say-so. Nothing outside Career Prep reads
 * these tables. The next boot recreates them empty (ensureCareerPrepSchema).
 */
import { sequelize } from '../config/database';
import { CAREER_PREP_ROLLBACK } from '../db/ensureCareerPrepSchema';

async function main(): Promise<void> {
  if (!process.argv.includes('--yes')) {
    console.log(JSON.stringify({ event: 'career_prep_drop', outcome: 'refused', reason: 'pass --yes to drop the Career Prep tables' }));
    process.exitCode = 2;
    return;
  }
  for (const sql of CAREER_PREP_ROLLBACK) await sequelize.query(sql);
  console.log(JSON.stringify({ event: 'career_prep_drop', outcome: 'success', tables: CAREER_PREP_ROLLBACK.length }));
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(JSON.stringify({ event: 'career_prep_drop', outcome: 'failure', error_class: 'UpstreamUnavailable', message: (e as Error).message })); process.exitCode = 1; })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
