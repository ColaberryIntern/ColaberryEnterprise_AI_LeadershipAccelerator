/**
 * Acceptance criteria for the 60 agent-domain RESEARCH stories (releases r0 and r1).
 *
 * WHY THESE ARE AUTHORED HERE AND THE RELEASE-2 ONES ARE NOT.
 * The 443 release-2 stories already carried a criterion written by a human into the
 * capability record; `backfillDomainStoryAcceptance.js` migrates that text and invents
 * nothing. These 60 carry none anywhere, so theirs had to be written, and that is an
 * authoring decision rather than a migration. Keeping the two in separate files, with
 * separate runners, keeps that distinction visible instead of burying a judgement call
 * inside a data move.
 *
 * THEY ARE NOT INVENTED FROM NOTHING. Each story's own narrative already states its
 * checkable demands. RESEARCH-1's brief says "State explicitly which class this domain does
 * NOT need" and "A comparison that does not change depending on that number has not been
 * applied". The criteria below make those demands explicit in the field the verifier reads;
 * they do not add a standard the intern was never told about. That constraint is what makes
 * them fair to grade against, and any future edit should hold to it.
 *
 * TWO OF THEM DELIBERATELY ECHO THE PLATFORM'S OWN RULES, so interns are held to the
 * standard the platform holds itself to:
 *   - "evidence other than the task being marked done" is `BUILD_VERIFICATION_CONTRACT.md`'s
 *     refusal of a story marked complete as its own proof.
 *   - the replayability criterion is the root CLAUDE.md idempotency rule.
 *
 * There are exactly 6 families across 10 domains, which is 60 stories. Measured, not assumed.
 */

/**
 * Criteria keyed by story family (the story_id with its `<domain>.` prefix removed).
 * Frozen because these are graded against live work; a caller must not mutate them.
 */
const RESEARCH_ACCEPTANCE = Object.freeze({
  'RESEARCH-1-SYSTEM-CLASSES': Object.freeze([
    'The document compares all five system classes (chatbot, fixed workflow, tool-using agent, agentic system, multi-agent system) and names which one this domain needs.',
    "The choice cites this domain's own capability count and its human-reserved count, so the argument would change if those numbers changed.",
    'The document states explicitly which class this domain does NOT need, and what would have to change to justify the next class up.',
  ]),

  'RESEARCH-2-AGENT-ANATOMY': Object.freeze([
    'All nine anatomy elements are addressed, with none left blank and none dismissed as not applicable without a stated reason.',
    'Each element names the concrete platform surface, tool or record it maps to, rather than describing the element in general terms.',
    'Any element that cannot be filled is recorded as a gap with what is missing, rather than omitted.',
  ]),

  'RESEARCH-3-ROLE-AND-DA-TRANSITION': Object.freeze([
    'The document names the accountable human for this domain and the specific responsibilities proposed to transition to the agent.',
    'Each transitioning responsibility states what evidence would show the agent is ready to hold it.',
    'Responsibilities that must stay human are listed separately, each with the reason it is reserved.',
  ]),

  'RESEARCH-4-MANAGER-INTERVIEW': Object.freeze([
    'The interview plan fits 30 minutes, and every question is specific to this domain rather than reusable for any agent.',
    'A weekly check-in is proposed with a named day, a duration, and the three things it reviews.',
    'The plan states what to do with each answer, so a completed interview changes the build rather than only recording opinions.',
  ]),

  'RESEARCH-5-THREE-PROPOSED-TASKS': Object.freeze([
    'Exactly three agent tasks are proposed, each with its boundary stated as what the agent must NOT do.',
    'Each task names the evidence that proves it completed, and that evidence is something other than the task being marked done.',
    'Each task names the human who approves it wherever approval is required.',
  ]),

  'LEGACY-MIGRATION-PLAN': Object.freeze([
    'The plan accounts for every inherited legacy record for this domain, each one kept, merged or retired with a reason.',
    'The migration is described as replayable: running it twice leaves the same end state, with no duplicated side effects.',
    'The plan states what happens to a record the migration cannot classify, rather than assuming none exist.',
  ]),
});

/** The six families, in the order an intern meets them. */
const RESEARCH_FAMILIES = Object.freeze(Object.keys(RESEARCH_ACCEPTANCE));

/**
 * The family of a story, or null when the id is not a research story.
 *
 * Research ids are `<domain>.<FAMILY>`. Release-2 ids are `<domain>.CAP.<capability>`, which
 * carry no entry here and so return null: this module must never answer for a story whose
 * criteria were authored elsewhere.
 *
 * @param {string} storyId
 * @returns {string|null}
 */
function familyOf(storyId) {
  if (typeof storyId !== 'string') return null;
  const dot = storyId.indexOf('.');
  if (dot < 0) return null;
  const family = storyId.slice(dot + 1);
  return Object.prototype.hasOwnProperty.call(RESEARCH_ACCEPTANCE, family) ? family : null;
}

/**
 * The criteria for a story, or null if this module does not own it.
 *
 * Returns a fresh array so a caller cannot reach the frozen source through it.
 *
 * @param {string} storyId
 * @returns {string[]|null}
 */
function acceptanceFor(storyId) {
  const family = familyOf(storyId);
  return family ? [...RESEARCH_ACCEPTANCE[family]] : null;
}

module.exports = {
  RESEARCH_ACCEPTANCE, RESEARCH_FAMILIES, familyOf, acceptanceFor,
};
