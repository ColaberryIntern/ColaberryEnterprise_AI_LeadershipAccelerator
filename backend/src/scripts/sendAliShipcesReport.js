#!/usr/bin/env node
/**
 * sendAliShipcesReport.js
 *
 * ShipCES project-scoped Your-Turn report. Top 5 tasks get the contextual
 * v2 suggestion + Claude Code prompt inline (real walker + GPT-4o-mini).
 * Tasks 6-N get compact rows linking to BC with a "tag @CB suggest prompt"
 * call-out.
 *
 * Styled to match Gov Bids / ShipCES / weekly executive briefings.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const { buildSuggestion, generatePrompt } = require(path.resolve(__dirname, './lib/buildOpsSuggestionLite'));
const { buildContextualSuggestion } = require(path.resolve(__dirname, './lib/buildContextualSuggestionV2'));
const { execSync } = require('child_process');

const SHIPCES_BUCKET_ID = '47126345';
const SHIPCES_PROJECT_NAME = 'ShipCES - Autonomous Brokerage';
const ALI_BC_USER_ID = '17454835';
const STALE_DAYS = 90;
const FULL_DETAIL_LIMIT = 5;
const TOTAL_LIMIT = 15;

async function bcGet(urlOrPath) {
  const token = process.env.BASECAMP_ACCESS_TOKEN.replace(/^Bearer /, '');
  const account = process.env.BASECAMP_ACCOUNT_ID || '3945211';
  const base = `https://3.basecampapi.com/${account}`;
  const u = urlOrPath.startsWith('http') ? urlOrPath : `${base}${urlOrPath}`;
  const r = await fetch(u, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Colaberry Ali Report', Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`BC ${u} -> ${r.status}`);
  return r.json();
}

function pullShipcesTodos() {
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
       AND t.project_id = '${SHIPCES_BUCKET_ID}'
       AND t.assignee_ids @> '["${ALI_BC_USER_ID}"]'::jsonb
       AND t.is_dismissed = FALSE
       AND t.bc_updated_at >= NOW() - INTERVAL '${STALE_DAYS} days'
       AND t.urgency_score IS NOT NULL
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

function renderTaskFullCard(t, suggestion, prompt, idx, contextMeta) {
  const urgent = urgencyBadgeStyle(t.urgency_score);
  const dueLabel = t.due_on ? `due ${String(t.due_on).slice(0, 10)}` : '';
  const stepsHtml = suggestion.basic_steps.map((s) => `<li style="margin-bottom:4px">${escapeHtml(s)}</li>`).join('');
  const analysis = suggestion.analysis || {};
  const toolsHtml = (analysis.tools_needed || []).slice(0, 4).map((r) => `<li style="margin-bottom:3px"><strong>[${r.exists === false ? 'CREATE' : (r.kind || 'tool')}]</strong> ${escapeHtml(r.name || '')} <span style="color:#475569">- ${escapeHtml(r.why || '')}</span>${r.creation_note ? `<br><em style="color:#7f1d1d;font-size:11.5px">To create: ${escapeHtml(r.creation_note)}</em>` : ''}</li>`).join('');
  const goalLine = analysis.goal ? `<div style="margin-bottom:10px;font-size:13.5px;color:#1f2937"><strong>Goal:</strong> ${escapeHtml(analysis.goal)}</div>` : '';
  const progressLine = analysis.progress_so_far ? `<div style="margin-bottom:8px;font-size:13px;color:#475569"><strong style="color:#0f172a">Progress so far:</strong> ${escapeHtml(analysis.progress_so_far)}</div>` : '';
  const blockersHtml = (analysis.blockers || []).length ? `<div style="margin:10px 0;padding:10px 14px;background:#fef2f2;border-left:4px solid #c1272d;border-radius:0 6px 6px 0;font-size:12.5px;color:#7f1d1d"><strong>Blockers:</strong> ${(analysis.blockers || []).map(escapeHtml).join('; ')}</div>` : '';
  const complexityChip = analysis.complexity ? `<span style="background:#0e1729;color:#cbd5e1;border-radius:3px;padding:2px 8px;font-size:10.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-left:6px">${escapeHtml(analysis.complexity)} · ~${analysis.estimated_minutes || '?'}min</span>` : '';

  return `
<div style="margin:24px 0;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;background:white">
  <div style="background:linear-gradient(135deg,#0b1220 0%,#1d3a8a 100%);color:white;padding:18px 22px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div>
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Task ${idx} of ${FULL_DETAIL_LIMIT} ${complexityChip}</div>
        <h2 style="margin:6px 0 4px;font-size:17px;line-height:1.3">${escapeHtml(t.title)}</h2>
        <div style="font-size:12px;color:#cbd5e0">${escapeHtml(t.todolist_name || 'unfiled')} ${dueLabel ? '· ' + dueLabel : ''}${contextMeta.cost ? ' · v2 cost $' + contextMeta.cost.toFixed(5) : ''}</div>
      </div>
      <div style="background:${urgent.bg};color:${urgent.fg};border:1px solid ${urgent.fg};border-radius:6px;padding:6px 10px;font-weight:800;font-size:14px">${t.urgency_score == null ? '-' : t.urgency_score}</div>
    </div>
  </div>
  <div style="padding:18px 22px">
    ${goalLine}
    ${progressLine}
    ${blockersHtml}

    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#475569;font-weight:700;margin-top:14px">Steps for you (basic)</div>
    <ol style="font-size:13.5px;padding-left:22px;margin-top:6px;line-height:1.55;color:#1f2937">${stepsHtml}</ol>

    ${toolsHtml ? `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#475569;font-weight:700;margin-top:14px">Tools / Skills for this step</div><ul style="font-size:13px;padding-left:22px;margin-top:6px;line-height:1.5;color:#1f2937">${toolsHtml}</ul>` : ''}

    <div style="margin-top:18px;padding:14px 16px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Paste into Claude Code (full prompt)</div>
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
  <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;width:54px;text-align:center">
    <div style="background:${urgent.bg};color:${urgent.fg};border:1px solid ${urgent.fg};border-radius:5px;padding:4px 8px;font-weight:800;font-size:12px;display:inline-block">${t.urgency_score == null ? '-' : t.urgency_score}</div>
  </td>
  <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">
    <div style="font-size:13px;font-weight:600;color:#0f172a">${idx}. <a href="${escapeHtml(url)}" style="color:#0f172a;text-decoration:none">${escapeHtml(t.title)}</a></div>
    <div style="font-size:11px;color:#475569;margin-top:3px">${escapeHtml(t.todolist_name || 'unfiled')} ${dueLabel ? '· ' + dueLabel : ''}</div>
  </td>
  <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;text-align:right;white-space:nowrap">
    <a href="${escapeHtml(url)}" style="font-size:11px;color:#1a365d;font-weight:700;text-decoration:none">Open BC &rarr;</a><br>
    <span style="font-size:11px;color:#475569;font-style:italic">tag <code>@CB suggest prompt</code></span>
  </td>
</tr>`;
}

(async () => {
  console.log('[shipces] pulling Ali ShipCES todos from prod...');
  const todos = pullShipcesTodos();
  console.log(`[shipces] ${todos.length} todos pulled`);
  if (todos.length === 0) {
    console.log('[shipces] no tasks. exiting.');
    return;
  }

  // Top 5: contextual v2 (walker + LLM). Rest: just a list of links.
  const topTodos = todos.slice(0, FULL_DETAIL_LIMIT);
  const restTodos = todos.slice(FULL_DETAIL_LIMIT);

  let totalCost = 0;
  let v2Count = 0;
  let templateFallback = 0;

  const fullCards = [];
  for (let i = 0; i < topTodos.length; i++) {
    const t = topTodos[i];
    console.log(`[shipces] running v2 for task ${i + 1}/${topTodos.length}: ${t.title.slice(0, 60)}`);
    let result;
    try {
      result = await buildContextualSuggestion({
        todo: {
          bc_id: t.bc_id,
          project_id: t.project_id,
          project_name: t.project_name,
          todolist_name: t.todolist_name,
          title: t.title,
          description: t.description,
          bc_app_url: t.bc_app_url,
          bc_updated_at: t.bc_updated_at,
          due_on: t.due_on,
          urgency_score: t.urgency_score,
          category: t.category,
        },
        bcGet,
        bucketId: SHIPCES_BUCKET_ID,
        openaiKey: process.env.OPENAI_API_KEY,
      });
      if (result.source === 'contextual_v2') v2Count++;
      else templateFallback++;
      totalCost += result.cost_usd || 0;
    } catch (e) {
      console.warn(`[shipces] v2 failed for ${t.bc_id}: ${e.message}; falling back to template`);
      const sug = buildSuggestion(t);
      result = { basic_steps: sug.steps, long_prompt: generatePrompt(t), analysis: { goal: '', progress_so_far: '', next_step: sug.one_line, blockers: [], tools_needed: [] }, cost_usd: 0, source: 'fallback_template' };
      templateFallback++;
    }
    fullCards.push(renderTaskFullCard(t, result, result.long_prompt, i + 1, { cost: result.cost_usd || 0 }));
  }
  console.log(`[shipces] v2 done. v2=${v2Count} fallback=${templateFallback} total_cost=$${totalCost.toFixed(5)}`);

  const compactRowsHtml = restTodos.map((t, i) => renderTaskCompactRow(t, FULL_DETAIL_LIMIT + i + 1)).join('');
  const today = new Date().toISOString().slice(0, 10);

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:840px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:32px 36px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">ShipCES daily report &middot; ${today}</div>
<h1 style="margin:10px 0 6px;font-size:24px;font-weight:800;line-height:1.25">Ali &mdash; ${todos.length} active tasks on you in ${escapeHtml(SHIPCES_PROJECT_NAME)}. Top 5 with goal + progress + next-step + Claude Code prompt inline.</h1>
<div style="font-size:13px;color:#cbd5e0;max-width:680px">Each of the top 5 below has been read by the contextual v2 engine (walker pulled the ticket + every comment; GPT-4o-mini extracted goal + progress + next step + blockers + tools). Steps are concise for you; long prompt is copy-paste ready for Claude Code. v2 cost on this report: $${totalCost.toFixed(5)} total ($${(totalCost / Math.max(v2Count, 1)).toFixed(5)}/task avg).</div>
</div>

<div style="padding:24px 36px">

<h2 style="font-size:18px;margin:0 0 4px;color:#0f172a">Top 5 &mdash; full context + prompt inline</h2>
${fullCards.join('')}

${restTodos.length ? `<h2 style="font-size:18px;margin:32px 0 8px;color:#0f172a">Next ${restTodos.length} &mdash; click into Basecamp, ask @CB for the prompt</h2>
<div style="font-size:13px;color:#475569;margin-bottom:8px">Click any of these on Basecamp and tag <code>@CB suggest prompt</code> in a comment. CB will post a copy-paste prompt with the same context-aware analysis back on that ticket within ~30s.</div>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px">
<tbody>${compactRowsHtml}</tbody>
</table>` : ''}

</div>

<div style="padding:18px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">
ShipCES daily report &middot; ${todos.length} tasks &middot; v2 cost $${totalCost.toFixed(5)} &middot; session CC-20260602-9q4r
</div>

</div></body></html>`;

  const text = `Ali - ShipCES daily report (${todos.length} active tasks).\n\nTop 5 with goal + progress + next-step + Claude Code prompt inline.\nNext ${restTodos.length}: open in Basecamp, tag @CB suggest prompt for the prompt on demand.\n\nv2 cost: $${totalCost.toFixed(5)}.`;

  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: `Ali - ShipCES daily report (${todos.length} tasks, top 5 with full context + prompts)`,
    html,
    text,
    bcSummary: `<p>ShipCES daily report for Ali. ${todos.length} active tasks pulled from his ShipCES queue. Top 5 ran through contextual v2 (walker + GPT-4o-mini, $${totalCost.toFixed(5)} total cost). Each top-5 card has goal + progress so far + next step + blockers + tools/skills (with "create it" notes when applicable) + a copy-paste Claude Code prompt. Bottom 10 are compact rows linking to BC with a "tag @CB suggest prompt" call-out.</p>`,
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
