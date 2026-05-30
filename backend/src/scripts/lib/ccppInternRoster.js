// CCPP intern roster lookup.
// Source of truth: dbo.ADF_InternshipProgram joined to user table for name/email.
// We rely on the existing view vw_QS_MetricsDashboard_InternshipTracking_ALL_Interns
// for the readable fields, but for any WRITE we go straight at ADF_InternshipProgram.
//
// Exports:
//   getActiveInterns() -> [{ internId, name, email, basecampAlias, startDate, manager, techGroup }]
//   matchAssignee(activeRoster, bcAssignee) -> roster row | null
//
// Matching rules (in order):
//   1. Exact case-insensitive email match (when both present)
//   2. Exact case-insensitive name match (full name)
//   3. Last-name + first-letter-of-first-name match (handles "Kalkidan B" vs "Kalkidan Bezabeh")
//   4. Otherwise null

const path = require('path');
const sql = require(path.resolve(__dirname, '../../../../node_modules/mssql'));

const POOL_CONFIG = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASS,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433', 10),
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true, requestTimeout: 30000 },
};

let cachedPool = null;
async function getPool() {
  if (cachedPool) return cachedPool;
  cachedPool = await sql.connect(POOL_CONFIG);
  return cachedPool;
}

async function getActiveInterns() {
  const pool = await getPool();
  // Use the view since it has Email + BC alias denormalized in. Distinct because
  // the view has one row per (intern, metric-period).
  const result = await pool.request().query(`
    SELECT DISTINCT
      InternID,
      Intern AS name,
      InternEmail AS email,
      InternBaseCampAlias AS basecampAlias,
      InternStartDate AS startDate,
      InternManager AS manager,
      InternTechGroupName AS techGroup
    FROM vw_QS_MetricsDashboard_InternshipTracking_ALL_Interns
    WHERE internisactive = 1
  `);
  return result.recordset;
}

function normalizeName(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(name) {
  return normalizeName(name).split(' ').filter(Boolean);
}

function matchAssignee(roster, bcAssignee) {
  if (!bcAssignee) return null;
  const bcEmail = (bcAssignee.email_address || bcAssignee.email || '').toLowerCase().trim();
  const bcName = bcAssignee.name || '';
  const bcNorm = normalizeName(bcName);
  const bcTokens = tokenize(bcName);
  const bcFirst = bcTokens[0] || '';
  const bcLast = bcTokens[bcTokens.length - 1] || '';

  // Pass 1: email
  if (bcEmail) {
    const m = roster.find((r) => (r.email || '').toLowerCase().trim() === bcEmail);
    if (m) return { row: m, matchType: 'email' };
  }
  // Pass 2: exact name
  let m = roster.find((r) => normalizeName(r.name) === bcNorm);
  if (m) return { row: m, matchType: 'name_exact' };
  // Pass 2b: "Last, First" CCPP form vs "First Last" Basecamp form
  if (bcTokens.length >= 2) {
    m = roster.find((r) => {
      const rt = tokenize(r.name);
      if (rt.length < 2) return false;
      const rFirst = rt[0];
      const rLast = rt[rt.length - 1];
      // CCPP names like "OBI, ANAMELECHI KINGSLEY" -> first=obi, last=kingsley
      // BC name "Kingsley Obi" -> first=kingsley, last=obi
      return (rFirst === bcLast && rLast === bcFirst);
    });
    if (m) return { row: m, matchType: 'name_swap' };
  }
  // Pass 3: last name + first letter of first name (Kalkidan B vs Kalkidan Bezabeh)
  if (bcFirst && bcLast) {
    m = roster.find((r) => {
      const rTokens = tokenize(r.name);
      if (rTokens.length < 2) return false;
      const rFirst = rTokens[0];
      const rLast = rTokens[rTokens.length - 1];
      return rLast === bcLast && rFirst[0] === bcFirst[0];
    });
    if (m) return { row: m, matchType: 'last_plus_first_initial' };
  }
  // Pass 4: just last name unique within roster (lower confidence)
  if (bcLast && bcLast.length >= 4) {
    const candidates = roster.filter((r) => {
      const rt = tokenize(r.name);
      return rt[rt.length - 1] === bcLast;
    });
    if (candidates.length === 1) return { row: candidates[0], matchType: 'last_name_only' };
  }
  return null;
}

async function findInternByQuery(query) {
  // Used by exit_intern: look up a roster row by name OR email substring.
  // Returns up to 5 candidates so the LLM/Ali can disambiguate.
  const pool = await getPool();
  const q = `%${query.replace(/[%_]/g, '')}%`;
  const result = await pool.request()
    .input('q', sql.NVarChar, q)
    .query(`
      SELECT DISTINCT TOP 5
        InternID,
        Intern AS name,
        InternEmail AS email,
        InternBaseCampAlias AS basecampAlias,
        InternStartDate AS startDate,
        InternEndDate AS endDate,
        internisactive AS isActive,
        InternManager AS manager
      FROM vw_QS_MetricsDashboard_InternshipTracking_ALL_Interns
      WHERE Intern LIKE @q OR InternEmail LIKE @q OR InternBaseCampAlias LIKE @q
      ORDER BY internisactive DESC, InternStartDate DESC
    `);
  return result.recordset;
}

async function closePool() {
  if (cachedPool) { await cachedPool.close(); cachedPool = null; }
}

module.exports = { getActiveInterns, matchAssignee, findInternByQuery, closePool };
