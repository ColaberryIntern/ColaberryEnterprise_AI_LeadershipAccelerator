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

// ---------------------------------------------------------------------------
// State pull
// ---------------------------------------------------------------------------
async function pullProjectState() {
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);
  const today = dateYMD();
  const areas = [];
  for (const list of lists) {
    const todos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json`);
    const completedTodos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json?completed=true`);
    const all = [...todos, ...completedTodos];
    const open = todos.filter((t) => !t.completed);
    const overdue = open
      .filter((t) => t.due_on && t.due_on < today)
      .map((t) => ({
        id: t.id,
        content: t.content,
        due_on: t.due_on,
        days_overdue: daysBetween(today, t.due_on),
        assignees: (t.assignees || []).map((a) => a.name),
        url: t.app_url,
      }));
    const upcoming = open
      .filter((t) => t.due_on && t.due_on >= today)
      .sort((a, b) => a.due_on.localeCompare(b.due_on))
      .slice(0, 5)
      .map((t) => ({ id: t.id, content: t.content, due_on: t.due_on, assignees: (t.assignees || []).map((a) => a.name), url: t.app_url }));
    const total = all.length;
    const done = completedTodos.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    areas.push({
      listId: list.id, listName: list.name, listUrl: list.app_url,
      total, done, pct, openCount: open.length,
      overdue, upcoming,
    });
  }
  // Compute readiness
  const totalAll = areas.reduce((s, a) => s + a.total, 0);
  const doneAll = areas.reduce((s, a) => s + a.done, 0);
  const overall = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;
  const daysToLaunch = daysBetween(LAUNCH.targetLaunchDate, today);
  return { areas, totalAll, doneAll, overall, daysToLaunch, today };
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
// HUMAN ACTION QUEUE (next human tasks sorted by urgency)
// ---------------------------------------------------------------------------
function buildHumanActionQueue(state) {
  const queue = [];
  for (const a of state.areas) {
    for (const t of a.upcoming) {
      // Heuristic: task assigned to a non-CB person, or unassigned (which means
      // it falls to lead by area), is human work. CB User tasks excluded.
      const assignees = t.assignees || [];
      const cbOnly = assignees.length === 1 && /CB System/i.test(assignees[0]);
      if (cbOnly) continue;
      queue.push({ area: a.listName, ...t });
    }
  }
  queue.sort((a, b) => a.due_on.localeCompare(b.due_on));
  return queue.slice(0, 12);
}

// ---------------------------------------------------------------------------
// AI execution queue (CB User's plate)
// ---------------------------------------------------------------------------
function buildAiQueue(state) {
  const ai = [];
  for (const a of state.areas) {
    for (const t of a.upcoming) {
      const assignees = t.assignees || [];
      const cbOnly = assignees.length === 1 && /CB System/i.test(assignees[0]);
      if (cbOnly) ai.push({ area: a.listName, ...t });
    }
  }
  ai.sort((a, b) => a.due_on.localeCompare(b.due_on));
  return ai.slice(0, 10);
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
// Email to Ali (Mandrill)
// ---------------------------------------------------------------------------
async function emailAli({ state, aiSummary, humanQueue, escalations, nurturePosted = [] }) {
  if (!process.env.MANDRILL_API_KEY) return { skipped: 'no MANDRILL_API_KEY' };
  const nodemailer = require(path.resolve(__dirname, '../../../../node_modules/nodemailer'));
  const { validateBeforeSend } = require(path.resolve(__dirname, './mandrillPreflight'));

  const escRows = escalations.slice(0, 8).map((e) =>
    `<tr><td>${e.classification}</td><td>${e.days_overdue}d</td><td>${e.area}</td><td>${stripEmDashes(stripHtml(e.content)).slice(0, 80)}</td><td>${(e.assignees || []).join(', ') || 'unassigned'}</td></tr>`
  ).join('') || '<tr><td colspan="5">No escalations today.</td></tr>';

  const humanRows = humanQueue.slice(0, 10).map((h) =>
    `<tr><td>${h.due_on}</td><td>${h.area}</td><td>${stripEmDashes(stripHtml(h.content)).slice(0, 90)}</td><td>${(h.assignees || []).join(', ') || 'unassigned'}</td></tr>`
  ).join('') || '<tr><td colspan="4">Empty queue.</td></tr>';

  const areaRows = state.areas.map((a) =>
    `<tr><td>${a.listName}</td><td style="text-align:right">${a.pct}%</td><td style="text-align:right">${a.openCount}</td><td style="text-align:right">${a.overdue.length}</td></tr>`
  ).join('');

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

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:760px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:24px 32px">
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Launch PMO - Executive Update</div>
<div style="font-size:22px;font-weight:800;margin-top:6px">${state.today} - ${state.daysToLaunch} days to launch</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">Overall readiness: <strong>${state.overall}%</strong> | Open tasks: <strong>${state.areas.reduce((s, a) => s + a.openCount, 0)}</strong> | Escalations: <strong>${escalations.length}</strong> | Nurture posts today: <strong>${nurturePosted.length}</strong></div>
</div>

<div style="padding:22px 32px">

${nextBanner}

<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:0 0 10px">Executive summary</h2>
<p style="font-size:14px;color:#1f2937;margin:0 0 10px">${aiSummary.exec_summary || '(no summary yet - empty project)'}</p>
${aiSummary.critical_path ? `<p style="font-size:14px;color:#1f2937;margin:0"><strong>Critical path this week:</strong> ${aiSummary.critical_path}</p>` : ''}

<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:24px 0 10px">Readiness by area</h2>
<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Area</th><th align="right">Done %</th><th align="right">Open</th><th align="right">Overdue</th></tr>
${areaRows}
</table>

<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:24px 0 10px">Next action per teammate</h2>
<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Who</th><th align="left">Due</th><th align="left">Task</th><th align="left">Area</th></tr>
${perPersonRows || '<tr><td colspan="4">No queued tasks per teammate.</td></tr>'}
</table>

<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:24px 0 10px">FULL HUMAN ACTION QUEUE (sorted by urgency)</h2>
<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Due</th><th align="left">Area</th><th align="left">Task</th><th align="left">Owner</th></tr>
${humanRows}
</table>

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

<p style="font-size:11px;color:#94a3b8;margin-top:28px">Generated by CB System Launch PMO heartbeat. Source: <a href="https://3.basecamp.com/3945211/projects/${LAUNCH.projectId}" style="color:#2b6cb0">project ${LAUNCH.projectId}</a>. Replies welcome - I read your responses via the inbound dispatcher.</p>

</div></div></body></html>`;

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
    cc: 'alimuwwakkil@gmail.com',
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
async function postHumanActionQueue(state, humanQueue, escalations, nurturePosted = []) {
  const today = state.today;
  const aliTasks = humanQueue.filter((h) => (h.assignees || []).some((a) => /Ali Muwwakkil/i.test(a)));
  const nextForAli = aliTasks[0] || humanQueue[0] || null;
  const perPerson = {};
  for (const h of humanQueue) {
    for (const a of (h.assignees || [])) {
      const name = (a || '').trim();
      if (!name) continue;
      if (!perPerson[name]) perPerson[name] = h;
    }
  }
  const perPersonRows = Object.entries(perPerson).slice(0, 12)
    .map(([name, t]) => `<tr><td>${name}</td><td>${t.due_on}</td><td>${stripEmDashes(stripHtml(t.content)).slice(0, 90)}</td><td>${t.area}</td></tr>`).join('');

  const rows = humanQueue.slice(0, 12).map((h) =>
    `<tr><td>${h.due_on}</td><td>${h.area}</td><td>${stripEmDashes(stripHtml(h.content)).slice(0, 90)}</td><td>${(h.assignees || []).join(', ') || 'unassigned'}</td></tr>`
  ).join('') || '<tr><td colspan="4">Empty queue.</td></tr>';

  const escRows = escalations.slice(0, 5).map((e) =>
    `<li><strong>${e.classification}</strong> (${e.days_overdue}d): ${e.area} - ${stripEmDashes(stripHtml(e.content)).slice(0, 110)}</li>`
  ).join('');

  const banner = nextForAli
    ? `<div style="background:#fef3c7;border-left:6px solid #d97706;padding:14px 18px;margin:0 0 16px">
<strong style="color:#78350f;letter-spacing:1px">YOUR TURN ALI: </strong>
<strong>${stripEmDashes(stripHtml(nextForAli.content))}</strong>
(${nextForAli.area}, due ${nextForAli.due_on})
</div>`
    : '<div><strong>You are clear.</strong> No human action queued for Ali right now.</div>';

  const content = `<div>
<h3>HUMAN ACTION QUEUE - ${today}</h3>
<p><strong>${state.daysToLaunch} days to launch</strong> | Overall readiness: ${state.overall}% | Nurture posts today: ${nurturePosted.length}</p>
${banner}
<h4>Next action per teammate</h4>
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Who</th><th align="left">Due</th><th align="left">Task</th><th align="left">Area</th></tr>
${perPersonRows || '<tr><td colspan="4">No queued tasks per teammate.</td></tr>'}
</table>
<h4>Full queue (top 12 by urgency)</h4>
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Due</th><th align="left">Area</th><th align="left">Task</th><th align="left">Owner</th></tr>
${rows}
</table>
${escRows ? `<h4>Escalations</h4><ul>${escRows}</ul>` : ''}
<p style="font-size:11px;color:#64748b">Auto-posted daily Mon-Fri 8am CST by CB System Launch PMO. Every task above links to its Basecamp todo. Tag <code>@CB System</code> to escalate, get AI execution, or ask for a PDF / Excel / image artifact.</p>
</div>`;

  return ops.postMessage({
    subject: `Human Action Queue - ${today}`,
    content,
  });
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
  const humanQueue = buildHumanActionQueue(state);
  const aiQueue = buildAiQueue(state);
  const aiSummary = await generateExecSummary(state, escalations, humanQueue, aiQueue);
  // Active nurture: post per-task nudge comments at 1d/3d/5d/7d overdue.
  const nurturePosted = await runNurtureCycle(state, LAUNCH.projectId);
  const emailResult = await emailAli({ state, aiSummary, humanQueue, escalations, nurturePosted });
  const mbResult = await postHumanActionQueue(state, humanQueue, escalations, nurturePosted);
  return {
    today: state.today,
    overall: state.overall,
    days_to_launch: state.daysToLaunch,
    open_count: state.areas.reduce((s, a) => s + a.openCount, 0),
    escalations_count: escalations.length,
    nurture_posted: nurturePosted.length,
    email_message_id: emailResult.messageId,
    mb_message_id: mbResult.id,
  };
}

module.exports = { runDailyUpdate, pullProjectState, buildEscalationList, buildHumanActionQueue, buildAiQueue, generateExecSummary };
