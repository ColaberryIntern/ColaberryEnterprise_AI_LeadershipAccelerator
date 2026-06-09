// Intern reinstate helper. Exact reverse of internExit.js.
//
//   executeReinstate({ internId, confirmedBy, note, reassignTodoIds, reassignAssigneeId })
//     UPDATE ADF_InternshipProgram SET InternIsActive=1, InternEndDate=NULL,
//       InternCancelReasonID=NULL WHERE InternID=<id>.
//     Re-assigns the intern to every todo in reassignTodoIds (BC PUT
//     /todos/{id}.json with assignee_ids ∪ {reassignAssigneeId}). Caller passes
//     the BC todo IDs (typically pulled from the prior exit audit row).
//     Appends an audit row to /tmp/intern-reinstate-log.jsonl with the diff.
//
// CALLERS:
//   - reinstateAkiwam.js one-off script (today)
//   - future confirmInternReinstate.js CLI when this becomes a recurring need

const path = require('path');
const fs = require('fs');
const sql = require(path.resolve(__dirname, '../../../../node_modules/mssql'));
const { closePool } = require(path.resolve(__dirname, './ccppInternRoster'));

const BC_ACCOUNT = '3945211';
const BC_BUCKET = 24865175;
const BC_BASE = `https://3.basecampapi.com/${BC_ACCOUNT}/buckets/${BC_BUCKET}`;
const AUDIT_PATH = path.resolve(__dirname, '../../../../tmp/intern-reinstate-log.jsonl');

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry InternReinstate', Accept: 'application/json', 'Content-Type': 'application/json' };
}
async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BC_BASE + p, { headers: bcHeaders() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcPut(p, body) {
  const r = await fetch(p.startsWith('http') ? p : BC_BASE + p, { method: 'PUT', headers: bcHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function executeReinstate({ internId, confirmedBy, note, reassignTodoIds = [], reassignAssigneeId = null }) {
  if (!internId) throw new Error('internId required');
  if (!confirmedBy) throw new Error('confirmedBy required for audit');

  const pool = await sql.connect({
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true, requestTimeout: 30000 },
  });

  const before = (await pool.request().input('id', sql.Int, internId).query(`
    SELECT InternID, InternUserID, InternIsActive, InternEndDate, InternCancelReasonID, InternBaseCampAlis
    FROM ADF_InternshipProgram WHERE InternID = @id
  `)).recordset[0];
  if (!before) throw new Error(`No InternshipProgram row for InternID ${internId}`);

  await pool.request().input('id', sql.Int, internId).query(`
    UPDATE ADF_InternshipProgram
    SET InternIsActive = 1,
        InternEndDate = NULL,
        InternCancelReasonID = NULL
    WHERE InternID = @id
  `);
  const after = (await pool.request().input('id', sql.Int, internId).query(`
    SELECT InternID, InternIsActive, InternEndDate, InternCancelReasonID
    FROM ADF_InternshipProgram WHERE InternID = @id
  `)).recordset[0];
  await pool.close();
  await closePool();

  // Re-assign on Basecamp side. Idempotent: PUT assignee_ids includes the
  // existing assignees ∪ {reassignAssigneeId}. If the intern is already on
  // the todo, this is a no-op.
  const bcReassignResults = [];
  if (reassignAssigneeId && reassignTodoIds.length > 0) {
    for (const todoId of reassignTodoIds) {
      try {
        const todo = await bcGet(`/todos/${todoId}.json`);
        const existing = (todo.assignees || []).map((a) => a.id);
        if (existing.includes(reassignAssigneeId)) {
          bcReassignResults.push({ todoId, title: (todo.content || '').slice(0, 120), ok: true, alreadyAssigned: true });
          continue;
        }
        const next = [...existing, reassignAssigneeId];
        await bcPut(`/todos/${todoId}.json`, { assignee_ids: next });
        bcReassignResults.push({ todoId, title: (todo.content || '').slice(0, 120), ok: true, alreadyAssigned: false });
      } catch (e) {
        bcReassignResults.push({ todoId, ok: false, error: e.message });
      }
    }
  }

  const audit = {
    ts: new Date().toISOString(),
    internId,
    confirmedBy,
    note: note || null,
    before: { InternIsActive: before.InternIsActive, InternEndDate: before.InternEndDate, InternCancelReasonID: before.InternCancelReasonID },
    after: { InternIsActive: after.InternIsActive, InternEndDate: after.InternEndDate, InternCancelReasonID: after.InternCancelReasonID },
    basecampReassignments: bcReassignResults,
  };
  try {
    fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
    fs.appendFileSync(AUDIT_PATH, JSON.stringify(audit) + '\n');
  } catch (e) { console.error('[intern-reinstate] audit write failed:', e.message); }
  return audit;
}

module.exports = { executeReinstate };
