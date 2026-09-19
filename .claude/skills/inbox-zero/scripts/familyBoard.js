// familyBoard.js: the Family Goals & Life Planning board (bucket 33392153), read-only.
// Ali, 2026-09-18: "Add the family bc group to the check so you always keep me aware of the
// family group task as well as my emails." The household is part of every sweep now, not a
// thing he has to remember to ask for. Nothing is written, completed or assigned here.
//   ssh root@95.216.199.47 "docker exec -i accelerator-backend node -" < familyBoard.js
// Env: DAYS (horizon for "due soon", default 7), DONE_DAYS (recently completed window, default 3),
//      JSON=1 for the raw object instead of the printed board.
// Dates are compared in America/Chicago, because a to-do due "today" means today where Ali is.
const fs = require('fs');
const { refreshBcToken } = require('/app/dist/services/ops/basecampToken');

const BUCKET = 33392153;
// The two entity lists are separate legal entities (CPN, AI Flotation), tracked in this project
// for privacy rather than because they are household work. They are reported apart, so the
// family view stays family.
const ENTITY_LISTS = new Set(['Career Pathways Network', 'AI Flotation']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const pretty = (ymd) => {
  if (!ymd) return 'no date';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
};

(async () => {
  const token = await refreshBcToken();
  const H = { Authorization: 'Bearer ' + token, 'User-Agent': 'Colaberry Ops (ali@colaberry.com)' };
  const api = async (url) => {
    const r = await fetch(url.startsWith('http') ? url : 'https://3.basecampapi.com/3945211' + url, { headers: H });
    if (r.status === 429) { await sleep(4000); return api(url); }
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return { j: await r.json(), link: r.headers.get('link') };
  };
  const paged = async (url) => {
    let out = [];
    while (url) { const { j, link } = await api(url); out = out.concat(j); const m = (link || '').match(/<([^>]+)>;\s*rel="next"/); url = m ? m[1] : null; }
    return out;
  };

  const project = (await api('/projects/' + BUCKET + '.json')).j;
  const todoset = project.dock.find((d) => d.name === 'todoset');
  const lists = await paged(todoset.url.replace('https://3.basecampapi.com/3945211', '') .replace('.json', '/todolists.json'));

  const today = ctDate(new Date());
  const horizon = ctDate(new Date(Date.now() + Number(process.env.DAYS || 7) * 86400000));
  const doneSince = new Date(Date.now() - Number(process.env.DONE_DAYS || 3) * 86400000);

  const out = { as_of_ct: today, overdue: [], due_soon: [], undated: [], later: 0, entity: [], done_recently: [], lists: [] };
  for (const l of lists) {
    const todos = await paged(`/buckets/${BUCKET}/todolists/${l.id}/todos.json`);
    const open = todos.filter((t) => !t.completed);
    out.lists.push({ list: l.title, open: open.length });
    for (const t of open) {
      const row = { list: l.title, title: t.title, due: t.due_on, who: (t.assignees || []).map((a) => a.name.split(' ')[0]).join(', '), url: t.app_url };
      if (ENTITY_LISTS.has(l.title)) { out.entity.push(row); continue; }
      if (!t.due_on) out.undated.push(row);
      else if (t.due_on < today) out.overdue.push(row);
      else if (t.due_on <= horizon) out.due_soon.push(row);
      else out.later++;
    }
    for (const t of todos) {
      if (t.completed && t.completed_at && new Date(t.completed_at) >= doneSince) {
        out.done_recently.push({ list: l.title, title: t.title, at: t.completed_at });
      }
    }
  }
  const byDue = (a, b) => String(a.due).localeCompare(String(b.due));
  out.overdue.sort(byDue); out.due_soon.sort(byDue);

  if (process.env.JSON === '1') { fs.writeSync(1, JSON.stringify(out, null, 1) + '\n'); process.exit(0); }
  const line = (r) => `  ${pretty(r.due).padEnd(13)} ${r.list.slice(0, 26).padEnd(26)} ${r.title.slice(0, 68)}`;
  const L = [];
  L.push(`FAMILY BOARD as of ${pretty(today)} (America/Chicago)`);
  L.push(`OVERDUE (${out.overdue.length})`); out.overdue.forEach((r) => L.push(line(r)));
  L.push(`DUE IN THE NEXT ${process.env.DAYS || 7} DAYS (${out.due_soon.length})`); out.due_soon.forEach((r) => L.push(line(r)));
  if (out.undated.length) { L.push(`NO DUE DATE (${out.undated.length})`); out.undated.forEach((r) => L.push(`  ${'-'.padEnd(13)} ${r.list.slice(0, 26).padEnd(26)} ${r.title.slice(0, 68)}`)); }
  L.push(`LATER: ${out.later} open with a date beyond the horizon`);
  if (out.done_recently.length) { L.push(`DONE IN THE LAST ${process.env.DONE_DAYS || 3} DAYS (${out.done_recently.length})`); out.done_recently.forEach((r) => L.push(`  ${r.at.slice(0, 10)}    ${r.list.slice(0, 26).padEnd(26)} ${r.title.slice(0, 68)}`)); }
  if (out.entity.length) L.push(`ENTITY LISTS, reported apart (${out.entity.length} open: CPN / AI Flotation)`);
  fs.writeSync(1, L.join('\n') + '\n');
  process.exit(0);
})().catch((e) => { fs.writeSync(2, 'ERR ' + (e.stack || e) + '\n'); process.exit(1); });
