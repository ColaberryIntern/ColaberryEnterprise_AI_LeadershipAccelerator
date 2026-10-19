/**
 * M24.1 / M24.2 / M24.3 data module. One rule, three places it was broken.
 *
 * Shared by all three tickets' artifacts so a figure cannot differ between them. The build script
 * re-derives the contract tally from CONTRACT before drawing, because the document these fixes
 * amend shipped a first draft whose headline disagreed with its own table.
 */

const MEASURED_ON = '17 Oct 2026';

/** The rule all three serve, quoted from M24's acceptance criteria. */
const RULE = 'An absent input never scores as zero.';

const WHY = 'A score ranks people. "We have no evidence" and "we have evidence of nothing" are '
  + 'different facts, and a score that cannot tell them apart ranks an untracked stranger '
  + 'identically to a known tourist.';

const FIXES = [
  {
    code: 'M24.1',
    ticket: 10415705638,
    slug: 'M24_1_ENGAGEMENT_ABSENCE',
    title: 'engagement stops reading an untracked person as a tracked one',
    file: 'personProfileService.ts',
    was: 'A bare aggregate with no GROUP BY returns exactly one row even when its joins match '
      + 'nothing, so the null-guard below it was dead code. A person with no visitor record '
      + 'received {sessions: 0, firstSeen: null, sites: []}, byte-identical to a tracked person '
      + 'who never opened a page.',
    now: 'The same aggregate also counts visitor rows, so absence is detectable without a GROUP '
      + 'BY splitting the totals it is supposed to sum across a person\'s visitor records. Zero '
      + 'visitors gives null; one visitor and no sessions still gives a real 0.',
    mutant: 'the visitor-count guard removed',
    killed: 'is NULL for a person with no visitor record at all',
    extra: 'The group had no behavioural test at all, in a registry of 22. It has one now.',
  },
  {
    code: 'M24.2',
    ticket: 10415705721,
    slug: 'M24_2_JOURNEY_COUNTS_NULL',
    title: 'the journey counts obey the rule their own docblock states',
    file: 'journeyPanel.ts',
    was: 'The module docblock said "a count we cannot compute is null rather than 0". Four lines '
      + 'below, six counts were coerced with ?? 0, and the query was skipped entirely when there '
      + 'were no lead ids. Only daysKnown and intentScore honoured the rule.',
    now: 'Six fields are number | null. Null means the query was never issued; 0 means it ran '
      + 'and counted nothing. The frontend renders the absent case as the dash it already used '
      + 'for daysKnown.',
    mutant: 'the counts coerced back to ?? 0',
    killed: 'is NULL for every lead-derived count when the person has no lead record',
    extra: 'These are the counts that lied about exactly the rows M22 has not yet classified, '
      + 'so the population decision and this defect compounded.',
  },
  {
    code: 'M24.3',
    ticket: 10415705791,
    slug: 'M24_3_PERMISSION_NOT_A_VALUE',
    title: 'permission and key states stop being written into value slots',
    file: 'journeyPanel.ts + personProfileService.ts',
    was: 'enrollments counted only the ids the caller could see, so a mentor without grants read '
      + '0 enrollments for a person who had several. appointments and automation substituted [] '
      + 'when there was no lead id, making "nothing booked" and "we could not look" the same '
      + 'answer.',
    now: 'The enrollment count is withheld through the EXISTING withheldPanels mechanism rather '
      + 'than shrunk, and the two lists are null when there was no key. A second withholding '
      + 'mechanism was explicitly not introduced.',
    mutant: 'enrollments counted regardless of permission, and appointments back to []',
    killed: 'withholds the enrollment count when the id list was narrowed',
    extra: 'This was the determinism bug: the same person ranked differently depending on who '
      + 'asked, which breaks DECISION 1 at the input rather than in the arithmetic.',
  },
];

/** What the M24 contract's input table said before and after these fixes. */
const CONTRACT = {
  inputs: 13,
  safeBefore: 7,
  safeAfter: 11,
  excludedAfter: 2,
};

/** Still excluded, and deliberately not in scope here. */
const STILL_EXCLUDED = [
  {
    what: 'Prior outcome detail',
    fields: 'history.everHired, everCertified, totalListedFees',
    why: 'A NULL column still reads false, and a set of enrollments with all-null fees still sums '
      + 'to 0, so "not recorded" and "not hired" remain the same answer.',
  },
  {
    what: 'Recency',
    fields: 'journey.lastActivity',
    why: 'Section-filtered per caller, so two callers with different roles read a different last '
      + 'activity for the same person. DECISION 5 makes recency a per-component decay, so an '
      + 'input that varies by viewer is a determinism problem. (An earlier version of this line '
      + 'also blamed the timeline\'s 150-row cap. It should not have: the timeline is ordered '
      + 'newest-first and the limit applies afterwards, so the cap truncates the tail and cannot '
      + 'affect a MAX. The per-caller filter is the whole of the defect.)',
  },
];

const VERIFICATION = [
  ['absenceIsNotZero.test.ts', '16 passed, 16 total'],
  ['mutation', '4 mutants, each killed exactly one named test, every restore cmp-identical'],
  ['the whole adminOs suite', '346 passed across 22 suites'],
  ['frontend person suites', '45 passed across 4'],
  ['backend tsc --noEmit', 'exit 0'],
  ['frontend tsc --noEmit', 'exit 0'],
  ['srsInputContract.test.ts', '14 passed - it forced the contract update to stay arithmetically consistent'],
  ['citation gate', '166 citations, citations OK, no drift'],
];

const M22 = 'M22 is now the only one of M24\'s four items still open, and it is Ali\'s: until the '
  + '37 ambiguous rows are resolved or explicitly parked, the score\'s population is a default '
  + 'rather than a decision.';

const byCode = (code) => {
  const f = FIXES.find((x) => x.code === code);
  if (!f) throw new Error(`no fix ${code}`);
  return f;
};

module.exports = { MEASURED_ON, RULE, WHY, FIXES, CONTRACT, STILL_EXCLUDED, VERIFICATION, M22, byCode };
