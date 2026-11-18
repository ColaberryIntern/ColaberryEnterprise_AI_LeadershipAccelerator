/**
 * OH1i (T3): create maya_brain_items (the AI-fact and build-prompt shelves).
 *
 *   npx ts-node src/scripts/ensureMayaBrainSchema.ts           # DRY RUN: prints the SQL, says whether the table exists
 *   npx ts-node src/scripts/ensureMayaBrainSchema.ts --apply   # runs it (CREATE ... IF NOT EXISTS, additive only)
 *   (in the container: node dist/scripts/ensureMayaBrainSchema.js [--apply])
 *
 * Additive and idempotent: one table, two indexes, nothing existing altered or dropped.
 * Rollback is not needed (an empty, unread table); `DROP TABLE maya_brain_items` if ever wanted.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { ensureMayaBrainSchema, MAYA_BRAIN_SCHEMA_STATEMENTS } from '../db/ensureMayaBrainSchema';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const [before] = await sequelize.query<{ t: string | null }>(
    `SELECT to_regclass('maya_brain_items')::text AS t`, { type: QueryTypes.SELECT });
  console.log(`maya_brain_items exists before: ${before?.t ? 'yes' : 'no'}`);
  if (!apply) {
    console.log('DRY RUN - would run:');
    for (const s of MAYA_BRAIN_SCHEMA_STATEMENTS) console.log(`\n${s};`);
    console.log('\nRe-run with --apply to create it.');
    await sequelize.close();
    return;
  }
  const r = await ensureMayaBrainSchema();
  const [after] = await sequelize.query<{ t: string | null; n: string }>(
    `SELECT to_regclass('maya_brain_items')::text AS t, (SELECT COUNT(*) FROM maya_brain_items)::text AS n`, { type: QueryTypes.SELECT });
  console.log(`applied ${r.ok}/${MAYA_BRAIN_SCHEMA_STATEMENTS.length} statements; skipped: ${r.skipped.length ? r.skipped.join(' | ') : 'none'}`);
  console.log(`maya_brain_items exists after: ${after?.t ? 'yes' : 'no'}; rows: ${after?.n}`);
  await sequelize.close();
  if (r.skipped.length) process.exit(1);
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('ensureMayaBrainSchema failed:', err?.message || err);
    try { await sequelize.close(); } catch { /* closed */ }
    process.exit(1);
  });
}
