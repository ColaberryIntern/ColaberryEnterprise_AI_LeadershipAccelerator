#!/usr/bin/env node
/**
 * runContextualSuggestionDemo.js
 *
 * Side-by-side demo: pulls one of Ali's actual BC todos, runs BOTH the
 * current template-based suggestion AND the new contextual v2 service,
 * generates an HTML doc showing the diff, emails Ali via sendWithBcAttach
 * to ticket 9953889114 so he can compare directly.
 *
 * Default target todo is "Plan: Inbox Manager v1" (bc_id 9942229201) since
 * Ali screenshotted that one specifically. Override via --bc-id.
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

const ARGS = process.argv.slice(2);
const FLAG_VAL = (n) => { const i = ARGS.indexOf(n); return i >= 0 && i + 1 < ARGS.length ? ARGS[i + 1] : null; };
const BC_ID = FLAG_VAL('--bc-id') || '9942229201';
const BUCKET_ID = FLAG_VAL('--bucket') || '7463955';

// Build a minimal bcGet over the prod BC token so the walker works locally.
async function bcGet(urlOrPath) {
  const token = process.env.BASECAMP_ACCESS_TOKEN.replace(/^Bearer /, '');
  const account = process.env.BASECAMP_ACCOUNT_ID || '3945211';
  const base = `https://3.basecampapi.com/${account}`;
  const u = urlOrPath.startsWith('http') ? urlOrPath : `${base}${urlOrPath}`;
  const r = await fetch(u, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Colaberry Contextual Suggestion Demo',
      Accept: 'application/json',
    },
  });
  if (!r.ok) throw new Error(`BC ${u} -> ${r.status}`);
  return r.json();
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderComparisonHtml({ todo, templateSuggestion, templatePrompt, contextual }) {
  const templateBasic = templateSuggestion.steps.slice(0, 5);
  const analysis = contextual.analysis;
  const contextualBasic = contextual.basic_steps;
  const toolsRows = (analysis.tools_needed || []).map((t) => `
<tr>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:${t.exists === false ? '#7f1d1d' : '#14532d'}">${escapeHtml(t.name)}${t.exists === false ? ' <span style="font-size:10px;background:#fee2e2;color:#7f1d1d;padding:1px 6px;border-radius:3px;margin-left:4px">create</span>' : ''}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12.5px">${escapeHtml(t.why || '')}${t.creation_note ? `<div style="margin-top:4px;font-size:11.5px;color:#7f1d1d"><em>To create:</em> ${escapeHtml(t.creation_note)}</div>` : ''}</td>
</tr>`).join('');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:1080px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#0b1220 0%,#1d3a8a 100%);color:white;padding:32px 36px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Suggestion architecture · v0 worked example</div>
<h1 style="margin:10px 0 6px;font-size:24px;font-weight:800;line-height:1.25">Same BC ticket, two suggestion engines. Template (current) vs Contextual v2 (proposed).</h1>
<div style="font-size:14px;color:#cbd5e0;max-width:780px">${escapeHtml(todo.title)} &middot; <a href="${escapeHtml(todo.bc_app_url)}" style="color:#fbbf24">${escapeHtml(todo.bc_app_url)}</a></div>
</div>

<div style="padding:24px 36px">

<h2 style="font-size:17px;margin:0 0 8px;color:#0f172a">What the contextual engine extracted from the ticket</h2>
<p style="font-size:13px;color:#475569;margin-top:0">From ${contextual.context_used_chars.toLocaleString()} chars of context (title + description + every BC comment + linked docs). One GPT-4o-mini call. Cost: $${contextual.cost_usd?.toFixed(5) || '0.00000'}.</p>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px;margin-top:10px">
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:700;width:160px;color:#475569">Goal</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${escapeHtml(analysis.goal || '')}</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:700;color:#475569">Progress so far</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${escapeHtml(analysis.progress_so_far || '')}</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:700;color:#475569">Last action</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${escapeHtml(analysis.last_action || '')}</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:700;color:#475569">Next step</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:600">${escapeHtml(analysis.next_step || '')}</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:700;color:#475569">Blockers</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${(analysis.blockers || []).length ? (analysis.blockers || []).map((b) => `<div>&middot; ${escapeHtml(b)}</div>`).join('') : '<em style="color:#475569">none</em>'}</td></tr>
<tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;color:#475569">Complexity / time</td><td style="padding:10px 14px"><strong>${escapeHtml(analysis.complexity || '?')}</strong> &middot; ~${analysis.estimated_minutes || '?'} min</td></tr>
</tbody>
</table>

<h3 style="font-size:14px;margin:18px 0 6px;color:#0f172a">Tools / Skills suggested</h3>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:30%">Tool</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px">Why it fits this step</th>
</tr></thead>
<tbody>${toolsRows || '<tr><td colspan="2" style="padding:14px;color:#475569;text-align:center"><em>(none recommended)</em></td></tr>'}</tbody>
</table>

<h2 style="font-size:17px;margin:32px 0 8px;color:#0f172a">Side-by-side: basic steps in the email</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px">
<tr>
<td style="vertical-align:top;width:50%;padding:14px;background:#fee2e2;border:1px solid #fca5a5;border-radius:8px 0 0 8px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7f1d1d;font-weight:700">CURRENT (template)</div>
<div style="font-size:13.5px;margin-top:6px;font-weight:700;color:#7f1d1d">"${escapeHtml(templateSuggestion.action_kind.toUpperCase())}"</div>
<ol style="padding-left:22px;margin-top:8px;color:#1f2937">${templateBasic.map((s) => `<li style="margin-bottom:4px">${escapeHtml(s)}</li>`).join('')}</ol>
<div style="margin-top:10px;font-size:11px;color:#7f1d1d;font-style:italic">Same 5 steps for every "decision" task. No reference to what this ticket is actually about.</div>
</td>
<td style="vertical-align:top;width:50%;padding:14px;background:#dcfce7;border:1px solid #86efac;border-radius:0 8px 8px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#14532d;font-weight:700">PROPOSED (contextual v2)</div>
<div style="font-size:13.5px;margin-top:6px;font-weight:700;color:#14532d">"${escapeHtml((analysis.goal || '').slice(0, 80))}..."</div>
<ol style="padding-left:22px;margin-top:8px;color:#1f2937">${contextualBasic.map((s) => `<li style="margin-bottom:4px">${escapeHtml(s)}</li>`).join('')}</ol>
<div style="margin-top:10px;font-size:11px;color:#14532d;font-style:italic">Steps reference the actual goal + last action + concrete next thing. Tools listed are specific to this task.</div>
</td>
</tr>
</table>

<h2 style="font-size:17px;margin:32px 0 8px;color:#0f172a">Side-by-side: the long prompt behind the Copy button</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px">
<tr>
<td style="vertical-align:top;width:50%;padding:14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px 0 0 8px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7f1d1d;font-weight:700">CURRENT</div>
<pre style="background:#0b1220;color:#cbd5e1;border:1px solid #1d2a44;border-radius:6px;padding:10px;font-size:10.5px;line-height:1.45;margin-top:8px;overflow:auto;max-height:480px;white-space:pre-wrap;word-break:break-word;font-family:Menlo,Consolas,monospace">${escapeHtml(templatePrompt)}</pre>
</td>
<td style="vertical-align:top;width:50%;padding:14px;background:#f0fdf4;border:1px solid #86efac;border-radius:0 8px 8px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#14532d;font-weight:700">PROPOSED</div>
<pre style="background:#0b1220;color:#cbd5e1;border:1px solid #1d2a44;border-radius:6px;padding:10px;font-size:10.5px;line-height:1.45;margin-top:8px;overflow:auto;max-height:480px;white-space:pre-wrap;word-break:break-word;font-family:Menlo,Consolas,monospace">${escapeHtml(contextual.long_prompt)}</pre>
</td>
</tr>
</table>

<h2 style="font-size:17px;margin:32px 0 8px;color:#0f172a">Cost + cadence + fallback</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Per-task cost</strong>: ~$${contextual.cost_usd?.toFixed(5) || '?'} on GPT-4o-mini for this one. Budget ceiling: $1/day. At 50 tasks/day you spend ~$0.10 with this model, ~$1 with GPT-4o.</li>
<li><strong>Cadence</strong>: cache for 30 min keyed on (bc_id, bc_updated_at). Re-running the same task in the same window is free.</li>
<li><strong>Fallback</strong>: any LLM error returns the deterministic template (current behavior), so the email always ships <em>something</em>.</li>
<li><strong>Cap</strong>: context trimmed to 60K chars (~15K tokens in). Oldest comments dropped first; head + tail kept since the goal lives at the start and the next-step lives at the end.</li>
</ul>

<h2 style="font-size:17px;margin:32px 0 8px;color:#0f172a">Next moves (your call)</h2>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Wire v2 into the daily "Your Turn" digest</strong> &mdash; replace the template for the top 5 cards. Compact rows for tasks 6-N stay template-based (cheap + no LLM cost) since they're "tag @CB on Basecamp" links anyway.</li>
<li><strong>Wire v2 into <code>/admin/ops</code> workspace</strong> &mdash; when you click Open Workspace, the right column shows the contextual analysis instead of the generic action recipe.</li>
<li><strong>Wire v2 into the <code>@CB suggest_prompt</code> tool</strong> &mdash; when you tag <code>@CB suggest prompt</code> in BC, the comment posted back is the contextual v2 output, not the template.</li>
</ol>
<p style="font-size:14px">If the analysis on this one task feels right, I do all three in one bundle. ~2 hours of work, deploy mid-afternoon, you spot-check 5 tasks before I light up the daily cron.</p>

</div>

<div style="padding:18px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">
Ali &middot; worked example on bc_id ${todo.bc_id}. Session CC-20260602-9q4r into 2026-06-03.
</div>

</div></body></html>`;
}

(async () => {
  console.log(`[demo] target todo bc_id=${BC_ID} bucket=${BUCKET_ID}`);
  // Pull the todo metadata
  const todoRaw = await bcGet(`/buckets/${BUCKET_ID}/todos/${BC_ID}.json`);
  const todo = {
    bc_id: String(todoRaw.id),
    project_id: BUCKET_ID,
    project_name: todoRaw.bucket?.name || null,
    todolist_name: todoRaw.parent?.title || null,
    title: todoRaw.title || '',
    description: todoRaw.description || todoRaw.content || '',
    bc_app_url: todoRaw.app_url || null,
    bc_updated_at: todoRaw.updated_at || new Date().toISOString(),
    due_on: todoRaw.due_on || null,
    urgency_score: null,
    category: 'unscored',
  };
  console.log(`[demo] todo: ${todo.title}`);

  // 1. Template version
  const templateSug = buildSuggestion(todo);
  const templatePrompt = generatePrompt(todo);

  // 2. Contextual v2 version
  if (!process.env.OPENAI_API_KEY) {
    console.error('[demo] OPENAI_API_KEY not set. Cannot run contextual v2. Aborting.');
    process.exit(1);
  }
  console.log('[demo] running contextual v2 (walker + LLM comprehension)...');
  const contextual = await buildContextualSuggestion({
    todo,
    bcGet,
    bucketId: BUCKET_ID,
    openaiKey: process.env.OPENAI_API_KEY,
  });
  console.log(`[demo] contextual done. source=${contextual.source}, context=${contextual.context_used_chars} chars, cost=$${contextual.cost_usd}`);

  // 3. Render comparison HTML
  const html = renderComparisonHtml({ todo, templateSuggestion: templateSug, templatePrompt, contextual });
  const outPath = path.resolve(__dirname, '../../../docs/contextual-suggestion-demo-2026-06-03.html');
  fs.writeFileSync(outPath, html);
  console.log(`[demo] wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  // 4. Email Ali
  const teaserHtml = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:720px;margin:0 auto;background:white">
<div style="background:linear-gradient(135deg,#0b1220 0%,#1d3a8a 100%);color:white;padding:24px 28px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Architecture critique addressed</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.25">Contextual Suggestion v2 - worked example on your Inbox Manager v1 ticket</h1>
<div style="font-size:13px;color:#cbd5e0">You said the suggestions were off because the AI was not pulling context first. Built v2: walker pulls full ticket history, GPT-4o-mini extracts {goal, progress, last_action, next_step, blockers, tools_needed}, prompt assembles from THAT - not from a template. Side-by-side comparison attached.</div>
</div>
<div style="padding:24px 28px">
<p style="font-size:14px"><strong>What's in the attached comparison HTML:</strong></p>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li>The extracted analysis (goal / progress / last action / next step / blockers / tools / complexity / estimated minutes) for the Inbox Manager v1 task</li>
<li>Side-by-side basic steps (template current vs contextual v2)</li>
<li>Side-by-side long prompt (the one that goes behind the Copy button)</li>
<li>Cost + cadence + fallback architecture</li>
</ol>
<p style="font-size:14px"><strong>Per-task cost on GPT-4o-mini</strong>: $${contextual.cost_usd?.toFixed(5)}. <strong>Context used</strong>: ${contextual.context_used_chars.toLocaleString()} chars. <strong>Cached for 30 min</strong> so re-runs are free.</p>
<p style="font-size:14px">If the analysis looks right, I bundle wiring v2 into (a) the daily Your-Turn digest top 5, (b) the /admin/ops workspace right column, (c) the @CB suggest_prompt tool. ~2 hours.</p>
</div>
<div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">Ali</div>
</div></body></html>`;

  const teaserText = `Ali - contextual suggestion v2 worked example attached.

Architecture: walker pulls full ticket context -> GPT-4o-mini extracts {goal, progress_so_far, last_action, next_step, blockers, tools_needed} -> prompt assembled from THAT, not from a regex template.

Cost on this task: $${contextual.cost_usd?.toFixed(5)} (GPT-4o-mini). Context used: ${contextual.context_used_chars.toLocaleString()} chars. Cached 30 min so re-runs are free. Falls back to deterministic template if LLM errors.

If the analysis on this one task feels right, I wire v2 into (a) daily Your-Turn top 5, (b) /admin/ops workspace, (c) @CB suggest_prompt - all in one bundle, ~2 hours.

Side-by-side comparison HTML attached.

Ali`;

  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: `Ali - Contextual Suggestion v2 worked example on "${todo.title.slice(0, 60)}" (your critique addressed)`,
    html: teaserHtml,
    text: teaserText,
    attachments: [
      { filename: 'contextual-suggestion-demo-2026-06-03.html', content: fs.readFileSync(outPath), contentType: 'text/html' },
    ],
    vaultAttachments: [
      { filename: 'contextual-suggestion-demo-2026-06-03.html', content: fs.readFileSync(outPath), contentType: 'text/html', vaultDescription: 'Side-by-side comparison: template suggestion (current) vs contextual v2 (proposed) on the Inbox Manager v1 BC todo. Includes extracted analysis, basic steps for email, long prompt for Copy button, cost + cadence + fallback design.' },
    ],
    bcSummary: '<p>Built <code>buildContextualSuggestionV2</code> per Ali\'s critique that the current template-based suggestions are off (no context, no goal awareness, no progress awareness). New pipeline: CB walker pulls full ticket context -> GPT-4o-mini extracts JSON {goal, progress_so_far, last_action, next_step, blockers, tools_needed[]} -> deterministic prompt assembly from that JSON. Cost ~$0.001 per task, cached 30 min, falls back to template on LLM error. Worked example on Inbox Manager v1 ticket attached as side-by-side HTML.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
  console.log('Vault uploads:', r.vaultUploads?.length);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
