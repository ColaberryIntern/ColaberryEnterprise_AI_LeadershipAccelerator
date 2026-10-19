/**
 * C7.0 - ETPL go/no-go and the HB 3512 channel. THE single source for both PDFs.
 *
 * ## Scope, as the ticket left it
 *
 * Workstream 1, the chapter 132 Letter of Exemption, is WITHDRAWN. Ali's correction of 8
 * October: Colaberry is already a TWC-licensed career school holding a Certificate of
 * Approval, and Swati is already mid-flight on the CSC-017 route for the AI courses. Nothing
 * here reopens it. What is left is two commercial decisions.
 *
 * ## Every figure was verified against a primary source on 17 October 2026
 *
 * dir.texas.gov, twc.texas.gov, 40 TAC Chapter 840, and WD Letter 05-19 Change 3. No
 * search-engine summary was accepted. Counts from the DIR certified list were extracted from
 * the PDF and cross-checked a second way before being printed here.
 *
 * ## The finding that changes the question
 *
 * The ticket already suspected that a DIR cooperative contract is worth more than the
 * certification. It is worse than that for anyone without one: DIR's own footnote says a
 * state agency MUST buy through a cooperative contract or file a procurement exemption, and
 * only 8 of 76 vendor programs on the certified list carry one. Certification without a
 * vehicle does not make you buyable by a state agency.
 */

const AS_OF = '17 October 2026';

const SRC = {
  DIR: { k: 'DIR.TEXAS.GOV', color: '#1f6feb' },
  RULE: { k: '40 TAC / WD LETTER', color: '#2f7d32' },
  STATUTE: { k: 'TEXAS STATUTE', color: '#7a4fb6' },
  UNVERIFIED: { k: 'NOT VERIFIED', color: '#b3261e' },
};

const HEADLINE = 'Both answers are no, and for the same reason: the thing being chased is not '
  + 'the thing that unlocks the buyer. ETPL buys access to individually funded students we do '
  + 'not sell to, and DIR certification does not make a state agency able to buy from us.';

const SO_WHAT = [
  'ETPL is a no-go on the evidence. A workforce board can fund incumbent worker training '
    + 'through a training contract instead of an Individual Training Account, and 40 TAC '
    + '840.62(c) states that contract-funded programs are exempt from the ETPL information '
    + 'and performance requirements. Listing buys ITA-funded individual students, which is a '
    + 'channel we are not pursuing, and it costs a standing compliance liability.',
  'The price of that listing is the part worth refusing. Annual student-level reporting '
    + 'including Social Security numbers for EVERY student in the program and not only the '
    + 'funded ones, a FERPA authorized-representative designation for TWC, and removal from '
    + 'the list for not less than 24 months for a single missed deadline.',
  'On HB 3512 the certification is not the asset. DIR’s own footnote binds state agencies '
    + 'to buy through a DIR cooperative contract or file an exemption, and only 8 of the 76 '
    + 'certified vendor programs carry one. The two live routes are to pursue a cooperative '
    + 'contract, which is the real barrier, or to sell to local government and school '
    + 'districts, whom that footnote does not bind.',
];

/* ------------------------------------------------------------------ *
 * THE TWO DECISIONS
 * ------------------------------------------------------------------ */

const DECISIONS = [
  {
    n: 1,
    q: 'Do we pursue an ETPL listing?',
    rec: 'NO, and revisit only if ITA-funded individual enrollment becomes a target channel.',
    because: 'The revenue that motivated the question, incumbent worker training bought by a '
      + 'local workforce board, does not require it. 40 TAC 840.62(c)(1) names incumbent '
      + 'worker training as contractable, and 840.62(c)(3) exempts contract-funded programs '
      + 'from the chapter’s information and performance requirements. ETPL is the '
      + 'gateway to ITA-funded individual students only, per 840.40(a) and 840.61(a).',
    cost: 'Annual student-level reporting with SSNs for all students, FERPA designation, '
      + 'and a 24-month removal penalty for one missed deadline.',
  },
  {
    n: 2,
    q: 'Do we build a DIR-certified AI awareness module?',
    rec: 'NOT on its own. Pursue the cooperative contract, or sell where the contract rule '
      + 'does not reach.',
    because: 'Applications are closed with no published reopening date, so the certification '
      + 'route is blocked in the near term regardless. And certification alone does not make '
      + 'a state agency able to buy: DIR requires them to purchase through a cooperative '
      + 'contract or request an exemption, and 68 of the 76 certified vendor programs have '
      + 'no contract number.',
    cost: 'The module itself is a commodity. DIR gives its own away at no charge and review '
      + 'costs nothing, so nothing keeps competitors out either.',
  },
];

/* ------------------------------------------------------------------ *
 * THE MEASUREMENTS
 * ------------------------------------------------------------------ */

const NUMBERS = [
  { k: 'Certified AI awareness programs in total', v: '127', src: SRC.DIR,
    how: 'FY26-27 Certified AI Awareness Training Programs Final 4.0, last updated '
      + '21 September 2026. Counted by hand and cross-checked against points of contact.' },
  { k: 'Of those, vendor-provided', v: '76', src: SRC.DIR,
    how: '32 are public-sector provided and 19 are not available to other organizations.' },
  { k: 'Vendor programs carrying a DIR cooperative contract', v: '8', src: SRC.DIR,
    how: '10.5% of 76, across 7 distinct vendors and 15 unique DIR-CPO numbers. Zero in the '
      + 'other two sections, which have no contract column at all.' },
  { k: 'Vendor programs a state agency cannot simply buy', v: '68', src: SRC.DIR,
    how: 'The remainder. The buyer must request a procurement exemption to purchase them.' },
  { k: 'Cost to have a program certified', v: '$0', src: SRC.DIR,
    how: 'DIR: "There is no cost to have a training program reviewed for certification." '
      + 'Which is also why nothing keeps competitors out.' },
  { k: 'Cost of DIR’s own AI training to a public buyer', v: '$0', src: SRC.DIR,
    how: 'DIR publishes a certified program at no cost. It has no tracking and issues no '
      + 'completion certificates, which is the only gap in it worth selling against.' },
  { k: 'ETPL removal for one missed report', v: '24 months', src: SRC.RULE,
    how: '40 TAC 840.31(g) and 840.51(a): removal for not less than two years.' },
  { k: 'DIR application reopening date', v: 'none published', src: SRC.UNVERIFIED,
    how: 'Checked the page, the DIR news index, both AI training news items and the FY26-27 '
      + 'standards PDF. Nothing announces a reopening. 31 August is DIR’s published '
      + 'annual cadence and is a planning assumption, not a fact.' },
];

/* ------------------------------------------------------------------ *
 * WHAT ETPL ACTUALLY COSTS, which is the argument
 * ------------------------------------------------------------------ */

const ETPL_COST = [
  { k: 'Who must be reported',
    v: 'Every student in the program, not only WIOA-funded ones',
    cite: '40 TAC 840.30(c), outcomes for "WIOA participants and students in general"' },
  { k: 'What must be reported',
    v: 'Name, Social Security number, first and last date of attendance, credential earned '
      + 'and date',
    cite: '40 TAC 840.30(b)' },
  { k: 'FERPA',
    v: 'TWC must be designated an authorized representative for the disclosure of education '
      + 'records, re-acknowledged at every annual report',
    cite: '40 TAC 840.53(b) to (d)' },
  { k: 'Missing an SSN',
    v: 'The student is scored as "not employed", so a gap in data reads as a failure',
    cite: 'WD 05-19 Change 3, Attachment 1' },
  { k: 'Missing a deadline',
    v: 'Removal of the program from the statewide list for not less than 24 months',
    cite: '40 TAC 840.31(g), 840.51(a)' },
  { k: 'Failing performance',
    v: 'Improvement plan, then suspension of board-funded enrollment, then revocation in the '
      + 'third consecutive year',
    cite: 'WD 05-19 Change 3, Attachment 1' },
];

/* ------------------------------------------------------------------ *
 * WHAT WE ALREADY SATISFY, so the no-go is a choice and not a failure
 * ------------------------------------------------------------------ */

const ALREADY_MET = [
  { k: 'Licensure', v: 'Our TWC Certificate of Approval satisfies it',
    cite: '40 TAC 840.10: a proprietary school compliant with Education Code chapter 132 is '
      + 'appropriately licensed for this purpose' },
  { k: 'Physical Texas location', v: 'Plano satisfies it',
    cite: '40 TAC 840.64(a): TWC may not list an out-of-state provider with no physical '
      + 'Texas training location' },
];

/* ------------------------------------------------------------------ *
 * THE CHANNEL CONSTRAINT THAT OUTLIVES BOTH DECISIONS
 * ------------------------------------------------------------------ */

const TEXAS_TRAP = {
  what: 'A Texas state consulting contract over $15,000 can be VOID',
  detail: 'Government Code 2254.021, 2254.028 and 2254.029. A major consulting services '
    + 'contract is one reasonably expected to exceed $15,000, or $25,000 for most '
    + 'institutions of higher education. Before signing, the agency must notify the '
    + 'Legislative Budget Board and the Governor’s Budget and Planning Office and obtain '
    + 'a finding that the services are necessary. A contract entered into without that '
    + 'finding is void, and we would have delivered the work before finding out.',
  follows: [
    'Ask early whether the buyer is treating the engagement as consulting services. Training '
      + 'against a fixed curriculum is not obviously consulting; curriculum design and '
      + 'advisory work is. The classification is the agency’s to make.',
    'Competitive bidding is required once a written-contract purchase exceeds $10,000, with '
      + 'at least three bids attempted, and splitting a purchase to stay under is prohibited.',
    'Local workforce boards are a materially easier buyer than a state agency, and C2.5 found '
      + 'they place the largest training orders in the state co-op data.',
  ],
};

/* ------------------------------------------------------------------ *
 * WHAT WE COULD NOT ESTABLISH
 * ------------------------------------------------------------------ */

const UNVERIFIED = [
  'Any DIR application reopening date. None is published anywhere we checked.',
  'What an exception request to DIR must contain. No form, no criteria, no review timeline '
    + 'and no success rate is documented, so a strong application cannot be assumed to work.',
  'How to obtain a DIR cooperative contract, whether those vehicles are open for new awards, '
    + 'and what that costs. This is now the highest-value open question and it was outside '
    + 'the brief.',
  'What DIR-CPO-5687 is, or who holds it. It appears against two unrelated vendors, which '
    + 'suggests a reseller vehicle. If so, buying through an existing holder may be faster '
    + 'than winning an award.',
  'Whether TWC charges any ETPL fee. No fee is stated in chapter 840, WD 05-19 Change 3 or '
    + 'the TWC page. Absence in those documents is not proof of absence.',
  'Whether any Colaberry program maps to the statewide target occupations list, which is a '
    + 'prerequisite for any ETPL application.',
  'Local government and school district procurement rules. The DIR cooperative-contract '
    + 'footnote binds state agencies only, but each local entity has its own rules.',
];

/** A live defect on TWC's own page, worth recording because it will mislead somebody. */
const TWC_PAGE_DEFECT = 'TWC’s Eligible Training Providers page still instructs that '
  + 'performance must meet the standards in WD 05-19 Change 2, which Change 3 rescinded on '
  + '30 September 2026. Three of its linked documents are marked "updates in progress". Go to '
  + 'the WD letter directly; the landing page is not current.';

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

function assertSourced() {
  const bad = NUMBERS.filter((n) => !n.src || !n.how || !String(n.how).trim());
  if (bad.length) throw new Error('C7.0: unsourced figure(s): ' + bad.map((b) => b.k).join('; '));
  return NUMBERS.length;
}

/** 8 of 76 is the whole argument. If the arithmetic drifts, the document is wrong. */
function assertContractArithmetic() {
  const n = (k) => NUMBERS.find((x) => x.k === k).v;
  const vendor = Number(n('Of those, vendor-provided'));
  const withContract = Number(n('Vendor programs carrying a DIR cooperative contract'));
  const without = Number(n('Vendor programs a state agency cannot simply buy'));
  if (withContract + without !== vendor) {
    throw new Error(`C7.0: ${withContract} + ${without} does not equal ${vendor} vendor programs`);
  }
  const total = Number(n('Certified AI awareness programs in total'));
  if (vendor + 32 + 19 !== total) {
    throw new Error(`C7.0: the three sections do not sum to ${total}`);
  }
  return { vendor, withContract, without, total };
}

/**
 * The withdrawn workstream must stay withdrawn.
 *
 * Ali withdrew the chapter 132 thread because Swati already owns it. A document that quietly
 * reopens it would send two people at one regulator, which is the specific thing the
 * correction existed to prevent.
 */
function assertChapter132StaysWithdrawn() {
  const prose = [HEADLINE, ...SO_WHAT, ...DECISIONS.map((d) => d.q + d.rec + d.because)]
    .join(' ').toLowerCase();
  for (const banned of ['letter of exemption', 'csc-017', 'chapter 132 exemption']) {
    if (prose.includes(banned)) {
      throw new Error('C7.0: the prose reopens the withdrawn workstream ("' + banned + '")');
    }
  }
  return true;
}

/** Nothing may be stated as fact that the research marked not verified. */
function assertUnverifiedStaysUnverified() {
  const reopening = NUMBERS.find((n) => n.k === 'DIR application reopening date');
  if (reopening.src !== SRC.UNVERIFIED || !/none published/i.test(reopening.v)) {
    throw new Error('C7.0: the reopening date is not published and must not be stated as one');
  }
  if (!UNVERIFIED.length) throw new Error('C7.0: the not-verified list may not be empty');
  return UNVERIFIED.length;
}

module.exports = {
  AS_OF, SRC, HEADLINE, SO_WHAT, DECISIONS, NUMBERS, ETPL_COST, ALREADY_MET,
  TEXAS_TRAP, UNVERIFIED, TWC_PAGE_DEFECT,
  assertSourced, assertContractArithmetic, assertChapter132StaysWithdrawn,
  assertUnverifiedStaysUnverified,
};
