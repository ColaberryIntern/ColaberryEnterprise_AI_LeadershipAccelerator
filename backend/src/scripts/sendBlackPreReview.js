#!/usr/bin/env node
// Pre-review email for the BLACK intern list (10+ days dark).
// For each BLACK person: name, project, days dark, email, last 3 comments
// from them (when, on what todo, what they said), CCPP InternID (if findable),
// and the exact CLI command to exit them.
//
// Purpose: give Ali enough context in ONE email to approve/skip each BLACK
// person quickly, instead of opening Basecamp + CCPP separately per person.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));
const { buildInternActivity } = require(path.resolve(__dirname, './lib/internActivityTracker'));
const { findInternByQuery, closePool } = require(path.resolve(__dirname, './lib/ccppInternRoster'));

const BC_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
const BUCKET = 24865175;
const BASE = `https://3.basecampapi.com/3945211/buckets/${BUCKET}`;
const H = { Authorization: 'Bearer ' + BC_TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json' };

function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function shortDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function htmlEscape(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function bcGetAll(p) {
  let n = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (n) {
    const r = await fetch(n, { headers: H });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    n = lh ? lh[1] : null;
  }
  return out;
}

async function pullLast3CommentsFromIntern(internId, projects) {
  const all = [];
  for (const p of projects) {
    try {
      const cs = await bcGetAll(`/recordings/${p.todoId}/comments.json`);
      const theirs = cs.filter((c) => c.creator?.id === internId);
      for (const c of theirs) all.push({ at: c.created_at, todoTitle: p.title, text: stripHtml(c.content) });
    } catch (_e) {}
  }
  all.sort((a, b) => b.at.localeCompare(a.at));
  return all.slice(0, 3);
}

(async () => {
  const rows = await buildInternActivity({ lookbackDays: 30, includeCompleted: false });
  const black = rows.filter((r) => r.level === 'BLACK');
  if (black.length === 0) {
    console.log('No BLACK people. Skipping.');
    return;
  }
  console.log(`Pre-reviewing ${black.length} BLACK people...`);

  // Enrich each with: last 3 comments + CCPP candidate(s)
  for (const r of black) {
    r.lastComments = await pullLast3CommentsFromIntern(r.internId, r.projects);
    try {
      const candidates = await findInternByQuery(r.name);
      r.ccppMatches = candidates.slice(0, 3); // top 3
    } catch (e) { r.ccppMatches = []; }
  }

  const card = (r) => {
    const top = r.ccppMatches?.[0];
    const internIdStr = top ? `<strong>${top.InternID}</strong>` : '<em style="color:#94a3b8">no exact CCPP match - tag @CB exit intern to disambiguate</em>';
    const ccppActive = top ? (top.isActive ? `<span style="color:#166534;font-weight:700">active</span>` : `<span style="color:#991b1b;font-weight:700">already inactive</span>`) : '';
    const otherMatches = (r.ccppMatches || []).slice(1).map((m) => `${stripEmDashes(m.name)} (#${m.InternID})`).join(', ');
    const recentBlock = r.lastComments.length === 0
      ? '<div style="color:#94a3b8;font-style:italic;font-size:12px">No comments from them found in any project. They may have never engaged.</div>'
      : `<ul style="margin:6px 0 0 18px;padding:0;font-size:12px;color:#475569">${r.lastComments.map((c) => `<li style="margin-bottom:6px"><strong>${shortDate(c.at)}</strong> on <em>${htmlEscape(stripEmDashes(c.todoTitle).slice(0, 50))}</em>: ${htmlEscape(stripEmDashes(c.text).slice(0, 250))}</li>`).join('')}</ul>`;
    const projectsLine = r.projects.map((p) => `<a href="${p.appUrl}" style="color:#2b6cb0;text-decoration:none">${htmlEscape(stripEmDashes(p.title))}</a>`).join(' &middot; ');
    const cli = top
      ? `node backend/src/scripts/confirmInternExit.js --intern-id ${top.InternID} --reason nochow --confirmed-by ali`
      : `# first run: tag @CB System exit intern ${r.name} reason=nochow to get InternID`;
    return `
<div style="background:white;border:1px solid #1c1917;border-radius:6px;padding:18px;margin-bottom:14px">
  <div style="display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:10px">
    <div>
      <div style="font-size:16px;font-weight:700;color:#1a365d">${htmlEscape(stripEmDashes(r.name))}</div>
      <div style="font-size:11px;color:#64748b">${htmlEscape(r.email || 'no email on file')}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:800;color:#dc2626">${r.daysSinceLast}</div>
      <div style="font-size:10px;color:#64748b;letter-spacing:1px;text-transform:uppercase">days dark</div>
    </div>
  </div>
  <table cellpadding="4" cellspacing="0" border="0" style="font-size:12px;width:100%">
    <tr><td style="vertical-align:top;color:#64748b;width:140px"><strong>Project(s)</strong></td><td style="vertical-align:top">${projectsLine}</td></tr>
    <tr><td style="vertical-align:top;color:#64748b"><strong>Last activity</strong></td><td style="vertical-align:top">${r.lastActivityAt ? shortDate(r.lastActivityAt) : 'never'}</td></tr>
    <tr><td style="vertical-align:top;color:#64748b"><strong>CCPP InternID</strong></td><td style="vertical-align:top">${internIdStr} ${ccppActive}${otherMatches ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">other matches: ${otherMatches}</div>` : ''}</td></tr>
    <tr><td style="vertical-align:top;color:#64748b"><strong>Last 3 from them</strong></td><td style="vertical-align:top">${recentBlock}</td></tr>
  </table>
  <div style="margin-top:12px;padding:10px;background:#fef2f2;border-radius:4px">
    <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#991b1b;font-weight:700">Exit command</div>
    <div style="font-family:monospace;font-size:11px;color:#1a202c;margin-top:4px;word-break:break-all">${cli}</div>
  </div>
</div>`;
  };

  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:740px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:#1c1917;color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">BLACK list pre-review</div>
<div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">${black.length} interns at day 10+</div>
</div>

<div style="background:#1a365d;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, here is the full picture on each BLACK person, so you can decide approve or skip in one pass before flipping nudges to live mode. Each card: their last activity, the CCPP InternID match (so you do not have to look it up), their last 3 comments (when, where, what they actually said), and the exact CLI command pre-filled with their InternID.</div>
</div>

<div style="padding:24px 32px;background:#f8fafc">

${black.map(card).join('')}

<div style="background:white;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:18px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">Workflow</div>
<ol style="font-size:13px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li>Read each card. Decide approve or skip. Some BLACK people may be on a known break or a sabbatical you approved.</li>
<li>For each "approve": run the inlined CLI command on the VPS. It will preview, ask you to type EXIT-CONFIRM-&lt;N&gt;, then write to CCPP + Basecamp.</li>
<li>If you would rather drive from Basecamp: tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System exit intern &lt;name&gt; reason=nochow</code> in any thread to get the preview without the CLI.</li>
<li>Once the BLACK list is processed, tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System set intern nudge mode live</code> to enable daily nudges.</li>
</ol>
</div>

</div>
</div>
</body></html>`;

  const text = `Ali, BLACK list pre-review - ${black.length} interns at day 10+.\n\n` +
    black.map((r, i) => {
      const top = r.ccppMatches?.[0];
      const lastBlock = r.lastComments.length === 0 ? '  - no comments from them found\n' : r.lastComments.map((c) => `  - ${shortDate(c.at)} on "${stripEmDashes(c.todoTitle).slice(0, 50)}": ${stripEmDashes(c.text).slice(0, 200)}`).join('\n') + '\n';
      const cli = top ? `node backend/src/scripts/confirmInternExit.js --intern-id ${top.InternID} --reason nochow --confirmed-by ali` : `tag @CB System exit intern ${r.name} reason=nochow first to get InternID`;
      return `\n${i + 1}. ${r.name} (${r.email || 'no email'}) - ${r.daysSinceLast} days dark
   project: ${r.projects.map((p) => p.title).join(', ')}
   CCPP: ${top ? `#${top.InternID} (${top.isActive ? 'active' : 'already inactive'})` : 'no exact match'}
   last 3:
${lastBlock}   CLI: ${cli}\n`;
    }).join('') +
    `\nWorkflow:\n  1. Decide approve/skip per card\n  2. Run CLI per approval, or tag @CB System exit intern <name> reason=nochow for preview\n  3. After processing: tag @CB System set intern nudge mode live\n`;

  validateBeforeSend(stripEmDashes(html), stripEmDashes(text));
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: 'alimuwwakkil@gmail.com',
    subject: `[Action Required] BLACK pre-review - ${black.length} interns ready for exit decision`,
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  console.log('Sent:', r.messageId);
  try { await closePool(); } catch (_e) {}
})().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
