#!/usr/bin/env node
// Pull Jackie's recent comments + messages in project 24865175 to capture her nudge cadence + tone.
const TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
const BUCKET = 24865175;
const JACKIE_ID = 37184021;
const SINCE = new Date(Date.now() - 60 * 86400 * 1000).toISOString(); // last 60 days

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
  console.log(`Fetching events for bucket ${BUCKET} (no since filter)...`);
  const events = await getAll(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/events.json`);
  console.log(`Total events: ${events.length}`);
  const jackieEvents = events.filter(e => e.creator?.id === JACKIE_ID);
  console.log(`Jackie events: ${jackieEvents.length}`);

  // Group by recording for context
  const byRec = {};
  for (const ev of jackieEvents) {
    const rid = ev.recording?.id;
    if (!rid) continue;
    if (!byRec[rid]) byRec[rid] = [];
    byRec[rid].push(ev);
  }
  console.log(`Distinct recordings she touched: ${Object.keys(byRec).length}`);

  // For each recording, pull her comments specifically
  let printed = 0;
  for (const rid of Object.keys(byRec)) {
    if (printed >= 20) break;
    try {
      const comments = await getAll(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${rid}/comments.json`);
      const hers = comments.filter(c => c.creator?.id === JACKIE_ID && new Date(c.created_at) >= new Date(SINCE));
      for (const c of hers.slice(-3)) {
        const text = (c.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length < 30) continue; // skip emoji-only or "yes"
        console.log(`\n[${c.created_at}] recording=${rid}`);
        console.log(text.slice(0, 800));
        printed++;
        if (printed >= 20) break;
      }
    } catch (_e) {}
  }
})().catch(e => console.error('FATAL:', e.message));
