/**
 * listLens - look at the backlog as LISTS rather than as tickets, so a decision can be strategic.
 *
 * WHY THE LIST IS THE RIGHT UNIT
 *
 * Measured on production: 2,403 of Ali's 2,694 active tasks sit in ONE project across 421 lists,
 * and 1,386 carry the generated shape. The top ten lists are 100% dormant and hold 270 tasks
 * between them. Working that per-ticket is roughly 76 hours; deciding it per-list is under an hour
 * for a third of it.
 *
 * More importantly, the lists are NUMBERED - "1. Patient Self-Scheduling", "9. Ensuring Data
 * Security". They are phases of a program, not folders. So a list carries something a ticket never
 * can: where it sits in a sequence, and therefore whether the whole sequence is still live. That is
 * the difference between triage and strategy.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It proposes. Every suggestion carries the evidence that produced it and a command that would
 * carry it out, and nothing here executes. A bulk action over 39 tickets is exactly the kind of
 * thing that must not happen because a heuristic felt confident.
 *
 * Pure: (taskViews) -> listSummaries. No I/O, clock injected.
 */

const SEQ = /^\s*(\d{1,2})\s*[.)-]\s*(.+)$/;

/**
 * Is this task machine-generated scaffolding rather than something a person wrote?
 *
 * THE FIRST VERSION OF THIS TEST WAS WRONG IN THE EXPENSIVE DIRECTION, and it was only caught by
 * reading a real plan. It checked the description for "Type:" and "Done when:" alone, which
 * catches one generator. Story-build output carries a different signature entirely - "[BUILD]" and
 * "[BREAK]" prefixes from the Build/Break/Harden split, and the 🤖 / 🧑 task-split emoji - and that
 * signature appears in the TITLE, not the description.
 *
 * Measured: the narrow test found 1,386 of 2,693 (51%); the widened one finds 2,238 (83%). It was
 * missing 852 tasks, and two whole lists were being proposed for RE-DATING, which would have put
 * dead scaffolding back on the calendar instead of taking it off. Dismissing real work and
 * re-dating dead work are both bad, but only one of them wastes the next three months.
 */
function looksGenerated(task) {
  const title = String(task.title || '');
  const desc = String(task.description || '');
  if (desc.includes('Type:') && desc.includes('Done when:')) return true;
  if (/^\[(BUILD|BREAK|HARDEN)\]/.test(title.trim())) return true;
  if (/[\u{1F916}\u{1F9D1}]/u.test(title)) return true;
  return false;
}

/** Split "9. Ensuring Data Security" into its position and its name, when it is a numbered phase. */
function sequenceOf(listName) {
  const m = String(listName || '').match(SEQ);
  return m ? { position: Number(m[1]), name: m[2].trim() } : { position: null, name: String(listName || '(no list)') };
}

/**
 * The one task to name when describing a list.
 *
 * Prefer the most urgent LIVE task, because that is the thing that still has a deadline worth
 * meeting. Only when a list is entirely dormant does the oldest become the headline - at that
 * point the list is a decision, and the oldest item is the evidence for how long it has been one.
 */
function leadTask(tasks) {
  const live = tasks.filter((t) => t.band !== 'dormant');
  if (live.length) {
    return live.slice().sort((a, b) =>
      (b.urgency || 0) - (a.urgency || 0)
      || String(a.dueOn || '9999').localeCompare(String(b.dueOn || '9999')))[0];
  }
  return tasks.slice().sort((a, b) =>
    String(a.dueOn || '9999').localeCompare(String(b.dueOn || '9999')))[0] || null;
}

/**
 * Propose strategic moves for a list, each with its evidence.
 *
 * Ordered by how much they resolve, not by confidence: Ali asked to be able to act on a list as a
 * whole OR drop into a single ticket, so the block-level moves come first and "work just the lead"
 * is always last and always present. Having both on every list is the point - the report should
 * never force a mode.
 */
function suggestFor(summary) {
  const out = [];
  const { total, dormant, live, generatedShare, humanShare, name, key } = summary;
  const allDormant = dormant === total && total > 0;

  if (allDormant && generatedShare >= 0.6) {
    out.push({
      key: 'dismiss_list',
      label: `Dismiss all ${total} with a reason`,
      why: `every task is dormant and ${Math.round(generatedShare * 100)}% carry the generated shape, so this looks like scaffolding nobody is working`,
      command: `/ata-list "${key}" --dismiss --reason "<why>"`,
    });
  }

  if (allDormant && generatedShare < 0.6) {
    out.push({
      key: 'redate_block',
      label: `Re-date all ${total} into a window`,
      why: 'the whole list is dormant but it was hand authored, so the dates are wrong rather than the work',
      command: `/ata-list "${key}" --redate-from <YYYY-MM-DD> --per-week 3`,
    });
  }

  if (!allDormant && dormant > 0) {
    out.push({
      key: 'split',
      label: `Work the ${live} live, re-date the ${dormant} dormant`,
      why: 'the list is mixed, so one decision for each half beats one decision for the list',
      command: `/ata-list "${key}" --work-live --redate-dormant-from <YYYY-MM-DD>`,
    });
  }

  if (humanShare >= 0.5 && total >= 5) {
    out.push({
      key: 'assign_owner',
      label: `Give the list to one owner (${Math.round(humanShare * 100)}% are human tasks)`,
      why: 'most of it cannot be done by a session, so the leverage is delegation rather than automation',
      command: `/ata-list "${key}" --assign <person>`,
    });
  } else if (humanShare < 0.3 && total >= 5) {
    out.push({
      key: 'run_list',
      label: `Run the list unattended (${Math.round((1 - humanShare) * 100)}% are session work)`,
      why: 'almost nothing here needs a person, so it can go to a tab and come back done',
      command: `/ata-list "${key}" --run`,
    });
  }

  out.push({
    key: 'work_lead',
    label: 'Work just the lead task',
    why: 'the in-the-trenches option, always available',
    command: summary.lead ? `/ata-work-task ${summary.lead.id}` : `/ata-list "${key}" --work-lead`,
  });

  return out;
}

/**
 * The project most of a list's tasks live in. A list name can recur across projects, so the
 * majority wins; ties go to the lexically lower id so the answer is stable between runs. Falls back to the
 * "<project>/<todo>" id prefix when a view carries no explicit projectId.
 */
function dominantProject(items) {
  const n = new Map();
  for (const t of items) {
    const p = t.projectId != null ? String(t.projectId)
      : (String(t.id || '').includes('/') ? String(t.id).split('/')[0] : null);
    if (p) n.set(p, (n.get(p) || 0) + 1);
  }
  const ranked = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked.length ? ranked[0][0] : null;
}

/**
 * Group task views into list summaries.
 * @param {Array} tasks task views: {id,title,list,dueOn,daysOverdue,band,urgency,generated,humanOnly,url}
 * @returns {Array} summaries, biggest first
 */
function byList(tasks) {
  const groups = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    const key = t.list || '(no list)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const summaries = [];
  for (const [key, items] of groups) {
    const seq = sequenceOf(key);
    const dormant = items.filter((t) => t.band === 'dormant').length;
    const generated = items.filter((t) => t.generated).length;
    const human = items.filter((t) => t.humanOnly).length;
    const dated = items.filter((t) => t.dueOn).map((t) => t.dueOn).sort();
    const summary = {
      key,
      projectId: dominantProject(items),
      name: seq.name,
      position: seq.position,
      total: items.length,
      dormant,
      live: items.length - dormant,
      generatedShare: items.length ? generated / items.length : 0,
      humanShare: items.length ? human / items.length : 0,
      oldestDue: dated[0] || null,
      newestDue: dated[dated.length - 1] || null,
      bands: ['fresh', 'overdue', 'aging', 'dormant']
        .map((b) => ({ band: b, n: items.filter((t) => t.band === b).length })),
      tasks: items.slice().sort((a, b) =>
        (b.urgency || 0) - (a.urgency || 0)
        || String(a.dueOn || '9999').localeCompare(String(b.dueOn || '9999'))),
      lead: null,
      suggestions: [],
    };
    summary.lead = leadTask(items);
    summary.suggestions = suggestFor(summary);
    summaries.push(summary);
  }

  return summaries.sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key)));
}

/**
 * Sibling phases: other lists that look like steps of the same numbered program.
 *
 * This is what lets a list say where it sits in the bigger picture rather than just how big it is.
 * Two lists are siblings when BOTH are numbered - a bare name is not a phase of anything.
 */
function withSiblings(summaries) {
  const numbered = summaries.filter((s) => s.position != null);
  return summaries.map((s) => {
    if (s.position == null) return { ...s, siblings: [], phaseOf: null };
    const siblings = numbered
      .filter((o) => o.key !== s.key)
      .sort((a, b) => a.position - b.position);
    const maxPos = Math.max(...numbered.map((o) => o.position));
    return { ...s, siblings, phaseOf: { position: s.position, of: maxPos } };
  });
}

module.exports = { byList, withSiblings, leadTask, suggestFor, sequenceOf, looksGenerated, dominantProject };
