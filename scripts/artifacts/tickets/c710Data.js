/**
 * C7.10 - how a pilot becomes recurring revenue. THE single source for the artifact.
 *
 * ## The honest frame, stated first because it changes how the document should be read
 *
 * COLABERRY HAS NEVER RUN A PILOT. C9.7, "First Paid Lighthouse Customer", is still open.
 * Every trigger, timing and conversion rate below is designed rather than observed. The
 * ticket asks for exactly this - "the expansion path has to be designed before the pilot
 * ends" - but a framework that reads as though it were derived from experience would be
 * a lie of tone, so `assertNoPilotExperienceIsClaimed` keeps the document saying so.
 *
 * ## Price comes from C2.3, which was approved 12 October 2026
 *
 * Nothing here invents a number. Where C2.3 does not cover a path - consulting and
 * partner deployment both sit outside its two families - the document says the price is
 * unset rather than guessing one, and `assertUnpricedPathsAreFlagged` enforces it. An
 * expansion path with a confident but unapproved price is how a deal gets priced in the
 * room, which C7.2's proposal template exists to prevent.
 */

const AS_OF = '2026-10-23';

/** The pilot shape these paths attach to. */
const PILOT = {
  price: 44500,
  discountHeadroom: '2.7%',
  netContribution: 3538,
  netAsShareOfPrice: '8%',
  decisionDay: 75,
  src: 'C2.3 approved 2026-10-12 for price; C2.4 for the net contribution',
};

/** The two families C2.3 actually covers. */
const PRICE_LIST = [
  { family: 'Staffed cohorts', basis: 'per engagement', figure: `$${44500..toLocaleString()} pilot`,
    note: 'List only, with 2.7% of discount headroom.', src: 'C2.3' },
  { family: 'Self-paced licenses', basis: 'per learner per year', figure: '$150 a learner',
    note: 'Entry block of 60 learners, so $9,000 to start. 84% gross margin, because '
      + 'verification runs on push and needs no staff.', src: 'C2.3' },
  { family: 'Annual enterprise account', basis: 'per year', figure: 'nets $64,100',
    note: 'The net, not the price. Acquisition runs at 7.5% of revenue and does not vary '
      + 'by package.', src: 'C2.4' },
];

/**
 * The five expansion paths the ticket names.
 *
 * `day` is the point in the pilot at which the signal should be visible, not the point at
 * which the offer is made. The two differ on purpose: a signal seen at day 30 and acted
 * on at day 75 is a planned conversion, and the same signal noticed at day 85 is a
 * scramble.
 */
const PATHS = [
  {
    id: 'E1',
    name: 'Annual program',
    trigger: 'The sponsor asks what happens to these people after the pilot, unprompted.',
    why: 'It is the only trigger that proves they are thinking past the engagement. A '
      + 'sponsor who has not asked this by day 60 is treating the pilot as a project.',
    day: 60,
    offerAt: 75,
    offer: 'A second staffed cohort on an annual cadence, with the first cohort moving to '
      + 'license access so their evidence keeps accruing.',
    price: '$44,500 per engagement, from the staffed-cohort family',
    priced: true,
    owner: 'Ali',
  },
  {
    id: 'E2',
    name: 'Enterprise license',
    trigger: 'Somebody OUTSIDE the pilot cohort asks for access.',
    why: 'THE EARLIEST AND MOST RELIABLE SIGNAL, and the one most often missed because it '
      + 'arrives as a nuisance rather than as demand. It is a demand signal rather than a '
      + 'results signal, so it appears long before any outcome data exists.',
    day: 45,
    offerAt: 60,
    offer: 'Self-paced access for a named population, priced per learner per year.',
    price: '$150 a learner a year, entry block of 60, so $9,000 to start',
    priced: true,
    owner: 'Ali',
  },
  {
    id: 'E3',
    name: 'Sponsored cohort',
    trigger: 'The sponsor wants to fund seats for people who are not their employees: '
      + 'customers, suppliers, or a community commitment they have already made publicly.',
    why: 'Usually driven by something outside the training budget entirely, which is why '
      + 'it can be larger and faster than the others. Often a commitment they have to '
      + 'honor anyway.',
    day: 60,
    offerAt: 75,
    offer: 'A funded cohort delivered under their name, with the evidence record visible '
      + 'to them.',
    price: '$150 a learner a year on the license family, in blocks of 60, so $9,000 per '
      + 'block of sponsored seats',
    priced: true,
    owner: 'Ali',
  },
  {
    id: 'E4',
    name: 'Consulting engagement',
    trigger: 'They ask us to BUILD something rather than teach someone.',
    why: 'Almost always surfaces around day 30, when the first real problem appears in a '
      + 'learner project and somebody realizes we could just do it. It is the easiest '
      + 'revenue in the list and the most dangerous, because it is the path that turns '
      + 'this into a services firm, which is the precise thing the pilot hypothesis says '
      + 'we are trying not to be.',
    day: 30,
    offerAt: 75,
    offer: 'A scoped delivery engagement, deliberately separated from the training '
      + 'relationship so neither is held hostage to the other.',
    price: 'NOT IN C2.3. The price list covers staffed cohorts and self-paced licenses. '
      + 'Consulting is outside both families and has no approved rate.',
    priced: false,
    owner: 'Ali, with Ram on scope',
  },
  {
    id: 'E5',
    name: 'Partner deployment',
    trigger: 'They ask whether they can take this to their own customers.',
    why: 'Only credible after a pilot has actually completed, because they are proposing '
      + 'to put their name on our delivery. Treat it as flattering and slow.',
    day: 75,
    offerAt: 90,
    offer: 'A partner agreement with defined delivery boundaries and a named owner on '
      + 'each side.',
    price: 'NOT IN C2.3. No partner or reseller rate has been approved.',
    priced: false,
    owner: 'Ali and Ram',
  },
];

/**
 * The signals that say a customer will NOT expand.
 *
 * The ticket asks for these explicitly, and names the failure mode: "Assuming expansion."
 * The purpose is to redirect effort early rather than to be right at the post-mortem, so
 * each carries what to do rather than only what it means.
 */
const NEGATIVE_SIGNALS = [
  { signal: 'The sponsor stops attending the reviews and sends a delegate.',
    by: 45,
    means: 'The pilot has become somebody else\'s project. Expansion decisions do not '
      + 'survive that handoff.',
    do: 'Ask the sponsor directly for fifteen minutes and find out what changed. If the '
      + 'answer is vague, stop forecasting the expansion.' },
  { signal: 'Nobody outside the original cohort has asked for access.',
    by: 45,
    means: 'The strongest expansion signal is simply absent. It is not a late signal that '
      + 'has yet to arrive; by day 45 it has either happened or it has not.',
    do: 'Stop modeling E2. Re-forecast the account on E1 alone.' },
  { signal: 'They ask for a discount before they ask for an outcome.',
    by: 'any',
    means: 'They are buying a training budget line, not a capability. Those accounts '
      + 'renew once at best and never expand.',
    do: 'Hold list price. C2.3 allows 2.7% and no more, and a buyer who walks at 2.7% was '
      + 'never going to expand.' },
  { signal: 'The champion changes role.',
    by: 'any',
    means: 'The single most common cause of a dead renewal, and it has nothing to do with '
      + 'the work.',
    do: 'Within a week, get a meeting with whoever inherits the budget. Treat it as a new '
      + 'sale, because it is.' },
  { signal: 'Learners are not producing verified evidence.',
    by: 60,
    means: 'The one failure that is ours. Without verified work there is nothing to show '
      + 'at day 75, and the expansion conversation has no content.',
    do: 'Fix delivery before selling anything. An expansion sold on top of a weak cohort '
      + 'produces a worse second cohort and a reference customer who warns people.' },
  { signal: 'Procurement appears before the sponsor is convinced.',
    by: 'any',
    means: 'The deal has been handed down to be priced rather than up to be decided. It '
      + 'is being treated as a renewal of a commodity.',
    do: 'Go back to the sponsor. If you cannot, expect a flat renewal at best.' },
];

/** What the document cannot claim. */
const NO_EXPERIENCE = {
  pilotsRun: 0,
  evidence: 'C9.7, First Paid Lighthouse Customer, is still open as of ' + AS_OF + '.',
  consequence: 'Every trigger, day and conversion path here is designed from the '
    + 'economics and from how these conversations usually go, not derived from a pilot we '
    + 'have run. The first real pilot should be treated as a test of this framework as '
    + 'much as of the delivery.',
};

/* ── assertions ───────────────────────────────────────────────────────────── */

/** The ticket's first criterion: every path has a trigger and a timing. */
function assertEveryPathHasTriggerAndTiming() {
  for (const p of PATHS) {
    if (!p.trigger || !p.trigger.trim()) throw new Error(`C7.10: ${p.id} has no trigger`);
    if (typeof p.day !== 'number' || typeof p.offerAt !== 'number') {
      throw new Error(`C7.10: ${p.id} has no numeric timing`);
    }
    if (p.day > p.offerAt) {
      throw new Error(`C7.10: ${p.id} is offered on day ${p.offerAt} but its signal is `
        + `not visible until day ${p.day}. The offer cannot precede the signal.`);
    }
    if (!p.owner) throw new Error(`C7.10: ${p.id} has no conversation owner`);
  }
  return PATHS.length;
}

/** The ticket's second criterion, and its named failure mode. */
function assertNegativeSignalsAreDefined() {
  if (NEGATIVE_SIGNALS.length < 4) {
    throw new Error(`C7.10: only ${NEGATIVE_SIGNALS.length} negative signals. The ticket `
      + 'names "assuming expansion" as the thing that would make this untrustworthy.');
  }
  for (const s of NEGATIVE_SIGNALS) {
    if (!s.do) throw new Error(`C7.10: "${s.signal}" says what it means but not what to do`);
  }
  return NEGATIVE_SIGNALS.length;
}

/**
 * Pricing is drawn from C2.3, and where C2.3 is silent the document says so.
 *
 * The temptation on an unpriced path is to put a plausible number next to it. That is
 * exactly how a deal gets priced in the room, which is the failure C7.2's template was
 * built to prevent, so an unpriced path must say it is unpriced.
 */
function assertUnpricedPathsAreFlagged() {
  for (const p of PATHS) {
    if (p.priced) {
      if (!/\$/.test(p.price)) {
        throw new Error(`C7.10: ${p.id} is marked priced but carries no figure`);
      }
    } else if (!/NOT IN C2\.3/.test(p.price)) {
      throw new Error(`C7.10: ${p.id} has no approved price and does not say so. An `
        + 'unapproved number next to an expansion path is how a deal gets priced in the room.');
    }
  }
  const unpriced = PATHS.filter((p) => !p.priced);
  if (!unpriced.length) {
    throw new Error('C7.10: every path claims an approved price. C2.3 covers staffed '
      + 'cohorts and self-paced licenses only, so consulting and partner deployment '
      + 'cannot both be priced from it.');
  }
  return { priced: PATHS.length - unpriced.length, unpriced: unpriced.map((p) => p.id) };
}

/** The document may never read as though we have run pilots. */
function assertNoPilotExperienceIsClaimed() {
  if (NO_EXPERIENCE.pilotsRun !== 0) {
    throw new Error('C7.10: the pilot count is no longer zero, so this framework should '
      + 'be rewritten from what actually happened rather than restating the design.');
  }
  return NO_EXPERIENCE;
}

module.exports = {
  AS_OF, PILOT, PRICE_LIST, PATHS, NEGATIVE_SIGNALS, NO_EXPERIENCE,
  assertEveryPathHasTriggerAndTiming, assertNegativeSignalsAreDefined,
  assertUnpricedPathsAreFlagged, assertNoPilotExperienceIsClaimed,
};
