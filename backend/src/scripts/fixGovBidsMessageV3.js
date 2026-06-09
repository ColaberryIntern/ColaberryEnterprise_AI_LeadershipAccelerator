#!/usr/bin/env node
// V3: re-edit msg 9950817863 per Ali 2026-06-01 follow-up:
//   - Filter to >=10 days and <=365 days (no rush jobs, no 2035 data errors)
//   - Reorder buttons: Bonfire (Step 1, download zip), Opp Pulse (Step 2, upload zip + screenshot)
//   - Footer rewritten as 3 numbered steps ending in "tracked by Gov process, shows in daily reports"
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = '';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry CB-BidRewrite', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';

const GOV_BUCKET = 47346103;
const MSG_ID = 9950817863;
const COUNT = 5;

function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtMoney(n) {
  if (!n) return '';
  const v = parseInt(n, 10);
  if (isNaN(v)) return '';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v;
}
function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Math.round((d - new Date()) / 86400000);
}
function urgencyEmoji(days) {
  if (days == null) return '';
  if (days <= 14) return '⏰';
  if (days <= 30) return '📅';
  return '🗓️';
}

(async () => {
  const allOpps = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/op-pulse/all-opps.json'), 'utf8'));
  const now = Date.now();
  const minClose = now + 10 * 86400000;
  const maxClose = now + 365 * 86400000;
  const active = (allOpps.data || []).filter((o) => {
    if (!o.closeDate) return false;
    const t = new Date(o.closeDate).getTime();
    return t >= minClose && t <= maxClose;
  });
  const top = active.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)).slice(0, COUNT);

  const cards = top.map((o, i) => {
    const oppPulseUrl = `http://95.216.199.47/admin/bonfire/${o.id}/submission-readiness`;
    const bonfireUrl = o.sourceUrl || '';
    const signals = (o.signals || []).filter(s => s).slice(0, 3).join(' &middot; ');
    const summary = o.rawText && o.rawText !== o.title ? o.rawText : (o.description || '');
    const valueStr = fmtMoney(o.estimatedValue);
    const days = daysUntil(o.closeDate);
    const dueLabel = days != null ? `in ${days}d` : '';
    return `
<div style="border:1px solid #cbd5e1;border-radius:10px;padding:22px 24px;margin:24px 0;background:#ffffff;box-shadow:0 1px 3px rgba(15,23,42,0.05)">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;font-weight:700">Bid ${i + 1} of ${COUNT}</div>
  <div style="font-size:17px;font-weight:800;color:#0f172a;margin-top:8px;line-height:1.3">${escape(o.title)}</div>
  <div style="margin-top:14px;font-size:13px;color:#475569;line-height:1.8">
    🏛️ &nbsp;<strong style="color:#0f172a">${escape(o.agency || 'Unknown agency')}</strong><br>
    ${urgencyEmoji(days)} &nbsp;Deadline: <strong style="color:#0f172a">${(o.closeDate || '').slice(0, 10)}</strong>${dueLabel ? ` <span style="color:#64748b">(${dueLabel})</span>` : ''}${valueStr ? `<br>💰 &nbsp;Est value: <strong style="color:#0f172a">${valueStr}</strong>` : ''}
  </div>
  <div style="margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9;font-size:12px;color:#475569;line-height:1.8">
    ⚙️ &nbsp;Category: <strong>${escape(o.aiCategory || '-')}</strong><br>
    🚀 &nbsp;Recommended product: <strong>${escape(o.recommendedProduct || '-')}</strong><br>
    🎯 &nbsp;Scores: priority <strong>${o.priorityScore ?? '?'}</strong> &middot; fit <strong>${o.fitScore ?? '?'}</strong> &middot; automation <strong>${o.automationPotential ?? '?'}</strong>${signals ? `<br>✨ &nbsp;Signals: <strong>${signals}</strong>` : ''}
  </div>
  ${summary ? `<div style="margin-top:16px;padding:12px 14px;background:#f8fafc;border-radius:6px;font-size:13px;color:#1f2937;font-style:italic;line-height:1.5">"${escape(summary).slice(0, 280)}${summary.length > 280 ? '...' : ''}"</div>` : ''}
  <div style="margin-top:18px;display:block">
    <a href="${bonfireUrl}" style="display:inline-block;background:#1a365d;color:white;padding:10px 18px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;margin-right:10px;margin-bottom:6px">🔗 Step 1: Bonfire (download zip)</a>
    <a href="${oppPulseUrl}" style="display:inline-block;background:#7c3aed;color:white;padding:10px 18px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;margin-bottom:6px">📂 Step 2: Opp Pulse (upload zip + screenshot)</a>
  </div>
</div>`;
  }).join('');

  const html = `<div style="font-size:14px;color:#1a202c;line-height:1.6">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:white;padding:22px 24px;border-radius:10px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">🎯 Top ${COUNT} active opportunities</div>
  <div style="font-size:18px;font-weight:700;margin-top:6px">From Opportunity Pulse, ranked by priority score</div>
  <div style="font-size:13px;color:#cbd5e0;margin-top:6px">${active.length} in the 10-365 day window. Showing the ${COUNT} highest-priority below. Rush jobs (under 10 days) excluded.</div>
</div>

${cards}

<div style="margin-top:32px;padding:22px 24px;background:#fffbeb;border:2px solid #f59e0b;border-radius:10px">
  <div style="font-size:12px;font-weight:700;color:#78350f;letter-spacing:2px;text-transform:uppercase">⚠️ Three steps to add a bid</div>

  <div style="margin-top:14px;display:block">
    <div style="background:#ffffff;border-left:4px solid #1a365d;padding:14px 16px;margin-bottom:10px;border-radius:0 6px 6px 0">
      <div style="font-size:11px;color:#1a365d;letter-spacing:1px;text-transform:uppercase;font-weight:700">🔗 Step 1 - Bonfire</div>
      <div style="font-size:13px;color:#1f2937;margin-top:4px">Click the <strong>Bonfire</strong> button on the bid card. Login with the right account (Colaberry-only via vendor.bonfirehub.com, or Que's for joint bids). <strong>Download the RFP zip.</strong></div>
    </div>
    <div style="background:#ffffff;border-left:4px solid #7c3aed;padding:14px 16px;margin-bottom:10px;border-radius:0 6px 6px 0">
      <div style="font-size:11px;color:#5b21b6;letter-spacing:1px;text-transform:uppercase;font-weight:700">📂 Step 2 - Opp Pulse</div>
      <div style="font-size:13px;color:#1f2937;margin-top:4px">Click the <strong>Opp Pulse</strong> button. Upload <strong>both</strong> the RFP zip AND a screenshot of the Bonfire opportunity page to the Documents section of that opportunity. <strong style="color:#7f1d1d">In Opp Pulse, not Basecamp.</strong></div>
    </div>
    <div style="background:#ffffff;border-left:4px solid #16a34a;padding:14px 16px;border-radius:0 6px 6px 0">
      <div style="font-size:11px;color:#166534;letter-spacing:1px;text-transform:uppercase;font-weight:700">✅ Step 3 - Reply here</div>
      <div style="font-size:13px;color:#1f2937;margin-top:4px">Reply on this thread: <code style="background:#dcfce7;padding:2px 6px;border-radius:3px;font-weight:700">@CB add bids 1, 3, 5</code> (or whichever numbers you uploaded). I'll create the Basecamp project in Gov Contracts, generate + populate all 14 tasks from the RFP, back-distribute due dates from the deadline, score feasibility, and the AI starts on the AI-doable tasks immediately.</div>
    </div>
  </div>

  <div style="margin-top:16px;padding:14px 16px;background:#dcfce7;border-radius:6px;font-size:13px;color:#14532d;line-height:1.6">
    🎯 <strong>End state:</strong> the contract is now tracked by the Gov Contracts process and shows up in your daily Gov Contracts report moving forward. Per-bid next human step, feasibility score, AI progress, due dates - all surfaced automatically.
  </div>

  <div style="margin-top:12px;font-size:12px;color:#78350f;font-weight:700;text-align:center">
    🚫 I cannot add a bid until Steps 1 + 2 are complete - the zip and screenshot in Opp Pulse are how I generate the per-bid task descriptions.
  </div>
</div>

<div style="margin-top:18px;padding:10px 14px;text-align:center;font-size:11px;color:#94a3b8;line-height:1.6">
  Source: Opportunity Pulse strategic feed &middot; cached ${(allOpps.data?.[0]?.enrichedAt || '').slice(0, 10) || 'recently'} &middot; ${active.length} active in 10-365d window<br>
  <a href="http://95.216.199.47/admin/bonfire/strategic" style="color:#94a3b8">95.216.199.47/admin/bonfire/strategic</a> &middot; Bonfire account routing per the gov-bid-account-routing rule
</div>

</div>`;

  console.log(`[v3] new content length: ${html.length} chars`);
  const cur = await (await fetch(`${BASE}/buckets/${GOV_BUCKET}/messages/${MSG_ID}.json`, { headers: H })).json();
  const r = await fetch(`${BASE}/buckets/${GOV_BUCKET}/messages/${MSG_ID}.json`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ subject: cur.subject, content: html }),
  });
  console.log(`  status: ${r.status}`);
  if (!r.ok) { console.error('PUT failed:', await r.text()); process.exit(1); }
  console.log(`  done: ${(await r.json()).app_url}`);

  // Capture preview screenshot
  const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
  const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/2026-06-01-gov-bids-v3');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wrapped = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif}</style></head><body>${html}</body></html>`;
  const tmpPath = path.join(OUT_DIR, 'preview.html');
  fs.writeFileSync(tmpPath, wrapped);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await ctx.newPage();
  await page.goto('file:///' + tmpPath.replace(/\\/g, '/'));
  await page.waitForLoadState('domcontentloaded');
  const shotPath = path.join(OUT_DIR, 'gov-bids-v3-full.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  await browser.close();
  console.log(`  screenshot: ${shotPath}`);

  // Email Ali
  const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
  const buf = fs.readFileSync(shotPath);
  const b64 = buf.toString('base64');
  const emailHtml = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">
<div style="background:#0f172a;color:white;padding:22px 28px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">V3 preview</div>
<div style="font-size:20px;font-weight:700;margin-top:4px">Gov Bids post - 10-day filter + Bonfire-then-OppPulse + tracked-in-Gov-process end state</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">Live message updated in place: <a href="https://app.basecamp.com/3945211/buckets/47346103/messages/9950817863" style="color:#fbbf24">refresh the MB post</a>.</div>
</div>
<div style="padding:18px 28px">
<img src="data:image/png;base64,${b64}" style="display:block;max-width:100%;border:1px solid #cbd5e1;border-radius:6px" alt="Gov Bids v3">
</div>
<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569;line-height:1.65">
<strong>V3 changes:</strong>
<ul style="margin-top:6px">
<li>Filter: bids must be 10-365 days out. Rush jobs (under 10 days) and obvious 2035/2037 data errors excluded. 30 active in the window today.</li>
<li>Per-card buttons now in workflow order: Step 1 navy = Bonfire (download), Step 2 purple = Opp Pulse (upload zip + screenshot).</li>
<li>Footer rewritten as 3 numbered steps in colored cards (navy/purple/green), each tied to the matching button color.</li>
<li>New green "End state" callout: "the contract is now tracked by the Gov Contracts process and shows up in your daily report moving forward."</li>
<li>Hard-stop line still at the bottom.</li>
</ul>
</div>
</div></body></html>`;
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r2 = await transport.sendMail({
    from: '"Claude Code (on behalf of Ali)" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com'],
    subject: '[Preview V3] Gov Bids post - 10-day filter + workflow-ordered buttons',
    text: 'V3 preview of the gov bids MB post. Live message updated. See HTML for inline screenshot.',
    html: emailHtml,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log(`  email: ${r2.messageId}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
