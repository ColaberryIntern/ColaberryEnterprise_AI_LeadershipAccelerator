/**
 * C0.11 - stop a collection that would take money past a settlement already granted.
 *
 * ## Everything here was read from the live systems on 2026-10-30
 *
 * PaySimple was read against the LIVE environment (PAYSIMPLE_ENV=live), not the sandbox,
 * and the reads are GETs. CCPP was read with SELECTs. Nothing in this file is inherited
 * from the ticket text: the ticket said the next draft is 2 November and the settlement
 * is $12,000, and both were re-derived from the systems rather than quoted.
 *
 * ## The one thing this file does NOT assert
 *
 * That a settlement was *granted* at $12,000. What is verified is that exactly $12,000
 * was collected and that the contract is closed as Paid Off Early, which is strong
 * corroboration and is not the same fact. Whether somebody agreed to $12,000 is a human
 * fact living in a conversation, and it is the single thing the ticket reserves to Ali.
 * The document says so rather than letting the arithmetic imply it.
 */

const OBSERVED = '2026-10-30';

const PS_SRC = 'live PaySimple GETs, PAYSIMPLE_ENV=live, ' + OBSERVED;
const CCPP_SRC = 'CCPP read-only SELECTs, ' + OBSERVED;

/** The schedule the ticket names, read verbatim. */
const SCHEDULE = {
  id: 4319082,
  customerId: 36847444,
  customer: 'FIKRU CHEKLIE',
  status: 'Active',
  amount: 1000,
  startDate: '2025-12-02',
  endDate: '2026-11-17',
  nextDraft: '2026-11-02',
  frequency: 'the 2nd of each month',
  lastPaymentMade: '2026-10-02',
  src: PS_SRC,
};

/** The contract, from CCPP. */
const CONTRACT = {
  smicId: 1596,
  name: 'FIKRU CHEKLIE',
  userId: 44557,
  status: 11,
  statusName: 'Paid Off Early',
  statusGroup: 'Completed',
  payEndDate: '2026-11-17',
  src: CCPP_SRC,
};

/**
 * Every payment on record for this customer, oldest first.
 *
 * Both schedules are here on purpose. The settlement was collected across two of them -
 * $3,000 on a 2024 schedule and $9,000 on the current one - so a reconciliation that
 * looked only at schedule 4319082 would find $9,000, conclude $3,000 was still owed, and
 * get the answer exactly backwards.
 */
const PAYMENTS = [
  { date: '2024-05-12', amount: 1000, status: 'Settled', schedule: 3823320 },
  { date: '2024-06-12', amount: 1000, status: 'Settled', schedule: 3823320 },
  { date: '2024-07-12', amount: 1000, status: 'Settled', schedule: 3823320 },
  { date: '2025-12-02', amount: 1000, status: 'Settled', schedule: 4319082 },
  { date: '2026-01-02', amount: 1000, status: 'Settled', schedule: 4319082 },
  { date: '2026-02-02', amount: 1000, status: 'Settled', schedule: 4319082 },
  { date: '2026-03-02', amount: 1000, status: 'Settled', schedule: 4319082 },
  { date: '2026-04-02', amount: 1000, status: 'Settled', schedule: 4319082 },
  { date: '2026-05-02', amount: 1000, status: 'Settled', schedule: 4319082 },
  { date: '2026-06-02', amount: 1000, status: 'Settled', schedule: 4319082 },
  { date: '2026-07-02', amount: 1000, status: 'Settled', schedule: 4319082 },
  { date: '2026-08-02', amount: 1000, status: 'Settled', schedule: 4319082 },
  { date: '2026-10-02', amount: 1000, status: 'ReverseNSF', schedule: 4319082 },
];

/** A payment that was taken and given back is not collection. */
const KEPT = /^(Settled|Posted|Paid)$/i;

const SETTLEMENT = 12000;

/**
 * The sweep, as the ticket's third criterion asks for.
 *
 * `naiveActive` is the count the obvious query returns - status 11 AND CCPP's
 * PS_IsActive = 1 - and it is recorded because the headline methodological finding is
 * that it is wrong in both directions at once.
 */
const SWEEP = {
  statusElevenContracts: 26,
  withPaySimpleCustomer: 15,
  naiveActive: 15,
  naiveActiveWithNoPaySimpleCustomer: 10,
  liveSchedulesFound: 1,
  liveScheduleOwners: ['FIKRU CHEKLIE'],
  checkedAgainstPaySimple: 15,
  src: PS_SRC + '; ' + CCPP_SRC,
};

/**
 * Why CCPP's flag could not be used as the screen.
 *
 * This is the part worth keeping. The ticket asks for "any other status-11 contract with
 * a live schedule", and the natural way to answer it is one SQL query. That query returns
 * fifteen rows, ten of which have no PaySimple customer at all, and it does NOT return
 * Fikru Cheklie - the only contract that actually has a live schedule, and the reason the
 * ticket exists. A clean-looking answer would have been exactly wrong.
 */
const METHOD = {
  flag: 'PS_IsActive on vw_ADF_Student_Marketing_SalesRepsCommSystem',
  falseNegative: 'Fikru Cheklie’s row has PS_IsActive = null while schedule 4319082 '
    + 'is Active in PaySimple. The one true positive is invisible to the flag.',
  falsePositives: 'Ten of the fifteen rows the flag marks active have PS_CustomerID = 0 '
    + 'and therefore cannot have a PaySimple schedule at all. Of the five that do have a '
    + 'customer id, PaySimple reports zero active schedules for every one.',
  conclusion: 'CCPP’s flag is a stale cache, not a statement about PaySimple. Every '
    + 'status-11 contract carrying a real customer id was therefore checked against '
    + 'PaySimple directly, whatever CCPP said about it.',
};

/**
 * The action. `suspendedOn` stays null until it has actually happened and been read back
 * - the artifact must never report an action it only prepared.
 */
const ACTION = {
  command: "ssh root@95.216.199.47 'docker exec -e COMMIT=1 accelerator-backend "
    + "node /tmp/c011Suspend.js'",
  dryRunClean: true,
  suspendedOn: null,
  reversible: 'PaySimple can resume a suspended schedule, so running this wrongly is '
    + 'recoverable. Not running it is not: the draft fires on 2026-11-02.',
  preconditions: [
    'PaySimple environment is live, or it refuses',
    'Schedule 4319082 is still Active and still belongs to customer 36847444',
    'Payments that stayed still total exactly $12,000',
    'Contract 1596 is still status 11',
    'Already suspended means do nothing and say so',
  ],
  confirmedBack: 'The suspend endpoint answers 200 with an empty body, so the script '
    + 're-reads the schedule and fails loudly if the status is not Suspended.',
};

/** What Ali, and only Ali, can settle. */
const FOR_ALI = {
  question: 'Was the settlement granted at $12,000?',
  whyNotMine: 'The payments prove $12,000 was collected and CCPP proves the contract was '
    + 'closed as Paid Off Early. Neither proves somebody agreed to $12,000. If the real '
    + 'figure were higher and the contract was closed in error, suspending would stop '
    + 'collection that was owed.',
  deadline: '2026-11-02',
};

module.exports = {
  OBSERVED, PS_SRC, CCPP_SRC, SCHEDULE, CONTRACT, PAYMENTS, KEPT, SETTLEMENT,
  SWEEP, METHOD, ACTION, FOR_ALI,
};
