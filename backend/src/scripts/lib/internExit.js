// Intern exit helper.
//
// Safe two-step model:
//   previewExit({ query, reason, executeBasecampUnassign? }) - READ ONLY.
//     Finds candidate intern(s) in CCPP, finds their Basecamp todos in project
//     24865175, builds a preview of what an exit would change. Does NOT write.
//
//   executeExit({ internId, reasonId, reasonText, confirmedBy }) - WRITES.
//     UPDATE ADF_InternshipProgram SET InternIsActive=0, InternEndDate=GETDATE(),
//       InternCancelReasonID=<reasonId> WHERE InternID=<internId>.
//     Un-assigns the intern from every active todo in project 24865175 where
//     they appear as an assignee.
//     Appends an audit row to /tmp/intern-exit-log.jsonl with the full diff.
//
// CALLERS:
//   - confirmInternExit.js standalone script (CLI entry point Ali runs)
//   - @CB handler exit_intern tool calls previewExit only; execute happens via
//     the standalone script or a separately-approved follow-up.

const path = require('path');
const fs = require('fs');
const sql = require(path.resolve(__dirname, '../../../../node_modules/mssql'));
const { findInternByQuery, getActiveInterns, matchAssignee, closePool } = require(path.resolve(__dirname, './ccppInternRoster'));

const BC_ACCOUNT = '3945211';
const BC_BUCKET = 24865175;
const BC_BASE = `https://3.basecampapi.com/${BC_ACCOUNT}/buckets/${BC_BUCKET}`;
const AUDIT_PATH = path.resolve(__dirname, '../../../../tmp/intern-exit-log.jsonl');

const REASON_LOOKUP = {
  quit: { id: 1, label: 'Quit' },
  nocallnoshow: { id: 2, label: 'No Call No Show' },
  nochow: { id: 2, label: 'No Call No Show' },
  placed: { id: 3, label: 'Placed' },
  fired: { id: 4, label: 'Fired' },
  never: { id: 5, label: 'Never Started' },
  neverstarted: { id: 5, label: 'Never Started' },
};

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry InternExit', Accept: 'application/json', 'Content-Type': 'application/json' };
}

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BC_BASE + p, { headers: bcHeaders() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let n = p.startsWith('http') ? p : BC_BASE + p;
  const out = [];
  while (n) {
    const r = await fetch(n, { headers: bcHeaders() });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    n = lh ? lh[1] : null;
  }
  return out;
}
async function bcPut(p, body) {
  const r = await fetch(p.startsWith('http') ? p : BC_BASE + p, { method: 'PUT', headers: bcHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function normalizeReason(reason) {
  if (!reason) return null;
  const key = String(reason).toLowerCase().replace(/[^a-z]/g, '');
  return REASON_LOOKUP[key] || null;
}

async function findInternsTodosInBC(internName) {
  // Walk every active todo in project 24865175 (Project 1/2/3 todosets) and
  // return any whose assignees include this name.
  const TODOSET_IDS = [4327600402, 4327600416, 4327600417];
  const hits = [];
  for (const tsId of TODOSET_IDS) {
    let todolists;
    try { todolists = await bcGet(`/todosets/${tsId}/todolists.json`); }
    catch (_e) { continue; }
    if (!Array.isArray(todolists)) todolists = await bcGetAll(`/todosets/${tsId}/todolists.json`);
    for (const tl of todolists) {
      const active = await bcGetAll(`/todolists/${tl.id}/todos.json`);
      for (const t of active) {
        if (!Array.isArray(t.assignees) || t.assignees.length === 0) continue;
        const matched = t.assignees.find((a) => matchAssignee([{ InternID: 0, name: internName, email: null }], a) !== null
          || (a.name || '').toLowerCase().includes((internName || '').split(',')[0].toLowerCase().split(' ')[0])
          || (internName || '').toLowerCase().includes((a.name || '').toLowerCase().split(' ')[0]));
        if (matched) {
          hits.push({
            todoId: t.id,
            title: (t.content || '').slice(0, 120),
            todolistName: tl.name,
            assignees: t.assignees.map((a) => ({ id: a.id, name: a.name })),
            matchedAssignee: { id: matched.id, name: matched.name },
            url: t.app_url || `https://app.basecamp.com/${BC_ACCOUNT}/buckets/${BC_BUCKET}/todos/${t.id}`,
          });
        }
      }
    }
  }
  return hits;
}

async function previewExit({ query, reason }) {
  // 1. CCPP candidates
  const candidates = await findInternByQuery(query);
  // 2. For the top candidate (if any), find their Basecamp todos.
  let basecampTodos = [];
  if (candidates.length > 0) {
    const top = candidates[0];
    try { basecampTodos = await findInternsTodosInBC(top.name); } catch (e) { basecampTodos = []; }
  }
  const reasonResolved = normalizeReason(reason);
  return {
    query,
    candidates,
    primary: candidates[0] || null,
    basecampTodos,
    reason: reason || null,
    reasonResolved,
    confirmHint: candidates[0]
      ? `To execute, run: node backend/src/scripts/confirmInternExit.js --intern-id ${candidates[0].InternID} --reason ${reason || 'placed'} --confirmed-by ali`
      : null,
  };
}

async function executeExit({ internId, reasonKey, confirmedBy }) {
  const reason = normalizeReason(reasonKey);
  if (!reason) throw new Error(`Unknown reason: ${reasonKey}. Use quit|nochow|placed|fired|never.`);
  if (!internId) throw new Error('internId required');
  if (!confirmedBy) throw new Error('confirmedBy required for audit');

  const pool = await sql.connect({
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true, requestTimeout: 30000 },
  });

  // Fetch the intern's current state for audit before changing
  const before = (await pool.request().input('id', sql.Int, internId).query(`
    SELECT InternID, InternUserID, InternIsActive, InternEndDate, InternCancelReasonID, InternBaseCampAlis
    FROM ADF_InternshipProgram WHERE InternID = @id
  `)).recordset[0];
  if (!before) throw new Error(`No InternshipProgram row for InternID ${internId}`);
  if (!before.InternIsActive) {
    console.warn(`[intern-exit] InternID ${internId} already inactive; running idempotent re-confirm.`);
  }

  // Fetch the intern's full name for BC matching
  const nameRow = (await pool.request().input('id', sql.Int, internId).query(`
    SELECT TOP 1 Intern, InternEmail FROM vw_QS_MetricsDashboard_InternshipTracking_ALL_Interns WHERE InternID = @id
  `)).recordset[0];
  const internName = nameRow?.Intern || before.InternBaseCampAlis || '';

  // Unassign on Basecamp side
  const bcTodos = await findInternsTodosInBC(internName);
  const bcUnassignResults = [];
  for (const todo of bcTodos) {
    const newAssignees = todo.assignees.filter((a) => a.id !== todo.matchedAssignee.id).map((a) => a.id);
    try {
      await bcPut(`/todos/${todo.todoId}.json`, { assignee_ids: newAssignees });
      bcUnassignResults.push({ todoId: todo.todoId, title: todo.title, ok: true });
    } catch (e) {
      bcUnassignResults.push({ todoId: todo.todoId, title: todo.title, ok: false, error: e.message });
    }
  }

  // CCPP write
  await pool.request()
    .input('id', sql.Int, internId)
    .input('reasonId', sql.Int, reason.id)
    .query(`
      UPDATE ADF_InternshipProgram
      SET InternIsActive = 0,
          InternEndDate = GETDATE(),
          InternCancelReasonID = @reasonId
      WHERE InternID = @id
    `);
  const after = (await pool.request().input('id', sql.Int, internId).query(`
    SELECT InternID, InternIsActive, InternEndDate, InternCancelReasonID
    FROM ADF_InternshipProgram WHERE InternID = @id
  `)).recordset[0];
  await pool.close();
  await closePool();

  const audit = {
    ts: new Date().toISOString(),
    internId,
    internName,
    reason: reason.label,
    reasonId: reason.id,
    confirmedBy,
    before: { InternIsActive: before.InternIsActive, InternEndDate: before.InternEndDate, InternCancelReasonID: before.InternCancelReasonID },
    after: { InternIsActive: after.InternIsActive, InternEndDate: after.InternEndDate, InternCancelReasonID: after.InternCancelReasonID },
    basecampUnassignments: bcUnassignResults,
  };
  try {
    fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
    fs.appendFileSync(AUDIT_PATH, JSON.stringify(audit) + '\n');
  } catch (e) { console.error('[intern-exit] audit write failed:', e.message); }
  return audit;
}

module.exports = { previewExit, executeExit, normalizeReason, REASON_LOOKUP };
