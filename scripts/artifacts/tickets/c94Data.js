/**
 * C9.4 - the demo-to-pilot conversion runbook.
 *
 * WHAT THIS TICKET ASKED FOR: what happens between a good demo and a signed pilot, with
 * an owner, a timebox and an exit criterion per stage, stage names matching C8.4 exactly,
 * and explicit concession limits.
 *
 * THE TWO THINGS THAT MAKE THIS HONEST RATHER THAN PLAUSIBLE.
 *
 * First, the stage names are not retyped. `assertStageNamesMatchC84` reads
 * backend/src/services/commercialization/funnelStages.ts off disk and fails the build if
 * any stage here is not in that file with the same key and label. The acceptance
 * criterion is "stage names match C8.4 exactly", and a runbook that drifts from the
 * instrumentation is worse than one that never claimed to match, because the drift is
 * invisible until somebody tries to measure the funnel against it.
 *
 * Second, the discount limit is NOT set here. The ticket lists "the discount and
 * concession limits" as something Ali decides, and the discount half is already decided:
 * C2.3 approved the pilot at $44,500 with 2.7% of discount headroom on 12 October, and
 * C7.2 carries that as "not invented here and not negotiable in the template". Inventing
 * a second number in this document would have created two approved limits, which is
 * strictly worse than having none. `assertNoInventedDiscount` locks it.
 *
 * WHAT THE RUNBOOK CANNOT DO, STATED UP FRONT. Its entry stage and its exit stage are the
 * two C8.4 could not instrument. `demo_delivered` has source null and evidence absent;
 * `pilot_running` the same. So the metric this ticket names as its test of usefulness,
 * "demo-to-proposal time drops", cannot be computed today. The runbook is still worth
 * having; the clock it is measured by does not exist yet.
 */

const AS_OF = '26 October 2026';

/** C2.3, approved 12 October 2026. Carried, never re-derived. */
const PRICING = {
  pilotPrice: 44500,
  discountHeadroomPct: 2.7,
  source: 'C2.3, approved 12 October 2026, carried by C7.2',
  netContribution: 3538,
  netSource: 'C2.4, tagged VERIFIED in C4.8',
};

/**
 * 2.7% of $44,500, computed rather than typed so the two can never disagree.
 *
 * FLOORED, not rounded. This is a ceiling on what may be given away, and rounding a
 * ceiling upward hands out money the approval did not cover. $1,201 rather than $1,201.50
 * also reads as a limit rather than as an arithmetic result.
 */
const MAX_DISCOUNT_DOLLARS = Math.floor(
  (PRICING.pilotPrice * PRICING.discountHeadroomPct) / 100,
);

/* ------------------------------------------------------------------ *
 * Roles. An owner per stage was an acceptance criterion; naming who
 * actually holds each role is what stops that being a formality.
 * ------------------------------------------------------------------ */

const ROLES = [
  {
    role: 'Seller',
    holder: 'Ali',
    note: 'The only seller. C2.9, due 28 February 2027, is the decision on whether to '
      + 'fund a second one. Every stage below is owned by the same person today, which '
      + 'is the single largest risk in this runbook and is stated rather than hidden.',
  },
  {
    role: 'Technical evaluator',
    holder: null,
    note: 'Unassigned. The person who answers an architecture or security question the '
      + 'seller cannot. Until this is named, stage 2 of the runbook stalls on the seller.',
  },
  {
    role: 'Approver',
    holder: 'Ali',
    note: 'Anything outside the limits in the concession table, and every reserved '
      + 'clause in C7.3.',
  },
];

/* ------------------------------------------------------------------ *
 * The runbook, mapped onto C8.4 stages
 * ------------------------------------------------------------------ */

/**
 * Steps live INSIDE a C8.4 stage rather than beside it.
 *
 * The funnel has ten stages and this ticket covers the span from a delivered demo to a
 * signed contract, which is four of them. Inventing new stage names for the activities
 * in between would have broken the matching criterion, so each activity is a step within
 * the stage it belongs to and the stage boundary is the thing the instrumentation sees.
 */
const STEPS = [
  {
    n: 1,
    stageKey: 'demo_delivered',
    stageLabel: 'Demo delivered',
    step: 'Immediate follow-up',
    owner: 'Seller',
    timebox: '24 hours from the demo',
    exit: 'A written recap is sent naming what was shown, what was not, and one proposed '
      + 'next step with a date. The account either books that date or says no in writing.',
    note: 'The recap names what was NOT shown on purpose. C7.2 carries exclusions into '
      + 'the proposal, and a demo follow-up that oversells is what makes those exclusions '
      + 'read as a retreat three weeks later.',
  },
  {
    n: 2,
    stageKey: 'demo_delivered',
    stageLabel: 'Demo delivered',
    step: 'Stakeholder mapping',
    owner: 'Seller',
    timebox: '3 business days from the demo',
    exit: 'The economic buyer, the technical evaluator and the procurement contact are '
      + 'each named with a role and an email. A map with an unnamed economic buyer does '
      + 'not clear this step.',
    note: 'C7.1 gate 2 already requires a named executive sponsor, so this step feeds a '
      + 'gate that exists rather than inventing a new one.',
  },
  {
    n: 3,
    stageKey: 'demo_delivered',
    stageLabel: 'Demo delivered',
    step: 'Objection resolution',
    owner: 'Seller, escalating to Technical evaluator',
    timebox: '5 business days from the demo',
    exit: 'Every objection raised is written down with either an answer or an explicitly '
      + 'accepted risk. An objection with neither blocks the proposal.',
    note: 'The security objection is the one that stalls here. C7.8, the security '
      + 'one-pager, is BLOCKED - ALI DECISION REQUIRED, so today this step has no '
      + 'artifact to answer with.',
  },
  {
    n: 4,
    stageKey: 'pilot_proposed',
    stageLabel: 'Pilot proposed',
    step: 'Proposal delivery',
    owner: 'Seller',
    timebox: '5 business days from the demo, running in parallel with steps 2 and 3',
    exit: 'The C7.2 proposal is sent at list price, and a revenue_opportunities row '
      + 'exists for the account with a status and an estimated_value. The row is what '
      + 'moves the funnel; sending the document alone does not.',
    note: 'This is the one step whose completion the platform can already see. C8.4 '
      + 'reads this stage from revenue_opportunities, which exists and is empty.',
  },
  {
    n: 5,
    stageKey: 'pilot_proposed',
    stageLabel: 'Pilot proposed',
    step: 'Procurement and security engagement',
    owner: 'Seller',
    timebox: 'Opened within 2 business days of the proposal, closed within 15',
    exit: 'Procurement has the C7.9 checklist and security has a written answer to every '
      + 'question raised. Any unanswered security question is escalated to the Approver '
      + 'rather than left open.',
    note: 'The known hole. C7.8 is blocked, so the first serious security questionnaire '
      + 'arrives at a gap. Plan for the escalation rather than discovering it.',
  },
  {
    n: 6,
    stageKey: 'contract',
    stageLabel: 'Contract',
    step: 'Negotiation',
    owner: 'Seller within limits, Approver outside them',
    timebox: '10 business days from the proposal',
    exit: 'Terms sit inside every row of the concession table, or the Approver has said '
      + 'yes in writing to the specific exception. A verbal yes does not clear this step.',
    note: 'Three clauses cannot be negotiated at all by anyone but the Approver: IP '
      + 'ownership, deployment liability and model neutrality. C2.6 reserves them and '
      + 'C7.3 ships them deliberately blank.',
  },
  {
    n: 7,
    stageKey: 'contract',
    stageLabel: 'Contract',
    step: 'Signature',
    owner: 'Approver',
    timebox: '5 business days from agreed terms',
    exit: 'delivery_contracts.approved_at is set for the account. That timestamp is the '
      + 'stage, not the PDF.',
    note: 'C8.4 reads this stage from delivery_contracts.approved_at, which is a '
      + 'timestamp somebody sets deliberately. If it is not set, the funnel does not '
      + 'know the deal closed.',
  },
];

/** Where the runbook hands off. Not a step, because C9.4 does not own delivery. */
const HANDOFF = {
  toStageKey: 'pilot_running',
  toStageLabel: 'Pilot running',
  what: 'Signed contract, stakeholder map, the written objection log and the accepted '
    + 'exclusions go to delivery as one package.',
  caveat: 'C8.4 cannot see this stage either. Nothing marks an engagement as paid, so a '
    + 'running pilot is invisible to the funnel until that is instrumented.',
};

/* ------------------------------------------------------------------ *
 * Concession limits
 * ------------------------------------------------------------------ */

/**
 * What may be given away, by whom, and how far.
 *
 * The price row is the only one with an approved number, and it is carried from C2.3
 * rather than set here. Every other row is honestly marked RESERVED, because the ticket
 * assigns the concession decision to Ali and a document that quietly filled them in
 * would be making his decision for him while looking like a process.
 */
const CONCESSIONS = [
  {
    lever: 'Price',
    limit: `${PRICING.discountHeadroomPct}% of list, a maximum of $${MAX_DISCOUNT_DOLLARS.toLocaleString()}`,
    authority: 'Seller, up to the limit. Beyond it, Approver only.',
    basis: PRICING.source,
    status: 'APPROVED',
    note: `List is $${PRICING.pilotPrice.toLocaleString()}. The full headroom is about `
      + `34% of the $${PRICING.netContribution.toLocaleString()} a pilot nets after `
      + 'delivery and acquisition, so the discount is not free margin, it is a third of '
      + 'the contribution.',
  },
  {
    lever: 'Payment terms',
    limit: null,
    authority: 'Approver',
    basis: 'No approved position exists.',
    status: 'RESERVED',
    note: 'Net-30 against net-60 is a cash-flow decision, not a sales one, and C4.8 '
      + 'records the monthly burn as UNKNOWN, so nobody can currently say what the cost '
      + 'of slower terms is.',
  },
  {
    lever: 'Scope',
    limit: null,
    authority: 'Approver',
    basis: 'C7.2 exclusions are the floor and are not negotiable.',
    status: 'RESERVED',
    note: 'Adding scope to win a pilot that already nets 8% of price is the fastest way '
      + 'to a deal that costs money to deliver.',
  },
  {
    lever: 'Timeline',
    limit: null,
    authority: 'Approver',
    basis: 'No approved position exists.',
    status: 'RESERVED',
    note: 'The C2.2 blueprint audit found two capability gaps at days 80 to 90. '
      + 'Compressing the timeline moves the pilot INTO those gaps.',
  },
  {
    lever: 'IP ownership',
    limit: null,
    authority: 'Approver only. Never the Seller.',
    basis: 'C2.6 reserves it. C7.3 ships the clause deliberately blank.',
    status: 'RESERVED - LEGAL',
    note: 'A build assertion in C7.3 fails if this clause acquires draft language, which '
      + 'is the mechanism that stops it being filled in under deal pressure.',
  },
  {
    lever: 'Deployment liability',
    limit: null,
    authority: 'Approver only. Never the Seller.',
    basis: 'C2.6 reserves it. C7.3 ships the clause deliberately blank.',
    status: 'RESERVED - LEGAL',
    note: 'No clause here has been reviewed by counsel.',
  },
  {
    lever: 'Model neutrality',
    limit: null,
    authority: 'Approver only. Never the Seller.',
    basis: 'C2.6 reserves it. C7.3 ships the clause deliberately blank.',
    status: 'RESERVED - LEGAL',
    note: 'Committing to a model or a vendor in a pilot contract sets the default for '
      + 'every later deal.',
  },
];

/* ------------------------------------------------------------------ *
 * What the runbook cannot yet be measured by
 * ------------------------------------------------------------------ */

const MEASUREMENT_GAP = {
  metric: 'Demo-to-proposal time drops',
  verdict: 'NOT COMPUTABLE TODAY',
  because: 'The clock starts at demo_delivered, and C8.4 records that stage as source '
    + 'null, evidence absent: nothing in the platform logs a delivered demo. The clock '
    + 'would stop at pilot_proposed, which does have a source in revenue_opportunities '
    + 'and is empty. So the end of the interval is countable and the start is not.',
  fix: 'One write. Log a delivered demo against the account, with a timestamp, at step 1. '
    + 'The funnel then measures this runbook without any further instrumentation, because '
    + 'pilot_proposed already reads from a real table.',
  alsoBlind: 'pilot_running has the same problem at the other end. Nothing marks an '
    + 'engagement as paid, so conversion from signature to a running pilot is invisible.',
};

/* ------------------------------------------------------------------ *
 * Guards - the acceptance criteria as build gates
 * ------------------------------------------------------------------ */

/**
 * "Stage names match C8.4 exactly."
 *
 * Read from funnelStages.ts on disk rather than from a copy, so this cannot pass while
 * the two have drifted. The same technique C8.7 used against the case study engine: the
 * test reads the authority's own source.
 */
function assertStageNamesMatchC84(readFile) {
  const src = readFile();
  const keys = new Set();
  const labels = new Map();
  const re = /key:\s*'([a-z_]+)',\s*\n\s*label:\s*'([^']+)'/g;
  let m = re.exec(src);
  while (m) {
    keys.add(m[1]);
    labels.set(m[1], m[2]);
    m = re.exec(src);
  }
  if (keys.size < 10) {
    throw new Error(`C9.4: parsed only ${keys.size} stages from funnelStages.ts, expected 10`);
  }
  const used = [...STEPS.map((s) => ({ k: s.stageKey, l: s.stageLabel })),
    { k: HANDOFF.toStageKey, l: HANDOFF.toStageLabel }];
  for (const u of used) {
    if (!keys.has(u.k)) {
      throw new Error(`C9.4: stage "${u.k}" is not a C8.4 stage`);
    }
    if (labels.get(u.k) !== u.l) {
      throw new Error(`C9.4: stage "${u.k}" is labeled "${u.l}" here and `
        + `"${labels.get(u.k)}" in C8.4`);
    }
  }
  return used.length;
}

/** "Every stage has an owner, timebox and exit criterion." */
function assertEveryStepIsOwnedTimedAndExitable() {
  const roleNames = new Set(ROLES.map((r) => r.role));
  for (const s of STEPS) {
    // The owner is checked by MEMBERSHIP, not by length. A valid role name can be short
    // ("Seller" is six characters) and an earlier version of this guard rejected the
    // correct data for being brief, which is the wrong failure: what makes an owner real
    // is that it resolves to a declared role, not that it is wordy.
    if (!s.owner || ![...roleNames].some((r) => s.owner.includes(r))) {
      throw new Error(`C9.4: step ${s.n} owner "${s.owner}" names no declared role`);
    }
    // A timebox and an exit criterion DO need substance: "soon" and "done" are the
    // failure mode here, and both are short.
    for (const field of ['timebox', 'exit']) {
      if (!s[field] || String(s[field]).length < 20) {
        throw new Error(`C9.4: step ${s.n} "${s.step}" has no usable ${field}`);
      }
    }
  }
  return STEPS.length;
}

/**
 * "Concession limits explicit."
 *
 * Explicit means every lever is listed with either an approved limit and its source, or
 * an honest RESERVED. A lever that is simply absent is the failure this checks for,
 * because an unlisted lever is the one that gets conceded in the room.
 */
function assertConcessionsAreExplicit() {
  let approved = 0;
  for (const c of CONCESSIONS) {
    if (!/^(APPROVED|RESERVED|RESERVED - LEGAL)$/.test(c.status)) {
      throw new Error(`C9.4: concession "${c.lever}" has status "${c.status}"`);
    }
    if (c.status === 'APPROVED') {
      if (!c.limit || !c.basis) {
        throw new Error(`C9.4: approved concession "${c.lever}" has no limit or no basis`);
      }
      approved += 1;
    } else if (c.limit !== null) {
      throw new Error(`C9.4: reserved concession "${c.lever}" carries a limit of `
        + `"${c.limit}". A reserved lever with a number in it has been decided by this `
        + 'document rather than by the Approver.');
    }
    if (!c.authority) throw new Error(`C9.4: concession "${c.lever}" names no authority`);
  }
  return approved;
}

/** The discount is C2.3's, carried. This document may not mint a second one. */
function assertNoInventedDiscount() {
  if (PRICING.discountHeadroomPct !== 2.7 || PRICING.pilotPrice !== 44500) {
    throw new Error('C9.4: the pilot price or discount headroom no longer matches C2.3');
  }
  const price = CONCESSIONS.find((c) => c.lever === 'Price');
  if (!/C2\.3/.test(price.basis)) {
    throw new Error('C9.4: the price concession no longer cites C2.3 as its source');
  }
  const others = CONCESSIONS.filter((c) => c.lever !== 'Price');
  for (const c of others) {
    if (/\d+(\.\d+)?\s*%|\$\s?\d/.test(String(c.limit))) {
      throw new Error(`C9.4: concession "${c.lever}" invented a figure`);
    }
  }
}

/** The measurement gap must stay stated while the stages remain uninstrumented. */
function assertTheMeasurementGapIsDeclared() {
  if (MEASUREMENT_GAP.verdict !== 'NOT COMPUTABLE TODAY') {
    throw new Error('C9.4: the measurement gap was closed in prose rather than in code');
  }
  if (!/source null|evidence absent/i.test(MEASUREMENT_GAP.because)) {
    throw new Error('C9.4: the gap no longer cites why demo_delivered cannot be counted');
  }
}

module.exports = {
  AS_OF, PRICING, MAX_DISCOUNT_DOLLARS, ROLES, STEPS, HANDOFF, CONCESSIONS,
  MEASUREMENT_GAP,
  assertStageNamesMatchC84, assertEveryStepIsOwnedTimedAndExitable,
  assertConcessionsAreExplicit, assertNoInventedDiscount,
  assertTheMeasurementGapIsDeclared,
};
