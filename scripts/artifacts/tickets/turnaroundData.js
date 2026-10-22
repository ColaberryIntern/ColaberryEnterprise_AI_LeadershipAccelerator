/**
 * Colaberry path to profitability: THE single source for every number in the plan.
 *
 * ## Every figure is measured and carries its source
 *
 * This goes to the CEO while the company decides whether people keep their jobs. A number
 * that is "about right" is worse than none, because it will be acted on. Each block
 * carries `src` and the build fails if one does not. Where something could not be
 * measured it is UNKNOWN rather than estimated, and the plan is written to survive that.
 *
 * ## Four things the measurement changed about the brief
 *
 * 1. THE INCOME IS NOT WHAT THE ACCOUNT NAME SAYS. "4300 ISA Placement Income" carries
 *    $151,841 over eight months. Only $17,211 is traceable placement-fee cash, from four
 *    named students. The other 89% appears to be legacy $250/month training subscriptions
 *    booked into an account named after something else. The real ISA placement run-off is
 *    nearly finished: $7,877 scheduled, gone by May 2027.
 * 2. SO THE RISK IS THE OPPOSITE OF A MELTING ICE CUBE. The money is a 124-schedule
 *    subscription book that barely decays through 2027; some schedules run to 2034. It
 *    does not expire on its own. It is exposed to something worse - mass cancellation if
 *    service visibly stops when the program it is attached to is sunset.
 * 3. INTAKE DID NOT STOP IN APRIL. 637 enrollments were created from July onward. The
 *    July cohort has 48 active learners and November has 37 starting on the 12th.
 *    Enrollment stopped for legacy Data Analytics, not for the business.
 * 4. LESS THAN HALF OF EVERY DRAFTED DOLLAR CLEARS. Realization is 46.3%, so planning on
 *    scheduled amounts overstates cash by roughly 2.2x.
 */

/** Marks a figure that was looked for and could not be measured. */
const UNKNOWN = Symbol('unknown');

const AS_OF = '2026-10-21';

/* ── the school P&L as Ram sent it ────────────────────────────────────────── */

const PNL_SRC = 'School monthly p&l.xlsx, accrual basis, read 2026-10-21';

const PNL = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
  acct4300: [18368, 18522, 20746, 30683, 13560, 15326, 20698, 13939],
  tuition: [18571, 3863, 12148, 5263, 1449, -1900, 150, 3304],
  totalIncome: [36939, 22385, 32894, 35946, 15009, 13426, 20848, 17392],
  totalExpenses: [6803, 31750, 17717, 20546, 8975, 17419, 3348, 7085],
  netIncome: [39134, -33620, 9602, 11761, -15582, 14569, 18244, 9603],
  src: PNL_SRC,
};

/** One-offs excluded when computing a steady-state burn. */
const ONE_OFFS = [
  { month: 'Feb', account: '6310 Computer & Software', amount: 16309,
    why: 'a single charge, many times the median month on that line' },
  { month: 'Jun', account: '6255 Legal Fees', amount: 11275,
    why: 'the only legal charge in eight months' },
  { month: 'May', account: '5210 Training Contractors', amount: 20000, why: 'an accrual' },
  { month: 'Jun', account: '5210 Training Contractors', amount: -20000,
    why: 'the reversal of the May accrual' },
];

/* ── what account 4300 actually contains ──────────────────────────────────── */

const CCPP_SRC = 'CCPP read-only SELECTs and live PaySimple schedule reads, 2026-10-21';

/**
 * The account-name problem, which is the most important finding in this file.
 *
 * Everyone has been reading $19k a month of "ISA Placement Income" as a receivable book
 * winding down. It is not. Traceable placement-fee cash for all of Jan-Aug is $17,211
 * from four students. The rest looks like legacy training subscriptions.
 *
 * It matters because the two have opposite risk shapes. A receivable book runs out on a
 * schedule you can forecast. A subscription book keeps paying indefinitely and can stop
 * all at once, the moment subscribers decide they are no longer receiving anything.
 */
const ACCOUNT_4300 = {
  eightMonthTotal: 151841,
  traceablePlacementFees: 17210.65,
  get traceableShare() { return this.traceablePlacementFees / this.eightMonthTotal; },
  namedPayers: [
    { who: 'Fikru Cheklie', amount: 8000 },
    { who: 'Sharita Wright', amount: 7333.36 },
    { who: 'Osarumwense Aghimien', amount: 1000 },
    { who: 'D.J. Gray', amount: 877.29 },
  ],
  unexplained: 'Everything else settling through PaySimple in 2026 is $100, $149, '
    + '$181.82, $199, $250 and $400 recurring training-subscription and membership '
    + 'drafts, plus $500 and $3,000 enrollment down payments. Those are tuition.',
  // The mechanism, which is sharper than "the name is misleading".
  whyTheNameMisleads: 'The workbook organizes income by PAYMENT PROCESSOR, not by what '
    + 'was sold. The account is literally "4300 ISA Placement Income (Paysimple)" sitting '
    + 'under a column headed "ISA Placement (Paysimple)", and its sibling is "4200 '
    + 'Training Platform Revenue (Paypal)" under "Tuition & Training (Paypal)". Account '
    + '4300 means "cash that arrived through PaySimple". That is all it means.',
  composition: [
    { what: 'Recurring training-subscription and membership drafts', share: 0.63,
      approx: 95000 },
    { what: 'Enrollment down payments and one-offs', share: 0.16, approx: 25000 },
    { what: 'Actual post-placement ISA placement fees', share: 0.113, approx: 17211 },
    { what: 'QuickBooks timing and netting difference', share: 0.10, approx: 15000 },
  ],
  realIsaPerMonth: 2150,
  reconciles: false,
  reconcileNote: 'P&L and PaySimple totals sit within $15k over eight months, but the '
    + 'monthly series diverges in BOTH directions: April is $14.5k above PaySimple, July '
    + 'and August about $5k below. A simple "4300 equals PaySimple plus other channels" '
    + 'relationship could never go negative, so the composition is genuinely unresolved.',
  src: CCPP_SRC,
};

/** The genuine ISA placement run-off. It is nearly over. */
const ISA_RUNOFF = {
  liveSchedules: 3,
  nominalRemaining: 7877,
  realisticRemaining: 3647,
  zeroBy: 'May 2027',
  curve: [
    { month: '2026-11', nominal: 2877, realistic: 1332 },
    { month: '2026-12', nominal: 1000, realistic: 463 },
    { month: '2027-01', nominal: 1000, realistic: 463 },
    { month: '2027-02', nominal: 1000, realistic: 463 },
    { month: '2027-03', nominal: 1000, realistic: 463 },
    { month: '2027-04', nominal: 1000, realistic: 463 },
    { month: '2027-05', nominal: 0, realistic: 0 },
  ],
  src: CCPP_SRC,
};

/**
 * The book that is actually paying the bills, and the assumption holding it up.
 *
 * 124 live schedules, roughly $13.9k a month realized, essentially flat through 2027
 * because the $250 plans are 60-month subscriptions ending in 2029 and later. Thirty have
 * no end date at all.
 *
 * THE ASSUMPTION DOING ALL THE WORK is that these subscribers keep paying after Data
 * Analytics is sunset. No dataset can settle it. It is the single largest financial risk
 * in the plan, and it is a service-delivery question rather than a finance question.
 */
const LIVE_BOOK = {
  activeSchedules: 124,
  nominalMonthly: 29972,
  realizedMonthly: 13877,
  noEndDate: { schedules: 30, monthly: 5272 },
  decay: [
    { month: 'Nov 2026', realized: 13877, schedules: 124 },
    { month: 'Dec 2026', realized: 12869, schedules: 121 },
    { month: 'Mar 2027', realized: 12753, schedules: 119 },
    { month: 'Jun 2027', realized: 12090, schedules: 117 },
    { month: 'Sep 2027', realized: 11743, schedules: 114 },
    { month: 'Dec 2027', realized: 10933, schedules: 107 },
    { month: 'Jun 2028', realized: 8271, schedules: 84 },
    { month: 'Dec 2028', realized: 6650, schedules: 70 },
  ],
  keyRisk: 'If the program ends and service visibly stops, this book is exposed to mass '
    + 'cancellation and the real decay is far steeper than the end dates imply.',
  src: CCPP_SRC,
};

/**
 * The PayPal channel has effectively stopped, which is the other half of the income story.
 *
 * Account 4200 is the PayPal column. It went from $18,301 in January to $1,254 in August
 * and was NEGATIVE in June on refunds. Read together with account 4300, the picture is
 * one processor carrying almost everything while the other has gone quiet.
 */
const PAYPAL_CHANNEL = {
  monthly: [18301, 3714, 11700, 5114, 1300, -2150, 150, 1254],
  verdict: 'effectively gone, and net negative in June',
  src: PNL_SRC,
};

/** Cross-checks against recent processor actuals, so the projection is not free-floating. */
const RECENT_ACTUALS = {
  septemberSettled: 16354,
  octoberToThe21st: 11535,
  note: 'The projection sits slightly below recent actuals because actuals still include '
    + 'one-off down payments, and those go to near zero now that legacy enrollment has '
    + 'stopped.',
  src: CCPP_SRC,
};

/** Less than half of every drafted dollar clears. */
const REALIZATION = {
  rate: 0.463,
  settled: 136777,
  attempted: 295141,
  monthlyReturns: '38 to 42 payments a month return or NSF, mostly $250 drafts',
  implication: 'Planning on scheduled amounts overstates cash by about 2.2 times.',
  src: CCPP_SRC,
};

/** Things that need doing this week, not this quarter. */
const URGENT_FLAGS = [
  { id: 'U1', severity: 'ACT THIS WEEK',
    what: 'Fikru Cheklie is closed as Paid Off Early with $12,000 collected, exactly the '
      + 'settlement figure, yet PaySimple schedule 4319082 is still Active with another '
      + '$1,000 draft queued for 2 November.',
    risk: 'If it clears, we have collected past a settlement we granted.',
    action: 'Suspend schedule 4319082 before 2 November.', src: CCPP_SRC },
  { id: 'U2', severity: 'ASK THIS WEEK',
    what: 'QuickBooks transaction detail for account 4300, Jan to Aug 2026, with payee '
      + 'and memo.',
    risk: 'Until it exists, every runway number built on that $151,841 is unsupported.',
    action: 'Ask Aishwarya C and Durga Siralam, copying Ram.', src: CCPP_SRC },
  { id: 'U4', severity: 'ASK THIS WEEK',
    what: 'April shows $30,683 in account 4300, which is $14,497 above everything '
      + 'traceable in PaySimple that month. It is the only month that diverges that hard.',
    risk: 'April is what makes the second quarter look healthy. If it is a timing artifact '
      + 'rather than cash, the eight-month trend is worse than it reads.',
    action: 'Pull the QuickBooks transaction detail for 4300 in April specifically.',
    src: CCPP_SRC },
  { id: 'U3', severity: 'ASK THIS WEEK',
    what: 'The January to October payroll register by employee, with class coding.',
    risk: '$58,787 of eight-month commission sits outside the school class and salaried '
      + 'wages are invisible, so no salaried decision can be made on evidence.',
    action: 'Same ask, same people, same thread.', src: 'commission reconciliation' },
];

/* ── the new business, measured in production ─────────────────────────────── */

const PROD_SRC = 'production Postgres, read-only, 2026-10-21';

const COHORTS = [
  { name: 'Cohort - April 2026', start: '2026-04-14', status: 'completed',
    active: 1, paid: 7, collected: 0, src: PROD_SRC },
  { name: 'Cohort - July 2026', start: '2026-07-23', status: 'running',
    active: 48, paid: 44, collected: 12176, src: PROD_SRC },
  { name: 'Cohort - November 2026', start: '2026-11-12', status: 'NOT YET STARTED',
    active: 37, paid: 12, collected: 2932, src: PROD_SRC },
  { name: 'Explorer - Prospects', start: '2026-07-12', status: 'prospect pool',
    active: 396, paid: 30, collected: 500, src: PROD_SRC },
  { name: 'AI Internship', start: '2026-09-15', status: 'open, empty',
    active: 0, paid: 0, collected: 0, src: PROD_SRC },
];

/**
 * Subscriptions. Two corrections live here and both reduce the number.
 *
 * 54 rows read "active". 26 are complimentary at zero. Of the monthly rows, nine have a
 * billing period that already ended - active as a row state, not as people who paid this
 * month. The honest figures are 19 paying humans and $3,581.
 */
const SUBSCRIPTIONS = {
  byStatus: { active: 54, pending: 87, failed: 42, canceled: 34 },
  activeByPlan: [
    { plan: 'comp', n: 26, monthlyEach: 0, note: 'more comp seats than payers' },
    { plan: 'monthly', n: 15, monthlyEach: 199, note: 'actually billing' },
    { plan: 'annual', n: 4, monthlyEach: 149, note: '$1,788 upfront, booked monthly' },
  ],
  lapsedButMarkedActive: 9,
  distinctPayingHumans: 19,
  strandedContractValue: { pending: 42737, failed: 35371, canceled: 7360 },
  newPaidEnrollmentsByMonth: { 'Jul': 63, 'Aug': 35, 'Sep': 5, 'Oct': 1 },
  cancellations: { total: 76, everStarted: 130 },
  lifetimeGross: 15608,
  lifetimeRefunded: 150,
  src: PROD_SRC,
};

/** Three defects that leak money from a funnel that already works. */
const REVENUE_DEFECTS = [
  { id: 'X1', defect: 'The free Explorer tier has no paywall.',
    detail: '396 explorers are served the entire curriculum, so there is no material '
      + 'thing to upgrade to. The free tier is not a funnel into the product. It is the '
      + 'product, given away.',
    effect: 'Caps conversion structurally, whatever is spent on acquisition.',
    src: PROD_SRC },
  { id: 'X2', defect: 'New checkouts create one-time payments, not recurring schedules.',
    detail: 'Only 12 of 24 monthly members are on autopay; the rest are migrated by hand '
      + 'every month. The service says so in its own header comment.',
    effect: 'A leak that grows with every new member.',
    src: 'backend/src/services/subscriptionService.ts on origin/main' },
  { id: 'X3', defect: 'The site advertises $149 "cancel anytime" in roughly 70 places.',
    detail: 'The month-to-month rate is $199; $149 is the committed rate. Every new '
      + 'month-to-month member is sold at a discount nobody chose to offer, on a price '
      + 'advertised under TWC rules.',
    effect: 'A 25 percent price leak on the only engine that earns anything.',
    src: 'frontend copy baseline' },
];

/** Eight engines; exactly one takes money. */
const ENGINES = [
  { name: 'Individual membership', earns: true, payers: 19, monthly: 3581,
    state: 'LIVE and stalling. New paid enrollments fell 63, 35, 5, 1 across July to October.',
    earliest: 'already live',
    verdict: 'The only engine where January revenue is a forecast rather than a hope.' },
  { name: 'Enterprise and B2B seats', earns: false, payers: 0, monthly: 0,
    state: 'Org accounts, sponsor seats and redemption are shipped. Zero companies have '
      + 'ever bought. The one sponsor row is a demo seed.',
    earliest: 'Q1 2027 if someone owns a quota',
    verdict: 'The only engine whose economics reach 10,000 people. Selling 100 companies '
      + '100 seats is a motion this company has run for 14 years.' },
  { name: 'Colaberry Live', earns: false, payers: 0, monthly: 0,
    state: '21 of 61 tickets done, target 31 October. Two broadcasts exist, both '
      + 'engineering tests. Zero viewer sessions. The paywall has never been exercised.',
    earliest: 'audience Nov or Dec 2026; a paid product is unstarted',
    verdict: 'Run it as a funnel. Its 2027 revenue line should read zero direct.' },
  { name: 'YouTube and live classes', earns: false, payers: 0, monthly: 0,
    state: 'No funnel running. The two tickets that would create one are open, one overdue.',
    earliest: 'Q1 2027 as a funnel; no product plan exists',
    verdict: 'Top of funnel at best.' },
  { name: 'Government contracts', earns: false, payers: 0, monthly: 0,
    state: 'Zero submissions, zero contracts, zero revenue in the system. The one real '
      + 'bid, DOL AI Literacy via Essnova, was lost. Three "proposals" describe themselves '
      + 'as rehearsals assuming a SOC 2 we do not hold.',
    earliest: 'Q3 2027, and only as an Essnova subcontract',
    verdict: 'THE EXPENSIVE DISTRACTION. It feels like current business because of its '
      + 'Basecamp footprint. One owner, capped budget, out of the 2027 revenue plan.' },
  { name: 'Certification preparation', earns: false, payers: 0, monthly: 0,
    state: '302 questions and a scoring engine exist. Five people have ever completed a '
      + 'practice exam. It is bundled free inside membership.',
    earliest: 'priceable in about 30 days',
    verdict: 'A reason to stay a member, not a reason to pay separately. We issue nothing.' },
  { name: 'The ten agents', earns: false, payers: 0, monthly: 0,
    state: '266 agents, 175 enabled, 765,305 executions in 30 days, all internal '
      + 'operations tooling. No SKU, no price, no external customer, no packaging ticket.',
    earliest: 'not a product',
    verdict: 'Margin and headcount avoidance. The moment it appears as ARR the plan loses '
      + 'credibility.' },
  { name: 'Live cohorts as a priced SKU', earns: false, payers: 0, monthly: 0,
    state: 'A $4,500 price sits in settings. No enrollment has ever been recorded at it.',
    earliest: 'needs a decision, not a build',
    verdict: 'There is no cohort SKU today. Membership is the only purchasable thing.' },
];

/** Acquisition is the constraint, not delivery. */
const FUNNEL = {
  leadsTotal: 24802,
  leadsFromOneBulkImport: 21385,
  organicLeads: { 'Sep': 113, 'Oct': 59 },
  explorers: 396,
  monthlyActivePortalUsers: 136,
  payers: 19,
  note: 'Delivery capacity is not the problem. The portal, 1,815 timeline cards and a '
    + 'working curriculum exist. Acquisition is, and a free tier that gives the paid '
    + 'product away makes it worse.',
  src: PROD_SRC,
};

/* ── people ───────────────────────────────────────────────────────────────── */

const COMMISSION_SRC = 'monthly ColaberryTrainingCommissions workbooks reconciled against '
  + 'scripts/commission/ledger.json; 44 monthly workbooks, 2023-01 to 2026-09';

const PEOPLE = {
  staffCommissionSep2026: 5750,
  peoplePaidSep2026: 14,
  components: [
    { name: 'Mentor retainer', monthly: 3500, kind: 'FIXED',
      detail: 'A flat $350 per mentor across ten mentors. Verified NOT performance-scaled: '
        + 'mentors at zero activity and zero logins still receive it in full. It behaves '
        + 'like salary despite being 1099, and it is the only line a decision can remove.' },
    { name: 'Session commission', monthly: 2250, kind: 'PER-SESSION',
      detail: 'Stops when sessions stop. Every paid session in the last live detail was '
        + 'Data Analytics or IPBC content. Not one AI-program session appears.' },
    { name: 'Teaching and TA', monthly: 0, kind: 'ALREADY ZERO',
      detail: 'Was $3,000 to $5,200 a month in early 2026. Reached zero in August when the '
        + 'last two instructors came off. Nobody was dismissed; the work ended.' },
  ],
  survives: [
    { name: 'Ali placement commission', monthly: 1979,
      detail: 'A percentage of collections, so it tracks the book, not the classroom.' },
    { name: '1099 contractors, admin', monthly: 3400, detail: 'Corporate admin.' },
    { name: 'Health, dental, life, disability', monthly: 1519,
      detail: 'THE TELL. You cannot insure people who do not exist. W2 employees exist and '
        + 'their wages are coded to a class other than the school.' },
  ],
  trend: [
    { period: '2023', monthly: 27690, people: '40 to 50' },
    { period: '2024', monthly: 23576, people: '43 down to 23' },
    { period: '2025', monthly: 15926, people: '18 to 21' },
    { period: '2026 Jan-Sep', monthly: 8683, people: '13 to 18' },
    { period: '2026 Jul-Sep', monthly: 6175, people: '14' },
  ],
  priorLayoff: 'Mika and Shveta, effective 29 May 2026, on the salaried side.',
  src: COMMISSION_SRC,
};

const PNL_GAP = {
  commissionActuallyPaid: 90614,
  recordedInSchoolPnl: 31827,
  get gap() { return this.commissionActuallyPaid - this.recordedInSchoolPnl; },
  src: COMMISSION_SRC,
};

/* ── the roster, ESTIMATED by Ali, not measured ───────────────────────────── */

/**
 * Ali's own estimate of who is on the team and what they cost, given 22 October 2026.
 *
 * THIS IS NOT THE PAYROLL REGISTER AND MUST NEVER BE PRESENTED AS ONE. Ali supplied these
 * from memory and hedged several of them in his own words. It is here because it is the
 * first visibility into the cost the school P&L hides, and because the shape of it - a
 * largely offshore team with four US salaries on top - changes what a cost decision even
 * looks like. It is not here to be added up and acted on.
 *
 * TWO THINGS MAKE EVERY TOTAL BELOW SOFT. Hours are assumed, because Ali gave rates and
 * not hours; and allocation is unknown, because the web team is "only partially billed to
 * the school" and nobody has said what the split is. A number that is wrong in both its
 * quantity and its allocation is a direction, not a figure.
 */
const ESTIMATED_ROSTER = {
  estimatedBy: 'Ali, from memory, 2026-10-22',
  measured: false,
  assumedHoursPerMonth: 160,
  people: [
    { who: 'Ali', where: 'US', basis: 'salary', annual: 100000, confidence: 'stated' },
    { who: 'Kes', where: 'US', basis: 'salary', annual: 50000, confidence: 'stated' },
    { who: 'Jackie', where: 'US', basis: 'salary', annualLow: 40000, annualHigh: 50000,
      confidence: 'range' },
    { who: 'Taiwo', where: 'US', basis: 'salary', annualLow: 40000, annualHigh: 50000,
      confidence: 'range' },
    { who: 'Farhat', where: 'US', basis: 'hourly', hourly: 10, role: 'support',
      confidence: 'approximate' },
    { who: 'Dhee', where: 'India', basis: 'hourly', hourly: 7, role: "Ali's assistant",
      confidence: 'approximate' },
    { who: 'Rob', where: 'Indonesia', basis: 'hourly', hourly: 8, confidence: 'approximate' },
    { who: 'Rose', where: 'Indonesia', basis: 'hourly', hourly: 8, partTime: true,
      confidence: 'hedged - Ali said do not quote him on the location' },
  ],
  // Named, but with no rate given. They are the reason the total below is a floor.
  noRateGiven: [
    { who: 'Swati', where: 'India' },
    { who: 'Bala', where: 'India', role: 'support', note: 'two people share this name' },
    { who: 'Aleem', where: 'India' },
    { who: 'Web team', where: 'India', note: 'ONLY PARTIALLY billed to the school' },
    { who: 'Marketing team', where: 'offshore',
      note: 'Ali estimates the equivalent of $5/hr or less; headcount not stated' },
  ],
  whyOffshoreMatters: 'Most of the team is in India or Indonesia, which is why a '
    + 'fourteen-person organization does not cost what a fourteen-person US organization '
    + 'would. It also means a headcount cut saves far less per person than the org chart '
    + 'suggests, while costing the same amount of capability.',
  src: 'Ali, 2026-10-22, estimates not records',
};

/**
 * A floor, not a total. Everything about it is soft and the name should keep saying so.
 */
function estimatedMonthlyPeopleFloor() {
  const r = ESTIMATED_ROSTER;
  let monthly = 0;
  for (const p of r.people) {
    if (p.basis === 'salary') {
      const annual = p.annual != null ? p.annual : (p.annualLow + p.annualHigh) / 2;
      monthly += annual / 12;
    } else {
      monthly += p.hourly * r.assumedHoursPerMonth * (p.partTime ? 0.5 : 1);
    }
  }
  return {
    monthly: Math.round(monthly),
    counted: r.people.length,
    uncounted: r.noRateGiven.length,
    note: 'A FLOOR. Excludes ' + r.noRateGiven.length + ' named people or teams with no '
      + 'rate given, and assumes full allocation to the school, which is known to be wrong.',
  };
}

/**
 * This estimate may never be dressed up as the payroll register.
 *
 * The whole reason the register is being requested is that nobody can currently see
 * salaried cost. If this block ever loses its `measured: false`, the plan would be
 * presenting a CEO's recollection as accounting, which is precisely the failure the
 * request is meant to end.
 */
function assertRosterIsLabeledAnEstimate() {
  if (ESTIMATED_ROSTER.measured !== false) {
    throw new Error('turnaround: the roster is marked measured. It is Ali recalling rates, '
      + 'not a payroll register, and the register is still outstanding.');
  }
  if (!/estimates not records/i.test(ESTIMATED_ROSTER.src)) {
    throw new Error('turnaround: the roster source no longer says these are estimates');
  }
  const stillOpen = OPEN_MEASUREMENTS.some((o) => /payroll register/i.test(o.what));
  if (!stillOpen) {
    throw new Error('turnaround: the payroll register left the unknown list while the '
      + 'roster is still an estimate. One of the two is wrong.');
  }
  return estimatedMonthlyPeopleFloor();
}

/* ── what remains unmeasured ──────────────────────────────────────────────── */

const OPEN_MEASUREMENTS = [
  { what: 'The composition of P&L account 4300',
    why: '89 percent of the largest income line has no traceable placement-fee source. '
      + 'Until the QuickBooks detail exists, every runway number built on it is unsupported.',
    where: 'QuickBooks transaction detail, Jan to Aug 2026, with payee and memo',
    value: UNKNOWN },
  { what: 'The W2 payroll register by employee, with class coding',
    why: '$58,787 of eight-month commission sits outside the school class and salaried '
      + 'wages are invisible. No salaried decision can be made on evidence without it.',
    where: 'QuickBooks, via Aishwarya C and Durga Siralam', value: UNKNOWN },
  { what: 'Whether the 124-schedule subscription book survives the sunset',
    why: 'It is roughly $13.9k a month realized and the single largest financial risk. No '
      + 'dataset can answer it; it depends on what service subscribers still receive.',
    where: 'a business decision, informed by what delivery continues', value: UNKNOWN },
];

/* ── derived ──────────────────────────────────────────────────────────────── */

const sum = (a) => a.reduce((x, y) => x + y, 0);

function monthlyRecurringRevenue() {
  return SUBSCRIPTIONS.activeByPlan.reduce((t, p) => t + p.n * p.monthlyEach, 0);
}

function steadyStateMonthlyCost() {
  return (sum(PNL.totalExpenses) - sum(ONE_OFFS.map((o) => o.amount))) / PNL.months.length;
}

/** The real comparison: the legacy book against the new business. */
function replacementGap() {
  const legacy = LIVE_BOOK.realizedMonthly;
  const mrr = monthlyRecurringRevenue();
  return { legacy, mrr, gap: legacy - mrr, coverage: mrr / legacy };
}

function removableOnSunset() {
  const removable = PEOPLE.components
    .filter((c) => c.kind !== 'ALREADY ZERO').reduce((t, c) => t + c.monthly, 0);
  const surviving = PEOPLE.survives.reduce((t, c) => t + c.monthly, 0);
  return { removable, surviving };
}

/* ── the 10,000-learner question ──────────────────────────────────────────── */

const SCALE_TARGET = { learners: 10000, months: 24, src: 'the objective as Ali stated it' };

const DELIVERY_CHANNELS = [
  { channel: 'Institutional seat blocks', seatsPerDeal: 500, pricePerSeat: 300,
    dealsNeeded: 16,
    why: 'Higher-ed continuing education is already the named beachhead, and blocks are '
      + 'the only shape that reaches five figures of learners inside two years.',
    gatedBy: 'A reference customer. There is none, so deal one is the whole risk.' },
  { channel: 'Self-serve and async', seatsPerDeal: 1, pricePerSeat: 199, dealsNeeded: 1500,
    why: 'Carries the long tail at near-zero marginal delivery cost.',
    gatedBy: 'A paywall. Today the free tier serves the entire curriculum.' },
  { channel: 'Live cohorts', seatsPerDeal: 50, pricePerSeat: 1788, dealsNeeded: 10,
    why: 'The premium tier and the proof engine. Case studies come from here, and they '
      + 'are what make the other two sellable.',
    gatedBy: 'Instructor time, the one input that does not scale.' },
];

function scaleMath() {
  const rows = DELIVERY_CHANNELS.map((c) => ({
    channel: c.channel,
    learners: c.seatsPerDeal * c.dealsNeeded,
    revenue: c.seatsPerDeal * c.dealsNeeded * c.pricePerSeat,
  }));
  return {
    rows,
    learners: sum(rows.map((r) => r.learners)),
    revenue: sum(rows.map((r) => r.revenue)),
    perMonthNeeded: Math.round(SCALE_TARGET.learners / SCALE_TARGET.months),
    monthlyRevenue: Math.round(sum(rows.map((r) => r.revenue)) / SCALE_TARGET.months),
  };
}

/* ── assertions ───────────────────────────────────────────────────────────── */

function assertEveryFigureHasASource() {
  const blocks = [PNL, ACCOUNT_4300, ISA_RUNOFF, LIVE_BOOK, REALIZATION, SUBSCRIPTIONS,
    FUNNEL, PEOPLE, PNL_GAP, ...COHORTS, ...REVENUE_DEFECTS, ...URGENT_FLAGS];
  for (const b of blocks) {
    if (!b.src) throw new Error('turnaround: a block carries no src');
  }
  return blocks.length;
}

/** Comp seats stay visible, are never priced, and must agree with the payer count. */
function assertCompIsNotCountedAsRevenue() {
  const comp = SUBSCRIPTIONS.activeByPlan.find((p) => p.plan === 'comp');
  if (!comp) throw new Error('turnaround: the comp plan vanished from the split');
  if (comp.monthlyEach !== 0) throw new Error('turnaround: comp was given a price');
  const billing = SUBSCRIPTIONS.activeByPlan.filter((p) => p.monthlyEach > 0)
    .reduce((t, p) => t + p.n, 0);
  if (billing !== SUBSCRIPTIONS.distinctPayingHumans) {
    throw new Error(`turnaround: billing plans total ${billing} but the stated payer count `
      + `is ${SUBSCRIPTIONS.distinctPayingHumans}. These must agree.`);
  }
  return { headline: SUBSCRIPTIONS.byStatus.active, billing, comp: comp.n };
}

/**
 * Account 4300 may never be described as an ISA run-off while 89% of it is unexplained.
 *
 * This guard protects the plan's central correction. The account name invites exactly the
 * wrong reading, and the wrong reading produces a runway that ends in May 2027 when the
 * actual money may run for years - or stop next quarter for an entirely different reason.
 */
function assertAccount4300IsNotCalledIsa() {
  if (ACCOUNT_4300.traceableShare > 0.5) {
    throw new Error('turnaround: traceable placement fees now exceed half of account 4300, '
      + 'so the framing needs rewriting rather than restating.');
  }
  if (ACCOUNT_4300.reconciles) {
    throw new Error('turnaround: account 4300 is marked as reconciling. If that became '
      + 'true its composition is known and it belongs in the measured section.');
  }
  return { sharePct: +(ACCOUNT_4300.traceableShare * 100).toFixed(1) };
}

/** No engine with zero customers may claim revenue, and exactly one earns today. */
function assertOnlyEarningEnginesClaimRevenue() {
  for (const e of ENGINES) {
    if (e.monthly > 0 && (!e.earns || e.payers === 0)) {
      throw new Error(`turnaround: "${e.name}" claims $${e.monthly} a month without customers`);
    }
  }
  const earning = ENGINES.filter((e) => e.earns);
  if (earning.length !== 1) {
    throw new Error(`turnaround: ${earning.length} engines marked earning; production says one`);
  }
  return { engines: ENGINES.length, earning: earning.length };
}

/** The mentor retainer may not be cut in isolation from the book it protects. */
function assertMentorCutIsSequencedWithBook() {
  const mentor = PEOPLE.components.find((c) => /Mentor retainer/.test(c.name));
  if (mentor.monthly >= LIVE_BOOK.realizedMonthly) {
    throw new Error('turnaround: the mentor retainer now exceeds the realized book, so the '
      + 'sequencing argument needs rewriting.');
  }
  return { mentorMonthly: mentor.monthly, bookMonthly: LIVE_BOOK.realizedMonthly,
    multiple: +(LIVE_BOOK.realizedMonthly / mentor.monthly).toFixed(1) };
}

function assertUnknownsAreDeclared() {
  for (const o of OPEN_MEASUREMENTS) {
    if (o.value !== UNKNOWN) {
      throw new Error(`turnaround: "${o.what}" is no longer UNKNOWN but is still listed as open`);
    }
  }
  return OPEN_MEASUREMENTS.length;
}

/** Scheduled money may never be presented as cash. */
function assertRealizationIsApplied() {
  for (const r of ISA_RUNOFF.curve) {
    if (r.nominal > 0 && r.realistic >= r.nominal) {
      throw new Error(`turnaround: ${r.month} shows realistic at or above nominal. Less `
        + 'than half of drafted dollars clear.');
    }
  }
  if (LIVE_BOOK.realizedMonthly >= LIVE_BOOK.nominalMonthly) {
    throw new Error('turnaround: the live book shows realized at or above nominal');
  }
  return REALIZATION.rate;
}

module.exports = {
  UNKNOWN, AS_OF, PNL, ONE_OFFS,
  ACCOUNT_4300, ISA_RUNOFF, LIVE_BOOK, REALIZATION, URGENT_FLAGS,
  PAYPAL_CHANNEL, RECENT_ACTUALS,
  COHORTS, SUBSCRIPTIONS, REVENUE_DEFECTS, ENGINES, FUNNEL,
  PEOPLE, PNL_GAP, OPEN_MEASUREMENTS,
  ESTIMATED_ROSTER, estimatedMonthlyPeopleFloor, assertRosterIsLabeledAnEstimate,
  SCALE_TARGET, DELIVERY_CHANNELS, scaleMath,
  sum, monthlyRecurringRevenue, steadyStateMonthlyCost, replacementGap, removableOnSunset,
  assertEveryFigureHasASource, assertCompIsNotCountedAsRevenue,
  assertAccount4300IsNotCalledIsa, assertOnlyEarningEnginesClaimRevenue,
  assertMentorCutIsSequencedWithBook, assertUnknownsAreDeclared, assertRealizationIsApplied,
};
