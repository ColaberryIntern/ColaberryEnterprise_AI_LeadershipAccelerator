#!/usr/bin/env node
/**
 * sendAliYourTurnEmail.js
 *
 * The "Your Turn" daily digest. Pulls Ali's top N highest-urgency todos
 * (already filtered to CB-managed + fresh + Ali-assigned via the prod DB),
 * generates the structured suggestion + Claude Code prompt per task using
 * the same buildOpsSuggestionLite that the @CB tool uses, and emails the
 * whole thing styled like the existing client reports (Gov Bids, ShipCES,
 * weekly executive briefings).
 *
 * Top 5 get the full inline detail with copy-paste prompt. Beyond that,
 * tasks 6-N get a compact row with a "Ask @CB on Basecamp" link that
 * triggers the @CB suggest_prompt tool when posted.
 *
 * Args:
 *   --limit N    (default 5 for full + 5 more for compact = 10 total)
 *   --dry        print the HTML to stdout instead of sending
 *   --send-now   override quiet-hours guard (the cron version respects them)
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const { buildSuggestion, generatePrompt } = require(path.resolve(__dirname, './lib/buildOpsSuggestionLite'));
const { execSync } = require('child_process');

const ARGS = process.argv.slice(2);
const FLAG_VAL = (n) => { const i = ARGS.indexOf(n); return i >= 0 && i + 1 < ARGS.length ? ARGS[i + 1] : null; };
const DRY = ARGS.includes('--dry');
const TOTAL_LIMIT = parseInt(FLAG_VAL('--limit') || '10', 10);
const FULL_DETAIL_LIMIT = 5;
const ALI_BC_USER_ID = '17454835';
const STALE_DAYS = 90;

// Pull top todos via a small Node script that runs INSIDE the backend
// container (Sequelize + pg already there + DATABASE_URL is set). Avoids
// the quote-escaping nightmare of ssh -> docker exec -> psql -tAc.
function pullTopTodos() {
  const script = `
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(\`
    SELECT t.bc_id, t.project_id, p.name AS project_name,
           t.todolist_name, t.title, t.description, t.bc_app_url,
           t.due_on, t.bc_updated_at, t.urgency_score, t.category
      FROM ops_bc_todos t
      JOIN ops_bc_projects p ON p.bc_id = t.project_id
     WHERE t.status = 'active'
       AND p.is_cb_managed = TRUE
       AND t.assignee_ids @> '["${ALI_BC_USER_ID}"]'::jsonb
       AND t.is_dismissed = FALSE
       AND t.bc_updated_at >= NOW() - INTERVAL '${STALE_DAYS} days'
       AND t.urgency_score IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM ops_approval_queue q
          WHERE q.todo_bc_id = t.bc_id
            AND q.decided_at >= date_trunc('day', NOW())
       )
     ORDER BY t.urgency_score DESC NULLS LAST,
              t.due_on ASC NULLS LAST,
              t.bc_updated_at DESC
     LIMIT ${TOTAL_LIMIT}\`);
  process.stdout.write(JSON.stringify(r.rows));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
`;
  const b64 = Buffer.from(script).toString('base64');
  const cmd = `ssh root@95.216.199.47 "docker exec accelerator-backend sh -c 'echo ${b64} | base64 -d | node'"`;
  const out = execSync(cmd, { encoding: 'utf8' });
  return JSON.parse(out.trim() || '[]');
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function urgencyBadgeStyle(score) {
  if (score == null) return { bg: '#0e1729', fg: '#8a99b8' };
  if (score >= 70) return { bg: '#3a1d22', fg: '#ff6b6b' };
  if (score >= 40) return { bg: '#2d2410', fg: '#ffb84d' };
  return { bg: '#0e1729', fg: '#8a99b8' };
}

function renderTaskFullCard(t, idx) {
  const suggestion = buildSuggestion(t);
  const prompt = generatePrompt(t);
  const urgent = urgencyBadgeStyle(t.urgency_score);
  const stepsHtml = suggestion.steps.map((s) => `<li style="margin-bottom:4px">${escapeHtml(s)}</li>`).join('');
  const resourcesHtml = suggestion.resources.map((r) => `<li style="margin-bottom:3px"><strong>[${r.kind}]</strong> ${escapeHtml(r.name)} <span style="color:#475569">- ${escapeHtml(r.why)}</span></li>`).join('');
  const stopsHtml = suggestion.stop_conditions.map((s) => `<li style="margin-bottom:3px;color:#78350f">${escapeHtml(s)}</li>`).join('');
  const dueLabel = t.due_on ? `due ${String(t.due_on).slice(0, 10)}` : '';
  return `
<div style="margin:24px 0;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;background:white">
  <div style="background:linear-gradient(135deg,#0b1220 0%,#1d3a8a 100%);color:white;padding:18px 22px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div>
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Task ${idx} of ${FULL_DETAIL_LIMIT}</div>
        <h2 style="margin:6px 0 4px;font-size:18px;line-height:1.3">${escapeHtml(t.title)}</h2>
        <div style="font-size:12px;color:#cbd5e0">${escapeHtml(t.project_name || '?')} &middot; ${escapeHtml(t.todolist_name || 'unfiled')} ${dueLabel ? '&middot; ' + dueLabel : ''}</div>
      </div>
      <div style="background:${urgent.bg};color:${urgent.fg};border:1px solid ${urgent.fg};border-radius:6px;padding:6px 10px;font-weight:800;font-size:14px">${t.urgency_score == null ? '-' : t.urgency_score}</div>
    </div>
  </div>
  <div style="padding:18px 22px">
    <div style="margin-bottom:14px;font-size:14px;color:#1f2937"><strong>${suggestion.action_kind.toUpperCase()}</strong>: ${escapeHtml(suggestion.one_line)}</div>

    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#475569;font-weight:700;margin-top:14px">Suggested steps</div>
    <ol style="font-size:13.5px;padding-left:22px;margin-top:6px;line-height:1.55;color:#1f2937">${stepsHtml}</ol>

    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#475569;font-weight:700;margin-top:14px">Tools / Skills / Agents / Workflows</div>
    <ul style="font-size:13px;padding-left:22px;margin-top:6px;line-height:1.5;color:#1f2937">${resourcesHtml}</ul>

    ${suggestion.stop_conditions.length ? `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#78350f;font-weight:700;margin-top:14px">Stop conditions</div><ul style="font-size:13px;padding-left:22px;margin-top:6px;line-height:1.5">${stopsHtml}</ul>` : ''}

    <div style="margin-top:18px;padding:14px 16px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Paste into Claude Code</div>
        <div style="font-size:11px;color:#78350f;font-style:italic">cd into the repo first</div>
      </div>
      <pre style="background:#0b1220;color:#cbd5e1;border:1px solid #1d2a44;border-radius:6px;padding:12px;font-size:11.5px;line-height:1.5;margin-top:8px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;font-family:Menlo,Consolas,monospace">${escapeHtml(prompt)}</pre>
    </div>

    <div style="margin-top:14px;text-align:right;font-size:12px">
      ${t.bc_app_url ? `<a href="${escapeHtml(t.bc_app_url)}" style="color:#1a365d;font-weight:700;text-decoration:none">Open in Basecamp &rarr;</a>` : ''}
    </div>
  </div>
</div>`;
}

function renderTaskCompactRow(t, idx) {
  const urgent = urgencyBadgeStyle(t.urgency_score);
  const dueLabel = t.due_on ? `due ${String(t.due_on).slice(0, 10)}` : '';
  const url = t.bc_app_url || '#';
  return `
<tr>
  <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;width:50px;text-align:center">
    <div style="background:${urgent.bg};color:${urgent.fg};border:1px solid ${urgent.fg};border-radius:5px;padding:4px 8px;font-weight:800;font-size:12px;display:inline-block">${t.urgency_score == null ? '-' : t.urgency_score}</div>
  </td>
  <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">
    <div style="font-size:13px;font-weight:600;color:#0f172a">${idx}. <a href="${escapeHtml(url)}" style="color:#0f172a;text-decoration:none">${escapeHtml(t.title)}</a></div>
    <div style="font-size:11px;color:#475569;margin-top:3px">${escapeHtml(t.project_name || '?')} &middot; ${escapeHtml(t.todolist_name || 'unfiled')} ${dueLabel ? '&middot; ' + dueLabel : ''}</div>
  </td>
  <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;text-align:right;white-space:nowrap">
    <a href="${escapeHtml(url)}" style="font-size:11px;color:#1a365d;font-weight:700;text-decoration:none">Open BC &rarr;</a><br>
    <span style="font-size:11px;color:#475569;font-style:italic">tag <code>@CB suggest prompt</code></span>
  </td>
</tr>`;
}

function renderEmailHtml(todos) {
  const fullDetail = todos.slice(0, FULL_DETAIL_LIMIT);
  const compactRows = todos.slice(FULL_DETAIL_LIMIT);
  const fullCards = fullDetail.map((t, i) => renderTaskFullCard(t, i + 1)).join('');
  const compactRowsHtml = compactRows.map((t, i) => renderTaskCompactRow(t, FULL_DETAIL_LIMIT + i + 1)).join('');
  const today = new Date().toISOString().slice(0, 10);

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:820px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:32px 36px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Your turn &middot; ${today}</div>
<h1 style="margin:10px 0 6px;font-size:24px;font-weight:800;line-height:1.25">Ali, you are blocking ${todos.length} downstream item${todos.length === 1 ? '' : 's'} right now. Run these in Claude Code to move them.</h1>
<div style="font-size:13px;color:#cbd5e0;max-width:680px">The top 5 each carry a copy-paste-ready Claude Code prompt below. Run one. The result lands back as a Basecamp comment via <code>sendWithBcAttach</code>. When that task resolves, the next "Your Turn" email fires for whatever is now blocked on you.</div>
</div>

<div style="padding:24px 36px">

<h2 style="font-size:17px;margin:0 0 4px;color:#0f172a">Top 5 &mdash; full Claude Code prompt inline</h2>
<div style="font-size:13px;color:#475569;margin-bottom:6px">Each prompt declares what the agent has access to (sendWithBcAttach, CB walker, Gmail / Drive / Calendar MCP, Mandrill, CCPP MSSQL, baseline-ui skill, etc.) and stop conditions per the governance model. Click the Open in Basecamp link to drill through.</div>
${fullCards}

${compactRows.length ? `<h2 style="font-size:17px;margin:32px 0 8px;color:#0f172a">Next ${compactRows.length} &mdash; open in Basecamp, ask @CB for the prompt</h2>
<div style="font-size:13px;color:#475569;margin-bottom:8px">Click into any of these on Basecamp and tag <code>@CB suggest prompt</code> in a comment. CB will post a copy-paste prompt back on that ticket within ~30s.</div>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px">
<tbody>${compactRowsHtml}</tbody>
</table>` : ''}

<div style="margin-top:30px;padding:16px 20px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">How "Your Turn" works</div>
<ol style="font-size:13px;padding-left:22px;margin-top:6px;line-height:1.6">
<li>You get this email when at least one open todo assigned to you is blocking other work.</li>
<li>Pick a task. Paste its prompt into Claude Code. The agent does the work + posts the result back as a Basecamp comment on that ticket.</li>
<li>When the ticket resolves (Approve in /admin/ops or close on Basecamp), the cascade trigger looks for whatever is now blocked on you next and fires the next "Your Turn" email.</li>
<li>You can also drive from <a href="https://enterprise.colaberry.ai/admin/ops" style="color:#1a365d;font-weight:700">/admin/ops</a> directly &mdash; same prompts, decide in-place, same write-back.</li>
</ol>
</div>

</div>

<div style="padding:18px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">
This is the "Your Turn" daily / event-driven digest. Sent only when work is blocked on you. Unblock cascades automatically.
</div>

</div></body></html>`;
}

function renderText(todos) {
  const lines = [`Ali - Your Turn (${todos.length} item${todos.length === 1 ? '' : 's'} blocked on you):`, ''];
  todos.slice(0, FULL_DETAIL_LIMIT).forEach((t, i) => {
    const suggestion = buildSuggestion(t);
    lines.push(`[${i + 1}] urgency ${t.urgency_score} - ${t.title}`);
    lines.push(`    ${t.project_name} / ${t.todolist_name || 'unfiled'}${t.due_on ? ' / due ' + String(t.due_on).slice(0, 10) : ''}`);
    lines.push(`    ${suggestion.action_kind.toUpperCase()}: ${suggestion.one_line}`);
    lines.push(`    BC: ${t.bc_app_url}`);
    lines.push('');
  });
  if (todos.length > FULL_DETAIL_LIMIT) {
    lines.push(`Plus ${todos.length - FULL_DETAIL_LIMIT} more - click into BC and tag @CB suggest_prompt for those.`);
  }
  lines.push('');
  lines.push('/admin/ops for the full surface.');
  return lines.join('\n');
}

(async () => {
  console.log('[your-turn] pulling top todos from prod...');
  const todos = pullTopTodos();
  console.log(`[your-turn] ${todos.length} todos pulled`);
  if (todos.length === 0) {
    console.log('[your-turn] queue is empty. Not sending.');
    return;
  }

  const html = renderEmailHtml(todos);
  const text = renderText(todos);

  if (DRY) {
    const outPath = path.resolve(__dirname, '../../../tmp/your-turn-preview.html');
    fs.writeFileSync(outPath, html);
    console.log(`[your-turn] DRY mode - wrote preview to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
    return;
  }

  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: `Ali - Your Turn (${todos.length} blocked, top 5 with Claude Code prompts inline)`,
    html,
    text,
    bcSummary: `<p>"Your Turn" daily digest fired. ${todos.length} todos blocked on Ali, top ${Math.min(FULL_DETAIL_LIMIT, todos.length)} carry the full Claude Code prompt inline (copy-paste ready), remaining items link to BC where Ali can tag <code>@CB suggest prompt</code> to get the prompt on-demand. When each task resolves, the cascade trigger fires the next "Your Turn" email for whatever is now blocked.</p>`,
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
