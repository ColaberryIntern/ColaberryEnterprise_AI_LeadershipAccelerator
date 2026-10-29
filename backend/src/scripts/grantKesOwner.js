/**
 * grantKesOwner — grant Kes the management `owner` role (mgmt-portal M3, the Kes access fix).
 *
 * Making Kes `owner` is what lets management (Ali + Kes) see every admin section, including the new
 * Interns-hub Agents and Gov Contracts tabs. `owner` is already a valid `mgmt_role` (server.ts CHECK
 * constraint), so this needs no migration — only a one-row update.
 *
 * This is a PROD WRITE, so it is DRY-RUN by default and never guesses: Kes has two person records,
 * and this script REFUSES to write when more than one `community_members` row matches, printing both
 * so a human picks with --id. Idempotent: a row already `owner` is skipped (the rule tested in
 * services/access/__tests__/ownerGrant.test.ts — resolveOwnerGrant).
 *
 * Run (inside the prod backend container, which has DATABASE_URL):
 *   docker exec accelerator-backend node src/scripts/grantKesOwner.js            # dry run: list rows
 *   docker exec accelerator-backend node src/scripts/grantKesOwner.js --apply    # write (only if 1 row)
 *   docker exec accelerator-backend node src/scripts/grantKesOwner.js --apply --id <uuid>   # pick a row
 *
 * Rollback: UPDATE community_members SET mgmt_role = <prior|NULL> WHERE id = '<uuid>';
 */
const { Sequelize, QueryTypes } = require('sequelize');

const EMAIL = 'kes@colaberry.com';
const APPLY = process.argv.includes('--apply');
const idFlag = process.argv.indexOf('--id');
const ONLY_ID = idFlag !== -1 ? process.argv[idFlag + 1] : null;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL not set. Run inside the prod backend container.');
    process.exit(1);
  }
  const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });
  try {
    const rows = await sequelize.query(
      `SELECT id::text AS id, email, display_name, mgmt_role
         FROM community_members
        WHERE lower(email) = lower($1)
        ORDER BY id`,
      { bind: [EMAIL], type: QueryTypes.SELECT },
    );

    if (rows.length === 0) {
      console.log(JSON.stringify({ event: 'grant_kes_owner', outcome: 'no_rows', email: EMAIL }));
      return;
    }

    console.log(`Found ${rows.length} community_members row(s) for ${EMAIL}:`);
    for (const r of rows) {
      // Idempotency rule — mirrors resolveOwnerGrant(): a row already 'owner' needs no write.
      const shouldWrite = r.mgmt_role !== 'owner';
      console.log(`  id=${r.id}  name=${r.display_name ?? '(none)'}  mgmt_role=${r.mgmt_role ?? 'NULL'}  -> ${shouldWrite ? 'WOULD GRANT owner' : 'already owner (skip)'}`);
    }

    const targets = ONLY_ID ? rows.filter((r) => r.id === ONLY_ID) : rows;
    if (ONLY_ID && targets.length === 0) {
      console.error(`--id ${ONLY_ID} matched none of the rows above. Copy an id exactly.`);
      process.exit(1);
    }
    if (!APPLY) {
      console.log('\nDry run. Re-run with --apply to write' + (rows.length > 1 && !ONLY_ID ? ' (and --id <uuid> to pick one of the two rows).' : '.'));
      return;
    }
    if (targets.length > 1) {
      console.error('\nRefusing to write: more than one row matched and no --id given. Pick the staff row with --id <uuid>.');
      process.exit(1);
    }

    const target = targets[0];
    if (target.mgmt_role === 'owner') {
      console.log(JSON.stringify({ event: 'grant_kes_owner', outcome: 'already_owner', id: target.id }));
      return;
    }
    const [, affected] = await sequelize.query(
      `UPDATE community_members SET mgmt_role = 'owner' WHERE id = $1 AND mgmt_role IS DISTINCT FROM 'owner'`,
      { bind: [target.id], type: QueryTypes.UPDATE },
    );
    console.log(JSON.stringify({
      event: 'grant_kes_owner', outcome: 'granted', id: target.id, from: target.mgmt_role ?? null, to: 'owner', rows_affected: affected,
    }));
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'grant_kes_owner', outcome: 'error', message: err && err.message }));
  process.exit(1);
});
