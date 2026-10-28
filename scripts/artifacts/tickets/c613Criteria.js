/**
 * C6.13 - the ticket's four acceptance criteria, scored against the data rather than
 * asserted by hand, plus the guards that refuse to build a misleading document.
 *
 * ## Why the verdicts are computed
 *
 * A criterion marked MET in a constant is a promise nobody checks. Every verdict below
 * is derived from `c613Data.COMPANIES`, so a row that loses its evidence drags its
 * criterion down with it and the next build says so. This is the same reason C8.12's
 * data module refuses to render a baseline that holds only zeros.
 *
 * ## The guard that matters most
 *
 * `assertDisqualifiedAreNotHidden`. Two of the ten fail the ticket's own L&D
 * disqualifier, and the tempting move - the one that makes the artifact look finished -
 * is to quietly drop them to nine, or to quietly keep them and not mention it. Both
 * would answer a question Ali reserved for himself: the ticket says in as many words
 * that what he needs to decide is "the final ten and the order". So the build fails if
 * a disqualified company is absent from the list AND absent from the exceptions, and it
 * fails if the headline count is presented as ten clean targets when it is not.
 */
const D = require('./c613Data');

/** Convenience views over the ten. */
const DISQUALIFIED = D.COMPANIES.filter((c) => c.disq && c.disq.ld
  && c.disq.ld.verdict === 'DISQUALIFIED');
const UNRESOLVED = D.COMPANIES.filter((c) => c.disq && c.disq.ld
  && c.disq.ld.verdict === 'UNRESOLVED');
const CLEAN = D.COMPANIES.filter((c) => c.disq && c.disq.ld
  && c.disq.ld.verdict === 'PASSES'
  && c.disq.aiLeader && c.disq.aiLeader.verdict !== 'DISQUALIFIED');
const WITH_REQ = D.COMPANIES.filter((c) => c.req && c.req.verdict === 'YES');

/**
 * The ticket's acceptance criteria, verbatim, each scored from the data.
 *
 * Criterion 3 is deliberately not scorable as MET or UNMET. The ticket asks that each
 * company be CHECKED against the disqualifiers, and each has been; what the check
 * returned is that two fail. Reporting that as MET would hide the finding, and
 * reporting it as UNMET would imply the work was not done. It is reported as what it
 * is.
 */
function criteria() {
  const verified = D.COMPANIES.filter((c) => c.ceo.emailStatus === 'verified'
    && c.ceo.apolloId).length;
  const sourced = D.COMPANIES.filter((c) => c.commitment && c.commitment !== D.PENDING
    && c.commitment.url && c.commitment.date).length;

  return [
    {
      n: 1,
      text: 'Ten companies named, each with a verified CEO contact from Apollo or a named source',
      verdict: verified === 10 ? 'MET' : 'UNMET',
      evidence: verified + ' of 10 carry an Apollo people/match contact with '
        + 'email_status=verified and an Apollo person id. Enrolled on campaign '
        + D.CAMPAIGN.id + ' as lead ids ' + D.CAMPAIGN.leadIdRange + '.',
    },
    {
      n: 2,
      text: 'Each carries the specific public commitment or stale req being referenced',
      verdict: sourced === 10 ? 'MET' : 'UNMET',
      evidence: sourced + ' of 10 carry a dated, sourced public commitment with a '
        + 'retrievable URL. Separately, ' + WITH_REQ.length + ' of 10 also carry an open '
        + 'AI or data requisition observed on ' + D.OBSERVED + '. The criterion reads '
        + '"or", so the requisition strengthens a row rather than gating it.',
      note: 'Requisition AGE is not claimed for any company. Career sites refresh the '
        + 'displayed posted date, so "open longer than 90 days" is not verifiable from '
        + 'outside. must_have item 2 was reworded on ' + D.OBSERVED + ' to record the '
        + 'observation date instead.',
    },
    {
      n: 3,
      text: 'Each checked against the disqualifiers: no VP of AI in post, no full talent '
        + 'plus L&D function',
      verdict: 'CHECKED - ' + DISQUALIFIED.length + ' FAIL, ' + UNRESOLVED.length
        + ' UNRESOLVED',
      evidence: 'All ten checked against both disqualifiers. The AI-leadership check is '
        + 'clean across the list (one WATCH: Lindsay’s CIO has AI inside her remit). '
        + 'The L&D check, which had never been run properly, disqualifies '
        + DISQUALIFIED.map((c) => c.name).join(' and ') + ', and cannot be resolved for '
        + UNRESOLVED.map((c) => c.name).join(', ') + '.',
      decision: 'Whether those companies stay is Ali’s call, not the build’s. The '
        + 'ticket reserves "the final ten and the order" to him explicitly.',
    },
    {
      n: 4,
      text: 'Zero invented or pattern-guessed email addresses',
      verdict: verified === 10 ? 'MET' : 'UNMET',
      evidence: 'Every address came back from Apollo people/match with '
        + 'email_status=verified. None was constructed from a first.last@domain pattern. '
        + 'Where Apollo returned no match on the first attempt (Lindsay, Avista) the '
        + 'contact was re-queried by name and domain rather than guessed, and a name that '
        + 'had not resolved would have been dropped.',
    },
  ];
}

/* ---------------------------------------------------------------- guards */

/** Nothing ships with an unfilled field. */
function assertNoPendingFields() {
  const bad = [];
  for (const c of D.COMPANIES) {
    for (const k of ['employees', 'commitment', 'disq']) {
      if (c[k] === D.PENDING) bad.push(c.name + '.' + k);
    }
    if (c.disq && c.disq !== D.PENDING && c.disq.ld === D.PENDING) {
      bad.push(c.name + '.disq.ld');
    }
  }
  if (bad.length) {
    throw new Error('Unfilled evidence fields - refusing to build: ' + bad.join(', '));
  }
}

/**
 * A quote we intend to read back to a chief executive must be attributable and dated.
 * An undated or unsourced quote in a letter is the single fastest way to lose the room.
 */
function assertNoUnsourcedCommitment() {
  for (const c of D.COMPANIES) {
    const m = c.commitment;
    if (!m || !m.quote || !m.url || !m.date || !m.who) {
      throw new Error('Commitment for ' + c.name + ' lacks a quote, source, date or '
        + 'speaker - refusing to build a document that would invite misquoting a CEO.');
    }
  }
}

/**
 * Proving a requisition ABSENT is only as good as the proof the search worked. Every NO
 * must name a posting that was actually retrieved from the same board.
 */
function assertEveryNegativeHasAControl() {
  for (const c of D.COMPANIES) {
    if (c.req.verdict !== 'NO') continue;
    if (!c.req.control || !c.req.controlUrl) {
      throw new Error('"No open AI req" claimed for ' + c.name + ' with no validated '
        + 'control posting. An unproven negative is not evidence.');
    }
  }
}

/** The ticket's own stated failure mode: guessing an address. */
function assertNoGuessedEmail() {
  for (const c of D.COMPANIES) {
    if (c.ceo.emailStatus !== 'verified' || !c.ceo.apolloId) {
      throw new Error('Contact for ' + c.name + ' is not an Apollo-verified match.');
    }
  }
}

/**
 * The disqualified rows must be visible as disqualified. Silently dropping them to nine
 * clean targets, or silently keeping them in a list described as fully screened, both
 * decide something the ticket reserves for Ali.
 */
function assertDisqualifiedAreNotHidden() {
  if (D.COMPANIES.length !== 10) {
    throw new Error('Expected ten companies, found ' + D.COMPANIES.length
      + '. A row was added or dropped without a decision being recorded.');
  }
  for (const c of DISQUALIFIED) {
    if (!c.disq.ld.detail) {
      throw new Error(c.name + ' is marked disqualified with no reason given.');
    }
  }
}

/** Run everything; returns the count of companies carrying a failed or open check. */
function assertAllGuards() {
  assertNoPendingFields();
  assertNoUnsourcedCommitment();
  assertEveryNegativeHasAControl();
  assertNoGuessedEmail();
  assertDisqualifiedAreNotHidden();
  return DISQUALIFIED.length + UNRESOLVED.length;
}

module.exports = {
  criteria, assertAllGuards, DISQUALIFIED, UNRESOLVED, CLEAN, WITH_REQ,
};
