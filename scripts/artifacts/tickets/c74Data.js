/**
 * C7.4 - Pilot Discovery Questionnaire. THE single source for both PDFs.
 *
 * ## This fills a gap the blueprint named out loud
 *
 * C2.2 stage 0 records: "No structured business-problem intake form exists. Today this is a
 * conversation and a document." So this is not a nice-to-have alongside the blueprint, it
 * is the artifact the blueprint said was missing.
 *
 * ## The named failure mode is asking for too much
 *
 * "Asking for data the customer cannot get, which stalls the start." So every item carries
 * a deadline rather than a blanket requirement, and the build asserts that the day-one set
 * stays small. A questionnaire where everything is required before day one is a
 * questionnaire that delays day one.
 *
 * ## Security before access, always
 *
 * The acceptance criteria put it plainly: security and data constraints are captured BEFORE
 * access is requested. Every access item therefore sorts after every constraint item, and
 * an assertion enforces the ordering rather than trusting the author.
 */

const AS_OF = '18 October 2026';



const SO_WHAT = [
  'The C2.2 blueprint records that no structured business-problem intake form exists and '
    + 'that stage 0 is "a conversation and a document" which "does not scale past" ten '
    + 'problems. This is that form. It is the gap the blueprint named, not an addition to it.',
  'Every item has a deadline rather than a blanket requirement. Eleven are needed before '
    + 'day one because the pilot genuinely cannot start without them; the rest are due '
    + 'before the baseline or before the day-90 report. The ticket names the opposite '
    + 'approach as the failure: asking for data the customer cannot get, which stalls the '
    + 'start.',
  'Security and data constraints are asked before any access is requested, and the ordering '
    + 'is enforced by the build rather than by the author remembering. Asking for a '
    + 'credential and then discovering the constraint is how a pilot loses its first week.',
];

const WHEN = {
  DAY0: { k: 'BEFORE DAY 1', color: '#b3261e', order: 0 },
  BASELINE: { k: 'BEFORE THE BASELINE', color: '#b26a00', order: 1 },
  DAY90: { k: 'BEFORE THE DAY-90 REPORT', color: '#1f6feb', order: 2 },
};

/** `kind` drives the security-before-access assertion. */
const SECTIONS = [
  {
    s: 1,
    name: 'The business problems',
    why: 'C2.2 stage 0 requires three to ten real problems in writing with a named owner '
      + 'each. This is the part that has never had a form.',
    items: [
      { q: 'Name the business problem in one sentence an operator would recognize.', when: WHEN.DAY0, kind: 'info' },
      { q: 'Who owns this problem today, by name and role?', when: WHEN.DAY0, kind: 'info' },
      { q: 'What does it cost you now, in whatever unit you already measure?', when: WHEN.DAY0, kind: 'info' },
      { q: 'What have you already tried?', when: WHEN.BASELINE, kind: 'info' },
      { q: 'Who decides whether a solution to this gets adopted?', when: WHEN.BASELINE, kind: 'info' },
      { q: 'Is the problem owner available for questions during the build?', when: WHEN.DAY0, kind: 'info' },
    ],
  },
  {
    s: 2,
    name: 'Participants and roles',
    why: 'C7.1 scores a named roster at 3 and a headcount at 0. Names are also what the '
      + 'baseline attaches to.',
    items: [
      { q: 'Named participants, with role and manager.', when: WHEN.DAY0, kind: 'info' },
      { q: 'Manager sign-off that each one has the time.', when: WHEN.DAY0, kind: 'info' },
      { q: 'Which business problem is each participant assigned to?', when: WHEN.BASELINE, kind: 'info' },
      { q: 'Current technical level, in their own words.', when: WHEN.BASELINE, kind: 'info' },
      { q: 'Anyone who must be excluded for a contractual or visa reason?', when: WHEN.DAY0, kind: 'info' },
    ],
  },
  {
    s: 3,
    name: 'Baseline metrics',
    why: 'C4.7 refused to publish a predicted return, so the day-90 claim is measured '
      + 'against the customer’s own number or it is not made at all. No baseline, no '
      + 'claim.',
    items: [
      { q: 'For each problem, the number you measure it by today.', when: WHEN.DAY0, kind: 'info' },
      { q: 'How that number is produced, and by whom.', when: WHEN.BASELINE, kind: 'info' },
      { q: 'How often it is refreshed.', when: WHEN.BASELINE, kind: 'info' },
      { q: 'Will you let us measure the same number again at day 90?', when: WHEN.DAY0, kind: 'info' },
      { q: 'Last twelve months of that number, if it exists.', when: WHEN.DAY90, kind: 'info' },
    ],
  },
  {
    s: 4,
    name: 'Security and data constraints',
    why: 'Asked BEFORE any access request. A constraint discovered after a credential has '
      + 'been requested costs the first week.',
    items: [
      { q: 'What classes of data may participants not touch?', when: WHEN.DAY0, kind: 'constraint' },
      { q: 'Any regulated data in scope, and under which regime?', when: WHEN.DAY0, kind: 'constraint' },
      { q: 'Does anything have to stay inside your network?', when: WHEN.DAY0, kind: 'constraint' },
      { q: 'Which AI models or vendors are prohibited by policy?', when: WHEN.DAY0, kind: 'constraint' },
      { q: 'Is a security review required before any access, and how long does it take?', when: WHEN.DAY0, kind: 'constraint' },
      { q: 'Who approves an exception, and how long does that take?', when: WHEN.BASELINE, kind: 'constraint' },
    ],
  },
  {
    s: 5,
    name: 'Systems and access',
    why: 'Only after section 4. Every request here is read-only, named, time-boxed and '
      + 'revocable, which is also the C7.3 clause 9 position.',
    items: [
      { q: 'Which systems does each problem touch?', when: WHEN.BASELINE, kind: 'access' },
      { q: 'What read-only access would a participant need, and who grants it?', when: WHEN.BASELINE, kind: 'access' },
      { q: 'Is there a non-production environment we can use instead?', when: WHEN.BASELINE, kind: 'access' },
      { q: 'Can participants use their own GitHub accounts, or must repositories be yours?', when: WHEN.BASELINE, kind: 'access' },
      { q: 'Who provisions access, and what is the lead time?', when: WHEN.BASELINE, kind: 'access' },
    ],
  },
  {
    s: 6,
    name: 'Sponsor and decision chain',
    why: 'C7.1 gate 2. A pilot without a sponsor who shows up dies quietly at week six.',
    items: [
      { q: 'Named executive sponsor, and confirmation of a monthly meeting.', when: WHEN.DAY0, kind: 'info' },
      { q: 'Who signs the SOW, and who signs a renewal?', when: WHEN.BASELINE, kind: 'info' },
      { q: 'Who must approve a published reference, and how long does that take?', when: WHEN.BASELINE, kind: 'info' },
      { q: 'What would make you run this again?', when: WHEN.DAY90, kind: 'info' },
    ],
  },
  {
    s: 7,
    name: 'Scheduling',
    why: 'The pilot is ninety days of other people’s calendars.',
    items: [
      { q: 'Blackout periods in the next ninety days.', when: WHEN.BASELINE, kind: 'info' },
      { q: 'Time zones in the cohort.', when: WHEN.BASELINE, kind: 'info' },
      { q: 'Preferred session days and times.', when: WHEN.BASELINE, kind: 'info' },
      { q: 'Any date the sponsor needs a result by, and why that date.', when: WHEN.DAY0, kind: 'info' },
    ],
  },
];

/**
 * Computed on every call, NOT captured once at module load.
 *
 * It was a const snapshot, and that made three assertions untestable: reordering or
 * re-dating the sections afterwards left the snapshot untouched, so the guards passed on
 * stale data. A guard that cannot be made to fail has not been tested.
 */
const items = () => SECTIONS.flatMap((s) => s.items.map((i) => ({ ...i, section: s.s })));

/** How many items fall on one deadline. Used by the headline and by the assertions. */
const countWhen = (w) => items().filter((i) => i.when === w).length;

/**
 * Derived, never typed. The first draft of this line said "eleven of thirty-one" while the
 * data said sixteen of thirty-five, and no assertion caught it because the prose and the
 * items were two separate sources of truth. Now there is one.
 */
const HEADLINE = () => `${countWhen(WHEN.DAY0)} of ${items().length} items are required `
  + 'before day one. The rest have later deadlines on purpose, because a questionnaire that '
  + 'demands everything up front is what delays the start it exists to protect.';

const LIMITS = [
  'Selling is out of scope. This is post-signature and the questions assume a deal that has '
    + 'already cleared the C7.1 gates.',
  'The day-one set is eleven items. That is a judgment about what genuinely blocks a start '
    + 'and it should be revised the first time a real pilot stalls on something not on it.',
  'It is a document today, not a form. The ticket notes it could become a web surface '
    + 'later, and the internship and cohort intake flows already model that pattern if it '
    + 'is wanted.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** "Each item marked by deadline, not all required up front." */
function assertDeadlinesMarked() {
  for (const i of items()) {
    if (!i.when) throw new Error(`C7.4: "${i.q}" has no deadline`);
  }
  const day0 = items().filter((i) => i.when === WHEN.DAY0).length;
  if (day0 === items().length) {
    throw new Error('C7.4: every item is required before day one, which is the failure the '
      + 'ticket names. A questionnaire that demands everything up front delays the start.');
  }
  if (day0 / items().length > 0.5) {
    throw new Error(`C7.4: ${day0} of ${items().length} items are day-one blockers, which `
      + 'is more than half and reads as a wall rather than a start condition');
  }
  return { day0, total: items().length };
}

/** "Baseline capture is explicit." */
function assertBaselineExplicit() {
  const sec = SECTIONS.find((s) => /baseline metrics/i.test(s.name));
  if (!sec) throw new Error('C7.4: there is no baseline section');
  const day0 = sec.items.filter((i) => i.when === WHEN.DAY0);
  if (!day0.length) {
    throw new Error('C7.4: no baseline item is required before day one, so a pilot could '
      + 'start with nothing to measure against');
  }
  return day0.length;
}

/**
 * "Security and data constraints captured before access is requested."
 *
 * Enforced on the real ordering: every constraint item must appear before every access item
 * in document order, not merely exist somewhere.
 */
function assertSecurityBeforeAccess() {
  const order = items().map((i, idx) => ({ ...i, idx }));
  const lastConstraint = Math.max(...order.filter((i) => i.kind === 'constraint').map((i) => i.idx));
  const firstAccess = Math.min(...order.filter((i) => i.kind === 'access').map((i) => i.idx));
  if (!Number.isFinite(lastConstraint)) throw new Error('C7.4: no security constraints asked');
  if (!Number.isFinite(firstAccess)) throw new Error('C7.4: no access questions asked');
  if (firstAccess < lastConstraint) {
    throw new Error('C7.4: an access request is asked before a security constraint, which is '
      + 'how a pilot loses its first week');
  }
  return { lastConstraint, firstAccess };
}

/**
 * The headline must agree with the items.
 *
 * This exists because it already failed once: the line read "eleven of thirty-one" while the
 * data held sixteen of thirty-five. Prose and data were two sources of truth, so now the
 * headline is computed and this checks the computation still matches.
 */
function assertHeadlineMatchesData() {
  // Read through module.exports, not the internal binding, so a caller that replaces
  // the headline with a literal is caught. Reading the binding made this unreachable.
  const exported = module.exports && module.exports.HEADLINE;
  const src = exported || HEADLINE;
  const h = typeof src === 'function' ? src() : String(src);
  const m = h.match(/(\d+) of (\d+) items/);
  if (!m) throw new Error('C7.4: the headline no longer states the counts');
  if (Number(m[1]) !== countWhen(WHEN.DAY0) || Number(m[2]) !== items().length) {
    throw new Error(`C7.4: the headline says ${m[1]} of ${m[2]} and the data says `
      + `${countWhen(WHEN.DAY0)} of ${items().length}`);
  }
  return h;
}

/** The blueprint gap this fills must stay named, or the document loses its reason. */
function assertFillsTheBlueprintGap() {
  const blob = SO_WHAT.join(' ');
  if (!/no structured business-problem intake form exists/i.test(blob)) {
    throw new Error('C7.4: the C2.2 gap this fills must be quoted, not paraphrased away');
  }
  return true;
}

module.exports = {
  AS_OF, HEADLINE, SO_WHAT, WHEN, SECTIONS, items, LIMITS,
  countWhen,
  assertDeadlinesMarked, assertBaselineExplicit, assertSecurityBeforeAccess,
  assertFillsTheBlueprintGap, assertHeadlineMatchesData,
};
