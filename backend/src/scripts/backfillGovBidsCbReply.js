#!/usr/bin/env node
// Backfill CB's missing reply on Ali's "New Bids" MB post on Gov Contracts.
// Ali posted at 1:xx pm: "@CB find me 5 new gov bids" but the dispatcher
// scans comments on MB messages, never the message body itself, so the
// mention was invisible. Fix in the dispatcher ships in the same commit.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = '';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry CB-Backfill', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';

const GOV_BUCKET = 47346103;
const NEW_BIDS_MSG = 9950734082;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';

const OPPORTUNITY_PULSE_STRATEGIC = 'https://op.colaberry.ai/admin/strategic';
const OPPORTUNITY_PULSE_BASE = 'https://op.colaberry.ai';
const BONFIRE_ACCOUNT_LOGIN = 'https://vendor.bonfirehub.com/login';
const BONFIRE_VENDOR_HUB = 'https://vendor.bonfirehub.com';

const count = 5;

const html = `<div><bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment> got it - late reply because the dispatcher scans comments on MB messages but never the message body itself. Fixing that now so this kind of post is caught within 3 minutes going forward.</div>
<div><br></div>
<div><strong>Action needed from you - download ${count} RFP packages from Opportunity Pulse, then reply here.</strong> I cannot pull RFP packages on my own (Opportunity Pulse + Bonfire need a logged-in browser session). Walk the historical flow below; once you have the documents downloaded, reply on this post and I will build out the projects with the 14-task template, due dates back-distributed from the submission deadline, and feasibility scoring.</div>
<div><br></div>
<div><strong>Step-by-step:</strong></div>
<ol>
<li><strong>Open the Opportunity Pulse strategic feed:</strong> <a href="${OPPORTUNITY_PULSE_STRATEGIC}">${OPPORTUNITY_PULSE_STRATEGIC}</a><br>
Pick the ${count} opportunities you want to pursue. The strategic page shows them already ranked.</li>
<li><strong>For each opportunity, open its readiness page</strong> at <code>${OPPORTUNITY_PULSE_BASE}/admin/bonfire/&lt;uuid&gt;/submission-readiness</code>. Confirm: routing (Colaberry-only via vendor.bonfirehub.com vs joint with Que), submission deadline, and any pre-tailored analysis.</li>
<li><strong>Click through to the agency Bonfire portal</strong> from the readiness page. Per-agency portals live at <code>{agency}.bonfirehub.com/opportunities/{numeric_id}</code> (e.g., <code>harriscountytx.bonfirehub.com/opportunities/228389</code>).</li>
<li><strong>Login to Bonfire with the right account</strong> for the routing:
<ul>
<li>Colaberry-only: <a href="${BONFIRE_ACCOUNT_LOGIN}">${BONFIRE_ACCOUNT_LOGIN}</a> (your colaberry account, vendor hub at <a href="${BONFIRE_VENDOR_HUB}">${BONFIRE_VENDOR_HUB}</a>)</li>
<li>Joint with Que: Que's credentials (per the gov-bid-account-routing rule)</li>
</ul></li>
<li><strong>Download the full RFP zip</strong> from the agency portal for each opportunity.</li>
<li><strong>Reply on this Message Board post</strong> with one line per bid in the format below, and tag <strong>@CB System</strong> in your reply:</li>
</ol>

<div><strong>Format example (with zip - rich mode, recommended):</strong></div>
<div style="background:#f1f5f9;border-left:3px solid #1a365d;padding:10px 14px;font-family:monospace;font-size:12px">
&#64;CB System ready - here are the ${count} bids:<br>
1. Harris County - Agenda &amp; Meeting Mgmt (RFP 26_0075), deadline 2026-06-22, agency Harris County TX, uuid 7011f5af-..., bonfire harriscountytx.bonfirehub.com/opportunities/228389, zip https://3.basecamp.com/3945211/buckets/${GOV_BUCKET}/uploads/9912345678<br>
2. SLCC - Enterprise Analytics (SLCC2026-M6006), deadline 2026-07-15, agency SLCC, uuid ..., bonfire ..., zip https://3.basecamp.com/3945211/buckets/${GOV_BUCKET}/uploads/...<br>
3. ...
</div>
<div><br></div>
<div><strong>Or without zip (light mode, generic 14-task template):</strong></div>
<div style="background:#f8fafc;border-left:3px solid #94a3b8;padding:10px 14px;font-family:monospace;font-size:12px">
&#64;CB System ready - here are the ${count} bids:<br>
1. Harris County - Agenda &amp; Meeting Mgmt, deadline 2026-06-22, agency Harris County TX<br>
2. SLCC - Enterprise Analytics Platform, deadline 2026-07-15, agency SLCC<br>
3. ...
</div>
<div><br></div>
<div style="font-size:12px;color:#64748b">For a single bid where you already know the title and deadline, you can skip the discovery step and just tag <code>&#64;CB System add gov bid &lt;title&gt; deadline &lt;YYYY-MM-DD&gt;</code> directly on any thread.</div>
<div><br></div>
<div style="font-size:11px;color:#94a3b8">Posted by CB System (late, see top). Dispatcher fix shipping in same session: MB message bodies now scanned for @CB mentions, not just comments on them.</div>`;

(async () => {
  const r = await fetch(`${BASE}/buckets/${GOV_BUCKET}/recordings/${NEW_BIDS_MSG}/comments.json`, {
    method: 'POST', headers: H, body: JSON.stringify({ content: html }),
  });
  console.log(`status: ${r.status}`);
  if (!r.ok) { console.error('POST failed:', await r.text()); process.exit(1); }
  const c = await r.json();
  console.log(`comment id: ${c.id}`);
  console.log(`url: ${c.app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
