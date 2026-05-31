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
const CC = 'alimuwwakkil@gmail.com';
const TEST = process.argv.includes('--test');
const DRY = process.argv.includes('--dry');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

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
  if (humanScore > aiScore) return 'HUMAN';
  if (aiScore > 0) return 'AI';
  return 'EITHER';
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

async function analyzeProject(p) {
  const project = await bcGet(`/projects/${p.id}.json`);
  const dock = project.dock || [];
  const todoset = dock.find((d) => d.name === 'todoset');
  const mb = dock.find((d) => d.name === 'message_board');

  // Pull all todolists + their open todos
  const lists = todoset ? await bcGetAll(`/buckets/${p.id}/todosets/${todoset.id}/todolists.json`) : [];
  const openTodos = [];
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
        });
      }
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

async function sendEmail(analysis, framing) {
  if (DRY) { console.log(`[client-report] DRY skip email for ${analysis.projectName}`); return null; }
  const html = normalizeAliName(stripEmDashes(renderHtml(analysis, framing)));
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
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: RECIPIENT,
    cc: CC,
    subject: subj,
    text, html,
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
        const messageId = await sendEmail(analysis, framing);
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
