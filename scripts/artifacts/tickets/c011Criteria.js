/**
 * C0.11's acceptance criteria, scored, plus the guards that refuse to build a document
 * which overstates what has happened.
 *
 * ## The guard that matters most
 *
 * assertNoActionIsClaimedBeforeItHappens. This artifact is about money moving, and the
 * easiest way for it to become a lie is to be written while the suspension is still
 * only prepared, then filed as though it had been done. The artifact reports the
 * suspension ONLY when ACTION.suspendedOn is set, and the first criterion scores UNMET
 * until then, however complete the evidence behind it is.
 */
const D = require('./c011Data');

const kept = () => D.PAYMENTS.filter((p) => D.KEPT.test(p.status));
const collected = () => kept().reduce((a, p) => a + p.amount, 0);

function criteria() {
  const done = !!D.ACTION.suspendedOn;
  return [
    {
      id: 1,
      text: 'Schedule 4319082 shows as suspended or canceled in PaySimple before '
        + '2 November',
      verdict: done ? 'MET' : 'UNMET',
      detail: done
        ? 'Suspended ' + D.ACTION.suspendedOn + ' and read back from PaySimple.'
        : 'Not yet. The schedule is Active with a ' + fmt(D.SCHEDULE.amount) + ' draft '
          + 'dated ' + D.SCHEDULE.nextDraft + '. Everything needed to suspend it is '
          + 'verified and the command is staged; the settlement confirmation this '
          + 'depends on is Ali’s.',
    },
    {
      id: 2,
      text: 'No payment is drafted against Fikru Cheklie after the settlement date',
      verdict: done ? 'MET' : 'AT RISK',
      detail: 'Twelve payments have stayed, totalling ' + fmt(collected())
        + ', which equals the settlement exactly. The next draft would take the total to '
        + fmt(collected() + D.SCHEDULE.amount) + '. Until the schedule is suspended this '
        + 'criterion is a forecast, not a fact.',
    },
    {
      id: 3,
      text: 'Any other status-11 contract with a live schedule is listed, checked the '
        + 'same way',
      verdict: 'MET',
      detail: 'All ' + D.SWEEP.statusElevenContracts + ' Paid Off Early contracts were '
        + 'enumerated; the ' + D.SWEEP.withPaySimpleCustomer + ' carrying a PaySimple '
        + 'customer id were each queried against PaySimple directly. Exactly '
        + D.SWEEP.liveSchedulesFound + ' has a live schedule, and it is the one this '
        + 'ticket is about. The CCPP flag was deliberately not used as the screen.',
    },
  ];
}

function fmt(n) { return '$' + Number(n).toLocaleString(); }

/** The arithmetic the whole action rests on. */
function assertCollectedEqualsSettlement() {
  const total = collected();
  if (total !== D.SETTLEMENT) {
    throw new Error('Payments that stayed total ' + fmt(total) + ', not the '
      + fmt(D.SETTLEMENT) + ' settlement. The justification for suspending is that we '
      + 'have collected exactly what was agreed; if that is not true, this document '
      + 'must not be filed as though it were.');
  }
  const reversed = D.PAYMENTS.filter((p) => !D.KEPT.test(p.status));
  if (reversed.length === 0) {
    throw new Error('No reversed payment is recorded, but the October NSF is a load '
      + 'bearing part of this case: it is why a further draft against this student is '
      + 'worse than a bookkeeping error.');
  }
}

/** Never report an action that has not happened. */
function assertNoActionIsClaimedBeforeItHappens() {
  const done = !!D.ACTION.suspendedOn;
  if (!done && criteria()[0].verdict === 'MET') {
    throw new Error('Criterion 1 reads MET while ACTION.suspendedOn is null. The '
      + 'schedule has not been suspended; saying so would put a false confirmation in '
      + 'the governance folder.');
  }
  if (done && !/^\d{4}-\d{2}-\d{2}$/.test(String(D.ACTION.suspendedOn))) {
    throw new Error('The ticket asks for confirmation WITH THE DATE, and suspendedOn is '
      + 'not a date: ' + D.ACTION.suspendedOn);
  }
}

/**
 * The sweep's conclusion must still match its own arithmetic, and the methodological
 * finding must still be true. If a future run finds the CCPP flag agreeing with
 * PaySimple, the document's central warning is stale and should not be reprinted.
 */
function assertTheSweepStillHoldsAndTheFlagIsStillWrong() {
  const s = D.SWEEP;
  if (s.liveScheduleOwners.length !== s.liveSchedulesFound) {
    throw new Error('The sweep says ' + s.liveSchedulesFound + ' live schedule(s) but '
      + 'names ' + s.liveScheduleOwners.length + '. One was edited without the other.');
  }
  if (s.liveSchedulesFound === 0) {
    throw new Error('The sweep found no live schedule at all, which contradicts the '
      + 'schedule read showing 4319082 Active. Re-run the reads before filing.');
  }
  if (s.naiveActiveWithNoPaySimpleCustomer === 0) {
    throw new Error('No false positives are recorded for the CCPP flag, so the '
      + 'document’s central methodological warning no longer has evidence behind '
      + 'it. Either re-measure or drop the warning.');
  }
  if (s.withPaySimpleCustomer > s.statusElevenContracts
    || s.checkedAgainstPaySimple !== s.withPaySimpleCustomer) {
    throw new Error('The sweep claims to have checked ' + s.checkedAgainstPaySimple
      + ' of ' + s.withPaySimpleCustomer + ' contracts with a customer id. Every one '
      + 'with an id must be checked, or the "no others" claim is not supported.');
  }
}

/** A settlement figure asserted without the payments behind it is just a number. */
function assertEveryFigureHasASource() {
  for (const [name, block] of [['SCHEDULE', D.SCHEDULE], ['CONTRACT', D.CONTRACT],
    ['SWEEP', D.SWEEP]]) {
    if (!block.src || String(block.src).length < 10) {
      throw new Error(name + ' carries no source. This document goes into the '
        + 'governance folder as the reason money was or was not taken.');
    }
  }
  if (D.PAYMENTS.length < 2) {
    throw new Error('The payment list is too short to reconcile anything.');
  }
}

/** The distinction the ticket reserves to Ali must survive editing. */
function assertAlisQuestionIsStillAsked() {
  if (!D.FOR_ALI.question || !D.FOR_ALI.whyNotMine) {
    throw new Error('The artifact no longer records that confirming the settlement was '
      + 'GRANTED at $12,000 is Ali’s to do. Collected is not granted, and this '
      + 'document must not let the arithmetic imply otherwise.');
  }
}

function assertAllGuards() {
  assertCollectedEqualsSettlement();
  assertNoActionIsClaimedBeforeItHappens();
  assertTheSweepStillHoldsAndTheFlagIsStillWrong();
  assertEveryFigureHasASource();
  assertAlisQuestionIsStillAsked();
  return criteria().filter((c) => c.verdict === 'MET').length;
}

module.exports = { criteria, assertAllGuards, kept, collected, fmt };
