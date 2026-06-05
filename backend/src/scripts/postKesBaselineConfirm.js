#!/usr/bin/env node
// Confirm Kes's baseline run worked and tee up prod deploy.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));
const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};
const BUCKET = 47502609;
const TODO_ID = 9946499448;

function mention(sgid) {
  return `<bc-attachment sgid="${sgid}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
}

(async () => {
  const people = (await axios.get(`https://3.basecampapi.com/3945211/projects/${BUCKET}/people.json`, { headers: BC_HEADERS })).data;
  const kes = people.find((p) => p.name === 'Kes Delele');
  const ali = people.find((p) => p.name === 'Ali Muwwakkil');
  const KES = mention(kes.attachable_sgid);
  const ALI = mention(ali.attachable_sgid);

  const COMMENT = `<div>${KES} I checked dev2 - you are already in and the baseline ran clean. Closing the loop so ${ALI} has the green light for prod.</div>
<div><br></div>
<div><strong>Baseline result (verified against accelerator_dev2 DB at 21:58 UTC):</strong></div>
<table cellpadding="6" style="border-collapse:collapse;font-family:monospace;font-size:12px">
<thead><tr style="background:#1a365d;color:white"><th>Row</th><th>last_checked</th><th>content_hash</th></tr></thead>
<tbody>
<tr><td>Introduction to Agent Skills (Skilljar)</td><td>21:58:02</td><td>set</td></tr>
<tr><td>Claude with the Anthropic API (Skilljar)</td><td>21:58:04</td><td>set</td></tr>
<tr><td>Introduction to Model Context Protocol (Skilljar)</td><td>21:58:05</td><td>set</td></tr>
<tr><td>Claude Code in Action (Skilljar)</td><td>21:58:06</td><td>set</td></tr>
<tr><td>Anthropic Documentation (docs.anthropic.com)</td><td>21:58:07</td><td>set</td></tr>
<tr><td>Anthropic News (anthropic.com/news)</td><td>21:58:12</td><td>set</td></tr>
<tr style="color:#92400e"><td>Anthropic Partner Portal (PLACEHOLDER)</td><td>null</td><td>not set</td></tr>
</tbody>
</table>
<div><br></div>
<div>6 of 7 rows hit cleanly. The 7th is the placeholder URL that doesn't resolve - expected, will update after the 2026-06-12 Anthropic partner confirmation.</div>
<div><br></div>
<div><strong>One thing the data tells us:</strong> none of the upstreams returned ETag headers (etag column is null across the board). Your three-tier detection chain handled it correctly by falling through to SHA-256 content_hash. Good defensive design.</div>
<div><br></div>
<div><strong>${ALI} - we are ready for prod deploy.</strong> Same playbook as dev2:</div>
<ol>
<li><code>ssh root@95.216.199.47 "cd /opt/colaberry-accelerator && git pull origin main && docker compose -f docker-compose.production.yml up -d --build backend"</code></li>
<li>Run the 3 seeds against accelerator_prod inside the prod backend container (same commands as dev2, just no dev2 suffix)</li>
<li>Verify the nightly cron at 02:00 UTC fires (will land tonight)</li>
</ol>
<div>After-hours rule applies. Say the word and I run it whenever you give the green light.</div>
<div><br></div>
<div>${KES} - once Ali deploys to prod, mark this todo complete. You shipped clean L1 + L2 in one PR with 18 tests. That is a strong first ticket. Good work.</div>`;

  const c = await axios.post(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`, {
    content: COMMENT,
  }, { headers: BC_HEADERS });
  console.log('Comment posted:', c.data.app_url);
})().catch((e) => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });
