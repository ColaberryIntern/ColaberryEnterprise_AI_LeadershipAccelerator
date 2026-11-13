/**
 * workOrder - turn a mirror row into something a Claude Code session can START ON, not research.
 *
 * THE PROBLEM THIS SOLVES
 *
 * Today the digest hands a session a title. The session then spends its first ten minutes doing
 * the same rediscovery every other session has already done: find the ticket, find the project,
 * read the thread, work out who owns the decision, work out where the artifact goes, work out
 * what "done" means, and work out whether another tab is already on it. That tax is paid once per
 * tab per task, and it is pure waste.
 *
 * A work order is the answer to all of those, computed once, carried with the task. It is
 * deterministic - every field is either a column or a labelled line already present in the ticket
 * description (see briefParser) - so it costs nothing and cannot invent an owner or a deadline.
 *
 * THE DISPOSITION IS THE POINT
 *
 * For a backlog that is 85% dormant, the valuable question is not "how urgent" but "what is this
 * waiting on". Three of the four answers need no human at all:
 *
 *   act        nothing is blocking it; it was simply dropped. A session can just do it.
 *   draft      it is waiting on an outbound message. A session can draft it for one click.
 *   ask        only Ali can answer. A session should produce the QUESTION, not the work.
 *   close      nothing breaks if it never happens. A session proposes dismissal with a reason.
 *
 * "act" and "draft" are the free wins: work that fell off for no reason and can be restarted with
 * zero human input. That is the whole brief - putting things back in motion.
 */

const { parseBrief } = require('./briefParser');
const { bandFor, daysOverdue } = require('./ageBands');

/**
 * Propose a disposition from evidence only.
 *
 * DELIBERATELY CONSERVATIVE. It proposes `ask` whenever the ticket names a decision or a decision
 * owner, because a session doing a decision on Ali's behalf is the one failure that cannot be
 * undone by a later commit. Everything else is reversible, so the bias runs the other way: when a
 * ticket is dropped and nothing says a human is required, propose acting.
 *
 * It returns a REASON with every verdict, because a disposition without its evidence is just an
 * opinion, and the point of the board is to stop the queue making unexplained claims.
 */
function proposeDisposition(row, brief, band) {
  const title = String(row.title || '');
  const isDecision = /\bdecision\b|\bgo or no-go\b|\bgate\b/i.test(title)
    || Boolean(brief.decision) || Boolean(brief.owner);

  /**
   * FIRST, because the ticket's own words outrank every inference below it.
   *
   * Found by rendering against production: 13 of 425 work orders said "Act now" directly above a
   * brief reading "Required skill: none - human task". A confident wrong proposal is worse than
   * none, so a ticket that declares itself human-only can never be proposed as session work. The
   * useful contribution there is preparation, which shortens the human step rather than skipping
   * it.
   */
  if (brief.humanOnly) {
    return { key: 'prep', reason: 'the ticket says a person has to do this; a session can only prepare it' };
  }
  if (row.category === 'human_required') {
    return { key: 'ask', reason: 'the mirror classifies this as human_required' };
  }
  if (isDecision) {
    return {
      key: 'ask',
      reason: brief.owner
        ? `the ticket names a decision owner (${brief.owner})`
        : 'the title or body frames this as a decision, which is not a session\'s to make',
    };
  }
  if (brief.blockedBy) {
    return { key: 'draft', reason: `the ticket says it is waiting on ${brief.blockedBy}` };
  }
  if (band.key === 'dormant') {
    return {
      key: 'close',
      reason: 'dormant with nothing recorded as blocking it; propose dismissal with a reason, or a new date',
    };
  }
  return { key: 'act', reason: 'nothing recorded as blocking it, and it is still live' };
}

const DISPOSITION_LABEL = {
  act: 'Act now',
  draft: 'Draft the outbound',
  ask: 'Ask Ali one question',
  close: 'Propose closing',
  prep: 'Prep for a human',
};

/**
 * Build the work order.
 * @param {object} row an ops_bc_todos row
 * @param {Date|string|number} today
 * @returns {object}
 */
function buildWorkOrder(row, today) {
  const brief = parseBrief(row.description);
  const band = bandFor(row.due_on, today);
  const late = daysOverdue(row.due_on, today);
  const disposition = proposeDisposition(row, brief, band);

  return {
    id: `${row.project_id}/${row.bc_id}`,
    bcId: row.bc_id,
    projectId: row.project_id,
    title: row.title,
    url: row.bc_app_url || null,
    list: row.todolist_name || null,
    dueOn: row.due_on || null,
    daysOverdue: late,
    band: band.key,
    category: row.category || null,
    urgency: row.urgency_score == null ? null : Number(row.urgency_score),
    disposition: disposition.key,
    dispositionReason: disposition.reason,
    // The parsed brief. Nulls are kept rather than dropped, so a session can tell "the ticket does
    // not say" from "nobody looked".
    owner: brief.owner,
    decideBy: brief.decideBy,
    summary: brief.summary,
    why: brief.why,
    sourceOfTruth: brief.sourceOfTruth,
    artifactFolder: brief.artifactFolder,
    doneWhen: brief.doneWhen,
    requiredSkill: brief.requiredSkill,
    skill: brief.skill,
    humanOnly: Boolean(brief.humanOnly),
    blockedBy: brief.blockedBy,
    parsedFields: brief.found,
  };
}

/**
 * The text block a session is handed. Plain text on purpose: it survives copy and paste out of a
 * browser, out of an email, and into a terminal without carrying markup with it.
 */
function renderWorkOrderText(wo) {
  const L = [];
  L.push(`TICKET ${wo.id}  ${wo.title}`);
  if (wo.url) L.push(`  url          ${wo.url}`);
  L.push(`  due          ${wo.dueOn || 'no date'}`
    + (wo.daysOverdue != null && wo.daysOverdue > 0 ? `  (${wo.daysOverdue}d overdue, ${wo.band})` : `  (${wo.band})`));
  if (wo.decideBy) L.push(`  decide by    ${wo.decideBy}   <- the ticket's own deadline, not the cohort due date`);
  if (wo.owner) L.push(`  owner        ${wo.owner}`);
  if (wo.list) L.push(`  list         ${wo.list}`);
  L.push(`  proposal     ${DISPOSITION_LABEL[wo.disposition]} - ${wo.dispositionReason}`);
  // The ticket often names the skill to work it with. Passing that through is the difference
  // between a session choosing an approach and a session being told the house one.
  if (wo.skill) L.push(`  start with   ${wo.skill}   (named by the ticket)`);
  else if (wo.requiredSkill) L.push(`  skill note   ${wo.requiredSkill}`);
  if (wo.sourceOfTruth) L.push(`  read first   ${wo.sourceOfTruth}`);
  if (wo.artifactFolder) L.push(`  artifact to  ${wo.artifactFolder}`);
  L.push(`  done when    ${wo.doneWhen || 'NOT STATED in the ticket - establish it before working, or ask'}`);
  if (wo.blockedBy) L.push(`  blocked by   ${wo.blockedBy}`);
  if (wo.summary) L.push(`  brief        ${wo.summary.replace(/\s+/g, ' ')}`);
  return L.join('\n');
}

/**
 * The one line Ali pastes. Everything a session needs is addressable from the run id, so the
 * paste is short enough to live at the TOP of an email rather than the bottom of a report.
 */
function runCommand(runId, opts = {}) {
  const n = opts.top || 5;
  return `/ata-work ${runId} --top ${n}`;
}

module.exports = {
  buildWorkOrder, renderWorkOrderText, proposeDisposition, runCommand, DISPOSITION_LABEL,
};
