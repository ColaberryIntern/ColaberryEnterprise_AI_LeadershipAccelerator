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
const ops = require('./launchPmoOps');
const { TEAM, LAUNCH, provisioned, missing, getByPersonId } = require('./launchPmoTeam');

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
async function emailAli({ state, aiSummary, humanQueue, escalations }) {
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

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:760px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:24px 32px">
<div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Launch PMO - Executive Update</div>
<div style="font-size:22px;font-weight:800;margin-top:6px">${state.today} - ${state.daysToLaunch} days to launch</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:6px">Overall readiness: <strong>${state.overall}%</strong> | Open tasks: <strong>${state.areas.reduce((s, a) => s + a.openCount, 0)}</strong> | Escalations: <strong>${escalations.length}</strong></div>
</div>

<div style="padding:22px 32px">

<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:0 0 10px">Executive summary</h2>
<p style="font-size:14px;color:#1f2937;margin:0 0 10px">${aiSummary.exec_summary || '(no summary yet - empty project)'}</p>
${aiSummary.critical_path ? `<p style="font-size:14px;color:#1f2937;margin:0"><strong>Critical path this week:</strong> ${aiSummary.critical_path}</p>` : ''}

<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:24px 0 10px">Readiness by area</h2>
<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Area</th><th align="right">Done %</th><th align="right">Open</th><th align="right">Overdue</th></tr>
${areaRows}
</table>

<h2 style="font-size:17px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:6px;margin:24px 0 10px">NEXT HUMAN ACTIONS (sorted by urgency)</h2>
<table cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Due</th><th align="left">Area</th><th align="left">Task</th><th align="left">Owner</th></tr>
${humanRows}
</table>

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

  validateBeforeSend(html, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"CB System" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: 'alimuwwakkil@gmail.com',
    subject: `[Launch PMO] ${state.today} - ${state.overall}% ready, ${state.daysToLaunch}d to launch`,
    text,
    html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  return { messageId: r.messageId };
}

// ---------------------------------------------------------------------------
// MB post (HUMAN ACTION QUEUE)
// ---------------------------------------------------------------------------
async function postHumanActionQueue(state, humanQueue, escalations) {
  const today = state.today;
  const rows = humanQueue.slice(0, 12).map((h) =>
    `<tr><td>${h.due_on}</td><td>${h.area}</td><td>${stripEmDashes(stripHtml(h.content)).slice(0, 90)}</td><td>${(h.assignees || []).join(', ') || 'unassigned'}</td></tr>`
  ).join('') || '<tr><td colspan="4">Empty queue.</td></tr>';

  const escRows = escalations.slice(0, 5).map((e) =>
    `<li><strong>${e.classification}</strong> (${e.days_overdue}d): ${e.area} - ${stripEmDashes(stripHtml(e.content)).slice(0, 110)}</li>`
  ).join('');

  const content = `<div>
<h3>HUMAN ACTION QUEUE - ${today}</h3>
<p><strong>${state.daysToLaunch} days to launch</strong> | Overall readiness: ${state.overall}%</p>
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left">Due</th><th align="left">Area</th><th align="left">Task</th><th align="left">Owner</th></tr>
${rows}
</table>
${escRows ? `<h4>Escalations</h4><ul>${escRows}</ul>` : ''}
<p style="font-size:11px;color:#64748b">Auto-posted daily Mon-Fri 8am CST by CB System Launch PMO. Each task above links to its Basecamp todo.</p>
</div>`;

  return ops.postMessage({
    subject: `Human Action Queue - ${today}`,
    content,
  });
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
  const emailResult = await emailAli({ state, aiSummary, humanQueue, escalations });
  const mbResult = await postHumanActionQueue(state, humanQueue, escalations);
  return {
    today: state.today,
    overall: state.overall,
    days_to_launch: state.daysToLaunch,
    open_count: state.areas.reduce((s, a) => s + a.openCount, 0),
    escalations_count: escalations.length,
    email_message_id: emailResult.messageId,
    mb_message_id: mbResult.id,
  };
}

module.exports = { runDailyUpdate, pullProjectState, buildEscalationList, buildHumanActionQueue, buildAiQueue, generateExecSummary };
