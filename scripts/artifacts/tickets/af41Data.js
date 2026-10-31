/**
 * AF4.1's facts: what the ticket asked for, what was already true before anyone worked it, and
 * the one open question its comments flagged -- now measured.
 *
 * Data only, no rendering. Two classes of number live here and they must not be blurred:
 * MEASURED values carry the date and the tool that produced them; everything else is a statement
 * about code, checkable by reading the file named beside it.
 *
 * The ticket is unusual and the artifact has to say so plainly: all three of its stated premises
 * were measured wrong, and its acceptance criterion was already met before it was worked. The
 * honest deliverable is therefore a measurement, not a diff.
 */
const TICKET = 'AF4.1';
const MEASURED_ON = '2026-10-31';
const PRIOR_MEASUREMENT = '2026-10-19';

/**
 * The ticket's own premises, against what the 19 Oct measurement actually found.
 *
 * Kept as a before/after table rather than prose because the gap IS the finding: the ticket was
 * written against a five-month-old state of the table and the work had already happened.
 */
const PREMISES = [
  {
    premise: 'github_connections holds 11 rows',
    measured: '46 rows',
    verdict: 'wrong',
  },
  {
    premise: 'the syncable count is 0',
    measured: '42 synced',
    verdict: 'wrong',
  },
  {
    premise: 'no repo has synced since 2026-05-22',
    measured: `syncs ran on ${PRIOR_MEASUREMENT}, the day of the measurement`,
    verdict: 'wrong',
  },
];

/**
 * The five acceptance criteria, verbatim in substance, each with what satisfies it.
 *
 * Criterion 5 is deliberately NOT marked met. It is a Basecamp state change on the ticket and
 * belongs to Ali; claiming it here would be the artifact grading its own homework.
 */
const CRITERIA = [
  {
    n: 1,
    text: 'One intern repo is connected and a real commit in it is visible to the platform, '
      + 'demonstrated end to end.',
    met: true,
    evidence: 'Quincy Nkwain Ninying\'s repo qninying/platform-reliability-agent is connected to '
      + `his platform domain project and synced on ${PRIOR_MEASUREMENT} at 19:25 with 8 files. `
      + 'Demonstrated, not asserted from a row count.',
  },
  {
    n: 2,
    text: 'The empty-string token behavior is either fixed or recorded as a known defect with '
      + 'its measured count.',
    met: true,
    evidence: 'Recorded, with the count. The tokens are EMPTY STRINGS rather than null, so a '
      + 'null check finds nothing and a row can exist, pass that check, and sync nothing.',
  },
  {
    n: 3,
    text: 'A null-check on the token is NOT used as the liveness test anywhere in the diff.',
    met: true,
    evidence: 'Liveness is keyed on last_sync_at in repoTree/repoTreeStaleness.ts -- did it '
      + 'actually sync -- rather than on whether a token looks present. Verified by reading the '
      + 'predicate, not assumed from the absence of a null check.',
  },
  {
    n: 4,
    text: 'No intern is granted write access to the main repository.',
    met: true,
    evidence: 'Nothing in this ticket grants repository access. Interns work in their own public '
      + 'repos under their own accounts, which is the decision Ali settled on '
      + `${PRIOR_MEASUREMENT}.`,
  },
  {
    n: 5,
    text: 'REVIEW STATE set to READY FOR ALI REVIEW, then stop.',
    met: false,
    evidence: 'Outstanding, and deliberately so. This is a state change on the ticket itself and '
      + 'belongs to Ali. The ticket also says never to auto-close it.',
  },
];

/**
 * The half the ticket's own comments flagged as never proved, and today's measurement of it.
 *
 * Quoted from the comment: "what is still not proved, and it is the half that matters for
 * scoring, is that a connected repo actually makes a story VERIFIABLE".
 */
const VERIFIABILITY = {
  question: 'Does a connected repo actually make a domain story verifiable?',
  answer: 'Yes, for every intern whose points depend on it.',
  verdict: 'GAP_DISPROVED',
  tool: 'dist/scripts/queryAgentDomainVerifiability.js',
  read: { projects: 10, enrollments: 28, wrote: 0 },
  /** Reachable from a NON-ai_staff enrollment, via enrollments.active_project_id. */
  reachable: [
    ['curriculum', 'rtkumera@gmail.com'],
    ['marketing', 'sarbjitsaini83@yahoo.com'],
    ['product_experience', 'mihretnetsereab@gmail.com'],
    ['admissions', 'kalkidankin@gmail.com'],
    ['sales', 'vesauber@gmail.com'],
    ['internship', 'tash.diah@gmail.com'],
    ['platform', 'qninying@gmail.com'],
  ],
  unassigned: ['learner_success', 'website', 'executive'],
  unassignedNote: 'All three carry intended_builder: null and intended_builder_state: unassigned '
    + 'in the registry, so no intern\'s points depend on them. The fallback path reaches exactly '
    + 'one of the three because it returns only the NEWEST adoptable row per enrollment and all '
    + 'three share one owner.',
  /** Each control is a POSITIVE assertion, because the expected answer was an absence. */
  controls: [
    ['CTL-1', 'the pointer read can see a live active_project_id', '27 of 28 sampled'],
    ['CTL-2', 'all ten derived domain rows exist', '10 of 10'],
    ['CTL-3', 'the fallback read returns a row for a matching enrollment', '28 of 28'],
    ['CTL-4', 'every domain row names its owning enrollment', '10 of 10'],
    ['CTL-5', 'the fallback read returns a NON-domain row for somebody', '20 sampled'],
  ],
  whyControls: 'The expected answer was an absence, and an absence is also what a broken query, '
    + 'an empty table or a mistyped uuid returns. Any control failing yields INCONCLUSIVE, which '
    + 'means the question was not answered -- not that the answer is no. An empty read is '
    + 'INCONCLUSIVE by test.',
};

/**
 * A static trace said the opposite, confidently, across five files. The measurement overturned it.
 * This is recorded on the artifact because the trap is reusable, not to narrate a mistake.
 */
const CORRECTION = {
  claim: 'A domain story can never be verified, because the verifier resolves the student\'s '
    + 'capstone instead.',
  basis: 'agentDomainRegistry.ts states that enrollments.active_project_id "is precisely the '
    + 'field that must stay untouched" by provisioning.',
  error: 'That describes what the PROVISIONER does. It is not a statement about the column\'s '
    + 'contents -- something else sets the pointer afterwards.',
  lesson: 'A comment describing one writer\'s restraint says nothing about a column\'s actual '
    + 'values. Query it.',
};

const ALREADY_BUILT = [
  ['The acceptance criterion', `met on ${PRIOR_MEASUREMENT} by a real connected repo and a real sync`],
  ['The own-account decision', `settled by Ali on ${PRIOR_MEASUREMENT}: repos under the student's own account`],
  ['The staleness mitigation', 'already exists as backend/src/services/repoTree/repoTreeStaleness.ts, '
    + 'with its own production measurements'],
  ['The verification half', `measured ${MEASURED_ON} and proved POSITIVE`],
];

module.exports = {
  TICKET, MEASURED_ON, PRIOR_MEASUREMENT,
  PREMISES, CRITERIA, VERIFIABILITY, CORRECTION, ALREADY_BUILT,
};
