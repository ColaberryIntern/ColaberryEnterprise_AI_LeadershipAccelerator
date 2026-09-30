/**
 * auditCertBank — the whole-bank rubric, run against the live database.
 *
 * Per-question checks cannot see bank-level defects. On 2026-09-11 every one of
 * 150 generated questions passed the item rubric and the adversarial triage,
 * and 144 of them had the correct answer at A. This script answers the question
 * no per-item check can: is the BANK, taken together, a fair instrument?
 *
 * It is also called automatically at the end of every script that changes the
 * bank (grow, sweep, rebalance), so the answer arrives with the change rather
 * than a day later. Run it directly to check the bank at any other time.
 *
 * READ-ONLY. Exit code is non-zero on any HARD failure, so it can gate a deploy
 * or a cron. Advisory failures print and do not fail the run.
 *
 * Usage (inside the backend container):
 *   node dist/scripts/auditCertBank.js
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { runLiveAudit } from './lib/certBankAudit';

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  console.log(`database    : ${db}`);
  const audit = await runLiveAudit('of the live bank');
  if (!audit.pass) process.exitCode = 1;
}

if (require.main === module) main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('auditCertBank failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    await sequelize.close().catch(() => undefined);
  });
