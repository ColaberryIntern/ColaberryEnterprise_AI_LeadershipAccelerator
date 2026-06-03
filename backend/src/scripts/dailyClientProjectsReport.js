#!/usr/bin/env node
// Daily Client Projects Report — AI Pathway / ShipCES / LandJet.
// One email per project. Same shape as Gov Contracts v2: sequence-sorted task
// list, NEXT HUMAN STEP callout with click-through, due-date pills, tier pills,
// "What you can do from here" block. Adds an LLM-generated project-goal
// summary at the top that connects the next-human-step to the overall project.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const OpenAI = require(path.resolve(__dirname, '../../../node_modules/openai')).default;
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));
const recorder = require(path.resolve(__dirname, './lib/reportRunRecorder'));

const BASECAMP_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const BASE = 'https://3.basecampapi.com/3945211';
const H = { Authorization: 'Bearer ' + BASECAMP_TOKEN, 'User-Agent': 'Colaberry Client Projects', Accept: 'application/json' };

const RECIPIENT = 'ali@colaberry.com';
const BASE_CC = ['alimuwwakkil@gmail.com', 'ram@colaberry.com'];
const TEST = process.argv.includes('--test');
const DRY = process.argv.includes('--dry');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
// When set, runs the contextual v2 analysis on the nextHuman task only and
// surfaces basic steps + a "copy long prompt" button below the YOUR TURN
// banner. The long prompt itself is NOT inlined in the email — it ships
// as a .txt attachment so the operator opens it once + copies.
const WITH_CONTEXTUAL = process.argv.includes('--with-contextual');
const CC_ADD = (process.argv.find((a) => a.startsWith('--cc-add='))?.slice('--cc-add='.length) || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const CC = Array.from(new Set([...BASE_CC, ...CC_ADD]));

const PROJECTS = [
  { id: 46697389, name: 'AI Pathway',   shortName: 'AI Pathway' },
  { id: 47126345, name: 'ShipCES',      shortName: 'ShipCES' },
  { id: 46699826, name: 'LandJet',      shortName: 'LandJet' },
];

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
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

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function shortDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

// Classify a task as HUMAN / AI / EITHER. Tuned for client work (vs. Gov bids).
const HUMAN_PATTERNS = [
  /meeting|sync|call|demo|review with|present to|walkthrough/i,
  /decide|approval|approve|sign.off|go.no.go|authorize/i,
  /negotiate|relationship|escalate|client (call|response|approval)/i,
  /pay|invoice|wire|contract|legal|sow|nda/i,
  /interview|hire|onboard.*staff/i,
];
const AI_PATTERNS = [
  /draft|generate|write|compile|summarize|extract/i,
  /build|code|implement|develop|deploy|ship/i,
  /test|qa|validate.*data/i,
  /analyze|analysis|score|rank|rate|benchmark/i,
  /research|investigate|find|cross.ref/i,
  /design|wireframe|prototype|mock/i,
  /pull|fetch|retrieve|sync|migrate/i,
  /document|update.*docs|create.*spec/i,
];
function classify(content, description) {
  const text = (content + ' ' + stripHtml(description)).toLowerCase();
  const humanScore = HUMAN_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  const aiScore = AI_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  // If clearly human-tier (multiple human patterns, or human > AI), mark HUMAN
  if (humanScore > aiScore && humanScore > 0) return 'HUMAN';
  if (aiScore > 0) return 'AI';
  // Default: AI. Per Ali 2026-06-01 - if it's not clearly human-only, CB
  // can draft a first pass. Email badges align with runner's tier logic.
  return 'AI';
}
function suggestOwner(content, assignees) {
  const c = content.toLowerCase();
  if (/sign|legal|nda|contract|sow/i.test(c)) return 'Ali (legal signoff)';
  if (/decide|approve|go.no.go|authorize/i.test(c)) return 'Ali (executive decision)';
  if (/call|meeting|negotiat|demo/i.test(c)) return assignees || 'Ali';
  if (/pay|wire|invoice/i.test(c)) return 'Rashi (finance)';
  return assignees || 'Ali (default)';
}

// Due-date pill (HTML)
function duePill(due_on) {
  if (!due_on) return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#1c1917;color:#fbbf24;letter-spacing:0.5px">NO DUE DATE</span>';
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = due_on < today;
  const daysOut = Math.round((new Date(due_on).getTime() - Date.now()) / 86400000);
  if (isOverdue) return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#dc2626;color:white">OVERDUE ${due_on}</span>`;
  if (daysOut <= 7) return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#ca8a04;color:white">DUE ${due_on}</span>`;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#e2e8f0;color:#475569">due ${due_on}</span>`;
}
function tierPill(tier) {
  if (tier === 'HUMAN') return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#fef3c7;color:#7c2d12;letter-spacing:0.5px">HUMAN</span>';
  if (tier === 'AI') return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#dbeafe;color:#1e3a8a;letter-spacing:0.5px">AI</span>';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#f1f5f9;color:#334155;letter-spacing:0.5px">EITHER</span>';
}

// =============================================================================
// Per-project fetch + analyze
// =============================================================================

function loadCbDraftedSet(projectId) {
  try {
    const s = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../tmp/cb-ai-runner-state-${projectId}.json`), 'utf8'));
    return new Set(Object.keys(s.tasks || {}).map(String));
  } catch { return new Set(); }
}

async function analyzeProject(p) {
  const project = await bcGet(`/projects/${p.id}.json`);
  const dock = project.dock || [];
  const todoset = dock.find((d) => d.name === 'todoset');
  const mb = dock.find((d) => d.name === 'message_board');
  const cbDrafted = loadCbDraftedSet(p.id);

  // Pull all todolists + their open todos + recently-completed
  const lists = todoset ? await bcGetAll(`/buckets/${p.id}/todosets/${todoset.id}/todolists.json`) : [];
  const openTodos = [];
  const completedByList = new Map();
  const cutoffMs = Date.now() - 7 * 86400000;
  for (const list of lists) {
    if (list.completed) continue;
    try {
      const todos = await bcGetAll(`/buckets/${p.id}/todolists/${list.id}/todos.json?status=remaining`);
      for (const t of todos) {
        openTodos.push({
          id: t.id,
          content: stripHtml(t.content),
          description: t.description,
          due_on: t.due_on,
          created_at: t.created_at,
          app_url: t.app_url,
          assignees: (t.assignees || []).map((a) => a.name).join(', '),
          listId: list.id,
          listName: list.name,
          tier: classify(t.content, t.description),
          cbDrafted: cbDrafted.has(String(t.id)),
        });
      }
      // Recently completed (last 7 days) per list
      const done = await bcGetAll(`/buckets/${p.id}/todolists/${list.id}/todos.json?completed=true`);
      const recent = (done || [])
        .filter((t) => t.completion?.created_at && new Date(t.completion.created_at).getTime() >= cutoffMs)
        .map((t) => ({
          id: t.id, content: stripHtml(t.content), app_url: t.app_url,
          completed_at: t.completion.created_at,
          completedBy: t.completion?.creator?.name || 'unknown',
        }))
        .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
      completedByList.set(list.id, recent);
    } catch (_e) {}
  }

  // Sort by due_on ASC (nulls last), then created_at ASC. Same rule as Gov v2.
  openTodos.sort((a, b) => {
    if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on && !b.due_on) return -1;
    if (!a.due_on && b.due_on) return 1;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });
  for (const t of openTodos) t.suggestedOwner = suggestOwner(t.content, t.assignees);

  // Identify next human step + next overall
  const nextStep = openTodos[0] || null;
  const nextHuman = openTodos.find((t) => t.tier === 'HUMAN') || null;

  // Recent MB activity
  let recentMessages = [];
  if (mb) {
    try {
      const msgs = await bcGetAll(`/buckets/${p.id}/message_boards/${mb.id}/messages.json`);
      recentMessages = msgs.slice(0, 5).map((m) => ({
        id: m.id,
        subject: m.subject,
        created_at: m.created_at,
        app_url: m.app_url,
        excerpt: stripHtml(m.content || '').slice(0, 280),
      }));
    } catch (_e) {}
  }

  // Project description (clean)
  const description = stripHtml(project.description || '');

  return {
    projectId: p.id,
    projectName: project.name,
    shortName: p.shortName,
    appUrl: `https://app.basecamp.com/3945211/projects/${p.id}`,
    description,
    todolists: lists,
    openTodos,
    completedByList,
    nextStep,
    nextHuman,
    recentMessages,
    lastMessageAt: recentMessages[0]?.created_at || null,
  };
}

// =============================================================================
// LLM goal + next-step framing
// =============================================================================

async function generateProjectFraming(analysis) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      goal: analysis.description || `Active client project: ${analysis.projectName}.`,
      nextStepImportance: analysis.nextHuman
        ? `This is the next human action gating progress. Without it, work behind it is stuck.`
        : `No human action is currently required. Project is either fully unblocked, idle, or complete.`,
    };
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ctx = [
    `Project: ${analysis.projectName}`,
    analysis.description ? `Description: ${analysis.description}` : '',
    analysis.recentMessages.length > 0 ? `Recent message board (last 5):` : '',
    ...analysis.recentMessages.map((m) => `- [${(m.created_at || '').slice(0, 10)}] ${m.subject}: ${m.excerpt}`),
    '',
    `Open tasks (${analysis.openTodos.length}):`,
    ...analysis.openTodos.slice(0, 10).map((t) => `- ${t.tier}: ${t.content}${t.due_on ? ` (due ${t.due_on})` : ''}`),
    '',
    analysis.nextHuman
      ? `The next HUMAN task in execution order is: "${analysis.nextHuman.content}"${analysis.nextHuman.due_on ? ` (due ${analysis.nextHuman.due_on})` : ''}.`
      : `There are no HUMAN tasks open. ${analysis.openTodos.length === 0 ? 'Zero open tasks total.' : 'All remaining tasks are AI-doable or unclassified.'}`,
  ].filter(Boolean).join('\n');

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You produce a tight 2-3 sentence executive briefing for a Managing Director (Ali Muwwakkil) about a single client project. The brief connects the next human action to the overall goal of the project. Be concrete, direct, no fluff, no em-dashes. Output as JSON: {"goal": "<1 sentence about what the project is trying to accomplish>", "nextStepImportance": "<2 sentences max about why the next human task matters and what is blocked behind it>"}' },
        { role: 'user', content: ctx },
      ],
      response_format: { type: 'json_object' },
    });
    const out = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    return {
      goal: stripEmDashes(out.goal || `Active client project: ${analysis.projectName}.`),
      nextStepImportance: stripEmDashes(out.nextStepImportance || 'No additional context.'),
    };
  } catch (e) {
    console.warn(`[client-report] LLM framing failed for ${analysis.projectName}: ${e.message}`);
    return {
      goal: analysis.description || `Active client project: ${analysis.projectName}.`,
      nextStepImportance: analysis.nextHuman ? `Next human action: ${analysis.nextHuman.content}.` : 'No human action currently required.',
    };
  }
}

// =============================================================================
// HTML render
// =============================================================================

function renderHtml(analysis, framing) {
  const today = new Date().toISOString().slice(0, 10);
  const totalOpen = analysis.openTodos.length;
  const totalHuman = analysis.openTodos.filter((t) => t.tier === 'HUMAN').length;
  const totalAi = analysis.openTodos.filter((t) => t.tier === 'AI').length;
  const totalEither = analysis.openTodos.filter((t) => t.tier === 'EITHER').length;
  const overdue = analysis.openTodos.filter((t) => t.due_on && t.due_on < today);
  const noDueDate = analysis.openTodos.filter((t) => !t.due_on);
  const daysSinceLastMessage = analysis.lastMessageAt ? Math.round((Date.now() - new Date(analysis.lastMessageAt).getTime()) / 86400000) : null;

  const nextStepCallout = (() => {
    if (totalOpen === 0) {
      return `<div style="margin-top:14px;background:#dcfce7;padding:14px 18px;border-radius:8px;border-left:4px solid #16a34a">
  <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#166534;font-weight:700">All clear</div>
  <div style="font-size:14px;color:#14532d;margin-top:4px">Zero open tasks. ${daysSinceLastMessage != null ? `Last message-board activity: ${daysSinceLastMessage} days ago.` : ''} ${daysSinceLastMessage != null && daysSinceLastMessage > 30 ? 'This project may be stalled - consider a check-in.' : ''}</div>
</div>`;
    }
    if (analysis.nextHuman) {
      return `<div style="margin-top:14px;background:#1c1917;color:white;padding:18px 22px;border-radius:8px;border-left:4px solid #fbbf24">
  <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Next step waiting on a human</div>
  <a href="${analysis.nextHuman.app_url}" style="display:block;font-size:17px;color:white;text-decoration:none;font-weight:700;margin-top:6px;line-height:1.3">${escape(analysis.nextHuman.content)}</a>
  <div style="margin-top:8px;font-size:12px;color:#cbd5e0">${duePill(analysis.nextHuman.due_on)} &middot; in list: <strong style="color:white">${escape(analysis.nextHuman.listName)}</strong> &middot; suggested owner: <strong style="color:white">${escape(analysis.nextHuman.suggestedOwner)}</strong></div>
  <div style="margin-top:14px"><a href="${analysis.nextHuman.app_url}" style="display:inline-block;background:#fbbf24;color:#1c1917;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Open ticket &rarr;</a></div>
  <div style="margin-top:12px;font-size:12px;color:#cbd5e0;line-height:1.5"><em>${escape(framing.nextStepImportance)}</em></div>
</div>`;
    }
    // No human step but tasks exist (all AI-doable)
    return `<div style="margin-top:14px;background:#dbeafe;padding:14px 18px;border-radius:8px;border-left:4px solid #1e3a8a">
  <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#1e3a8a;font-weight:700">All open tasks are AI-doable</div>
  <div style="font-size:14px;color:#1e3a8a;margin-top:4px">No human gating action. CB System (v1.1 auto-runner) will pick these up. Until that ships, tag <code style="background:#1f2937;color:#fbbf24;padding:1px 5px;border-radius:3px">@CB System execute &lt;task&gt;</code> in any thread to run one.</div>
</div>`;
  })();

  const fullSequence = totalOpen === 0 ? '' : `
<h2 style="color:#1a365d;font-size:18px;margin:24px 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Open tasks in execution order (${totalOpen})</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0">
<thead><tr style="background:#1a365d;color:white">
<th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">#</th>
<th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">Task</th>
<th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">List</th>
<th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">Due</th>
<th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">Tier</th>
<th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">Owner</th>
</tr></thead>
<tbody>
${analysis.openTodos.map((t, i) => {
  const isNext = t.id === (analysis.nextHuman?.id || analysis.nextStep?.id);
  return `<tr style="background:${isNext ? '#fef9c3' : (i % 2 === 0 ? '#f8fafc' : 'white')}">
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:700">${i + 1}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><a href="${t.app_url}" style="color:#1a365d;font-weight:600;text-decoration:none">${escape(t.content)}</a></td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${escape(t.listName)}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${duePill(t.due_on)}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${tierPill(t.tier)}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${escape(t.suggestedOwner || '')}</td>
</tr>`;
}).join('')}
</tbody></table>`;

  const overdueSection = overdue.length === 0 ? '' : `
<h2 style="color:#991b1b;font-size:18px;margin:24px 0 12px;border-bottom:2px solid #dc2626;padding-bottom:6px">Overdue (${overdue.length})</h2>
<ul style="font-size:13px;margin:0 0 0 18px;padding:0;color:#475569">
${overdue.map((t) => `<li style="margin-bottom:4px"><a href="${t.app_url}" style="color:#1a365d;text-decoration:none;font-weight:600">${escape(t.content)}</a> ${duePill(t.due_on)}</li>`).join('')}
</ul>`;

  const messageBoard = analysis.recentMessages.length === 0 ? '' : `
<h2 style="color:#1a365d;font-size:18px;margin:24px 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Recent message board</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:13px">
${analysis.recentMessages.map((m) => `<tr><td style="padding:6px 0;width:80px;color:#94a3b8;font-size:11px;vertical-align:top">${m.created_at?.slice(0, 10)}</td><td style="padding:6px 0;vertical-align:top"><a href="${m.app_url}" style="color:#1a365d;font-weight:600;text-decoration:none">${escape(m.subject)}</a></td></tr>`).join('')}
</table>`;

  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:760px;margin:0 auto;background:white;color:#1a202c;line-height:1.6">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
  <div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Daily Client Project Report</div>
  <h1 style="margin:8px 0 6px;font-size:26px;font-weight:800;color:white">${escape(analysis.projectName)}</h1>
  <div style="font-size:13px;color:#e2e8f0">${totalOpen} open task${totalOpen === 1 ? '' : 's'} &middot; ${totalHuman} human &middot; ${totalAi} AI &middot; ${overdue.length} overdue${daysSinceLastMessage != null ? ` &middot; last MB activity ${daysSinceLastMessage}d ago` : ''}</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali - Big picture</div>
<div style="font-size:14px;margin-top:6px;color:#f5f5f4;line-height:1.6"><strong>Project goal:</strong> ${escape(framing.goal)}</div>
</div>

<div style="padding:24px 32px">

${nextStepCallout}

<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:20px"><tr>
<td style="text-align:center;padding:14px;background:#fef3c7;border-radius:8px;width:24%"><div style="font-size:24px;font-weight:800;color:#78350f">${totalHuman}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#78350f;font-weight:700">Human</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:14px;background:#dbeafe;border-radius:8px;width:24%"><div style="font-size:24px;font-weight:800;color:#1e3a8a">${totalAi}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#1e3a8a;font-weight:700">AI</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:14px;background:#fee2e2;border-radius:8px;width:24%"><div style="font-size:24px;font-weight:800;color:#7f1d1d">${overdue.length}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#7f1d1d;font-weight:700">Overdue</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:14px;background:#f1f5f9;border-radius:8px;width:24%"><div style="font-size:24px;font-weight:800;color:#1e293b">${noDueDate.length}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#1e293b;font-weight:700">No due date</div></td>
</tr></table>

${overdueSection}

${fullSequence}

${messageBoard}

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:220px;color:#475569"><strong>Open the next human step</strong></td><td style="padding:6px 0;vertical-align:top">Click the gold button above. Each daily report leads with the single click-through that unblocks progress.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Open the project in Basecamp</strong></td><td style="padding:6px 0;vertical-align:top"><a href="${analysis.appUrl}" style="color:#2b6cb0">${analysis.appUrl}</a></td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Assign missing due dates</strong></td><td style="padding:6px 0;vertical-align:top">${noDueDate.length} task${noDueDate.length === 1 ? '' : 's'} ${noDueDate.length === 1 ? 'has' : 'have'} no due date. Sorted last in their list but you should set them in Basecamp for accurate sequencing.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Have CB execute an AI task</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System execute &lt;task title&gt;</code> in any Basecamp thread, or wait for the v1.1 auto-runner.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Re-classify a task</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System mark &lt;task&gt; as HUMAN/AI/EITHER</code>.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Ask CB anything</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System &lt;anything&gt;</code> in any Basecamp thread.</td></tr>
</table>
</div>

<div style="margin-top:18px;padding:14px;background:#f8fafc;border-left:4px solid #1a365d;font-size:11px;color:#475569">
Source: Basecamp project ${analysis.projectId}. Sort: due_on ASC then created_at ASC. Project goal + next-step framing generated by gpt-4o-mini. Generated automatically every morning.
</div>

</div>
</div>
</body></html>`;
}

function renderText(analysis, framing) {
  const totalOpen = analysis.openTodos.length;
  const totalHuman = analysis.openTodos.filter((t) => t.tier === 'HUMAN').length;
  let out = `${analysis.projectName} - Daily report\n\n`;
  out += `Project goal: ${framing.goal}\n\n`;
  if (analysis.nextHuman) {
    out += `Next step waiting on human: ${analysis.nextHuman.content}\n`;
    if (analysis.nextHuman.due_on) out += `  due ${analysis.nextHuman.due_on}\n`;
    out += `  list: ${analysis.nextHuman.listName}\n`;
    out += `  link: ${analysis.nextHuman.app_url}\n`;
    out += `  why it matters: ${framing.nextStepImportance}\n\n`;
  } else if (totalOpen === 0) {
    out += `No open tasks. ${analysis.lastMessageAt ? `Last MB ${Math.round((Date.now() - new Date(analysis.lastMessageAt).getTime()) / 86400000)} days ago.` : ''}\n\n`;
  } else {
    out += `All ${totalOpen} open tasks are AI-doable. No human gating action.\n\n`;
  }
  out += `${totalOpen} open total. ${totalHuman} human-needed.\n\n`;
  for (let i = 0; i < analysis.openTodos.length; i++) {
    const t = analysis.openTodos[i];
    out += `${i + 1}. [${t.tier}] ${t.content}${t.due_on ? ` (due ${t.due_on})` : ''}\n   ${t.app_url}\n`;
  }
  return stripEmDashes(out);
}

// =============================================================================
// Email
// =============================================================================

function normalizeAliName(s) {
  // The preflight check trips on multiple "Ali Muwwakkil" occurrences (designed
  // to catch duplicate signature blocks). LLM-generated content sometimes echoes
  // his full name. Normalize to just "Ali" in body content; the From header
  // remains "Ali Muwwakkil" via the envelope.
  return (s || '').replace(/Ali Muwwakkil/g, 'Ali');
}

// V2 render: matches Launch PMO format - YOUR TURN banner + 4-up KPIs +
// feasibility per list + per-list Next Human Step + per-list detail cards +
// AI completion log.
function renderContextualBlock(contextual, nextHuman) {
  // Inject below the YOUR TURN banner. Shows basic steps + a styled button
  // linking to a .txt attachment that contains the long Claude Code prompt.
  // The prompt is NOT inlined in the email body — operator clicks the
  // attachment to copy it.
  if (!contextual || !nextHuman) return '';
  const steps = (contextual.basic_steps || []).slice(0, 6);
  if (!steps.length) return '';
  const stepsHtml = steps.map((s) => `<li style="margin-bottom:5px;font-size:13px;color:#1f2937">${escape(stripEmDashes(s))}</li>`).join('');
  const analysis = contextual.analysis || {};
  const goalLine = analysis.goal
    ? `<div style="font-size:12px;color:#475569;margin-bottom:8px"><strong style="color:#0f172a">Goal:</strong> ${escape(stripEmDashes(analysis.goal))}</div>`
    : '';
  const progressLine = analysis.progress_so_far
    ? `<div style="font-size:12px;color:#475569;margin-bottom:8px"><strong style="color:#0f172a">Progress so far:</strong> ${escape(stripEmDashes(analysis.progress_so_far))}</div>`
    : '';
  const blockersLine = (analysis.blockers || []).length
    ? `<div style="font-size:12px;color:#7f1d1d;margin-bottom:8px"><strong>Blockers:</strong> ${(analysis.blockers || []).map((b) => escape(stripEmDashes(b))).join('; ')}</div>`
    : '';
  const complexityChip = analysis.complexity
    ? `<span style="background:#0e1729;color:#cbd5e1;border-radius:3px;padding:2px 8px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-left:8px">${escape(analysis.complexity)} · ~${analysis.estimated_minutes || '?'}min</span>`
    : '';
  const sourceTag = contextual.source === 'contextual_v2'
    ? `<span style="font-size:10px;color:#5cd9a3;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-left:6px">v2 · $${(contextual.cost_usd || 0).toFixed(5)}</span>`
    : `<span style="font-size:10px;color:#fbbf24;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-left:6px">template fallback</span>`;
  return `<div style="background:#fff;border:2px solid #fbbf24;border-radius:10px;padding:18px 22px;margin:0 0 18px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Steps for you${sourceTag}${complexityChip}</div>
<div style="margin-top:10px">${goalLine}${progressLine}${blockersLine}</div>
<ol style="margin:10px 0 14px;padding-left:22px;line-height:1.55">${stepsHtml}</ol>
<a href="cid:claudecodeprompt" style="display:inline-block;background:#1c1917;color:#fbbf24;padding:10px 18px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Copy Claude Code prompt &rarr;</a>
<span style="font-size:11px;color:#475569;margin-left:10px;font-style:italic">opens the prompt attachment — select all + copy + paste into Claude Code</span>
</div>`;
}

function renderHtmlV2(analysis, framing, contextualSuggestion) {
  const today = new Date().toISOString().slice(0, 10);
  const fmtToday = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const totalOpen = analysis.openTodos.length;
  const totalHuman = analysis.openTodos.filter((t) => t.tier === 'HUMAN').length;
  const totalAi = analysis.openTodos.filter((t) => t.tier === 'AI').length;
  const overdue = analysis.openTodos.filter((t) => t.due_on && t.due_on < today);

  // Group open todos by list
  const byList = new Map();
  for (const t of analysis.openTodos) {
    if (!byList.has(t.listId)) byList.set(t.listId, { listId: t.listId, listName: t.listName, todos: [] });
    byList.get(t.listId).todos.push(t);
  }

  function scoreBadge(open, overdueLocal) {
    let score = open === 0 ? 100 : Math.max(0, 100 - open * 3 - overdueLocal * 8);
    const tier = score >= 80 ? 'ON_TRACK' : score >= 50 ? 'AT_RISK' : 'LIKELY_SCRAP';
    const color = tier === 'ON_TRACK' ? { bg: '#dcfce7', fg: '#14532d' } : tier === 'AT_RISK' ? { bg: '#fef3c7', fg: '#78350f' } : { bg: '#fee2e2', fg: '#7f1d1d' };
    return { score, tier, html: `<span style="display:inline-block;padding:4px 12px;border-radius:8px;font-size:11px;font-weight:700;background:${color.bg};color:${color.fg};letter-spacing:0.5px">${tier.replace('_', ' ')} &middot; ${score}</span>` };
  }

  const yourTurnBanner = analysis.nextHuman
    ? `<div style="background:#fef3c7;border-left:6px solid #d97706;padding:16px 22px;margin:0 0 18px"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">YOUR TURN - next decision on ${escape(analysis.shortName)}</div><div style="font-size:17px;font-weight:700;color:#1a202c;margin-top:6px">${escape(stripEmDashes(stripHtml(analysis.nextHuman.content)))}</div><div style="font-size:13px;color:#1f2937;margin-top:6px">List: <strong>${escape(analysis.nextHuman.listName)}</strong> | Due: <strong>${analysis.nextHuman.due_on || 'unset'}</strong> | <a href="${analysis.nextHuman.app_url}" style="color:#1e40af">Open ticket &rarr;</a></div></div>`
    : (totalOpen === 0 ? '<div style="background:#dcfce7;border-left:6px solid #15803d;padding:14px 18px;margin:0 0 18px"><strong>All clear.</strong> Zero open tasks.</div>' : '<div style="background:#dbeafe;border-left:6px solid #1e40af;padding:14px 18px;margin:0 0 18px"><strong>No human action needed.</strong> All open tasks are AI-tier. Tag <code>@CB System</code> on any task to execute.</div>');

  // Per-list Next Human Step rows
  const perListRows = [...byList.values()].map((g) => {
    const nextH = g.todos.find((t) => t.tier === 'HUMAN' || t.tier === 'EITHER');
    if (!nextH) return null;
    return `<tr><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a365d;font-size:12px">${escape(g.listName)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${duePill(nextH.due_on)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${nextH.app_url}" style="color:#1a365d;text-decoration:none;font-weight:600">${escape(stripEmDashes(nextH.content)).slice(0, 110)}</a></td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${escape((nextH.assignees || '').replace(/Ali Muwwakkil/g, 'Ali') || nextH.suggestedOwner)}</td></tr>`;
  }).filter(Boolean).join('');

  // Per-list feasibility rows
  const feasRows = [...byList.values()]
    .map((g) => ({ g, overdueCount: g.todos.filter((t) => t.due_on && t.due_on < today).length }))
    .map(({ g, overdueCount }) => ({ g, overdueCount, badge: scoreBadge(g.todos.length, overdueCount) }))
    .sort((a, b) => a.badge.score - b.badge.score)
    .map(({ g, overdueCount, badge }) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a365d;font-size:12px">${escape(g.listName)}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${badge.html}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${g.todos.length} open / ${overdueCount} overdue</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">H ${g.todos.filter((t) => t.tier === 'HUMAN').length} / AI ${g.todos.filter((t) => t.tier === 'AI').length}</td></tr>`)
    .join('');

  // Per-list detail cards (NEW format matches Launch PMO)
  const listCards = [...byList.values()].map((g) => {
    // Order tasks by due date (nulls last), AI before HUMAN on tie
    const ordered = [...g.todos].sort((a, b) => {
      const ad = a.due_on || '9999-12-31', bd = b.due_on || '9999-12-31';
      if (ad !== bd) return ad.localeCompare(bd);
      if (a.tier !== b.tier) return a.tier === 'AI' ? -1 : 1;
      return 0;
    });
    const firstNextHuman = ordered.find((t) => t.tier === 'HUMAN' || t.tier === 'EITHER');
    const oc = g.todos.filter((t) => t.due_on && t.due_on < today).length;
    const badge = scoreBadge(g.todos.length, oc);
    const recent = (analysis.completedByList?.get(g.listId) || []);

    // Restrict firstNextHuman to undrafted, since drafted AI tasks await human review separately
    const firstNextHumanFiltered = ordered.find((t) => (t.tier === 'HUMAN' || t.tier === 'EITHER') && !t.cbDrafted);
    const taskRows = ordered.slice(0, 20).map((t, i) => {
      const isNextHuman = firstNextHumanFiltered && t.id === firstNextHumanFiltered.id;
      const isDrafted = t.cbDrafted;
      const reviewerName = ((t.assignees || '').split(',').find((a) => !/CB System/i.test(a)) || 'Ali').trim().replace('Ali Muwwakkil', 'Ali');
      const rowBg = isNextHuman ? '#fef9c3' : isDrafted ? '#eff6ff' : (i % 2 === 0 ? '#f8fafc' : 'white');
      const stateBadge = isNextHuman ? '<div style="font-size:10px;color:#92400e;margin-top:2px;font-weight:700">&larr; NEXT HUMAN STEP</div>'
        : isDrafted ? `<div style="font-size:10px;color:#1e40af;margin-top:2px;font-weight:700">DRAFTED BY CB - ${escape(reviewerName)} to review</div>`
        : '';
      const owner = isDrafted ? `${reviewerName} to review`
        : ((t.assignees || '').replace(/Ali Muwwakkil/g, 'Ali') || (t.tier === 'AI' ? 'CB System' : 'unassigned'));
      return `<tr style="background:${rowBg}"><td style="border-bottom:1px solid #e2e8f0;padding:8px 10px;color:#64748b;font-weight:700;font-size:11px">${i + 1}</td><td style="border-bottom:1px solid #e2e8f0;padding:8px 10px"><a href="${t.app_url}" style="color:#1a365d;text-decoration:none;font-weight:600;font-size:12px">${escape(stripEmDashes(t.content)).slice(0, 95)}</a>${stateBadge}</td><td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">${duePill(t.due_on)}</td><td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">${tierPill(t.tier)}</td><td style="border-bottom:1px solid #e2e8f0;padding:8px 10px;font-size:11px;color:#475569">${escape(owner)}</td></tr>`;
    }).join('');

    const recentRows = recent.slice(0, 5).map((r) =>
      `<tr style="background:#f0fdf4"><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#166534">&#x2713;</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${r.app_url}" style="color:#1a365d;text-decoration:none">${escape(stripEmDashes(r.content)).slice(0, 95)}</a></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${(r.completed_at || '').slice(0, 10)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${escape(r.completedBy)}</td></tr>`).join('');

    return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 22px;margin-bottom:14px">
<div style="display:table;width:100%"><div style="display:table-cell"><div style="font-size:16px;font-weight:800;color:#1a365d">${escape(g.listName)}</div><div style="font-size:11px;color:#64748b;margin-top:2px">${g.todos.length} open &middot; ${g.todos.filter((t) => t.tier === 'HUMAN').length} human &middot; ${g.todos.filter((t) => t.tier === 'AI').length} AI &middot; ${oc} overdue</div></div><div style="display:table-cell;text-align:right">${badge.html}</div></div>
${firstNextHuman ? `<div style="margin-top:14px;background:#1c1917;color:white;padding:14px 16px;border-radius:8px;border-left:4px solid #fbbf24"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Next human step blocking this list</div><a href="${firstNextHuman.app_url}" style="display:block;font-size:14px;color:white;text-decoration:none;font-weight:700;margin-top:4px">${escape(stripEmDashes(firstNextHuman.content))}</a><div style="margin-top:6px;font-size:11px;color:#cbd5e0">${duePill(firstNextHuman.due_on)} &middot; <strong style="color:white">${escape((firstNextHuman.assignees || '').replace(/Ali Muwwakkil/g, 'Ali') || firstNextHuman.suggestedOwner)}</strong></div><div style="margin-top:8px"><a href="${firstNextHuman.app_url}" style="display:inline-block;background:#fbbf24;color:#1c1917;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Open ticket &rarr;</a></div></div>` : '<div style="margin-top:14px;padding:10px 14px;background:#dcfce7;border-radius:6px;font-size:12px;color:#166534">No human step blocking this list.</div>'}
<div style="margin-top:14px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Task sequence (${g.todos.length} open, ordered by due date)</div>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;margin-top:6px;border-collapse:collapse"><thead><tr style="background:#1a365d"><th align="left" style="padding:8px 10px;color:white;font-size:10px">#</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Task</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Due</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Tier</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Owner</th></tr></thead><tbody>${taskRows}</tbody></table>
${recentRows ? `<div style="margin-top:14px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Recently completed (last 5)</div>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;margin-top:6px;border-collapse:collapse"><thead><tr style="background:#14532d"><th align="left" style="padding:8px 10px;color:white;font-size:10px">&#x2713;</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Task</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Completed</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">By</th></tr></thead><tbody>${recentRows}</tbody></table>` : ''}
</div>`;
  }).join('');

  const recentMsgRows = (analysis.recentMessages || []).slice(0, 5).map((m) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${(m.created_at || '').slice(0, 10)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${m.app_url}" style="color:#1a365d;text-decoration:none;font-weight:600">${escape(m.subject)}</a><div style="font-size:11px;color:#64748b;margin-top:2px">${escape(m.excerpt).slice(0, 200)}</div></td></tr>`).join('');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7fafc;font-family:arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc"><tr><td align="center"><table width="800" cellpadding="0" cellspacing="0" style="max-width:800px;background:#fff;border-radius:8px;margin:24px 0;overflow:hidden">

<tr><td style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:#fff;padding:28px 32px"><div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Daily Client Project Update</div><h1 style="margin:6px 0 8px;font-size:24px;font-weight:800;color:white">${escape(analysis.projectName)} &mdash; ${escape(fmtToday)}</h1><div style="font-size:13px;color:#e2e8f0;line-height:1.6">${totalOpen} open todos &middot; ${totalHuman} human-needed &middot; ${totalAi} AI-doable &middot; ${overdue.length} overdue &middot; <a href="${analysis.appUrl}" style="color:#fde68a;text-decoration:none">Open project &rarr;</a></div></td></tr>

<tr><td style="background:#1c1917;color:white;padding:18px 32px"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali - big picture</div><div style="font-size:14px;margin-top:6px;line-height:1.55">${escape(framing.goal)}</div>${framing.nextStepImportance ? `<div style="font-size:13px;margin-top:8px;color:#fde68a"><strong>Why the next step matters:</strong> ${escape(framing.nextStepImportance)}</div>` : ''}</td></tr>

<tr><td style="padding:24px 32px 0">${yourTurnBanner}${renderContextualBlock(contextualSuggestion, analysis.nextHuman)}<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px"><tr><td style="text-align:center;padding:14px;background:#fef3c7;border-radius:8px;width:32%"><div style="font-size:26px;font-weight:800;color:#78350f">${totalHuman}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#78350f;font-weight:700">Human-needed</div></td><td style="width:1%"></td><td style="text-align:center;padding:14px;background:#dbeafe;border-radius:8px;width:32%"><div style="font-size:26px;font-weight:800;color:#1e3a8a">${totalAi}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#1e3a8a;font-weight:700">AI-doable</div></td><td style="width:1%"></td><td style="text-align:center;padding:14px;background:#fee2e2;border-radius:8px;width:32%"><div style="font-size:26px;font-weight:800;color:#7f1d1d">${overdue.length}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#7f1d1d;font-weight:700">Overdue</div></td></tr></table>

<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Feasibility per list (lowest first)</h2>${feasRows ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-bottom:24px"><thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:10px 12px;font-size:10px">LIST</th><th align="center" style="padding:10px 12px;font-size:10px">SCORE</th><th align="left" style="padding:10px 12px;font-size:10px">OPEN</th><th align="left" style="padding:10px 12px;font-size:10px">TIER MIX</th></tr></thead><tbody>${feasRows}</tbody></table>` : '<div style="background:#dcfce7;padding:14px 18px;border-radius:6px;color:#14532d;font-weight:600;margin-bottom:24px">No open work in this project.</div>'}

<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Next human step blocking each list</h2>${perListRows ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-bottom:24px"><thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:10px 12px;font-size:10px">LIST</th><th align="left" style="padding:10px 12px;font-size:10px">DUE</th><th align="left" style="padding:10px 12px;font-size:10px">NEXT HUMAN STEP</th><th align="left" style="padding:10px 12px;font-size:10px">OWNER</th></tr></thead><tbody>${perListRows}</tbody></table>` : '<div style="background:#dcfce7;padding:14px 18px;border-radius:6px;color:#14532d;font-weight:600;margin-bottom:24px">All lists unblocked on the human side.</div>'}

<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Lists in detail</h2>${listCards}

${recentMsgRows ? `<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Recent message board activity</h2><table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-bottom:24px">${recentMsgRows}</table>` : ''}

<p style="font-size:11px;color:#94a3b8;margin-top:18px">Generated by CB System Client Projects Report (Mon-Fri 8am CDT). Project: <a href="${analysis.appUrl}" style="color:#2b6cb0">${escape(analysis.projectName)}</a>. Tag <code>@CB System</code> on any task to escalate, get AI execution, or ask for a PDF / Excel / image artifact.</p>

</td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(analysis, framing, contextualSuggestion) {
  if (DRY) { console.log(`[client-report] DRY skip email for ${analysis.projectName}`); return null; }
  const html = normalizeAliName(stripEmDashes(renderHtmlV2(analysis, framing, contextualSuggestion)));
  const text = normalizeAliName(renderText(analysis, framing));
  validateBeforeSend(html, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const subjPrefix = TEST ? '[TEST] ' : '';
  const totalOpen = analysis.openTodos.length;
  const overdue = analysis.openTodos.filter((t) => t.due_on && t.due_on < new Date().toISOString().slice(0, 10)).length;
  const subj = `${subjPrefix}[Daily: ${analysis.shortName}] ${totalOpen} open${overdue > 0 ? `, ${overdue} overdue` : ''}${analysis.nextHuman ? ' - waiting on you' : (totalOpen === 0 ? ' - clear' : ' - AI handles next')}`;
  // Attach the long Claude Code prompt as a .txt file (cid: claudecodeprompt
  // referenced from renderContextualBlock). Operator clicks the attachment
  // in their mail client, sees the prompt, copies it. Avoids inlining the
  // 80-line prompt in the email body.
  const attachments = [];
  if (contextualSuggestion && contextualSuggestion.long_prompt && analysis.nextHuman) {
    attachments.push({
      filename: `claude-code-prompt-${analysis.nextHuman.id || 'next'}.txt`,
      content: contextualSuggestion.long_prompt,
      contentType: 'text/plain; charset=utf-8',
      cid: 'claudecodeprompt',
    });
  }
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: RECIPIENT,
    cc: CC,
    subject: subj,
    text, html,
    attachments,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': (analysis.nextHuman || overdue > 0) ? 'high' : 'normal' },
  });
  return r.messageId;
}

// =============================================================================
// Main
// =============================================================================

(async () => {
  console.log(`[client-report] start ${new Date().toISOString()}, test=${TEST}, dry=${DRY}${ONLY ? `, only=${ONLY}` : ''}`);
  const runRecord = await recorder.start('Daily Client Projects Report');
  const messageIds = [];
  const recipientsSent = [];
  let runStatus = 'success';
  let runError = null;
  const summary = [];

  try {
    const targetProjects = ONLY ? PROJECTS.filter((p) => p.shortName.toLowerCase() === ONLY.toLowerCase() || p.name.toLowerCase() === ONLY.toLowerCase()) : PROJECTS;
    for (const p of targetProjects) {
      try {
        console.log(`[client-report] analyzing ${p.name}...`);
        const analysis = await analyzeProject(p);
        console.log(`  open=${analysis.openTodos.length} human=${analysis.openTodos.filter((t) => t.tier === 'HUMAN').length}`);
        const framing = await generateProjectFraming(analysis);
        // Optional: contextual v2 analysis on the YOUR TURN task only. Pulls
        // the BC ticket context via the walker, runs GPT-4o-mini to extract
        // {goal, progress, next_step, blockers, tools_needed} + basic steps
        // + a long Claude Code prompt. Renders below the YOUR TURN banner.
        let contextualSuggestion = null;
        if (WITH_CONTEXTUAL && analysis.nextHuman && process.env.OPENAI_API_KEY) {
          try {
            const { buildContextualSuggestion } = require(path.resolve(__dirname, './lib/buildContextualSuggestionV2'));
            // bcGet helper shared shape: takes BC API path or full URL.
            const localBcGet = async (urlOrPath) => {
              const tk = (process.env.BASECAMP_ACCESS_TOKEN || BASECAMP_TOKEN).replace(/^Bearer /, '');
              const base = `https://3.basecampapi.com/${process.env.BASECAMP_ACCOUNT_ID || '3945211'}`;
              const u = urlOrPath.startsWith('http') ? urlOrPath : `${base}${urlOrPath}`;
              const rr = await fetch(u, { headers: { Authorization: `Bearer ${tk}`, 'User-Agent': 'CB client-report contextual', Accept: 'application/json' } });
              if (!rr.ok) throw new Error(`BC ${u} -> ${rr.status}`);
              return rr.json();
            };
            const nh = analysis.nextHuman;
            console.log(`  running v2 on YOUR TURN task: ${(nh.content || '').slice(0, 60)}`);
            contextualSuggestion = await buildContextualSuggestion({
              todo: {
                bc_id: String(nh.id),
                project_id: String(p.id),
                project_name: p.name,
                todolist_name: nh.listName,
                title: stripHtml(nh.content || '').slice(0, 240),
                description: stripHtml(nh.description || ''),
                bc_app_url: nh.app_url,
                bc_updated_at: nh.updated_at || new Date().toISOString(),
                due_on: nh.due_on || null,
                urgency_score: null,
                category: 'unscored',
              },
              bcGet: localBcGet,
              bucketId: String(p.id),
              openaiKey: process.env.OPENAI_API_KEY,
            });
            console.log(`  v2 done. source=${contextualSuggestion.source}, cost=$${(contextualSuggestion.cost_usd || 0).toFixed(5)}`);
          } catch (err) {
            console.warn(`  v2 contextual failed: ${err.message}; continuing without`);
            contextualSuggestion = null;
          }
        }
        const messageId = await sendEmail(analysis, framing, contextualSuggestion);
        if (messageId) { messageIds.push(messageId); recipientsSent.push(RECIPIENT, CC); }
        summary.push({ project: p.name, open: analysis.openTodos.length, nextHuman: analysis.nextHuman?.content || null, messageId });
        console.log(`  email sent: ${messageId}`);
      } catch (e) {
        console.error(`  fail for ${p.name}: ${e.message}`);
        summary.push({ project: p.name, error: e.message });
      }
    }
    console.log('[client-report] all done');
    console.log(JSON.stringify(summary, null, 2));
  } catch (e) {
    runStatus = 'failure';
    runError = e.message;
    console.error('[client-report] FATAL:', e.stack || e.message);
    await recorder.end(runRecord, { status: runStatus, messageIds, recipientsSent, error: runError });
    process.exit(1);
  }
  await recorder.end(runRecord, { status: runStatus, messageIds, recipientsSent });
})();
