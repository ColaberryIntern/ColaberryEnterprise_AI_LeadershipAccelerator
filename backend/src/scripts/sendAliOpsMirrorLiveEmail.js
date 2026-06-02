#!/usr/bin/env node
// Mirror is populating. Quick confirmation to Ali on the same ticket.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:22px 26px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mirror live</div>
<h1 style="margin:8px 0 6px;font-size:21px;font-weight:800;line-height:1.3">Right - I already had the token. Pushed it into prod .env, recreated backend, mirror populated immediately.</h1>
<div style="font-size:13px;color:#cbd5e0">You were correct - that is the same token <code>sendWithBcAttach</code> has been using all session to attach this very email. Drop into <code>/opt/colaberry-accelerator/.env</code>, <code>docker compose ... up -d --force-recreate backend</code>, done.</div>
</div>

<div style="padding:22px 32px">

<h2 style="font-size:16px;margin:0 0 10px;color:#0f172a">Mirror state right now</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Todos mirrored</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">374</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Projects seen</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">8</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Status = active</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">374</td></tr>
<tr><td style="padding:8px 12px">Sync cadence</td><td style="padding:8px 12px;color:#14532d;font-weight:700">every 2 min (idempotent upsert)</td></tr>
</tbody>
</table>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Note on the prior email</h2>
<p style="font-size:14px">When I sent the "one ask" email I had been thinking of the token as a separate secret that belongs in CCPP rotation - so I treated it as an Ali-touches-prod-env task. You correctly pointed out it is the same token I have been actively using. Fixed in 90 seconds; no need for you to touch the VPS. Backed up the prior .env at <code>/opt/colaberry-accelerator/.env.bak-20260602-232401</code> in case.</p>

<h2 style="font-size:16px;margin:24px 0 10px;color:#0f172a">Reach the page</h2>
<p style="font-size:14px"><a href="https://enterprise.colaberry.ai/admin/ops" style="color:#1a365d;font-weight:700">enterprise.colaberry.ai/admin/ops</a> - log in with admin_token first. KPI tiles should now read "374 todos mirrored / 0 open approvals / last sync &lt;1m ago / 0 sync errors", and the Waiting on Human queue should be populated.</p>

<p style="font-size:14px;margin:14px 0 0">Starting Phase 1 now - rule-based Priority Engine + Approval workspace + Run My Day + nightly metrics rollup. Target ship 2026-06-16.</p>

</div>

<div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Ali - right, I already had the token.

Pushed it into /opt/colaberry-accelerator/.env, recreated backend container, mirror populated immediately.

MIRROR STATE RIGHT NOW:
- Todos mirrored: 374
- Projects seen: 8
- Status = active: 374
- Sync cadence: every 2 min (idempotent upsert)

Note on the prior email: I had been thinking of the token as a separate secret that belongs in CCPP rotation - so treated it as an Ali-touches-prod-env task. You correctly pointed out it is the same token I have been actively using all session via sendWithBcAttach. Fixed in 90 seconds. Prior .env backed up at /opt/colaberry-accelerator/.env.bak-20260602-232401.

REACH THE PAGE: enterprise.colaberry.ai/admin/ops (log in with admin_token).

KPI tiles should now read: 374 todos mirrored / 0 open approvals / last sync <1m ago / 0 sync errors. Waiting on Human queue populated.

Starting Phase 1 now: rule-based Priority Engine + Approval workspace + Run My Day + nightly metrics rollup. Target ship 2026-06-16.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - mirror live (374 todos, 8 projects, sync running every 2 min)',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Confirmation that the AI Ops Command Center BC mirror is live + populated. Ali correctly flagged that the BC token I had been using all session via <code>sendWithBcAttach</code> was the same one prod needed. Wrote it directly to <code>/opt/colaberry-accelerator/.env</code> (backup saved), force-recreated the backend container, and the first 2-min sync pass populated <code>ops_bc_todos</code> with 374 todos across 8 BC projects. The <code>/admin/ops</code> page now has real data. Phase 1 starts next.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
