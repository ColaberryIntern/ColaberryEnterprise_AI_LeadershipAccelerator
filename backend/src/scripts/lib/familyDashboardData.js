/**
 * familyDashboardData — compiles LIVE data for the Family Dashboard from the
 * Family Goals & Life Planning Basecamp project (bucket 33392153). Read-only,
 * safe to call repeatedly (no writes, no side effects).
 *
 * Every figure is computed fresh on each call; nothing is hardcoded per-day.
 * The Microsoft Graph "sources" entry is a real reachability check (attempts
 * a token refresh) so the dashboard self-heals once Ali re-auths, instead of
 * needing a code change.
 *
 * Consumed by: backend/src/scripts/sendFamilyDashboardDaily.js
 */
const { getBasecampToken } = require('./basecampToken');

const ACCOUNT_ID = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;
const UA = 'Colaberry Family Dashboard (ali@colaberry.com)';
const BUCKET = 33392153;
const MONEY_RE = /\$[\d,]+\.\d{2}/;

async function bcGetPage(token, urlOrPath) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${API}${urlOrPath}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${await r.text()}`);
  const link = r.headers.get('Link');
  const next = link && /<([^>]+)>;\s*rel="next"/.exec(link);
  return { data: await r.json(), next: next ? next[1] : null };
}
async function bcGetAll(token, path) {
  const out = [];
  let cur = path;
  while (cur) {
    const { data, next } = await bcGetPage(token, cur);
    out.push(...data);
    cur = next || null;
  }
  return out;
}

function mondayOf(d) {
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  return m;
}
function ymd(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtDay(dueOn) {
  return new Date(`${dueOn}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Real reachability check for the Hotmail/MS Graph connection (no data read, just a token refresh attempt). */
async function checkGraphLive() {
  if (!process.env.MS_GRAPH_CLIENT_ID || !process.env.MS_GRAPH_REFRESH_TOKEN) {
    return { live: false, reason: 'not configured' };
  }
  try {
    const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_GRAPH_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: process.env.MS_GRAPH_REFRESH_TOKEN,
        scope: 'Mail.Read Mail.ReadWrite offline_access',
      }).toString(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { live: false, reason: (body.error_description || `HTTP ${res.status}`).split('.')[0] };
    }
    return { live: true };
  } catch (e) {
    return { live: false, reason: e.message };
  }
}

async function compileFamilyDashboardData() {
  const token = await getBasecampToken();
  const project = (await bcGetPage(token, `/projects/${BUCKET}.json`)).data;
  const todosetEntry = (project.dock || []).find((d) => d.name === 'todoset');
  const todosetId = todosetEntry.url.match(/todosets\/(\d+)/)[1];
  const todolists = await bcGetAll(token, `/buckets/${BUCKET}/todosets/${todosetId}/todolists.json`);

  const today = new Date();
  const todayYmd = ymd(today);
  const weekStart = mondayOf(today);
  const weekEnd = addDays(weekStart, 6);
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const allOpen = [];
  const byList = [];
  for (const list of todolists) {
    const todos = await bcGetAll(token, `/buckets/${BUCKET}/todolists/${list.id}/todos.json?status=active`);
    if (todos.length === 0) continue;
    byList.push({ list, todos });
    for (const t of todos) allOpen.push({ ...t, listName: list.name, listId: list.id });
  }

  const overdue = allOpen.filter((t) => t.due_on && t.due_on < todayYmd);
  const dueThisWeek = allOpen.filter((t) => t.due_on && t.due_on >= todayYmd && t.due_on <= ymd(weekEnd));

  const weekLoad = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const dstr = ymd(d);
    weekLoad.push({
      dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      due: allOpen.filter((t) => t.due_on === dstr).length,
      today: dstr === todayYmd,
    });
  }

  const basecampHealth = byList
    .map(({ list, todos }) => {
      const dued = todos.filter((t) => t.due_on).sort((a, b) => a.due_on.localeCompare(b.due_on));
      const earliest = dued[0];
      return {
        list: list.name,
        open: todos.length,
        dueLabel: earliest ? fmtDay(earliest.due_on) : 'No due date',
        tier: !earliest ? 'future' : earliest.due_on < todayYmd ? 'overdue' : earliest.due_on <= ymd(weekEnd) ? 'soon' : 'future',
        url: `https://app.basecamp.com/${ACCOUNT_ID}/buckets/${BUCKET}/todolists/${list.id}`,
      };
    })
    .sort((a, b) => b.open - a.open);

  let newSinceYesterday = [];
  try {
    const recordings = await bcGetAll(token, `/projects/recordings.json?bucket=${BUCKET}&type=Todo&sort=created_at&direction=desc`);
    newSinceYesterday = recordings
      .filter((r) => r.created_at >= sinceIso)
      .map((r) => ({
        title: r.title || r.content || '(untitled)',
        meta: `Filed to ${r.parent?.title || r.bucket?.name || 'a list'}${r.due_on ? ` · due ${fmtDay(r.due_on)}` : ''}`,
        url: r.app_url,
      }));
  } catch (e) {
    // Non-fatal: recordings feed hiccup shouldn't block the whole dashboard.
    newSinceYesterday = [];
  }

  const moneyItems = allOpen
    .filter((t) => MONEY_RE.test(t.content) || MONEY_RE.test(t.description || ''))
    .map((t) => {
      const m = t.content.match(MONEY_RE) || (t.description || '').match(MONEY_RE);
      return { title: t.content, amount: m ? m[0] : null, url: t.app_url, listName: t.listName };
    });
  const moneyTotal = moneyItems.reduce((s, m) => s + (m.amount ? parseFloat(m.amount.replace(/[$,]/g, '')) : 0), 0);

  const graph = await checkGraphLive();
  const sources = [
    { name: 'Basecamp API', status: 'live', detail: 'Tickets, due dates, lists — fully wired' },
    {
      name: 'Hotmail / MS Graph (email)',
      status: graph.live ? 'live' : 'broken',
      detail: graph.live ? 'Connected — reachable this morning' : `Token issue: ${graph.reason || 'unknown'} — needs Ali to re-auth`,
    },
    { name: 'Google Calendar', status: 'planned', detail: 'Not yet wired into this dashboard' },
    { name: 'Procare (school charges)', status: 'planned', detail: 'Not yet wired into this dashboard' },
  ];
  const sourcesConnected = sources.filter((s) => s.status === 'live').length;

  const risks = [];
  if (!graph.live) {
    risks.push({
      title: 'Hotmail/MS Graph token expired',
      detail: `${graph.reason || 'invalid_grant'}. Blocks reading Addie's full emails automatically until Ali re-authenticates.`,
    });
  }

  return {
    generatedAt: today.toISOString(),
    todayLabel: today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    kpis: {
      dueThisWeek: dueThisWeek.length,
      overdue: overdue.length,
      newSinceYesterday: newSinceYesterday.length,
      moneyPendingTotal: moneyTotal,
      sourcesConnected,
      sourcesTotal: sources.length,
    },
    weekLoad,
    basecampHealth,
    newSinceYesterday,
    moneyItems,
    sources,
    risks,
  };
}

module.exports = { compileFamilyDashboardData };
