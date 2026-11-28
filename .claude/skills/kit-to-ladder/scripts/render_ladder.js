/**
 * Pure HTML renderers for a kit-to-ladder spec (no I/O, so they are tested on their own).
 * Output matches the Services Upgrade list (Ali Personal 10506775132): bold section heads,
 * bullet lists, backtick code left literal, every ticket self-contained for /loop-architect.
 */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** `[label](url)` becomes a link; everything else is escaped text. */
const inline = (s) => esc(s).replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
const para = (s) => `<div dir="auto">${inline(s)}</div>`;
const head = (s) => `<div dir="auto"><strong>${esc(s)}</strong></div>`;
const bullets = (items) => `<ul dir="auto">${items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
const section = (title, items) => {
  if (!items || (Array.isArray(items) && items.length === 0)) return '';
  return `<br>${head(title)}${Array.isArray(items) ? bullets(items) : para(items)}`;
};

function runLine(spec, t) {
  return `In a Claude Code session in the repo: \`/loop-architect Execute Basecamp ticket ${t.id} "${t.title}" `
    + `(${spec.place || 'Ali Personal'}, list "${spec.list.name}"). The full spec is this ticket's description; also read the Build Contract doc.\``;
}

function ticketHtml(spec, t, links) {
  const blocked = t.blockedBy && t.blockedBy.length ? t.blockedBy.join(', ') : 'nothing';
  if (t.kind === 'human') {
    const qs = (t.questions || []).map((q, n) => section(
      `Q${n + 1}. ${q.q}`,
      [...q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`), `Default if unanswered by the due date: ${q.default}`],
    ));
    return [
      `<div dir="auto">🧑 <strong>[Human] Milestone for Ali</strong> · Blocked by: <strong>${esc(blocked)}</strong></div>`,
      section('What', t.what),
      section('Why', t.why),
      section('What Claude prepares first', t.prepares),
      ...qs,
      qs.length ? section('Reply', `One line, for example "${t.questions.map((_, n) => `Q${n + 1}: A`).join(', ')}".`) : '',
      section('How this closes', 'Ali answers in a comment, in his own words (for example "M1: A"). Claude records the answer in the run directory execution-contract.md, posts what changes, and unblocks the dependents. Claude never ticks a Human ticket on its own judgement.'),
      `<br>${para(`Shared context: [${spec.contract.title}](${links.contract}).`)}`,
    ].join('');
  }
  return [
    `<div dir="auto">🤖 <strong>[AI] Loop Architect ticket</strong> · Repo: <em>${esc(spec.repoName)}</em> · PR: <strong>${esc(t.pr || '-')}</strong> · Blocked by: <strong>${esc(blocked)}</strong></div>`,
    `<br>${head('How to run this ticket')}`,
    bullets([
      runLine(spec, t),
      'If the session has no Basecamp access, paste this ticket\'s full text after `/loop-architect`. The ticket is self-contained.',
      `Shared context: [${spec.contract.title}](${links.contract}). Kit: [${spec.folder} folder](${links.folder}).`,
    ]),
    section('What', t.what),
    section('Why', t.why),
    section('Inputs (read these first)', t.inputs),
    section('Repository facts (patterns to reuse; verify on origin/main)', t.facts),
    section('In scope', t.inScope),
    section('Out of scope', t.outOfScope),
    section('Acceptance criteria (machine-checkable; all must pass)', t.acceptance),
    section('Tests required (happy · failure · boundary · idempotency)', t.tests),
    section('Verification commands', t.verify),
    section(`${spec.contract.short} (applies to every ticket)`, spec.contract.rules),
    section('Close-out', spec.closeOut),
  ].join('');
}

function listHtml(spec, links) {
  return [
    ...spec.list.intro.map((p) => para(p)),
    para(`Build Contract: [${spec.contract.title}](${links.contract}) · Kit: [${spec.folder}](${links.folder})`),
  ].join('<br>');
}

function contractHtml(spec, links) {
  return [
    ...spec.contract.body.map(([title, items]) => `${head(title)}${Array.isArray(items) ? bullets(items) : para(items)}`),
    `${head(spec.contract.short)}${bullets(spec.contract.rules)}`,
    para(`Kit folder: [${spec.folder}](${links.folder})`),
  ].join('<br>');
}

module.exports = { ticketHtml, listHtml, contractHtml, esc, inline };
