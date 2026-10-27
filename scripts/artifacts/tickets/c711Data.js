/**
 * C7.11 - go or no-go on the Massachusetts Focused AI Skills Training procurement.
 *
 * Two kinds of fact live in this file and they are kept apart on purpose.
 *
 * Everything under OURS was measured against production on 2026-10-26, read-only, and
 * carries the query shape that produced it so a later reader can re-measure.
 *
 * Everything under RFQ came from Commonwealth Corporation's own published materials and
 * carries a `verified` state plus the quote that settles it. The guards refuse to build a
 * document in which an unverified term is dressed as a fact, because a bid resting on a
 * restatement of its own input is worse than no bid.
 *
 * Three things the research changed about the ticket's framing, each of which moved the
 * recommendation:
 *
 *   1. The administrative blocker is not real. The certificate of good standing comes from
 *      the Massachusetts DEPARTMENT OF REVENUE, not the Secretary of the Commonwealth, and
 *      no foreign-corporation registration is required. Free, 24-48 hours, online.
 *   2. Only INSTRUCTOR-LED time counts toward the $300 hourly multiplier. The first draft
 *      of this analysis priced off curriculum estimated_hours, which include async lab
 *      work, and overstated the delivered hours badly.
 *   3. Completion means attendance at ALL instructional hours. Not a threshold. Measured
 *      against every attendance record this platform holds, that bar has never been met by
 *      anybody, and the reason is course length.
 */

const MEASURED_ON = '2026-10-26';
const DEADLINE = '2026-11-06';
const DAYS_LEFT = 11;

/** The headline, stated once so an edit cannot soften it by accident. */
const VERDICT = {
  recommendation: 'GO - and bid a short, frequently repeated course, not the accelerator.',
  theReframe: 'This is not a $400,000 grant. It is a two-year permission to sell into '
    + 'Massachusetts with a subsidy attached, paid only on slots that are filled, fully '
    + 'attended and finished by somebody still employed there.',
  theTrap: 'Reimbursement requires attendance at EVERY instructional hour. Of the 36 '
    + 'learners for whom this platform holds any attendance record, the best attended 23 '
    + 'of 24 sessions. Not one attended all of them. Under the Commonwealth rule, every '
    + 'one of those slots would have been unreimbursable.',
  whyShort: 'Course length is the dominant variable in whether we are paid at all, because '
    + 'every additional session is another chance to miss one and lose the whole slot. A '
    + 'short course also earns five times more per instructional hour, and can be repeated '
    + 'often enough for the make-up provision to actually work.',
  theOnlyHardStops: 'Two binary facts about the applying entity, which only Ali can '
    + 'confirm: it must not be a sole proprietorship or single-member LLC, and it must have '
    + 'two years delivering training to EXTERNAL clients in its own name.',
};

/**
 * Commonwealth Corporation's terms. Sources are its program page and its official
 * consolidated Q&A, which CommCorp treats as binding. The RFQ PDF itself sits behind a
 * Microsoft login and a JavaScript-rendered page and was NOT read; that limitation is
 * stated in the document rather than papered over.
 */
const RFQ = {
  issuer: 'Commonwealth Corporation (Massachusetts quasi-public workforce agency)',
  program: 'Focused AI Skills Training (FAST AI)',
  deadline: DEADLINE + ', 11:59 PM EST',
  round: 'Round 1. No prior round, no incumbent, and the course directory does not yet '
    + 'exist - it is an output of this procurement.',
  questionPeriodClosed: '2026-10-02',
  sourceLimitation: 'The RFQ document body was not read. It is login-gated on SharePoint '
    + 'and JavaScript-rendered on Softr. Every term below comes from the CommCorp program '
    + 'page or its consolidated Q&A, which CommCorp states is binding and which nothing '
    + 'found contradicts - but it is not the solicitation itself, and the question period '
    + 'closed on 2 October, so no clarification can now be requested.',
  terms: [
    { id: 'T1', claim: 'Up to $400,000 per provider, one grant covering all approved courses',
      verified: 'CONFIRMED',
      quote: 'Maximum award of $400,000.00 per provider, with one grant per provider '
        + 'covering all approved courses. The grant award is a maximum amount, not a '
        + 'guaranteed payment.' },
    { id: 'T2', claim: 'Contract runs February 2027 to January 2029',
      verified: 'CONFIRMED',
      quote: 'February 1, 2027 through January 31, 2029. Training is expected to be '
        + 'completed by June 30, 2028 - so the delivery window is 17 months, not 24.' },
    { id: 'T3', claim: '$300 per instructional hour per slot, or $3,000 per person per '
      + 'course, whichever is less',
      verified: 'CONFIRMED',
      quote: 'An 8-hour course may be priced at up to $2,400 per slot. Assignments, '
        + 'simulations, or exercises completed between live sessions without an instructor '
        + 'do not count toward instructional hours. Pricing must be per person, never a '
        + 'group rate, and proposals that are not competitively priced will not be '
        + 'selected even if they are below the limits.' },
    { id: 'T4', claim: 'No employer match or cost share required',
      verified: 'CONFIRMED', quote: 'Match contributions are not required.' },
    { id: 'T5', claim: 'Reimbursed per completed slot only',
      verified: 'CONFIRMED',
      quote: 'At minimum, attendance records must show the trainee attended ALL '
        + 'instructional hours of the course, and the trainee must complete any assessment '
        + 'the course requires. Slots for trainees who do not complete are not reimbursed, '
        + 'regardless of the reason. A slot is not reimbursable if the trainee is no longer '
        + 'employed by the eligible employer when the course is completed. Make-ups in '
        + 'another cohort of the same course are permitted within the contract period.' },
    { id: 'T6', claim: 'Out-of-state providers eligible where delivery is remote or hybrid',
      verified: 'CONFIRMED',
      quote: 'Out-of-state applicants are eligible for FAST AI funds if delivery is remote '
        + 'or hybrid for Massachusetts employers and employees.' },
    { id: 'T7', claim: 'Two years operating specifically as a training provider',
      verified: 'CONFIRMED',
      quote: 'The requirement cannot be satisfied through prior training experience of the '
        + 'applicant principals and/or proposed instructors. Training delivered only to an '
        + 'organization own employees does not meet this requirement. Subcontractor and '
        + 'affiliate experience may not be used. Sole proprietorships and single-member '
        + 'LLCs are not eligible to apply.' },
    { id: 'T8', claim: 'Certificate of good standing, three employer references, '
      + 'instructor resumes',
      verified: 'CONFIRMED WITH A CORRECTION',
      quote: 'The certificate is from the DEPARTMENT OF REVENUE. A certificate from the '
        + 'Secretary of the Commonwealth or from any other state is not valid. Notice date '
        + 'within 6 months, exact legal name, no DBAs. References must be from past or '
        + 'current employer clients of the Applicant itself. A resume is required for each '
        + 'instructor of each course. A signed W-9 dated within one year and a '
        + 'non-debarment attestation are also required.' },
    { id: 'T9', claim: 'Maximum 20 courses per provider, 100 slots per employer',
      verified: 'CONFIRMED',
      quote: 'The 100-slot cap is per employer PER PROVIDER, and counts only reimbursed '
        + 'slots. The same core course adapted per industry under its own title counts as a '
        + 'separate course against the 20; only language variants are free.' },
    { id: 'T10', claim: 'Generic AI literacy excluded; content role-specific and '
      + 'instructor-led',
      verified: 'CONFIRMED AS A THRESHOLD, NOT AN EXCLUSION',
      quote: 'Courses must go above baseline AI literacy as defined in the U.S. Department '
        + 'of Labor AI Literacy Framework. The only hard ineligibility is narrower - basic '
        + 'digital skills such as device setup and browser use. Instructor-led is required '
        + 'outright: asynchronous or self-paced content may only be a limited, supplemental '
        + 'component.' },
    { id: 'T11', claim: 'Consulting and bespoke single-employer design are excluded',
      verified: 'CONFIRMED',
      quote: 'FAST AI does not fund consulting or bespoke services, including designing a '
        + 'program for a single employer or building AI tools or workflows for an employer. '
        + 'Contextualizing instruction to a role or industry is training and is encouraged; '
        + 'delivering a custom work product is not. Courses must be standard offerings any '
        + 'approved employer can select.' },
    { id: 'T12', claim: 'Providers market their own courses',
      verified: 'CONFIRMED',
      quote: 'Most engagement will result from direct marketing efforts of the training '
        + 'providers selected by CommCorp.' },
  ],
};

/**
 * What we actually have. Every row measured against production on 2026-10-26.
 */
const OURS = {
  /** Instructor-led hours. This is the only clock the $300 multiplier counts. */
  instructorLedHours: {
    liveSessionRows: 31,
    completed: 30,
    canceled: 1,
    dateRange: '2026-04-14 to 2026-10-20',
    perCohort: [
      { cohort: 'Cohort - July 2026', sessions: 25, hours: 50.5,
        pattern: '24 sessions of 18:30-20:30 plus one of 18:30-21:00' },
      { cohort: 'Cohort - April 2026', sessions: 5, hours: 10,
        pattern: '5 sessions of 13:00-15:00' },
      { cohort: 'Cohort - November 2026', sessions: 1, hours: 0.5,
        pattern: 'only one session scheduled so far' },
    ],
    theCorrection: 'curriculum_blueprints.estimated_hours totals 114.4 across 17 published '
      + 'blueprints, but that is total learner effort including labs, GitHub work and '
      + 'implementation tasks. Massachusetts counts none of it - only live session time '
      + 'counts - and the measured live time is a fraction of the estimate.',
    query: 'SELECT cohort, count(*), start_time, end_time FROM live_sessions GROUP BY ...',
  },

  /**
   * ATTENDANCE. This is the center of the analysis, because 100% of instructional hours
   * is the reimbursement condition and we have the records to test ourselves against it.
   */
  attendance: {
    verdict: 'NOBODY HAS EVER REACHED THE BAR MASSACHUSETTS SETS',
    perSessionTableExists: true,
    attendanceRecordRows: 1216,
    enrollmentRows: 944,
    withAnyScore: 100,
    withNonzeroScore: 38,
    impossibleScores: 2,
    validNonzeroScores: 36,
    exactlyOneHundred: 0,
    best: 95.83,
    bestAsSessions: '23 of 24',
    mean: 52.8,
    denominator: 24,
    whoTheyAre: 'The denominators are all 24ths, so these 36 are the July 2026 cohort '
      + 'measured against its 24 sessions.',
    /** Every valid nonzero score, measured. The chart draws these, not a summary. */
    distribution: [
      { score: 95.83, n: 1 }, { score: 91.67, n: 1 }, { score: 87.5, n: 3 },
      { score: 83.33, n: 5 }, { score: 79.17, n: 4 }, { score: 70.83, n: 4 },
      { score: 66.67, n: 1 }, { score: 58.33, n: 1 }, { score: 54.17, n: 1 },
      { score: 41.67, n: 1 }, { score: 33.33, n: 1 }, { score: 29.17, n: 1 },
      { score: 25, n: 1 }, { score: 20.83, n: 1 }, { score: 16.67, n: 3 },
      { score: 12.5, n: 3 }, { score: 4.17, n: 3 }, { score: 4, n: 1 },
    ],
    theConsequence: 'Applying the Commonwealth rule to the only cohort we have attendance '
      + 'for: 36 slots delivered, 0 reimbursable.',
    honestCaveat: 'The field is sparse and partly corrupt - populated on 100 of 944 '
      + 'enrollments, and two of the 38 nonzero values are 300, which is impossible for a '
      + 'percentage. So this is not a reliable attendance rate for the business. It is '
      + 'reliable for the only question being asked here, which is whether anybody has '
      + 'ever hit 100%, and that answer does not depend on the corrupt rows.',
    query: 'SELECT attendance_score, count(*) FROM enrollments WHERE attendance_score > 0 '
      + 'AND attendance_score <= 100 GROUP BY attendance_score',
  },

  /** The completion record, which does not exist. */
  completion: {
    verdict: 'NO COMPLETION HAS EVER BEEN RECORDED',
    enrollmentStatuses: [
      { status: 'active', n: 878 },
      { status: 'withdrawn', n: 63 },
    ],
    noCompletedStatusExists: true,
    cohortMembershipRows: 14,
    cohortMembershipsWithCompletedAt: 0,
    studentCertificationRows: 0,
    theCompletedCohort: {
      name: 'Cohort - April 2026', cohortStatus: 'completed',
      withdrawn: 13, active: 1, completed: 0,
    },
    honestCaveat: 'Those 13 withdrawals were NOT a bulk close-out. They were enrolled on '
      + 'nine separate dates between 4 April and 7 July, and 7 of the 13 had paid. Nor can '
      + 'their zero evidence rows be read as "they did nothing": the task and evidence '
      + 'tooling postdates that cohort, so April would look empty either way. The platform '
      + 'also has no updated_at on enrollments, so no status change in it is timestamped.',
    query: 'SELECT status, count(*) FROM enrollments GROUP BY status',
  },

  /** The audit trail a state cost-reimbursement contract would be invoiced against. */
  auditTrail: {
    enrollmentRows: 944,
    hasUpdatedAtColumn: false,
    withEnrolledAt: 79,
    withAccessStartsAt: 1,
    verdict: 'attendance_records exists and holds 1,216 rows, which is the right shape for '
      + 'a Massachusetts invoice. What is missing is everything around it: enrollments has '
      + 'no updated_at at all, enrolled_at is populated on 79 of 944 rows, and '
      + 'access_starts_at on one.',
    query: 'SELECT count(*), count(enrolled_at), count(access_starts_at) FROM enrollments',
  },

  /** The course catalog. */
  catalog: {
    publishedBlueprints: 17,
    totalEstimatedHours: 114.4,
    weekRange: '0 to 12',
    coraCoursesTable: 0,
    note: 'There is no courses table with rows in it - cora_courses holds zero. The real '
      + 'catalog is curriculum_blueprints. Massachusetts caps a provider at 20 courses, so '
      + 'the catalog is not the constraint; the per-course shape is.',
    query: 'SELECT status, count(*), sum(estimated_hours) FROM curriculum_blueprints '
      + 'GROUP BY status',
  },

  /** The two products inside those blueprints, priced on instructor-led time. */
  programs: [
    { name: 'Four-session role-specific track',
      detail: 'Foundations and Responsible Use; Workflow Mapping for Claims Adjudication; '
        + 'Hands On Labs and Artifact Development; Capstone, Assessment and Credential',
      instructorLedHours: 8, sessions: 4,
      fit: 'FITS. Role-specific by name, instructor-led, ends in an assessment. Claims '
        + 'adjudication is an occupation, not a topic. At 8 hours it prices at the hourly '
        + 'rate rather than the cap, which is the best yield available.' },
    { name: 'The accelerator as actually delivered',
      detail: 'The July 2026 cohort, 25 live sessions',
      instructorLedHours: 50.5, sessions: 25,
      fit: 'FITS THE CONTENT TEST, FAILS TWICE COMMERCIALLY. It earns the same capped '
        + '$3,000 for six times the delivery, and 25 sessions is 25 chances to lose the '
        + 'whole slot.' },
    { name: 'Week 0 preview',
      detail: 'The open preview week', instructorLedHours: 2, sessions: 1,
      fit: 'DO NOT SUBMIT. This is the baseline AI literacy the Commonwealth scores '
        + 'against, below the Department of Labor framework threshold.' },
  ],

  /** The Massachusetts footprint, which is neither zero nor a presence. */
  massachusetts: {
    totalLeadsInPlatform: 25082,
    leadsWithAnyPhone: 2858,
    maAreaCodeLeads: 143,
    maLeadsNamingAnEmployer: 121,
    maDistinctEmployers: 86,
    maEverContacted: 0,
    maEnrollments: 16,
    bySource: [
      { source: 'apollo', type: 'cold', n: 70 },
      { source: 'apollo_contacts', type: 'cold', n: 51 },
      { source: 'ccpp_alumni', type: 'alumni', n: 12 },
      { source: 'open_house', type: 'warm', n: 10 },
    ],
    namedEmployers: ['Hologic', 'Alkermes', 'Vertex Pharmaceuticals', 'Sage Therapeutics',
      'Biogen', 'Agios Pharmaceuticals', 'Alnylam Pharmaceuticals', 'Butterfly Network',
      'Arbella Insurance Group', 'Charles River Associates', 'Audax Private Equity',
      'Bridgewater State University', 'City of Melrose', 'CIMCON Software'],
    verdict: 'A list, not a relationship. 121 of the 143 are a cold Apollo pull and not '
      + 'one of the 143 has ever been contacted. The 22 warm ones carry no employer name.',
    theUsefulPart: 'The 86 employers are the right 86. This is the Route 128 and Kendall '
      + 'Square corridor - biotech, pharma, insurance and a state university - which is '
      + 'precisely the buyer the Commonwealth is subsidizing.',
    query: 'SELECT source, lead_source_type, count(*) FROM leads WHERE phone ~ MA_CODES '
      + 'GROUP BY 1,2',
  },

  /** Why we cannot produce the three employer references from this system. */
  employerReferences: {
    required: 3,
    mustBe: 'letters from past or current employer CLIENTS of the applying entity itself',
    organizationRows: 9,
    organizationsThatAreColaberryItself: 4,
    organizationsThatAreDemoOrFixture: 1,
    plausibleExternalEmployers: ['John Deere', 'Kolo'],
    sponsorRows: 1,
    sponsorIsAFixture: true,
    alumniLeads: 10342,
    alumniDistinctEmployers: 1,
    verdict: 'NOT PRODUCIBLE FROM THIS SYSTEM',
    why: 'The CCPP import brought 10,342 alumni across four months and carried exactly one '
      + 'employer name, which is Colaberry itself. The alumni prove the training operation '
      + 'is real and long-running; they cannot name a single employer who would vouch.',
    whereTheyMustComeFrom: 'Outside this platform - signed client contracts, the CCPP '
      + 'placement records, or Ali naming three directly.',
    query: "SELECT count(*), count(DISTINCT company) FROM leads WHERE "
      + "lead_source_type='alumni'",
  },

  /** What this platform can and cannot say about how long we have been a training provider. */
  operatingHistory: {
    platformEarliestEnrollment: '2026-03-30',
    platformAgeMonths: 7,
    alumniImported: 10342,
    alumniImportWindow: '2026-03-11 to 2026-07-08',
    verdict: 'THIS PLATFORM CANNOT EVIDENCE THE TWO-YEAR TEST, AND THAT IS NOT THE SAME AS '
      + 'FAILING IT',
    why: 'Enrollment data starts 2026-03-30 because the platform starts there, not because '
      + 'the company does. The 10,342 imported alumni are the trace of a training operation '
      + 'that long predates this database. The evidence is corporate - incorporation date, '
      + 'prior client contracts, tax filings - and lives outside this repository.',
  },
};

/**
 * The pricing, recomputed on instructor-led hours after the research corrected the first
 * draft. Derived from T3, which is CONFIRMED.
 */
const ECONOMICS = {
  derivedFrom: 'T3',
  capBindsAboveHours: 10,
  capBindsExplanation: '$300 x 10 hours = $3,000, so a course of ten instructor-led hours '
    + 'or fewer is paid at the hourly rate and anything longer is paid the same flat '
    + '$3,000 however long it runs.',
  yields: [
    { program: 'Four-session role-specific track', hours: 8, atHourly: 2400,
      actuallyPaid: 2400, perInstructionalHour: 300 },
    { program: 'The accelerator as delivered', hours: 50.5, atHourly: 15150,
      actuallyPaid: 3000, perInstructionalHour: 59 },
  ],
  yieldRatio: 5.1,
  slotsToReachCap: 167,
  slotsToReachCapWorking: '$400,000 / $2,400 per slot = 166.7, so 167 completed slots at '
    + 'the short-course price. At the capped $3,000 it would be 134.',
  employersNeededAtSaturation: 2,
  employersNeededRealistically: '4 to 8, since no employer fills 100 slots on a first buy.',

  /**
   * The compounding risk. Reimbursement needs every session attended, so the chance of
   * being paid for a slot falls geometrically with session count. This is arithmetic on an
   * assumed per-session rate, NOT a measurement, and is labeled as such wherever shown.
   * The 52.8% input is our own measured mean attendance; 90% is a disciplined cohort.
   */
  attendanceModel: {
    isAModel: true,
    note: 'Arithmetic on an assumed per-session attendance rate, not a measurement. It '
      + 'assumes sessions are missed independently, which is pessimistic for a motivated '
      + 'learner and optimistic for a disengaged one.',
    rows: [
      { sessions: 4, atOurMeasuredRate: 7.8, atNinetyPercent: 65.6 },
      { sessions: 8, atOurMeasuredRate: 0.6, atNinetyPercent: 43.0 },
      { sessions: 25, atOurMeasuredRate: 0.0, atNinetyPercent: 7.2 },
    ],
    theConclusion: 'Even a disciplined cohort attending 90% of sessions reimburses only '
      + 'about 7% of slots on a 25-session course and about 66% on a four-session one. '
      + 'Course length, not course quality, decides whether we are paid.',
    theMitigation: 'CommCorp permits a make-up in another cohort of the same course within '
      + 'the contract period. That turns a missed session from a lost slot into a delayed '
      + 'one - but only for a course that runs often enough to have a next cohort, which '
      + 'is another argument for four sessions over twenty-five.',
  },
};

/** What has to be true, in the order the calendar forces. */
const GATES = [
  { n: 1, name: 'Entity is not a sole proprietorship or single-member LLC', owner: 'Ali',
    blocking: true, closeableBy6Nov: 'BINARY - CHECK FIRST',
    detail: 'Named outright as ineligible. This is a one-line answer and it either ends '
      + 'the ticket or clears it.' },
  { n: 2, name: 'Two years training external clients, in this entity name', owner: 'Ali',
    blocking: true, closeableBy6Nov: 'BINARY - CHECK FIRST',
    detail: 'Principals experience, subcontractor work, affiliate track record and '
      + 'training our own staff all explicitly fail to count. Almost certainly satisfied, '
      + 'but it must be the applying entity and it must be external clients.' },
  { n: 3, name: 'Three employer reference letters', owner: 'Ali',
    blocking: true, closeableBy6Nov: 'YES, IF THEY EXIST',
    detail: 'Must be past or current employer clients of the applicant itself. Not '
      + 'producible from the platform; the alumni import carried no employer name.' },
  { n: 4, name: 'Department of Revenue certificate of good standing', owner: 'Ali',
    blocking: true, closeableBy6Nov: 'YES - FREE, 24 TO 48 HOURS',
    detail: 'From the DOR via MassTaxConnect, not the Secretary of the Commonwealth, and '
      + 'no foreign-corporation registration is needed. Paper filing takes 4 to 6 weeks and '
      + 'would miss the deadline, so it must be the online route. Worth starting whatever '
      + 'we decide: free, two days, commits us to nothing.' },
  { n: 5, name: 'Instructor resumes, W-9, non-debarment attestation', owner: 'Delivery',
    blocking: true, closeableBy6Nov: 'YES',
    detail: 'A resume for each instructor of each course; a W-9 signed within the year.' },
  { n: 6, name: 'Course designed around 100% attendance', owner: 'Claude Code',
    blocking: false, closeableBy6Nov: 'YES - THIS IS THE BID',
    detail: 'Four sessions, eight instructor-led hours, run often enough that a missed '
      + 'session can be made up in the next cohort.' },
  { n: 7, name: 'Contract-grade attendance recording', owner: 'Platform',
    blocking: false, closeableBy6Nov: 'NOT NEEDED UNTIL FEBRUARY 2027',
    detail: 'attendance_records already holds 1,216 rows, so the shape exists. What is '
      + 'missing is reliability: attendance_score is populated on 100 of 944 enrollments '
      + 'and two values are impossible. C8.13 is already open on completion.' },
];

/** The honest case against, stated as strongly as the case for. */
const CASE_AGAINST = [
  'C2.4 found distribution is the binding constraint. This does not relieve it, it taxes '
    + 'it: CommCorp says in writing that most employer demand comes from the provider own '
    + 'marketing, and we would be cold-calling Massachusetts from Texas.',
  'Measured against the Commonwealth own rule, our only attendance-tracked cohort would '
    + 'have reimbursed zero of 36 slots. Winning the award does not produce revenue; '
    + 'getting people to attend every single session does.',
  'First revenue cannot land before employer enrollment opens in January 2027, and '
    + 'employers must themselves obtain two state certificates and wait up to 21 days for '
    + 'CommCorp to approve them.',
  'Nobody has called any of the 143 Massachusetts contacts. A list that has never been '
    + 'worked is evidence of intent, not of distribution.',
  'The question period closed on 2 October, so if the unread RFQ body carries a condition '
    + 'the published Q&A does not cover, we cannot ask about it before bidding.',
];

/** And the case for, which rests on what the application costs rather than what it pays. */
const CASE_FOR = [
  'The course already exists. A four-session role-specific track, instructor-led, ending '
    + 'in an assessment, naming an occupation - which is exactly the gap CommCorp says it '
    + 'is funding.',
  'The administrative barrier turned out not to be one. The certificate is a free '
    + 'Department of Revenue request that clears in 24 to 48 hours online, and no '
    + 'foreign-corporation registration is required.',
  'The downside is bounded. No match is required and unfilled seats cost nothing, so the '
    + 'exposure is the cost of applying and of marketing, not of capacity held open.',
  'It is a two-year channel and this is round one, with no incumbent and no directory yet. '
    + 'Approved-provider status in Massachusetts is also a credential that travels, '
    + 'including to the higher-education continuing-education beachhead C2.5 approved.',
  'The 86 Massachusetts employers already on the list are in the right industries, and the '
    + 'RFQ gives a cold call into that corridor the one thing it has never had: a reason.',
];

/** What Ali has to decide. */
const DECISIONS = [
  { n: 1, q: 'Is the applying entity a sole proprietorship or single-member LLC, and does '
      + 'it have two years delivering training to external clients in its own name?',
    rec: 'Both are hard disqualifiers and neither can be answered from the platform. If '
      + 'either fails, the ticket closes as a no-go today and nothing else matters.' },
  { n: 2, q: 'Do we bid?',
    rec: 'Yes, if the two eligibility facts clear. The application work is reusable even '
      + 'if we lose, because the same package is round two and other states programs.' },
  { n: 3, q: 'Who are the three employer references?',
    rec: 'Three employers who have bought or sponsored Colaberry training and will write a '
      + 'letter. This cannot be answered from the platform - three names from you.' },
  { n: 4, q: 'Shall I request the Department of Revenue certificate now?',
    rec: 'Recommended whatever we decide on the bid. Free, online, clears in 24 to 48 '
      + 'hours, commits us to nothing, and it is the only item with an external clock. '
      + 'Deciding on 3 November would be too late to start it.' },
];

// ---------------------------------------------------------------------------
// Guards - the build refuses to produce a document that has lost its point
// ---------------------------------------------------------------------------

/** No procurement term may be presented as verified unless something verified it. */
function assertNoUnverifiedTermIsPresentedAsFact() {
  const allowed = ['CONFIRMED', 'CONFIRMED WITH A CORRECTION',
    'CONFIRMED AS A THRESHOLD, NOT AN EXCLUSION', 'REFUTED', 'NOT FOUND',
    'PENDING SOURCE CHECK'];
  for (const t of RFQ.terms) {
    if (!allowed.includes(t.verified)) {
      throw new Error('C7.11: term ' + t.id + ' carries an unrecognized verification state '
        + '"' + t.verified + '"; a bid cannot rest on a state nobody defined');
    }
    if (t.verified.startsWith('CONFIRMED') && (!t.quote || t.quote.length < 20)) {
      throw new Error('C7.11: term ' + t.id + ' is marked confirmed but carries no quote. '
        + 'A confirmation without its source is an assertion.');
    }
  }
  return RFQ.terms.filter((t) => t.verified.startsWith('CONFIRMED')).length;
}

/** The RFQ body was not read, and the document must keep saying so. */
function assertTheSourceLimitationIsDisclosed() {
  const s = RFQ.sourceLimitation;
  if (!/was NOT read/i.test(s) || !/question period\s+closed|closed on 2 October/i.test(s)) {
    throw new Error('C7.11: the disclosure that the RFQ body was never read, and that no '
      + 'clarification can now be requested, has been removed');
  }
}

/** The economics are derived from an external term and must say so. */
function assertTheEconomicsNameTheirSource() {
  const term = RFQ.terms.find((t) => t.id === ECONOMICS.derivedFrom);
  if (!term) {
    throw new Error('C7.11: the economics derive from a term that is not in the RFQ list');
  }
  if (term.verified === 'REFUTED' || term.verified === 'NOT FOUND') {
    throw new Error('C7.11: the pricing term is not confirmed, so every yield figure in '
      + 'this document is unsupported and the document must not build');
  }
}

/** Only instructor-led time counts. Pricing off estimated_hours was the first draft bug. */
function assertPricingUsesInstructorLedHoursOnly() {
  const flat = OURS.instructorLedHours.theCorrection.replace(/\s+/g, ' ');
  if (!/estimated_hours/.test(flat) || !/only live session time counts/i.test(flat)) {
    throw new Error('C7.11: the correction explaining that estimated_hours are NOT '
      + 'instructional hours has been dropped; without it the yields read as several times '
      + 'what Massachusetts would actually pay');
  }
  for (const y of ECONOMICS.yields) {
    if (!OURS.programs.some((p) => p.instructorLedHours === y.hours)) {
      throw new Error('C7.11: yield row "' + y.program + '" cites ' + y.hours + ' hours, '
        + 'which matches no measured program');
    }
  }
}

/** The attendance finding is the operational heart. It must not be softened. */
function assertTheAttendanceFindingSurvives() {
  const a = OURS.attendance;
  if (a.verdict !== 'NOBODY HAS EVER REACHED THE BAR MASSACHUSETTS SETS') {
    throw new Error('C7.11: the attendance verdict has been weakened');
  }
  if (a.exactlyOneHundred !== 0) {
    throw new Error('C7.11: somebody is now recorded at 100% attendance without a '
      + 're-measurement');
  }
  if (!(a.best < 100)) {
    throw new Error('C7.11: the best attendance score is no longer below the bar, which '
      + 'inverts the central finding');
  }
  if (!/0 reimbursable/.test(a.theConsequence)) {
    throw new Error('C7.11: the consequence - zero reimbursable slots - has been dropped');
  }
  if (!/sparse and partly corrupt/.test(a.honestCaveat)) {
    throw new Error('C7.11: the caveat that the attendance field is sparse and partly '
      + 'corrupt is gone, which would present 52.8% as a real business metric');
  }
  // The chart draws the distribution directly, so it has to be the thing that was counted.
  const drawn = a.distribution.reduce((s, d) => s + d.n, 0);
  if (drawn !== a.validNonzeroScores) {
    throw new Error('C7.11: the attendance distribution sums to ' + drawn + ' learners but '
      + a.validNonzeroScores + ' were measured, so the chart is not drawing the data');
  }
  if (a.distribution.some((d) => d.score >= 100)) {
    throw new Error('C7.11: a score at or above the reimbursement threshold appeared in '
      + 'the distribution; the chart would contradict the finding above it');
  }
  const top = Math.max(...a.distribution.map((d) => d.score));
  if (Math.abs(top - a.best) > 0.01) {
    throw new Error('C7.11: the stated best score ' + a.best + ' is not the top of the '
      + 'distribution (' + top + ')');
  }
}

/** The attendance projection is a model and must never read as a measurement. */
function assertTheAttendanceModelIsLabeledAsOne() {
  const m = ECONOMICS.attendanceModel;
  if (m.isAModel !== true || !/not a measurement/i.test(m.note)) {
    throw new Error('C7.11: the attendance projection is no longer labeled as a model');
  }
  const short = m.rows.find((r) => r.sessions === 4);
  const long = m.rows.find((r) => r.sessions === 25);
  if (!short || !long || !(short.atNinetyPercent > long.atNinetyPercent)) {
    throw new Error('C7.11: the projection no longer shows short courses reimbursing more '
      + 'often, which is the reason for the recommendation');
  }
  if (!/make-up/i.test(m.theMitigation)) {
    throw new Error('C7.11: the make-up provision, which is the only mitigation, is gone');
  }
}

/** The completion record is zero and must stay stated. */
function assertTheZeroCompletionFindingSurvives() {
  const c = OURS.completion;
  if (c.verdict !== 'NO COMPLETION HAS EVER BEEN RECORDED') {
    throw new Error('C7.11: the zero-completion verdict has been weakened');
  }
  if (c.cohortMembershipsWithCompletedAt !== 0 || c.studentCertificationRows !== 0) {
    throw new Error('C7.11: a completion count was edited upward without a re-measurement');
  }
  if (c.theCompletedCohort.completed !== 0 || c.theCompletedCohort.withdrawn <= 0) {
    throw new Error('C7.11: the completed-cohort-with-no-completions finding has been lost');
  }
  if (!/NOT a bulk close-out/i.test(c.honestCaveat)) {
    throw new Error('C7.11: the finding that the April withdrawals were individually '
      + 'enrolled and partly paid has been dropped');
  }
  if (!/tooling postdates/i.test(c.honestCaveat)) {
    throw new Error('C7.11: the caveat that the evidence tooling postdates the April '
      + 'cohort is gone, which would read an empty table as 13 people doing nothing');
  }
}

/** Platform silence about company history must never be reported as a failed requirement. */
function assertPlatformSilenceIsNotReportedAsFailure() {
  const h = OURS.operatingHistory;
  if (!/CANNOT EVIDENCE/.test(h.verdict) || !/NOT THE SAME AS FAILING/.test(h.verdict)) {
    throw new Error('C7.11: the two-year test was turned into a verdict about the company '
      + 'from a database that is seven months old');
  }
  if (h.alumniImported < 1000) {
    throw new Error('C7.11: the alumni count that evidences a long-running training '
      + 'operation has been edited away');
  }
}

/** A list that has never been called is not a market presence, and must not read as one. */
function assertTheMassachusettsListIsNotCalledAPresence() {
  const m = OURS.massachusetts;
  if (m.maEverContacted !== 0) {
    throw new Error('C7.11: the contacted count changed without a re-measurement');
  }
  if (!/list, not a relationship/i.test(m.verdict)) {
    throw new Error('C7.11: the Massachusetts list has been upgraded into a presence');
  }
  const cold = m.bySource.filter((s) => s.type === 'cold').reduce((a, s) => a + s.n, 0);
  if (cold !== 121) {
    throw new Error('C7.11: the cold share of the Massachusetts list no longer sums to the '
      + 'measured 121');
  }
}

/** The pricing conclusion is the commercial finding. It must stay quantified. */
function assertTheYieldGapIsQuantified() {
  const [short, long] = ECONOMICS.yields;
  if (!(short.perInstructionalHour > long.perInstructionalHour)) {
    throw new Error('C7.11: the short course no longer out-yields the long one, which '
      + 'inverts the central recommendation');
  }
  const ratio = short.perInstructionalHour / long.perInstructionalHour;
  if (Math.abs(ratio - ECONOMICS.yieldRatio) > 0.2) {
    throw new Error('C7.11: the stated yield ratio ' + ECONOMICS.yieldRatio
      + ' no longer matches the yields it summarizes (' + ratio.toFixed(1) + ')');
  }
  const implied = Math.ceil(400000 / short.actuallyPaid);
  if (implied !== ECONOMICS.slotsToReachCap) {
    throw new Error('C7.11: slotsToReachCap (' + ECONOMICS.slotsToReachCap + ') no longer '
      + 'follows from $400,000 / $' + short.actuallyPaid + ' = ' + implied);
  }
}

/** Every gate must say who owns it and whether the calendar permits it. */
function assertEveryGateHasAnOwnerAndADate() {
  for (const g of GATES) {
    if (!g.owner || !g.closeableBy6Nov) {
      throw new Error('C7.11: gate ' + g.n + ' has no owner or no calendar verdict');
    }
  }
  const binary = GATES.filter((g) => g.closeableBy6Nov.startsWith('BINARY'));
  if (binary.length < 2) {
    throw new Error('C7.11: the two binary eligibility disqualifiers are no longer flagged '
      + 'as the first thing to check');
  }
  return GATES.length;
}

/** A recommendation with no stated case against it is advocacy, not analysis. */
function assertTheCaseAgainstIsStated() {
  if (CASE_AGAINST.length < 3) {
    throw new Error('C7.11: the case against has been trimmed below three points');
  }
  const bindingConstraint = CASE_AGAINST.some(
    (x) => /C2\.4/.test(x) && /binding constraint/i.test(x),
  );
  if (!bindingConstraint) {
    throw new Error('C7.11: the C2.4 binding-constraint objection, which is the strongest '
      + 'argument against bidding, is no longer stated');
  }
}

function assertAllGuards() {
  assertNoUnverifiedTermIsPresentedAsFact();
  assertTheSourceLimitationIsDisclosed();
  assertTheEconomicsNameTheirSource();
  assertPricingUsesInstructorLedHoursOnly();
  assertTheAttendanceFindingSurvives();
  assertTheAttendanceModelIsLabeledAsOne();
  assertTheZeroCompletionFindingSurvives();
  assertPlatformSilenceIsNotReportedAsFailure();
  assertTheMassachusettsListIsNotCalledAPresence();
  assertTheYieldGapIsQuantified();
  assertTheCaseAgainstIsStated();
  return assertEveryGateHasAnOwnerAndADate();
}

module.exports = {
  MEASURED_ON, DEADLINE, DAYS_LEFT, VERDICT, RFQ, OURS, ECONOMICS, GATES,
  CASE_AGAINST, CASE_FOR, DECISIONS,
  assertNoUnverifiedTermIsPresentedAsFact,
  assertTheSourceLimitationIsDisclosed,
  assertTheEconomicsNameTheirSource,
  assertPricingUsesInstructorLedHoursOnly,
  assertTheAttendanceFindingSurvives,
  assertTheAttendanceModelIsLabeledAsOne,
  assertTheZeroCompletionFindingSurvives,
  assertPlatformSilenceIsNotReportedAsFailure,
  assertTheMassachusettsListIsNotCalledAPresence,
  assertTheYieldGapIsQuantified,
  assertEveryGateHasAnOwnerAndADate,
  assertTheCaseAgainstIsStated,
  assertAllGuards,
};
