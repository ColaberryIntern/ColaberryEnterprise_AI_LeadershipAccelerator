/**
 * The Revenue Room ladder (R12, R25, R26) — one source of truth for every artifact PDF.
 *
 * Both PDFs of every ticket read this module, so a number on a visual cannot drift from the
 * same number in its document.
 *
 * Every figure below was MEASURED, and the measurement is named beside it. The funnel counts
 * were reproduced against production with a SQL script written independently of the page code,
 * rather than read off the screen the page renders — because reading the page to verify the
 * page proves only that it is consistent with itself.
 */

const AS_OF = '25 Nov 2026';
const BUCKET = '7463955';
const url = (id) => `https://app.basecamp.com/3945211/buckets/${BUCKET}/todos/${id}`;

const TICKETS = {
  r12: {
    key: 'R12',
    id: '10472280590',
    title: 'The government pipeline behind the pipeline',
    subtitle: 'Link the orphan gov qualification rows so the second tier can be displayed',
    pr: 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4422',
    state: 'LIVE',
  },
  r25: {
    key: 'R25',
    id: '10542393348',
    title: 'The whole revenue tab, broken down by brand',
    subtitle: 'Every block of the tab answers to one brand filter',
    pr: 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4408',
    state: 'LIVE',
  },
  r27: {
    key: 'R27',
    id: '10548340320',
    title: 'One row per person, a name that opens the 360, and rates on the campaigns',
    subtitle: 'Ali, testing R26 live: group the duplicates and show what she needs to know',
    pr: 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4444',
    state: 'IN REVIEW',
  },
  r26: {
    key: 'R26',
    id: '10547700764',
    title: 'The named people behind a funnel count',
    subtitle: 'Taiwo asked to click a number and see who is in it',
    pr: 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4428',
    state: 'LIVE',
  },
};

/**
 * The membership funnel as production reports it, reproduced 25 Nov with a read-only SQL script
 * that applies the stage rules independently of `membershipFlow`.
 *
 * `overlaps` marks the stages that double-count, which is why this column does not sum to 296.
 */
const FUNNEL = [
  { label: 'Signed up', count: 296, note: 'Every subscriptions row. The widest reading of "member".' },
  { label: 'Payment failed', count: 42, overlaps: true, note: 'Also counted under Never paid.' },
  { label: 'Canceled after paying', count: 38, note: 'Really was revenue once.' },
  { label: 'Comped', count: 28, note: 'An active seat at $0.' },
  { label: 'Paying now', count: 27, note: 'Active, paid, and the term is still running.' },
  { label: 'Term ran out', count: 5, note: 'Still says active. Nobody is being billed.' },
];

/** The two ways a reader misreads this card. Both now print on the card itself. */
const TRAPS = [
  {
    trap: 'The Count column does not add up',
    why: 'The stages answer different questions and overlap. All 42 failed rows are counted '
      + 'again under "Never paid", so summing the column never reaches 296.',
    cost: 'A reader concludes the page is broken when it is correct.',
  },
  {
    trap: '"Paying now" is 27, not about 60',
    why: 'A row whose paid term ended still reads status=active, because nothing in the system '
      + 'cancels a lapse. Any screen counting active members will be roughly twice this.',
    cost: 'Counting those as revenue overstated the annual figure by $26,268 until 16 Nov.',
  },
];

/** What Taiwo asked, and what each answer turned out to be. */
const TAIWO = {
  who: 'Taiwo Oludimimu, Admissions & Support Supervisor',
  when: '25 Nov 2026, 10:01 AM CST',
  asks: [
    {
      q: 'Is this data accurate, or still being worked on?',
      a: 'Accurate. Live reads, re-verified against production independently of the page.',
      state: 'ANSWERED',
    },
    {
      q: 'Can the data points be clickable to show the students or leads in each category?',
      a: 'It did not exist anywhere. Built for all nine stages, live now.',
      state: 'BUILT',
    },
    {
      q: 'Or are they recorded and accessible elsewhere?',
      a: 'No. No admin screen lists these people by payment stage.',
      state: 'ANSWERED',
    },
  ],
};

/**
 * The one engineering constraint worth a decision-maker's attention, because it is why this
 * took a classifier refactor rather than a query.
 */
const CONSTRAINT = {
  risk: 'A count of 27 above a list of 32',
  body: 'The counts are classified in JavaScript and one row can land in several stages. '
    + 'Building the list from its own SQL query is the obvious route and the wrong one: when '
    + 'the two drift, it does not read as a bug in either. It reads as a reason to stop '
    + 'trusting the page.',
  fix: 'One classifier now feeds both the count and the list, and a test asserts they are equal '
    + 'for every stage. The panel also prints a disagreement rather than hiding one.',
};

/** Where each ticket really is on the shipping ladder. "Live" means read from the container. */
const LADDER = [
  { step: 'Built', r12: true, r25: true, r26: true, r27: true },
  { step: 'Tested', r12: true, r25: true, r26: true, r27: true },
  { step: 'CI green', r12: true, r25: true, r26: true, r27: true },
  { step: 'Merged', r12: true, r25: true, r26: true, r27: false },
  { step: 'Deployed', r12: true, r25: true, r26: true, r27: false },
  { step: 'Verified in production', r12: true, r25: true, r26: true, r27: false },
];

/** Verification totals, per ticket. Counted from the runs, not estimated. */
const EVIDENCE = {
  r12: { tests: 28, mutations: '11 of 11', gates: '10 of 10', suites: '27 suites / 547 tests' },
  r25: { tests: 50, mutations: '17 of 17', gates: '10 of 10', suites: '864 suites / 11,229 tests' },
  r26: { tests: 44, mutations: '15 of 15', gates: '10 of 10', suites: '29 suites / 580 tests' },
  r27: { tests: 44, mutations: '16 of 16', gates: '10 of 10', suites: '29 suites / 597 tests' },
};

/**
 * What is actually waiting on Ali. This is the point of the visual: three tickets are live and
 * none of them is waiting on engineering.
 */
const DECISIONS = [
  {
    key: 'A',
    title: 'Send the reply to Taiwo',
    body: 'Drafted and unsent. It tells her the counts are clickable, which became true when '
      + 'R26 deployed. She asked on 25 Nov and has not been answered yet.',
    cost: 'Every day it waits, she keeps reading a page she half trusts.',
    owner: 'Ali',
  },
  {
    key: 'B',
    title: 'The campaign brand tag: wrong data, or a real difference?',
    body: 'All four campaigns feeding membership are tagged Colaberry Enterprise, while the '
      + 'members they produce are filed under Colaberry Training. The page shows both as '
      + 'recorded with a note rather than overwriting either.',
    cost: 'If the tag is simply wrong, every brand-filtered view of demand is skewed until it '
      + 'is corrected.',
    owner: 'Ali',
  },
  {
    key: 'C',
    title: 'Nobody has ever used the gov opportunity linking screen',
    body: 'linkGovOpportunity is live and reachable, records who linked a bid and why, and has '
      + 'zero rows. Three approved-for-pursuit bids carry no delivery project because of it.',
    cost: 'Those three cannot be named or priced on the board until a human links them.',
    owner: 'Ali or Ram',
  },
];

/** Stated plainly on every document, because an artifact that only claims success is a brochure. */
const NOT_ESTABLISHED = [
  'Nobody has clicked the new control in a browser. The code is proved present in the served '
  + 'bundle and the route is proved registered in the running container; the interaction itself '
  + 'is covered by server-rendered tests, not by a human or by Playwright.',
  'The government and enterprise funnels have different shapes and get no per-stage roster. '
  + 'Only membership does.',
  'Per-person payment status is now visible to anyone with admin access. That was Ali\'s '
  + 'decision on 25 Nov, not a side effect, but it is a change in who can see what.',
  'R12 established that the assessment-stage rows are pre-project by design. It did not link '
  + 'any of them, and the three approved bids with no project are still unlinked.',
];

module.exports = {
  AS_OF, BUCKET, url, TICKETS, FUNNEL, TRAPS, TAIWO, CONSTRAINT, LADDER, EVIDENCE,
  DECISIONS, NOT_ESTABLISHED,
};
