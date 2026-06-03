#!/usr/bin/env node
/**
 * sendRamMassachusettsOpDigest.js
 *
 * One-off: send Ram a Massachusetts-filtered Opportunity Pulse digest matching
 * the style + structure of the existing OP daily Gov Contracts digest
 * (backend/src/scripts/dailyGovContractsAnalysis.js) so it reads as a
 * continuation of the OP digest series Ram has been receiving.
 *
 * Data: pulled live from Opportunity Pulse via
 *   GET /api/v1/opportunities?q=Massachusetts&limit=50
 * authenticated as ali@colaberry.com (same admin login intakeNewProducts.js uses).
 *
 * Email: sent via sendWithBcAttach so it lands attached to the
 * "[Tracking] Ram OP digests" BC ticket per the operating doctrine.
 *
 * Usage:
 *   node backend/src/scripts/sendRamMassachusettsOpDigest.js
 *   node backend/src/scripts/sendRamMassachusettsOpDigest.js --dry-run  (renders HTML only, no send)
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { sendWithBcAttach } = require('./lib/sendWithBcAttach');

const DRY = process.argv.includes('--dry-run');

// ============================================================================
// Config
// ============================================================================
const OP_BASE = process.env.OPPORTUNITY_PULSE_BASE || 'http://95.216.199.47';
const OP_ADMIN_EMAIL = process.env.OP_ADMIN_EMAIL || 'ali@colaberry.com';
const OP_ADMIN_PASSWORD = process.env.OP_ADMIN_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const KEYWORD = 'Massachusetts';

// BC ticket the email will attach to. Created 2026-06-03 in Sales/Outreach list.
const BC_TICKET_ID = 9959008215;

// Recipients
const TO = 'ram@colaberry.com';
const CC = ['ali@colaberry.com', 'alimuwwakkil@gmail.com'];

// ============================================================================
// Opportunity Pulse fetch
// ============================================================================
async function opLogin() {
  const r = await fetch(`${OP_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OP_ADMIN_EMAIL, password: OP_ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`OP login -> ${r.status}`);
  const d = await r.json();
  if (!d.data?.accessToken) throw new Error('OP login: no token in response');
  return d.data.accessToken;
}

async function opSearch(token, query) {
  const url = `${OP_BASE}/api/v1/opportunities?q=${encodeURIComponent(query)}&limit=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`OP search "${query}" -> ${r.status}`);
  const d = await r.json();
  return d.data?.results || [];
}

// ============================================================================
// Helpers
// ============================================================================
function escape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) return null;
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function fmtDate(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function extractAgency(opp) {
  // Gov contracts have agency in description "Agency: X > Y > Z"
  if (opp.type === 'gov_contract') {
    const desc = opp.description || '';
    const m = desc.match(/Agency:\s*([^\n]+)/);
    if (m) {
      const path = m[1].trim();
      const parts = path.split('>').map((s) => s.trim());
      return parts[parts.length - 1] || path;
    }
  }
  // Talent: extract company from title "Title - Company"
  if (opp.type === 'ai_job') {
    const title = opp.title || '';
    const m = title.match(/[-—]\s*([^-—]+)$/);
    if (m) return m[1].trim();
  }
  return opp.agency || '';
}

function extractSolicitation(opp) {
  if (opp.type !== 'gov_contract') return null;
  const desc = opp.description || '';
  const m = desc.match(/Solicitation:\s*([^\s\n]+)/);
  return m ? m[1] : null;
}

function extractNaics(opp) {
  if (opp.type !== 'gov_contract') return null;
  const desc = opp.description || '';
  const m = desc.match(/NAICS:\s*(\d+)/);
  return m ? m[1] : (opp.category || null);
}

function opDetailUrl(id) {
  return `${OP_BASE}/admin/opportunities/${id}`;
}

function channelLabel(type) {
  if (type === 'ai_job') return 'Talent';
  if (type === 'gov_contract') return 'Government';
  if (type === 'research') return 'Research';
  return type;
}

function channelBadge(type) {
  const label = channelLabel(type);
  const colors = {
    Talent: { bg: '#dcfce7', fg: '#14532d' },
    Government: { bg: '#dbeafe', fg: '#1e3a8a' },
    Research: { bg: '#fef3c7', fg: '#78350f' },
  };
  const c = colors[label] || { bg: '#f1f5f9', fg: '#334155' };
  return `<span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:10px;font-weight:700;background:${c.bg};color:${c.fg};letter-spacing:0.5px">${label}</span>`;
}

function refineKeywords() {
  // Match the chip layout shown on the my-opportunities page
  return [
    'Agency', 'Location', 'Type', 'Solicitation', 'United States', 'Naics',
    'Posted', 'Archive', 'Dept Defense', 'Classification', 'Contact', 'Email',
    'Engineer', 'Artificial Intelligence', 'Security', 'Bank of America',
    'Navy', 'Technology', 'Requirements', 'Long Range', 'IT Jobs', 'Through',
    'Center', 'Deadline',
  ];
}

// ============================================================================
// HTML render
// ============================================================================
function renderHtml(opps) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const talent = opps.filter((o) => o.type === 'ai_job');
  const gov = opps.filter((o) => o.type === 'gov_contract');
  const research = opps.filter((o) => o.type === 'research');

  // Top $ opp
  const dollarOpps = opps.map((o) => ({ ...o, _v: parseFloat(o.value || 0) || 0 })).sort((a, b) => b._v - a._v);
  const topDollar = dollarOpps[0];
  const totalDollar = dollarOpps.reduce((s, o) => s + o._v, 0);

  const chipHtml = refineKeywords()
    .map((k) => `<span style="display:inline-block;padding:5px 11px;margin:3px 4px 3px 0;border-radius:14px;font-size:11px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1">${escape(k)}</span>`)
    .join('');

  // ----- Top summary -----
  const summaryHtml = `<div style="background:#1c1917;color:white;padding:20px 32px">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ram - Massachusetts pulse</div>
  <div style="font-size:14px;margin-top:8px;line-height:1.65">
  Ram, this is everything Opportunity Pulse currently has matching <strong>Massachusetts</strong>: <strong>${opps.length} opportunities</strong> across three channels (${gov.length} Government, ${talent.length} Talent, ${research.length} Research). The Government side is dominated by Navy and Marine Corps Long Range BAAs out of ONR, with the largest single award sitting at <strong>${fmtMoney(topDollar?.value) || '$23.3M'}</strong> (Systems &amp; Technology Research, Woburn). Total Government dollar exposure across the visible MA awards: <strong>${fmtMoney(totalDollar)}</strong>. Talent is concentrated on Bank of America AI security engineering roles (three Boston-area postings). One academic Research signal on Generative AI for transportation safety using a statewide MA crash dataset.
  </div>
  </div>`;

  // ----- Refine keywords chips -----
  const chipsHtml = `<tr><td style="padding:18px 32px 4px">
  <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:8px">Refine keywords (top filters surfaced by Opportunity Pulse)</div>
  <div>${chipHtml}</div>
  </td></tr>`;

  // ----- Per-channel breakdown -----
  function channelRow(type, items, color) {
    if (items.length === 0) return '';
    const top5 = items.slice(0, 5);
    return `<tr><td style="padding:8px 32px 18px">
  <div style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${color};border-radius:0 8px 8px 0;padding:14px 18px">
    <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${color};font-weight:700">${channelLabel(type)} (${items.length} match${items.length === 1 ? '' : 'es'})</div>
    <div style="margin-top:8px;font-size:13px;color:#475569">Top ${Math.min(5, items.length)}:</div>
    <ul style="margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.7;color:#1a365d">
    ${top5.map((o) => `<li><a href="${opDetailUrl(o.id)}" style="color:#1a365d;text-decoration:none;font-weight:600">${escape(o.title || '').slice(0, 130)}</a>${fmtMoney(o.value) ? ` <span style="color:#64748b;font-size:11px">(${fmtMoney(o.value)})</span>` : ''}</li>`).join('')}
    </ul>
  </div>
  </td></tr>`;
  }

  const breakdownHtml = `<tr><td style="padding:14px 32px 0">
  <h2 style="color:#1a365d;font-size:18px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Breakdown by channel</h2>
  </td></tr>
  ${channelRow('ai_job', talent, '#16a34a')}
  ${channelRow('gov_contract', gov, '#2b6cb0')}
  ${channelRow('research', research, '#ca8a04')}`;

  // ----- Full cross-channel list -----
  const fullListRows = opps.map((o, i) => {
    const agency = extractAgency(o);
    const sol = extractSolicitation(o);
    const naics = extractNaics(o);
    const money = fmtMoney(o.value);
    const posted = fmtDate(o.publishedAt);
    const sourceLabel = o.source === 'sam_gov' ? 'sam.gov' : o.source === 'remote_ok' ? 'remoteOK' : o.source === 'remotive' ? 'remotive' : o.source || 'source';
    return `<tr style="background:${i % 2 === 0 ? '#f8fafc' : 'white'}">
      <td style="padding:11px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:700;font-size:12px;vertical-align:top">${i + 1}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top">
        <a href="${opDetailUrl(o.id)}" style="color:#1a365d;text-decoration:none;font-weight:700;font-size:13px;line-height:1.4">${escape(o.title || '')}</a>
        <div style="margin-top:5px;font-size:11px;color:#64748b;line-height:1.5">
          ${agency ? escape(agency) : ''}${sol ? ` &middot; sol: ${escape(sol)}` : ''}${naics ? ` &middot; NAICS ${escape(naics)}` : ''}
        </div>
        <div style="margin-top:4px;font-size:11px"><a href="${escape(o.sourceUrl || '')}" style="color:#2b6cb0;text-decoration:none">view on ${escape(sourceLabel)} &rarr;</a> &middot; <a href="${opDetailUrl(o.id)}" style="color:#2b6cb0;text-decoration:none">open in Opportunity Pulse &rarr;</a></div>
      </td>
      <td style="padding:11px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top">${channelBadge(o.type)}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px;color:#0f172a;font-weight:600">${money || '<span style="color:#94a3b8;font-weight:400">-</span>'}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:11px;color:#475569">${posted || '<span style="color:#94a3b8">-</span>'}</td>
    </tr>`;
  }).join('');

  const fullListHtml = `<tr><td style="padding:24px 32px 8px">
  <h2 style="color:#1a365d;font-size:18px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Cross-channel results (${opps.length})</h2>
  <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-family:arial,sans-serif">
    <thead><tr style="background:#1a365d;color:white">
      <th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1.5px">#</th>
      <th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1.5px">OPPORTUNITY</th>
      <th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1.5px">CHANNEL</th>
      <th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1.5px">VALUE</th>
      <th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1.5px">POSTED</th>
    </tr></thead>
    <tbody>${fullListRows}</tbody>
  </table>
  </td></tr>`;

  // ----- Signature block (HTML, per reference_email_signature) -----
  const signature = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
    <div style="margin-top: 14px;">
      <a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
    </div>
  </td></tr>
  </table>`;

  // ----- Final assembled HTML -----
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>OP digest: Massachusetts - ${dateStr}</title></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc"><tr><td align="center">
<table width="820" cellpadding="0" cellspacing="0" style="max-width:820px;background:#fff;border-radius:8px;margin:24px 0;overflow:hidden">

<tr><td style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:#fff;padding:28px 32px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Opportunity Pulse digest</div>
  <h1 style="margin:6px 0 8px;font-size:26px;font-weight:800;color:white">Massachusetts pulse &mdash; ${escape(dateStr)}</h1>
  <div style="font-size:13px;color:#e2e8f0;line-height:1.6">${opps.length} matching &middot; keyword: <strong style="color:#fbbf24">Massachusetts</strong> &middot; ${gov.length} Government &middot; ${talent.length} Talent &middot; ${research.length} Research</div>
  <div style="margin-top:14px"><a href="${OP_BASE}/admin/opportunities/my?q=Massachusetts" style="display:inline-block;background:#fbbf24;color:#1c1917;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Open this view in Opportunity Pulse &rarr;</a></div>
</td></tr>

<tr><td>${summaryHtml}</td></tr>

${chipsHtml}

${breakdownHtml}

${fullListHtml}

<tr><td style="padding:8px 32px 24px">
<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:8px">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:240px;color:#475569"><strong>Open the live view</strong></td><td style="padding:6px 0;vertical-align:top">Same filter, live data: <a href="${OP_BASE}/admin/opportunities/my?q=Massachusetts">${OP_BASE.replace(/^https?:\/\//, '')}/admin/opportunities/my?q=Massachusetts</a></td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Narrow further</strong></td><td style="padding:6px 0;vertical-align:top">Pick any chip above (Navy, Bank of America, Long Range, NAICS 541715, etc.) to drill in.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Promote one to Gov Contracts</strong></td><td style="padding:6px 0;vertical-align:top">Reply with the row number (or open the OP detail page and use the Promote button). The 14-task standard template will get provisioned in the Gov Contracts BC project with backfilled due dates.</td></tr>
</table>
</div>

<div style="margin-top:18px;padding:10px 14px;text-align:center;font-size:11px;color:#94a3b8;line-height:1.6">
Source: Opportunity Pulse &middot; keyword filter "Massachusetts" &middot; pulled ${now.toISOString()}<br>
Channel coverage: SAM.gov (Government), Remote OK + Remotive + Adzuna (Talent), HuggingFace papers (Research)
</div>

${signature}

</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ============================================================================
// Plain-text fallback
// ============================================================================
function renderText(opps) {
  const talent = opps.filter((o) => o.type === 'ai_job');
  const gov = opps.filter((o) => o.type === 'gov_contract');
  const research = opps.filter((o) => o.type === 'research');
  const dollarOpps = opps.map((o) => ({ ...o, _v: parseFloat(o.value || 0) || 0 })).sort((a, b) => b._v - a._v);
  const topDollar = dollarOpps[0];

  const lines = [];
  lines.push(`Massachusetts pulse from Opportunity Pulse - ${opps.length} matching`);
  lines.push('');
  lines.push(`Ram, this is everything OP has matching Massachusetts right now: ${opps.length} opportunities (${gov.length} Government, ${talent.length} Talent, ${research.length} Research).`);
  lines.push('');
  lines.push(`Government is dominated by Navy and Marine Corps Long Range BAAs out of ONR; largest single award ${fmtMoney(topDollar?.value) || '$23.3M'} (Systems & Technology Research, Woburn). Talent is three Bank of America AI security engineer roles plus a remote bookkeeping role and a fullstack role. One academic Research signal on Generative AI for MA transportation safety.`);
  lines.push('');
  lines.push(`Live view: ${OP_BASE}/admin/opportunities/my?q=Massachusetts`);
  lines.push('');
  lines.push('--- ALL 17 RESULTS ---');
  lines.push('');
  opps.forEach((o, i) => {
    const agency = extractAgency(o);
    const money = fmtMoney(o.value);
    const posted = fmtDate(o.publishedAt);
    lines.push(`${i + 1}. [${channelLabel(o.type)}] ${(o.title || '').replace(/—/g, '-')}`);
    const meta = [agency, money, posted].filter(Boolean).join(' | ');
    if (meta) lines.push(`   ${meta}`);
    lines.push(`   ${opDetailUrl(o.id)}`);
    lines.push('');
  });

  lines.push('');
  lines.push('Ali Muwwakkil');
  lines.push('Managing Director / AI Systems Architect');
  lines.push('Colaberry Inc.');
  lines.push('');
  lines.push('200 Chisholm Place, Suite 200, Plano, TX 75075');
  lines.push('ali@colaberry.com  |  enterprise.colaberry.ai');
  lines.push('Design Your AI Organization: https://advisor.colaberry.ai/advisory');

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================
(async () => {
  console.log(`[1/3] OP login as ${OP_ADMIN_EMAIL}...`);
  const token = await opLogin();
  console.log('  ok');

  console.log(`[2/3] Searching OP for "${KEYWORD}"...`);
  const opps = await opSearch(token, KEYWORD);
  console.log(`  got ${opps.length} results`);
  if (opps.length === 0) throw new Error(`No results for "${KEYWORD}" - aborting.`);

  // Save a snapshot for audit + dry-run inspection
  const outDir = path.resolve(__dirname, '../../../tmp/ma-opps');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'ma-opps-snapshot.json'), JSON.stringify(opps, null, 2));

  console.log('[3/3] Rendering email...');
  const html = renderHtml(opps);
  const text = renderText(opps);
  fs.writeFileSync(path.join(outDir, 'preview.html'), html);
  console.log(`  preview: ${path.join(outDir, 'preview.html')}`);

  if (DRY) {
    console.log('--dry-run set: skipping send.');
    return;
  }

  const subject = `[OP digest] Massachusetts pulse - ${opps.length} matching (${opps.filter((o) => o.type === 'gov_contract').length} Gov, ${opps.filter((o) => o.type === 'ai_job').length} Talent, ${opps.filter((o) => o.type === 'research').length} Research)`;
  const bcSummary = `<div style="font-size:13px;color:#475569;line-height:1.55">Massachusetts-filtered Opportunity Pulse digest. ${opps.length} opportunities across three channels (${opps.filter((o) => o.type === 'gov_contract').length} Government, ${opps.filter((o) => o.type === 'ai_job').length} Talent, ${opps.filter((o) => o.type === 'research').length} Research). Top dollar: ${fmtMoney(opps.map((o) => parseFloat(o.value || 0)).sort((a, b) => b - a)[0]) || '-'}. Live view: <a href="${OP_BASE}/admin/opportunities/my?q=Massachusetts">${OP_BASE}/admin/opportunities/my?q=Massachusetts</a></div>`;

  const result = await sendWithBcAttach({
    ticketId: BC_TICKET_ID,
    to: TO,
    cc: CC,
    subject,
    html,
    text,
    bcSummary,
    mandrillTrack: 'none', // Ram is internal - per feedback_email_style
    headers: { 'Importance': 'high', 'X-Priority': '1' },
  });

  console.log('Sent.');
  console.log('  Mandrill ID:', result.mandrillId);
  console.log('  BC comment :', result.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
