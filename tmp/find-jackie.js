#!/usr/bin/env node
const TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
async function getAll(url) {
  let n = url; const out = [];
  while (n) {
    const r = await fetch(n, { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' }});
    if (!r.ok) break;
    out.push(...await r.json());
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    n = lh ? lh[1] : null;
  }
  return out;
}
(async () => {
  const ps = await getAll('https://3.basecampapi.com/3945211/people.json');
  console.log(`total people across pages: ${ps.length}`);
  const js = ps.filter(p => /jackie|chalk/i.test(p.name || ''));
  for (const p of js) console.log(`  ${p.id}  ${p.name}  ${p.email_address || ''}`);
})();
