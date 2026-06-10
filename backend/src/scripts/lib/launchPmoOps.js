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
// Token handling: reads process.env.BASECAMP_ACCESS_TOKEN. Callers that run
// outside the reporting orchestrator should resolve the live token first via
// lib/basecampToken.getBasecampToken() (pulls from CCPP.Basecamp_AuthInfo) and
// set it on the env before calling these primitives.

const { LAUNCH } = require('./launchPmoTeam');

const ACCOUNT = LAUNCH.basecampAccountId;
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
function getToken() {
  let t = (process.env.BASECAMP_ACCESS_TOKEN || '').trim();
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  return t;
}

const H = () => ({ Authorization: `Bearer ${getToken()}`, 'User-Agent': 'Colaberry LaunchPMO (ali@colaberry.com)', Accept: 'application/json', 'Content-Type': 'application/json' });

// Basecamp throttles aggressively (HTTP 429) and occasionally 503s. Retry those
// with capped exponential backoff, honoring Retry-After when present. Max 5
// attempts; other statuses pass straight through to the caller's error handling.
async function rawFetch(url, opts, attempt = 0) {
  const r = await fetch(url, opts);
  if ((r.status === 429 || r.status === 503) && attempt < 5) {
    const ra = parseInt(r.headers.get('Retry-After') || '', 10);
    const waitMs = Number.isFinite(ra) ? ra * 1000 : Math.min(8000, 500 * 2 ** attempt);
    await new Promise((res) => setTimeout(res, waitMs));
    return rawFetch(url, opts, attempt + 1);
  }
  return r;
}

async function bcGet(p) {
  const r = await rawFetch(p.startsWith('http') ? p : `${BASE}${p}`, { headers: H() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let next = p.startsWith('http') ? p : `${BASE}${p}`;
  const out = [];
  while (next) {
    const r = await rawFetch(next, { headers: H() });
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
  const r = await rawFetch(p.startsWith('http') ? p : `${BASE}${p}`, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPut(p, body) {
  const r = await rawFetch(p.startsWith('http') ? p : `${BASE}${p}`, { method: 'PUT', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${p} -> ${r.status} ${await r.text()}`);
  // 204 No Content (Basecamp's response for status-changes like trash) has no body.
  if (r.status === 204) return { status: 204 };
  const text = await r.text();
  if (!text) return { status: r.status };
  try { return JSON.parse(text); } catch { return { status: r.status, raw: text }; }
}

// Safe todo update: Basecamp's PUT replaces fields. If you PUT just
// {content, assignee_ids} you LOSE due_on + description + everything else.
// This helper fetches first, merges, then PUTs the full field set.
// Use this for any todo edit instead of bcPut directly.
async function updateTodo({ projectId = LAUNCH.projectId, todoId, patch }) {
  const current = await bcGet(`/buckets/${projectId}/todos/${todoId}.json`);
  const merged = {
    content: current.content,
    description: current.description || '',
    assignee_ids: (current.assignees || []).map((a) => a.id),
    completion_subscriber_ids: (current.completion_subscribers || []).map((a) => a.id),
    notify: false,
    due_on: current.due_on || null,
    starts_on: current.starts_on || null,
    ...patch,
  };
  return bcPut(`/buckets/${projectId}/todos/${todoId}.json`, merged);
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
// Todolist groups (sub-sections within a list). A group IS a todolist, so
// createTodo works against a group's id unchanged (listId = group.id).
// =============================================================================
async function listTodoGroups({ projectId = LAUNCH.projectId, listId }) {
  return bcGetAll(`/buckets/${projectId}/todolists/${listId}/groups.json`);
}

async function createTodoGroup({ projectId = LAUNCH.projectId, listId, name }) {
  const existing = await listTodoGroups({ projectId, listId });
  const match = (existing || []).find((g) => g.name === name);
  if (match) return match;
  return bcPost(`/buckets/${projectId}/todolists/${listId}/groups.json`, { name });
}

// =============================================================================
// Trash a recording (todo, group, etc). Basecamp returns 204 No Content.
// Idempotent: re-trashing an already-trashed recording is a no-op upstream.
// =============================================================================
async function trashTodo({ projectId = LAUNCH.projectId, recordingId }) {
  return bcPut(`/buckets/${projectId}/recordings/${recordingId}/status/trashed.json`, {});
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
  listTodoGroups, createTodoGroup, trashTodo,
  addPeopleToProject, createScheduleEntry,
  uploadToVault, createVaultFolder, uploadAttachment,
  updateTodo,
  getToken,
};
