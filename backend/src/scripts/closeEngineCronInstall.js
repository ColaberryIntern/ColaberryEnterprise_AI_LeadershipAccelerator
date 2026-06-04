#!/usr/bin/env node
// Close engine-cron install BC todo 9940809868. Audit confirmed all 3
// ops-engine crons are installed on prod via cron-env-wrapper.sh and
// actively executing (recent log writes within the last hour).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211/buckets/7463955';
const TODO = 9940809868;
const AI_PRODUCTS_LIST = 9939449052;
const ALI_ID = 17454835;

const VERDICT = `<div>
<p><strong>Verdict: all 3 engine crons installed + actively executing on prod. Decision 2 (LLM wiring) shipped. Closing this todo. Decision 3 (DST-safe 9 AM CT trigger) split to a focused follow-up with due date.</strong></p>

<h3 style="margin:18px 0 6px;font-size:14px">Prod crontab confirmation (verified just now via SSH)</h3>
<pre style="background:#0f172a;color:#e2e8f0;padding:14px;border-radius:6px;font-size:11.5px;line-height:1.5;overflow-x:auto"><code>*/15 * * * * /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh scripts/ops-engine/worker.js &gt;&gt; /var/log/cb-worker.log 2&gt;&amp;1
*/3  * * * * /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh scripts/ops-engine/inbound-dispatcher.js &gt;&gt; /var/log/cb-inbound.log 2&gt;&amp;1
0  */4 * * * /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh scripts/ops-engine/backlog-enforcer.js &gt;&gt; /var/log/cb-backlog.log 2&gt;&amp;1</code></pre>

<p style="font-size:12.5px;margin:6px 0">Note: the install uses <code>cron-env-wrapper.sh</code> instead of the inline <code>node -e</code> token-fetch you proposed in the original CB comment. The wrapper sources <code>backend/.env</code> + injects every required env var into the cron context so we do not have a fragile inline expression per cron line. Same token-rotation concern; current path is manual rotation via <code>backend/.env</code> on the VPS.</p>

<h3 style="margin:18px 0 6px;font-size:14px">Liveness evidence</h3>
<table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12.5px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:6px 10px;width:28%">Script</th><th align="left" style="padding:6px 10px;width:12%">Cadence</th><th align="left" style="padding:6px 10px;width:30%">Log path</th><th align="left" style="padding:6px 10px">Last write + size</th></tr></thead>
<tbody>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><code>worker.js</code></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">every 15 min</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">/var/log/cb-worker.log</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">00:31 UTC, 98 KB. Recent tick "tick 59 done in 70761ms".</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><code>inbound-dispatcher.js</code></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">every 3 min</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">/var/log/cb-inbound.log</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">00:42 UTC, 1.2 MB. Active.</td></tr>
<tr><td style="padding:6px 10px"><code>backlog-enforcer.js</code></td><td style="padding:6px 10px">every 4 hr</td><td style="padding:6px 10px;font-size:11px">/var/log/cb-backlog.log</td><td style="padding:6px 10px">00:00 UTC, 7.4 KB. Recent tick within window.</td></tr>
</tbody>
</table>

<h3 style="margin:18px 0 6px;font-size:14px">3 decisions you owed - status</h3>
<table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12.5px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:6px 10px;width:42%">Decision</th><th align="left" style="padding:6px 10px;width:14%">Status</th><th align="left" style="padding:6px 10px">Resolution</th></tr></thead>
<tbody>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">1. Install the 3 crons</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">DONE</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Installed via cron-env-wrapper.sh pattern. Confirmed in <code>crontab -l</code> output above.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">2. Wire LLM for free-form inbound questions</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">DONE</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Wired with OpenAI gpt-4o in <code>scripts/ops-engine/cb-system-handler.js:33</code> + 42 (MODEL = process.env.CB_HANDLER_MODEL || 'gpt-4o'). Not Haiku as the original CB comment suggested, but same intent (LLM-classified free-form requests). If you want to swap to Haiku for cost, that's a one-line MODEL env override + Anthropic SDK swap; flag if you want a follow-up todo.</td></tr>
<tr><td style="padding:6px 10px">3. Daily 9 AM CT trigger / DST handling</td><td style="padding:6px 10px;color:#78350f;font-weight:700">SPLIT</td><td style="padding:6px 10px">backlog-enforcer fires every 4 hr; the "9 AM CT" tagging condition lives inside the script as a within-tick check. DST drift risk on that internal check stands. Split to follow-up todo with due date (link below).</td></tr>
</tbody>
</table>

<p style="font-size:12.5px;color:#475569;margin-top:14px;font-style:italic">Closing this todo. Session: CC-20260603-v7da. Follow-up DST todo linked in the next comment.</p>
</div>`;

const DST_FOLLOWUP = {
  content: 'Ops engine: DST-safe 9 AM CT trigger for backlog-enforcer (decision 3 from todo 9940809868)',
  due_on: '2026-06-17',
  description: `<div>
<p><strong>Origin:</strong> Decision 3 from engine-cron install todo 9940809868 (closed 2026-06-03). The backlog-enforcer.js script has an internal "daily 9 AM CT" condition that tags Ali on the day's first tick. That condition currently uses UTC hour math which drifts under DST.</p>
<p><strong>Goal:</strong> the 9 AM CT trigger fires at 9 AM Central regardless of DST.</p>
<p><strong>File:</strong> <code>scripts/ops-engine/backlog-enforcer.js</code>.</p>
<p><strong>Done criteria:</strong> replace the UTC-hour check with a TZ-aware check using <code>process.env.TZ='America/Chicago'</code> at script top OR use <code>Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false })</code>. Manual test: temp-override system time on prod to 2025-12-15 (CST) and 2025-07-15 (CDT), confirm the 9 AM CT condition fires on both dates at the same 14 UTC / 15 UTC tick respectively.</p>
<p><strong>Estimated:</strong> ~30 min.</p>
</div>`,
};

async function bcPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPostNoBody(url) {
  const r = await fetch(url, { method: 'POST', headers: H });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.status;
}

(async () => {
  console.log('1. Posting verdict comment...');
  const c1 = await bcPost(`${BASE}/recordings/${TODO}/comments.json`, { content: VERDICT });
  console.log('   verdict:', c1.id, c1.app_url);

  console.log('\n2. Opening DST follow-up todo (due ' + DST_FOLLOWUP.due_on + ')...');
  const t = await bcPost(`${BASE}/todolists/${AI_PRODUCTS_LIST}/todos.json`, {
    content: DST_FOLLOWUP.content,
    description: DST_FOLLOWUP.description,
    assignee_ids: [ALI_ID],
    due_on: DST_FOLLOWUP.due_on,
  });
  console.log('   follow-up:', t.id, t.app_url);

  console.log('\n3. Posting follow-up link comment...');
  const c2 = await bcPost(`${BASE}/recordings/${TODO}/comments.json`, {
    content: `<div><p>DST follow-up todo opened: <a href="${t.app_url}">${DST_FOLLOWUP.content}</a> (due ${DST_FOLLOWUP.due_on}). Closing this install todo.</p></div>`,
  });
  console.log('   link comment:', c2.id);

  console.log('\n4. Marking todo complete...');
  const m = await bcPostNoBody(`${BASE}/todos/${TODO}/completion.json`);
  console.log('   status:', m);

  console.log('\n=== DONE ===');
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
