#!/usr/bin/env node
// Post the SSH connection details for Kes on the Anthropic ticket
// now that the kes user is provisioned on the VPS.

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
  const KES = mention(kes.attachable_sgid);

  const COMMENT = `<div>${KES} VPS access provisioned. You are good to go.</div>
<div><br></div>
<div><strong>SSH</strong></div>
<div><code>ssh kes@95.216.199.47</code></div>
<div>(Uses the ed25519 pubkey you sent. No password, no sudo. You are in the <code>docker</code> group so <code>docker ps</code> and <code>docker compose</code> work without sudo.)</div>
<div><br></div>
<div><strong>Repo</strong></div>
<div>Clone to your home dir:</div>
<div><code>cd ~ && git clone https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator.git colaberry-accelerator</code></div>
<div>The shared <code>/opt/colaberry-accelerator</code> is read-only for you - work out of <code>~/colaberry-accelerator</code> instead.</div>
<div><br></div>
<div><strong>Dev 2 stack</strong></div>
<div>The dev2 stack is already running at <code>95.216.199.47:9998</code> (nginx) and <code>:3013</code> (backend API). Compose file: <code>/opt/colaberry-accelerator/docker-compose.dev2.yml</code>.</div>
<div><br></div>
<div>For testing your branch:</div>
<ol>
<li>SSH in.</li>
<li><code>cd ~/colaberry-accelerator && git fetch && git checkout kes/anthropic-intelligence-layer-l1</code></li>
<li>Once your PR is merged to main, I will pull on the shared <code>/opt/colaberry-accelerator</code> and restart the dev2 backend so your code is live there.</li>
<li>Then run <code>POST http://95.216.199.47:3013/api/admin/sync/anthropic-content</code> as your baseline.</li>
</ol>
<div><br></div>
<div><strong>What to do now</strong></div>
<ol>
<li>Test SSH works: <code>ssh kes@95.216.199.47</code>.</li>
<li>Clone the repo to your home dir.</li>
<li>Open the PR for <code>kes/anthropic-intelligence-layer-l1</code> against main on GitHub.</li>
<li>Drop the PR link as a comment here so I can review.</li>
</ol>`;

  const c = await axios.post(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`, {
    content: COMMENT,
  }, { headers: BC_HEADERS });
  console.log('Comment posted:', c.data.app_url);
})().catch((e) => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });
