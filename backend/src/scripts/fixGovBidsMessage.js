#!/usr/bin/env node
// Edit the CB-generated MB UPDATE on Gov Contracts (msg 9950817863) to the
// new format per Ali 2026-06-01:
//   - Short intro
//   - Most of the content = the 5 actual top opportunities (title, agency,
//     deadline, ai category, summary, Opp Pulse + Bonfire links)
//   - Tight footer: extremely clear about upload location
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

function fmtDate(iso) { return (iso || '').slice(0, 10); }
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

(async () => {
  const allOpps = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/op-pulse/all-opps.json'), 'utf8'));
  const active = (allOpps.data || []).filter((o) => o.closeDate && new Date(o.closeDate) > new Date(TODAY));
  const top = active.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)).slice(0, COUNT);

  const cards = top.map((o, i) => {
    const oppPulseUrl = `https://op.colaberry.ai/admin/bonfire/${o.id}/submission-readiness`;
    const bonfireUrl = o.sourceUrl || '';
    const signals = (o.signals || []).join(' &middot; ');
    const summary = o.rawText && o.rawText !== o.title ? o.rawText : (o.description || '');
    const valueStr = fmtMoney(o.estimatedValue);
    return `<div style="border:1px solid #cbd5e0;border-radius:6px;padding:14px 16px;margin-top:12px;background:#ffffff">
<div style="font-size:11px;color:#64748b;letter-spacing:1px;text-transform:uppercase;font-weight:700">Bid ${i + 1} of ${COUNT}</div>
<div style="font-size:15px;font-weight:700;color:#1a365d;margin-top:4px">${escape(o.title)}</div>
<div style="font-size:12px;color:#475569;margin-top:4px"><strong>${escape(o.agency || '')}</strong> &middot; Deadline <strong>${fmtDate(o.closeDate)}</strong>${valueStr ? ` &middot; Est value ${valueStr}` : ''}</div>
<div style="font-size:11px;color:#475569;margin-top:4px">Category: <strong>${escape(o.aiCategory || '-')}</strong> &middot; Recommended product: <strong>${escape(o.recommendedProduct || '-')}</strong></div>
<div style="font-size:11px;color:#475569;margin-top:4px">Scores: priority <strong>${o.priorityScore || '?'}</strong> &middot; fit <strong>${o.fitScore || '?'}</strong> &middot; automation <strong>${o.automationPotential || '?'}</strong>${signals ? ` &middot; ${signals}` : ''}</div>
${summary ? `<div style="font-size:12px;color:#1f2937;margin-top:8px;font-style:italic">${escape(summary).slice(0, 280)}</div>` : ''}
<div style="margin-top:10px;font-size:12px"><a href="${oppPulseUrl}" style="color:#1a365d;text-decoration:underline">Opp Pulse readiness &rarr;</a> &middot; <a href="${bonfireUrl}" style="color:#1a365d;text-decoration:underline">Bonfire opportunity &rarr;</a></div>
</div>`;
  }).join('');

  const html = `<div>Top ${COUNT} active opportunities from Opportunity Pulse, ranked by priority score.</div>
${cards}

<div style="margin-top:18px;padding:14px 16px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 6px 6px 0">
<div style="font-size:12px;font-weight:700;color:#78350f;letter-spacing:1px;text-transform:uppercase">Before I can add these as projects</div>
<div style="font-size:13px;color:#78350f;margin-top:6px">For each bid you want to pursue, do the following <strong>in Opp Pulse</strong>:</div>
<ol style="font-size:13px;color:#1f2937;margin:8px 0 0;padding-left:20px">
<li>Click "Opp Pulse readiness" above to open the per-bid page.</li>
<li>Download the RFP zip from the Bonfire link on that page.</li>
<li>Upload the zip to the <strong>Documents</strong> section of that opportunity in Opp Pulse (NOT to Basecamp - upload in Opp Pulse only).</li>
</ol>
<div style="font-size:13px;color:#1f2937;margin-top:8px">Once the docs are in Opp Pulse, reply to this thread with the bid number(s) you want to add (e.g. "@CB add bids 1, 3, 5") and I will build the per-bid Basecamp project with the 14-task template, due dates back-distributed from the deadline, and feasibility scoring.</div>
<div style="font-size:12px;color:#78350f;margin-top:8px"><strong>I cannot add a bid that does not yet have its documents in Opp Pulse</strong> - the docs are how I generate the per-bid task descriptions.</div>
</div>

<div style="margin-top:12px;font-size:11px;color:#94a3b8">Source: Opportunity Pulse strategic feed (cached ${(allOpps.data?.[0]?.enrichedAt || '').slice(0, 10) || 'recently'}, ${active.length} active total). Bonfire account routing per the gov-bid-account-routing rule. Opp Pulse strategic page: <a href="https://op.colaberry.ai/admin/strategic" style="color:#94a3b8">op.colaberry.ai/admin/strategic</a></div>`;

  console.log(`[fix-gov-bids-msg] Editing msg ${MSG_ID} (was truncated)`);
  console.log(`  new content length: ${html.length} chars`);

  // PUT to update the message. Need to preserve subject + status.
  const cur = await (await fetch(`${BASE}/buckets/${GOV_BUCKET}/messages/${MSG_ID}.json`, { headers: H })).json();
  const r = await fetch(`${BASE}/buckets/${GOV_BUCKET}/messages/${MSG_ID}.json`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ subject: cur.subject, content: html }),
  });
  console.log(`  status: ${r.status}`);
  if (!r.ok) {
    console.error('PUT failed:', await r.text());
    process.exit(1);
  }
  const upd = await r.json();
  console.log(`  done: ${upd.app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
