/* eslint-disable */
/**
 * interviewPrepPeople.js
 *
 * Person-level de-duplication for the interview-prep queue. The same human can
 * hold multiple IPBC accounts (verified in CCPP: one email maps to multiple
 * StudentUserIDs), and a student routinely has several active interviews
 * (Sehrish Khan has 7). Without grouping, the nudge engine would fire one email
 * per interview per account — a barrage, and exactly the "duplicate
 * communications" Ali called out.
 *
 * Canonical person key = the lowercased email address (an email uniquely
 * identifies a human; same email across two StudentUserIDs = same person). When
 * the email is unresolved we fall back to the CandidateID so the person's own
 * interviews still combine. All of a person's known addresses are collected so a
 * single combined email reaches every inbox they use, once.
 *
 * NO business logic beyond grouping + email resolution; the classifier owns
 * stage/urgency, the nudge content lib owns the words.
 */

const path = require('path');

// CandidateID -> student email. CandidateID == vw_SyncIPBCUsers.StudentUserID
// (verified live 2026-06-10). Returns { [candidateId]: email }. Best-effort: if
// CCPP creds are absent (local fixture render) returns {} and grouping falls back
// to CandidateID.
async function resolveEmails(candidateIds) {
  const ids = Array.from(new Set((candidateIds || []).filter((n) => Number(n) > 0)));
  const map = {};
  if (!ids.length || !process.env.MSSQL_HOST) return map;
  const sql = require(path.resolve(__dirname, '../../../../node_modules/mssql'));
  const cfg = {
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE || 'CCPP',
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 60000,
  };
  await sql.connect(cfg);
  try {
    const q = `SELECT StudentUserID, email FROM vw_SyncIPBCUsers WHERE StudentUserID IN (${ids.join(',')}) AND email IS NOT NULL`;
    (await sql.query(q)).recordset.forEach((r) => {
      if (r.email) map[r.StudentUserID] = String(r.email).trim();
    });
  } finally { await sql.close(); }
  return map;
}

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

/**
 * Group classified interview rows into persons.
 * @param rows classified rows (from interviewPrepData) — already excludes COMPLETE upstream if desired
 * @param emailMap { candidateId: email }
 * @returns persons: [{ key, name, emails:[canonical...], primaryEmail, candidateIds:[], interviews:[rows] }]
 *          sorted by the most-urgent interview each person holds.
 */
function groupByPerson(rows, emailMap = {}) {
  const groups = new Map();
  for (const r of rows) {
    const email = normEmail(emailMap[r.candidateId]);
    const key = email || `cand:${r.candidateId || r.student}`;
    if (!groups.has(key)) {
      groups.set(key, { key, name: r.student, emails: new Set(), candidateIds: new Set(), interviews: [] });
    }
    const g = groups.get(key);
    if (email) g.emails.add(email);
    if (r.candidateId) g.candidateIds.add(r.candidateId);
    g.interviews.push(r);
    // keep the most complete display name
    if (r.student && r.student.length > (g.name || '').length) g.name = r.student;
  }
  const persons = Array.from(groups.values()).map((g) => {
    const emails = Array.from(g.emails);
    return {
      key: g.key,
      name: g.name,
      emails,
      primaryEmail: emails[0] || '',
      candidateIds: Array.from(g.candidateIds),
      interviews: g.interviews.slice().sort((a, b) => rank(a) - rank(b)),
    };
  });
  // most urgent person first (their single most urgent interview)
  persons.sort((pa, pb) => rank(pa.interviews[0]) - rank(pb.interviews[0]));
  return persons;
}

// lower = more urgent; reuse the same intent as the classifier's TIER_RANK
const URGENCY = { TODAY: 0, CRITICAL: 1, IMMINENT: 2, SURVEY: 3, AT_RISK: 4, BEHIND: 5, SOON: 6, ON_TRACK: 7, DONE: 8 };
function rank(row) {
  if (!row) return 99;
  const base = URGENCY[row.tier] != null ? URGENCY[row.tier] : 7;
  return base * 1000 + (row.days < 0 ? row.days : row.days); // tie-break: sooner / longer-waiting first
}

module.exports = { resolveEmails, groupByPerson, normEmail };
