/**
 * morningFiveEmail - the parts of the Morning Five email that are not the HTML body: subject,
 * plain-text alternative, and attachment names. Pure, so they are tested without sending.
 *
 * The HTML body is renderMorningFive's output unchanged ("what you sent should be the email",
 * Ali, 2026-11-11). The plain-text part exists for clients that will not render HTML; it carries
 * the same five and the same prompt, never less.
 */

/** YYYY-MM-DD in Central time, which is the day Ali reads it. */
function centralDate(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
  return `${p.year}-${p.month}-${p.day}`;
}

function attachmentNames(date) {
  return { board: `backlog-navigator-${date}.html`, pdf: `morning-five-${date}.pdf` };
}

/** "Your five for Wed, Nov 11" plus the one move, kept short enough to read in an inbox row. */
function subjectFor(summary, { test = false, now = new Date() } = {}) {
  const day = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  const move = summary && summary.move && summary.move.title ? summary.move.title : null;
  const tail = move ? `: ${move.length > 70 ? `${move.slice(0, 69).trimEnd()}...` : move}` : '';
  return `${test ? '[TEST] ' : ''}Your five for ${day}${tail}`;
}

function textFor(summary, names) {
  const L = [];
  const picks = (summary && summary.picks) || [];
  const c = (summary && summary.counts) || {};
  L.push(picks.length ? `${picks.length} pressing tasks out of ${c.qualified} that qualified.` : 'Nothing qualified as pressing today.');
  if (summary && summary.move && summary.move.title) {
    L.push('', `THE ONE MOVE: ${summary.move.title}`, summary.move.why || '', '', 'Paste this into Claude Code:', '', summary.movePrompt || '');
  }
  L.push('', 'THE FIVE');
  picks.forEach((p, i) => {
    const when = p.late == null ? 'no date' : p.late > 0 ? `${p.late}d overdue` : p.late === 0 ? 'due today' : `due in ${-p.late}d`;
    L.push(`${i + 1}. ${p.title} (${when}, score ${p.score})`, `   ${p.path}`, `   ${p.url || ''}`, `   /ata-work-task ${p.id}`);
  });
  const lists = (summary && summary.lists) || [];
  if (lists.length) {
    L.push('', 'THE FIVE LISTS');
    lists.forEach((l, i) => {
      L.push(`${i + 1}. ${l.key} (${l.pressing} pressing, ${l.total} open, ${l.dormant} dormant, score ${l.score})`,
        `   ${l.path}`);
      if (l.lead) L.push(`   Most pressing: ${l.lead.title}`);
      if (l.proposal) L.push(`   Proposed: ${l.proposal}`);
      L.push(`   ${l.url || ''}`, `   /ata-list "${l.key}"`);
    });
  }
  L.push('', `Attached: ${names.board} (the interactive board; open it in a browser) and ${names.pdf} (this report).`,
    `Today: ${c.tasks} active tasks, ${c.live} live, ${c.dormant} dormant. Read-only: nothing was changed in Basecamp.`);
  return L.join('\n');
}

module.exports = { centralDate, attachmentNames, subjectFor, textFor };
