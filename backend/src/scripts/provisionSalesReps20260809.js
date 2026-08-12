/**
 * Provision the 4 sales reps on enterprise.colaberry.ai with role=sales.
 *
 * Supersedes provisionSalesReps20260604.js, which covered only 3 reps. William
 * was added to the request on 2026-07-28, after that run. The June run also
 * printed its temp passwords to stdout and they were never delivered, so the
 * three existing accounts need fresh credentials, not just a status report.
 *
 *   node backend/src/scripts/provisionSalesReps20260809.js
 *     Dry run. Reports what each rep would get. Touches nothing.
 *
 *   node backend/src/scripts/provisionSalesReps20260809.js --commit
 *     Creates any missing account. Leaves existing accounts alone.
 *
 *   node backend/src/scripts/provisionSalesReps20260809.js --commit --reset
 *     Also rotates the password on existing role=sales accounts.
 *
 * Idempotency: the default and --commit paths are idempotent (same input, same
 * end state). --reset deliberately is not, because rotating a credential means
 * producing a new one each time. It is behind its own flag for that reason.
 *
 * Safety: --reset only ever touches rows whose role is already 'sales'. An
 * admin or super_admin sharing an email with this list is reported and skipped,
 * so a typo here can never clobber an operator account.
 *
 * Output: RESULT_JSON line on stdout, shaped for
 * sendSalesRepWelcomeEmails20260809.js to consume on stdin.
 */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Sequelize } = require('sequelize');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const REPS = [
  { email: 'john@colaberry.com', name: 'John McBride' },
  { email: 'dlahme@colaberry.com', name: 'David Lahme' },
  { email: 'ntaylor@colaberry.com', name: 'Nate Taylor' },
  { email: 'william@colaberry.com', name: "William O'Connell" },
];

const SALT_ROUNDS = 12;
const ROLE = 'sales';

// Base32 alphabet without easily-confused characters (no 0/O, no 1/I/L), so a
// password read off a screen or a phone gets typed correctly the first time.
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
  const results = [];

  for (const rep of REPS) {
    const [rows] = await seq.query(
      'SELECT id, email, role, created_at FROM admin_users WHERE LOWER(email) = LOWER($1)',
      { bind: [rep.email] }
    );
    const existing = rows[0];

    // ── New account ────────────────────────────────────────────────────────
    if (!existing) {
      if (!commit) {
        console.log(`[would create] ${rep.email} (role=${ROLE})`);
        results.push({ ...rep, status: 'would_provision' });
        continue;
      }
      const tempPassword = generateTempPassword();
      const hash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
      await seq.query(
        `INSERT INTO admin_users (id, email, password_hash, role, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
        { bind: [rep.email, hash, ROLE] }
      );
      console.log(`[created] ${rep.email} (role=${ROLE})`);
      results.push({ ...rep, status: 'provisioned', role: ROLE, tempPassword });
      continue;
    }

    // ── Guard: never rotate a non-sales account ────────────────────────────
    if (existing.role !== ROLE) {
      console.log(
        `[SKIP - not a sales account] ${rep.email} has role=${existing.role}. ` +
        'Refusing to touch it. Resolve by hand if this is wrong.'
      );
      results.push({ ...rep, status: 'skipped_wrong_role', existingRole: existing.role });
      continue;
    }

    // ── Existing sales account ─────────────────────────────────────────────
    if (!reset) {
      console.log(`[exists] ${rep.email} (role=${existing.role}, created=${existing.created_at})`);
      results.push({
        ...rep,
        status: 'already_exists',
        existingRole: existing.role,
        createdAt: existing.created_at,
      });
      continue;
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
    const [, meta] = await seq.query(
      'UPDATE admin_users SET password_hash = $1 WHERE id = $2 AND role = $3',
      { bind: [hash, existing.id, ROLE] }
    );
    if (!meta || meta.rowCount !== 1) {
      console.error(`FATAL expected to update exactly 1 row for ${rep.email}, updated ${meta && meta.rowCount}`);
      await seq.close();
      process.exit(1);
    }
    console.log(`[reset] ${rep.email} (role=${ROLE})`);
    results.push({ ...rep, status: 'provisioned', role: ROLE, tempPassword, reset: true });
  }

  await seq.close();

  const withPasswords = results.filter((r) => r.tempPassword).length;
  console.log(`\n${results.length} reps processed, ${withPasswords} credential(s) issued.`);
  if (!commit) console.log('DRY RUN: nothing was written. Re-run with --commit.');

  console.log('\nRESULT_JSON:' + JSON.stringify(results));
})().catch((e) => {
  console.error('FAIL:', e.message);
  console.error(e);
  process.exit(1);
});
