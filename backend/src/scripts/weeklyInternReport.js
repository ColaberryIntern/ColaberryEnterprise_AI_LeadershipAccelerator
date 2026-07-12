#!/usr/bin/env node
// Weekly Intern Activity Report (v3).
// - CCPP filter REMOVED per Ali 2026-05-30. Source of truth is Basecamp project
//   24865175 activity.
// - Activity tracker computes per-intern level (GREEN/YELLOW/ORANGE/RED/BLACK).
// - Lead the report with BLACK (day 10+, exit-ready) and inline the exact
//   confirmInternExit.js CLI for each. Then RED, ORANGE, YELLOW, GREEN.
//
// Flags:
//   --dry              build but skip email and message board post
//   --no-message-board send email only, skip message board
//   --no-email         skip email, post to message board only
//
// Schedule: Mon 13:00 UTC (= 8 CT DST / 7 CT standard).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { getInstrumentedOpenAI } = require(path.resolve(__dirname, './lib/openaiInstrumented'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));
const { buildInternActivity } = require(path.resolve(__dirname, './lib/internActivityTracker'));
const recorder = require(path.resolve(__dirname, './lib/reportRunRecorder'));

const BUCKET = parseInt(process.env.INTERN_REPORT_BUCKET || '24865175', 10);
const MESSAGE_BOARD_ID = parseInt(process.env.INTERN_REPORT_MESSAGE_BOARD || '4450326153', 10);
const BC_TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || '').trim(); // set by runReportingAuditAndSend (CCPP Basecamp_AuthInfo)
const BASE = `https://3.basecampapi.com/3945211/buckets/${BUCKET}`;
const H = { Authorization: 'Bearer ' + BC_TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };

const DRY = process.argv.includes('--dry');
const NO_MB = process.argv.includes('--no-message-board');
const NO_EMAIL = process.argv.includes('--no-email');

async function bcPost(p, body) {
  if (DRY) { console.log('[dry] POST', p, JSON.stringify(body).slice(0, 200)); return { id: 'dry' }; }
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function shortDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function htmlEscape(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const LEVEL_STYLE = {
  BLACK:  { color: '#0c0a09', bg: '#1c1917', textOnBg: 'white', accent: '#dc2626', label: 'BLACK - DAY 10+ EXIT CLIFF' },
  RED:    { color: '#991b1b', bg: '#fee2e2', textOnBg: '#991b1b', accent: '#dc2626', label: 'RED - 7 to 9 days inactive' },
  ORANGE: { color: '#9a3412', bg: '#fed7aa', textOnBg: '#9a3412', accent: '#ea580c', label: 'ORANGE - 4 to 6 days inactive' },
  YELLOW: { color: '#854d0e', bg: '#fef9c3', textOnBg: '#854d0e', accent: '#ca8a04', label: 'YELLOW - 1 to 3 days inactive' },
  GREEN:  { color: '#166534', bg: '#dcfce7', textOnBg: '#166534', accent: '#16a34a', label: 'GREEN - active today' },
};

async function summarizeWithLLM(rows) {
  // Summarize each intern's last 14 days of comments into bullets. Only for
  // people who have ANY comment in the lookback (otherwise nothing to say).
  if (!process.env.OPENAI_API_KEY) return;
  const openai = getInstrumentedOpenAI({ workflow_id: 'weekly_intern_report' });
  const needSummary = rows.filter((r) => r.totalComments > 0);
  const concurrency = 5;
  let cursor = 0;
  async function worker() {
    while (cursor < needSummary.length) {
      const r = needSummary[cursor++];
      // Build a compact thread context: today's count + 14-day series
      const series = r.dailySeries.map((d) => `${d.date}: ${d.count}`).join(', ');
      try {
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: 'You produce one short sentence (under 18 words) describing an intern\'s recent activity pattern. No fluff, no em-dashes. Plain text only.' },
            { role: 'user', content: `Intern: ${r.name}\nLast activity: ${r.lastActivityAt || 'never'}\nDays since last: ${r.daysSinceLast ?? 'never'}\nDaily comment counts last 14 days: ${series}\nWrite one sentence describing the trend (slowing, steady, recovering, gone dark, etc.).` },
          ],
        });
        r.trend = stripEmDashes((resp.choices?.[0]?.message?.content || '').trim());
      } catch (_e) { r.trend = ''; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

function exitCli(row, reason = 'nochow') {
  return `node backend/src/scripts/confirmInternExit.js --intern-id <ID> --reason ${reason} --confirmed-by ali`;
}

function renderRowHtml(r) {
  const style = LEVEL_STYLE[r.level];
  const projects = r.projects.map((p) => `<a href="${p.appUrl}" style="color:#1a365d;text-decoration:none">${htmlEscape(p.title)}</a>`).join(' &middot; ');
  const last = r.lastActivityAt ? shortDate(r.lastActivityAt) : 'never';
  const series = r.dailySeries.map((d) => `<div title="${d.date}: ${d.count}" style="width:12px;height:18px;background:${d.count >= 3 ? '#16a34a' : d.count > 0 ? '#ca8a04' : '#e2e8f0'};margin-right:2px;display:inline-block;border-radius:1px"></div>`).join('');
  const trend = r.trend ? `<div style="font-size:12px;color:#475569;margin-top:6px;font-style:italic">${htmlEscape(stripEmDashes(r.trend))}</div>` : '';
  const blackExtra = r.level === 'BLACK' ? `<div style="margin-top:10px;padding:10px;background:#fef2f2;border-radius:4px"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#991b1b;font-weight:700">RECOMMENDED EXIT COMMAND</div><div style="font-family:monospace;font-size:12px;color:#1a202c;margin-top:4px">node backend/src/scripts/confirmInternExit.js --intern-id <strong>&lt;need CCPP InternID&gt;</strong> --reason nochow --confirmed-by ali</div><div style="font-size:11px;color:#64748b;margin-top:4px">Or tag <code>@CB exit intern ${htmlEscape(r.name)} reason=nochow</code> for the preview</div></div>` : '';
  return `
<tr style="border-top:1px solid #e2e8f0">
  <td style="padding:14px 12px;vertical-align:top;width:200px">
    <div style="font-weight:700;color:#1a365d;font-size:14px">${htmlEscape(r.name)}</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px">${r.email ? htmlEscape(r.email) : 'no email on file'}</div>
  </td>
  <td style="padding:14px 12px;vertical-align:top">
    <div style="font-size:13px">${projects || '<em style="color:#94a3b8">No projects</em>'}</div>
    <div style="margin-top:8px;display:flex;align-items:center">${series}</div>
    ${trend}
    ${blackExtra}
  </td>
  <td style="padding:14px 12px;vertical-align:top;text-align:center;width:100px">
    <div style="font-weight:700;font-size:22px;color:${style.accent}">${r.daysSinceLast ?? '&infin;'}</div>
    <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px">days dark</div>
  </td>
  <td style="padding:14px 12px;vertical-align:top;text-align:center;width:80px">
    <div style="font-weight:700;font-size:18px;color:#1a365d">${r.todayCount}</div>
    <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px">today</div>
    <div style="font-size:10px;color:#94a3b8">target ${r.dailyTarget}</div>
  </td>
</tr>`;
}

function sectionTable(level, rows) {
  if (rows.length === 0) return '';
  const style = LEVEL_STYLE[level];
  const isBlack = level === 'BLACK';
  return `
<h2 style="font-size:16px;color:${style.color};border-bottom:2px solid ${style.accent};padding-bottom:8px;margin:28px 0 14px">${style.label} (${rows.length})</h2>
${isBlack ? `<div style="margin-bottom:14px;padding:14px;background:#1c1917;color:white;border-radius:6px;font-size:13px"><strong>ACTION REQUIRED:</strong> These interns have not posted any update in 10+ days. Per the program standard (3 updates/day), they should be processed out today. Run the inlined CLI for each, or tag <code style="background:#374151;padding:2px 6px;border-radius:3px;color:#fbbf24">@CB exit intern &lt;name&gt; reason=nochow</code> to preview.</div>` : ''}
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0;background:white">
  <thead style="background:${style.bg};color:${style.textOnBg}">
    <tr>
      <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">INTERN</th>
      <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:1px">PROJECT &amp; 14-DAY ACTIVITY</th>
      <th align="center" style="padding:10px 12px;font-size:11px;letter-spacing:1px">DARK</th>
      <th align="center" style="padding:10px 12px;font-size:11px;letter-spacing:1px">TODAY</th>
    </tr>
  </thead>
  <tbody>${rows.map(renderRowHtml).join('')}</tbody>
</table>`;
}

function buildHtml(rows, dateRangeStr, totals) {
  const black = rows.filter((r) => r.level === 'BLACK');
  const red = rows.filter((r) => r.level === 'RED');
  const orange = rows.filter((r) => r.level === 'ORANGE');
  const yellow = rows.filter((r) => r.level === 'YELLOW');
  const green = rows.filter((r) => r.level === 'GREEN');

  // Personal Ali opener - same pattern as the nudge digest. Headline finding
  // up top so spam filters AND skim-reading both see this is FOR Ali.
  const blackSentence = totals.black > 0
    ? `<strong>${totals.black} ${totals.black === 1 ? 'person hit' : 'people hit'} the day-10 exit cliff</strong> and should be processed out this week.`
    : `No-one is at the day-10 exit cliff this week.`;
  const trendSentence = totals.red + totals.orange > 0
    ? ` ${totals.red + totals.orange} more are sliding (${totals.red} RED, ${totals.orange} ORANGE) and could be at the cliff within days.`
    : '';
  const personalOpener = `<div style="background:#1c1917;color:white;padding:22px 28px;border-radius:0 0 6px 6px">
<div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:16px;margin-top:8px;line-height:1.55">Ali, here is your intern dashboard for the week of ${dateRangeStr}. ${blackSentence}${trendSentence} Standard is 3 updates per day.</div>
</div>`;

  const interactionBlock = `<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:200px;color:#475569"><strong>Process a BLACK exit</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System exit intern &lt;name&gt; reason=nochow</code> in any Basecamp thread. CB will reply with the InternID + exact CLI command. Then run the CLI on the VPS.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Enable daily nudges</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System set intern nudge mode live</code>. Next 5pm CT run will start emailing + BC-commenting interns directly.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Pause daily nudges</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System set intern nudge mode preview</code>. Reverts to digest-only.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Ask CB anything</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System &lt;anything&gt;</code> in a Basecamp thread. CB reads the thread context and acts.</td></tr>
</table>
</div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<div style="max-width:820px;margin:0 auto;background:white;font-family:arial,sans-serif;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:32px 32px 26px">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#bfdbfe;font-weight:700">Intern Activity Report</div>
  <div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">Week of ${dateRangeStr}</div>
  <div style="font-size:14px;color:#cbd5e0;margin-top:6px">${totals.total} intern projects tracked. ${totals.black} at exit cliff. Standard: <strong>3 updates per day</strong>.</div>
</div>

${personalOpener}

<div style="padding:24px 32px">

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;border-collapse:separate;border-spacing:8px 0">
<tr>
  <td style="background:#1c1917;color:white;padding:14px;text-align:center;border-radius:6px">
    <div style="font-size:28px;font-weight:800">${black.length}</div>
    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700">BLACK day 10+</div>
  </td>
  <td style="background:#fee2e2;padding:14px;text-align:center;border-radius:6px">
    <div style="font-size:28px;font-weight:800;color:#991b1b">${red.length}</div>
    <div style="font-size:11px;color:#991b1b;letter-spacing:1px;text-transform:uppercase;font-weight:700">RED 7-9d</div>
  </td>
  <td style="background:#fed7aa;padding:14px;text-align:center;border-radius:6px">
    <div style="font-size:28px;font-weight:800;color:#9a3412">${orange.length}</div>
    <div style="font-size:11px;color:#9a3412;letter-spacing:1px;text-transform:uppercase;font-weight:700">ORANGE 4-6d</div>
  </td>
  <td style="background:#fef9c3;padding:14px;text-align:center;border-radius:6px">
    <div style="font-size:28px;font-weight:800;color:#854d0e">${yellow.length}</div>
    <div style="font-size:11px;color:#854d0e;letter-spacing:1px;text-transform:uppercase;font-weight:700">YELLOW 1-3d</div>
  </td>
  <td style="background:#dcfce7;padding:14px;text-align:center;border-radius:6px">
    <div style="font-size:28px;font-weight:800;color:#166534">${green.length}</div>
    <div style="font-size:11px;color:#166534;letter-spacing:1px;text-transform:uppercase;font-weight:700">GREEN today</div>
  </td>
</tr>
</table>

${sectionTable('BLACK', black)}
${sectionTable('RED', red)}
${sectionTable('ORANGE', orange)}
${sectionTable('YELLOW', yellow)}
${sectionTable('GREEN', green)}

${interactionBlock}

<div style="margin-top:24px;padding:14px;background:#f8fafc;border-left:4px solid #1a365d;font-size:12px;color:#475569">
  Source: Basecamp project ${BUCKET}. Activity = comments authored by the intern on any todo they're assigned. Standard: 3 updates/day. 10 consecutive dark days triggers BLACK (exit-ready). Daily nudges from CB System escalate per level.
</div>

</div>
</div>
</body></html>`;
}

function buildText(rows, dateRangeStr, totals) {
  const black = rows.filter((r) => r.level === 'BLACK');
  const red = rows.filter((r) => r.level === 'RED');
  const orange = rows.filter((r) => r.level === 'ORANGE');
  const yellow = rows.filter((r) => r.level === 'YELLOW');
  const green = rows.filter((r) => r.level === 'GREEN');
  const blackSentence = totals.black > 0
    ? `${totals.black} ${totals.black === 1 ? 'person' : 'people'} hit the day-10 exit cliff and should be processed out this week.`
    : 'No-one is at the day-10 exit cliff this week.';
  let out = `Ali, here is your intern dashboard for the week of ${dateRangeStr}. ${blackSentence} Standard is 3 updates per day.\n\n`;
  out += `INTERN ACTIVITY REPORT - Week of ${dateRangeStr}\n${totals.total} interns tracked.\n\nBLACK ${black.length}  |  RED ${red.length}  |  ORANGE ${orange.length}  |  YELLOW ${yellow.length}  |  GREEN ${green.length}\n\n`;
  const renderSection = (label, list) => {
    if (list.length === 0) return '';
    let s = `${label} (${list.length})\n${'-'.repeat(label.length + 4)}\n`;
    for (const r of list) {
      s += `\n${r.name}  [${r.daysSinceLast ?? 'never'} days dark, today: ${r.todayCount}/${r.dailyTarget}]\n`;
      if (r.email) s += `  ${r.email}\n`;
      if (r.trend) s += `  ${r.trend}\n`;
      if (r.level === 'BLACK') s += `  EXIT: tag @CB exit intern ${r.name} reason=nochow, then run confirmInternExit CLI\n`;
    }
    return s + '\n';
  };
  out += renderSection('BLACK - DAY 10+ EXIT CLIFF', black);
  out += renderSection('RED - 7-9 days inactive', red);
  out += renderSection('ORANGE - 4-6 days inactive', orange);
  out += renderSection('YELLOW - 1-3 days inactive', yellow);
  out += renderSection('GREEN - active today', green);
  out += `\n--- What you can do from here ---\n`;
  out += `Process a BLACK exit:    tag @CB System exit intern <name> reason=nochow in any Basecamp thread\n`;
  out += `Enable live nudges:      tag @CB System set intern nudge mode live\n`;
  out += `Pause live nudges:       tag @CB System set intern nudge mode preview\n`;
  out += `Ask CB anything:         tag @CB System <anything> in any Basecamp thread\n`;
  return stripEmDashes(out);
}

function buildMessageBoardHtml(rows, dateRangeStr, totals) {
  const black = rows.filter((r) => r.level === 'BLACK');
  const red = rows.filter((r) => r.level === 'RED');
  const orange = rows.filter((r) => r.level === 'ORANGE');
  const yellow = rows.filter((r) => r.level === 'YELLOW');
  const green = rows.filter((r) => r.level === 'GREEN');
  const renderInline = (level, list) => list.length === 0 ? '' : `<div><strong>${LEVEL_STYLE[level].label} (${list.length})</strong>: ${list.map((r) => `${htmlEscape(r.name)} (${r.daysSinceLast ?? '∞'}d)`).join(', ')}</div>`;
  return `<div><strong>Intern Activity - Week of ${dateRangeStr}</strong></div>
<div>${totals.total} interns tracked. Standard: 3 updates per day.</div>
<div><br></div>
${renderInline('BLACK', black)}
${renderInline('RED', red)}
${renderInline('ORANGE', orange)}
${renderInline('YELLOW', yellow)}
${renderInline('GREEN', green)}
<div><br></div>
<div style="font-size:11px;color:#64748b"><em>Standard is 3 updates per day. After 10 consecutive days dark, the spot is processed out. Daily nudges from CB System at 5pm CT.</em></div>`;
}

(async () => {
  console.log(`[intern-report] start ${new Date().toISOString()}, dry=${DRY}, no_mb=${NO_MB}, no_email=${NO_EMAIL}`);
  const runRecord = await recorder.start('Weekly Intern Activity Report');
  const messageIds = [];
  const recipientsSent = [];
  let runStatus = 'success';
  let runError = null;
  try {
  const rows = await buildInternActivity({ lookbackDays: 14, includeCompleted: false });
  console.log(`[intern-report] activity rows: ${rows.length}`);
  if (rows.length === 0) { console.error('Nothing to report.'); process.exit(0); }

  await summarizeWithLLM(rows);
  console.log(`[intern-report] LLM trend descriptions done`);

  const totals = {
    total: rows.length,
    black: rows.filter((r) => r.level === 'BLACK').length,
    red: rows.filter((r) => r.level === 'RED').length,
    orange: rows.filter((r) => r.level === 'ORANGE').length,
    yellow: rows.filter((r) => r.level === 'YELLOW').length,
    green: rows.filter((r) => r.level === 'GREEN').length,
  };
  const NOW = Date.now();
  const startStr = shortDate(new Date(NOW - 7 * 86400 * 1000));
  const endStr = shortDate(new Date(NOW));
  const dateRangeStr = `${startStr} - ${endStr}`;

  // Final sanitize pass: project/todo titles upstream may include em/en-dashes
  // (Basecamp users sometimes paste from Word). Strip globally before preflight.
  const html = stripEmDashes(buildHtml(rows, dateRangeStr, totals));
  const text = stripEmDashes(buildText(rows, dateRangeStr, totals));
  const mbHtml = stripEmDashes(buildMessageBoardHtml(rows, dateRangeStr, totals));

  validateBeforeSend(html, text);

  if (!DRY && !NO_EMAIL) {
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com', port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    });
    const subject = `[Intern Report] Week of ${dateRangeStr} - ${totals.black} BLACK, ${totals.red} RED, ${totals.orange} ORANGE`;
    const r = await transport.sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'],
      subject, text, html,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': totals.black > 0 ? 'high' : 'normal', 'X-Priority': totals.black > 0 ? '1' : '3' },
    });
    console.log('[intern-report] email sent:', r.messageId);
    messageIds.push(r.messageId);
    recipientsSent.push('ali@colaberry.com', 'alimuwwakkil@gmail.com');
  }

  if (!NO_MB && !DRY) {
    try {
      const mbResp = await bcPost(`/message_boards/${MESSAGE_BOARD_ID}/messages.json`, {
        subject: `Intern Activity - Week of ${dateRangeStr}`,
        content: mbHtml,
        status: 'active',
      });
      console.log('[intern-report] message board posted:', mbResp.id);
      messageIds.push(`bc-msg-${mbResp.id}`);
    } catch (e) { console.error('[intern-report] message board post failed:', e.message); }
  }

  console.log('[intern-report] done');
  } catch (e) {
    runStatus = 'failure';
    runError = e.message;
    console.error('[intern-report] FATAL:', e.stack || e.message);
    await recorder.end(runRecord, { status: runStatus, messageIds, recipientsSent, error: runError });
    process.exit(1);
  }
  await recorder.end(runRecord, { status: runStatus, messageIds, recipientsSent });
})();
