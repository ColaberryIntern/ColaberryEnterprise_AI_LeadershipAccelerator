#!/usr/bin/env node
// Post Ali's guidance comment on Kes's Anthropic_ContentRegistry todo.
// Tags Kes with proper <bc-attachment> mention so he gets the email.
// Bumps the due date to 2026-06-08 so the overdue ticker stops.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
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
  // 1. Get Kes's sgid
  const people = (await axios.get(`https://3.basecampapi.com/3945211/projects/${BUCKET}/people.json`, { headers: BC_HEADERS })).data;
  const kes = people.find((p) => p.name === 'Kes Delele');
  if (!kes) throw new Error('Kes not found');
  const KES = mention(kes.attachable_sgid);

  // 2. Compose the comment
  const COMMENT = `<div>${KES} good work - confirmed via WhatsApp that you don't actually need those creds for this ticket and that the branch is pushed. Here is what is happening now:</div>
<div><br></div>
<ol>
<li><strong>Code review.</strong> Branch <code>kes/anthropic-intelligence-layer-l1</code> - open the PR against main if not already open and I will review next.</li>
<li><strong>VPS access for Dev 2.</strong> Not running your one-line <code>echo ... >> ~/.ssh/authorized_keys</code> as-is - that would have dropped your key into root's authorized_keys and given you full prod admin. Instead I am creating a non-root <code>kes</code> user on the VPS, dropping your pubkey there, and adding you to the docker group so you can run <code>docker compose</code> against the dev2 stack without sudo. Sending host + login details separately once provisioned.</li>
<li><strong>5th Skilljar URL (Claude 101 / Intro to Subagents).</strong> I'll send it with the Dev 2 access. Placeholder in the seed is fine for now.</li>
</ol>
<div><br></div>
<div><strong>Path to close this todo:</strong></div>
<ol>
<li>Open PR (you).</li>
<li>I review + merge.</li>
<li>You SSH to Dev 2 as <code>kes</code>, pull + restart the dev2 stack.</li>
<li>Run <code>POST /api/admin/sync/anthropic-content</code> against Dev 2 as the baseline.</li>
<li>If baseline clean, I push to prod and you mark this complete.</li>
</ol>
<div><br></div>
<div>Due bumped to 2026-06-08 so the overdue ticker stops firing on this thread.</div>`;

  // 3. Post the comment
  const c = await axios.post(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`, {
    content: COMMENT,
  }, { headers: BC_HEADERS });
  console.log('Comment posted:', c.data.app_url);

  // 4. Bump due date (PUT requires full body)
  const cur = (await axios.get(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/todos/${TODO_ID}.json`, { headers: BC_HEADERS })).data;
  await axios.put(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/todos/${TODO_ID}.json`, {
    content: cur.content,
    description: cur.description,
    due_on: '2026-06-08',
    assignee_ids: cur.assignees.map((a) => a.id),
  }, { headers: BC_HEADERS });
  console.log('Due bumped to 2026-06-08.');
})().catch((e) => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });
