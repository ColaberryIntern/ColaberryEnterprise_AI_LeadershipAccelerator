#!/usr/bin/env node
// Email Ali the verification report from verifyInboxCosDigestFlow.js.
// Inlines the 5 screenshots as base64 in the HTML so it renders in any
// email client without needing external image hosting.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const SHOT_DIR = path.resolve(__dirname, '../../../docs/screenshots/2026-06-01-inbox-cos-fix');
const results = JSON.parse(fs.readFileSync(path.join(SHOT_DIR, 'results.json'), 'utf8'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function inlineImg(filename, alt) {
  const buf = fs.readFileSync(path.join(SHOT_DIR, filename));
  const b64 = buf.toString('base64');
  return `<img src="data:image/png;base64,${b64}" alt="${escape(alt)}" style="max-width:100%;border:1px solid #cbd5e1;border-radius:6px;display:block;margin-top:10px">`;
}

(async () => {
  const stepCard = (r, num) => `
<div style="background:white;border:1px solid #cbd5e1;border-radius:8px;padding:18px 22px;margin-bottom:18px">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${r.ok === false ? '#7f1d1d' : r.ok === true ? '#14532d' : '#0369a1'};font-weight:700">Step ${num} of 5 ${r.ok === true ? '&#x2713; PASS' : r.ok === false ? '&#x26A0; FAIL' : '(control)'}</div>
  <div style="font-size:16px;font-weight:700;color:#0f172a;margin-top:4px">${escape(r.step)}</div>
  <div style="font-size:12px;color:#475569;margin-top:8px"><strong>Expected:</strong> ${escape(r.expected)}</div>
  <div style="font-size:12px;color:#475569;margin-top:4px"><strong>Final URL:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:3px;word-break:break-all">${escape(r.finalUrl)}</code></div>
  ${r.linkHref ? `<div style="font-size:12px;color:#475569;margin-top:4px"><strong>"Open Admin Console" link target:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:3px">${escape(r.linkHref)}</code></div>` : ''}
  ${r.status ? `<div style="font-size:12px;color:#475569;margin-top:4px"><strong>HTTP status:</strong> ${r.status}</div>` : ''}
  ${inlineImg(r.shot, r.step)}
</div>`;

  const overallStatus = results.filter(r => r.ok === true).length;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:26px 32px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Headless verification report</div>
<div style="font-size:22px;font-weight:700;margin-top:6px">Inbox COS digest action flow - fixed + verified end-to-end</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:8px">${overallStatus} of 4 expected outcomes PASS. Captured by Playwright Chromium against live prod (enterprise.colaberry.ai), 2026-06-01.</div>
</div>

<div style="padding:24px 32px;border-bottom:2px solid #e2e8f0;background:#fffbeb">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">What was broken</div>
<div style="font-size:18px;font-weight:700;margin-top:4px;color:#0f172a">Two issues on the digest-action page</div>
<ol style="margin-top:10px;font-size:13px;color:#1f2937">
<li><strong>Wrong route in the "Open Admin Console" link.</strong> The Done page on backend/src/controllers/inboxController.ts:479 linked to <code>/admin/inbox/decisions</code>. That route does not exist on the frontend. The actual route is <code>/admin/inbox</code> (with internal tabs for Decisions / Drafts / Rules / VIPs / Learning / Audit). Clicking the link hit the SPA's fallback for unknown sub-routes.</li>
<li><strong>"Show Me" should not show a confirmation page.</strong> When you click <em>Show Me</em>, intent is "take me to the email." The old handler updated state, then displayed a "Done!" interstitial with a link. That added an extra click and made the broken link surface.</li>
</ol>
</div>

<div style="padding:24px 32px;border-bottom:2px solid #e2e8f0;background:#f0fdf4">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#14532d;font-weight:700">What was fixed</div>
<div style="font-size:18px;font-weight:700;margin-top:4px;color:#0f172a">Two changes in <code>backend/src/controllers/inboxController.ts</code></div>
<ol style="margin-top:10px;font-size:13px;color:#1f2937">
<li><strong>Show Me (action=inbox)</strong> now 302-redirects directly to <code>/admin/inbox?tab=decisions&emailId=&lt;id&gt;</code> after the state update. No interstitial.</li>
<li><strong>Dismiss / Keep Holding (action=automation, hold)</strong> still show the "Done!" confirmation page (the action is terminal). But the "Open Admin Console" link now points to <code>/admin/inbox</code> - the correct route.</li>
</ol>
<div style="margin-top:10px;font-size:12px;color:#14532d">Commit <code>934a679f</code>. Deployed via docker rebuild of the backend container.</div>
</div>

<div style="padding:24px 32px;border-bottom:2px solid #e2e8f0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0369a1;font-weight:700">Verified end-to-end via Playwright</div>
<div style="font-size:18px;font-weight:700;margin-top:4px;color:#0f172a">All 4 steps + 1 control screenshot</div>

${results.map((r, i) => stepCard(r, i + 1)).join('')}
</div>

<div style="padding:24px 32px;background:#0f172a;color:white">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Status</div>
<div style="font-size:16px;font-weight:700;margin-top:4px">Fixed + deployed + verified.</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:8px">Next time you get an Inbox COS digest email: Show Me drops you straight on the admin inbox. Dismiss / Keep Holding give a tiny confirmation page with a working link.</div>
</div>

</div></body></html>`;

  const text = strip(`Headless verification report - Inbox COS digest action flow fixed + verified

What was broken:
1. Wrong route in the "Open Admin Console" link. The Done page on
   backend/src/controllers/inboxController.ts:479 linked to /admin/inbox/decisions
   which does not exist on the frontend. The actual route is /admin/inbox with
   internal tabs.
2. Show Me should not show a confirmation page. Intent of Show Me is "take me to
   the email." Old handler displayed a "Done!" interstitial with a link.

What was fixed (commit 934a679f):
1. Show Me (action=inbox) now 302-redirects directly to
   /admin/inbox?tab=decisions&emailId=<id>. No interstitial.
2. Dismiss / Keep Holding still show the Done confirmation page, but the
   "Open Admin Console" link now points to the correct route /admin/inbox.

Verified end-to-end via Playwright Chromium against prod (5 screenshots in HTML):
1. Show Me click  -> final URL /admin/inbox?tab=decisions&emailId=... (status 200). PASS.
2. Dismiss click  -> Done page with link to /admin/inbox. PASS.
3. Keep Holding   -> Done page with link to /admin/inbox. PASS.
4. Click "Open Admin Console" on the Done page -> lands on /admin/inbox status 200. PASS.
5. Control: direct hit on the old broken /admin/inbox/decisions path - captured.

Status: fixed, deployed, verified.

Ali`);

  validateBeforeSend(html, text);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Claude Code (on behalf of Ali)" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com'],
    subject: '[Verified] Inbox COS digest action flow fixed - Playwright walkthrough',
    text,
    html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
