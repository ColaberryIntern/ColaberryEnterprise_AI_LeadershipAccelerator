/**
 * Provision the 3 sales reps Ram named on 2026-05-08 with role=sales.
 *
 * Idempotent: re-running checks admin_users by email and skips already-existing
 * accounts (reports their current role and provisioned date). For new rows,
 * generates a 12-char crypto-random temp password (4-4-4 base32 with dashes),
 * bcrypts with salt rounds = 12 to match adminService, inserts, and prints
 * the cleartext password so the caller can pipe it to the welcome email.
 *
 * Run: node backend/src/scripts/provisionSalesReps20260604.js
 *
 * Output: RESULT_JSON line on stdout with per-rep {email, status, tempPassword?}.
 */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Sequelize } = require('sequelize');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const REPS = [
  { email: 'john@colaberry.com',    name: 'John McBride' },
  { email: 'dlahme@colaberry.com',  name: 'David Lahme' },
  { email: 'ntaylor@colaberry.com', name: 'Nate Taylor' },
];

const SALT_ROUNDS = 12;
const ROLE = 'sales';

// Base32 alphabet without easily-confused chars (no 0/O, 1/I/L)
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
  const seq = new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres', logging: false });

  const results = [];
  for (const rep of REPS) {
    const [existing] = await seq.query(
      'SELECT id, email, role, created_at FROM admin_users WHERE LOWER(email) = LOWER($1)',
      { bind: [rep.email] }
    );
    if (existing.length > 0) {
      const row = existing[0];
      results.push({
        email: rep.email,
        name: rep.name,
        status: 'already_exists',
        existingRole: row.role,
        createdAt: row.created_at,
      });
      console.log(`[skip] ${rep.email} already exists (role=${row.role}, created=${row.created_at})`);
      continue;
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    await seq.query(
      `INSERT INTO admin_users (id, email, password_hash, role, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
      { bind: [rep.email, hash, ROLE] }
    );
    results.push({
      email: rep.email,
      name: rep.name,
      status: 'provisioned',
      role: ROLE,
      tempPassword,
    });
    console.log(`[ok]   ${rep.email} provisioned (role=${ROLE}, tempPassword=${tempPassword})`);
  }

  await seq.close();
  console.log('\nRESULT_JSON:' + JSON.stringify(results));
})().catch((e) => { console.error('FAIL:', e.message); console.error(e); process.exit(1); });
