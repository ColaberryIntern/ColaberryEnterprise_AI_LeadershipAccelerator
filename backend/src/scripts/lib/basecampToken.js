// Basecamp access-token resolver.
//
// The Basecamp token rotates every ~2 weeks and the source of truth is the
// CCPP `Basecamp_AuthInfo` table (per CLAUDE.md secrets policy + SETUP.md).
// Scripts historically hardcoded a token that then expired; this helper pulls
// the live active token from CCPP at runtime so jobs never run on a stale one.
//
// Resolution order:
//   1. If MSSQL_* (CCPP) env is present, pull the active token from CCPP.
//      On failure, fall back to BASECAMP_ACCESS_TOKEN env if set.
//   2. Else use BASECAMP_ACCESS_TOKEN env.
//   3. Else throw.
//
// CCPP creds (MSSQL_HOST/PORT/USER/PASS/DATABASE) live in the prod backend
// container env, never in the repo. Locally (no creds) this resolves from
// BASECAMP_ACCESS_TOKEN or throws - which is why poster dry-runs use --no-post.

const path = require('path');

function loadSql() {
  try { return require('mssql'); }
  catch { return require(path.resolve(__dirname, '../../../../node_modules/mssql')); }
}

function clean(t) { return String(t || '').replace(/^Bearer\s+/i, '').trim(); }

const TOKEN_QUERY = 'SELECT TOP 1 AccessToken FROM Basecamp_AuthInfo WHERE IsActive = 1 ORDER BY BasecampAuthInfoID DESC';

async function fetchFromCcpp() {
  const sql = loadSql();
  const cfg = {
    server: process.env.MSSQL_HOST,
    port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
  };
  const pool = await new sql.ConnectionPool(cfg).connect();
  try {
    const r = await pool.request().query(TOKEN_QUERY);
    const t = clean(r.recordset && r.recordset[0] && r.recordset[0].AccessToken);
    if (!t) throw new Error('Basecamp_AuthInfo returned no active token (IsActive = 1)');
    return t;
  } finally {
    await pool.close();
  }
}

// Returns the active Basecamp access token. Never logs the token value.
async function getBasecampToken() {
  const envTok = clean(process.env.BASECAMP_ACCESS_TOKEN);
  if (process.env.MSSQL_HOST) {
    try {
      return await fetchFromCcpp();
    } catch (e) {
      if (envTok) {
        console.warn(`[basecampToken] CCPP pull failed (${e.message}); falling back to BASECAMP_ACCESS_TOKEN env.`);
        return envTok;
      }
      throw new Error(`CCPP token pull failed and no BASECAMP_ACCESS_TOKEN fallback: ${e.message}`);
    }
  }
  if (envTok) return envTok;
  throw new Error('No CCPP creds (MSSQL_HOST) and no BASECAMP_ACCESS_TOKEN set. Cannot resolve a Basecamp token.');
}

module.exports = { getBasecampToken };
