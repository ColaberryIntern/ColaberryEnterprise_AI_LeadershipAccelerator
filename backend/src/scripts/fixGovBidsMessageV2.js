#!/usr/bin/env node
// V2: Re-render msg 9950817863 with breathing room + emojis per Ali 2026-06-01.
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
const TODAY = '2026-06-01';

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
  const today = new Date(TODAY);
  return Math.round((d - today) / 86400000);
}
function urgencyEmoji(days) {
  if (days == null) return '';
  if (days <= 3) return '🔥';
  if (days <= 14) return '⏰';
  return '📅';
}

(async () => {
  const allOpps = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/op-pulse/all-opps.json'), 'utf8'));
  const active = (allOpps.data || []).filter((o) => o.closeDate && new Date(o.closeDate) > new Date(TODAY));
  const top = active.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)).slice(0, COUNT);

  const cards = top.map((o, i) => {
    const oppPulseUrl = `https://op.colaberry.ai/admin/bonfire/${o.id}/submission-readiness`;
    const bonfireUrl = o.sourceUrl || '';
    const signals = (o.signals || []).filter(s => s && s.length).slice(0, 3).join(' &middot; ');
    const summary = o.rawText && o.rawText !== o.title ? o.rawText : (o.description || '');
    const valueStr = fmtMoney(o.estimatedValue);
    const days = daysUntil(o.closeDate);
    const dueLabel = days != null ? (days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'today' : `in ${days}d`) : '';
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

  ${summary ? `
  <div style="margin-top:16px;padding:12px 14px;background:#f8fafc;border-radius:6px;font-size:13px;color:#1f2937;font-style:italic;line-height:1.5">
    "${escape(summary).slice(0, 280)}${summary.length > 280 ? '...' : ''}"
  </div>` : ''}

  <div style="margin-top:18px;display:block">
    <a href="${oppPulseUrl}" style="display:inline-block;background:#1a365d;color:white;padding:9px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;margin-right:8px">📂 Opp Pulse readiness &rarr;</a>
    <a href="${bonfireUrl}" style="display:inline-block;background:#ffffff;color:#1a365d;padding:9px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:1.5px solid #1a365d">🔗 Bonfire opportunity &rarr;</a>
  </div>

</div>`;
  }).join('');

  const html = `<div style="font-size:14px;color:#1a202c;line-height:1.6">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:white;padding:22px 24px;border-radius:10px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">🎯 Top ${COUNT} active opportunities</div>
  <div style="font-size:18px;font-weight:700;margin-top:6px">From Opportunity Pulse, ranked by priority score</div>
  <div style="font-size:13px;color:#cbd5e0;margin-top:6px">${active.length} active total in the strategic feed. Showing the ${COUNT} highest-priority below.</div>
</div>

${cards}

<div style="margin-top:32px;padding:20px 22px;background:#fffbeb;border:2px solid #f59e0b;border-radius:10px">

  <div style="font-size:12px;font-weight:700;color:#78350f;letter-spacing:2px;text-transform:uppercase">⚠️ Before I can add these as projects</div>

  <div style="font-size:14px;color:#78350f;margin-top:10px;font-weight:600">For each bid you want to pursue, do this in Opp Pulse:</div>

  <ol style="font-size:13px;color:#1f2937;margin:14px 0 0;padding-left:24px;line-height:1.9">
    <li>📂 Click the <strong>Opp Pulse readiness</strong> button on the card above to open the per-bid page.</li>
    <li>⬇️ Download the RFP zip from the Bonfire link on that page.</li>
    <li>⬆️ Upload the zip to the <strong>Documents section of that opportunity in Opp Pulse</strong>. <strong style="color:#7f1d1d">NOT to Basecamp.</strong> Upload in Opp Pulse only.</li>
  </ol>

  <div style="margin-top:16px;padding:12px 14px;background:#ffffff;border-radius:6px;border-left:4px solid #f59e0b;font-size:13px;color:#1f2937;line-height:1.6">
    ✅ &nbsp;Once docs are in Opp Pulse, reply on this thread with the bid numbers you want, e.g. <code style="background:#fef3c7;padding:2px 6px;border-radius:3px;font-weight:700">@CB add bids 1, 3, 5</code> - I'll build the Basecamp projects with the 14-task template, due dates back-distributed from the deadline, and feasibility scoring.
  </div>

  <div style="margin-top:12px;font-size:12px;color:#78350f;font-weight:700;text-align:center">
    🚫 I cannot add a bid that does not yet have its documents in Opp Pulse - the docs are how I generate per-bid task descriptions.
  </div>

</div>

<div style="margin-top:18px;padding:10px 14px;text-align:center;font-size:11px;color:#94a3b8;line-height:1.6">
  Source: Opportunity Pulse strategic feed &middot; cached ${(allOpps.data?.[0]?.enrichedAt || '').slice(0, 10) || 'recently'} &middot; ${active.length} active total<br>
  <a href="https://op.colaberry.ai/admin/strategic" style="color:#94a3b8">op.colaberry.ai/admin/strategic</a> &middot; Bonfire account routing per the gov-bid-account-routing rule
</div>

</div>`;

  console.log(`[v2] new content length: ${html.length} chars`);

  const cur = await (await fetch(`${BASE}/buckets/${GOV_BUCKET}/messages/${MSG_ID}.json`, { headers: H })).json();
  const r = await fetch(`${BASE}/buckets/${GOV_BUCKET}/messages/${MSG_ID}.json`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ subject: cur.subject, content: html }),
  });
  console.log(`  status: ${r.status}`);
  if (!r.ok) { console.error('PUT failed:', await r.text()); process.exit(1); }
  console.log(`  done: ${(await r.json()).app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
