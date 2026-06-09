#!/usr/bin/env node
// Notify Kes that his PR is merged + deployed to dev2 + tables seeded.

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
  const people = (await axios.get(`https://3.basecampapi.com/3945211/projects/${BUCKET}/people.json`, { headers: BC_HEADERS })).data;
  const kes = people.find((p) => p.name === 'Kes Delele');
  const KES = mention(kes.attachable_sgid);

  const COMMENT = `<div>${KES} all three blockers cleared. You are unblocked.</div>
<div><br></div>
<div><strong>What I did just now:</strong></div>
<ol>
<li><strong>Reviewed the PR.</strong> Strong work. 19 files, +1205 LOC, 18 tests, idempotent seeds, atomic Sequelize transactions in L2, structured logs, proper cron offset (L1 02:00 UTC, L2 02:30 UTC), well-namespaced. L1 + L2 bundled into one PR was a good call.</li>
<li><strong>Resolved the merge conflict</strong> on <code>backend/src/routes/adminRoutes.ts</code> - both your branch and main added independent route imports (anthropicRoutes and qrAnalyticsRoutes). Kept both. Merged to main.</li>
<li><strong>Pulled on <code>/opt/colaberry-accelerator</code></strong> and rebuilt the dev2 backend container. Old container had been running stale code for 7 weeks, so I stopped and recreated it. Dev2 backend is healthy at <code>localhost:3013/health</code>.</li>
<li><strong>Ran your three seeds in order</strong> on <code>accelerator_dev2</code> database:
<ul>
<li><code>createAnthropicContentRegistry.js</code> - table ready, etag + content_hash columns added</li>
<li><code>createAnthropicChangeEvents.js</code> - table ready with unique constraint</li>
<li><code>seedAnthropicContentRegistry.js</code> - 7 rows upserted (4 Skilljar courses + docs + news + partner portal placeholder)</li>
</ul>
</li>
</ol>
<div><br></div>
<div><strong>Your turn:</strong></div>
<ol>
<li>SSH in: <code>ssh kes@95.216.199.47</code></li>
<li>Hit the baseline manual sync from inside (the admin route is auth-gated so easiest path is curl with the admin JWT, or from inside the container):
<pre><code>docker exec 18af8ecc98a2_accelerator-dev2-backend curl -s -X POST http://localhost:3001/api/admin/sync/anthropic-content -H "Authorization: Bearer &lt;admin_jwt&gt;"</code></pre>
(or hit it from your shell against <code>http://95.216.199.47:3013/api/admin/sync/anthropic-content</code> with the admin token)</li>
<li>Verify the watcher checked all 7 rows and populated last_checked + last_modified / etag / content_hash where the upstream provided them.</li>
<li>If the baseline run is clean, post the result on this thread and I will deploy to prod.</li>
</ol>
<div><br></div>
<div><strong>One thing to know:</strong> the dev2 container name is <code>18af8ecc98a2_accelerator-dev2-backend</code> (got that prefix because of the rename during recreate). For <code>docker exec</code> commands, use that exact name. Cleaner name will be back on the next normal rebuild.</div>
<div><br></div>
<div><strong>5th Skilljar URL (Claude 101 / Intro to Subagents):</strong> still owe you that. Will send via the BC ticket separately so you can add it to the seed before prod deploy. Placeholder for partner portal stays as-is until the 2026-06-12 Anthropic confirmation.</div>`;

  const c = await axios.post(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`, {
    content: COMMENT,
  }, { headers: BC_HEADERS });
  console.log('Comment posted:', c.data.app_url);
})().catch((e) => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });
