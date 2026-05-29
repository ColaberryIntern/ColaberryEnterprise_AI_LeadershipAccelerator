#!/usr/bin/env node
/**
 * Operations Engine - Card Table sync.
 *
 * For each monitored Basecamp project that has a Card Table (kanban_board)
 * dock enabled, mirror todo status into Card Table cards. One-way:
 * todo -> card. Source of truth is the todo. Cards exist as a visual.
 *
 * Status -> column mapping (mapped against Basecamp's default 4 columns):
 *   Intake | Planned                 -> "Not started"
 *   In Progress | Waiting on Ali     -> "In progress"
 *   Waiting on External | Blocked    -> "On hold"
 *   Monitoring                       -> "On hold"
 *   Ready to Close | Completed       -> "Done"
 *   Archived                         -> archived (card removed)
 *
 * Idempotent. Cards are matched to todos by a "[todo:<id>]" marker
 * embedded in the card title. Re-running moves cards between columns
 * when status changes; never creates duplicates.
 *
 * Run: BASECAMP_ACCESS_TOKEN="..." node scripts/ops-engine/cardtable-sync.js
 *      Optional: --project=<id> to sync only one project.
 *      Default: every project in cache.json that has card_table.enabled.
 *      --dry to log without mutating.
 */
const fs = require('fs');
const path = require('path');

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const CACHE_PATH = path.resolve(__dirname, '../../tmp/ops-engine/cache.json');
const STATE_PATH = path.resolve(__dirname, '../../tmp/ops-engine/cardtable-state.json');

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry');
const ONLY_PROJECT = (ARGS.find(a => a.startsWith('--project=')) || '').split('=')[1];

const COLUMN_MAP = {
  'Intake': 'Not started',
  'Planned': 'Not started',
  'In Progress': 'In progress',
  'Waiting on Ali': 'In progress',
  'Waiting on External': 'On hold',
  'Monitoring': 'On hold',
  'Blocked': 'On hold',
  'Ready to Close': 'Done',
  'Completed': 'Done',
};

function getToken() {
  let t = process.env.BASECAMP_ACCESS_TOKEN || '';
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  return t;
}
const TOKEN = getToken();
const H = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Ops Engine', Accept: 'application/json', 'Content-Type': 'application/json', ...extra });

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let next = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: H() });
    if (!r.ok) throw new Error(`GET ${next} -> ${r.status}`);
    out.push(...(await r.json()));
    const link = r.headers.get('Link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}
async function bcPost(p, body) {
  if (DRY) { console.log('  [dry] POST', p); return { id: 'dry-' + Date.now(), title: body.title }; }
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPut(p, body) {
  if (DRY) { console.log('  [dry] PUT', p, body); return {}; }
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'PUT', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function todoMarker(todoId) { return `[todo:${todoId}]`; }
function cardTitleFor(todo) { return `${todoMarker(todo.id)} ${todo.content}`.slice(0, 200); }
function extractTodoId(cardTitle) {
  const m = (cardTitle || '').match(/\[todo:(\d+)\]/);
  return m ? Number(m[1]) : null;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { synced_at: null, projects: {} }; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

async function getCardTableForProject(projectId) {
  const proj = await bcGet(`/projects/${projectId}.json`);
  const dock = proj.dock.find(d => d.name === 'kanban_board' && d.enabled);
  if (!dock) return null;
  const board = await bcGet(`/buckets/${projectId}/card_tables/${dock.id}.json`);
  return board;
}

async function syncProject(projectId, todosForProject) {
  const board = await getCardTableForProject(projectId);
  if (!board) {
    console.log(`  [skip] project ${projectId} has no enabled Card Table`);
    return { project_id: projectId, skipped: true };
  }
  console.log(`  [sync] project ${projectId}: ${board.lists.length} columns, ${todosForProject.length} todos`);

  const columnByName = {};
  for (const col of board.lists) columnByName[col.title] = col;
  const missingCols = [...new Set(Object.values(COLUMN_MAP))].filter(n => !columnByName[n]);
  if (missingCols.length) console.log(`    missing columns (will skip those statuses): ${missingCols.join(', ')}`);

  const existingCardsByTodoId = {};
  for (const col of board.lists) {
    const cards = await bcGetAll(`/buckets/${projectId}/card_tables/lists/${col.id}/cards.json`);
    for (const c of cards) {
      const tid = extractTodoId(c.title);
      if (tid) existingCardsByTodoId[tid] = { card: c, columnName: col.title, columnId: col.id };
    }
  }

  let created = 0, moved = 0, unchanged = 0;
  for (const t of todosForProject) {
    if (t.status === 'Archived') continue;
    const targetColName = COLUMN_MAP[t.status];
    if (!targetColName) continue;
    const targetCol = columnByName[targetColName];
    if (!targetCol) continue;
    const existing = existingCardsByTodoId[t.id];
    if (!existing) {
      const newCard = await bcPost(`/buckets/${projectId}/card_tables/lists/${targetCol.id}/cards.json`, {
        title: cardTitleFor(t),
        content: `<div>Mirror of <a href="${t.app_url || t.url}">todo ${t.id}</a>. Status: <strong>${t.status}</strong>. Source of truth is the todo.</div>`,
        due_on: t.due_on || null,
        notify: false,
      });
      created++;
      console.log(`    +card "${t.content.slice(0,50)}" -> ${targetColName}`);
    } else if (existing.columnName !== targetColName) {
      await bcPut(`/buckets/${projectId}/card_tables/cards/${existing.card.id}/moves.json`, {
        column_id: targetCol.id, position: 1,
      }).catch(async () => {
        // older endpoint variant
        await bcPut(`/buckets/${projectId}/card_tables/cards/${existing.card.id}.json`, {
          column_id: targetCol.id,
        });
      });
      moved++;
      console.log(`    >move "${t.content.slice(0,50)}" ${existing.columnName} -> ${targetColName}`);
    } else {
      unchanged++;
    }
  }
  return { project_id: projectId, board_id: board.id, created, moved, unchanged };
}

(async () => {
  console.log(`Card Table sync starting. Dry: ${DRY}`);
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  const projects = ONLY_PROJECT ? [Number(ONLY_PROJECT)] : Object.keys(cache.projects).map(Number);
  const todosByProject = {};
  for (const t of cache.todos) {
    (todosByProject[t.project_id] = todosByProject[t.project_id] || []).push(t);
  }

  const state = loadState();
  const results = [];
  for (const pid of projects) {
    try {
      const r = await syncProject(pid, todosByProject[pid] || []);
      results.push(r);
      state.projects[pid] = { last_sync: new Date().toISOString(), ...r };
    } catch (e) {
      console.error(`  [fail] project ${pid}: ${e.message}`);
      results.push({ project_id: pid, error: e.message });
    }
  }
  state.synced_at = new Date().toISOString();
  if (!DRY) saveState(state);

  console.log('\n=== Card Table sync summary ===');
  for (const r of results) {
    if (r.skipped) console.log(`  ${r.project_id}: skipped (no Card Table)`);
    else if (r.error) console.log(`  ${r.project_id}: FAIL ${r.error}`);
    else console.log(`  ${r.project_id}: +${r.created} created, >${r.moved} moved, =${r.unchanged} unchanged`);
  }
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
