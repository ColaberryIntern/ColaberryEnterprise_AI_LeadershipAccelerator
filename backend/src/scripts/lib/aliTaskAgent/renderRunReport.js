/**
 * renderRunReport — turns a Ali Task Agent run summary into the consolidated
 * HTML report Ali receives (emailed + attached to his home-base todo).
 *
 * Email-safe by design, following renderPaysimpleReport.js / launchPmoDashboardHtml.js:
 * table-based layout, inline hex colors, no CSS grid/flex/vars, 640px cap, so it
 * renders the same in Gmail, Outlook, and the Basecamp Vault preview.
 *
 * Pure: (summary) -> string. No I/O, fully unit-testable.
 *
 * Summary shape:
 *   {
 *     runId, runAt (ISO), dryRun (bool),
 *     identity: { id, name },
 *     counts: { scanned, done, queued, skipped, failed },
 *     done:          [{ projectName, title, url, note }],
 *     needsApproval: [{ projectName, title, url, reason }],
 *     couldntDo:     [{ projectName, title, url, reason }],
 *   }
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function clean(s) {
  return esc(String(s == null ? '' : s).replace(/—/g, '-').replace(/–/g, '-'));
}

function titleCell(row) {
  const link = row.url
    ? `<a href="${esc(row.url)}" style="color:#1a365d;text-decoration:none">${clean(row.title)}</a>`
    : clean(row.title);
  const proj = row.projectName ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${clean(row.projectName)}</div>` : '';
  return `${link}${proj}`;
}

function section(title, accent, rows, secondColLabel, secondColKey, emptyMsg) {
  const head = `<tr><td colspan="2" style="padding:16px 0 6px">
    <div style="font-size:13px;font-weight:700;color:${accent};letter-spacing:.3px;text-transform:uppercase">${esc(title)} <span style="color:#cbd5e1">(${rows.length})</span></div>
  </td></tr>`;
  if (!rows.length) {
    return head + `<tr><td colspan="2" style="padding:4px 0 8px;font-size:13px;color:#94a3b8">${esc(emptyMsg)}</td></tr>`;
  }
  const body = rows.map((r) => `<tr>
    <td style="padding:8px 12px 8px 0;font-size:13px;color:#0f172a;border-bottom:1px solid #f1f5f9;vertical-align:top">${titleCell(r)}</td>
    <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9;vertical-align:top">${clean(r[secondColKey] || '')}</td>
  </tr>`).join('');
  const colHead = `<tr>
    <td style="padding:2px 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Task</td>
    <td style="padding:2px 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">${esc(secondColLabel)}</td>
  </tr>`;
  return head + colHead + body;
}

function pill(label, value, color) {
  return `<td style="padding:0 6px"><table cellpadding="0" cellspacing="0" style="background:${color}1a;border-radius:6px"><tr><td style="padding:8px 12px;text-align:center">
    <div style="font-size:20px;font-weight:700;color:${color}">${esc(String(value))}</div>
    <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">${esc(label)}</div>
  </td></tr></table></td>`;
}

function renderRunReport(summary = {}) {
  const c = summary.counts || {};
  const digest = summary.mode === 'digest';
  const runAt = summary.runAt ? new Date(summary.runAt) : new Date();
  const longDate = runAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const idLine = digest
    ? 'Read-only digest - nothing was posted to your tickets'
    : summary.identity
      ? `Acting as ${clean(summary.identity.name || 'Ali')} (${esc(String(summary.identity.id))})`
      : 'Acting as Ali';
  const dryBadge = summary.dryRun
    ? `<span style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;margin-left:8px">DRY RUN - nothing was posted</span>`
    : '';
  const headline = digest ? 'Your priority queue' : 'Here is what I handled for you';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:20px 0">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">

  <tr><td style="background:#0f172a;padding:22px 28px">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700">Ali Task Agent</div>
    <div style="font-size:21px;color:#ffffff;font-weight:700;margin-top:2px">${esc(headline)}${dryBadge}</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:6px">${esc(longDate)} &middot; ${idLine} &middot; run ${esc(summary.runId || '-')}</div>
  </td></tr>

  <tr><td style="padding:18px 28px 4px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      ${pill(digest ? 'In scope' : 'Scanned', c.scanned || 0, '#475569')}
      ${pill(digest ? 'I can handle' : 'Done', c.done || 0, '#15803d')}
      ${pill(digest ? 'Needs you' : 'Needs you', c.queued || 0, '#ea580c')}
      ${digest ? '' : pill('Blocked', c.failed || 0, '#b91c1c')}
    </tr></table>
  </td></tr>

  <tr><td style="padding:8px 28px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${section(digest ? 'I can handle these once live' : 'Done', '#15803d', summary.done || [], digest ? 'What I would do' : 'What I did', 'note', digest ? 'Nothing in scope I can take on right now.' : 'Nothing completed this run.')}
      ${section(digest ? 'Needs your decision' : 'Needs your approval', '#ea580c', summary.needsApproval || [], 'Why it needs you', 'reason', 'Nothing needs you. Clear.')}
      ${(digest && !(summary.couldntDo || []).length) ? '' : section("Couldn't do", '#b91c1c', summary.couldntDo || [], 'Blocker', 'reason', 'Nothing blocked.')}
    </table>
  </td></tr>

  <tr><td style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0">
    <div style="font-size:11px;color:#94a3b8;line-height:1.5">${digest
      ? 'Read-only digest from the Ali Task Agent: your open todos, narrowed to the ones you commented on in the last 30 days and ranked by urgency. Nothing was posted to any ticket. Once you enable it to act as you, the "I can handle" items get drafted for you and the rest stay for your decision.'
      : 'Generated by the Ali Task Agent. It works tasks addressed to you in Basecamp, does the internal work it safely can, and queues anything outward-facing for you to send. Reply to any ticket comment to revise. Full detail is attached as an HTML file and posted on your home-base todo.'}</div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Plaintext fallback for the email body. */
function renderRunReportText(summary = {}) {
  const c = summary.counts || {};
  const lines = [];
  lines.push('ALI TASK AGENT - run summary');
  lines.push(`${(summary.runAt || '').slice(0, 16)} | run ${summary.runId || '-'}${summary.dryRun ? ' | DRY RUN' : ''}`);
  lines.push(`Scanned ${c.scanned || 0} | Done ${c.done || 0} | Needs you ${c.queued || 0} | Blocked ${c.failed || 0}`);
  const block = (label, rows, key) => {
    lines.push('');
    lines.push(`== ${label} (${(rows || []).length}) ==`);
    (rows || []).forEach((r) => lines.push(`- ${r.title}${r[key] ? ` :: ${r[key]}` : ''}${r.url ? ` (${r.url})` : ''}`));
  };
  block('Done', summary.done, 'note');
  block('Needs your approval', summary.needsApproval, 'reason');
  block("Couldn't do", summary.couldntDo, 'reason');
  return lines.join('\n').replace(/—/g, '-').replace(/–/g, '-');
}

module.exports = { renderRunReport, renderRunReportText };
