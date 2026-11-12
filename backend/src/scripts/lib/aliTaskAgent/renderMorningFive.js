/**
 * renderMorningFive - the morning email: ten items, lists and tasks in ONE feed ranked by impact,
 * #1 framed in gold as the one move, and a guided-tour button at the top.
 *
 * Ali, 2026-11-12: no prompts on the page ("I just need to know that they work"). Every card has
 * exactly two actions: open it in Basecamp, or copy its Claude Code prompt. Lists and tasks are
 * told apart by colour AND icon (never colour alone): lists violet with 📋, tasks blue with 📌.
 *
 * EMAIL-SAFE BY CONSTRUCTION: inline styles, tables for layout, no script, no CSS variables, no
 * external assets. Copy and tour links go to the companion page (tourLinks) with Mandrill click
 * tracking disabled on them (mc:disable-tracking), so the tracker cannot rewrite them.
 *
 * Every rendered string from Basecamp is escaped: titles and descriptions are untrusted input.
 */

const { WEIGHTS } = require('./pressingFive');
const { LIST_WEIGHTS } = require('./pressingLists');

const C = {
  cherry: '#FB2832', cherryDeep: '#C20E1E', leaf: '#3f7d20',
  ink: '#1f2937', ink2: '#4b5563', ink3: '#6b7280', line: '#e5e7eb', bg: '#f8fafc', card: '#ffffff',
  gold: '#C9971C', goldBg: '#FFF8E1', goldInk: '#7A5A00', dark: '#0f172a',
};
/** Colour + icon per kind. Contrast of the ink on each tint is >= 4.5:1. */
const KIND = {
  task: { icon: '\u{1F4CC}', label: 'Task', ink: '#1D4ED8', tint: '#EFF6FF', bar: '#2563EB' },
  list: { icon: '\u{1F4CB}', label: 'List', ink: '#6D28D9', tint: '#F5F3FF', bar: '#7C3AED' },
};
const FONT = "'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif";

/**
 * Escape for HTML, and turn any em-dash into " - ". Basecamp titles carry em-dashes ("Ali — claim
 * your systems", 2026-11-12) and mandrillPreflight refuses to send an email containing one, so a
 * single ticket title would otherwise block the whole daily send.
 */
function esc(s) {
  return String(s == null ? '' : s).replace(/\s*—\s*/g, ' - ').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function chip(text, fg, bg) {
  return `<span style="display:inline-block;font:600 11px/1.6 ${FONT};color:${fg};background:${bg};border-radius:999px;padding:1px 9px;margin:0 4px 4px 0">${esc(text)}</span>`;
}

function timingChip(it) {
  if (it.late == null) return chip('no date', C.ink2, '#f1f5f9');
  if (it.late > 0) return chip(it.when, '#ffffff', it.late >= 8 ? C.cherryDeep : C.cherry);
  if (it.late === 0) return chip(it.when, '#ffffff', C.cherry);
  return chip(it.when, C.ink, '#fde68a');
}

const fact = ([k, v]) => `<tr><td style="font:600 11px/1.5 ${FONT};color:${C.ink3};text-transform:uppercase;letter-spacing:.4px;padding:2px 10px 2px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="font:13px/1.5 ${FONT};color:${C.ink};padding:2px 0">${esc(v)}</td></tr>`;

/** A button. Links to the companion page carry mc:disable-tracking so Mandrill leaves them alone. */
function button(href, text, bg, { untracked = false } = {}) {
  return `<a href="${esc(href)}"${untracked ? ' mc:disable-tracking' : ''} style="display:inline-block;font:600 13px/1 ${FONT};color:#ffffff;background:${bg};border-radius:6px;padding:10px 14px;text-decoration:none">${esc(text)}</a>`;
}

/**
 * One card. Tasks and lists share the layout; the kind sets colour and icon; the golden #1 gets a
 * gold frame and a gold banner and is otherwise identical.
 * @param {object} it a morningFeed item plus copyHref
 */
function card(it) {
  const k = KIND[it.kind];
  const frame = it.golden ? `border:3px solid ${C.gold}` : `border:1px solid ${C.line}`;
  const banner = it.golden
    ? `<tr><td style="background:${C.goldBg};border-bottom:1px solid #F1D68A;padding:8px 16px;font:700 12px/1.4 ${FONT};color:${C.goldInk};letter-spacing:.6px;text-transform:uppercase">⭐ The one move today &middot; most impactful</td></tr>`
    : '';
  const reasons = it.reasons.map((r) =>
    `<tr><td style="font:700 12px/1.5 Consolas,Menlo,monospace;color:${r.pts > 0 ? C.leaf : C.cherryDeep};padding:1px 8px 1px 0;text-align:right;white-space:nowrap">${r.pts > 0 ? '+' : ''}${esc(r.pts)}</td><td style="font:13px/1.5 ${FONT};color:${C.ink2};padding:1px 0">${esc(r.why)}</td></tr>`).join('');
  const title = it.url ? `<a href="${esc(it.url)}" style="color:${C.ink};text-decoration:none">${esc(it.title)}</a>` : esc(it.title);
  return `
<tr><td style="padding:0 0 14px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};${frame};border-radius:10px">
${banner}
<tr><td style="border-left:5px solid ${k.bar};border-radius:${it.golden ? '0 0 0 8px' : '9px 0 0 9px'};padding:12px 16px 14px 14px">
  <div style="margin:0 0 4px 0"><span style="display:inline-block;font:700 11px/1.6 ${FONT};color:${k.ink};background:${k.tint};border-radius:4px;padding:1px 8px;letter-spacing:.5px;text-transform:uppercase">${k.icon} ${k.label}</span>
    <span style="font:700 11px/1.6 ${FONT};color:${C.ink3};letter-spacing:.5px;text-transform:uppercase;margin-left:6px">#${esc(it.rank)} &middot; impact ${esc(it.score)}</span></div>
  <div style="font:700 17px/1.35 ${FONT};color:${C.ink};margin:2px 0 4px 0">${title}</div>
  <div style="font:12px/1.5 ${FONT};color:${C.ink3};margin:0 0 6px 0">${esc(it.path)}</div>
  <div>${timingChip(it)}${chip(it.tag, k.ink, k.tint)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 2px 0">${it.facts.map(fact).join('')}</table>
  <div style="font:700 11px/1.4 ${FONT};color:${C.ink3};letter-spacing:.5px;text-transform:uppercase;margin:8px 0 2px 0">Why it is here</div>
  <table role="presentation" cellpadding="0" cellspacing="0">${reasons}</table>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px"><tr>
    ${it.url ? `<td style="padding-right:8px">${button(it.url, 'Open in Basecamp', k.bar)}</td>` : ''}
    <td>${button(it.copyHref, '\u{1F4CB} Copy for Claude Code', C.dark, { untracked: true })}</td>
  </tr></table>
</td></tr></table>
</td></tr>`;
}

/** What the live Basecamp check found, said plainly. An unchecked link is admitted, not hidden. */
function verifyLine(v) {
  const dropped = [];
  if (v.deadLists) dropped.push(`${v.deadLists} list${v.deadLists === 1 ? '' : 's'}`);
  if (v.deadTodos) dropped.push(`${v.deadTodos} to-do${v.deadTodos === 1 ? '' : 's'}`);
  const head = `Every list and to-do linked above was checked live in Basecamp as this was built${dropped.length
    ? `; ${dropped.join(' and ')} that the mirror still shows as open were trashed, archived or completed in Basecamp, and were left out` : ''}.`;
  return v.unchecked ? `${head} ${v.unchecked} could not be checked (Basecamp did not answer) and were kept.` : head;
}

/**
 * @param {{today:Date|string, runId:string, items:Array, tourHref:string,
 *          counts:{tasks:number, live:number, dormant:number, qualified:number, claimed:number, listsQualified?:number},
 *          verify?:object, boardNote?:string}} input  items: morningFeed items, each with copyHref
 */
function renderMorningFive(input) {
  const today = new Date(input.today || Date.now());
  const day = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
  const items = input.items || [];
  const c = input.counts || {};
  const nList = items.filter((i) => i.kind === 'list').length;
  const nTask = items.length - nList;
  const top = items[0];
  const verdict = top
    ? `The one move: ${top.title} (${KIND[top.kind].label.toLowerCase()}). ${items.length} items ranked by impact: ${nList} list${nList === 1 ? '' : 's'} and ${nTask} task${nTask === 1 ? '' : 's'}.`
    : 'Nothing qualified as pressing today.';
  const w = WEIGHTS;
  const LW = LIST_WEIGHTS;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your ten, ${esc(day)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px">
<tr><td style="padding:0 0 4px 0;font:700 24px/1.3 ${FONT};color:${C.cherry}">Your ten for ${esc(day)}</td></tr>
<tr><td style="padding:0 0 14px 0;font:15px/1.6 ${FONT};color:${C.ink}">${esc(verdict)}</td></tr>
${items.length && input.tourHref ? `<tr><td style="padding:0 0 12px 0"><a href="${esc(input.tourHref)}" mc:disable-tracking style="display:block;text-align:center;font:700 16px/1 ${FONT};color:#3B2A00;background:#F5C542;border:2px solid ${C.gold};border-radius:10px;padding:14px 18px;text-decoration:none">▶ Start the guided tour: ${items.length} stops, most impactful first</a></td></tr>` : ''}
<tr><td style="padding:0 0 14px 0;font:12px/1.6 ${FONT};color:${C.ink2}">
  ${chip(`${KIND.list.icon} List`, KIND.list.ink, KIND.list.tint)} a whole list, decided as one move &nbsp;
  ${chip(`${KIND.task.icon} Task`, KIND.task.ink, KIND.task.tint)} a single ticket &nbsp;
  ${chip('⭐ Gold frame', C.goldInk, C.goldBg)} the one move today</td></tr>
${items.map(card).join('')}
<tr><td style="padding:6px 2px 0 2px;font:12px/1.65 ${FONT};color:${C.ink3}">
  <strong style="color:${C.ink2}">How to use it.</strong> Open in Basecamp to read the ticket or list. Copy for Claude Code puts a ready prompt on your clipboard (in Chrome or Edge it copies the moment the page opens): paste it into a fresh Claude Code tab. Start with the gold one.<br><br>
  <strong style="color:${C.ink2}">How these were ranked.</strong> A task qualifies only on time: due within 14 days, or up to 60 days overdue
  (older is dormant, a keep-or-dismiss question the board handles). Then: +${w.decision} if the ticket frames a decision only you can make,
  or else +${w.person} if it needs you rather than a session; +${w.gate} if it sits in an approval-gate list; +${w.outside} for a commitment
  to someone outside; ${w.generated} for machine-generated scaffolding. A list scores its most pressing task, +${LW.each} for each further
  pressing task (at most +${LW.eachCap}), and +${LW.dormantPile} when ${LW.dormantPileAt} or more of its tasks are dormant. Five lists and five tasks are
  then ranked together by that impact (a tie goes to the list); a task inside a ranked list is covered by the list and not shown again.
  At most two lists and three tasks from one project.<br><br>
  Today: ${c.tasks} active tasks, ${c.live} live, ${c.dormant} dormant; ${c.qualified} tasks and ${c.listsQualified || 0} lists qualified${c.claimed ? `; ${c.claimed} held by another session and left out` : ''}.
  ${input.boardNote ? esc(input.boardNote) : ''}<br>
  ${input.verify ? `${esc(verifyLine(input.verify))}<br>` : ''}
  Read-only: nothing was changed in Basecamp to make this. ${esc(input.runId || '')}
</td></tr>
</table></td></tr></table>
</body></html>`;
}

module.exports = { renderMorningFive, esc, verifyLine, KIND };
