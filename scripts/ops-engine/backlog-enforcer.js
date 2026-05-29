#!/usr/bin/env node
/**
 * Operations Engine - Backlog enforcer (Pattern H-2).
 *
 * Every 4 hours, scan Ali Personal for open Ali-assigned todos. Classify
 * by urgency. Post a comment to a meta tracking todo "[Tracking] Ali
 * backlog status" in AI Products. Tag Ali only when the backlog crosses
 * a threshold or at the daily 9am-CT tick.
 *
 * SAFETY:
 *   - Read-only on Basecamp (one comment write per tick max).
 *   - Lock + state file to dedupe ticks.
 *   - Never auto-closes todos.
 */
const fs = require('fs');
const path = require('path');

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const REPO = path.resolve(__dirname, '../..');
const STATE_PATH = path.resolve(REPO, 'tmp/ops-engine/backlog-state.json');
const LOCK_PATH = path.resolve(REPO, 'tmp/ops-engine/backlog.lock');
const META_TODO_ID_FILE = path.resolve(REPO, 'tmp/ops-engine/backlog-meta-id.txt');

const CB_SYSTEM_ID = 37708014;
const ALI_ID = 17454835;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
const ALI_PERSONAL = 7463955;
const AI_PRODUCTS_LIST = 9939449052;

const OVERDUE_TRIGGER = 3;        // tag Ali when >3 overdue
const SINGLE_OLD_TRIGGER_DAYS = 7;// tag Ali when any todo >7d overdue
const DRY = process.argv.includes('--dry');

function getToken() {
  let t = process.env.BASECAMP_ACCESS_TOKEN || '';
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  return t;
}
const TOKEN = getToken();
const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Backlog Enforcer', Accept: 'application/json', 'Content-Type': 'application/json' });

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
  if (DRY) { console.log('[dry] POST', p); return { id: 'dry' }; }
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  if (fs.existsSync(LOCK_PATH)) {
    const pid = Number(fs.readFileSync(LOCK_PATH, 'utf8'));
    try { process.kill(pid, 0); return false; } catch {}
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}
function releaseLock() { try { fs.unlinkSync(LOCK_PATH); } catch {} }
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { ticks: [], last_tagged: null }; }
}
function saveState(s) { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }
const mention = () => `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;

function daysAgo(iso) {
  if (!iso) return 99999;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

async function ensureMetaTodo() {
  if (fs.existsSync(META_TODO_ID_FILE)) {
    const id = Number(fs.readFileSync(META_TODO_ID_FILE, 'utf8'));
    if (id) return id;
  }
  const t = await bcPost(`/buckets/${ALI_PERSONAL}/todolists/${AI_PRODUCTS_LIST}/todos.json`, {
    content: '[Tracking] Ali backlog status (auto from CB System enforcer)',
    description: '<div>Backlog summary posted by <code>scripts/ops-engine/backlog-enforcer.js</code> every 4 hours. Ali is tagged only when backlog crosses a threshold or at the 9am-CT daily tick. Stays open as long as the enforcer runs.</div>',
    assignee_ids: [ALI_ID, CB_SYSTEM_ID],
    due_on: null,
    notify: false,
  });
  fs.writeFileSync(META_TODO_ID_FILE, String(t.id));
  return t.id;
}

(async () => {
  if (!acquireLock()) { console.log('locked'); process.exit(0); }
  try {
    const state = loadState();
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);

    // Scan Ali Personal todos
    const proj = await bcGet(`/projects/${ALI_PERSONAL}.json`);
    const ts = proj.dock.find(d => d.name === 'todoset');
    const lists = await bcGetAll(`/buckets/${ALI_PERSONAL}/todosets/${ts.id}/todolists.json`);

    let all = [];
    for (const l of lists) {
      try {
        const t = await bcGetAll(`/buckets/${ALI_PERSONAL}/todolists/${l.id}/todos.json?status=remaining`);
        for (const x of t) {
          if (!x.assignees || !x.assignees.some(a => a.id === ALI_ID)) continue;
          all.push({ ...x, list_name: l.name });
        }
      } catch (e) { /* skip */ }
    }

    const overdue = all.filter(t => t.due_on && t.due_on < todayISO);
    const dueToday = all.filter(t => t.due_on === todayISO);
    const dueWeek = all.filter(t => t.due_on && t.due_on > todayISO && t.due_on <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    const noDue = all.filter(t => !t.due_on);
    const stale = noDue.filter(t => daysAgo(t.created_at) > 14);

    const maxOverdueDays = overdue.length ? Math.max(...overdue.map(t => Math.floor((Date.now() - new Date(t.due_on).getTime()) / 86400000))) : 0;
    const is9amTick = today.getUTCHours() === 14; // 9am CT = 14 UTC (CST) / 13 UTC (CDT)
    const shouldTag = overdue.length >= OVERDUE_TRIGGER || maxOverdueDays >= SINGLE_OLD_TRIGGER_DAYS || is9amTick;

    console.log(`Ali open todos: total=${all.length}, overdue=${overdue.length} (max ${maxOverdueDays}d), due-today=${dueToday.length}, due-this-week=${dueWeek.length}, no-due-stale=${stale.length}`);
    console.log(`  tag Ali? ${shouldTag}`);

    const top5 = [...overdue, ...dueToday, ...stale].slice(0, 5);
    const top5Html = top5.length
      ? '<ul>' + top5.map(t => `<li><strong>${t.list_name}:</strong> <a href="${t.app_url}">${t.content.slice(0, 90)}</a>${t.due_on ? ` (due ${t.due_on})` : ' (no due, ' + Math.floor(daysAgo(t.created_at)) + 'd old)'}</li>`).join('') + '</ul>'
      : '<div><em>Nothing urgent.</em></div>';

    const body = `<div>${shouldTag ? mention() + ' ' : ''}Ali backlog snapshot at ${today.toISOString().slice(0, 16)} UTC.</div>
<div><br></div>
<div><strong>Counts</strong>: ${all.length} total open. ${overdue.length} overdue (max ${maxOverdueDays}d late). ${dueToday.length} due today. ${dueWeek.length} due this week. ${stale.length} with no due date older than 14 days.</div>
<div><br></div>
<div><strong>Top 5 to look at first</strong></div>
${top5Html}
<div><br></div>
<div><em>${shouldTag ? 'Tagged because: ' + (overdue.length >= OVERDUE_TRIGGER ? `${overdue.length} overdue >= ${OVERDUE_TRIGGER} threshold. ` : '') + (maxOverdueDays >= SINGLE_OLD_TRIGGER_DAYS ? `Most overdue is ${maxOverdueDays}d late >= ${SINGLE_OLD_TRIGGER_DAYS}d threshold. ` : '') + (is9amTick ? '9am CT daily tick.' : '') : 'Silent tick. Backlog below all tagging thresholds.'}</em></div>`;

    const metaId = await ensureMetaTodo();
    if (shouldTag || all.length === 0) {
      await bcPost(`/buckets/${ALI_PERSONAL}/recordings/${metaId}/comments.json`, { content: body });
      state.last_tagged = today.toISOString();
    }

    state.ticks.push({ at: today.toISOString(), counts: { all: all.length, overdue: overdue.length, dueToday: dueToday.length, dueWeek: dueWeek.length, stale: stale.length }, tagged: shouldTag });
    if (state.ticks.length > 100) state.ticks = state.ticks.slice(-100);
    if (!DRY) saveState(state);
  } catch (e) {
    console.error('FAIL:', e.stack || e.message);
  } finally {
    releaseLock();
  }
})();
