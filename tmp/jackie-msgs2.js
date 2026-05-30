#!/usr/bin/env node
// Walk todos in project 24865175 + collect Jackie's comments directly.
const TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
const BUCKET = 24865175;
const JACKIE_ID = 37184021;
const TODOSET_IDS = [4327600402, 4327600416, 4327600417];
const SIX_MONTHS = new Date(Date.now() - 180 * 86400 * 1000).getTime();

async function getAll(url) {
  let n = url; const out = [];
  while (n) {
    const r = await fetch(n, { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' }});
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    n = lh ? lh[1] : null;
  }
  return out;
}
async function get(url) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' }});
  if (!r.ok) return null;
  return r.json();
}

(async () => {
  const allComments = [];
  for (const tsId of TODOSET_IDS) {
    const tls = await get(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/todosets/${tsId}/todolists.json`);
    if (!Array.isArray(tls)) continue;
    for (const tl of tls) {
      const todos = [
        ...(await getAll(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/todolists/${tl.id}/todos.json`)),
        ...(await getAll(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/todolists/${tl.id}/todos.json?completed=true`)),
      ];
      for (const t of todos) {
        if (!t.comments_count) continue;
        const cs = await getAll(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${t.id}/comments.json`);
        const hers = cs.filter((c) => c.creator?.id === JACKIE_ID && new Date(c.created_at).getTime() >= SIX_MONTHS);
        for (const c of hers) {
          allComments.push({
            todoTitle: (t.content || '').slice(0, 80),
            todolistName: tl.name,
            assignees: (t.assignees || []).map((a) => a.name).join(', '),
            createdAt: c.created_at,
            text: (c.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          });
        }
      }
    }
  }
  allComments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  console.log(`Total Jackie comments in last 180 days: ${allComments.length}`);
  for (const c of allComments.slice(0, 25)) {
    console.log(`\n[${c.createdAt}]`);
    console.log(`  todo: ${c.todoTitle}`);
    console.log(`  assignees: ${c.assignees}`);
    console.log(`  text: ${c.text.slice(0, 600)}`);
  }
})().catch(e => console.error('FATAL:', e.message));
