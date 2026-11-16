/**
 * "06 - Owner Decisions and Blockers", triaged against the code and the database on 2026-11-16.
 *
 * The alert that prompted this called all 8 open items pressing and proposed deciding 5 of them
 * in one sitting. That sizing is read off ticket STATUS, which goes stale because nobody closes a
 * ticket when the work ships. Checked item by item, 2 are live decisions.
 */

const CHECKED_ON = '2026-11-16';

/**
 * status: 'shipped' | 'answered' | 'parked' | 'live' | 'premise'
 * Each row's `evidence` is a thing a reader can go and check, not a judgment.
 */
const ITEMS = [
  {
    code: 'AF12.5',
    status: 'shipped',
    overdueSaid: '4d overdue',
    truth: 'Closed today',
    evidence: 'PR #4089 merged, deployed, verified inside the production container. Two artifacts '
      + 'on the ticket. Closed 2026-11-16.',
  },
  {
    code: 'AF12.7',
    status: 'answered',
    overdueSaid: '4d overdue, most pressing',
    truth: 'Written answer already shipped',
    evidence: 'PR #4069 (15 Nov) added frontend/src/colaberry/PROVENANCE.md, which opens by naming '
      + 'Aleem’s question, has an Ownership section, documents all four local edits, and '
      + 'explains why a CODEOWNERS entry is not possible. You ratify, not decide cold.',
  },
  {
    code: 'AF12.4',
    status: 'shipped',
    overdueSaid: '10d overdue',
    truth: 'Code merged 11 Nov',
    evidence: 'domainBuilderAgentAccess.ts landed in PR #3925. It resolves "may this builder read '
      + 'the agent they were assigned" through the same resolver /agent-domains-mine uses. '
      + 'Needs a live check, then it closes.',
  },
  {
    code: 'AF12.6',
    status: 'premise',
    overdueSaid: '2d overdue',
    truth: 'Real, but smaller than stated',
    evidence: 'The ticket says the suite pins the failure as correct. That test sits under '
      + 'describe("the resolver measures what it claims") and uses 3.85 as a fixture to calibrate '
      + 'the contrast function. Separately studioSetup.css already uses #E5121D with the comment '
      + 'that #FB2832 fails AA at that size.',
  },
  {
    code: 'AF6.5',
    status: 'parked',
    overdueSaid: '23d overdue',
    truth: 'Parked by its own text',
    evidence: 'Ticket body opens "PARKED - NOT PART OF THE MONDAY 19 OCT INTERN ROLLOUT ... Do not '
      + 'start it while a rollout ticket is open."',
  },
  {
    code: 'AF6.6',
    status: 'parked',
    overdueSaid: '23d overdue',
    truth: 'Parked by its own text',
    evidence: 'Same banner. Both were dated after the rollout deliberately.',
  },
  {
    code: 'AF6.1',
    status: 'live',
    overdueSaid: '32d overdue',
    truth: 'Genuinely yours to decide',
    evidence: 'The 21 legacy agents that belong to no domain. Nothing has shipped against it.',
  },
  {
    code: 'AF6.3',
    status: 'live',
    overdueSaid: '31d overdue',
    truth: 'Yours, and the keystone',
    evidence: 'How a capability leaves draft. Measured today: ALL 448 capabilities are draft and '
      + 'the build-authorization table has 0 rows, so AF7.1, every Release 2, and all seven '
      + 'builder tickets due 21 Nov sit behind this one decision.',
  },
];

/** The count that corrects the alert. */
const SUMMARY = {
  listed: 8,
  claimedPressing: 8,
  claimedDecisions: 5,
  actuallyLive: 2,
  shipped: 2,
  answered: 1,
  parked: 2,
  premiseWrong: 1,
};

/** The measurements behind the AF6.3 claim, so it is checkable rather than asserted. */
const KEYSTONE = {
  capabilities: 448,
  draft: 448,
  confirmed: 0,
  authorizations: 0,
  buildersDue: 7,
  dueDate: '2026-11-21',
};

const WHY_STALE = 'The alert sizes the list off ticket status. A ticket stays open after its work '
  + 'ships because closing is a separate act, so an open row is not evidence the work is undone. '
  + 'The Agent Factory ladder reader warns about exactly this in its own header, after two '
  + 'sessions nearly started work that had shipped a week earlier.';

module.exports = { CHECKED_ON, ITEMS, SUMMARY, KEYSTONE, WHY_STALE };
