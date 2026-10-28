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
 * ## The two guards that matter most
 *
 * `assertOverturnedFindingsStayVisible`. Ali refined the L&D disqualifier on 2026-10-28
 * and the refinement returns two companies the literal wording had cut. The cheap way to
 * apply that is to flip two verdicts and ship a clean list, which would delete the
 * finding that prompted the decision. So `disq.ld` is frozen as found and `disq.capability`
 * carries the disqualifier; the build fails if a company whose L&D finding was overturned
 * does not say so and does not carry the standing reason to watch it.
 *
 * `assertTheDisqualifierStillFilters`. A criterion can be refined until it excludes
 * nobody, and a disqualifier that disqualifies nobody is decoration presented as
 * diligence. No AI curriculum was found at any of the ten, so a literal "already runs an
 * AI program" test would have passed the whole list. The build fails if the refined
 * wording ever clears all ten.
 */
const D = require('./c613Data');

/**
 * Companies at a given disqualifier verdict, recomputed on every call.
 *
 * The guards below call this rather than reading a view captured at module load. A
 * snapshot taken at require time cannot see a verdict that changed afterwards, so a
 * guard built on one silently stops guarding - which is exactly how the
 * "still filters" check failed its own mutation test before this existed.
 */
const atCapability = (v) => D.COMPANIES.filter((c) => c.disq && c.disq.capability
  && c.disq.capability.verdict === v);

/**
 * Convenience views for the renderer. These read `disq.capability` - the disqualifier as
 * Ali settled it - not `disq.ld`, which is the underlying finding and is never used to
 * pass or fail a row.
 */
const DISQUALIFIED = atCapability('DISQUALIFIED');
const UNRESOLVED = atCapability('UNRESOLVED');
const CLEAN = atCapability('PASSES').filter((c) => c.disq.aiLeader
  && c.disq.aiLeader.verdict !== 'DISQUALIFIED');
const WITH_REQ = D.COMPANIES.filter((c) => c.req && c.req.verdict === 'YES');

/** Passing companies whose L&D finding was a disqualification under the literal wording. */
const OVERTURNED = atCapability('PASSES').filter((c) => c.disq.ld
  && c.disq.ld.verdict === 'DISQUALIFIED');

/**
 * The ticket's acceptance criteria, verbatim, each scored from the data.
 *
 * Criterion 3 is now scorable, and it was not before. The ticket asks that each company
 * be checked against the disqualifiers; all ten were, the check failed three under the
 * ticket's literal wording, and that wording was the open question. Ali settled it on
 * 2026-10-28, so the criterion is MET against a disqualifier that is now stated rather
 * than inferred - and the three findings that forced the question are still reported.
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
      verdict: DISQUALIFIED.length + UNRESOLVED.length > 0 && CLEAN.length > 0
        ? 'MET' : 'UNMET',
      evidence: 'All ten checked against both disqualifiers. The AI-leadership check is '
        + 'clean across the list (one WATCH: Lindsay’s CIO has AI inside her remit). The '
        + 'L&D check, which had never been run properly, disqualifies '
        + DISQUALIFIED.map((c) => c.name).join(' and ') + '. ' + CLEAN.length
        + ' of the ten clear both.',
      note: 'The L&D wording was the open question and is now settled. The ticket read '
        + '"no full talent plus L&D function"; run literally it failed three, including '
        + 'the best-fitting company on the list. Ali chose the refined reading on '
        + D.DISQ_LD.decidedOn + ': ' + D.DISQ_LD.wording,
      decision: OVERTURNED.length
        ? 'The refinement returns ' + OVERTURNED.map((c) => c.name).join(' and ')
          + ', whose L&D findings are unchanged and reported in full below. '
          + D.DISQ_LD.evidenceLimit + ' The order of approach remains Ali’s, and is the '
          + 'half of "the final ten and the order" still outstanding.'
        : 'The order of approach remains Ali’s.',
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
    if (c.disq && c.disq !== D.PENDING) {
      if (c.disq.ld === D.PENDING) bad.push(c.name + '.disq.ld');
      if (!c.disq.capability || c.disq.capability === D.PENDING) {
        bad.push(c.name + '.disq.capability');
      }
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
  for (const c of atCapability('DISQUALIFIED')) {
    if (!c.disq.capability.detail) {
      throw new Error(c.name + ' is marked disqualified with no reason given.');
    }
  }
}

/**
 * A refined criterion must not quietly delete the evidence that forced the refinement.
 * Every company the refinement returns has to say that it was overturned and carry the
 * standing reason to watch it, so the next person reading this list sees the same
 * finding Ali saw when he decided.
 */
function assertOverturnedFindingsStayVisible() {
  const overturned = atCapability('PASSES').filter((c) => c.disq.ld
    && c.disq.ld.verdict === 'DISQUALIFIED');
  for (const c of overturned) {
    const cap = c.disq.capability;
    if (!cap.overturnedBy || !cap.watch) {
      throw new Error(c.name + ' passes a disqualifier it previously failed with no '
        + 'record of the overturn and no standing watch. Refining a criterion is '
        + 'allowed; losing the finding that prompted it is not.');
    }
  }

  // The check above keys on the L&D finding, so softening that finding would quietly
  // exempt a company from it - the one edit that erases an overturn without tripping
  // anything. An overturn record is therefore binding in the other direction too: claim
  // one and the finding it overturned has to still be on the page.
  for (const c of D.COMPANIES) {
    const cap = c.disq && c.disq.capability;
    if (cap && cap.overturnedBy && c.disq.ld.verdict !== 'DISQUALIFIED') {
      throw new Error(c.name + ' records an overturned disqualification but its L&D '
        + 'finding no longer reads DISQUALIFIED. The finding and the overturn must '
        + 'agree, or the refinement has been used to rewrite the evidence.');
    }
  }
}

/**
 * A disqualifier that disqualifies nobody is decoration presented as diligence. If the
 * refined wording ever clears all ten, it has stopped being a filter and the document
 * must not claim the list was screened.
 */
function assertTheDisqualifierStillFilters() {
  if (atCapability('DISQUALIFIED').length === 0) {
    throw new Error('The refined L&D disqualifier excludes nobody. A criterion that '
      + 'passes every candidate is not a screen - either the wording has been loosened '
      + 'past usefulness or the evidence was not gathered.');
  }
}

/** Run everything; returns the count of companies carrying a failed or open check. */
function assertAllGuards() {
  assertNoPendingFields();
  assertNoUnsourcedCommitment();
  assertEveryNegativeHasAControl();
  assertNoGuessedEmail();
  assertDisqualifiedAreNotHidden();
  assertOverturnedFindingsStayVisible();
  assertTheDisqualifierStillFilters();
  return DISQUALIFIED.length + UNRESOLVED.length;
}

module.exports = {
  criteria, assertAllGuards, DISQUALIFIED, UNRESOLVED, CLEAN, WITH_REQ, OVERTURNED,
};
