/**
 * C4.13 - the funder-facing impact brief for the Renaissance Philanthropy path.
 *
 * WHAT THIS TICKET ASKED FOR AND WHY IT IS NOT WHAT SHIPPED. The brief was to carry "who
 * we move, from what to what, with what verified evidence, at what cost per person, and
 * what the money would buy", with the spine being the claim that learners with no IT
 * experience are doing well, quantified or cut.
 *
 * It is cut, and the measurement is the deliverable. Both halves of that claim fail
 * against production, the four recognitions that would carry a philanthropy pitch have no
 * primary source on file, and a cost per person cannot be computed because burn, revenue
 * and the learner count are all unknown. Writing the brief anyway would have manufactured
 * exactly the claim the ticket says a funder tests first.
 *
 * THE RULE THIS FILE ENFORCES: no outcome claim leaves this document without either a
 * claim-registry row or a measurement behind it. `assertNoOutcomeIsAsserted` is the gate,
 * and it exists because the failure mode here is not laziness, it is fluency: a funder
 * brief is the document where good writing most easily outruns the evidence.
 */

const AS_OF = '26 October 2026';

/* ------------------------------------------------------------------ *
 * Who this is for
 * ------------------------------------------------------------------ */

const AUDIENCE = {
  name: 'Renaissance Philanthropy',
  why: 'A funder, not a buyer. Funded by Eric and Wendy Schmidt, active in AI and '
    + 'education. The introduction was offered unprompted by Heeseung Kim on the '
    + '13 October call and taken up on 14 October.',
  problem: 'Both existing marketing documents are commercial capability sheets written '
    + 'for a buyer. Neither tells an impact story, which is the only story a funder is '
    + 'reading for.',
  theyWillCheck: 'This ecosystem overlaps ours. Jobs for the Future co-sponsored the '
    + 'XPRIZE Rapid Reskilling competition we cite. Assume every recognition on the page '
    + 'is checked by someone who already knows the programs.',
};

/* ------------------------------------------------------------------ *
 * The recognitions: for a philanthropy these ARE the argument
 * ------------------------------------------------------------------ */

const RECOGNITIONS = [
  {
    row: 'CLM-013',
    claim: 'Work of the Future Solver at MIT Solve 2018, one of eight from more than '
      + '1,150 applications across 110 countries',
    src: 'MIT Solve',
    primarySource: null,
    dated: false,
  },
  {
    row: 'CLM-014',
    claim: 'Patrick J. McGovern Foundation Artificial Intelligence for the Betterment of '
      + 'Humanity Prize, at MIT Solve 2018',
    src: 'MIT Solve',
    primarySource: null,
    dated: false,
  },
  {
    row: 'CLM-015',
    claim: 'General Motors Prize for Advanced Technologies, at MIT Solve 2018',
    src: 'MIT Solve',
    primarySource: null,
    dated: false,
  },
  {
    row: 'CLM-016',
    claim: 'One of seven finalists in the JFF Labs $1 Billion Wage Gain Challenge, 2019',
    src: 'JFF Labs',
    primarySource: null,
    dated: false,
  },
  {
    row: 'CLM-017',
    claim: 'Finalist in XPRIZE Rapid Reskilling as a partner in Team VITAL, with '
      + 'Gleechi AB and Banyan Tree Global',
    src: 'XPRIZE, retrieved',
    primarySource: null,
    dated: false,
  },
];

/**
 * The comparison that makes the gap undeniable.
 *
 * The registry is not sloppy in general. Its Anthropic rows carry real URLs. The award
 * rows carry an organization name where a source belongs, which means the format already
 * expects what these five are missing.
 */
const SOURCING_CONTRAST = {
  sourced: [
    { row: 'CLM-020', src: 'anthropic.com/news/claude-partner-network' },
    { row: 'CLM-022', src: 'anthropic.com/news/claude-frontier-academy' },
    { row: 'CLM-023', src: 'anthropic.com/news/claude-frontier-academy' },
  ],
  unsourced: RECOGNITIONS.map((r) => ({ row: r.row, src: r.src })),
  point: 'Three Anthropic rows carry a URL. Five award rows carry an organization name in '
    + 'the field where the URL goes. The registry format already expects a source; the '
    + 'awards simply do not have one.',
};

/**
 * One recognition is blocked by our own governance and live on our own website.
 *
 * This is the single most urgent item here, because it is the one a funder could find
 * without asking us anything.
 */
const LIVE_CONTRADICTION = {
  row: 'CLM-019',
  registry: 'BLOCKED. "MIT Solve Community Favorite Award" is unevidenced.',
  where: 'apps/refactored-public/src/index.html:122-123 and '
    + 'apps/refactored-public/src/about/index.html:88',
  shipping: 'MIT Solve / Community Favorite Award',
  why: 'The claim registry refuses this wording as unevidenced and the public site '
    + 'displays it anyway. A funder checking our awards reaches the website before they '
    + 'reach us.',
};

/** Worth knowing before anyone repeats the XPRIZE line to this ecosystem. */
const XPRIZE_NOTE = 'XPRIZE Rapid Reskilling concluded in January 2023 with no grand '
  + 'prize awarded, and was sponsored by New Profit with Jobs for the Future. The '
  + 'finalist claim may be perfectly accurate. It will be read by people who know how '
  + 'that competition ended, so it needs its primary source more than any other row here.';

/* ------------------------------------------------------------------ *
 * The spine claim, measured
 * ------------------------------------------------------------------ */

/**
 * "Learners with no IT experience are doing well." Quantify it or cut it.
 *
 * Measured against production on 26 October 2026. Both halves fail independently, which
 * is why the verdict is cut rather than soften.
 */
const SPINE = {
  claim: 'Learners with no IT experience are doing well',
  verdict: 'CUT',
  halves: [
    {
      half: 'no IT experience',
      finding: 'Derivable for 51 of 918 enrollments, which is 5.6%, and only by inference '
        + 'from a resume extraction rather than from anything a learner declared. '
        + 'onboarding_profiles holds 65 rows against 918 enrollments. The remaining 94.4% '
        + 'have no background record of any kind.',
    },
    {
      half: 'are doing well',
      finding: 'Every candidate measure contradicts it. Our own progression ladder puts '
        + '842 of 871 learners at rank 0, which is 96.7%, with 29 ever promoted and one '
        + 'person at rank 3. Milestones record 12 people with a completed project and 4 '
        + 'with completed curriculum. outcome_measurements holds 3,532 rows and is a '
        + 'software defect-recurrence system with no learner data in it.',
    },
  ],
  employment: 'There is no employment, wage or placement data anywhere in the platform. '
    + 'Every column across all 571 production tables was scanned for salary, wage, '
    + 'placement, hired and employer. The only matches are a referral contact job_title, '
    + 'a curriculum placement_score, and two unrelated identifiers.',
  alreadyKnown: 'The codebase already says this plainly where it matters. '
    + 'systemsBuiltByLearners.ts carries "IT COUNTS SYSTEMS, NEVER PEOPLE ... this cannot '
    + 'become a per-learner figure by a later edit; the data to do that is not present." '
    + 'The honest version of the claim is already written and has simply never reached a '
    + 'document anyone outside sees.',
};

/* ------------------------------------------------------------------ *
 * Unsourced outcome claims that are LIVE
 * ------------------------------------------------------------------ */

/**
 * The reason this ticket is urgent rather than merely overdue.
 *
 * Every row is a figure about learner outcomes that is already reaching people outside
 * the company with no source behind it. A funder brief is not the first place we would
 * make an unevidenced outcome claim. It would be the fourth.
 */
const LIVE_RISKS = [
  {
    what: 'The average graduate doubled their income after completing the program',
    where: 'backend/src/services/alumniCampaignService.ts:18',
    how: 'A live outbound system prompt. An LLM is told this as fact and writes alumni '
      + 'email from it.',
    severity: 'HIGHEST. Unsourced, undated, no sample, and it is the exact claim class a '
      + 'funder tests first.',
  },
  {
    what: '$100M+ in wage impact, 5,000+ careers, 10,000+ professionals trained',
    where: 'backend/src/data/classTeachContent.ts:120-121',
    how: 'Taught live in class. The slide immediately above it carries a proper evidence '
      + 'array citing PwC and the World Economic Forum with publishers and dates. This '
      + 'one has no evidence array at all.',
    severity: 'HIGH. The contrast proves the mechanism exists and was not used.',
  },
  {
    what: 'Job Placement 72%',
    where: 'backend/src/seeds/seedDepartments.ts:136',
    how: 'Seed data rendered on a departmental dashboard. There is no production source '
      + 'for a placement rate because no placement data exists.',
    severity: 'MEDIUM. Internal today, but it is a number on a screen that reads as real.',
  },
  {
    what: '5,000+ careers since 2012',
    where: 'frontend/public/knowledge/ brand kit, nine files',
    how: 'Repeated across the brand kit as an approved proof point with no source row.',
    severity: 'MEDIUM. Our own knowledge base says "Do not invent testimonials, '
      + 'placement rates, or salary figures" on the same asset.',
  },
];

/* ------------------------------------------------------------------ *
 * What we CAN put in front of a funder
 * ------------------------------------------------------------------ */

const DEFENSIBLE = [
  {
    fact: '395 verified evidence rows, 295 of them publicly openable',
    basis: 'case_study_evidence, measured 26 October 2026. GitHub commits, repository '
      + 'files and repositories a funder can click and read without asking us.',
    kind: 'measured',
  },
  {
    fact: '345 commit-verified learner stories across 29 projects',
    basis: 'Registry row CLM-002, reproducible as a single query against student_tasks '
      + 'where verified_by is build_pipeline:repo_verification.',
    kind: 'registry',
  },
  {
    fact: '13 approved case studies, of which 2 are learner-built',
    basis: 'case_studies, measured 26 October 2026. The 11 others are '
      + 'built_by=colaberry_team. Stating the split is what makes the 13 usable.',
    kind: 'measured',
  },
  {
    fact: '918 enrollments, 855 active, across 5 cohorts',
    basis: 'enrollments and cohorts, measured 26 October 2026.',
    kind: 'measured',
  },
  {
    fact: 'Cost per verified story',
    basis: 'C4.7 names it the only efficiency figure that is ours to quote, because both '
      + 'halves are things we measure. It is a cost per unit of work, never per person.',
    kind: 'registry',
  },
];

/** The ticket asked for cost per person. It cannot be computed, and that is locked. */
const COST_PER_PERSON = {
  verdict: 'CANNOT BE COMPUTED',
  because: 'C4.8 records current monthly operating burn as UNKNOWN and current monthly '
    + 'revenue as UNKNOWN, and an assertion in that module fails the build if either is '
    + 'filled in without the P&L. It also records that we cannot currently count learners '
    + 'at all. A cost per person needs a numerator we do not have and a denominator we '
    + 'cannot produce.',
  nearest: 'The closest existing arithmetic is revenue per head, and C4.8 states it '
    + 'precisely to show why the figure cannot be quoted: the same $111,000 of platform '
    + 'revenue is $1,134 a head over 100 learners and $46 over 5,000, and revenue alone '
    + 'cannot tell you which is happening.',
};

/* ------------------------------------------------------------------ *
 * The recommendation
 * ------------------------------------------------------------------ */

const RECOMMENDATION = {
  verdict: 'DO NOT SEND AN IMPACT BRIEF BUILT ON OUTCOMES',
  instead: 'Lead with the build-evidence spine, which is real, checkable and unusual: '
    + '295 publicly openable evidence rows and 345 commit-verified stories. Then state '
    + 'the gap in our own words before a funder finds it.',
  theAsk: 'The honest pitch to this funder is the gap itself. We can prove what people '
    + 'build and we cannot yet prove what happens to them afterwards. Renaissance '
    + 'Philanthropy funds AI and education. Funding the outcome measurement is a coherent '
    + 'ask, and it is the only ask our evidence currently supports.',
  before: [
    'Obtain a primary source for each of the five award rows. A URL, a letter or a press '
      + 'release, attached to the registry row, with a retrieval date.',
    'Remove or source the income-doubling sentence in alumniCampaignService.ts. It is '
      + 'live in outbound mail today.',
    'Decide on the Community Favorite Award. The registry blocks it and the public site '
      + 'ships it; those cannot both stand.',
    'Source or remove the $100M wage impact and 5,000 careers figures, or mark them the '
      + 'way the slide above them is already marked.',
  ],
};

/* ------------------------------------------------------------------ *
 * Guards - the acceptance criteria as build gates
 * ------------------------------------------------------------------ */

/**
 * The document may not assert a learner outcome.
 *
 * This is the whole point. Every defensible fact must be a count of artifacts or people
 * enrolled, never a claim about what happened TO a person, because no such measurement
 * exists. Checked by vocabulary rather than by intent, because the words are what ship.
 */
function assertNoOutcomeIsAsserted() {
  const outcomeWords = /\b(placed|placement rate|hired|salary|wage gain|doubled|promoted into|employment outcome|got a job|career outcome)\b/i;
  for (const d of DEFENSIBLE) {
    if (outcomeWords.test(d.fact) || outcomeWords.test(d.basis)) {
      throw new Error(`C4.13: defensible fact "${d.fact}" asserts a learner outcome`);
    }
  }
  if (SPINE.verdict !== 'CUT') {
    throw new Error('C4.13: the spine claim was not cut, but nothing measures it');
  }
  return DEFENSIBLE.length;
}

/** Every defensible fact needs a measurement or a registry row behind it. */
function assertEveryDefensibleFactHasABasis() {
  for (const d of DEFENSIBLE) {
    if (d.kind !== 'measured' && d.kind !== 'registry') {
      throw new Error(`C4.13: "${d.fact}" has basis kind "${d.kind}"`);
    }
    if (!d.basis || d.basis.length < 40) {
      throw new Error(`C4.13: "${d.fact}" has no usable basis`);
    }
  }
  return DEFENSIBLE.length;
}

/**
 * Every recognition must state its sourcing honestly, and today that means null.
 *
 * If somebody later attaches a real source, this guard stops silently passing: it counts
 * how many are still unsourced and the renderer prints that count, so the document cannot
 * keep claiming a gap that has been closed, or close one that has not.
 */
function assertRecognitionSourcingIsStated() {
  let unsourced = 0;
  for (const r of RECOGNITIONS) {
    if (!r.row || !/^CLM-\d{3}$/.test(r.row)) {
      throw new Error(`C4.13: recognition "${r.claim}" has no registry row id`);
    }
    if (r.primarySource === undefined) {
      throw new Error(`C4.13: recognition ${r.row} does not state whether it has a source`);
    }
    if (r.primarySource === null) unsourced += 1;
  }
  if (unsourced !== SOURCING_CONTRAST.unsourced.length) {
    throw new Error('C4.13: the sourcing contrast disagrees with the recognition list');
  }
  return unsourced;
}

/** Every live risk must be citable, or it is gossip rather than a finding. */
function assertEveryLiveRiskCitesItsLocation() {
  for (const r of LIVE_RISKS) {
    if (!r.where || !/[/\\].+\.(ts|js|tsx|html|json)(:\d+)?|knowledge\//.test(r.where)) {
      throw new Error(`C4.13: live risk "${r.what}" does not cite a file`);
    }
  }
  if (LIVE_RISKS.length === 0) {
    throw new Error('C4.13: the live-risk list is empty; re-measure before shipping');
  }
  return LIVE_RISKS.length;
}

/** A cost per person must not appear anywhere while it cannot be computed. */
function assertNoCostPerPersonIsQuoted() {
  if (COST_PER_PERSON.verdict !== 'CANNOT BE COMPUTED') {
    throw new Error('C4.13: a cost per person was quoted; burn and revenue are UNKNOWN');
  }
  if (/\$\d/.test(COST_PER_PERSON.verdict)) {
    throw new Error('C4.13: the cost-per-person verdict carries a figure');
  }
}

module.exports = {
  AS_OF, AUDIENCE, RECOGNITIONS, SOURCING_CONTRAST, LIVE_CONTRADICTION, XPRIZE_NOTE,
  SPINE, LIVE_RISKS, DEFENSIBLE, COST_PER_PERSON, RECOMMENDATION,
  assertNoOutcomeIsAsserted, assertEveryDefensibleFactHasABasis,
  assertRecognitionSourcingIsStated, assertEveryLiveRiskCitesItsLocation,
  assertNoCostPerPersonIsQuoted,
};
