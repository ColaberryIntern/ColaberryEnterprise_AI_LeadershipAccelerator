// Launch PMO daily heartbeat.
//
// Runs every morning Mon-Fri 8am CST. Pulls full project state, computes
// area readiness %, applies escalation rules (1/3/5/7 day overdue), generates
// an executive update via gpt-4o, emails Ali, and posts the HUMAN ACTION
// QUEUE on the project Message Board.
//
// Pure orchestrator - reads state, no Basecamp writes other than the daily
// MB message (idempotent: subject keyed on the date).

const path = require('path');
const fs = require('fs');
const ops = require('./launchPmoOps');
const { TEAM, LAUNCH, provisioned, missing, getByPersonId } = require('./launchPmoTeam');

const NURTURE_STATE_PATH = path.resolve(__dirname, '../../../../tmp/launch-pmo-nurture-state.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dateYMD(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function isWeekday(d = new Date()) {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}
function daysBetween(a, b) {
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}
function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

// Mandrill preflight rejects "Ali Muwwakkil" appearing 3+ times (signature
// duplicate detection). Both the HTML and text generators reference Ali by
// full name in multiple table rows (assignee columns) - collapse to "Ali"
// before preflight, then put the full name back only in the signature.
function normalizeAliName(s) { return (s || '').replace(/Ali Muwwakkil/g, 'Ali'); }

// Designated human reviewer per area. When CB drafts an AI task, this is the
// human who should review + refine + mark complete. Used in the "AI drafts
// awaiting human review" section and the per-area "Owner" column for drafted
// rows. Shows the actual human responsible, NOT CB System (which is just the
// BC assignee on the drafter side).
const REVIEWER_BY_AREA = {
  'Curriculum': 'Swati Raman',
  'Website - training.colaberry.com': 'Sai Tejesh',
  'Website - enterprise.colaberry.ai': 'Kes Delele',
  'Marketing': 'Sohail Syed',
  'AI Systems': 'Kes Delele',
  'Open Houses & Events': 'Jackie Chalk',
  'Sales & Admissions': 'Taiwo Oludimimu', // Roselen-pending
  'TWC Compliance': 'Swati Raman',
  'Approval Queues': 'Ali',
  'Launch Readiness Dashboard': 'Ali',
};
function reviewerFor(areaName) { return REVIEWER_BY_AREA[areaName] || 'Ali'; }

// Tier inference: read the "AI TASK" / "HUMAN TASK" badge embedded in the
// description by the task generator. Fallback: assignee == CB System -> AI.
function tierOf(todo) {
  const desc = todo.description || '';
  if (/HUMAN TASK/i.test(desc)) return 'HUMAN';
  if (/AI TASK/i.test(desc)) return 'AI';
  const assignees = (todo.assignees || []).map((a) => a.name || '');
  if (assignees.length === 1 && /CB System/i.test(assignees[0])) return 'AI';
  if (assignees.some((n) => !/CB System/i.test(n))) return 'HUMAN';
  return 'EITHER';
}

// Per-area feasibility scoring. Mirrors govContracts pattern (days available
// vs work remaining). Returns { score 0-100, tier, reason, requiredDays,
// daysToLaunch, humansRemaining, aiRemaining }.
function computeAreaFeasibility(area, daysToLaunch) {
  const human = area.openTodos.filter((t) => t.tier === 'HUMAN').length;
  const ai = area.openTodos.filter((t) => t.tier === 'AI').length;
  const either = area.openTodos.filter((t) => t.tier === 'EITHER').length;
  const overdueCount = area.overdue.length;
  const HUMAN_DAYS = 1.5, AI_DAYS = 0.15, EITHER_DAYS = 0.8;
  const requiredDays = human * HUMAN_DAYS + ai * AI_DAYS + either * EITHER_DAYS;
  if (area.openCount === 0) {
    return { score: 100, tier: 'ON_TRACK', reason: 'No open work. Clean.', requiredDays: 0, daysToLaunch, humansRemaining: 0, aiRemaining: 0 };
  }
  if (daysToLaunch <= 0) {
    return { score: 10, tier: 'LIKELY_SCRAP', reason: 'Past launch date with open work.', requiredDays, daysToLaunch, humansRemaining: human, aiRemaining: ai };
  }
  const ratio = requiredDays / daysToLaunch;
  let score, reason;
  if (ratio <= 0.4) { score = 95; reason = `${requiredDays.toFixed(1)} work-days vs ${daysToLaunch} days available. Tons of slack.`; }
  else if (ratio <= 0.6) { score = 85; reason = `${requiredDays.toFixed(1)} work-days vs ${daysToLaunch} days. Comfortable.`; }
  else if (ratio <= 0.85) { score = 70; reason = `${requiredDays.toFixed(1)} work-days vs ${daysToLaunch} days. Tight but doable.`; }
  else if (ratio <= 1.15) { score = 55; reason = `${requiredDays.toFixed(1)} work-days vs ${daysToLaunch} days. Marginal, no buffer.`; }
  else if (ratio <= 1.5) { score = 35; reason = `${requiredDays.toFixed(1)} work-days vs ${daysToLaunch} days. Likely to miss.`; }
  else { score = 15; reason = `${requiredDays.toFixed(1)} work-days vs ${daysToLaunch} days. Very unlikely.`; }
  score = Math.max(0, score - overdueCount * 5);
  const tier = score >= 80 ? 'ON_TRACK' : score >= 50 ? 'AT_RISK' : 'LIKELY_SCRAP';
  return { score, tier, reason, requiredDays: +requiredDays.toFixed(1), daysToLaunch, humansRemaining: human, aiRemaining: ai };
}

// Load the AI runner state so we can mark already-drafted tasks as
// "awaiting human review" rather than presenting them as the next AI step.
// Path: tmp/launch-pmo-ai-runner-state.json -> { tasks: { [taskId]: { at, briefs, chars } } }
function loadCbDraftedIds() {
  try {
    const runner = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../tmp/launch-pmo-ai-runner-state.json'), 'utf8'));
    return new Set(Object.keys(runner.tasks || {}).map(String));
  } catch { return new Set(); }
}

// ---------------------------------------------------------------------------
// State pull (v2 - tier-classified, with feasibility per area)
// ---------------------------------------------------------------------------
async function pullProjectState() {
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);
  const today = dateYMD();
  const daysToLaunch = daysBetween(LAUNCH.targetLaunchDate, today);
  const cbDraftedIds = loadCbDraftedIds();
  const areas = [];
  for (const list of lists) {
    const todos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json`);
    const completedTodos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json?completed=true`);
    const all = [...todos, ...completedTodos];
    const openRaw = todos.filter((t) => !t.completed);
    // Classify tier + decorate
    const openTodos = openRaw.map((t) => ({
      id: t.id,
      content: t.content,
      description: t.description,
      due_on: t.due_on,
      url: t.app_url,
      assignees: (t.assignees || []).map((a) => a.name),
      tier: tierOf(t),
      cbDrafted: cbDraftedIds.has(String(t.id)),
    }));
    // Sort by due_on (nulls last)
    openTodos.sort((a, b) => {
      if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
      if (a.due_on && !b.due_on) return -1;
      if (!a.due_on && b.due_on) return 1;
      return 0;
    });
    const overdue = openTodos
      .filter((t) => t.due_on && t.due_on < today)
      .map((t) => ({ ...t, days_overdue: daysBetween(today, t.due_on) }));
    const upcoming = openTodos.filter((t) => t.due_on && t.due_on >= today);
    const total = all.length;
    const done = completedTodos.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    // Per-area recently completed (last 7 days), all tiers (not just AI)
    const cutoffMs = Date.now() - 7 * 86400000;
    const recentCompleted = (completedTodos || [])
      .filter((t) => {
        const ca = t.completion?.created_at;
        return ca && new Date(ca).getTime() >= cutoffMs;
      })
      .map((t) => ({
        id: t.id, content: t.content, url: t.app_url,
        completed_at: t.completion.created_at,
        completedBy: t.completion?.creator?.name || 'unknown',
        tier: tierOf(t),
      }))
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

    const area = {
      listId: list.id, listName: list.name, listUrl: list.app_url,
      total, done, pct, openCount: openTodos.length,
      openTodos, overdue, upcoming, recentCompleted,
    };
    // Compute per-area "next" steps. blocked-task + cb-drafted filters apply.
    // Key rule (per Ali's audit): if a task is AI-tier and CB has already
    // drafted it, exclude it from "next" picks - it's awaiting human review,
    // not a CB-action gap. CB doesn't re-execute already-drafted tasks.
    const nextEligible = (t) => !t.cbDrafted;
    area.nextStep = openTodos.find(nextEligible) || null;
    area.nextHumanStep = openTodos.find((t) => (t.tier === 'HUMAN' || t.tier === 'EITHER') && nextEligible(t)) || null;
    area.nextAiStep = openTodos.find((t) => t.tier === 'AI' && nextEligible(t)) || null;
    area.draftedAwaitingReview = openTodos.filter((t) => t.cbDrafted);
    area.humanCount = openTodos.filter((t) => t.tier === 'HUMAN').length;
    area.aiCount = openTodos.filter((t) => t.tier === 'AI').length;
    area.eitherCount = openTodos.filter((t) => t.tier === 'EITHER').length;
    area.feasibility = computeAreaFeasibility(area, daysToLaunch);
    areas.push(area);
  }
  const totalAll = areas.reduce((s, a) => s + a.total, 0);
  const doneAll = areas.reduce((s, a) => s + a.done, 0);
  const overall = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;
  const totalHuman = areas.reduce((s, a) => s + a.humanCount, 0);
  const totalAi = areas.reduce((s, a) => s + a.aiCount, 0);
  const totalEither = areas.reduce((s, a) => s + a.eitherCount, 0);
  const totalOverdue = areas.reduce((s, a) => s + a.overdue.length, 0);
  return { areas, totalAll, doneAll, overall, totalHuman, totalAi, totalEither, totalOverdue, daysToLaunch, today };
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------
function classifyEscalation(daysOverdue) {
  if (daysOverdue >= 7) return 'CRITICAL_RISK';
  if (daysOverdue >= 5) return 'NOTIFY_ALI';
  if (daysOverdue >= 3) return 'ESCALATE_LEAD';
  if (daysOverdue >= 1) return 'REMINDER';
  return 'NONE';
}

function buildEscalationList(state) {
  const escalations = [];
  for (const a of state.areas) {
    for (const t of a.overdue) {
      const cls = classifyEscalation(t.days_overdue);
      if (cls === 'NONE') continue;
      escalations.push({ area: a.listName, ...t, classification: cls });
    }
  }
  // Sort: CRITICAL first, then by days overdue desc
  const order = { CRITICAL_RISK: 0, NOTIFY_ALI: 1, ESCALATE_LEAD: 2, REMINDER: 3 };
  escalations.sort((a, b) => (order[a.classification] - order[b.classification]) || (b.days_overdue - a.days_overdue));
  return escalations;
}

// ---------------------------------------------------------------------------
// Queue builders - tier-based, leveraging the rich state.areas[].openTodos.
// ---------------------------------------------------------------------------
function buildHumanActionQueue(state) {
  const queue = [];
  for (const a of state.areas) {
    for (const t of a.openTodos) {
      if (t.tier !== 'HUMAN' && t.tier !== 'EITHER') continue;
      if (!t.due_on) continue;
      if (t.cbDrafted) continue; // exclude already-drafted awaiting-review tasks
      queue.push({ area: a.listName, ...t });
    }
  }
  queue.sort((a, b) => a.due_on.localeCompare(b.due_on));
  return queue;
}

function buildAiQueue(state) {
  const ai = [];
  for (const a of state.areas) {
    for (const t of a.openTodos) {
      if (t.tier !== 'AI') continue;
      if (!t.due_on) continue;
      if (t.cbDrafted) continue; // CB doesn't re-execute already-drafted tasks
      ai.push({ area: a.listName, ...t });
    }
  }
  ai.sort((a, b) => a.due_on.localeCompare(b.due_on));
  return ai;
}

// Tasks CB has drafted, sorted by due date (these are visible in the
// "Awaiting human review" section of the email so Ali can see what CB has
// queued up for human approval).
function buildAwaitingReviewQueue(state) {
  const q = [];
  for (const a of state.areas) {
    for (const t of (a.draftedAwaitingReview || [])) {
      q.push({ area: a.listName, ...t });
    }
  }
  q.sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999'));
  return q;
}

// ---------------------------------------------------------------------------
// AI completion log: tasks CB auto-runner has drafted + recently completed.
// Sources:
//   1. tmp/launch-pmo-ai-runner-state.json (every task CB has drafted)
//   2. BC completed_todos in each list (assignee=CB System AND completed_at in last 7 days)
// ---------------------------------------------------------------------------
const AI_RUNNER_STATE_PATH = path.resolve(__dirname, '../../../../tmp/launch-pmo-ai-runner-state.json');
function loadAiRunnerLog() {
  try { return JSON.parse(fs.readFileSync(AI_RUNNER_STATE_PATH, 'utf8')); }
  catch { return { tasks: {} }; }
}

async function buildAiCompletionLog(state) {
  const runnerLog = loadAiRunnerLog();
  // Build BC task content lookup by id (across areas)
  const taskById = new Map();
  for (const a of state.areas) {
    for (const t of a.openTodos) taskById.set(String(t.id), { content: t.content, area: a.listName, url: t.url });
  }
  // Recent CB-drafted tasks (from state file)
  const recentDrafted = Object.entries(runnerLog.tasks || {})
    .map(([id, info]) => ({
      id, when: info.at, briefs: info.briefs || [], chars: info.chars || 0,
      ...(taskById.get(id) || { content: '(task not currently visible)', area: 'unknown', url: null }),
    }))
    .sort((a, b) => (b.when || '').localeCompare(a.when || ''))
    .slice(0, 12);

  // Recently-completed AI tasks: pull completed=true per list and filter for
  // CB-assigned with completion_at < 7 days ago.
  const cutoffMs = Date.now() - 7 * 86400000;
  const recentCompleted = [];
  for (const a of state.areas) {
    let done;
    try { done = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${a.listId}/todos.json?completed=true`); }
    catch { continue; }
    for (const t of (done || [])) {
      const ca = t.completion?.created_at;
      if (!ca || new Date(ca).getTime() < cutoffMs) continue;
      const tier = tierOf(t);
      const assignees = (t.assignees || []).map((x) => x.name || '');
      const isCb = tier === 'AI' || assignees.some((n) => /CB System/i.test(n));
      if (!isCb) continue;
      recentCompleted.push({
        id: t.id, content: t.content, area: a.listName,
        completed_at: ca, url: t.app_url,
        completedBy: t.completion?.creator?.name || 'CB System',
      });
    }
  }
  recentCompleted.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  return { recentDrafted, recentCompleted: recentCompleted.slice(0, 12) };
}

// ---------------------------------------------------------------------------
// GPT-4o executive update generator
// ---------------------------------------------------------------------------
async function generateExecSummary(state, escalations, humanQueue, aiQueue) {
  if (!process.env.OPENAI_API_KEY) {
    return { exec_summary: '(OPENAI_API_KEY missing - skipping AI summary)', risks: [], next_human_actions: [] };
  }
  const OpenAI = require(path.resolve(__dirname, '../../../../node_modules/openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const context = {
    days_to_launch: state.daysToLaunch,
    today: state.today,
    overall_readiness_pct: state.overall,
    areas: state.areas.map((a) => ({ name: a.listName, pct: a.pct, open: a.openCount, overdue: a.overdue.length })),
    escalations: escalations.slice(0, 10),
    next_human_actions: humanQueue.slice(0, 8),
    next_ai_tasks: aiQueue.slice(0, 8),
  };

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: {
      name: 'exec_update',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          exec_summary: { type: 'string', description: 'One-paragraph executive narrative for Ali. State of the launch in plain English. No fluff. No em-dashes (use hyphens).' },
          risks: { type: 'array', items: { type: 'string' }, description: 'Up to 5 risks ranked by severity. Each is a single sentence.' },
          critical_path: { type: 'string', description: 'The single most important thing that has to happen this week to keep launch on track.' },
        },
        required: ['exec_summary', 'risks', 'critical_path'],
      },
    } },
    messages: [
      { role: 'system', content: 'You are CB System, Ali Muwwakkil\'s AI Program Management Office for the AI Systems Architect Accelerator launch. You produce concise, executive-grade daily updates. No em-dashes anywhere (use commas or hyphens). No fluff. Direct, 12th-grade reading level. Reference specific area names and task names when applicable.' },
      { role: 'user', content: `Daily project state JSON:\n${JSON.stringify(context, null, 2)}\n\nProduce the executive update.` },
    ],
  });
  let parsed = {};
  try { parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}'); }
  catch { parsed = { exec_summary: '(parse error)', risks: [], critical_path: '' }; }
  parsed.exec_summary = stripEmDashes(parsed.exec_summary || '');
  parsed.critical_path = stripEmDashes(parsed.critical_path || '');
  parsed.risks = (parsed.risks || []).map(stripEmDashes);
  return parsed;
}

// ---------------------------------------------------------------------------
// Rendering helpers (Gov Contracts pattern)
// ---------------------------------------------------------------------------
function htmlEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function tierPill(tier) {
  if (tier === 'HUMAN') return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#fef3c7;color:#7c2d12;letter-spacing:0.5px">HUMAN</span>';
  if (tier === 'AI') return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#dbeafe;color:#1e3a8a;letter-spacing:0.5px">AI</span>';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#f1f5f9;color:#334155;letter-spacing:0.5px">EITHER</span>';
}
function duePill(due_on, today) {
  if (!due_on) return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#1c1917;color:#fbbf24;letter-spacing:0.5px">NO DUE</span>';
  if (due_on < today) return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#dc2626;color:white">OVERDUE ${due_on}</span>`;
  const daysOut = Math.round((new Date(due_on).getTime() - new Date(today).getTime()) / 86400000);
  if (daysOut <= 7) return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#ca8a04;color:white">DUE ${due_on}</span>`;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#e2e8f0;color:#475569">due ${due_on}</span>`;
}
function scoreBadge(feas) {
  const color = feas.tier === 'ON_TRACK' ? { bg: '#dcfce7', fg: '#14532d' }
    : feas.tier === 'AT_RISK' ? { bg: '#fef3c7', fg: '#78350f' }
    : { bg: '#fee2e2', fg: '#7f1d1d' };
  const label = feas.tier.replace('_', ' ');
  return `<span style="display:inline-block;padding:4px 12px;border-radius:8px;font-size:11px;font-weight:700;background:${color.bg};color:${color.fg};letter-spacing:0.5px">${label} &middot; ${feas.score}</span>`;
}
function renderAreaCard(area, today, blockerMap) {
  // The "next" picks now skip CB-drafted tasks (those are awaiting human review).
  const nextH = area.openTodos.find((t) => (t.tier === 'HUMAN' || t.tier === 'EITHER') && !blockerMap.get(t.id)?.blocked && !t.cbDrafted);
  const nextA = area.openTodos.find((t) => t.tier === 'AI' && !blockerMap.get(t.id)?.blocked && !t.cbDrafted);
  const blockedHere = area.openTodos.filter((t) => blockerMap.get(t.id)?.blocked);
  const draftedHere = area.openTodos.filter((t) => t.cbDrafted);
  const fs = area.feasibility;
  const fsColor = fs.tier === 'LIKELY_SCRAP' ? '#fef2f2' : fs.tier === 'AT_RISK' ? '#fffbeb' : '#f0fdf4';
  // ONE unified sequence per area, ordered by due date (next at top).
  // Per Ali's spec: every task visible in order. AI tasks CB drafted stay
  // in line; the FIRST unblocked HUMAN task is the visual "next" highlight;
  // every row carries its tier badge + state badge.
  const reviewer = reviewerFor(area.listName);
  const ordered = [...area.openTodos].sort((a, b) => {
    const ad = a.due_on || '9999-12-31', bd = b.due_on || '9999-12-31';
    if (ad !== bd) return ad.localeCompare(bd);
    // Same due date: AI before HUMAN (CB drafts first, human reviews)
    if (a.tier !== b.tier) return a.tier === 'AI' ? -1 : 1;
    return 0;
  });
  // First unblocked HUMAN task is the visual "next" highlight
  const firstNextHuman = ordered.find((t) => (t.tier === 'HUMAN' || t.tier === 'EITHER') && !t.cbDrafted && !blockerMap.get(t.id)?.blocked);

  const taskRows = ordered.slice(0, 20).map((t, idx) => {
    const isBlocked = blockerMap.get(t.id)?.blocked;
    const isDrafted = t.cbDrafted;
    const isNextHuman = firstNextHuman && t.id === firstNextHuman.id;
    const ownerRaw = (t.assignees || []).join(', ').replace(/Ali Muwwakkil/g, 'Ali');
    const owner = isDrafted
      ? `${reviewer} to review`
      : (ownerRaw || (t.tier === 'AI' ? 'CB System' : 'unassigned'));
    const rowBg = isNextHuman ? '#fef9c3'
      : isBlocked ? '#fef2f2'
      : isDrafted ? '#eff6ff'
      : (idx % 2 === 0 ? '#f8fafc' : 'white');
    const stateBadge = isNextHuman ? '<div style="font-size:10px;color:#92400e;margin-top:2px;font-weight:700">&larr; NEXT HUMAN STEP</div>'
      : isBlocked ? '<div style="font-size:10px;color:#991b1b;margin-top:2px;font-style:italic">BLOCKED on upstream</div>'
      : isDrafted ? `<div style="font-size:10px;color:#1e40af;margin-top:2px;font-weight:700">DRAFTED BY CB - ${reviewer} to review</div>`
      : '';
    return `<tr style="background:${rowBg}">
<td style="border-bottom:1px solid #e2e8f0;padding:8px 10px;color:#64748b;font-weight:700;font-size:11px">${idx + 1}</td>
<td style="border-bottom:1px solid #e2e8f0;padding:8px 10px"><a href="${t.url}" style="color:#1a365d;text-decoration:none;font-weight:600;font-size:12px">${htmlEsc(stripEmDashes(stripHtml(t.content))).slice(0, 95)}</a>${stateBadge}</td>
<td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">${duePill(t.due_on, today)}</td>
<td style="border-bottom:1px solid #e2e8f0;padding:8px 10px">${tierPill(t.tier)}</td>
<td style="border-bottom:1px solid #e2e8f0;padding:8px 10px;font-size:11px;color:#475569">${htmlEsc(owner)}</td>
</tr>`;
  }).join('');

  // Recently completed in this area (last 7 days)
  const recentRows = (area.recentCompleted || []).slice(0, 5).map((t) =>
    `<tr style="background:#f0fdf4"><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#166534">&#x2713;</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${t.url}" style="color:#1a365d;text-decoration:none">${htmlEsc(stripEmDashes(stripHtml(t.content))).slice(0, 95)}</a></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${(t.completed_at || '').slice(0, 10)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${htmlEsc(t.completedBy || '')}</td></tr>`).join('');
  return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 22px;margin-bottom:14px">
<div style="display:table;width:100%"><div style="display:table-cell"><div style="font-size:16px;font-weight:800;color:#1a365d">${htmlEsc(area.listName)}</div>
<div style="font-size:11px;color:#64748b;margin-top:2px">${area.openCount} open &middot; ${area.done} done &middot; ${area.humanCount} human &middot; ${area.aiCount} AI &middot; <a href="${area.listUrl}" style="color:#2b6cb0">Open in Basecamp &rarr;</a></div></div>
<div style="display:table-cell;text-align:right">${scoreBadge(fs)}</div></div>
<div style="margin-top:8px;padding:8px 12px;background:${fsColor};border-radius:6px;font-size:11px;color:#475569"><strong>Feasibility:</strong> ${htmlEsc(fs.reason)}</div>
${nextH ? `<div style="margin-top:14px;background:#1c1917;color:white;padding:14px 16px;border-radius:8px;border-left:4px solid #fbbf24">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Next human step blocking this area</div>
<a href="${nextH.url}" style="display:block;font-size:14px;color:white;text-decoration:none;font-weight:700;margin-top:4px;line-height:1.3">${htmlEsc(stripEmDashes(stripHtml(nextH.content)))}</a>
<div style="margin-top:6px;font-size:11px;color:#cbd5e0">${duePill(nextH.due_on, today)} &middot; <strong style="color:white">${htmlEsc((nextH.assignees || []).join(', ').replace(/Ali Muwwakkil/g, 'Ali') || 'unassigned')}</strong></div>
<div style="margin-top:8px"><a href="${nextH.url}" style="display:inline-block;background:#fbbf24;color:#1c1917;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:700;text-decoration:none;letter-spacing:0.5px">Open ticket &rarr;</a></div>
</div>` : '<div style="margin-top:14px;padding:10px 14px;background:#dcfce7;border-radius:6px;font-size:12px;color:#166534">No human step blocking this area. CB executes next.</div>'}
${nextA && nextA.id !== nextH?.id ? `<div style="margin-top:8px;padding:10px 14px;background:#dbeafe;border-radius:6px;font-size:11px;color:#1e3a8a"><strong>Next AI step:</strong> ${htmlEsc(stripEmDashes(stripHtml(nextA.content)))} (due ${nextA.due_on || 'unset'}). CB runs overnight.</div>` : ''}
${draftedHere.length ? `<div style="margin-top:8px;padding:8px 12px;background:#eff6ff;border-radius:6px;font-size:11px;color:#1e40af"><strong>${draftedHere.length} CB draft${draftedHere.length === 1 ? '' : 's'} in line for ${reviewer} to review.</strong></div>` : ''}
${blockedHere.length ? `<div style="margin-top:8px;padding:8px 12px;background:#fef2f2;border-radius:6px;font-size:11px;color:#7f1d1d"><strong>${blockedHere.length} blocked task${blockedHere.length === 1 ? '' : 's'}:</strong> ${blockedHere.slice(0, 3).map((b) => htmlEsc(stripHtml(b.content).slice(0, 60))).join('; ')}${blockedHere.length > 3 ? '...' : ''}</div>` : ''}
<div style="margin-top:14px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Task sequence (${area.openCount} open, ordered by due date)</div>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;margin-top:6px;border-collapse:collapse">
<thead><tr style="background:#1a365d"><th align="left" style="padding:8px 10px;color:white;font-size:10px">#</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Task</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Due</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Tier</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Owner</th></tr></thead>
<tbody>${taskRows}</tbody></table>
${recentRows ? `<div style="margin-top:14px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Recently completed (last 5)</div>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;margin-top:6px;border-collapse:collapse">
<thead><tr style="background:#14532d"><th align="left" style="padding:8px 10px;color:white;font-size:10px">&#x2713;</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Task</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">Completed</th><th align="left" style="padding:8px 10px;color:white;font-size:10px">By</th></tr></thead>
<tbody>${recentRows}</tbody></table>` : ''}
</div>`;
}

// ---------------------------------------------------------------------------
// Email to Ali (Mandrill)
// ---------------------------------------------------------------------------
async function emailAli({ state, aiSummary, humanQueue, escalations, nurturePosted = [], blockedHumanTasks = [], blockerMap, aiLog }) {
  if (!process.env.MANDRILL_API_KEY) return { skipped: 'no MANDRILL_API_KEY' };
  const nodemailer = require(path.resolve(__dirname, '../../../../node_modules/nodemailer'));
  const { validateBeforeSend } = require(path.resolve(__dirname, './mandrillPreflight'));

  const today = state.today;

  const escRows = escalations.slice(0, 8).map((e) =>
    `<tr><td>${e.classification}</td><td>${e.days_overdue}d</td><td>${e.area}</td><td>${stripEmDashes(stripHtml(e.content)).slice(0, 80)}</td><td>${(e.assignees || []).join(', ') || 'unassigned'}</td></tr>`
  ).join('') || '<tr><td colspan="5">No escalations today.</td></tr>';

  const feasibilityRows = [...state.areas]
    .sort((a, b) => (a.feasibility.score - b.feasibility.score))
    .map((a, i) => `<tr style="background:${i % 2 === 0 ? '#f8fafc' : 'white'}">
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a365d;font-size:12px">${htmlEsc(a.listName)}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${scoreBadge(a.feasibility)}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${a.feasibility.requiredDays}d work / ${a.feasibility.daysToLaunch}d left</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">H ${a.humanCount} / AI ${a.aiCount}${a.eitherCount ? ` / E ${a.eitherCount}` : ''}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${htmlEsc(a.feasibility.reason)}</td>
</tr>`).join('');

  const perAreaNextHumanRows = state.areas
    .map((a) => {
      const nextH = a.openTodos.find((t) => (t.tier === 'HUMAN' || t.tier === 'EITHER') && !blockerMap.get(t.id)?.blocked);
      if (!nextH) return null;
      const owner = (nextH.assignees || []).join(', ').replace(/Ali Muwwakkil/g, 'Ali') || 'unassigned';
      return `<tr><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a365d;font-size:12px">${htmlEsc(a.listName)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">${duePill(nextH.due_on, today)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${nextH.url}" style="color:#1a365d;text-decoration:none;font-weight:600">${htmlEsc(stripEmDashes(stripHtml(nextH.content))).slice(0, 110)}</a></td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${htmlEsc(owner)}</td></tr>`;
    })
    .filter(Boolean).join('');

  const areaCards = state.areas.map((a) => renderAreaCard(a, today, blockerMap)).join('');

  // Awaiting-review queue (CB-drafted but human hasn't approved yet)
  const awaitingReview = buildAwaitingReviewQueue(state);
  const awaitingRows = awaitingReview.slice(0, 12).map((t) => {
    const reviewer = reviewerFor(t.area);
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${t.url}" style="color:#1a365d;text-decoration:none;font-weight:600">${htmlEsc(stripEmDashes(stripHtml(t.content))).slice(0, 100)}</a></td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${htmlEsc(t.area)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${duePill(t.due_on, today)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;font-weight:600">${htmlEsc(reviewer)}</td></tr>`;
  }).join('');

  // Pick the single Ali-targeted "next human action" (his next decision-point).
  // If none assigned directly to Ali, fall back to the topmost human task by due date.
  const aliTasks = humanQueue.filter((h) => (h.assignees || []).some((a) => /Ali Muwwakkil/i.test(a)));
  const nextForAli = aliTasks[0] || humanQueue[0] || null;
  // Per-person "next human action" (top 1 per assignee, excluding Ali's).
  const perPerson = {};
  for (const h of humanQueue) {
    for (const a of (h.assignees || [])) {
      const name = (a || '').replace(/Ali Muwwakkil/i, '').trim();
      if (!name) continue;
      if (!perPerson[name]) perPerson[name] = h;
    }
  }
  const perPersonRows = Object.entries(perPerson).slice(0, 8)
    .map(([name, t]) => `<tr><td>${name}</td><td>${t.due_on}</td><td>${stripEmDashes(stripHtml(t.content)).slice(0, 90)}</td><td>${t.area}</td></tr>`).join('');
  const nextBanner = nextForAli
    ? `<div style="background:#fef3c7;border-left:6px solid #d97706;padding:16px 22px;margin:0 0 18px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">YOUR TURN - next decision to unblock the project</div>
<div style="font-size:17px;font-weight:700;color:#1a202c;margin-top:6px">${stripEmDashes(stripHtml(nextForAli.content))}</div>
<div style="font-size:13px;color:#1f2937;margin-top:6px">Area: <strong>${nextForAli.area}</strong> | Due: <strong>${nextForAli.due_on}</strong>${nextForAli.url ? ` | <a href="${nextForAli.url}" style="color:#1e40af">Open in Basecamp</a>` : ''}</div>
</div>`
    : '<div style="background:#dcfce7;border-left:6px solid #15803d;padding:14px 18px;margin:0 0 18px"><strong>You are clear.</strong> No human action queued for you right now.</div>';

  const aiDraftedRows = (aiLog?.recentDrafted || []).slice(0, 10).map((a) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${(a.when || '').slice(0, 16).replace('T', ' ')}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px">${a.url ? `<a href="${a.url}" style="color:#1a365d;text-decoration:none">${htmlEsc(stripHtml(a.content)).slice(0, 90)}</a>` : htmlEsc(stripHtml(a.content)).slice(0, 90)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${htmlEsc(a.area)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${(a.briefs || []).join(', ').slice(0, 60)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;text-align:right">${a.chars}</td></tr>`).join('') || '<tr><td colspan="5" style="padding:8px;color:#64748b;font-size:12px">No AI drafts yet.</td></tr>';

  const aiCompletedRows = (aiLog?.recentCompleted || []).slice(0, 10).map((a) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${(a.completed_at || '').slice(0, 16).replace('T', ' ')}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${a.url}" style="color:#1a365d;text-decoration:none">${htmlEsc(stripHtml(a.content)).slice(0, 95)}</a></td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${htmlEsc(a.area)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${htmlEsc(a.completedBy)}</td></tr>`).join('') || '<tr><td colspan="4" style="padding:8px;color:#64748b;font-size:12px">No AI completions in last 7 days yet.</td></tr>';

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f7fafc;font-family:arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc"><tr><td align="center">
<table width="800" cellpadding="0" cellspacing="0" style="max-width:800px;background:#fff;border-radius:8px;margin:24px 0;overflow:hidden">

<tr><td style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:#fff;padding:28px 32px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Launch PMO - Daily Update</div>
<h1 style="margin:6px 0 8px;font-size:24px;font-weight:800;color:white">AI Systems Architect Accelerator &mdash; ${today}</h1>
<div style="font-size:13px;color:#e2e8f0;line-height:1.6">${state.daysToLaunch} days to launch &middot; ${state.overall}% overall ready &middot; ${state.totalAi} AI-doable &middot; ${state.totalHuman} human-needed &middot; ${state.totalOverdue} overdue &middot; ${nurturePosted.length} nurture posts today</div>
</td></tr>

<tr><td style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali - big picture</div>
<div style="font-size:14px;margin-top:6px;line-height:1.55">${aiSummary.exec_summary || '(empty project)'}</div>
${aiSummary.critical_path ? `<div style="font-size:13px;margin-top:8px;color:#fde68a"><strong>Critical path this week:</strong> ${aiSummary.critical_path}</div>` : ''}
</td></tr>

<tr><td style="padding:24px 32px 0">

${nextBanner}

<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px"><tr>
<td style="text-align:center;padding:14px;background:#fef3c7;border-radius:8px;width:23%"><div style="font-size:26px;font-weight:800;color:#78350f">${state.totalHuman}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#78350f;font-weight:700">Human-needed</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:14px;background:#dbeafe;border-radius:8px;width:23%"><div style="font-size:26px;font-weight:800;color:#1e3a8a">${state.totalAi}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#1e3a8a;font-weight:700">AI-doable</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:14px;background:#fee2e2;border-radius:8px;width:23%"><div style="font-size:26px;font-weight:800;color:#7f1d1d">${state.totalOverdue}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#7f1d1d;font-weight:700">Overdue</div></td>
<td style="width:1%"></td>
<td style="text-align:center;padding:14px;background:#fee2e2;border-radius:8px;width:23%"><div style="font-size:26px;font-weight:800;color:#7f1d1d">${blockedHumanTasks.length}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#7f1d1d;font-weight:700">Blocked</div></td>
</tr></table>

<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Feasibility by area (lowest first)</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-bottom:24px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">AREA</th><th align="center" style="padding:10px 12px;font-size:10px;letter-spacing:1px">SCORE</th><th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">WORK vs TIME</th><th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">TIER MIX</th><th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">REASON</th></tr></thead>
<tbody>${feasibilityRows}</tbody></table>

<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Next human step blocking each area</h2>
${perAreaNextHumanRows ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-bottom:24px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">AREA</th><th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">DUE</th><th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">NEXT HUMAN STEP</th><th align="left" style="padding:10px 12px;font-size:10px;letter-spacing:1px">OWNER</th></tr></thead>
<tbody>${perAreaNextHumanRows}</tbody></table>` : '<div style="background:#dcfce7;padding:14px 18px;border-radius:6px;color:#14532d;font-weight:600;margin-bottom:24px">All areas are unblocked on the human side. CB executes next.</div>'}

<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">Areas in detail</h2>
${areaCards}

${awaitingRows ? `<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">AI drafts awaiting human review (${awaitingReview.length})</h2>
<p style="font-size:12px;color:#475569;margin:0 0 8px">CB has produced first-pass deliverables on these. The human owner needs to review + refine + mark complete. They are EXCLUDED from "next AI step" picks because CB doesn't re-execute them.</p>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-bottom:24px">
<thead><tr style="background:#1e40af;color:white"><th align="left" style="padding:8px 10px;font-size:10px">TASK</th><th align="left" style="padding:8px 10px;font-size:10px">AREA</th><th align="left" style="padding:8px 10px;font-size:10px">DUE</th><th align="left" style="padding:8px 10px;font-size:10px">REVIEWER</th></tr></thead>
<tbody>${awaitingRows}</tbody></table>` : ''}

<h2 style="color:#1a365d;font-size:17px;margin:0 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">AI work CB has drafted (last 12)</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-bottom:14px">
<thead><tr style="background:#1e3a8a;color:white"><th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">WHEN</th><th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">TASK</th><th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">AREA</th><th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">BRIEFS USED</th><th align="right" style="padding:8px 10px;font-size:10px;letter-spacing:1px">CHARS</th></tr></thead>
<tbody>${aiDraftedRows}</tbody></table>

<h2 style="color:#1a365d;font-size:17px;margin:18px 0 12px;border-bottom:2px solid #1a365d;padding-bottom:6px">AI tasks marked complete (last 7 days)</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-bottom:24px">
<thead><tr style="background:#14532d;color:white"><th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">WHEN</th><th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">TASK</th><th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">AREA</th><th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">BY</th></tr></thead>
<tbody>${aiCompletedRows}</tbody></table>

${blockedHumanTasks.length ? `<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:24px 0 10px">Blocked tasks (excluded from queue above)</h2>
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Due</th><th align="left">Task</th><th align="left">Owner</th><th align="left">Blocked on</th></tr>
${blockedHumanTasks.slice(0, 10).map((b) => `<tr><td>${b.due_on}</td><td>${stripEmDashes(stripHtml(b.content)).slice(0, 80)}</td><td>${(b.assignees || []).join(', ') || 'unassigned'}</td><td>${b.blocker?.reason || ''}</td></tr>`).join('')}
</table>
<p style="font-size:11px;color:#64748b">These tasks were filtered out of the queues above. They surface again as soon as their upstream completes.</p>` : ''}

${nurturePosted.length ? `<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:24px 0 10px">Nurture posts fired today (${nurturePosted.length})</h2>
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Level</th><th align="left">Task</th><th align="left">Owner</th></tr>
${nurturePosted.slice(0, 8).map((n) => `<tr><td>${n.level}</td><td>${stripEmDashes(stripHtml(n.taskName)).slice(0, 90)}</td><td>${n.owner}</td></tr>`).join('')}
</table>` : ''}

<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:24px 0 10px">Escalations</h2>
<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Class</th><th align="left">Late</th><th align="left">Area</th><th align="left">Task</th><th align="left">Owner</th></tr>
${escRows}
</table>

${aiSummary.risks?.length ? `<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:24px 0 10px">Risks</h2><ul style="font-size:13px;margin:0 0 0 18px;padding:0">${aiSummary.risks.map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}

<p style="font-size:11px;color:#94a3b8;margin-top:28px">Generated by CB System Launch PMO heartbeat (Mon-Fri 8am CDT). Project: <a href="https://3.basecamp.com/3945211/projects/${LAUNCH.projectId}" style="color:#2b6cb0">project ${LAUNCH.projectId}</a>. Briefs: <a href="${(/*VAULT*/'')}https://app.basecamp.com/3945211/buckets/${LAUNCH.projectId}/vaults/9946496186" style="color:#2b6cb0">Launch Briefs vault folder</a>. Tag <code>@CB System</code> to ask CB for a PDF / Excel / image artifact or to queue a follow-up.</p>

</td></tr></table></td></tr></table></body></html>`;

  const text = stripEmDashes(`Launch PMO Update ${state.today} - ${state.daysToLaunch} days to launch.

Overall readiness: ${state.overall}% | Open tasks: ${state.areas.reduce((s, a) => s + a.openCount, 0)} | Escalations: ${escalations.length}

${aiSummary.exec_summary || '(no summary)'}

Critical path: ${aiSummary.critical_path || '(none)'}

Next human actions:
${humanQueue.slice(0, 6).map((h) => `  - [${h.due_on}] ${h.area}: ${stripHtml(h.content).slice(0, 80)}`).join('\n') || '  (empty)'}

Escalations:
${escalations.slice(0, 5).map((e) => `  - [${e.classification}] ${e.area}: ${stripHtml(e.content).slice(0, 80)} (${e.days_overdue}d overdue)`).join('\n') || '  (none)'}

Project: https://3.basecamp.com/3945211/projects/${LAUNCH.projectId}

--
CB System
Launch PMO for AI Systems Architect Accelerator`);

  const htmlClean = normalizeAliName(html);
  const textClean = normalizeAliName(text);
  validateBeforeSend(htmlClean, textClean);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"CB System" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'],
    subject: `[Launch PMO] ${state.today} - ${state.overall}% ready, ${state.daysToLaunch}d to launch`,
    text: textClean,
    html: htmlClean,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  return { messageId: r.messageId };
}

// ---------------------------------------------------------------------------
// MB post (HUMAN ACTION QUEUE)
// ---------------------------------------------------------------------------
async function postHumanActionQueue(state, humanQueue, escalations, nurturePosted = [], blockedHumanTasks = [], blockerMap, aiLog) {
  const today = state.today;
  const aliTasks = humanQueue.filter((h) => (h.assignees || []).some((a) => /Ali Muwwakkil/i.test(a)));
  const nextForAli = aliTasks[0] || humanQueue[0] || null;

  const perAreaNextHumanRows = state.areas.map((a) => {
    const nextH = a.openTodos.find((t) => (t.tier === 'HUMAN' || t.tier === 'EITHER') && !blockerMap.get(t.id)?.blocked);
    if (!nextH) return null;
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a365d;font-size:12px">${htmlEsc(a.listName)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${duePill(nextH.due_on, today)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${nextH.url}" style="color:#1a365d;text-decoration:none;font-weight:600">${htmlEsc(stripEmDashes(stripHtml(nextH.content))).slice(0, 100)}</a></td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${htmlEsc((nextH.assignees || []).join(', ').replace(/Ali Muwwakkil/g, 'Ali') || 'unassigned')}</td></tr>`;
  }).filter(Boolean).join('');

  const feasibilityRows = [...state.areas]
    .sort((a, b) => (a.feasibility.score - b.feasibility.score))
    .map((a) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a365d;font-size:12px">${htmlEsc(a.listName)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">${scoreBadge(a.feasibility)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">H ${a.humanCount} / AI ${a.aiCount}${a.eitherCount ? ` / E ${a.eitherCount}` : ''} - ${htmlEsc(a.feasibility.reason)}</td></tr>`).join('');

  const aiCompletedRows = (aiLog?.recentCompleted || []).slice(0, 8).map((a) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${(a.completed_at || '').slice(0, 16).replace('T', ' ')}</td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px"><a href="${a.url}" style="color:#1a365d">${htmlEsc(stripHtml(a.content)).slice(0, 90)}</a></td>
<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">${htmlEsc(a.area)}</td></tr>`).join('');

  const escRows = escalations.slice(0, 5).map((e) =>
    `<li><strong>${e.classification}</strong> (${e.days_overdue}d): ${e.area} - ${stripEmDashes(stripHtml(e.content)).slice(0, 110)}</li>`
  ).join('');

  const banner = nextForAli
    ? `<div style="background:#1c1917;color:white;padding:14px 18px;margin:0 0 16px;border-left:4px solid #fbbf24">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">YOUR TURN ALI - next decision</div>
<a href="${nextForAli.url}" style="display:block;color:white;text-decoration:none;font-weight:700;margin-top:4px">${stripEmDashes(stripHtml(nextForAli.content))}</a>
<div style="margin-top:4px;font-size:12px;color:#cbd5e0">${nextForAli.area} &middot; due ${nextForAli.due_on}</div>
</div>`
    : '<div style="background:#dcfce7;padding:14px 18px;border-radius:6px;color:#14532d;font-weight:600">You are clear. No human action queued for Ali right now.</div>';

  const content = `<div>
<h3>Launch Readiness Dashboard - ${today}</h3>
<p><strong>${state.daysToLaunch} days to launch</strong> &middot; ${state.overall}% overall &middot; ${state.totalHuman} human-needed &middot; ${state.totalAi} AI-doable &middot; ${state.totalOverdue} overdue &middot; ${nurturePosted.length} nurture posts today</p>
${banner}
<h4>Next human step blocking each area</h4>
${perAreaNextHumanRows ? `<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse;border:1px solid #e2e8f0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:8px 10px;font-size:10px;letter-spacing:1px">AREA</th><th align="left" style="padding:8px 10px;font-size:10px">DUE</th><th align="left" style="padding:8px 10px;font-size:10px">NEXT HUMAN STEP</th><th align="left" style="padding:8px 10px;font-size:10px">OWNER</th></tr>
${perAreaNextHumanRows}
</table>` : '<div>All areas unblocked on the human side. CB executes next.</div>'}

<h4>Feasibility per area (lowest first)</h4>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse;border:1px solid #e2e8f0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:8px 10px;font-size:10px">AREA</th><th align="center" style="padding:8px 10px;font-size:10px">SCORE</th><th align="left" style="padding:8px 10px;font-size:10px">REASON</th></tr>
${feasibilityRows}
</table>

${aiCompletedRows ? `<h4>AI tasks marked complete (last 7 days)</h4>
<table cellpadding="0" cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse;border:1px solid #e2e8f0">
<tr style="background:#14532d;color:white"><th align="left" style="padding:8px 10px;font-size:10px">WHEN</th><th align="left" style="padding:8px 10px;font-size:10px">TASK</th><th align="left" style="padding:8px 10px;font-size:10px">AREA</th></tr>
${aiCompletedRows}
</table>` : ''}

${escRows ? `<h4>Escalations</h4><ul>${escRows}</ul>` : ''}
${blockedHumanTasks.length ? `<h4>Blocked tasks (waiting on upstream)</h4>
<table cellpadding="6" cellspacing="0" style="width:100%;font-size:11px;border-collapse:collapse;border:1px solid #e2e8f0">
<tr style="background:#1a365d;color:white"><th align="left">Task</th><th align="left">Owner</th><th align="left">Blocked on</th></tr>
${blockedHumanTasks.slice(0, 6).map((b) => `<tr><td>${stripEmDashes(stripHtml(b.content)).slice(0, 80)}</td><td>${(b.assignees || []).join(', ') || 'unassigned'}</td><td>${b.blocker?.reason || ''}</td></tr>`).join('')}
</table>` : ''}

<p style="font-size:11px;color:#64748b">Auto-posted daily Mon-Fri 8am CST by CB System Launch PMO. Each task links to its Basecamp todo. Tag <code>@CB System</code> for help (artifacts, follow-ups, AI execution). Blocked tasks excluded.</p>
</div>`;

  return ops.postMessage({
    subject: `Launch Readiness Dashboard - ${today}`,
    content,
  });
}

// ---------------------------------------------------------------------------
// Blocker detection.
// Heuristic: any task starting with Review/Approve/Finalize/Sign-off depends
// on a matching upstream Draft/Create/Design/Build/Develop/Implement task
// with overlapping subject. If the upstream is incomplete OR missing, the
// task is BLOCKED.
// ---------------------------------------------------------------------------
const APPROVE_VERBS_RE = /^(review and approve|review|approve|finalize|sign[- ]?off|conduct (final )?review)\s+/i;
const CREATE_VERBS_RE = /^(draft|create|design|build|develop|implement|produce|deploy|set up|setup|generate|integrate|launch|prepare|complete|update|migrate|finalize)\s+/i;

function normalizeSubject(s) {
  return (s || '')
    .replace(APPROVE_VERBS_RE, '')
    .replace(CREATE_VERBS_RE, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function subjectsOverlap(a, b) {
  const sa = new Set(a.split(' ').filter((w) => w.length > 3));
  const sb = new Set(b.split(' ').filter((w) => w.length > 3));
  if (sa.size === 0 || sb.size === 0) return false;
  let hits = 0;
  for (const w of sa) if (sb.has(w)) hits++;
  const minSize = Math.min(sa.size, sb.size);
  return hits / minSize >= 0.6;
}

// Returns Map<taskId, {blocked, reason, upstreamId?}>
function detectBlockedTasks(state) {
  // Flatten all tasks (open + done) across areas for lookup
  const allTasks = [];
  for (const a of state.areas) {
    for (const t of (a.overdue || [])) allTasks.push({ ...t, area: a.listName, completed: false });
    for (const t of (a.upcoming || [])) allTasks.push({ ...t, area: a.listName, completed: false });
  }
  // We also need completed tasks - they were counted in state.areas.done but not enumerated.
  // For the heuristic we treat absent-from-current-open as "completed or missing".
  // The "completed" map is what really matters: if an upstream task exists AND is open, the dependent is blocked.
  // Build content map of currently OPEN tasks (anything not in this map is either completed or doesn't exist).
  const openByContent = new Map();
  for (const t of allTasks) openByContent.set(normalizeSubject(t.content || ''), { id: t.id, content: t.content, area: t.area, due_on: t.due_on });

  const result = new Map();
  for (const t of allTasks) {
    if (!APPROVE_VERBS_RE.test(t.content || '')) {
      result.set(t.id, { blocked: false });
      continue;
    }
    const subject = normalizeSubject(t.content || '');
    if (!subject) { result.set(t.id, { blocked: false }); continue; }
    // Search for an open task with overlapping subject (that is NOT itself this same task)
    let upstream = null;
    for (const [otherSubject, other] of openByContent) {
      if (other.id === t.id) continue;
      // The other task should not be another approval
      if (APPROVE_VERBS_RE.test(other.content || '')) continue;
      if (subjectsOverlap(subject, otherSubject)) {
        upstream = other;
        break;
      }
    }
    if (upstream) {
      result.set(t.id, { blocked: true, reason: `upstream open: "${upstream.content}" (id ${upstream.id})`, upstreamId: upstream.id });
      continue;
    }
    // No matching open task. Could mean upstream is completed OR upstream doesn't exist.
    // We can't distinguish without checking completed tasks per area; for now assume completed/doesn't matter.
    // Conservative: if the approval task's due_on is within the next 3 days AND no upstream open task exists,
    // assume the upstream MIGHT not exist (warn).
    result.set(t.id, { blocked: false, hint: 'no matching upstream open task; either completed or missing' });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Nurture cycle: post per-task nudge comments on overdue tasks
// ---------------------------------------------------------------------------
// Levels:
//   1d -> friendly reminder
//   3d -> escalation (also tag area lead if known)
//   5d -> Ali notification + tag Ali on the task
//   7d -> CRITICAL_RISK flag (only posted once per task)
//
// State file tracks which level has been posted per task so we never spam.
function loadNurtureState() {
  try { return JSON.parse(fs.readFileSync(NURTURE_STATE_PATH, 'utf8')); }
  catch { return { tasks: {} }; }
}
function saveNurtureState(s) {
  fs.mkdirSync(path.dirname(NURTURE_STATE_PATH), { recursive: true });
  fs.writeFileSync(NURTURE_STATE_PATH, JSON.stringify(s, null, 2));
}

const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
function mention(sgid) { return `<bc-attachment sgid="${sgid}" content-type="application/vnd.basecamp.mention"></bc-attachment>`; }

const TEAM_SGID = {
  ali: ALI_SGID,
};

async function postNurtureComment({ projectId, taskId, body }) {
  return ops.bcPost(`/buckets/${projectId}/recordings/${taskId}/comments.json`, { content: body });
}

async function runNurtureCycle(state, projectId) {
  const nState = loadNurtureState();
  const posted = [];
  for (const area of state.areas) {
    for (const t of area.overdue) {
      const tid = String(t.id);
      nState.tasks[tid] = nState.tasks[tid] || { level: 0, lastPostedAt: null };
      const current = nState.tasks[tid];
      const want = t.days_overdue >= 7 ? 7
        : t.days_overdue >= 5 ? 5
        : t.days_overdue >= 3 ? 3
        : t.days_overdue >= 1 ? 1
        : 0;
      if (want === 0) continue;
      if (current.level >= want) continue; // already nurtured at this level or higher

      const owner = (t.assignees || [])[0] || 'unassigned';
      let label, body;
      if (want === 7) {
        label = 'CRITICAL_RISK';
        body = `<div><strong style="color:#dc2626">CRITICAL RISK</strong> - this task is ${t.days_overdue} days overdue (due ${t.due_on}). Owner: ${owner}. Marking on Launch Readiness Dashboard.</div>
<div>${mention(ALI_SGID)} please redirect or unblock immediately.</div>`;
      } else if (want === 5) {
        label = 'NOTIFY_ALI';
        body = `<div><strong style="color:#d97706">Escalation (5 days overdue)</strong> - due ${t.due_on}. Owner: ${owner}.</div>
<div>${mention(ALI_SGID)} please review. This task is now in Ali's daily executive email until resolved.</div>`;
      } else if (want === 3) {
        label = 'ESCALATE_LEAD';
        body = `<div><strong style="color:#b45309">3 days overdue</strong> - due ${t.due_on}. Owner: ${owner}.</div>
<div>Please post a status update here or reassign. CB will escalate to Ali at 5 days if no movement.</div>`;
      } else { // 1
        label = 'REMINDER';
        body = `<div><strong style="color:#0284c7">Reminder</strong> - this was due ${t.due_on} (1 day overdue). Owner: ${owner}.</div>
<div>Quick status check: where are we on this?</div>`;
      }
      try {
        const r = await postNurtureComment({ projectId, taskId: t.id, body });
        nState.tasks[tid] = { level: want, lastPostedAt: new Date().toISOString(), lastCommentId: r.id };
        posted.push({ taskId: t.id, taskName: t.content, level: label, owner });
        await new Promise((res) => setTimeout(res, 200));
      } catch (e) {
        console.error(`nurture fail task ${t.id}: ${e.message}`);
      }
    }
  }
  // Cleanup: tasks no longer in overdue list and not modified in 30 days drop out
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  for (const tid of Object.keys(nState.tasks)) {
    if (nState.tasks[tid].lastPostedAt && nState.tasks[tid].lastPostedAt < cutoff) {
      delete nState.tasks[tid];
    }
  }
  saveNurtureState(nState);
  return posted;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
async function runDailyUpdate({ force = false } = {}) {
  if (!force && !isWeekday()) {
    return { skipped: 'weekend - daily PMO heartbeat is Mon-Fri only' };
  }
  const state = await pullProjectState();
  const escalations = buildEscalationList(state);
  const blockerMap = detectBlockedTasks(state);
  // Partition human queue into unblocked + blocked
  const humanQueueAll = buildHumanActionQueue(state);
  const humanQueue = humanQueueAll.filter((h) => !blockerMap.get(h.id)?.blocked);
  const blockedHumanTasks = humanQueueAll
    .filter((h) => blockerMap.get(h.id)?.blocked)
    .map((h) => ({ ...h, blocker: blockerMap.get(h.id) }));
  // AI queue is filtered too (CB shouldn't pick blocked tasks)
  const aiQueueAll = buildAiQueue(state);
  const aiQueue = aiQueueAll.filter((a) => !blockerMap.get(a.id)?.blocked);
  const aiSummary = await generateExecSummary(state, escalations, humanQueue, aiQueue);
  const aiLog = await buildAiCompletionLog(state);
  const nurturePosted = await runNurtureCycle(state, LAUNCH.projectId);
  const emailResult = await emailAli({ state, aiSummary, humanQueue, escalations, nurturePosted, blockedHumanTasks, blockerMap, aiLog });
  const mbResult = await postHumanActionQueue(state, humanQueue, escalations, nurturePosted, blockedHumanTasks, blockerMap, aiLog);
  return {
    today: state.today,
    overall: state.overall,
    days_to_launch: state.daysToLaunch,
    open_count: state.areas.reduce((s, a) => s + a.openCount, 0),
    escalations_count: escalations.length,
    nurture_posted: nurturePosted.length,
    blocked_count: blockedHumanTasks.length,
    email_message_id: emailResult.messageId,
    mb_message_id: mbResult.id,
  };
}

module.exports = { runDailyUpdate, pullProjectState, buildEscalationList, buildHumanActionQueue, buildAiQueue, generateExecSummary };
