/**
 * Provision Ram a second, sales-role identity on enterprise.colaberry.ai.
 *
 * Requested by Sai on 2026-09-09, following the pattern Ali set for him on
 * 2026-08-20 (saitejesh+sales@colaberry.com): Ram keeps his admin account
 * untouched and gets a plus-alias identity with role=sales, so he can see the
 * platform exactly as the reps do. The plus-alias delivers to his normal inbox.
 *
 * Same shape and guards as provisionSalesReps20260809.js, reduced to one row.
 *
 *   node backend/src/scripts/provisionRamSalesIdentity20260911.js
 *     Dry run. Reports what would happen. Touches nothing.
 *
 *   node backend/src/scripts/provisionRamSalesIdentity20260911.js --commit
 *     Creates the account if missing. If it already exists with role=sales,
 *     reports that and exits 0 without changing anything (idempotent).
 *
 *   ... --commit --reset
 *     Also rotates the password on an EXISTING role=sales row. Deliberately
 *     not idempotent, which is why it sits behind its own flag.
 *
 * Safety: never touches a row whose role is not 'sales'. If ram+sales@ ever
 * existed as an admin row, this refuses and says so rather than clobbering it.
 * The base admin account ram@colaberry.com is never read or written here.
 *
 * Output: a RESULT_JSON line on stdout for the credential email to consume.
 * The temp password appears ONLY there.
 */
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Sequelize } = require('sequelize');

const REP = { email: 'ram+sales@colaberry.com', name: 'Ram' };
const SALT_ROUNDS = 12;
const ROLE = 'sales';

// Base32 without the easily-confused characters (no 0/O, no 1/I/L), so a
// password read off a screen gets typed correctly the first time.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateTempPassword() {
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('FATAL DATABASE_URL not set');
    process.exit(1);
  }
  const argv = process.argv.slice(2);
  const commit = argv.includes('--commit');
  const reset = argv.includes('--reset');
  if (reset && !commit) {
    console.error('FATAL --reset requires --commit');
    process.exit(1);
  }
  console.log(`mode: ${commit ? (reset ? 'COMMIT + RESET' : 'COMMIT') : 'DRY RUN'}`);

  const seq = new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres', logging: false });
  let result;

  const [rows] = await seq.query(
    'SELECT id, email, role, created_at FROM admin_users WHERE LOWER(email) = LOWER($1)',
    { bind: [REP.email] }
  );
  const existing = rows[0];

  if (!existing) {
    if (!commit) {
      console.log(`[would create] ${REP.email} (role=${ROLE})`);
      result = { ...REP, status: 'would_provision' };
    } else {
      const tempPassword = generateTempPassword();
      const hash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
      await seq.query(
        `INSERT INTO admin_users (id, email, password_hash, role, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
        { bind: [REP.email, hash, ROLE] }
      );
      console.log(`[created] ${REP.email} (role=${ROLE})`);
      result = { ...REP, status: 'provisioned', role: ROLE, tempPassword };
    }
  } else if (existing.role !== ROLE) {
    console.log(
      `[SKIP - not a sales account] ${REP.email} has role=${existing.role}. ` +
      'Refusing to touch it. Resolve by hand if this is wrong.'
    );
    result = { ...REP, status: 'skipped_wrong_role', existingRole: existing.role };
  } else if (!reset) {
    console.log(`[exists] ${REP.email} (role=${existing.role}, created=${existing.created_at})`);
    result = { ...REP, status: 'already_exists', createdAt: existing.created_at };
  } else {
    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
    const [, meta] = await seq.query(
      'UPDATE admin_users SET password_hash = $1 WHERE id = $2 AND role = $3',
      { bind: [hash, existing.id, ROLE] }
    );
    if (!meta || meta.rowCount !== 1) {
      console.error(`FATAL expected to update exactly 1 row, updated ${meta && meta.rowCount}`);
      await seq.close();
      process.exit(1);
    }
    console.log(`[reset] ${REP.email} (role=${ROLE})`);
    result = { ...REP, status: 'provisioned', role: ROLE, tempPassword, reset: true };
  }

  // Prove the end state rather than trusting the write: exactly one sales row,
  // and the admin account it sits beside is untouched.
  const [check] = await seq.query(
    `SELECT email, role FROM admin_users WHERE LOWER(email) IN (LOWER($1), 'ram@colaberry.com') ORDER BY email`,
    { bind: [REP.email] }
  );
  console.log('end state: ' + check.map((r) => `${r.email}=${r.role}`).join(', '));

  await seq.close();
  if (!commit) console.log('DRY RUN: nothing was written. Re-run with --commit.');
  console.log('\nRESULT_JSON:' + JSON.stringify(result));
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
