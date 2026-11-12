/**
 * renderMorningFive - the morning report: the five most pressing tasks, walked through, and the
 * prompt for the one move worth making today.
 *
 * EMAIL-SAFE BY CONSTRUCTION: inline styles, tables for layout, no script, no CSS variables, no
 * external assets. It is a few KB, so it can be emailed as the body or opened as a file, and it
 * reads the same in both. The interactive board stays the place to slice the whole backlog; this
 * is the page that says what to do about it this morning.
 *
 * Every rendered string from Basecamp is escaped: titles and descriptions are untrusted input.
 */

const { DISPOSITION_LABEL } = require('./workOrder');
const { WEIGHTS } = require('./pressingFive');
const { LIST_WEIGHTS } = require('./pressingLists');

const C = {
  cherry: '#FB2832', cherryDeep: '#C20E1E', cherryBg: '#FFF0F1', leaf: '#3f7d20',
  ink: '#1f2937', ink2: '#4b5563', ink3: '#6b7280', line: '#e5e7eb', bg: '#f8fafc', card: '#ffffff',
  monoBg: '#0f172a', monoInk: '#e2e8f0',
};
const FONT = "'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif";
const MONO = "Consolas,'SFMono-Regular',Menlo,monospace";

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const fmtDate = (d) => {
  if (!d) return 'no date';
  const x = new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(x.getTime()) ? String(d)
    : x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

function chip(text, fg, bg) {
  return `<span style="display:inline-block;font:600 11px/1.6 ${FONT};color:${fg};background:${bg};border-radius:999px;padding:1px 9px;margin:0 4px 4px 0">${esc(text)}</span>`;
}

function timingChip(it) {
  if (it.late == null) return chip('no date', C.ink2, '#f1f5f9');
  if (it.late > 0) return chip(`${it.late}d overdue`, '#ffffff', it.late >= 8 ? C.cherryDeep : C.cherry);
  if (it.late === 0) return chip('due today', '#ffffff', C.cherry);
  return chip(`due in ${-it.late}d`, C.ink, '#fde68a');
}

/** One row of a two-column fact table inside a card. */
const fact = (k, v) => (v ? `<tr><td style="font:600 11px/1.5 ${FONT};color:${C.ink3};text-transform:uppercase;letter-spacing:.4px;padding:3px 10px 3px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="font:13px/1.5 ${FONT};color:${C.ink};padding:3px 0">${v}</td></tr>` : '');

/**
 * What kind of move this is, from the same rule the prompt uses (pressingFive.isDecision), not the
 * work order's disposition: that folds human_required into "ask", which mislabelled build tasks
 * as decisions in the first preview.
 */
function stepOf(it) {
  if (it.isDecision) return { label: 'Your decision', next: 'Decide it. A session can prepare a one-page decision memo first.' };
  if (it.humanOnly || it.category === 'human_required') {
    return { label: 'Needs you', next: 'A session can prepare everything up to the step only you can take.' };
  }
  return { label: DISPOSITION_LABEL[it.disposition] || it.disposition, next: it.dispositionReason };
}

function itemCard(it, i) {
  const step = stepOf(it);
  const reasons = it.reasons.filter((r) => r.pts).map((r) =>
    `<tr><td style="font:700 12px/1.5 ${MONO};color:${r.pts > 0 ? C.leaf : C.cherryDeep};padding:1px 8px 1px 0;text-align:right;white-space:nowrap">${r.pts > 0 ? '+' : ''}${r.pts}</td><td style="font:13px/1.5 ${FONT};color:${C.ink2};padding:1px 0">${esc(r.why)}</td></tr>`).join('');
  const link = it.url ? `<a href="${esc(it.url)}" style="color:${C.ink};text-decoration:none">${esc(it.title)}</a>` : esc(it.title);
  return `
<tr><td style="padding:0 0 14px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-left:4px solid ${C.cherry};border-radius:10px">
<tr><td style="padding:14px 16px 12px 16px">
  <div style="font:700 11px/1.4 ${FONT};color:${C.cherry};letter-spacing:.6px;text-transform:uppercase">#${i + 1} &middot; score ${it.score}</div>
  <div style="font:700 17px/1.35 ${FONT};color:${C.ink};margin:3px 0 6px 0">${link}</div>
  <div style="font:12px/1.5 ${FONT};color:${C.ink3};margin:0 0 8px 0">${esc(it.path)}</div>
  <div>${timingChip(it)}${chip(step.label, C.ink, it.isDecision ? '#fde2e4' : '#e0e7ff')}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 2px 0">
    ${fact('Due', esc(fmtDate(it.dueOn)))}
    ${fact('Decide by', it.decideBy ? esc(it.decideBy) : '')}
    ${fact('Owner', it.owner ? esc(it.owner) : '')}
    ${fact('The ticket says', it.summary ? esc(clip(it.summary, 320)) : '<span style="color:#6b7280">no brief in the ticket</span>')}
    ${fact('Done when', it.doneWhen ? esc(clip(it.doneWhen, 220)) : '<span style="color:#6b7280">not stated in the ticket</span>')}
    ${fact('Next step', esc(step.next))}
  </table>
  <div style="font:700 11px/1.4 ${FONT};color:${C.ink3};letter-spacing:.5px;text-transform:uppercase;margin:10px 0 2px 0">Why it is here</div>
  <table role="presentation" cellpadding="0" cellspacing="0">${reasons}</table>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr>
    ${it.url ? `<td style="padding-right:8px"><a href="${esc(it.url)}" style="display:inline-block;font:600 12px/1 ${FONT};color:#ffffff;background:${C.cherry};border-radius:6px;padding:8px 12px;text-decoration:none">Open in Basecamp</a></td>` : ''}
    <td style="font:12px/1.4 ${MONO};color:${C.ink2};background:#f1f5f9;border-radius:6px;padding:7px 10px">/ata-work-task ${esc(it.id)}</td>
  </tr></table>
</td></tr></table>
</td></tr>`;
}

/** "<title> (5d overdue, score 70)", linked when the task has a URL. */
function taskLine(t) {
  const when = t.late == null ? 'no date' : t.late > 0 ? `${t.late}d overdue` : t.late === 0 ? 'due today' : `due in ${-t.late}d`;
  const name = t.url ? `<a href="${esc(t.url)}" style="color:${C.ink};text-decoration:underline">${esc(clip(t.title, 110))}</a>` : esc(clip(t.title, 110));
  return `${name} <span style="color:${C.ink3}">(${esc(when)}, score ${esc(t.score)})</span>`;
}

/**
 * One list, in the same shape as a task card: rank and score, the list, where it sits, timing,
 * the facts, why it is here, and the two ways in (Basecamp, and the /ata-list command).
 * @param {{key:string, url:?string, path:string, score:number, reasons:Array, total:number,
 *          live:number, dormant:number, oldestDue:?string, pressing:Array, proposal:?object}} l
 */
function listCard(l, i) {
  const lead = l.pressing[0] || {};
  const others = l.pressing.slice(1, 3);
  const reasons = l.reasons.filter((r) => r.pts).map((r) =>
    `<tr><td style="font:700 12px/1.5 ${MONO};color:${r.pts > 0 ? C.leaf : C.cherryDeep};padding:1px 8px 1px 0;text-align:right;white-space:nowrap">${r.pts > 0 ? '+' : ''}${r.pts}</td><td style="font:13px/1.5 ${FONT};color:${C.ink2};padding:1px 0">${esc(r.why)}</td></tr>`).join('');
  const name = l.url ? `<a href="${esc(l.url)}" style="color:${C.ink};text-decoration:none">${esc(l.key)}</a>` : esc(l.key);
  const command = `/ata-list "${l.key}"`;
  const why = l.proposal ? `${l.proposal.why.charAt(0).toUpperCase()}${l.proposal.why.slice(1)}.` : '';
  return `
<tr><td style="padding:0 0 14px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-left:4px solid ${C.ink2};border-radius:10px">
<tr><td style="padding:14px 16px 12px 16px">
  <div style="font:700 11px/1.4 ${FONT};color:${C.ink2};letter-spacing:.6px;text-transform:uppercase">List #${i + 1} &middot; score ${esc(l.score)}</div>
  <div style="font:700 17px/1.35 ${FONT};color:${C.ink};margin:3px 0 6px 0">${name}</div>
  <div style="font:12px/1.5 ${FONT};color:${C.ink3};margin:0 0 8px 0">${esc(l.path)}</div>
  <div>${timingChip(lead)}${chip(`${l.pressing.length} pressing`, C.ink, '#e0e7ff')}${l.dormant ? chip(`${l.dormant} dormant`, C.ink2, '#f1f5f9') : ''}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 2px 0">
    ${fact('Open tasks', esc(`${l.total}: ${l.live} live, ${l.dormant} dormant${l.oldestDue ? `, oldest due ${fmtDate(l.oldestDue)}` : ''}`))}
    ${fact('Most pressing', lead.title ? taskLine(lead) : '')}
    ${fact('Also pressing', others.length ? others.map(taskLine).join('<br>') : '')}
    ${fact('Proposed', l.proposal ? esc(l.proposal.label) : '')}
    ${fact('Next step', esc(why))}
  </table>
  <div style="font:700 11px/1.4 ${FONT};color:${C.ink3};letter-spacing:.5px;text-transform:uppercase;margin:10px 0 2px 0">Why it is here</div>
  <table role="presentation" cellpadding="0" cellspacing="0">${reasons}</table>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr>
    ${l.url ? `<td style="padding-right:8px"><a href="${esc(l.url)}" style="display:inline-block;font:600 12px/1 ${FONT};color:#ffffff;background:${C.ink2};border-radius:6px;padding:8px 12px;text-decoration:none">Open list in Basecamp</a></td>` : ''}
    <td style="font:12px/1.4 ${MONO};color:${C.ink2};background:#f1f5f9;border-radius:6px;padding:7px 10px">${esc(command)}</td>
  </tr></table>
</td></tr></table>
</td></tr>`;
}

/**
 * What the live Basecamp check found, said plainly. An unchecked link is admitted, not hidden.
 * @param {{deadLists:number, deadTodos:number, unchecked:number}} v
 */
function verifyLine(v) {
  const dropped = [];
  if (v.deadLists) dropped.push(`${v.deadLists} list${v.deadLists === 1 ? '' : 's'}`);
  if (v.deadTodos) dropped.push(`${v.deadTodos} to-do${v.deadTodos === 1 ? '' : 's'}`);
  const head = `Every list and to-do linked above was checked live in Basecamp as this was built${dropped.length
    ? `; ${dropped.join(' and ')} that the mirror still shows as open were trashed, archived or completed in Basecamp, and were left out` : ''}.`;
  return v.unchecked ? `${head} ${v.unchecked} could not be checked (Basecamp did not answer) and were kept.` : head;
}

function moveBlock(move, prompt) {
  if (move.kind === 'none') {
    return `<p style="font:14px/1.6 ${FONT};color:${C.ink2}">${esc(move.why)}</p>`;
  }
  const title = move.kind === 'task' ? move.item.title : `Decide the list "${move.list.key}"`;
  const others = (move.candidates || []).filter((c) => c.title !== (move.kind === 'task' ? `Work #1: ${move.item.title}` : `Decide the list "${move.list.key}"`));
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cherryBg};border:1px solid #fecdd3;border-radius:12px">
<tr><td style="padding:16px 18px">
  <div style="font:700 11px/1.4 ${FONT};color:${C.cherryDeep};letter-spacing:.6px;text-transform:uppercase">The one move today</div>
  <div style="font:700 19px/1.35 ${FONT};color:${C.ink};margin:4px 0 6px 0">${esc(title)}</div>
  <div style="font:14px/1.6 ${FONT};color:${C.ink2};margin:0 0 6px 0">${esc(move.why)}</div>
  ${others.length ? `<div style="font:12px/1.5 ${FONT};color:${C.ink3};margin:0 0 10px 0">Also considered: ${others.map((c) => `${esc(c.title)} (${esc(c.impact)})`).join('; ')}.</div>` : ''}
  <div style="font:700 11px/1.4 ${FONT};color:${C.ink3};letter-spacing:.5px;text-transform:uppercase;margin:8px 0 4px 0">Paste this into Claude Code</div>
  <pre style="margin:0;white-space:pre-wrap;word-wrap:break-word;font:12px/1.55 ${MONO};color:${C.monoInk};background:${C.monoBg};border-radius:8px;padding:12px 14px">${esc(prompt)}</pre>
</td></tr></table>`;
}

/**
 * @param {{today:Date|string, runId:string, picks:Array, move:object, movePrompt:string,
 *          counts:{tasks:number, live:number, dormant:number, qualified:number, claimed:number},
 *          boardNote?:string}} input
 */
function renderMorningFive(input) {
  const today = new Date(input.today || Date.now());
  const day = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
  const picks = input.picks || [];
  const lists = input.lists || [];
  const LW = LIST_WEIGHTS;
  const c = input.counts || {};
  const verdict = picks.length
    ? `${picks.length} pressing task${picks.length === 1 ? '' : 's'} out of ${c.qualified} that qualified. The one move: ${input.move.kind === 'task' ? input.move.item.title : input.move.kind === 'list' ? `decide "${input.move.list.key}"` : 'none today'}.`
    : 'Nothing qualified as pressing today.';
  const w = WEIGHTS;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your five, ${esc(day)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px">
<tr><td style="padding:0 0 4px 0;font:700 24px/1.3 ${FONT};color:${C.cherry}">Your five for ${esc(day)}</td></tr>
<tr><td style="padding:0 0 16px 0;font:15px/1.6 ${FONT};color:${C.ink}">${esc(verdict)}</td></tr>
<tr><td style="padding:0 0 18px 0">${moveBlock(input.move || { kind: 'none', why: '' }, input.movePrompt || '')}</td></tr>
<tr><td style="padding:4px 0 10px 0;font:700 13px/1.4 ${FONT};color:${C.ink3};letter-spacing:.6px;text-transform:uppercase">The five, most pressing first</td></tr>
${picks.map(itemCard).join('')}
${lists.length ? `<tr><td style="padding:14px 0 2px 0;font:700 13px/1.4 ${FONT};color:${C.ink3};letter-spacing:.6px;text-transform:uppercase">The five lists, most pressing first</td></tr>
<tr><td style="padding:0 0 10px 0;font:13px/1.5 ${FONT};color:${C.ink2}">${esc(`${lists.length} of the ${c.listsQualified} lists with something pressing in them. Decide a list as a whole, or drop into its lead task.`)}</td></tr>
${lists.map(listCard).join('')}` : ''}
<tr><td style="padding:6px 2px 0 2px;font:12px/1.65 ${FONT};color:${C.ink3}">
  <strong style="color:${C.ink2}">How these were picked.</strong> A task qualifies only on time: due within 14 days, or up to 60 days overdue
  (older is dormant, a keep-or-dismiss question the board handles). Then: +${w.decision} if the ticket frames a decision only you can make,
  or else +${w.person} if it needs you rather than a session; +${w.gate} if it sits in an approval-gate list; +${w.outside} for a commitment
  to someone outside; ${w.generated} for machine-generated scaffolding. A ticket's own "Decide by" beats its due date. At most two from one list and three from one project.
  The urgency score in the mirror is not used: it adds a flat +40 to anything overdue, so it measures neglect.<br><br>
  ${lists.length ? `<strong style="color:${C.ink2}">How the lists were picked.</strong> From the same task scores: a list qualifies only if one of its tasks does.
  It starts at its most pressing task's score, then +${LW.each} for each further pressing task (at most +${LW.eachCap}), and +${LW.dormantPile} when
  ${LW.dormantPileAt} or more of its tasks are dormant. At most two lists from one project.<br><br>` : ''}
  Today: ${c.tasks} active tasks, ${c.live} live, ${c.dormant} dormant${c.claimed ? `, ${c.claimed} held by another session and left out` : ''}.
  ${input.boardNote ? esc(input.boardNote) : ''}<br>
  ${input.verify ? `${esc(verifyLine(input.verify))}<br>` : ''}
  Read-only: nothing was changed in Basecamp to make this. ${esc(input.runId || '')}
</td></tr>
</table></td></tr></table>
</body></html>`;
}

module.exports = { renderMorningFive, esc };
