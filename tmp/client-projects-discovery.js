#!/usr/bin/env node
const TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
const PROJECTS = [
  { id: 46697389, name: 'AI Pathway' },
  { id: 47126345, name: 'ShipCES' },
  { id: 46699826, name: 'Landjet' },
];
const H = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' };

async function bcGet(p) { const r = await fetch(p, { headers: H }); if (!r.ok) return null; return r.json(); }
async function bcGetAll(p) {
  let n = p; const out = [];
  while (n) {
    const r = await fetch(n, { headers: H });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    n = lh ? lh[1] : null;
  }
  return out;
}

(async () => {
  for (const p of PROJECTS) {
    console.log('\n=== Project', p.id, p.name, '===');
    const proj = await bcGet(`https://3.basecampapi.com/3945211/projects/${p.id}.json`);
    if (!proj) { console.log('  NO ACCESS or 404'); continue; }
    console.log('  Name:', proj.name);
    console.log('  Description:', (proj.description || '').replace(/<[^>]+>/g, ' ').slice(0, 300));
    console.log('  Dock:');
    for (const d of (proj.dock || []).filter(d => d.enabled)) console.log(`    ${d.name} ${d.id} "${d.title}"`);

    const tset = proj.dock.find(d => d.name === 'todoset');
    if (tset) {
      const lists = await bcGetAll(`https://3.basecampapi.com/3945211/buckets/${p.id}/todosets/${tset.id}/todolists.json`);
      console.log(`  todolists (${lists.length}):`);
      for (const l of lists.slice(0, 25)) {
        console.log(`    ${l.id} "${l.name}" - completed_ratio=${l.completed_ratio}`);
      }
    }

    const mb = proj.dock.find(d => d.name === 'message_board');
    if (mb) {
      const msgs = await bcGetAll(`https://3.basecampapi.com/3945211/buckets/${p.id}/message_boards/${mb.id}/messages.json`);
      console.log(`  recent MB posts (${msgs.length} total, showing 5):`);
      for (const m of msgs.slice(0, 5)) {
        console.log(`    [${m.created_at?.slice(0, 10)}] ${m.subject}`);
      }
    }
  }
})();
