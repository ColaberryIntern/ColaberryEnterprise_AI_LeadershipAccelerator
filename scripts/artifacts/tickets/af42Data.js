/**
 * AF4.2's facts: the change-request flow, and the single line in the diff that decided whether
 * its central guard worked in production or only in the tests.
 *
 * Data only, no rendering. Taken from the merged PRs #3472 and #3480 and from the ticket's own
 * acceptance wording; nothing here is estimated.
 */
const TICKET = 'AF4.2';
const PR = 3472;
const FOLLOW_UP_PR = 3480;
const MERGED_ON = '2026-10-29';

/**
 * THE HEADLINE. The identity columns began as `*_identity_id` holding an `org_members` UUID,
 * copied from an existing change-request row shape. The gate judges the stored identity with
 * `isNonHumanIdentity`, whose denylist matches strings like `system:auto_approve_timeout` -- and
 * a UUID passes that denylist unconditionally.
 *
 * So the guard this entire ticket exists for would have been DECORATIVE IN PRODUCTION while every
 * test stayed green, because tests supply emails and production would have supplied a UUID.
 */
const HEADLINE = {
  wrong: 'requested_by_identity_id / approved_by_identity_id, holding an org_members UUID',
  right: 'requested_by_identity / approved_by_identity, holding an EMAIL',
  why: 'The gate judges the stored identity with isNonHumanIdentity, whose denylist matches '
    + 'strings like system:auto_approve_timeout. A UUID passes that denylist unconditionally, so '
    + 'the guard would have been decorative in production while all 120 tests stayed green -- '
    + 'because tests supply emails.',
  bonus: 'It also makes the acceptance criterion literally true: "names the approving human" is '
    + 'satisfied by a value a person can read, where a UUID names nobody without a join.',
};

/** Why the existing approval table could not hold a change request. A DDL fact, not a preference. */
const STORAGE = {
  cannot: 'approval_requests has exactly ONE identity column, decided_by, and no proposed_by, '
    + 'requested_by, created_by or submitted_by of any kind. Acceptance criterion 1 is "a CR '
    + 'records a named proposer", so that criterion is literally unstorable there.',
  history: 'All 106 rows in approval_requests were written by a four-hour auto-approve timer: '
    + 'decided_by has ONE distinct value across every row. No human has ever decided an approval '
    + 'request in this system, so the table existing was never evidence that approval works.',
  reused: 'What IS reused is the part that matters: isNonHumanIdentity, humanityCheck and norm '
    + 'are IMPORTED from promotionIdentity.ts rather than restated, and a test asserts the '
    + 'IMPORT rather than the behavior -- because a behavioral test cannot tell an import from a '
    + 'faithful copy that will later drift.',
};

/** Two gates, because a denylist cannot establish humanity. Both measured, not assumed. */
const GATES = [
  {
    gate: 'Denylist',
    does: 'rejects the known non-human identities',
    cannot: 'establish that anything else IS human. Measured: isNonHumanIdentity("unknown") is '
      + 'FALSE, and isNonHumanIdentity("auto-approval") is FALSE -- one letter off the real '
      + 'production identity.',
  },
  {
    gate: 'Allowlist',
    does: 'the approver must appear in admin_users OR org_members',
    cannot: 'be skipped. Both rosters, because interns live in one and Ali in the other: '
      + 'checking only org_members would have made approval impossible for the person the ticket '
      + 'names as the approver. An absent or empty roster is a REFUSAL, never a pass.',
  },
];

const ACTOR = 'approvalRequestController.ts writes req.admin?.email || "unknown" into decided_by, '
  + 'and since isNonHumanIdentity("unknown") is false, that row claims a human decided something '
  + 'nobody did -- permanently and undetectably. This service throws ActorNotResolvedError '
  + 'instead, and a test asserts the string "unknown" is never written.';

/** The four routes. One page, two audiences, and the API decides which one you are. */
const ROUTES = [
  ['POST /api/admin/agent-domain-change-requests-mine', "requireSection('dashboard')", 'intern files'],
  ['GET /api/admin/agent-domain-change-requests-mine', "requireSection('dashboard')", 'intern sees own'],
  ['GET /api/admin/agent-domain-change-requests', 'requireAdmin', 'the queue'],
  ['POST /api/admin/agent-domain-change-requests/:id/decide', 'requireAdmin', 'Ali decides'],
];

/** What it was broken with, and what happened. Each row is an attempt that was made. */
const BREAKS = [
  ['Approve as system:auto_approve_timeout', 'refused, approver_is_not_human'],
  ['Same, but also ON the roster', 'still refused. A denylist an allowlist can override is not a denylist'],
  ['The ten historical identities, "auto-approval" included', 'each refused'],
  ['Blank, null or whitespace approver', 'refused; an empty identity counts as non-human'],
  ['No roster supplied at all', 'refused. Absence is not approval'],
  ['A zero-width character to defeat self-approval', 'refused; norm() strips U+200B first'],
  ['Intern approving their own request', 'refused, self_approved'],
  ['Two decisions on one row', 'the second is refused on a re-read inside the transaction, under a row lock'],
  ['Re-deciding a decided request', 'refused; approved and declined are terminal'],
  ['Decline with no reason, approval WITH a reason', 'both refused, in both directions'],
  ['An unknown body key', '400, not a silent drop (.strict())'],
  ['SQL in the email', 'bound, never interpolated; a test asserts the payload is absent from the SQL'],
  ['A dashboard-only identity hitting decide', '403 at the route, before the service'],
];

/**
 * Mutation proof. A positive control proves a test discriminates; it does not prove a guard is
 * load-bearing. Switching each door off had to kill named tests.
 */
const MUTATION = {
  doors: 3,
  baseline: '26/26 green, and 26/26 green again after restore with the module byte-identical to HEAD',
  example: 'proposer_not_recorded: exit 1, 3 tests died',
  driverDefect: 'The mutation driver itself was wrong first. It scraped the console for a Unicode '
    + 'bullet, Windows encoding mangled it, and it printed "DECORATIVE GUARD - nothing died" for '
    + 'all three doors while the exit codes beside it said 3, 4 and 1 had failed. The tool built '
    + 'to detect a worthless guard was producing a worthless result. It now reads jest\'s JSON '
    + 'report. Recorded because it is the same defect one level up.',
};

/** Two defects this build found in EXISTING house patterns, outside its own diff. */
const FOUND_DEFECTS = [
  'err.name || err.constructor.name logs the bare Error that CLAUDE.md forbids: name is inherited '
    + 'from Error.prototype, so it is the literal string "Error" for any subclass that does not '
    + 'set this.name, and being truthy it short-circuits so the real class never gets a chance. '
    + 'Replaced here with a classify(). The same hole remains in agentDisplayNameController.ts, '
    + 'noted and NOT changed, to keep the diff honest.',
  'scripts/checkTestTypecheck.js cannot run in a worktree without backend/node_modules/typescript, '
    + 'and misreports why: it blames the heap, but HEAP_MB is its only env read and the tsc path '
    + 'is hardcoded, so raising the heap cannot help. The tell is the duration -- a one-second '
    + '"heap crash" is a missing binary.',
];

const CRITERIA = [
  {
    n: 1,
    text: 'A CR records a named proposer; a request with no proposer is refused.',
    met: true,
    evidence: 'Stored in its own table, because approval_requests has no proposer column at all. '
      + 'Mutating the proposer requirement off killed 3 named tests.',
  },
  {
    n: 2,
    text: 'The four-hour timer identity cannot approve a CR. Asserted by a test that attempts it '
      + 'and expects a refusal, with a positive control.',
    met: true,
    evidence: 'Refused as approver_is_not_human, and still refused when that identity is ALSO on '
      + 'the roster -- a denylist an allowlist can override is not a denylist. Ten historical '
      + 'identities were each attempted.',
  },
  {
    n: 3,
    text: 'An approved CR names the approving human and the timestamp, read back from the row.',
    met: true,
    evidence: 'The identity columns hold an EMAIL rather than a UUID, which is what makes "names '
      + 'the approving human" true for a reader rather than only after a join.',
  },
  {
    n: 4,
    text: 'No build is triggered automatically by an approval.',
    met: true,
    evidence: 'Proven where a trigger would actually live. The first version pointed the '
      + 'structural test at the pure gate, which proves the converse proposition; the plan '
      + 'auditor caught it and the test was moved.',
  },
  {
    n: 5,
    text: 'REVIEW STATE set to READY FOR ALI REVIEW - PR OPEN, then stop.',
    met: false,
    evidence: 'Both PRs are merged. What is left for Ali is the decision the ticket names: '
      + 'whether CRs can approve platform changes at all, or only produce a queue he triages.',
  },
];

const AUDIT = 'The plan was independently audited: FAIL 12/20 on cycle 1, PASS 18/20 on cycle 2. '
  + 'Three of the auditor\'s factual corrections changed what got built, including the one that '
  + 'moved criterion 4\'s test to where a trigger would actually live.';

const SCHEMA_NOTE = 'Merging created a table on the next backend boot: an idempotent '
  + 'ensureAgentDomainChangeRequestSchema() wired into server.ts alongside ~199 siblings. It is '
  + 'additive, CREATE TABLE IF NOT EXISTS, and referenced by nothing else. The follow-up PR '
  + `#${FOLLOW_UP_PR} fixed a schema assert that reported a missing table which was present in `
  + 'production.';

module.exports = {
  TICKET, PR, FOLLOW_UP_PR, MERGED_ON,
  HEADLINE, STORAGE, GATES, ACTOR, ROUTES, BREAKS, MUTATION, FOUND_DEFECTS, CRITERIA,
  AUDIT, SCHEMA_NOTE,
};
