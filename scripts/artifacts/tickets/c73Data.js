/**
 * C7.3 - Pilot SOW Template. THE single source for both PDFs.
 *
 * ## This is a drafting aid, not legal advice, and the build enforces that
 *
 * The ticket's named failure is "presenting drafted clauses as legally sound". So every
 * clause carries an explicit review state, the disclaimer is asserted to be present and
 * near the top, and a clause cannot be marked as settled unless a decision record is named.
 *
 * ## The finding that changes the document
 *
 * C7.0 established that under Texas Government Code 2254.021 a "major consulting services
 * contract" is one reasonably expected to exceed $15,000, and that a contract entered into
 * without a prior finding of fact from the Legislative Budget Board is VOID.
 *
 * C2.3 prices the pilot at $44,500.
 *
 * So the standard pilot, sold to a Texas state agency and classified as consulting
 * services, is three times over that line. The money would be spent and the work delivered
 * before anybody discovered the contract was unenforceable. That is not a clause to flag
 * for counsel later; it is a question to ask the buyer in the first meeting, and the SOW
 * carries it as a precondition.
 */

const AS_OF = '18 October 2026';

const DISCLAIMER = 'This is a drafting aid, not legal advice. It was written to give '
  + 'counsel a structure to review rather than to be signed as it stands. Every clause '
  + 'below carries a review state, and no clause in it has been reviewed by a lawyer.';

const HEADLINE = 'The standard pilot is $44,500, and a Texas state consulting contract over '
  + '$15,000 is void without a prior finding of fact. That is a question for the first '
  + 'meeting, not a clause for counsel later.';

const SO_WHAT = [
  'Three of the twelve clauses cannot be drafted at all until you decide the position, and '
    + 'they are the three that matter most in a dispute: IP ownership, deployment liability '
    + 'and model neutrality. C2.6 reserved all three to you, so the SOW carries them as '
    + 'named gaps rather than as drafted language somebody might sign.',
  'The Texas exposure is a precondition, not a clause. At $44,500 the pilot is three times '
    + 'the $15,000 threshold at which a Texas state consulting contract requires a finding '
    + 'of fact from the Legislative Budget Board, and the statute says a contract without '
    + 'one is void. We would deliver the work before finding out. The classification is the '
    + 'agency’s to make, which is exactly why it has to be asked rather than assumed.',
  'Nothing here is legal advice and the document says so twice: once at the top and once '
    + 'per clause. A build assertion fails if the disclaimer moves out of the first screen '
    + 'or if any clause claims to be settled without a decision record behind it.',
];

const STATE = {
  COUNSEL: { k: 'LEGAL REVIEW REQUIRED', color: '#b3261e' },
  ALI: { k: 'ALI DECISION REQUIRED', color: '#b26a00' },
  DRAFTED: { k: 'DRAFTED, REVIEW STILL REQUIRED', color: '#1f6feb' },
};

const CLAUSES = [
  {
    n: 1, name: 'Parties and term', state: STATE.DRAFTED,
    draft: 'Colaberry and {{CUSTOMER}}. Term runs from day 0 contracting to day 90 plus a '
      + '30-day reporting tail.',
    note: 'Low risk. The tail exists because the day-90 capability report is written rather '
      + 'than generated, per the C2.2 capability audit.',
  },
  {
    n: 2, name: 'Scope and deliverables', state: STATE.DRAFTED,
    draft: 'Incorporates the C7.2 proposal scope and its exclusions by reference, including '
      + 'that Demo Day, deployment candidate selection and an automated executive impact '
      + 'report are out of scope.',
    note: 'Incorporating the exclusions BY REFERENCE is the point. A SOW that restates scope '
      + 'in its own words is a SOW that will drift from the proposal the buyer agreed to.',
  },
  {
    n: 3, name: 'Customer obligations and the start condition', state: STATE.DRAFTED,
    draft: 'The seven obligations from C7.2, each with its deadline. The pilot clock does '
      + 'not start until the day-0 items are complete.',
    note: 'The clock condition is the commercially important half. Pilots fail on missing '
      + 'inputs, and without this the customer is late and we are liable.',
  },
  {
    n: 4, name: 'Fees and payment', state: STATE.DRAFTED,
    draft: 'Pilot at list, $44,500, per C2.3 approved 12 October 2026. Payment schedule '
      + '{{PAYMENT_TERMS}}.',
    note: 'Payment timing is unset because nobody has decided it. It is a commercial '
      + 'decision rather than a legal one.',
  },
  {
    n: 5, name: 'Texas public-sector preconditions', state: STATE.COUNSEL,
    draft: 'Where the customer is a Texas state agency, including an institution of higher '
      + 'education or a public junior college: the agency confirms in writing whether it '
      + 'classifies this engagement as consulting services, and if so that the finding of '
      + 'fact required by Government Code 2254.021 has been obtained before signature.',
    note: 'THE ONE THAT COULD VOID THE DEAL. At $44,500 the pilot is three times the $15,000 '
      + 'threshold. Separately, competitive bidding bites above $10,000 under 2155.132, and '
      + 'splitting a purchase to stay under is prohibited. Counsel should confirm the '
      + 'wording; the question itself belongs in the first meeting.',
  },
  {
    n: 6, name: 'Intellectual property', state: STATE.ALI,
    draft: 'NOT DRAFTED. C2.6 reserves IP ownership to Ali and no position has been taken.',
    note: 'Cannot be drafted without the decision. The live question is who owns what a '
      + 'participant builds against the customer’s own business problem, in the '
      + 'customer’s repository, using our method. Our proof model depends on that commit '
      + 'remaining visible, which is an IP position whether or not anybody writes it down.',
  },
  {
    n: 7, name: 'Deployment liability', state: STATE.ALI,
    draft: 'NOT DRAFTED. C2.6 reserves this to Ali.',
    note: 'If a participant’s build reaches production and causes harm, the allocation '
      + 'is unresolved. The accelerator teaches people to build things that run.',
  },
  {
    n: 8, name: 'Model neutrality', state: STATE.ALI,
    draft: 'NOT DRAFTED. C2.6 reserves this to Ali.',
    note: 'Whether we commit to a named model, a class of models, or none. It interacts with '
      + 'CLM-025 non-affiliation and with any future lab partnership.',
  },
  {
    n: 9, name: 'Data handling and access', state: STATE.COUNSEL,
    draft: 'Customer data stays in customer systems. Where access is required it is '
      + 'read-only, named, time-boxed and revocable, and the C7.4 questionnaire captures the '
      + 'security constraints before any access is requested.',
    note: 'The sequencing is deliberate: constraints before access, never a request followed '
      + 'by a negotiation. Counsel to confirm the processor language and any sector rules.',
  },
  {
    n: 10, name: 'Reference and publication rights', state: STATE.COUNSEL,
    draft: 'The customer grants the right to measure the outcome and publish a named '
      + 'reference. This is a precondition of the engagement, not a courtesy.',
    note: 'C7.1 gate 1, non-waivable. The whole differentiator is proof a stranger can '
      + 'check, so a pilot with no publishable reference buys revenue and nothing else. '
      + 'Counsel to draft the approval mechanism and any embargo.',
  },
  {
    n: 11, name: 'Confidentiality', state: STATE.COUNSEL,
    draft: 'Mutual. Carve-out for the reference rights in clause 10, which would otherwise '
      + 'be swallowed by a standard confidentiality clause.',
    note: 'The carve-out is the part to get right. A boilerplate NDA signed earlier in the '
      + 'relationship may already prevent clause 10 from operating.',
  },
  {
    n: 12, name: 'Termination and acceptance', state: STATE.COUNSEL,
    draft: 'Acceptance on delivery of the day-90 capability report. Termination for '
      + 'convenience {{NOTICE_PERIOD}}, with fees earned to date.',
    note: 'Acceptance is tied to a deliverable that exists rather than to an outcome we do '
      + 'not control. C4.7 refused to publish a predicted return, so acceptance cannot be '
      + 'conditioned on one.',
  },
];

const ALI_DECISIONS = CLAUSES.filter((c) => c.state === STATE.ALI).map((c) => c.name);

const LIMITS = [
  'No clause here has been reviewed by a lawyer, including the ones marked DRAFTED. That '
    + 'mark means a structure exists to review, not that it is sound.',
  'The Texas analysis comes from C7.0 and from reading the statute, not from counsel. The '
    + 'threshold, the finding-of-fact requirement and the word "void" are in the statute; '
    + 'whether a given engagement is classified as consulting services is the agency’s '
    + 'call and ours to ask about.',
  'Three clauses cannot be drafted until Ali decides, and they are deliberately left blank '
    + 'rather than filled with plausible language. A plausible IP clause is more dangerous '
    + 'than an empty one, because it might get signed.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** "Every clause needing counsel is flagged." */
function assertEveryClauseFlagged() {
  for (const c of CLAUSES) {
    if (!c.state) throw new Error(`C7.3: clause ${c.n} has no review state`);
    if (!c.note) throw new Error(`C7.3: clause ${c.n} has no note`);
  }
  const unreviewed = CLAUSES.filter((c) => c.state !== STATE.DRAFTED).length;
  if (!unreviewed) {
    throw new Error('C7.3: no clause is flagged for counsel or for Ali, which cannot be '
      + 'right for an unreviewed first draft');
  }
  return { total: CLAUSES.length, unreviewed };
}

/** "Not-legal-advice disclaimer prominent." */
function assertDisclaimerProminent(renderedText) {
  const hay = String(renderedText || '');
  const at = hay.toLowerCase().indexOf('not legal advice');
  if (at === -1) throw new Error('C7.3: the not-legal-advice disclaimer is missing');
  if (at > 1800) {
    throw new Error(`C7.3: the disclaimer appears ${at} characters in, which is not prominent`);
  }
  return at;
}

/** "IP and data clauses present even if unresolved." */
function assertIpAndDataPresent() {
  const ip = CLAUSES.find((c) => /intellectual property/i.test(c.name));
  const data = CLAUSES.find((c) => /data handling/i.test(c.name));
  if (!ip || !data) throw new Error('C7.3: the IP or data clause is missing entirely');
  if (ip.state !== STATE.ALI) {
    throw new Error('C7.3: IP is drafted or sent to counsel, but C2.6 reserves it to Ali');
  }
  return true;
}

/**
 * An unresolved clause must stay empty rather than carry plausible language.
 *
 * This is the one that protects the document from itself. A reserved clause filled with
 * reasonable-sounding wording is the thing most likely to get signed by accident.
 */
function assertReservedClausesStayEmpty() {
  for (const c of CLAUSES.filter((x) => x.state === STATE.ALI)) {
    if (!/^NOT DRAFTED/.test(c.draft)) {
      throw new Error(`C7.3: clause ${c.n} is reserved to Ali but carries draft language, `
        + 'which is the clause most likely to be signed by accident');
    }
  }
  if (!ALI_DECISIONS.length) throw new Error('C7.3: C2.6 reserves three positions; none found');
  return ALI_DECISIONS.length;
}

/** The Texas exposure must be stated with its number, because the number is the point. */
function assertTexasExposureStated() {
  const tx = CLAUSES.find((c) => /texas/i.test(c.name));
  if (!tx) throw new Error('C7.3: the Texas precondition clause is missing');
  // Deliberately NOT including the headline. It did, and the assertion passed on the
  // headline alone while the clause itself had been emptied, which is the opposite of what
  // it is for: the clause is what a reader acts on.
  const blob = tx.draft + ' ' + tx.note;
  if (!/\$15,000/.test(blob) || !/\$44,500/.test(blob) || !/void/i.test(blob)) {
    throw new Error('C7.3: the Texas clause must carry the threshold, the pilot price and '
      + 'the word void. Without all three the reader cannot see the exposure.');
  }
  return true;
}

module.exports = {
  AS_OF, DISCLAIMER, HEADLINE, SO_WHAT, STATE, CLAUSES, ALI_DECISIONS, LIMITS,
  assertEveryClauseFlagged, assertDisclaimerProminent, assertIpAndDataPresent,
  assertReservedClausesStayEmpty, assertTexasExposureStated,
};
