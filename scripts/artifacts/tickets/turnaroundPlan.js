/**
 * The decisions, the sequence and the offers. Judgment lives here; numbers live in
 * turnaroundData.js and are never retyped.
 *
 * WHY THE DECISIONS ARE A DATA STRUCTURE. Ali asked for "a timeline with every major
 * decision on it". A hand-drawn timeline drifts from the plan it illustrates within a
 * week. Every decision carries its date, owner, cost of being wrong and what it unblocks,
 * and the timeline is generated from this list, so the picture cannot disagree with the
 * text.
 *
 * THE PLAN'S CENTRAL CLAIM, AND IT IS NOT THE ONE THE BRIEF ASSUMED. The danger is not
 * that a receivable book runs out. It is that a 124-schedule subscription book worth
 * about $13.9k a month, which would otherwise keep paying into 2028, cancels all at once
 * when subscribers notice the service behind it has stopped. Everything in phase one
 * exists to prevent that, and nothing else in this plan matters if it happens.
 *
 * NOTHING HERE HAS BEEN DECIDED. This is a recommendation to a CEO in a hard month.
 */

const PHASES = [
  { id: 'P1', name: 'Protect the book and stop the leaks',
    window: 'Now to 30 November 2026',
    thesis: 'The cheapest money in this plan is revenue already agreed and leaking. None '
      + 'of it needs a new product, a new hire, or a dollar of marketing.',
    exitTest: 'Autopay migration done, the price corrected, the Cheklie schedule '
      + 'suspended, and a retention offer in front of every legacy subscriber.' },
  { id: 'P2', name: 'Land the transition without breaking trust',
    window: '1 November 2026 to 31 January 2027',
    thesis: 'Teach out Data Analytics in a way that keeps subscribers paying, and start '
      + 'the November AI cohort properly.',
    exitTest: 'Every remaining learner has accepted a dated close-out, the AI cohort is '
      + 'running, and legacy cancellations have not spiked.' },
  { id: 'P3', name: 'Prove the institutional sale',
    window: 'January to June 2027',
    thesis: 'One reference customer in higher-ed continuing education. Everything in the '
      + 'scale plan depends on deal one existing and nothing substitutes for it.',
    exitTest: 'A signed seat-block agreement and a cohort delivered inside an institution.' },
  { id: 'P4', name: 'Scale on blocks',
    window: 'mid-2027 onward',
    thesis: 'Repeat the institutional motion while self-serve carries the tail. The only '
      + 'shape in which 10,000 learners is arithmetic rather than ambition.',
    exitTest: 'Four institutional customers live and self-serve enrolling without staff.' },
];

const DECISIONS = [
  {
    id: 'D1', phase: 'P1', by: '2026-10-28', owner: 'Ali',
    decision: 'Suspend PaySimple schedule 4319082 before the 2 November draft.',
    detail: 'Fikru Cheklie settled at $12,000 and is closed as Paid Off Early, but the '
      + 'schedule is still live with one draft queued. Collecting past a settlement we '
      + 'granted is the kind of thing that ends up in a complaint rather than a ledger.',
    costOfBeingWrong: 'Low to act, genuinely bad not to.',
    reversible: true,
    unblocks: 'Nothing. It is simply wrong and it is three weeks from happening.',
  },
  {
    id: 'D2', phase: 'P1', by: '2026-10-31', owner: 'Ali',
    decision: 'Get the QuickBooks transaction detail for account 4300 and the payroll '
      + 'register by employee, both with class coding.',
    detail: 'Eighty-nine percent of the largest income line has no traceable source, and '
      + '$58,787 of commission is booked outside the school class. Both are one report '
      + 'each from Aishwarya C and Durga Siralam, and Ram already has a thread open.',
    costOfBeingWrong: 'None to ask. Everything to skip - no staffing decision should be '
      + 'taken before these land.',
    reversible: true,
    unblocks: 'Every number in this plan that currently carries a caveat.',
  },
  {
    id: 'D3', phase: 'P1', by: '2026-11-07', owner: 'Ali',
    decision: 'Migrate every monthly member onto a recurring schedule, and correct the '
      + 'advertised price from $149 "cancel anytime" to $199 month-to-month.',
    detail: 'Only 12 of 24 monthly members are on autopay; the rest are re-collected by '
      + 'hand each month, forever. The price appears wrong in roughly 70 places, which is '
      + 'a 25 percent leak on the one engine that earns, and it is an advertised price '
      + 'under TWC rules.',
    costOfBeingWrong: 'Low. These are corrections, not pricing experiments.',
    reversible: true,
    unblocks: 'Makes every later revenue projection trustworthy.',
  },
  {
    id: 'D4', phase: 'P1', by: '2026-11-07', owner: 'Ali',
    decision: 'Put a retention offer in front of all 124 legacy subscribers before any '
      + 'sunset announcement reaches them.',
    detail: 'THIS IS THE HIGHEST-VALUE ACTION IN THE PLAN. The book is worth about $13.9k '
      + 'a month realized and runs into 2028 on paper. It is not protected by its end '
      + 'dates; it is protected by subscribers believing they still receive something. '
      + 'Offer migration into the AI membership before they hear the program is ending.',
    costOfBeingWrong: 'HIGH AND IRREVERSIBLE. A cancellation wave cannot be recalled, and '
      + 'this book is roughly four times the new business.',
    reversible: false,
    unblocks: 'The runway that funds everything else.',
  },
  {
    id: 'D5', phase: 'P1', by: '2026-11-14', owner: 'Ali',
    decision: 'Put a paywall between the free Explorer tier and the paid curriculum.',
    detail: '396 explorers are served the entire curriculum today. There is nothing '
      + 'material to upgrade to, which caps conversion no matter what is spent on '
      + 'acquisition. This is why the funnel converts at roughly one in twenty.',
    costOfBeingWrong: 'Medium. Drawing the line too high suppresses the top of funnel; it '
      + 'is tunable within a fortnight.',
    reversible: true,
    unblocks: 'Self-serve as a channel. Without it there is no product to buy.',
  },
  {
    id: 'D6', phase: 'P2', by: '2026-11-05', owner: 'Ram and Ali',
    decision: 'Confirm the November AI cohort starts on 12 November as scheduled.',
    detail: 'THIS CONFLICTS WITH THE BRIEF AS WRITTEN. "End the class by the end of the '
      + 'year" is right for Data Analytics and wrong for this cohort: 37 learners are '
      + 'enrolled, 12 have paid, and a cohort starting 12 November does not finish in '
      + 'December. Canceling it to hit a calendar date would refund the only new revenue '
      + 'in the building and destroy the delivered-cohort proof the 2027 plan needs.',
    costOfBeingWrong: 'HIGH AND IRREVERSIBLE.',
    reversible: false,
    unblocks: 'Everything in P3. Without a delivered cohort there is nothing to sell.',
  },
  {
    id: 'D7', phase: 'P2', by: '2026-11-21', owner: 'Ali',
    decision: 'Publish a dated Data Analytics teach-out plan to every remaining learner '
      + 'and subscriber, with what they keep.',
    detail: 'The sunset is correct. How it is communicated decides whether the legacy book '
      + 'keeps paying, because those are the same people. "The program is ending" with no '
      + 'offer attached is a cancellation notice we wrote ourselves.',
    costOfBeingWrong: 'HIGH AND IRREVERSIBLE. It directly attacks the one asset still '
      + 'producing cash.',
    reversible: false,
    unblocks: 'A clean close that protects the run-off while it funds the transition.',
  },
  {
    id: 'D8', phase: 'P2', by: '2026-11-30', owner: 'Ram',
    decision: 'Take the headcount question once, on the fixed-versus-variable split, not '
      + 'across the board.',
    detail: 'On the measured side there is very little left to cut. Commission is down 78 '
      + 'percent since 2023 and teaching reached zero in August without anyone being '
      + 'dismissed. Of $5,750 a month, $3,500 is ten mentor retainers and those mentors '
      + 'support the learners inside the book that pays four times their cost. The real '
      + 'decision lives on the salaried side, which this P&L does not show.',
    costOfBeingWrong: 'HIGHEST IN THE PLAN AND IRREVERSIBLE. People do not come back, and '
      + 'cutting mentors to save $3,500 could strand $13,877.',
    reversible: false,
    unblocks: 'A cost base that matches the business we are becoming.',
  },
  {
    id: 'D9', phase: 'P3', by: '2027-01-15', owner: 'Ali',
    decision: 'Commit to higher-education continuing education and name the first ten '
      + 'target institutions.',
    detail: 'Sixteen seat-block deals carry 80 percent of the 10,000-learner target and no '
      + 'other channel comes close. Selling 100 companies 100 seats is a motion this '
      + 'company has run for 14 years; selling 10,000 individuals one at a time is not.',
    costOfBeingWrong: 'Medium. A wrong segment costs two quarters, not the company.',
    reversible: true,
    unblocks: 'The entire scale plan.',
  },
  {
    id: 'D10', phase: 'P3', by: '2027-02-28', owner: 'Ram',
    decision: 'Fund one enterprise seller, or accept that the institutional motion runs at '
      + 'the speed of the founders.',
    detail: 'Sixteen block deals in twenty-four months is one closed every six weeks. That '
      + 'is a job. The honest alternative is a smaller target, not the same target with '
      + 'nobody selling. It sits after deal one on purpose.',
    costOfBeingWrong: 'Medium, and deliberately sequenced behind proof.',
    reversible: true,
    unblocks: 'Deal two onward.',
  },
  {
    id: 'D11', phase: 'P3', by: '2027-03-31', owner: 'Ali',
    decision: 'Cap government contracts at one owner and a fixed budget, and keep it out '
      + 'of the 2027 revenue plan.',
    detail: 'It has zero submissions, zero contracts and zero revenue in the system. The '
      + 'one real bid was lost. Three "proposals" describe themselves as rehearsals '
      + 'assuming a SOC 2 we do not hold. It feels like current business because of its '
      + 'Basecamp footprint, and that is exactly what makes it expensive to keep believing in.',
    costOfBeingWrong: 'Low to cap. High to leave uncapped, because it consumes the '
      + 'attention the institutional motion needs.',
    reversible: true,
    unblocks: 'Focus, which is the scarcest input here.',
  },
  {
    id: 'D12', phase: 'P4', by: '2027-06-30', owner: 'Ram and Ali',
    decision: 'Go or no-go on the 10,000-learner target against measured conversion.',
    detail: 'By mid-2027 there will be real numbers for seat-block close rate and '
      + 'self-serve conversion. Hold the target if they support it; restate it publicly if '
      + 'they do not. A target nobody believes is worse than a smaller one everybody does.',
    costOfBeingWrong: 'Low if taken on evidence, high if deferred indefinitely.',
    reversible: true,
    unblocks: 'Credibility, internally and with partners.',
  },
];

const OFFERS = [
  { tier: 'Explorer', price: '$0', who: 'Anyone', what: 'Open content and the prospect pool',
    status: 'LIVE', role: 'Top of funnel. 396 people sit here and currently receive the '
      + 'entire curriculum, which is the problem D5 fixes.' },
  { tier: 'Membership', price: '$199 monthly, $1,788 annually', who: 'Individual learners',
    what: 'Platform access, live sessions, certification preparation',
    status: 'LIVE', role: 'The only thing anyone can buy today. 19 people pay for it.' },
  { tier: 'Legacy training subscription', price: 'mostly $250 monthly',
    who: '124 existing subscribers', what: 'The Data Analytics program and its support',
    status: 'LIVE AND AT RISK', role: 'About $13.9k a month realized. Four times the new '
      + 'business. Protecting it is phase one.' },
  { tier: 'Live cohort', price: '$1,788', who: 'Individuals who want teaching',
    what: 'A taught accelerator cohort with a verified project',
    status: 'LIVE', role: 'The proof engine. Produces the case studies the other tiers need.' },
  { tier: 'Institutional seat block', price: '$300 a seat in 500-seat blocks',
    who: 'Higher-ed continuing education units', what: 'Seats, delivery and reporting',
    status: 'NEVER SOLD', role: 'Carries 80 percent of the 10,000 target. This is the plan.' },
  { tier: 'Certification preparation', price: 'unpriced',
    who: 'Members and institutions', what: 'Preparation for a third-party credential',
    status: 'BUNDLED FREE', role: 'A retention feature with five users. We issue nothing.' },
];

const SCENARIOS = [
  { name: 'Survive',
    shape: 'Protect the legacy book, correct the leaks, teach out cleanly, hold the cost '
      + 'base flat and let membership grow without new investment.',
    requires: 'No new hiring. The retention offer landing before the sunset news. The '
      + 'November cohort delivered.',
    outcome: 'A smaller business that is still here, funded by a book that keeps paying '
      + 'because subscribers still receive something.',
    risk: 'The book is one badly-worded announcement away from a cancellation wave.' },
  { name: 'Thrive',
    shape: 'Everything in Survive, plus one institutional reference customer in the first '
      + 'half of 2027 and a seller funded on the back of it.',
    requires: 'Deal one. A paywall, so there is something to sell. The discipline to keep '
      + 'taught delivery under 15 percent of volume.',
    outcome: '10,000 learners becomes arithmetic rather than ambition.',
    risk: 'Deal one is a single point of failure and nothing substitutes for it.' },
];

/* ── assertions ───────────────────────────────────────────────────────────── */

function assertEveryDecisionIsDatedAndOwned() {
  for (const d of DECISIONS) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.by)) {
      throw new Error(`turnaround: decision ${d.id} has no usable date`);
    }
    if (!d.owner) throw new Error(`turnaround: decision ${d.id} has no owner`);
    if (!PHASES.some((p) => p.id === d.phase)) {
      throw new Error(`turnaround: decision ${d.id} sits in unknown phase ${d.phase}`);
    }
    if (typeof d.reversible !== 'boolean') {
      throw new Error(`turnaround: decision ${d.id} does not say whether it is reversible, `
        + 'which is the field that tells Ram where to spend attention');
    }
  }
  return DECISIONS.length;
}

/**
 * The irreversible decisions must be visible as such, and there must be several.
 *
 * A plan where everything is reversible has not confronted anything. The three that
 * cannot be undone - protecting the book, the cohort, and the headcount question - are
 * the document's actual content.
 */
function assertIrreversibleDecisionsAreFlagged() {
  const hard = DECISIONS.filter((d) => !d.reversible);
  if (hard.length < 3) {
    throw new Error(`turnaround: only ${hard.length} decisions are irreversible`);
  }
  for (const d of hard) {
    if (!/HIGH|IRREVERSIBLE/i.test(d.costOfBeingWrong)) {
      throw new Error(`turnaround: ${d.id} is irreversible but its cost does not say so`);
    }
  }
  return hard.map((d) => d.id);
}

/** Nothing may be presented as sold when it is not. */
function assertUnsoldOffersAreMarked() {
  const block = OFFERS.find((o) => /Institutional/.test(o.tier));
  if (block.status === 'LIVE') {
    throw new Error('turnaround: the institutional seat block is marked LIVE. No '
      + 'institution has ever bought one. It is the plan, not the present.');
  }
  const cert = OFFERS.find((o) => /Certification/.test(o.tier));
  if (!/FREE|unpriced/i.test(cert.status + cert.price)) {
    throw new Error('turnaround: certification preparation is shown as priced. It is '
      + 'bundled free and has five users.');
  }
  return { total: OFFERS.length, live: OFFERS.filter((o) => /LIVE/.test(o.status)).length };
}

/**
 * Protecting the legacy book must come before the sunset announcement, in date order.
 *
 * This is the sequencing the whole plan turns on. If the teach-out notice goes out before
 * the retention offer, we have told 124 paying subscribers their program is ending and
 * given them nothing to move to. The dates must enforce what the prose claims.
 */
function assertRetentionPrecedesSunsetNotice() {
  const retention = DECISIONS.find((d) => d.id === 'D4');
  const notice = DECISIONS.find((d) => d.id === 'D7');
  if (!(retention.by < notice.by)) {
    throw new Error(`turnaround: the retention offer (${retention.by}) must land BEFORE `
      + `the teach-out notice (${notice.by}). Reversed, it is a cancellation notice.`);
  }
  return { retention: retention.by, notice: notice.by };
}

module.exports = {
  PHASES, DECISIONS, OFFERS, SCENARIOS,
  assertEveryDecisionIsDatedAndOwned, assertIrreversibleDecisionsAreFlagged,
  assertUnsoldOffersAreMarked, assertRetentionPrecedesSunsetNotice,
};
