// internActivityTracker.js
//
// Per-intern activity snapshot from Basecamp project 24865175.
//
// What it computes for each Basecamp assignee found on an active todo:
//   - last activity date (max of their own comments' created_at)
//   - daysSinceLast (whole days from last activity to now, in UTC)
//   - daily comment counts for the last 14 days
//   - escalation level: GREEN | YELLOW | ORANGE | RED | BLACK
//
// Level thresholds (Ali policy 2026-05-30):
//   GREEN  - last activity today (>= 1 update today)
//   YELLOW - 1 to 3 days since last activity
//   ORANGE - 4 to 6 days since last activity
//   RED    - 7 to 9 days since last activity
//   BLACK  - 10+ days since last activity (exit cliff)
//
// "Activity" = any comment authored BY the intern in any of their assigned todos
// in project 24865175 (todosets Project 1/2/3). Cross-todo aggregation is
// intentional: an intern with multiple projects gets credit for activity in any
// of them.

const path = require('path');

const BC_ACCOUNT = '3945211';
const BC_BUCKET = parseInt(process.env.INTERN_REPORT_BUCKET || '24865175', 10);
const TODOSET_IDS = (process.env.INTERN_REPORT_TODOSETS || '4327600402,4327600416,4327600417').split(',').map((s) => parseInt(s.trim(), 10));
const BASE = `https://3.basecampapi.com/${BC_ACCOUNT}/buckets/${BC_BUCKET}`;

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry ActivityTracker', Accept: 'application/json', 'Content-Type': 'application/json' };
}

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: bcHeaders() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let n = p.startsWith('http') ? p : BASE + p;
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

function utcMidnight(d) {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

function levelFor(daysSinceLast) {
  if (daysSinceLast === 0) return 'GREEN';
  if (daysSinceLast <= 3) return 'YELLOW';
  if (daysSinceLast <= 6) return 'ORANGE';
  if (daysSinceLast <= 9) return 'RED';
  return 'BLACK';
}

function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }

async function collectInternProjects(includeCompleted = false) {
  // Returns: [{ todoId, title, todolistName, assignees: [{id, name, email_address}], status, appUrl }]
  const out = [];
  for (const tsId of TODOSET_IDS) {
    let todolists;
    try { todolists = await bcGet(`/todosets/${tsId}/todolists.json`); }
    catch (_e) { continue; }
    if (!Array.isArray(todolists)) todolists = await bcGetAll(`/todosets/${tsId}/todolists.json`);
    for (const tl of todolists) {
      const active = await bcGetAll(`/todolists/${tl.id}/todos.json`);
      const completed = includeCompleted ? await bcGetAll(`/todolists/${tl.id}/todos.json?completed=true`) : [];
      for (const t of [...active, ...completed]) {
        if (!Array.isArray(t.assignees) || t.assignees.length === 0) continue;
        out.push({
          todoId: t.id,
          title: stripHtml(t.content || '').slice(0, 140),
          todolistName: tl.name,
          assignees: t.assignees.map((a) => ({ id: a.id, name: a.name, email_address: a.email_address || null })),
          status: t.completed ? 'completed' : 'in_progress',
          appUrl: t.app_url || `https://app.basecamp.com/${BC_ACCOUNT}/buckets/${BC_BUCKET}/todos/${t.id}`,
        });
      }
    }
  }
  return out;
}

// Staff filter. Anyone whose email is @colaberry.com is internal staff, not an
// intern. They get tracked at the project level but excluded from the nudge
// target. Also hardcode known staff BC IDs as a belt-and-suspenders safety
// (in case someone uses a non-colaberry email).
const STAFF_EMAIL_DOMAINS = ['colaberry.com'];
const STAFF_BC_IDS = new Set([
  17454835, // Ali Muwwakkil
  37184021, // Jackie Chalk (work account)
  37179680, // Jackie Chalk (personal account - she's still staff)
  37708014, // CB System
]);
// Additional name-based filter for known staff who don't have @colaberry.com
// emails on file (Milad is a contractor). Keep this conservative.
const STAFF_NAMES_LOWER = new Set(['milad', 'milad rezvani', 'milad r']);

function isStaff(internEntry) {
  if (STAFF_BC_IDS.has(internEntry.internId)) return true;
  const email = (internEntry.email || '').toLowerCase();
  if (email && STAFF_EMAIL_DOMAINS.some((d) => email.endsWith('@' + d))) return true;
  const name = (internEntry.name || '').toLowerCase().trim();
  if (STAFF_NAMES_LOWER.has(name)) return true;
  return false;
}

async function buildInternActivity({ lookbackDays = 14, includeCompleted = false, includeStaff = false } = {}) {
  const projects = await collectInternProjects(includeCompleted);
  // Map: internId -> { name, email, projects: [{todoId,title,url}], comments: [{todoId, createdAt}] }
  const map = new Map();
  for (const proj of projects) {
    for (const a of proj.assignees) {
      // Pick first assignee per todo as the "owner" — matches Swati's table convention.
      // We still track for ALL assignees so we don't miss anyone who got nudged via shared todos.
      if (!map.has(a.id)) map.set(a.id, { internId: a.id, name: a.name, email: a.email_address || null, projects: [], commentsByDay: {}, totalComments: 0, lastActivityAt: null });
      const entry = map.get(a.id);
      if (!entry.projects.find((p) => p.todoId === proj.todoId)) {
        entry.projects.push({ todoId: proj.todoId, title: proj.title, todolistName: proj.todolistName, appUrl: proj.appUrl });
      }
      if (!entry.email && a.email_address) entry.email = a.email_address;
    }
  }
  // Fetch comments for each todo, attribute by creator_id.
  const cutoff = Date.now() - lookbackDays * 86400 * 1000;
  for (const proj of projects) {
    let comments = [];
    try { comments = await bcGetAll(`/recordings/${proj.todoId}/comments.json`); } catch (_e) { continue; }
    for (const c of comments) {
      const t = new Date(c.created_at).getTime();
      if (t < cutoff) continue;
      const author = c.creator?.id;
      if (!author) continue;
      const entry = map.get(author);
      if (!entry) continue; // commenter is not an assignee (probably Jackie or Ali)
      const dayKey = new Date(c.created_at).toISOString().slice(0, 10);
      entry.commentsByDay[dayKey] = (entry.commentsByDay[dayKey] || 0) + 1;
      entry.totalComments++;
      if (!entry.lastActivityAt || c.created_at > entry.lastActivityAt) entry.lastActivityAt = c.created_at;
    }
  }
  // Compute days-since-last + level + daily series
  const todayUtc = utcMidnight(new Date());
  const rows = [];
  for (const entry of map.values()) {
    const daysSinceLast = entry.lastActivityAt
      ? Math.max(0, Math.round((todayUtc - utcMidnight(entry.lastActivityAt)) / 86400000))
      : Infinity;
    const dailySeries = [];
    for (let i = lookbackDays - 1; i >= 0; i--) {
      const d = new Date(todayUtc - i * 86400000).toISOString().slice(0, 10);
      dailySeries.push({ date: d, count: entry.commentsByDay[d] || 0 });
    }
    const todayCount = entry.commentsByDay[new Date(todayUtc).toISOString().slice(0, 10)] || 0;
    rows.push({
      internId: entry.internId,
      name: entry.name,
      email: entry.email,
      projects: entry.projects,
      totalComments: entry.totalComments,
      lastActivityAt: entry.lastActivityAt,
      daysSinceLast: daysSinceLast === Infinity ? null : daysSinceLast,
      level: levelFor(daysSinceLast === Infinity ? 999 : daysSinceLast),
      todayCount,
      dailyTarget: 3,
      dailySeries,
    });
  }
  // Sort: BLACK first, then RED, ORANGE, YELLOW, GREEN
  const order = { BLACK: 0, RED: 1, ORANGE: 2, YELLOW: 3, GREEN: 4 };
  rows.sort((a, b) => order[a.level] - order[b.level] || (b.daysSinceLast || 0) - (a.daysSinceLast || 0));
  // Drop staff unless explicitly requested
  if (!includeStaff) {
    const before = rows.length;
    const filtered = rows.filter((r) => !isStaff(r));
    if (before !== filtered.length) console.log(`[activity-tracker] filtered ${before - filtered.length} staff entries`);
    return filtered;
  }
  return rows;
}

module.exports = { buildInternActivity, levelFor };
