#!/usr/bin/env node
// Weekly Intern Activity Report.
// Source: Basecamp project 24865175 (Internship/Apprenticeship Projects).
// For each active intern todo (under Project 1/2/3 todosets), pulls comments
// from the past 7 days, scores activity, asks gpt-4o-mini to summarize the
// week's updates into 1-3 bullets, and emails Ali + posts to a Message Board.
//
// Flags:
//   --dry              build but skip both email and message board post
//   --no-message-board send email only, skip message board
//   --send-test        force email even on a non-Monday (default sends only Mondays unless this flag)
//
// Schedule: Mon 13:00 UTC (= Mon 8:00 CT DST / Mon 7:00 CT standard). Cron
// is unaware of US DST; this drifts by one hour twice a year. We accept that.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const OpenAI = require(path.resolve(__dirname, '../../../node_modules/openai')).default;
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const BC_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const BUCKET = parseInt(process.env.INTERN_REPORT_BUCKET || '24865175', 10);
const TODOSET_IDS = (process.env.INTERN_REPORT_TODOSETS || '4327600402,4327600416,4327600417').split(',').map(s => parseInt(s.trim(), 10));
const MESSAGE_BOARD_ID = parseInt(process.env.INTERN_REPORT_MESSAGE_BOARD || '4450326153', 10); // Sprint Pres / New Project
const BASE = `https://3.basecampapi.com/3945211/buckets/${BUCKET}`;
const H = { Authorization: 'Bearer ' + BC_TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry');
const NO_MB = process.argv.includes('--no-message-board');
const NO_EMAIL = process.argv.includes('--no-email');
const SEND_TEST = process.argv.includes('--send-test');
const WEEK_MS = 7 * 86400 * 1000;
const NOW = Date.now();
const WEEK_START = new Date(NOW - WEEK_MS);

async function bcGet(p) { const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
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
async function bcPost(p, body) {
  if (DRY) { console.log('[dry] POST', p, JSON.stringify(body).slice(0, 200)); return { id: 'dry' }; }
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function shortDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

async function discoverInternTodos() {
  // For each todoset, walk all its todolists, then all their todos.
  // We include both active (not yet completed) and completed todos.
  // Filter to ones with at least one assignee.
  const internProjects = []; // { todoId, title, todolistName, assignees: [...], commentsCount }
  for (const todosetId of TODOSET_IDS) {
    let todolists;
    try { todolists = await bcGet(`/todosets/${todosetId}/todolists.json`); }
    catch (e) { console.error(`todoset ${todosetId}: ${e.message}`); continue; }
    if (!Array.isArray(todolists)) {
      // Some endpoints paginate; fall back to bcGetAll
      todolists = await bcGetAll(`/todosets/${todosetId}/todolists.json`);
    }
    for (const tl of todolists) {
      const active = await bcGetAll(`/todolists/${tl.id}/todos.json`);
      const completed = await bcGetAll(`/todolists/${tl.id}/todos.json?completed=true`);
      for (const t of [...active, ...completed]) {
        const assignees = t.assignees || [];
        if (assignees.length === 0) continue;
        // Skip "Tracking" / "Reference" / "Onboarding" todos by default - they
        // aren't intern projects. Heuristic: skip if title starts with common
        // non-project markers OR todolist looks like setup/onboarding.
        if (/onboarding|orientation|setup\s*tasks/i.test(tl.name || '')) continue;
        internProjects.push({
          todoId: t.id,
          title: stripHtml(t.content || '(untitled)').slice(0, 120),
          todolistName: tl.name,
          assignees,
          commentsCount: t.comments_count || 0,
          appUrl: t.app_url || `https://app.basecamp.com/3945211/buckets/${BUCKET}/todos/${t.id}`,
          status: t.completed ? 'completed' : 'in_progress',
        });
      }
    }
  }
  return internProjects;
}

async function pullWeekComments(todoId) {
  // Comment endpoints don't accept a since filter reliably, so fetch all and filter.
  const all = await bcGetAll(`/recordings/${todoId}/comments.json`);
  const week = all.filter(c => {
    const t = new Date(c.created_at).getTime();
    return t >= WEEK_START.getTime() && t <= NOW;
  });
  return week.map(c => ({
    id: c.id,
    created_at: c.created_at,
    creator_id: c.creator?.id,
    creator_name: c.creator?.name,
    text: stripHtml(c.content || '').slice(0, 1500),
  }));
}

async function buildPerInternRows(projects) {
  // Group by first assignee (Swati's convention).
  const rows = [];
  for (const p of projects) {
    const intern = p.assignees[0];
    if (!intern) continue;
    const week = await pullWeekComments(p.todoId);
    // Count only comments BY the intern (not Ali, not other staff)
    const internComments = week.filter(c => c.creator_id === intern.id);
    rows.push({
      intern: intern.name,
      internId: intern.id,
      project: p.title,
      todolistName: p.todolistName,
      appUrl: p.appUrl,
      status: p.status,
      weekUpdateCount: internComments.length,
      weekUpdates: internComments,
      allWeekComments: week, // includes Ali/staff replies for context
    });
  }
  // If an intern owns multiple projects, keep them as separate rows (Swati does too).
  return rows;
}

async function summarizeWithLLM(rows) {
  // Skip LLM for inactive interns (saves tokens). Only summarize rows that have >=1 update.
  const needSummary = rows.filter(r => r.weekUpdateCount > 0);
  if (needSummary.length === 0) return rows;
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[intern-report] OPENAI_API_KEY not set; skipping LLM summaries.');
    for (const r of rows) r.summaryBullets = r.weekUpdates.slice(0, 3).map(u => stripEmDashes(u.text.slice(0, 180)));
    return rows;
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // Batch: one API call per intern row (parallel, capped concurrency).
  const concurrency = 5;
  let cursor = 0;
  async function worker() {
    while (cursor < needSummary.length) {
      const r = needSummary[cursor++];
      const text = r.weekUpdates.map(u => `[${shortDate(u.created_at)}] ${u.text}`).join('\n---\n');
      try {
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: 'You summarize an intern\'s weekly Basecamp updates into 1-3 short bullet points (max 22 words each). Focus on what they built or shipped. No fluff, no em-dashes. Plain text only. Output one bullet per line, prefix each with "- " (no other formatting).' },
            { role: 'user', content: `Intern: ${r.intern}\nProject: ${r.project}\nUpdates from the past week:\n\n${text}\n\nReturn 1-3 bullets summarizing what they accomplished. Skip the preamble.` },
          ],
        });
        const out = resp.choices?.[0]?.message?.content || '';
        r.summaryBullets = out.split('\n').map(s => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 3).map(stripEmDashes);
      } catch (e) {
        console.error(`LLM fail for ${r.intern}/${r.project}: ${e.message}`);
        r.summaryBullets = r.weekUpdates.slice(0, 3).map(u => stripEmDashes(u.text.slice(0, 180)));
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  // Fill defaults for inactive rows
  for (const r of rows) if (!r.summaryBullets) r.summaryBullets = [];
  return rows;
}

function statusOf(row) {
  if (row.weekUpdateCount === 0) return { label: 'INACTIVE', color: '#991b1b', bg: '#fee2e2' };
  if (row.weekUpdateCount >= 3) return { label: 'STRONG', color: '#166534', bg: '#dcfce7' };
  return { label: 'LIGHT', color: '#9a3412', bg: '#fed7aa' };
}

function buildHtml(rows, dateRangeStr, totals) {
  const sorted = [...rows].sort((a, b) => b.weekUpdateCount - a.weekUpdateCount);
  const strong = sorted.filter(r => r.weekUpdateCount >= 3);
  const light = sorted.filter(r => r.weekUpdateCount > 0 && r.weekUpdateCount < 3);
  const inactive = sorted.filter(r => r.weekUpdateCount === 0);

  const rowHtml = (r) => {
    const s = statusOf(r);
    const bullets = (r.summaryBullets || []).map(b => `<li style="margin-bottom:4px">${stripEmDashes(b).replace(/</g, '&lt;')}</li>`).join('');
    const bulletBlock = bullets
      ? `<ul style="margin:8px 0 0 18px;padding:0;font-size:13px;color:#334155">${bullets}</ul>`
      : `<div style="font-size:12px;color:#94a3b8;font-style:italic;margin-top:6px">No updates posted this week.</div>`;
    return `
<tr style="border-top:1px solid #e2e8f0">
  <td style="padding:14px 12px;vertical-align:top">
    <div style="font-weight:700;color:#1a365d;font-size:14px">${stripEmDashes(r.intern).replace(/</g, '&lt;')}</div>
    <div style="font-size:11px;color:#64748b">${stripEmDashes(r.todolistName || '').replace(/</g, '&lt;')}</div>
  </td>
  <td style="padding:14px 12px;vertical-align:top">
    <a href="${r.appUrl}" style="color:#1a365d;text-decoration:none;font-weight:600;font-size:13px">${stripEmDashes(r.project).replace(/</g, '&lt;')}</a>
    ${bulletBlock}
  </td>
  <td style="padding:14px 12px;vertical-align:top;text-align:center">
    <div style="font-weight:700;font-size:18px;color:#1a365d">${r.weekUpdateCount}</div>
    <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px">updates</div>
  </td>
  <td style="padding:14px 12px;vertical-align:top">
    <span style="display:inline-block;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;letter-spacing:1px;background:${s.bg};color:${s.color}">${s.label}</span>
  </td>
</tr>`;
  };

  const sectionTable = (title, list, accentColor) => list.length === 0 ? '' : `
<h2 style="font-size:16px;color:${accentColor};border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">${title} (${list.length})</h2>
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0">
  <thead style="background:#1a365d;color:white">
    <tr><th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">INTERN</th><th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">PROJECT &amp; SUMMARY</th><th align="center" style="padding:10px 12px;font-size:11px;letter-spacing:1px">CT</th><th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">STATUS</th></tr>
  </thead>
  <tbody>${list.map(rowHtml).join('')}</tbody>
</table>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<div style="max-width:780px;margin:0 auto;background:white;font-family:arial,sans-serif;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:32px 32px 26px">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#bfdbfe;font-weight:700">Intern Activity Report</div>
  <div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">Week of ${dateRangeStr}</div>
  <div style="font-size:14px;color:#cbd5e0;margin-top:6px">${totals.total} intern projects, ${totals.totalUpdates} updates posted this week</div>
</div>

<div style="padding:24px 32px">

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px">
<tr>
  <td style="background:#dcfce7;padding:14px;text-align:center;border-radius:6px;width:33%">
    <div style="font-size:28px;font-weight:800;color:#166534">${strong.length}</div>
    <div style="font-size:11px;color:#166534;letter-spacing:1px;text-transform:uppercase;font-weight:700">Strong (3+)</div>
  </td>
  <td style="width:8px"></td>
  <td style="background:#fed7aa;padding:14px;text-align:center;border-radius:6px;width:33%">
    <div style="font-size:28px;font-weight:800;color:#9a3412">${light.length}</div>
    <div style="font-size:11px;color:#9a3412;letter-spacing:1px;text-transform:uppercase;font-weight:700">Light (1-2)</div>
  </td>
  <td style="width:8px"></td>
  <td style="background:#fee2e2;padding:14px;text-align:center;border-radius:6px;width:33%">
    <div style="font-size:28px;font-weight:800;color:#991b1b">${inactive.length}</div>
    <div style="font-size:11px;color:#991b1b;letter-spacing:1px;text-transform:uppercase;font-weight:700">Inactive (0)</div>
  </td>
</tr>
</table>

${sectionTable('STRONG - delivering this week', strong, '#166534')}
${sectionTable('LIGHT - low activity', light, '#9a3412')}
${sectionTable('INACTIVE - no updates posted', inactive, '#991b1b')}

<div style="margin-top:32px;padding:14px;background:#f8fafc;border-left:4px solid #1a365d;font-size:12px;color:#475569">
  Source: Basecamp Project 24865175 (Internship/Apprenticeship Projects). Activity window: last 7 days. Update count = comments posted by the intern in that window. Bullets summarized by gpt-4o-mini from the intern's own comment text. Generated automatically; flag any errors to Ali.
</div>

</div>
</div>
</body></html>`;
}

function buildText(rows, dateRangeStr, totals) {
  const sorted = [...rows].sort((a, b) => b.weekUpdateCount - a.weekUpdateCount);
  const strong = sorted.filter(r => r.weekUpdateCount >= 3);
  const light = sorted.filter(r => r.weekUpdateCount > 0 && r.weekUpdateCount < 3);
  const inactive = sorted.filter(r => r.weekUpdateCount === 0);
  let out = `INTERN ACTIVITY REPORT - Week of ${dateRangeStr}\n${totals.total} intern projects, ${totals.totalUpdates} updates posted this week.\n\nStrong: ${strong.length}   Light: ${light.length}   Inactive: ${inactive.length}\n\n`;
  const section = (title, list) => {
    if (list.length === 0) return '';
    let s = `${title} (${list.length})\n${'-'.repeat(title.length + 4)}\n`;
    for (const r of list) {
      s += `\n${r.intern} - ${r.project}  [${r.weekUpdateCount} updates]\n`;
      for (const b of (r.summaryBullets || [])) s += `  - ${b}\n`;
      if (r.weekUpdateCount === 0) s += `  (no updates posted this week)\n`;
    }
    return s + '\n';
  };
  out += section('STRONG - delivering this week', strong);
  out += section('LIGHT - low activity', light);
  out += section('INACTIVE - no updates', inactive);
  out += `\nSource: Basecamp 24865175. Window: last 7 days. Generated automatically.\n`;
  return stripEmDashes(out);
}

function buildMessageBoardHtml(rows, dateRangeStr, totals) {
  // Basecamp Message Board content accepts HTML. Reuse the same HTML but
  // strip the outer wrapper so it renders well inside Basecamp.
  const sorted = [...rows].sort((a, b) => b.weekUpdateCount - a.weekUpdateCount);
  const strong = sorted.filter(r => r.weekUpdateCount >= 3);
  const light = sorted.filter(r => r.weekUpdateCount > 0 && r.weekUpdateCount < 3);
  const inactive = sorted.filter(r => r.weekUpdateCount === 0);

  const renderRow = (r) => {
    const bullets = (r.summaryBullets || []).map(b => `<li>${stripEmDashes(b).replace(/</g, '&lt;')}</li>`).join('');
    return `<div><strong>${stripEmDashes(r.intern).replace(/</g, '&lt;')}</strong> - ${stripEmDashes(r.project).replace(/</g, '&lt;')} [${r.weekUpdateCount}]</div>` +
      (bullets ? `<ul>${bullets}</ul>` : '<div><em>No updates posted this week.</em></div>');
  };
  const section = (title, list) => list.length === 0 ? '' : `<div><strong>${title} (${list.length})</strong></div><div><br></div>` + list.map(renderRow).join('<div><br></div>');

  return `<div><strong>Intern Activity - Week of ${dateRangeStr}</strong></div>
<div>${totals.total} intern projects, ${totals.totalUpdates} updates this week. Strong: ${strong.length} | Light: ${light.length} | Inactive: ${inactive.length}</div>
<div><br></div>
${section('STRONG (3+ updates)', strong)}
<div><br></div>
${section('LIGHT (1-2 updates)', light)}
<div><br></div>
${section('INACTIVE (0 updates)', inactive)}
<div><br></div>
<div style="font-size:11px;color:#64748b"><em>Generated automatically every Monday. Last 7 days of comments per intern todo. Questions: tag @CB System or reply to Ali.</em></div>`;
}

(async () => {
  console.log(`[intern-report] start ${new Date().toISOString()}, dry=${DRY}, no_mb=${NO_MB}`);
  console.log(`[intern-report] bucket=${BUCKET}, todosets=${TODOSET_IDS.join(',')}, mb=${MESSAGE_BOARD_ID}`);

  const projects = await discoverInternTodos();
  console.log(`[intern-report] discovered ${projects.length} intern project todos`);
  if (projects.length === 0) { console.error('Nothing to report.'); process.exit(0); }

  const rows = await buildPerInternRows(projects);
  console.log(`[intern-report] built ${rows.length} rows`);

  await summarizeWithLLM(rows);
  console.log(`[intern-report] LLM summaries done`);

  const totalUpdates = rows.reduce((s, r) => s + r.weekUpdateCount, 0);
  const totals = { total: rows.length, totalUpdates };
  const startStr = shortDate(WEEK_START);
  const endStr = shortDate(new Date(NOW));
  const dateRangeStr = `${startStr} - ${endStr}`;

  const html = buildHtml(rows, dateRangeStr, totals);
  const text = buildText(rows, dateRangeStr, totals);
  const mbHtml = buildMessageBoardHtml(rows, dateRangeStr, totals);

  validateBeforeSend(html, text);

  // Email Ali (plus alimuwwakkil@gmail.com per the established reports convention).
  if (!DRY && !NO_EMAIL) {
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com', port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    });
    const subject = `[Intern Report] Week of ${dateRangeStr} - ${totals.totalUpdates} updates, ${rows.filter(r => r.weekUpdateCount === 0).length} inactive`;
    const r = await transport.sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      cc: 'alimuwwakkil@gmail.com',
      subject,
      text, html,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
    });
    console.log('[intern-report] email sent:', r.messageId);
  } else {
    console.log('[intern-report] DRY: skipping email');
  }

  // Post to Message Board.
  if (!NO_MB && !DRY) {
    try {
      const mbResp = await bcPost(`/message_boards/${MESSAGE_BOARD_ID}/messages.json`, {
        subject: `Intern Activity - Week of ${dateRangeStr}`,
        content: mbHtml,
        status: 'active',
      });
      console.log('[intern-report] message board posted:', mbResp.id);
    } catch (e) {
      console.error('[intern-report] message board post failed:', e.message);
    }
  }

  console.log('[intern-report] done');
})().catch(e => { console.error('[intern-report] FATAL:', e.stack || e.message); process.exit(1); });
