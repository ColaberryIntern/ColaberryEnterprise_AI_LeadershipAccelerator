/**
 * morningFeed - the Morning Five as ONE ranked feed of lists and tasks, plus the text each
 * "Copy for Claude Code" button puts on the clipboard.
 *
 * Ali, 2026-11-12: "Sort the list by the most impactful - that is list or tasks ... color coded
 * ... the one task [move] to look the same as the other task and list except it needs some gold
 * around it". So:
 *
 *   - five lists and five tasks are merged and sorted by IMPACT, which is the score each already
 *     carries: a task's pressingFive score; a list's pressingLists score (its most pressing task
 *     plus breadth and dormant-pile points). Ties go to the list (one decision covers more), then
 *     to the more overdue, then id, so the order is stable.
 *   - #1 is the golden move. It can be a list or a task.
 *   - a task inside a picked list never appears on its own (verifiedPicks excludes it), so the ten
 *     never ask for the same work twice.
 *
 * Pure: picks in, feed items out. No I/O.
 */

const { buildTaskPrompt } = require('./promptBuilder');

const whenText = (late) => (late == null ? 'no date' : late > 0 ? `${late}d overdue`
  : late === 0 ? 'due today' : `due in ${-late}d`);
const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/**
 * What a list's "Copy for Claude Code" button copies. Short on purpose: it starts with the
 * /ata-list command, whose skill reads every task live; the rest pins WHICH list (names repeat
 * across projects) and carries the proposed move and the rule that decisions stay Ali's.
 */
function listCopyText(l, rank, golden) {
  const lines = [
    `/ata-list "${l.key}"`,
    '',
    `List id: ${l.projectId}/${l.listId || '?'}${l.url ? ` (${l.url})` : ''}`,
    `From today's Morning Five: #${rank} by impact${golden ? ', THE ONE MOVE today' : ''}. ${l.total} open tasks, ${l.pressing.length} pressing, ${l.dormant} dormant.`,
  ];
  if (l.proposal) lines.push(`PROPOSED MOVE: ${l.proposal.label}. ${l.proposal.why}.`);
  lines.push('Pressing tasks, most pressing first:');
  l.pressing.slice(0, 8).forEach((t) => lines.push(`  - ${t.id}  ${clip(t.title, 120)} (${whenText(t.late)})`));
  lines.push('', 'WHAT TO DO: decide what happens to this list as a whole, using the ata-list skill. Anything that is a decision is Ali\'s: prepare a one-page memo per decision with options and a recommendation, and do not make it. Dismissing only hides tasks from Ali\'s queue; never close or change a Basecamp ticket without Ali\'s go-ahead.');
  return lines.join('\n');
}

/** The facts shown on a task card, in order. Values are plain text (the renderer escapes). */
function taskFacts(t, stepNext) {
  return [
    ['Due', t.dueOn ? String(t.dueOn).slice(0, 10) : 'no date'],
    ['Decide by', t.decideBy || ''],
    ['Owner', t.owner || ''],
    ['The ticket says', t.summary ? clip(t.summary, 260) : 'no brief in the ticket'],
    ['Done when', t.doneWhen ? clip(t.doneWhen, 200) : 'not stated in the ticket'],
    ['Next step', stepNext],
  ].filter(([, v]) => v);
}

function listFacts(l) {
  const others = l.pressing.slice(1, 3).map((t) => `${clip(t.title, 90)} (${whenText(t.late)})`);
  return [
    ['Open tasks', `${l.total}: ${l.live} live, ${l.dormant} dormant`],
    ['Most pressing', l.pressing[0] ? `${clip(l.pressing[0].title, 110)} (${whenText(l.pressing[0].late)})` : ''],
    ['Also pressing', others.join('; ')],
    ['Proposed', l.proposal ? l.proposal.label : ''],
  ].filter(([, v]) => v);
}

/** Same rule as the old card's step label: the ticket's own words decide "decision". */
function stepOf(t) {
  if (t.isDecision) return { label: 'Your decision', next: 'Decide it. A session prepares a one-page decision memo first.' };
  if (t.humanOnly || t.category === 'human_required') return { label: 'Needs you', next: 'A session prepares everything up to the step only you can take.' };
  return { label: 'Session work', next: t.dispositionReason || 'A session can do this through to "Done when".' };
}

/**
 * @param {{tasks:Array, lists:Array, workOrderTextFor:(t:object)=>string}} input
 *   tasks  pressingFive picks (work orders + score, reasons, late, isDecision)
 *   lists  pressingLists picks, each with url, path, proposal already attached
 * @returns {Array} feed items, most impactful first; item.golden marks #1
 */
function buildFeed({ tasks, lists, workOrderTextFor }) {
  const items = [
    ...(lists || []).map((l) => ({ kind: 'list', src: l, score: l.score, late: l.pressing[0] ? l.pressing[0].late : null, id: l.id })),
    ...(tasks || []).map((t) => ({ kind: 'task', src: t, score: t.score, late: t.late, id: t.id })),
  ].sort((a, b) => b.score - a.score
    || (a.kind === b.kind ? 0 : a.kind === 'list' ? -1 : 1)
    || (b.late ?? -999) - (a.late ?? -999)
    || String(a.id).localeCompare(String(b.id)));

  return items.map((x, i) => {
    const rank = i + 1;
    const golden = i === 0;
    if (x.kind === 'list') {
      const l = x.src;
      return { rank, golden, kind: 'list', id: l.id, title: l.key, url: l.url || null, path: l.path,
        score: l.score, when: whenText(x.late), late: x.late, tag: `${l.pressing.length} pressing`,
        facts: listFacts(l), reasons: l.reasons.filter((r) => r.pts),
        copyText: listCopyText(l, rank, golden) };
    }
    const t = x.src;
    const step = stepOf(t);
    return { rank, golden, kind: 'task', id: t.id, title: t.title, url: t.url || null, path: t.path,
      score: t.score, when: whenText(t.late), late: t.late, tag: step.label,
      facts: taskFacts(t, step.next), reasons: t.reasons.filter((r) => r.pts),
      copyText: buildTaskPrompt(t, workOrderTextFor(t)) };
  });
}

module.exports = { buildFeed, listCopyText, whenText };
