/**
 * pressingLists - the five most pressing LISTS, the list-level twin of pressingFive.
 *
 * Ali, 2026-11-12: "The 5 most urgent tasks is fine but also give me the 5 most urgent lists. Use
 * the same format but from a list perspective instead of a ticket perspective."
 *
 * HOW A LIST IS SCORED
 *
 * A list is built from the SAME task scores as the five (pressingFive.scoreTask), so the two views
 * cannot disagree about what is pressing. A list qualifies only when at least one of its tasks
 * qualifies on time. Then, each shown on the report:
 *
 *   lead     the score of its most pressing task (time, decision, gate, outside, generated)
 *   +5 each  for every further pressing task in it, capped at +20: a list with four late tasks is
 *            more urgent than a list with one, but a long list must not win on length alone
 *   +10      when 10 or more of its tasks are dormant: there is also a keep / re-date / dismiss
 *            call waiting behind the live work
 *
 * At most two lists come from one project (the task five allow three; five lists from one client
 * would hide every other program). Ties break on pressing-task count, then lateness, then id.
 *
 * Pure: scored tasks and list summaries in, picks out.
 */

const LIST_WEIGHTS = { each: 5, eachCap: 20, dormantPile: 10, dormantPileAt: 10 };

/** The list a task belongs to, in listLens.byList's id format ("<projectId>/<listId>", else the name). */
function listIdOf(t) {
  return t.listId ? `${t.projectId}/${t.listId}` : (t.list || '(no list)');
}

/**
 * Score one list.
 * @param {object} summary a listLens.byList summary
 * @param {Array} pressing the list's qualified tasks (score > 0), most pressing first
 */
function scoreList(summary, pressing) {
  if (!pressing.length) return { score: 0, reasons: [] };
  const lead = pressing[0];
  const reasons = [{ pts: lead.score, why: `its most pressing task scores ${lead.score}: "${lead.title}"` }];
  const more = pressing.length - 1;
  if (more > 0) {
    const pts = Math.min(more * LIST_WEIGHTS.each, LIST_WEIGHTS.eachCap);
    reasons.push({ pts, why: `${more} more pressing task${more === 1 ? '' : 's'} in it${pts === LIST_WEIGHTS.eachCap && more * LIST_WEIGHTS.each > pts ? ' (capped)' : ''}` });
  }
  if ((summary.dormant || 0) >= LIST_WEIGHTS.dormantPileAt) {
    reasons.push({ pts: LIST_WEIGHTS.dormantPile, why: `${summary.dormant} dormant tasks also waiting on a keep, re-date or dismiss call` });
  }
  return { score: reasons.reduce((a, r) => a + r.pts, 0), reasons };
}

/**
 * The five lists.
 * @param {Array} scored every task with its pressingFive score (pickFive's `scored`); each carries
 *                       { projectId, listId, list, score, late, title }
 * @param {Array} summaries listLens.byList output over every active task
 * @returns {{picks:Array, qualified:number}}
 */
function pickFiveLists(scored, summaries, opts = {}) {
  const n = opts.n || 5;
  const perProject = opts.perProject || 2;
  const tasksByList = new Map();
  for (const t of (Array.isArray(scored) ? scored : []).filter((x) => x.score > 0)) {
    const k = listIdOf(t);
    if (!tasksByList.has(k)) tasksByList.set(k, []);
    tasksByList.get(k).push(t);
  }

  const ranked = (Array.isArray(summaries) ? summaries : [])
    .map((s) => {
      const pressing = (tasksByList.get(s.id) || []).slice()
        .sort((a, b) => b.score - a.score || (b.late ?? -999) - (a.late ?? -999) || String(a.id).localeCompare(String(b.id)));
      const { score, reasons } = scoreList(s, pressing);
      return { ...s, score, reasons, pressing, lateMost: pressing.reduce((m, t) => Math.max(m, t.late ?? -999), -999) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.pressing.length - a.pressing.length
      || b.lateMost - a.lateMost || String(a.id).localeCompare(String(b.id)));

  const out = [];
  const byProject = {};
  for (const s of ranked) {
    const p = String(s.projectId || '(no project)');
    if ((byProject[p] || 0) >= perProject) continue;
    byProject[p] = (byProject[p] || 0) + 1;
    out.push(s);
    if (out.length === n) break;
  }
  return { picks: out, qualified: ranked.length };
}

/**
 * The move to propose for a picked list.
 *
 * When half or more of its pressing tasks are decisions (pressingFive.isDecision, the ticket's own
 * words), the move is to decide them. listLens.suggestFor counts only tasks marked with the person
 * emoji as human work, so on the first live render (2026-11-12) it proposed "Run the list
 * unattended (100% are session work)" for "Path to Profitability - decisions for Ram" and for
 * "06 - Owner Decisions and Blockers". A session cannot make Ali's decisions. Otherwise the list's
 * own strongest suggestion stands.
 */
function proposalFor(list) {
  const pressing = list.pressing || [];
  const decisions = pressing.filter((t) => t.isDecision).length;
  if (decisions > 0 && decisions * 2 >= pressing.length) {
    return {
      key: 'decide_block',
      label: `Decide its ${decisions} pending decision${decisions === 1 ? '' : 's'} in one sitting`,
      why: `${decisions} of its ${pressing.length} pressing tasks are decisions only you can make, so no session can run this list for you; a session can prepare a one-page memo for each first`,
      command: `/ata-list "${list.key}"`,
    };
  }
  return (list.suggestions || [])[0] || null;
}

module.exports = { pickFiveLists, scoreList, proposalFor, listIdOf, LIST_WEIGHTS };
