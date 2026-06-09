#!/usr/bin/env node
// Post completion comment + mark the Anthropic_ContentRegistry prod-deploy
// BC todo (9946499448) complete after the 3 seeds landed clean on prod.

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

const COMMENT = `<div style="background:#ecfdf5;border-left:5px solid #059669;padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#065f46;font-weight:700">Prod deploy landed</div>
<div style="font-size:13px;color:#065f46;margin-top:4px">Anthropic Intelligence Layer L1 + L2 are live on accelerator_prod.</div>
</div>

<div style="margin-top:14px"><strong>What I did:</strong></div>
<ol>
<li><strong>Deployed backend</strong> from main on the VPS: <code>git pull origin main &amp;&amp; docker compose -f docker-compose.production.yml up -d --build backend</code>. <code>accelerator-backend</code> healthy at <code>/health</code> (port 3001 internal — not host-published, but nginx proxies fine).</li>
<li><strong>Ran the 3 seeds</strong> against <code>accelerator_prod</code> inside the prod backend container, in order:
<ul>
<li><code>node /app/dist/seeds/createAnthropicContentRegistry.js</code> — table ready (ENUM + columns + idempotent <code>IF NOT EXISTS</code> guards).</li>
<li><code>node /app/dist/seeds/createAnthropicChangeEvents.js</code> — L2 audit table ready with the <code>UNIQUE (registry_id, detected_at)</code> constraint.</li>
<li><code>node /app/dist/seeds/seedAnthropicContentRegistry.js</code> — 7 rows upserted (4 Skilljar courses + docs.anthropic.com + anthropic.com/news + partner portal PLACEHOLDER).</li>
</ul>
</li>
<li><strong>Verified row count via psql</strong>: 4 course / 1 document / 1 news / 1 partner-portal = 7 total. Both tables present.</li>
</ol>

<div style="margin-top:14px"><strong>What runs tonight without further action:</strong></div>
<ul>
<li><strong>02:00 UTC</strong> — L1 watcher (<code>anthropicContentWatcher</code>) checks all 7 rows via three-tier detection (Last-Modified → ETag → SHA-256), populates <code>last_checked</code> / <code>last_modified</code> / <code>etag</code> / <code>content_hash</code> and sets <code>change_detected</code> if upstream changed.</li>
<li><strong>02:30 UTC</strong> — L2 change detector (<code>anthropicChangeDetector</code>) materializes any flagged rows into <code>anthropic_change_events</code> with a Sequelize transaction, clears the flag.</li>
</ul>

<div style="margin-top:14px"><strong>Open follow-up:</strong> the partner-portal row is a PLACEHOLDER (<code>https://partners.anthropic.com/PLACEHOLDER</code>) and will not resolve. Update the <code>url</code> column after the 2026-06-12 Anthropic partner confirmation. The watcher will surface this as an error against that row each night until then — expected, not a regression.</div>

<div style="margin-top:14px"><strong>Open verification:</strong> tomorrow morning, check <code>SELECT url, last_checked, content_hash IS NOT NULL AS hashed FROM anthropic_content_registry ORDER BY content_type, title;</code> — 6 of 7 should be hashed; the placeholder will not be.</div>

<div style="margin-top:14px">Closing this todo. Anthropic Partner Network deadline (2026-06-12) is now the next gate. <em>— Session CC-20260605-9b3e</em></div>`;

(async () => {
  // 1. Post the completion comment
  const c = await axios.post(
    `https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`,
    { content: COMMENT },
    { headers: BC_HEADERS },
  );
  console.log('Comment posted:', c.data.app_url);

  // 2. Mark the todo complete
  const r = await axios.post(
    `https://3.basecampapi.com/3945211/buckets/${BUCKET}/todos/${TODO_ID}/completion.json`,
    {},
    { headers: BC_HEADERS },
  );
  console.log('Todo completion status:', r.status);
})().catch((e) => {
  console.error('FAIL:', e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
