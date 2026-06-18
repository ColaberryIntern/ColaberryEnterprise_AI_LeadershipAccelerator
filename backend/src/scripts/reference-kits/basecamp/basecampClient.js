// basecampClient — drop-in Basecamp API helper that gives ANY Claude Code
// project the exact same Basecamp visibility CB System has.
//
// CB System (the AI Ops engine in backend/src/services/ops/) authenticates to
// Basecamp account 3945211 with an OAuth access token. In Basecamp 3 a token
// sees exactly the projects its authorizing person is a member of. So "see what
// CB System can see" == use the SAME live token against the SAME account. That
// token is NOT a static secret: it rotates ~every 2 weeks and the source of
// truth is the CCPP `Basecamp_AuthInfo` table. This helper resolves it the same
// way CB System does, so a drop-in project never runs on a stale token.
//
// Resolution order (mirrors backend/src/scripts/lib/basecampToken.js):
//   1. BASECAMP_ACCESS_TOKEN env, if set (fastest path; what you pass in CI).
//   2. Else, if MSSQL_* (CCPP) env is present, pull the active token from CCPP.
//   3. Else throw — there is no token to resolve.
//
// CCPP is only reachable from inside the prod VPS network, so option 2 only
// works on prod (or over an SSH tunnel). Locally you pass BASECAMP_ACCESS_TOKEN
// directly: `node lib/printBasecampToken.js` on prod prints a live one, or pull
// it with the CCPP kit.

const path = require('path');

const ACCOUNT_ID = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;
const USER_AGENT = process.env.BASECAMP_USER_AGENT || 'Colaberry AI Ops Command Center (ali@colaberry.com)';

function clean(t) {
  return String(t || '').replace(/^Bearer\s+/i, '').trim();
}

function loadMssql() {
  try { return require('mssql'); }
  catch { return require(path.resolve(__dirname, '../../../../node_modules/mssql')); }
}

const TOKEN_QUERY =
  'SELECT TOP 1 AccessToken FROM Basecamp_AuthInfo WHERE IsActive = 1 ORDER BY BasecampAuthInfoID DESC';

async function fetchTokenFromCcpp() {
  const sql = loadMssql();
  const pool = await new sql.ConnectionPool({
    server: process.env.MSSQL_HOST,
    port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
  }).connect();
  try {
    const r = await pool.request().query(TOKEN_QUERY);
    const t = clean(r.recordset && r.recordset[0] && r.recordset[0].AccessToken);
    if (!t) throw new Error('Basecamp_AuthInfo returned no active token (IsActive = 1)');
    return t;
  } finally {
    await pool.close();
  }
}

let _cached = null;

// Returns the active Basecamp access token. Never logs the token value.
async function getBasecampToken() {
  if (_cached) return _cached;
  const envTok = clean(process.env.BASECAMP_ACCESS_TOKEN);
  if (envTok) { _cached = envTok; return envTok; }
  if (process.env.MSSQL_HOST) { _cached = await fetchTokenFromCcpp(); return _cached; }
  throw new Error(
    'No BASECAMP_ACCESS_TOKEN and no CCPP creds (MSSQL_HOST). Cannot resolve a Basecamp token. ' +
    'On prod: `node backend/src/scripts/lib/printBasecampToken.js`. Locally: export BASECAMP_ACCESS_TOKEN=...',
  );
}

function headers(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT, Accept: 'application/json', ...extra };
}

// Core request with one token-refresh retry on 401 (token rotated mid-run) and
// a capped backoff on 429/503 (BC rate limit). Mirrors basecampClient.ts.
async function bc(method, urlOrPath, body) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${API}${urlOrPath}`;
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getBasecampToken();
    const init = { method, headers: headers(token, body ? { 'Content-Type': 'application/json' } : {}) };
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await fetch(url, init);
    if (r.status === 401 && !refreshed) {
      _cached = null; // force re-resolve (rotation self-heal)
      refreshed = true;
      continue;
    }
    if ((r.status === 429 || r.status === 503) && attempt < 5) {
      const retryAfter = parseInt(r.headers.get('Retry-After') || '0', 10);
      await new Promise((res) => setTimeout(res, retryAfter ? retryAfter * 1000 : 1000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`BC ${method} ${url} -> ${r.status} ${txt.slice(0, 240)}`);
    }
    if (r.status === 204) return null;
    return { data: await r.json(), link: r.headers.get('Link') };
  }
}

async function bcGet(p) { return (await bc('GET', p)).data; }
async function bcPost(p, body) { return (await bc('POST', p, body || {})).data; }
async function bcPut(p, body) { return (await bc('PUT', p, body || {})).data; }

// Follow Basecamp's Link: rel="next" pagination and concatenate every page.
async function bcGetAll(p) {
  const out = [];
  let url = p;
  while (url) {
    const r = await bc('GET', url);
    if (Array.isArray(r.data)) out.push(...r.data);
    const m = (r.link || '').match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return out;
}

// === The "what CB System can see" surface ===

// The person this token authenticates AS. This IS CB System's Basecamp identity.
// Anything not visible to this person is not visible to CB System.
async function whoAmI() {
  return bcGet('/my/profile.json');
}

// Every project (bucket) the token owner is a member of. CB System's universe.
async function listProjects() {
  return bcGetAll('/projects.json');
}

// The to-do lists in a project. Walks the project's todoset dock entry first.
async function listTodolists(projectId) {
  const proj = await bcGet(`/projects/${projectId}.json`);
  const todoset = (proj.dock || []).find((d) => d.name === 'todoset');
  if (!todoset) return [];
  return bcGetAll(`/buckets/${projectId}/todosets/${todoset.id}/todolists.json`);
}

// The to-dos in a list.
async function listTodos(projectId, todolistId) {
  return bcGetAll(`/buckets/${projectId}/todolists/${todolistId}/todos.json`);
}

// The people on a project (who else can see it).
async function listPeople(projectId) {
  return bcGet(`/projects/${projectId}/people.json`);
}

// === Granting visibility (how a project enters CB System's view) ===

// Grant project access to one or more BC person ids. To make a project visible
// to CB System, grant the token owner (whoAmI().id). Idempotent: granting an
// existing member is a no-op on Basecamp's side.
async function grantProjectAccess(projectId, personIds) {
  return bcPut(`/projects/${projectId}/people/users.json`, { grant: [].concat(personIds) });
}

async function revokeProjectAccess(projectId, personIds) {
  return bcPut(`/projects/${projectId}/people/users.json`, { revoke: [].concat(personIds) });
}

module.exports = {
  ACCOUNT_ID,
  API,
  getBasecampToken,
  bc,
  bcGet,
  bcPost,
  bcPut,
  bcGetAll,
  whoAmI,
  listProjects,
  listTodolists,
  listTodos,
  listPeople,
  grantProjectAccess,
  revokeProjectAccess,
};
