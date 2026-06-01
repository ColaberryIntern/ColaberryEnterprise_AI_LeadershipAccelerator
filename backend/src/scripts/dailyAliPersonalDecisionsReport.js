#!/usr/bin/env node
// Daily Ali Personal Decisions Report.
// Mirrors the Gov Contracts daily format: per-group cards with NEXT HUMAN STEP
// callout, full task sequence, tier pills (HUMAN/AI/EITHER), due-date pills,
// recently-completed, "what you can do from here" footer. Source: Ali Personal
// Basecamp project (7463955). Grouped by topic (Lakeesha taxes / Gov Contracts /
// HR / Strategic / Engine / Family / Meetings / Other).

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const BASECAMP_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const H = { Authorization: 'Bearer ' + BASECAMP_TOKEN, 'User-Agent': 'Colaberry AliPersonal', Accept: 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';
const ALI_PERSONAL = 7463955;
const ALI = 17454835;
const CB = 37708014;
const RECIPIENT = 'ali@colaberry.com';
const BASE_CC = ['alimuwwakkil@gmail.com'];
const TEST = process.argv.includes('--test');
const DRY = process.argv.includes('--dry');
const CC_ADD = (process.argv.find((a) => a.startsWith('--cc-add='))?.slice('--cc-add='.length) || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const CC = Array.from(new Set([...BASE_CC, ...CC_ADD]));

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

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// =====================================================================
// Classify HUMAN / AI / EITHER (same vocabulary as Gov Contracts + Clients)
// =====================================================================
const HUMAN_PATTERNS = [
  /\b(decide|review \+ decide|approve|authorize|sign|verdict|bid.no.bid|negotiate|escalate)\b/i,
  /\b(meeting|sync|call|demo|present to|walkthrough)\b/i,
  /\b(pay|invoice|wire|contract|legal|sow|nda|tax|cpa)\b/i,
  /\b(interview|hire|fire|layoff|onboard)\b/i,
  /\b(reply|respond|follow.up)\b/i,
];
const AI_PATTERNS = [
  /\b(draft|generate|write|compile|summarize|extract|build|code|implement|deploy|ship)\b/i,
  /\b(analyze|analysis|score|rank|rate|benchmark|research|investigate|find|cross.ref)\b/i,
  /\b(pull|fetch|retrieve|sync|migrate|test|qa|validate)\b/i,
  /\b(design|wireframe|prototype|mock|document|update.*docs|create.*spec)\b/i,
];
function classifyTier(todo) {
  const text = (todo.content + ' ' + stripHtml(todo.description)).toLowerCase();
  const ids = (todo.assignees || []).map((a) => a.id);
  const cbAssigned = ids.includes(CB);
  const aliOnly = ids.length === 1 && ids[0] === ALI;
  if (cbAssigned) return 'AI';
  const humanScore = HUMAN_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  const aiScore = AI_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  if (aliOnly && humanScore > 0) return 'HUMAN';
  if (humanScore > aiScore && humanScore > 0) return 'HUMAN';
  if (aiScore > humanScore && aiScore > 0) return 'AI';
  if (aliOnly) return 'HUMAN';
  return 'EITHER';
}

// =====================================================================
// Feasibility scoring (per-group). Simpler than Gov Contracts since there
// are no per-group deadlines — score = how unblocked is this group today?
// Higher score = fewer overdue + smaller HUMAN backlog.
// =====================================================================
function scoreGroup(items, today) {
  const human = items.filter((t) => t.tier === 'HUMAN').length;
  const overdue = items.filter((t) => t.due_on && t.due_on < today).length;
  const noDue = items.filter((t) => !t.due_on).length;
  let raw = 100 - human * 8 - overdue * 12 - Math.min(noDue, 5) * 2;
  raw = Math.max(0, Math.min(100, raw));
  let tier = 'ON_TRACK';
  if (raw < 50) tier = 'STALLED';
  else if (raw < 75) tier = 'AT_RISK';
  return { score: raw, tier, human, overdue, noDue };
}

// =====================================================================
// LLM exec summary (gpt-4o-mini) — narrative of the day's top decisions
// =====================================================================
async function buildExecSummary({ totalOpen, totalHuman, totalAi, overdueCount, perGroupNext }) {
  if (!process.env.OPENAI_API_KEY) {
    return `${totalHuman} item${totalHuman === 1 ? '' : 's'} on Ali Personal need your decision today. ${overdueCount > 0 ? `${overdueCount} overdue.` : 'No overdue.'} Top lists: ${perGroupNext.slice(0, 3).map((g) => g.name).join(', ') || 'none'}.`;
  }
  try {
    const OpenAI = require(path.resolve(__dirname, '../../../node_modules/openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const groupsList = perGroupNext.slice(0, 6).map((g) => `- ${g.name}: ${g.task.content.slice(0, 80)}`).join('\n');
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You write a 2-3 sentence executive briefing about pending personal-task decisions. Direct, second-person. Mention totals + the single highest-leverage decision. No em-dashes, no fluff, no "hey Ali" greeting. Refer to Basecamp todolists as "lists".' },
        { role: 'user', content: `Today's Ali Personal queue:\n- ${totalOpen} open todos\n- ${totalHuman} need a human decision (Ali)\n- ${totalAi} AI-doable (CB)\n- ${overdueCount} overdue\n\nNext human step per list:\n${groupsList}\n\nWrite the briefing.` },
      ],
    });
    return strip((resp.choices?.[0]?.message?.content || '').trim());
  } catch (e) {
    console.warn('Exec summary LLM failed:', e.message);
    return `${totalHuman} decisions waiting on you today. ${overdueCount > 0 ? `${overdueCount} are overdue.` : 'No overdue.'} Open the per-list cards below for the next human step in each.`;
  }
}

// =====================================================================
// Main
// =====================================================================
(async () => {
  console.log(`[ali-personal-report] Starting. test=${TEST} dry=${DRY}`);

  const proj = await bcGet(`/projects/${ALI_PERSONAL}.json`);
  const tset = proj.dock.find((d) => d.name === 'todoset');
  if (!tset) throw new Error('No todoset on Ali Personal');
  const lists = await bcGetAll(`/buckets/${ALI_PERSONAL}/todosets/${tset.id}/todolists.json`);

  const allTodos = [];
  for (const l of lists) {
    try {
      const ts = await bcGetAll(`/buckets/${ALI_PERSONAL}/todolists/${l.id}/todos.json?status=remaining`);
      for (const t of ts) {
        allTodos.push({
          ...t,
          list_id: l.id,
          list_name: l.name,
          list_url: l.app_url,
          tier: classifyTier(t),
          assigneeNames: (t.assignees || []).map((a) => a.name).join(', '),
        });
      }
    } catch (e) {
      console.warn(`list ${l.id} ${l.name} pull failed: ${e.message}`);
    }
  }
  console.log(`[ali-personal-report] Pulled ${allTodos.length} open todos across ${lists.length} lists`);

  // Group by Basecamp list (one group per todolist in Ali Personal).
  // Per Ali 2026-06-01: Ali Personal is the only project that breaks down
  // at the list level. Other projects have their own project-level reports.
  const groupMap = new Map();
  for (const t of allTodos) {
    const key = t.list_name;
    if (!groupMap.has(key)) groupMap.set(key, { name: key, list_id: t.list_id, list_url: t.list_url, items: [] });
    groupMap.get(key).items.push(t);
  }
  const today = new Date().toISOString().slice(0, 10);

  // Per-group enrichment
  const groups = [];
  for (const g of groupMap.values()) {
    g.items.sort((a, b) => {
      if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
      if (a.due_on) return -1;
      if (b.due_on) return 1;
      return 0;
    });
    g.nextHumanStep = g.items.find((t) => t.tier === 'HUMAN') || null;
    g.nextStep = g.items[0] || null;
    g.feasibility = scoreGroup(g.items, today);
    g.humanCount = g.items.filter((t) => t.tier === 'HUMAN').length;
    g.aiCount = g.items.filter((t) => t.tier === 'AI').length;
    g.eitherCount = g.items.filter((t) => t.tier === 'EITHER').length;
    g.overdueCount = g.items.filter((t) => t.due_on && t.due_on < today).length;
    groups.push(g);
  }

  // Order: groups with overdue first, then groups with next-human-step, then by item count
  groups.sort((a, b) => {
    if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
    if (!!a.nextHumanStep !== !!b.nextHumanStep) return a.nextHumanStep ? -1 : 1;
    return b.items.length - a.items.length;
  });

  // Recently completed (last 7 days, across the project)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const completed = [];
  for (const l of lists) {
    try {
      const ts = await bcGetAll(`/buckets/${ALI_PERSONAL}/todolists/${l.id}/todos.json?status=completed&completed_since=${encodeURIComponent(sevenDaysAgo)}`);
      for (const t of ts) {
        completed.push({
          ...t,
          list_name: l.name,
          completedBy: (t.assignees || [])[0]?.name || 'Unknown',
        });
      }
    } catch {}
  }
  completed.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

  // Cross-cutting stats
  const totalOpen = allTodos.length;
  const totalHuman = allTodos.filter((t) => t.tier === 'HUMAN').length;
  const totalAi = allTodos.filter((t) => t.tier === 'AI').length;
  const totalEither = allTodos.filter((t) => t.tier === 'EITHER').length;
  const overdueTasks = allTodos.filter((t) => t.due_on && t.due_on < today)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  const perGroupNext = groups.filter((g) => g.nextHumanStep).map((g) => ({
    name: g.name, list_url: g.list_url, task: g.nextHumanStep,
  }));

  const execSummary = await buildExecSummary({
    totalOpen, totalHuman, totalAi, overdueCount: overdueTasks.length, perGroupNext,
  });

  // =====================================================================
  // HTML render
  // =====================================================================
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const duePill = (due_on) => {
    if (!due_on) return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#1c1917;color:#fbbf24;letter-spacing:0.5px">NO DUE DATE</span>`;
    const isOverdue = due_on < today;
    const daysOut = Math.round((new Date(due_on).getTime() - now.getTime()) / 86400000);
    if (isOverdue) return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#dc2626;color:white">OVERDUE ${due_on}</span>`;
    if (daysOut <= 7) return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#ca8a04;color:white">DUE ${due_on}</span>`;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#e2e8f0;color:#475569">due ${due_on}</span>`;
  };
  const tierPill = (tier) => {
    if (tier === 'HUMAN') return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#fef3c7;color:#7c2d12;letter-spacing:0.5px">HUMAN</span>';
    if (tier === 'AI') return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#dbeafe;color:#1e3a8a;letter-spacing:0.5px">AI</span>';
    return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#f1f5f9;color:#334155;letter-spacing:0.5px">EITHER</span>';
  };
  const scoreBadge = (feas) => {
    const color = feas.tier === 'ON_TRACK' ? { bg: '#dcfce7', fg: '#14532d' } : feas.tier === 'AT_RISK' ? { bg: '#fef3c7', fg: '#78350f' } : { bg: '#fee2e2', fg: '#7f1d1d' };
    const label = feas.tier.replace('_', ' ');
    return `<span style="display:inline-block;padding:4px 12px;border-radius:8px;font-size:11px;font-weight:700;background:${color.bg};color:${color.fg};letter-spacing:0.5px">${label} &middot; ${feas.score}</span>`;
  };

  const groupCards = groups.map((g) => {
    const nh = g.nextHumanStep;
    const ns = g.nextStep;
    const nsIsAi = ns && ns.tier === 'AI';
    return `
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 22px;margin-bottom:14px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:16px;font-weight:800;color:#1a365d">${escape(g.name)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">${g.items.length} open &middot; ${g.humanCount} human &middot; ${g.aiCount} AI &middot; ${g.overdueCount} overdue${g.list_url ? ` &middot; <a href="${g.list_url}" style="color:#2b6cb0;text-decoration:none">Open list in Basecamp &rarr;</a>` : ''}</div>
    </div>
    <div>${scoreBadge(g.feasibility)}</div>
  </div>

  ${g.items.length === 0 ? '<div style="margin-top:10px;color:#16a34a;font-size:13px;font-weight:600">No open todos. Clean.</div>' : nh ? `
  <div style="margin-top:14px;background:#1c1917;color:white;padding:14px 16px;border-radius:8px;border-left:4px solid #fbbf24">
    <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Next step waiting on you</div>
    <a href="${nh.app_url}" style="display:block;font-size:15px;color:white;text-decoration:none;font-weight:700;margin-top:4px;line-height:1.3">${escape(nh.content)}</a>
    <div style="margin-top:6px;font-size:12px;color:#cbd5e0">${duePill(nh.due_on)} &middot; in <strong style="color:white">${escape(nh.list_name)}</strong></div>
    <div style="margin-top:10px"><a href="${nh.app_url}" style="display:inline-block;background:#fbbf24;color:#1c1917;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Open ticket &rarr;</a></div>
  </div>
  ${nsIsAi && ns !== nh ? `<div style="margin-top:10px;padding:10px 14px;background:#dbeafe;border-radius:6px;font-size:12px;color:#1e3a8a"><strong>${escape(ns.content)}</strong> is the very next task and is AI-doable. CB System will pick this up before the next report.</div>` : ''}` : `
  <div style="margin-top:14px;padding:10px 14px;background:#dcfce7;border-radius:6px;font-size:12px;color:#166534">No human steps remaining. All next tasks are AI-doable. CB System will execute before next report.</div>
  `}

  <div style="margin-top:14px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Task sequence (${g.items.length} open, ordered by due date)</div>
  <table cellpadding="6" cellspacing="0" style="width:100%;font-size:13px;margin-top:6px;border-collapse:collapse">
    <thead><tr style="background:#1a365d">
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">#</th>
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">Task</th>
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">Due</th>
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">Tier</th>
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">Assignees</th>
    </tr></thead>
    <tbody>
  ${g.items.slice(0, 20).map((t, idx) => {
      const isNh = nh && t.id === nh.id;
      const nhBadge = isNh ? '<div style="font-size:10px;color:#92400e;margin-top:2px;font-weight:700">&larr; NEXT HUMAN STEP</div>' : '';
      return `
    <tr style="background:${isNh ? '#fef9c3' : (idx % 2 === 0 ? '#f8fafc' : 'white')}">
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px;color:#64748b;font-weight:700">${idx + 1}</td>
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">
        <a href="${t.app_url}" style="color:#1a365d;text-decoration:none;font-weight:600">${escape(t.content)}</a>${nhBadge}
      </td>
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">${duePill(t.due_on)}</td>
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">${tierPill(t.tier)}</td>
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px;font-size:11px;color:#475569">${escape(t.assigneeNames || 'unassigned')}</td>
    </tr>`;
    }).join('')}
    </tbody>
  </table>
  ${g.items.length > 20 ? `<div style="margin-top:6px;font-size:11px;color:#94a3b8;font-style:italic">+ ${g.items.length - 20} more not shown</div>` : ''}
</div>`;
  }).join('');

  const noDueCount = allTodos.filter((t) => !t.due_on).length;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Ali Personal Decisions - ${dateStr}</title></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc"><tr><td align="center">
<table width="780" cellpadding="0" cellspacing="0" style="max-width:780px;background:#fff;border-radius:8px;margin:24px 0;overflow:hidden">

<tr><td style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:#fff;padding:28px 32px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">📌 Ali Personal - Daily Decisions Report</div>
  <h1 style="margin:6px 0 8px;font-size:26px;font-weight:800;color:white">${totalHuman} decision${totalHuman === 1 ? '' : 's'} owed &mdash; ${escape(dateStr)}</h1>
  <div style="font-size:13px;color:#e2e8f0;line-height:1.6">${groups.length} active list${groups.length === 1 ? '' : 's'} &middot; ${totalOpen} open &middot; ${totalHuman} human-needed &middot; ${totalAi} AI-doable &middot; ${overdueTasks.length} overdue</div>
</td></tr>

<tr><td style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali - Big picture</div>
<div style="font-size:14px;margin-top:6px;line-height:1.55">${escape(execSummary)}</div>
</td></tr>

<tr><td style="padding:24px 32px;color:#2d3748;font-size:14px;line-height:1.65">

<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px"><tr>
<td style="text-align:center;padding:16px;background:#fef3c7;border-radius:8px;width:24%"><div style="font-size:28px;font-weight:800;color:#78350f">${totalHuman}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#78350f;font-weight:700">Human-needed</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:16px;background:#dbeafe;border-radius:8px;width:24%"><div style="font-size:28px;font-weight:800;color:#1e3a8a">${totalAi}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#1e3a8a;font-weight:700">AI-doable</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:16px;background:#dcfce7;border-radius:8px;width:24%"><div style="font-size:28px;font-weight:800;color:#14532d">${totalEither}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#14532d;font-weight:700">Either</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:16px;background:#fee2e2;border-radius:8px;width:24%"><div style="font-size:28px;font-weight:800;color:#7f1d1d">${overdueTasks.length}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7f1d1d;font-weight:700">Overdue</div></td>
</tr></table>

<h2 style="color:#1a365d;font-size:18px;margin-top:24px;border-bottom:2px solid #1a365d;padding-bottom:6px">Each list's next human step</h2>
${perGroupNext.length === 0 ? '<div style="background:#dcfce7;padding:14px 18px;border-radius:6px;color:#14532d;font-weight:600">No lists are waiting on you. All next steps are AI-doable. CB System runs next.</div>' : `
<p style="margin:0 0 10px;font-size:13px;color:#475569"><strong>${perGroupNext.length} list${perGroupNext.length === 1 ? '' : 's'} waiting on you.</strong> Sorted by due date. Click any row to open the ticket.</p>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;border:1px solid #e2e8f0">
<thead><tr style="background:#1a365d;color:white">
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">LIST</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">NEXT HUMAN STEP</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">DUE</th>
</tr></thead>
<tbody>
${perGroupNext.sort((a, b) => {
      if (a.task.due_on && b.task.due_on) return a.task.due_on.localeCompare(b.task.due_on);
      if (a.task.due_on) return -1;
      if (b.task.due_on) return 1;
      return 0;
    }).map((row, i) => `
<tr style="background:${i % 2 === 0 ? '#f8fafc' : 'white'}">
<td style="padding:12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;font-weight:600">${escape(row.name)}</td>
<td style="padding:12px;border-bottom:1px solid #e2e8f0"><a href="${row.task.app_url}" style="color:#1a365d;font-weight:700;text-decoration:none">${escape(row.task.content)}</a></td>
<td style="padding:12px;border-bottom:1px solid #e2e8f0">${duePill(row.task.due_on)}</td>
</tr>`).join('')}
</tbody>
</table>`}

${overdueTasks.length > 0 ? `
<h2 style="color:#991b1b;font-size:18px;margin-top:32px;border-bottom:2px solid #dc2626;padding-bottom:6px">Overdue (${overdueTasks.length})</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;border:1px solid #fecaca">
<thead><tr style="background:#7f1d1d;color:white">
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">TASK</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">LIST</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">DUE</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">TIER</th>
</tr></thead>
<tbody>
${overdueTasks.map((t, i) => `
<tr style="background:${i % 2 === 0 ? '#fef2f2' : 'white'}">
<td style="padding:10px 12px;border-bottom:1px solid #fecaca"><a href="${t.app_url}" style="color:#1a365d;font-weight:600;text-decoration:none">${escape(t.content)}</a></td>
<td style="padding:10px 12px;border-bottom:1px solid #fecaca;font-size:11px;color:#475569">${escape(t.list_name)}</td>
<td style="padding:10px 12px;border-bottom:1px solid #fecaca">${duePill(t.due_on)}</td>
<td style="padding:10px 12px;border-bottom:1px solid #fecaca">${tierPill(t.tier)}</td>
</tr>`).join('')}
</tbody>
</table>` : ''}

<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #1a365d;padding-bottom:6px">Per-list full task sequence</h2>
${groupCards}

${completed.length > 0 ? `
<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Recently completed (last 7 days)</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse;border:1px solid #e2e8f0">
<thead><tr style="background:#14532d;color:white">
<th style="text-align:left;padding:10px;font-size:10px;letter-spacing:1.5px">&#x2713;</th>
<th style="text-align:left;padding:10px;font-size:10px;letter-spacing:1.5px">Task</th>
<th style="text-align:left;padding:10px;font-size:10px;letter-spacing:1.5px">Completed</th>
<th style="text-align:left;padding:10px;font-size:10px;letter-spacing:1.5px">By</th>
</tr></thead>
<tbody>${completed.slice(0, 10).map((r) => `
<tr style="background:#f0fdf4">
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#166534">&#x2713;</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${r.app_url}" style="color:#1a365d;text-decoration:none">${escape(r.content).slice(0, 95)}</a></td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${(r.completed_at || '').slice(0, 10)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${escape(r.completedBy)}</td>
</tr>`).join('')}
</tbody>
</table>` : ''}

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:240px;color:#475569"><strong>Click the next human step</strong></td><td style="padding:6px 0;vertical-align:top">Each row in the "Each list's next human step" table opens the Basecamp todo. Tackle in due-date order.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Reply with a one-word answer</strong></td><td style="padding:6px 0;vertical-align:top">Reply to this email with your decision in any format - even "yes" / "no" / "delegate to Ram". CB System parses your reply, posts to the todo, and executes (after the inbound-trigger rebuild lands).</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Assign missing due dates</strong></td><td style="padding:6px 0;vertical-align:top">${noDueCount} tasks have no due date. They sort last in their group but the report is more useful with real dates.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Have CB pick up an AI task</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System execute &lt;task title&gt;</code> in the todo, or wait for the next auto-runner sweep.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Re-classify a task</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System mark &lt;task&gt; as HUMAN/AI/EITHER</code>.</td></tr>
</table>
</div>

</td></tr>

<tr><td style="background:#f7fafc;padding:16px 32px;text-align:center;font-size:11px;color:#718096;border-top:1px solid #e2e8f0">
Generated ${now.toISOString()} &middot; Source: Basecamp Ali Personal (${ALI_PERSONAL}) &middot; Script: backend/src/scripts/dailyAliPersonalDecisionsReport.js
</td></tr>

</table>
</td></tr></table>
</body></html>`;

  const text = strip(`Ali Personal - Daily Decisions Report - ${dateStr}

${totalHuman} decisions owed across ${perGroupNext.length} active list${perGroupNext.length === 1 ? '' : 's'}.
${totalOpen} open total | ${totalAi} AI-doable | ${overdueTasks.length} overdue.

For Ali, big picture:
${execSummary}

Each list's next human step:
${perGroupNext.length === 0 ? '(none - all next steps are AI-doable)' : perGroupNext.map((row) => `- ${row.name}: ${row.task.content}${row.task.due_on ? ' (due ' + row.task.due_on + ')' : ''}`).join('\n')}

${overdueTasks.length > 0 ? `Overdue (${overdueTasks.length}):\n${overdueTasks.map((t) => `- ${t.content} (due ${t.due_on}, ${t.tier})`).join('\n')}\n\n` : ''}Open the HTML email for per-group cards with full task sequences.

Reply with one-word answers and (once the inbound-trigger ships) Claude Code parses + executes.

Ali`);

  if (DRY) {
    const out = path.resolve(__dirname, '../../../tmp/ali-personal-report-preview.html');
    fs.writeFileSync(out, html);
    console.log(`[ali-personal-report] DRY run - wrote preview to ${out}`);
    return;
  }

  if (!process.env.MANDRILL_API_KEY) {
    console.error('[ali-personal-report] MANDRILL_API_KEY required');
    process.exit(1);
  }

  // Task titles in Ali Personal frequently contain "Ali Muwwakkil" - collapse
  // to "Ali" in the rendered body (this is Ali's own queue, no ambiguity).
  // The transport "from" envelope keeps the full name; only the body is normalized.
  const collapseName = (s) => s.replace(/Ali Muwwakkil/g, 'Ali');
  const htmlClean = collapseName(strip(html));
  const textClean = collapseName(strip(text));
  validateBeforeSend(htmlClean, textClean);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const subject = TEST
    ? `[TEST] [Decisions Report] 📌 ${totalHuman} decisions owed - ${dateStr}`
    : `[Decisions Report] 📌 ${totalHuman} decisions owed - ${dateStr}`;

  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: RECIPIENT,
    cc: CC,
    subject,
    text: textClean,
    html: htmlClean,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  console.log(`[ali-personal-report] Sent (${TEST ? 'TEST' : 'live'}): ${r.messageId}`);
})().catch((e) => { console.error(`[ali-personal-report] FAIL: ${e.stack || e.message}`); process.exit(1); });
