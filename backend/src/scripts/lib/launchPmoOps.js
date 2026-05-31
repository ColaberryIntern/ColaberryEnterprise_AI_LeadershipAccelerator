// Launch PMO operations - Basecamp write primitives for CB-as-PMO.
//
// Surfaces every Basecamp action CB needs to operate as the autonomous PMO
// for the AI Systems Architect Accelerator launch (project 47502609).
//
// All functions are idempotent where Basecamp allows:
//   - createTodolist: name-keyed; existing list by same name is returned
//   - createTodo: content+listId is the dedup key; checks existing first
//   - postMessage: subject-keyed; existing message with same subject is reused
//
// Token handling: process.env.BASECAMP_ACCESS_TOKEN preferred; falls back to
// the hardcoded current-cycle token (rotates every 2 weeks - sourced from
// CCPP.Basecamp_AuthInfo).

const { LAUNCH } = require('./launchPmoTeam');

const ACCOUNT = LAUNCH.basecampAccountId;
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';

function getToken() {
  let t = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK || '').trim();
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  return t;
}

const H = () => ({ Authorization: `Bearer ${getToken()}`, 'User-Agent': 'Colaberry LaunchPMO (ali@colaberry.com)', Accept: 'application/json', 'Content-Type': 'application/json' });

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { headers: H() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let next = p.startsWith('http') ? p : `${BASE}${p}`;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: H() });
    if (!r.ok) break;
    const body = await r.json();
    if (!Array.isArray(body)) break;
    out.push(...body);
    const link = r.headers.get('Link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}
async function bcPost(p, body) {
  const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPut(p, body) {
  const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { method: 'PUT', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${p} -> ${r.status} ${await r.text()}`);
  // 204 No Content (Basecamp's response for status-changes like trash) has no body.
  if (r.status === 204) return { status: 204 };
  const text = await r.text();
  if (!text) return { status: r.status };
  try { return JSON.parse(text); } catch { return { status: r.status, raw: text }; }
}

// =============================================================================
// Dock lookup (project IDs for todoset, message_board, schedule, etc).
// =============================================================================
let _dockCache = null;
async function getDock(projectId = LAUNCH.projectId) {
  if (_dockCache && _dockCache.projectId === projectId) return _dockCache;
  const proj = await bcGet(`/projects/${projectId}.json`);
  _dockCache = {
    projectId,
    todoset: proj.dock.find((d) => d.name === 'todoset'),
    messageBoard: proj.dock.find((d) => d.name === 'message_board'),
    vault: proj.dock.find((d) => d.name === 'vault'),
    schedule: proj.dock.find((d) => d.name === 'schedule'),
    chat: proj.dock.find((d) => d.name === 'chat'),
    kanbanBoard: proj.dock.find((d) => d.name === 'kanban_board'),
  };
  return _dockCache;
}

// =============================================================================
// Todolists
// =============================================================================
async function createTodolist({ projectId = LAUNCH.projectId, name, description }) {
  const dock = await getDock(projectId);
  const existing = await bcGetAll(`/buckets/${projectId}/todosets/${dock.todoset.id}/todolists.json`);
  const match = (existing || []).find((l) => l.name === name);
  if (match) {
    // Update description if changed
    if (description && match.description !== description) {
      return bcPut(`/buckets/${projectId}/todolists/${match.id}.json`, { name, description });
    }
    return match;
  }
  return bcPost(`/buckets/${projectId}/todosets/${dock.todoset.id}/todolists.json`, { name, description: description || '' });
}

// =============================================================================
// Todos
// =============================================================================
async function createTodo({ projectId = LAUNCH.projectId, listId, content, description, assigneePersonIds, dueOn }) {
  const existing = await bcGetAll(`/buckets/${projectId}/todolists/${listId}/todos.json`);
  const match = (existing || []).find((t) => t.content === content);
  if (match) return match;
  const body = { content, description: description || '' };
  if (Array.isArray(assigneePersonIds) && assigneePersonIds.length) body.assignee_ids = assigneePersonIds;
  if (dueOn) body.due_on = dueOn;
  return bcPost(`/buckets/${projectId}/todolists/${listId}/todos.json`, body);
}

// =============================================================================
// Message Board
// =============================================================================
async function postMessage({ projectId = LAUNCH.projectId, subject, content, category }) {
  const dock = await getDock(projectId);
  const existing = await bcGetAll(`/buckets/${projectId}/message_boards/${dock.messageBoard.id}/messages.json`);
  const match = (existing || []).find((m) => m.subject === subject);
  if (match) {
    // Update content (PUT to message)
    return bcPut(`/buckets/${projectId}/messages/${match.id}.json`, { subject, content, category_id: category });
  }
  const body = { subject, content, status: 'active' };
  if (category) body.category_id = category;
  return bcPost(`/buckets/${projectId}/message_boards/${dock.messageBoard.id}/messages.json`, body);
}

// =============================================================================
// Add a person to the project
// =============================================================================
async function addPeopleToProject({ projectId = LAUNCH.projectId, personIds }) {
  // Basecamp 3 API: PUT /projects/{id}/people/users.json with { grant: [ids] }
  if (!Array.isArray(personIds) || personIds.length === 0) return { granted: [] };
  const r = await bcPut(`/projects/${projectId}/people/users.json`, { grant: personIds });
  return r;
}

// =============================================================================
// Schedule entries (used for Open Houses, milestones)
// =============================================================================
async function createScheduleEntry({ projectId = LAUNCH.projectId, summary, description, startsAt, endsAt, allDay = false, participantIds }) {
  const dock = await getDock(projectId);
  if (!dock.schedule) throw new Error('Schedule tool not enabled on project');
  const body = { summary, description: description || '', starts_at: startsAt, ends_at: endsAt, all_day: allDay };
  if (Array.isArray(participantIds) && participantIds.length) body.participant_ids = participantIds;
  return bcPost(`/buckets/${projectId}/schedules/${dock.schedule.id}/entries.json`, body);
}

// =============================================================================
// Vault uploads (briefs, design files, anything reusable)
// Two-step: POST /attachments.json to register the file with Basecamp, then
// POST /vaults/<vaultId>/uploads.json to surface it inside the Vault.
//
// Idempotent: if a file with the same filename already exists in the vault
// folder we return the existing upload object (no re-upload).
// =============================================================================
function mimeFor(filename) {
  const ext = (filename.match(/\.([a-zA-Z0-9]+)$/) || [])[1]?.toLowerCase() || '';
  return ({
    md: 'text/markdown', txt: 'text/plain', html: 'text/html',
    pdf: 'application/pdf', json: 'application/json',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[ext] || 'application/octet-stream');
}

async function uploadAttachment({ buffer, filename }) {
  const url = `${BASE}/attachments.json?name=${encodeURIComponent(filename)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'User-Agent': 'Colaberry LaunchPMO (ali@colaberry.com)',
      'Content-Type': mimeFor(filename),
    },
    body: buffer,
  });
  if (!r.ok) throw new Error(`POST /attachments.json -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function uploadToVault({ projectId = LAUNCH.projectId, vaultId, filename, content, description = '' }) {
  const dock = await getDock(projectId);
  const targetVault = vaultId || dock.vault.id;
  // Idempotency: check existing uploads in this vault
  const existing = await bcGetAll(`/buckets/${projectId}/vaults/${targetVault}/uploads.json`);
  const match = (existing || []).find((u) => (u.filename || u.title || '').toLowerCase() === filename.toLowerCase());
  if (match) return match;
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const attach = await uploadAttachment({ buffer: buf, filename });
  const r = await bcPost(`/buckets/${projectId}/vaults/${targetVault}/uploads.json`, {
    attachable_sgid: attach.attachable_sgid,
    base_name: filename,
    description,
  });
  return r;
}

// Create a Vault sub-folder. Idempotent by title.
async function createVaultFolder({ projectId = LAUNCH.projectId, title }) {
  const dock = await getDock(projectId);
  const existing = await bcGetAll(`/buckets/${projectId}/vaults/${dock.vault.id}/vaults.json`).catch(() => []);
  const match = (existing || []).find((v) => v.title === title);
  if (match) return match;
  return bcPost(`/buckets/${projectId}/vaults/${dock.vault.id}/vaults.json`, { title });
}

module.exports = {
  bcGet, bcGetAll, bcPost, bcPut,
  getDock,
  createTodolist, createTodo, postMessage,
  addPeopleToProject, createScheduleEntry,
  uploadToVault, createVaultFolder, uploadAttachment,
  getToken,
};
