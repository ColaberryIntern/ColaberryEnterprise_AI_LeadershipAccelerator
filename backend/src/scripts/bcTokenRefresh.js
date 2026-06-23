// Refresh the Basecamp OAuth access token via the launchpad refresh_token
// exchange and write the fresh token back to CCPP.Basecamp_AuthInfo, so the
// whole integration (container basecampToken self-heal, host cron-env-wrapper
// cache, one-off scripts) recovers from a "rekeyed_identity / token expired"
// outage. No code in the repo did this exchange before.
//
// SAFETY: never prints a secret value. Only HTTP codes, string LENGTHS, and
// masked diagnostics reach stdout. Reads OAuth creds from CCPP.
//
// Schema-agnostic: discovers Basecamp_AuthInfo column names at runtime.
//
// Gates:
//   (default)          DISCOVER — read-only. Map columns, show lengths, probe
//                      the current access token.
//   REFRESH=1          MINT — also run the refresh exchange + probe the new
//                      token. Does NOT write to the DB.
//   REFRESH=1 WRITE=1  WRITEBACK — mint, probe, then UPDATE the active row's
//                      access token (+ refresh token if rotated, + a date col).
//
// Runs inside the prod backend container (mssql + CCPP env + Node 20 fetch).
//
// OAuth creds (refresh_token, client_id, client_secret, optional redirect_uri)
// are NOT in CCPP. Supply them via a JSON file whose path is in BC_OAUTH_FILE,
// e.g. {"client_id":"...","client_secret":"...","refresh_token":"...","redirect_uri":"..."}.
// The file path (not its contents) is all that ever appears in a command.
const sql = require('mssql');
const fs = require('fs');

function loadFileCreds() {
  const p = process.env.BC_OAUTH_FILE;
  if (!p) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { throw new Error(`Could not read BC_OAUTH_FILE (${p}): ${e.message}`); }
}

const ACCOUNT_ID = '3945211';
const TABLE = 'Basecamp_AuthInfo';
const REFRESH = process.env.REFRESH === '1';
const WRITE = process.env.WRITE === '1';
const TOKEN_URL = 'https://launchpad.37signals.com/authorization/token';

const len = (v) => (v == null ? 'null' : `${String(v).length} chars`);

function cfg() {
  return {
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE || 'CCPP',
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
  };
}

async function probe(token) {
  if (!token) return 'no-token';
  const r = await fetch(`https://3.basecampapi.com/${ACCOUNT_ID}/projects.json`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${String(token).replace(/^Bearer\s+/i, '').trim()}`, 'User-Agent': 'Colaberry token refresh probe' },
  });
  return r.status;
}

(async () => {
  const pool = await new sql.ConnectionPool(cfg()).connect();
  try {
    // 1. Discover columns.
    const cols = (await pool.request().query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${TABLE}'`
    )).recordset;
    const names = cols.map((c) => c.COLUMN_NAME);
    const find = (re) => names.find((n) => re.test(n));
    const map = {
      id: find(/^BasecampAuthInfoID$/i) || find(/id$/i) || names[0],
      access: find(/access.*token/i),
      refresh: find(/refresh.*token/i),
      clientId: find(/client.*id/i),
      clientSecret: find(/client.*secret/i),
      redirect: find(/redirect/i),
      active: find(/is.?active|^active$/i),
      date: find(/updated|modified|created|date|^ts$/i),
    };
    console.log('COLUMNS:', names.join(', '));
    console.log('MAPPING:', JSON.stringify(map));

    // 2. Read the active row.
    const order = map.id ? `ORDER BY [${map.id}] DESC` : '';
    const where = map.active ? `WHERE [${map.active}] = 1` : '';
    const row = (await pool.request().query(`SELECT TOP 1 * FROM ${TABLE} ${where} ${order}`)).recordset[0];
    if (!row) throw new Error('No active row found in Basecamp_AuthInfo');

    const fc = loadFileCreds();
    const accessTok = map.access ? row[map.access] : null;
    const refreshTok = fc.refresh_token || (map.refresh ? row[map.refresh] : null) || process.env.BASECAMP_REFRESH_TOKEN || null;
    const clientId = fc.client_id || (map.clientId ? row[map.clientId] : null) || process.env.BASECAMP_CLIENT_ID || null;
    const clientSecret = fc.client_secret || (map.clientSecret ? row[map.clientSecret] : null) || process.env.BASECAMP_CLIENT_SECRET || null;
    const redirect = fc.redirect_uri || (map.redirect ? row[map.redirect] : null) || process.env.BASECAMP_REDIRECT_URI || null;

    console.log('\nACTIVE ROW:');
    console.log(`  ${map.id} = ${row[map.id]}`);
    if (map.date) console.log(`  ${map.date} = ${row[map.date]}`);
    console.log(`  access_token:  ${len(accessTok)}`);
    console.log(`  refresh_token: ${len(refreshTok)}`);
    console.log(`  client_id:     ${len(clientId)}`);
    console.log(`  client_secret: ${len(clientSecret)}`);
    console.log(`  redirect_uri:  ${redirect ? redirect : 'null'}`);

    const curCode = await probe(accessTok);
    console.log(`\nCurrent access token probe -> HTTP ${curCode}`);

    if (!REFRESH) {
      console.log('\nDISCOVER only. Re-run with REFRESH=1 to mint a new token (no write), then REFRESH=1 WRITE=1 to persist.');
      return;
    }

    // 3. Mint via refresh exchange.
    if (!refreshTok || !clientId || !clientSecret) {
      throw new Error('Cannot refresh: missing refresh_token, client_id, or client_secret. Re-authorization (browser) required.');
    }
    const params = new URLSearchParams({ type: 'refresh', refresh_token: String(refreshTok).trim(), client_id: String(clientId).trim(), client_secret: String(clientSecret).trim() });
    if (redirect) params.set('redirect_uri', String(redirect).trim());
    const ex = await fetch(`${TOKEN_URL}?${params.toString()}`, { method: 'POST', headers: { 'User-Agent': 'Colaberry token refresh', Accept: 'application/json' } });
    const exText = await ex.text();
    if (!ex.ok) {
      console.log(`\nEXCHANGE FAILED -> HTTP ${ex.status}: ${exText.slice(0, 300)}`);
      throw new Error('Refresh exchange failed. Likely the refresh token is also invalid; browser re-authorization needed.');
    }
    let parsed; try { parsed = JSON.parse(exText); } catch { parsed = {}; }
    const newAccess = parsed.access_token;
    const newRefresh = parsed.refresh_token; // usually undefined (BC does not rotate)
    console.log(`\nEXCHANGE OK -> HTTP ${ex.status}. new access_token: ${len(newAccess)}, expires_in: ${parsed.expires_in || 'n/a'}`);
    if (!newAccess) throw new Error('Exchange returned no access_token');

    const newCode = await probe(newAccess);
    console.log(`New access token probe -> HTTP ${newCode}`);
    if (newCode !== 200) throw new Error(`New token failed probe (HTTP ${newCode}); not writing back.`);

    if (!WRITE) {
      console.log('\nMINT OK (no write). Re-run with REFRESH=1 WRITE=1 to persist to CCPP.');
      return;
    }

    // 4. Writeback to the active row.
    if (!map.access) throw new Error('No access-token column identified; cannot write back.');
    const req = pool.request();
    req.input('newAccess', sql.NVarChar(sql.MAX), newAccess);
    req.input('rowId', row[map.id]);
    // Update only the access token. Nothing in our stack reads ExpiryDate for
    // validity (resolver + cron-wrapper probe the token directly), and CCPP is
    // externally owned — leave the date columns untouched.
    const sets = [`[${map.access}] = @newAccess`];
    if (newRefresh && map.refresh) { req.input('newRefresh', sql.NVarChar(sql.MAX), newRefresh); sets.push(`[${map.refresh}] = @newRefresh`); }
    const updateSql = `UPDATE ${TABLE} SET ${sets.join(', ')} WHERE [${map.id}] = @rowId`;
    console.log(`\nWRITEBACK: ${updateSql}`);
    const res = await req.query(updateSql);
    console.log(`Rows affected: ${res.rowsAffected.join(',')}`);
    console.log('\nWRITEBACK DONE. CCPP now holds a valid token; container + cron-wrapper will self-heal from it.');
  } finally {
    await pool.close();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
