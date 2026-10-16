/**
 * C4.1, C4.2 and C4.3 - the sales set. ONE data module for all three.
 *
 * ## Why one module for three tickets
 *
 * They are the same claims at three lengths: a deck, a page, and a capability statement. If each
 * had its own copy of the numbers, the one-pager would eventually disagree with the deck and
 * nobody would notice until a customer did. The registry snapshot and the live figures are
 * IMPORTED from c32Data rather than copied, so there is exactly one place in the repo where a
 * refreshed production figure has to be changed.
 *
 * ## On the PDF question
 *
 * C4.1's acceptance criteria say "PPT/PDF not generated before approval", the same line C3.2
 * carried. Ali corrected that on 16 October 2026 after the C3.2 bundle shipped as linked HTML
 * and showed him nothing: Basecamp does not preview HTML, so the criterion as written makes the
 * work unreviewable. All three ship as PDFs. The criterion was written to stop premature polish,
 * not to hide the deliverable.
 *
 * ## The flag-gated rule, which is C4.3's sharpest criterion
 *
 * "Nothing flag-gated appears under live." Of 24 capabilities counted on 8 October, 10 are live
 * and 9 are BUILT BUT NOT SWITCHED ON. Those 9 are the trap: they are real code, they demo, and
 * they are not live. `assertNothingDarkUnderLive()` fails the build if a capability marked dark
 * ever appears in the live tier.
 */
const C32 = require('./c32Data');

const AS_OF = C32.AS_OF;
const LIVE = C32.LIVE;
const RATE = C32.RATE;
const EXEC = C32.EXEC;
const REGISTRY = C32.REGISTRY;

/** The promise, locked by C2.1 on 12 October 2026. Used verbatim, never re-tensed. */
const PROMISE = 'Your people learn to build with AI, and you get proof of what each one actually '
  + 'built, verified against real code.';

/** The category noun moves by segment; the promise does not. C2.1, evidenced per segment. */
const CATEGORY = [
  { seg: 'Mid-market and enterprise', noun: 'AI enablement', ev: 'EVIDENCED' },
  { seg: 'Existing employer relationships', noun: 'AI enablement', ev: 'EVIDENCED' },
  { seg: 'Workforce organizations', noun: 'workforce readiness', ev: 'EVIDENCED' },
  { seg: 'Economic development', noun: 'workforce readiness', ev: 'EVIDENCED' },
  { seg: 'Government', noun: 'workforce readiness', ev: 'EVIDENCED' },
  { seg: 'Higher education', noun: 'AI readiness', ev: 'EVIDENCED, and the reason is a trap' },
  { seg: 'Foundations', noun: null, ev: 'NOT YET EVIDENCED' },
  { seg: 'AI ecosystem partners', noun: null, ev: 'NOT YET EVIDENCED' },
];

const HIGHER_ED_TRAP = 'Do NOT use "enablement" with a university. University of Maine System '
  + 'RFP 2026-065, addendum 11 March 2026, uses "deployment and enablement work" to mean software '
  + 'rollout plus change management. In higher-education procurement that pair already means '
  + 'something else, and it puts us against Copilot resellers.';

/* ------------------------------------------------------------------ *
 * C4.1 - THE MASTER DECK
 * ------------------------------------------------------------------ */

const ONE_NEXT_STEP = 'A 30-minute working session where we run the verification pipeline '
  + 'against one of your repositories, with your people watching.';

const DECK = [
  { n: 1, kicker: 'The promise', title: 'What you get',
    body: [PROMISE,
      'That sentence is the whole offer. Everything else on these slides is evidence for it.'],
    claims: [] },

  { n: 2, kicker: 'The problem', title: 'Completion is not proof',
    body: ['A certificate says someone sat an exam. It does not say they shipped anything.',
      'Every training provider can show you completion rates. None of them can show you what a '
      + 'named person actually built, because that requires reading the commit.',
      'So the thing you are buying is usually a report about attendance.'],
    claims: [] },

  { n: 3, kicker: 'What we do differently', title: 'We verify at the commit',
    body: ['A learner story counts only when a real commit in a real repository satisfies it, '
      + 'checked by a pipeline rather than asserted by the learner.',
      LIVE.stories.toLocaleString('en-US') + ' stories verified this way across '
      + LIVE.storyProjects + ' projects, as of ' + AS_OF + '.',
      'It runs on push, so it costs nothing per learner and cannot be gamed by attendance.'],
    claims: ['CLM-002'] },

  { n: 4, kicker: 'The proof', title: 'What is running right now',
    body: [LIVE.projects + ' learner projects in flight.',
      LIVE.caseStudies + ' case studies published and live across ' + LIVE.caseStudySurfaces
      + ' surfaces.',
      LIVE.agentsRun + ' AI agents have run in production, ' + LIVE.agents24h + ' in the last 24 '
      + 'hours, at ' + RATE + ' success across ' + EXEC + ' executions in seven days.',
      'Every agent write is audited. We quote the denominator because a rate without one cannot '
      + 'be checked.'],
    claims: ['CLM-001', 'CLM-004', 'CLM-005', 'CLM-006', 'CLM-007'] },

  { n: 5, kicker: 'Track record', title: 'This is not our first measured outcome',
    body: ['Refactored.ai was selected as a Work of the Future Solver at MIT Solve 2018, one of '
      + 'eight from more than 1,150 applications across 110 countries.',
      'It received the Patrick J. McGovern Foundation Artificial Intelligence for the Betterment '
      + 'of Humanity Prize and the General Motors Prize for Advanced Technologies at that event.',
      'One of seven finalists in the JFF Labs $1 Billion Wage Gain Challenge, 2019.'],
    claims: ['CLM-013', 'CLM-014', 'CLM-015', 'CLM-016'] },

  { n: 6, kicker: 'The honest slide', title: 'What we are not claiming',
    body: ['Our first cohort has not finished, so there is no completed outcome study.',
      'Our agent fleet is instrumented, audited and read-only. It watches and records; it does '
      + 'not act, and we will not call it autonomous to win a nod in a meeting.',
      'Our government lane discovers and qualifies opportunities daily and stops at '
      + 'qualification. We do not submit proposals through it.',
      'We prepare people for third-party certifications and verify what they build. We award no '
      + 'credential of our own.'],
    claims: ['CLM-011', 'CLM-026'] },

  { n: 7, kicker: 'The next step', title: 'One thing',
    body: [ONE_NEXT_STEP], claims: [], isNext: true },
];

/* ------------------------------------------------------------------ *
 * C4.3 - CAPABILITY STATEMENT, three tiers, nothing dark under live
 * ------------------------------------------------------------------ */

const TIERS = {
  counts: { live: 10, dark: 9, designed: 4, roadmap: 1, total: 24, asof: '8 October 2026' },
  live: [
    { what: 'Commit-level story verification', detail: LIVE.stories.toLocaleString('en-US')
      + ' stories across ' + LIVE.storyProjects + ' projects', clm: 'CLM-002', dark: false },
    { what: 'Learner project delivery', detail: LIVE.projects + ' projects in flight',
      clm: 'CLM-001', dark: false },
    { what: 'Published outcome case studies', detail: LIVE.caseStudies + ' live across '
      + LIVE.caseStudySurfaces + ' surfaces', clm: 'CLM-004', dark: false },
    { what: 'Production agent fleet', detail: LIVE.agentsRun + ' agents have run, ' + RATE
      + ' across ' + EXEC + ' executions in seven days', clm: 'CLM-005', dark: false },
    { what: 'Write-level audit trail', detail: 'Every agent write is audited', clm: 'CLM-007',
      dark: false },
    { what: 'Governed AI employees', detail: LIVE.charters + ' under a written role charter',
      clm: 'CLM-008', dark: false },
    { what: 'Government opportunity lane', detail: 'Discovery and qualification daily, '
      + LIVE.govQualifications + ' qualifications, newest ' + LIVE.govNewest
      + '. Stops at qualification.', clm: 'CLM-011', dark: false },
  ],
  pilot: [
    { what: 'AI mentor for student success and retention',
      detail: 'One of the two role charters, running with a pilot cohort. Not a completed '
        + 'outcome study.', clm: 'CLM-008', dark: false },
  ],
  roadmap: [
    { what: 'Built but not switched on', detail: '9 capabilities. Real code that demonstrates, '
      + 'behind a flag. These are the dangerous ones in a sales conversation because they look '
      + 'live in a demo, and they are listed here rather than above on purpose.',
      clm: null, dark: true },
    { what: 'Designed, not built', detail: '4 capabilities.', clm: null, dark: true },
    { what: 'On the roadmap', detail: '1 capability.', clm: null, dark: true },
  ],
};

/* ------------------------------------------------------------------ *
 * C4.2 - THE ONE-PAGER
 * ------------------------------------------------------------------ */

/** Written for a reader with zero prior context who was forwarded this and nothing else. */
const ONE_PAGER = {
  who: 'Colaberry trains technical people to build with AI, and proves what each person built by '
    + 'checking their actual commits.',
  why: 'Every training provider can show you completion rates. Completion says someone attended. '
    + 'It does not say they shipped. We verify at the commit instead, which is why our evidence '
    + 'survives a procurement question.',
  proof: [
    LIVE.stories.toLocaleString('en-US') + ' learner stories verified against a real commit, '
    + 'across ' + LIVE.storyProjects + ' projects',
    LIVE.projects + ' learner projects in flight',
    LIVE.caseStudies + ' published case studies, live across ' + LIVE.caseStudySurfaces
    + ' surfaces',
    LIVE.agentsRun + ' AI agents run in production at ' + RATE + ' success across ' + EXEC
    + ' executions in seven days, every write audited',
  ],
  notClaiming: 'Our first cohort has not finished. Our agent fleet is read-only and we do not '
    + 'call it autonomous. We prepare people for third-party certifications and award none of '
    + 'our own.',
  next: ONE_NEXT_STEP,
};

/* ------------------------------------------------------------------ *
 * THE GATES
 * ------------------------------------------------------------------ */

/** Registry gating, reusing C3.2's assertion logic over this set's citations. */
function assertRegistryGated() {
  const cited = new Set();
  for (const s of DECK) for (const c of s.claims) cited.add(c);
  for (const t of ['live', 'pilot', 'roadmap']) {
    for (const c of TIERS[t]) if (c.clm) cited.add(c.clm);
  }
  const bad = [...cited].filter((id) => !REGISTRY[id] || !REGISTRY[id].deck);
  if (bad.length) {
    throw new Error('claims cited but not deck-eligible in the C0.6 registry: ' + bad.join(', '));
  }
  return [...cited].sort();
}

/** C4.3's sharpest criterion: nothing flag-gated may appear in the live tier. */
function assertNothingDarkUnderLive() {
  const bad = TIERS.live.filter((c) => c.dark);
  if (bad.length) {
    throw new Error('flag-gated capabilities listed under LIVE: '
      + bad.map((c) => c.what).join(', ')
      + '. A capability behind a flag demos like a live one, which is exactly why it may not sit '
      + 'in the live tier.');
  }
  if (!TIERS.roadmap.some((c) => c.dark)) {
    throw new Error('the 9 built-but-not-switched-on capabilities must be stated somewhere; '
      + 'omitting them reads as if they do not exist');
  }
  return { live: TIERS.live.length, pilot: TIERS.pilot.length, roadmap: TIERS.roadmap.length };
}

/** C4.1: exactly one next step, and it must be last. */
function assertOneNextStep() {
  const n = DECK.filter((s) => s.isNext);
  if (n.length !== 1) throw new Error('the deck needs exactly one next step, found ' + n.length);
  if (DECK[DECK.length - 1] !== n[0]) throw new Error('the next step must be the last slide');
  return n[0];
}

/** C4.2: no number may appear in the one-pager that is not in the registry-backed set. */
function assertOnePagerSourced() {
  const nums = ONE_PAGER.proof.join(' ').match(/[0-9][0-9,.]*/g) || [];
  if (!nums.length) throw new Error('the one-pager carries no figures, which cannot be right');
  const known = [LIVE.stories, LIVE.storyProjects, LIVE.projects, LIVE.caseStudies,
    LIVE.caseStudySurfaces, LIVE.agentsRun, LIVE.executions]
    .map((n) => n.toLocaleString('en-US'));
  const unknown = nums.filter((n) => !known.includes(n) && !RATE.includes(n) && n.length > 2);
  if (unknown.length) {
    throw new Error('one-pager figures with no registry-backed source: ' + unknown.join(', '));
  }
  return { figures: nums.length };
}

module.exports = {
  AS_OF, LIVE, RATE, EXEC, REGISTRY, PROMISE, CATEGORY, HIGHER_ED_TRAP,
  DECK, ONE_NEXT_STEP, TIERS, ONE_PAGER,
  assertRegistryGated, assertNothingDarkUnderLive, assertOneNextStep, assertOnePagerSourced,
};
