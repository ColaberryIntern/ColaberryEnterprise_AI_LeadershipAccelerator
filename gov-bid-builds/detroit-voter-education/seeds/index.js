require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../app/db');
const { encrypt } = require('../app/middleware/encryption');

async function seed() {
  const sessionId = '00000000-0000-0000-0000-000000000001';
  const zipCode = '48201'; // Detroit, Wayne County (near Wayne State University)
  const issues = ['Healthcare', 'Education'];

  const encZip = encrypt(zipCode);
  const encIssues = encrypt(JSON.stringify(issues));

  await pool.query(
    `INSERT INTO user_preferences (session_id, zip_code_enc, zip_iv, issues_enc, issues_iv)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (session_id) DO UPDATE
       SET zip_code_enc = $2, zip_iv = $3, issues_enc = $4, issues_iv = $5, updated_at = NOW()`,
    [sessionId, encZip.enc, encZip.iv, encIssues.enc, encIssues.iv],
  );

  await pool.query(
    `INSERT INTO audit_log (session_id, action, metadata)
     VALUES ($1, 'PREFERENCES_SET', $2)`,
    [sessionId, JSON.stringify({ source: 'seed', issue_count: issues.length })],
  );

  console.log(`Seeded: session=${sessionId} ZIP=${zipCode} issues=${issues.join(',')}`);
  await pool.end();
}

seed().catch((err) => { console.error(err.message); process.exit(1); });
