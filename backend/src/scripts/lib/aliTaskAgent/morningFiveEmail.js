/**
 * morningFiveEmail - the parts of the Morning Five email that are not the HTML body: subject,
 * plain-text alternative, and attachment name. Pure, so they are tested without sending.
 *
 * The HTML body is renderMorningFive's output unchanged ("what you sent should be the email",
 * Ali, 2026-11-11). The plain-text part exists for clients that will not render HTML; it carries
 * the same ten, the same links and the tour, never less. No PDF (Ali, 2026-11-12).
 */

/** YYYY-MM-DD in Central time, which is the day Ali reads it. */
function centralDate(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
  return `${p.year}-${p.month}-${p.day}`;
}

function attachmentNames(date) {
  return { board: `backlog-navigator-${date}.html` };
}

const golden = (summary) => ((summary && summary.items) || []).find((i) => i.golden) || null;

/** "Your ten for Thu, Nov 12" plus the one move, kept short enough to read in an inbox row. */
function subjectFor(summary, { test = false, now = new Date() } = {}) {
  const day = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  const g = golden(summary);
  const move = g ? `${g.kind === 'list' ? 'List: ' : ''}${g.title}` : null;
  const tail = move ? `: ${move.length > 70 ? `${move.slice(0, 69).trimEnd()}...` : move}` : '';
  return `${test ? '[TEST] ' : ''}Your ten for ${day}${tail}`;
}

function textFor(summary, names) {
  const L = [];
  const items = (summary && summary.items) || [];
  const c = (summary && summary.counts) || {};
  if (!items.length) {
    L.push('Nothing qualified as pressing today.');
  } else {
    const g = golden(summary);
    L.push(`THE ONE MOVE: ${g.title} (${g.kind})`, '');
    if (summary.tourHref) L.push('Guided tour of all ten:', summary.tourHref, '');
    L.push('THE TEN, MOST IMPACTFUL FIRST');
    items.forEach((it) => {
      L.push(`${it.rank}. [${it.kind.toUpperCase()}]${it.golden ? ' [ONE MOVE]' : ''} ${it.title} (${it.when}, impact ${it.score})`,
        `   ${it.path}`);
      if (it.url) L.push(`   Basecamp: ${it.url}`);
      L.push(`   Copy for Claude Code: ${it.copyHref}`);
    });
  }
  L.push('', `Attached: ${names.board} (the interactive board; open it in a browser).`,
    `Today: ${c.tasks} active tasks, ${c.live} live, ${c.dormant} dormant. Read-only: nothing was changed in Basecamp.`);
  // Ticket titles carry em-dashes and mandrillPreflight refuses any (see renderMorningFive.esc).
  return L.join('\n').replace(/\s*—\s*/g, ' - ');
}

module.exports = { centralDate, attachmentNames, subjectFor, textFor };
