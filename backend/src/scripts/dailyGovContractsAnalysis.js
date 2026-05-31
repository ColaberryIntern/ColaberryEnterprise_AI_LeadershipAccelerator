#!/usr/bin/env node
/**
 * Daily Gov Contracts analysis report.
 *
 * Pulls live state from Basecamp project 47346103 (Gov Contracts), classifies
 * every open todo as AI-doable vs human-needed, generates a styled HTML
 * report, and emails it to ali@colaberry.com.
 *
 * Designed to be cron-friendly:
 *   - idempotent
 *   - tolerant of transient Basecamp 5xx
 *   - exits non-zero on hard failure so cron logs catch it
 *
 * Recommended cron: 0 8 * * * (8am CT, after the Cory brief lands)
 */
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const recorder = require(path.resolve(__dirname, './lib/reportRunRecorder'));

const PROJECT_ID = 47346103;
const RECIPIENT = process.env.GOV_REPORT_RECIPIENT || 'ali@colaberry.com';
// Phone-accessible secondary recipient — independent of Inbox COS / work email filtering.
const RECIPIENT_PHONE = process.env.GOV_REPORT_RECIPIENT_PHONE || 'alimuwwakkil@gmail.com';
const BASECAMP_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const BASE = 'https://3.basecampapi.com/3945211';
const H = { Authorization: 'Bearer ' + BASECAMP_TOKEN, 'User-Agent': 'Colaberry Gov Report', Accept: 'application/json' };

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let next = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: H });
    if (!r.ok) throw new Error(`GET ${next} -> ${r.status}`);
    out.push(...(await r.json()));
    const link = r.headers.get('Link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}

// Classification rules — AI-doable vs human-needed
const AI_PATTERNS = [
  /draft|drafting|generate|write|compile|summarize|extract/i,
  /pull|fetch|retrieve|collect|cross.ref/i,
  /analyze|analysis|score|rank|rate/i,
  /research|investigate|find/i,
  /functional requirements|technical requirements|implementation/i,
  /respond to.*question/i,
  /capability statement/i,
];
const HUMAN_PATTERNS = [
  /sign|signature|notarize/i,
  /bid.no.bid|go.no.go|approve|authorize|decision/i,
  /call|phone|talk|meeting/i,
  /pay|payment|wire|deposit|bond/i,
  /submit|upload to Bonfire|file/i,
  /negotiate|relationship/i,
  /CIQ|conflict of interest|form/i,
];

function classify(content, description) {
  const text = (content + ' ' + (description || '').replace(/<[^>]+>/g, ' ')).toLowerCase();
  const humanScore = HUMAN_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  const aiScore = AI_PATTERNS.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
  if (humanScore > aiScore) return { tier: 'HUMAN', confidence: humanScore };
  if (aiScore > 0) return { tier: 'AI', confidence: aiScore };
  return { tier: 'EITHER', confidence: 0 };
}

function suggestHuman(content) {
  const c = content.toLowerCase();
  if (/sign|cer.iq|notar|conflict of interest/i.test(c)) return 'Ali (legal signoff required)';
  if (/bid.no.bid|go.no.go|approve/i.test(c)) return 'Ali (executive decision)';
  if (/call|negotiat/i.test(c)) return 'Ali or Karun';
  if (/submit|upload|file|bond/i.test(c)) return 'Srinivas (procurement ops)';
  if (/pay|wire|deposit/i.test(c)) return 'Rashi (finance)';
  return 'Ali (default)';
}

function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function build() {
  console.log('Pulling Gov Contracts state...');
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const tset = proj.dock.find(d => d.name === 'todoset');
  const lists = await bcGetAll(`/buckets/${PROJECT_ID}/todosets/${tset.id}/todolists.json`);
  const todoset = lists.filter(l => /^(Harris|SLCC|TDCJ|Southlake|Detroit|Dallas|Galveston|TxDOT|City of)/i.test(l.name));

  const bidData = [];
  for (const list of todoset) {
    const openTodos = await bcGetAll(`/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json?status=remaining`);
    const allTodos = await bcGetAll(`/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json?completed=true`);
    const classified = openTodos.map(t => {
      const cls = classify(t.content, t.description);
      return {
        id: t.id, content: t.content, due_on: t.due_on, app_url: t.app_url, created_at: t.created_at,
        assignees: (t.assignees || []).map(a => a.name).join(', ') || 'unassigned',
        tier: cls.tier, confidence: cls.confidence,
        humanSuggestion: cls.tier === 'HUMAN' ? suggestHuman(t.content) : '',
      };
    });
    // Sort by sequence: due_on ASC (nulls last), then created_at ASC.
    // Bonfire-submission tickets typically have the latest due date, so they
    // naturally fall to the bottom of each list. Tasks without due dates
    // fall to the end and are flagged.
    classified.sort((a, b) => {
      if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
      if (a.due_on && !b.due_on) return -1;
      if (!a.due_on && b.due_on) return 1;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });
    // Identify NEXT step + NEXT HUMAN step per bid. Walk in sequence order:
    // first task is "next overall". First task whose tier is HUMAN is "next
    // waiting on a person". If next-overall is AI-doable, the report will
    // surface that as "CB System will auto-execute".
    const nextStep = classified[0] || null;
    const nextHumanStep = classified.find(t => t.tier === 'HUMAN') || null;
    // Find Bonfire submission task (typically the bid's terminal action)
    const bonfireTask = classified.find(t => /submit|bonfire|upload/i.test(t.content)) || null;
    bidData.push({
      id: list.id,
      name: list.name,
      app_url: list.app_url,
      completed: allTodos.length,
      open: openTodos.length,
      open_todos: classified,
      ratio: list.completed_ratio,
      nextStep,
      nextHumanStep,
      bonfireTask,
    });
  }

  // Recent message board for context
  const mb = proj.dock.find(d => d.name === 'message_board');
  const msgs = mb ? (await bcGetAll(`/buckets/${PROJECT_ID}/message_boards/${mb.id}/messages.json`)).slice(0, 8) : [];

  return { proj, bidData, msgs };
}

function renderHtml({ proj, bidData, msgs }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const totalOpen = bidData.reduce((s, b) => s + b.open, 0);
  const totalAi = bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'AI').length, 0);
  const totalHuman = bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'HUMAN').length, 0);
  const totalEither = bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'EITHER').length, 0);

  // Big-picture: per-bid status for the executive summary
  const bidsWaitingOnHuman = bidData.filter(b => b.nextHumanStep);
  const bidsClean = bidData.filter(b => b.open === 0);
  const totalNoDueDate = bidData.reduce((s, b) => s + b.open_todos.filter(t => !t.due_on).length, 0);

  // Overdue + this-week computation
  const weekFromNow = new Date(); weekFromNow.setDate(weekFromNow.getDate() + 7);
  const weekFromNowStr = weekFromNow.toISOString().slice(0, 10);
  const overdueTasks = bidData.flatMap(b => b.open_todos.filter(t => t.due_on && t.due_on < today).map(t => ({ ...t, bid: b.name, bid_url: b.app_url })));
  const dueThisWeek = bidData.flatMap(b => b.open_todos.filter(t => t.due_on && t.due_on >= today && t.due_on <= weekFromNowStr).map(t => ({ ...t, bid: b.name, bid_url: b.app_url })));

  // Helper: due-date pill
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

  const bidCards = bidData.map(b => {
    const nextHuman = b.nextHumanStep;
    const nextStep = b.nextStep;
    const nextStepIsAi = nextStep && nextStep.tier === 'AI';
    return `
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 22px;margin-bottom:14px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:16px;font-weight:800;color:#1a365d">${escape(b.name)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">${b.open} open &middot; ${b.completed} done &middot; <a href="${b.app_url}" style="color:#2b6cb0">Open in Basecamp &rarr;</a>${b.bonfireTask ? ` &middot; Bonfire deadline: ${b.bonfireTask.due_on || 'TBD'}` : ''}</div>
    </div>
  </div>

  ${b.open === 0 ? '<div style="margin-top:10px;color:#16a34a;font-size:13px;font-weight:600">No open todos. Clean.</div>' : nextHuman ? `
  <div style="margin-top:14px;background:#1c1917;color:white;padding:14px 16px;border-radius:8px;border-left:4px solid #fbbf24">
    <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Next step waiting on you</div>
    <a href="${nextHuman.app_url}" style="display:block;font-size:15px;color:white;text-decoration:none;font-weight:700;margin-top:4px;line-height:1.3">${escape(nextHuman.content)}</a>
    <div style="margin-top:6px;font-size:12px;color:#cbd5e0">${duePill(nextHuman.due_on)} &middot; suggested owner: <strong style="color:white">${escape(nextHuman.humanSuggestion || 'Ali')}</strong></div>
    <div style="margin-top:10px"><a href="${nextHuman.app_url}" style="display:inline-block;background:#fbbf24;color:#1c1917;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Open ticket &rarr;</a></div>
  </div>
  ${nextStepIsAi && nextStep !== nextHuman ? `<div style="margin-top:10px;padding:10px 14px;background:#dbeafe;border-radius:6px;font-size:12px;color:#1e3a8a"><strong>${escape(nextStep.content)}</strong> is the very next task and is AI-doable. CB System will pick this up automatically before the next report (v1.1 auto-runner). After that runs, ${escape(nextHuman.content)} (above) is the human gate.</div>` : ''}` : `
  <div style="margin-top:14px;padding:10px 14px;background:#dcfce7;border-radius:6px;font-size:12px;color:#166534">No human steps remaining. Last steps are AI-doable. CB System will execute before next report.</div>
  `}

  <div style="margin-top:14px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Full task sequence (${b.open} open, in execution order)</div>
  <table cellpadding="6" cellspacing="0" style="width:100%;font-size:13px;margin-top:6px;border-collapse:collapse">
    <thead><tr style="background:#1a365d">
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">#</th>
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">Task</th>
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">Due</th>
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">Tier</th>
      <th align="left" style="padding:10px;color:white;font-size:10px;letter-spacing:1px">Owner</th>
    </tr></thead>
    <tbody>
  ${b.open_todos.map((t, idx) => {
    const isNext = t.id === (nextHuman?.id || nextStep?.id);
    return `
    <tr style="background:${isNext ? '#fef9c3' : (idx % 2 === 0 ? '#f8fafc' : 'white')}">
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px;color:#64748b;font-weight:700">${idx + 1}</td>
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">
        <a href="${t.app_url}" style="color:#1a365d;text-decoration:none;font-weight:600">${escape(t.content)}</a>
      </td>
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">${duePill(t.due_on)}</td>
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">${tierPill(t.tier)}</td>
      <td style="border-bottom:1px solid #e2e8f0;padding:8px 10px;font-size:11px;color:#475569">${escape(t.humanSuggestion || (t.tier === 'AI' ? 'CB System' : t.assignees))}</td>
    </tr>`;
  }).join('')}
    </tbody>
  </table>
</div>`;
  }).join('');

  // Consolidated human-needed task list (cross-bid) — sorted by due date
  const allHumanTasks = bidData.flatMap(b => b.open_todos.filter(t => t.tier === 'HUMAN').map(t => ({ ...t, bid: b.name }))).sort((a, b) => {
    if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on && !b.due_on) return -1;
    if (!a.due_on && b.due_on) return 1;
    return 0;
  });
  const allAiTasks = bidData.flatMap(b => b.open_todos.filter(t => t.tier === 'AI').map(t => ({ ...t, bid: b.name }))).sort((a, b) => {
    if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on && !b.due_on) return -1;
    if (!a.due_on && b.due_on) return 1;
    return 0;
  });

  // Per-bid "next human step" rollup — what is each bid waiting on you for?
  const perBidNextHuman = bidData.filter(b => b.nextHumanStep).map(b => ({
    bidName: b.name,
    bidUrl: b.app_url,
    task: b.nextHumanStep,
  }));

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Gov Contracts Daily Analysis - ${dateStr}</title></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc"><tr><td align="center">
<table width="780" cellpadding="0" cellspacing="0" style="max-width:780px;background:#fff;border-radius:8px;margin:24px 0;overflow:hidden">

<tr><td style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:#fff;padding:28px 32px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Daily Gov Contracts Report</div>
  <h1 style="margin:6px 0 8px;font-size:26px;font-weight:800;color:white">Gov Contracts Status &mdash; ${escape(dateStr)}</h1>
  <div style="font-size:13px;color:#e2e8f0;line-height:1.6">${bidData.length} active bids &middot; ${totalOpen} open todos &middot; ${totalHuman} human-needed &middot; ${totalAi} AI-doable &middot; ${overdueTasks.length} overdue</div>
</td></tr>

<tr><td style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali - Big picture</div>
<div style="font-size:14px;margin-top:6px;line-height:1.55">
Ali, ${bidsWaitingOnHuman.length === 0 ? 'no bids are currently waiting on a human action. All next steps are AI-doable - CB System will execute before the next report.' : `<strong>${bidsWaitingOnHuman.length} of ${bidData.length} active bids ${bidsWaitingOnHuman.length === 1 ? 'is' : 'are'} waiting on you</strong>.`}
${overdueTasks.length > 0 ? ` <strong style="color:#fca5a5">${overdueTasks.length} task${overdueTasks.length === 1 ? '' : 's'} ${overdueTasks.length === 1 ? 'is' : 'are'} overdue.</strong>` : ''}
${dueThisWeek.length > 0 ? ` <strong style="color:#fde68a">${dueThisWeek.length} due this week.</strong>` : ''}
${totalNoDueDate > 0 ? ` <span style="color:#cbd5e0">${totalNoDueDate} tasks have no due date - assign one in Basecamp.</span>` : ''}
Each bid's next-human-step is highlighted below with a click-through. Tasks are sorted in execution order (Bonfire submission, the terminal action, falls naturally to the end).
</div>
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

<h2 style="color:#1a365d;font-size:18px;margin-top:24px;border-bottom:2px solid #1a365d;padding-bottom:6px">Each bid's next human step</h2>
${perBidNextHuman.length === 0 ? '<div style="background:#dcfce7;padding:14px 18px;border-radius:6px;color:#14532d;font-weight:600">All bids are unblocked on the AI side. CB System runs next.</div>' : `
<p style="margin:0 0 10px;font-size:13px;color:#475569"><strong>${perBidNextHuman.length} bid${perBidNextHuman.length === 1 ? '' : 's'} waiting on you.</strong> Sorted by due date. Click any row to open the ticket.</p>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;border:1px solid #e2e8f0">
<thead><tr style="background:#1a365d;color:white">
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">BID</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">NEXT HUMAN STEP</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">DUE</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">OWNER</th>
</tr></thead>
<tbody>
${perBidNextHuman.sort((a, b) => {
    if (a.task.due_on && b.task.due_on) return a.task.due_on.localeCompare(b.task.due_on);
    if (a.task.due_on) return -1;
    if (b.task.due_on) return 1;
    return 0;
  }).map((row, i) => `
<tr style="background:${i % 2 === 0 ? '#f8fafc' : 'white'}">
<td style="padding:12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;font-weight:600">${escape(row.bidName)}</td>
<td style="padding:12px;border-bottom:1px solid #e2e8f0"><a href="${row.task.app_url}" style="color:#1a365d;font-weight:700;text-decoration:none">${escape(row.task.content)}</a></td>
<td style="padding:12px;border-bottom:1px solid #e2e8f0">${duePill(row.task.due_on)}</td>
<td style="padding:12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#1a365d">${escape(row.task.humanSuggestion || 'Ali')}</td>
</tr>`).join('')}
</tbody>
</table>`}

${overdueTasks.length > 0 ? `
<h2 style="color:#991b1b;font-size:18px;margin-top:32px;border-bottom:2px solid #dc2626;padding-bottom:6px">Overdue (${overdueTasks.length})</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;border:1px solid #fecaca">
<thead><tr style="background:#7f1d1d;color:white">
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">TASK</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">BID</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">DUE</th>
<th style="text-align:left;padding:12px;font-size:10px;letter-spacing:1.5px;font-weight:700">TIER</th>
</tr></thead>
<tbody>
${overdueTasks.map((t, i) => `
<tr style="background:${i % 2 === 0 ? '#fef2f2' : 'white'}">
<td style="padding:10px 12px;border-bottom:1px solid #fecaca"><a href="${t.app_url}" style="color:#1a365d;font-weight:600;text-decoration:none">${escape(t.content)}</a></td>
<td style="padding:10px 12px;border-bottom:1px solid #fecaca;font-size:11px;color:#475569">${escape(t.bid)}</td>
<td style="padding:10px 12px;border-bottom:1px solid #fecaca">${duePill(t.due_on)}</td>
<td style="padding:10px 12px;border-bottom:1px solid #fecaca">${tierPill(t.tier)}</td>
</tr>`).join('')}
</tbody>
</table>` : ''}

<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #1a365d;padding-bottom:6px">Per-bid full task sequence</h2>
${bidCards}

${msgs.length > 0 ? `
<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Recent message board activity</h2>
<ul style="font-size:13px">
${msgs.map(m => `<li style="margin-bottom:4px"><span style="color:#a0aec0">${m.created_at.slice(0, 10)}</span> &middot; <a href="${m.app_url}" style="color:#1a365d">${escape(m.subject)}</a></li>`).join('')}
</ul>` : ''}

<div style="background:#f8fafc;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:240px;color:#475569"><strong>Click the next human step</strong></td><td style="padding:6px 0;vertical-align:top">Each row in the "Each bid's next human step" table is the click-through. Tackle in due-date order.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Assign missing due dates</strong></td><td style="padding:6px 0;vertical-align:top">${totalNoDueDate} tasks have no due date. The report sorts them last in their bid but you should set due dates in Basecamp for accurate sequencing.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Have CB pick up an AI task</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System execute &lt;task title&gt;</code> in any thread, or wait for the v1.1 auto-runner.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Re-classify a task</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System mark &lt;task&gt; as HUMAN/AI/EITHER</code>.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Ask CB anything</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System &lt;anything&gt;</code> in any Basecamp thread.</td></tr>
</table>
</div>

</td></tr>

<tr><td style="background:#f7fafc;padding:16px 32px;text-align:center;font-size:11px;color:#718096;border-top:1px solid #e2e8f0">
Generated ${now.toISOString()} &middot; Source: Basecamp project ${PROJECT_ID} &middot; Script: backend/src/scripts/dailyGovContractsAnalysis.js
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

(async () => {
  const runRecord = await recorder.start('Daily Gov Contracts Analysis');
  try {
    const data = await build();
    const html = renderHtml(data);

    // Save to docs for archive
    const outPath = path.resolve(__dirname, '../../../docs/gov-contracts-daily-' + new Date().toISOString().slice(0, 10) + '.html');
    fs.writeFileSync(outPath, html);
    console.log('Saved report:', outPath);

    if (!process.env.MANDRILL_API_KEY) {
      console.log('No MANDRILL_API_KEY, skipping email send');
      process.exit(0);
    }

    const textBody = `Gov Contracts daily analysis for ${new Date().toLocaleDateString()}. See the HTML email for the full breakdown.

${data.bidData.length} active bids, ${data.bidData.reduce((s, b) => s + b.open, 0)} open todos.

Human-only: ${data.bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'HUMAN').length, 0)}
AI-doable: ${data.bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'AI').length, 0)}
Either: ${data.bidData.reduce((s, b) => s + b.open_todos.filter(t => t.tier === 'EITHER').length, 0)}

Open the email for the per-bid breakdown and the human-task assignment suggestions.`;

    const r = await nodemailer.createTransport({
      host: 'smtp.mandrillapp.com', port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    }).sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: RECIPIENT,
      cc: RECIPIENT_PHONE,
      subject: `[Daily Report] Gov Contracts - ${new Date().toLocaleDateString()} - ${data.bidData.reduce((s, b) => s + b.open, 0)} open todos`,
      text: textBody,
      html,
      headers: {
        'X-MC-Track': 'none',
        'X-MC-AutoText': 'false',
        // Nudge Gmail to keep this out of Promotions tab and into Primary.
        'Importance': 'high',
        'X-Priority': '1',
      },
    });
    console.log('Sent:', r.messageId);
    await recorder.end(runRecord, { status: 'success', messageIds: [r.messageId], recipientsSent: [RECIPIENT, RECIPIENT_PHONE] });
  } catch (e) {
    console.error('FAIL:', e.message);
    await recorder.end(runRecord, { status: 'failure', error: e.message });
    process.exit(1);
  }
})();
