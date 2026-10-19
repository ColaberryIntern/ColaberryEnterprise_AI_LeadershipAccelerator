/**
 * C4.12 - recut the FDE Pathway six-pager figures against the claim registry.
 *
 * ## What this is
 *
 * The six-pager is `Refactored-FDE-Pathway-2026-10-14.pdf`, a DESIGNED document with no
 * generator in this repository, so this ticket cannot regenerate it. What it can produce,
 * and what the ticket actually asks for, is the recut itself: every figure on the page, what
 * it currently prints, what it should print, and the query that settles it.
 *
 * ## Every figure here was re-derived on 17 October 2026
 *
 * Not copied from the ticket, which was written on 16 October against figures dated 8 and 9
 * October. Two of the ticket's own assumptions did not survive the re-run, and they are the
 * most important things in this document:
 *
 *   1. The ticket says "17 learners build-complete comes off entirely, unless someone can
 *      name the query that produces it". The query exists. It is
 *      COUNT(DISTINCT projects.enrollment_id) over learners with at least one verified story,
 *      and it returns exactly 17. But it counts learners who have ONE verified story, not
 *      learners who are finished. Asked the question the page actually claims - how many
 *      learners have every story verified - the answer is ZERO.
 *
 *   2. The ticket says "13 case studies is correct". Today 13 are approved but only 11 are
 *      public. A reader who counts what they can open finds 11, not 13.
 *
 * A figure that is reproducible but mislabeled is more dangerous than one that is simply
 * wrong, because it survives the first check.
 */

const AS_OF = '17 October 2026';

/** Where a number came from. There is deliberately no tag for an estimate. */
const SRC = {
  QUERY: { k: 'PRODUCTION QUERY', color: '#1f6feb' },
  REGISTRY: { k: 'CLAIM REGISTRY', color: '#7a4fb6' },
  JUDGMENT: { k: 'JUDGMENT CALL', color: '#b26a00' },
};

const HEADLINE = 'One figure on the six-pager is reproducible, mislabeled, and claims '
  + 'something that is actually zero. That is the one to fix first.';

const SO_WHAT = [
  '"17 learners build-complete" was retired on 8 October because nobody could reproduce it. '
    + 'It IS reproducible: 17 is the number of learners with at least one commit-verified '
    + 'story. The problem was never the arithmetic. Asked what the page actually claims, how '
    + 'many learners have every story verified, the answer is 0 of 30. The line has to come '
    + 'off, and the reason it has to come off is stronger than the reason recorded.',
  'Three of the five published figures have simply drifted. Verified stories were 319 when '
    + 'the page was written and are 345 today, which is why that row needs a date rather than '
    + 'a label. Projects read 51 because it counted build-plan rows; it is 48. Case studies '
    + 'read 13, which was right for approved and is wrong for what a reader can open, now 11.',
  'Nothing here is a new claim. Every corrected figure traces to a named query that anyone '
    + 'can re-run, which is the control CLM-029 exists to enforce, and the two judgment items '
    + 'are flagged as judgment rather than smuggled in as fact.',
];

/* ------------------------------------------------------------------ *
 * THE RECUT TABLE, which is the deliverable
 * ------------------------------------------------------------------ */

const ROWS = [
  {
    n: 1,
    where: 'Published work, figure 1',
    prints: '51 learner projects',
    becomes: '48 learner projects',
    src: SRC.QUERY,
    why: '51 counted build-plan rows, not projects. 84 build-plan rows exist across 48 '
      + 'distinct projects. Separately, 72 project rows exist in total; 48 is the count that '
      + 'carries a build plan, and it is the figure CLM-001 approved.',
    query: 'SELECT COUNT(DISTINCT project_id) FROM build_plans',
    severity: 'wrong',
  },
  {
    n: 2,
    where: 'Published work, figure 2',
    prints: '319 stories verified',
    becomes: '345 stories verified as of 17 October 2026, across 29 projects',
    src: SRC.QUERY,
    why: 'The figure rises as learners commit: 319 when the page was written, 322 on 8 '
      + 'October, 331 on 9 October, 345 today. CLM-002 requires the as-of date for exactly '
      + 'this reason, and an undated figure becomes wrong by sitting still. 343 of the 345 '
      + 'also carry a verification record reading "verified"; the 345 is the registry’s '
      + 'own named query, so 345 is the number to print.',
    query: "SELECT COUNT(*) FROM student_tasks WHERE verified_by = 'build_pipeline:repo_verification'",
    severity: 'stale',
  },
  {
    n: 3,
    where: 'Published work, figure 3, page 5',
    prints: '17 learners build-complete',
    becomes: 'Remove. If a learner figure is wanted, "17 learners have at least one '
      + 'commit-verified story" is true and defensible.',
    src: SRC.QUERY,
    why: 'THE IMPORTANT ONE. CLM-003 retired this on 8 October on the basis that no query '
      + 'reproduced it. A query does: 17 is the count of distinct enrollments with at least '
      + 'one verified story. So the number was never invented. But it does not mean '
      + 'build-complete. Asked how many learners have EVERY story verified, the answer is 0 '
      + 'of the 30 enrollments carrying any story at all. The page claims a completion that '
      + 'nobody has reached.',
    query: 'SELECT COUNT(*) FILTER (WHERE verified = total) FROM (per-enrollment totals) -> 0; '
      + 'SELECT COUNT(*) FILTER (WHERE verified > 0) -> 17',
    severity: 'retired',
  },
  {
    n: 4,
    where: 'Published work, figure 4',
    prints: '13 case studies',
    becomes: '13 approved, 11 publicly readable as of 17 October 2026, six shown here',
    src: SRC.QUERY,
    why: 'The ticket assumed 13 was correct. It is correct for approved and wrong for what a '
      + 'reader can open: as of 17 October 2026, 11 are approved and public, 2 are approved '
      + 'and private, 1 is draft and 6 are archived. The page then lists six, so it needs to '
      + 'say six are shown whichever denominator it keeps. This count moves as case studies '
      + 'are published and archived, so it carries a date for the same reason the story '
      + 'count does.',
    query: 'SELECT status, visibility, COUNT(*) FROM case_studies GROUP BY 1,2',
    severity: 'stale',
  },
  {
    n: 5,
    where: 'Published work, figure 5',
    prints: '0 of 46 presented at Demo Day, sourced to the platform repository',
    becomes: 'Same wording, relabeled as a Basecamp figure',
    src: SRC.REGISTRY,
    why: 'The wording is good and stays. The attribution is wrong: no table matching "demo" '
      + 'exists in the production database, so this cannot be a platform figure. CLM-012 '
      + 'blocks it as a platform claim and permits it sourced from Basecamp and labeled as '
      + 'such.',
    query: 'No platform query exists. That is the point.',
    severity: 'mislabeled',
  },
  {
    n: 6,
    where: 'Page 6, the goal',
    prints: '10,000 engineers in 18 to 24 months',
    becomes: 'Add a sentence saying how, or use a smaller number',
    src: SRC.JUDGMENT,
    why: 'This is Anthropic’s own number for a $100 million program, not ours. C2.4 found '
      + 'lead supply to be the binding constraint, with a measured 0.05% reply rate across '
      + '48,924 sends. Printing someone else’s target as our goal, with no mechanism '
      + 'named, invites the one question we cannot answer.',
    query: 'Judgment. C2.4 supplies the constraint.',
    severity: 'judgment',
  },
  {
    n: 7,
    where: 'Throughout',
    prints: 'Four statements that we do not certify or issue credentials',
    becomes: 'Add, explicitly, that we are not part of Claude Frontier Academy',
    src: SRC.REGISTRY,
    why: 'CLM-025 requires the non-affiliation wording wherever a lab program is named, and '
      + 'section 04 of this document is built around that program. Saying four times that we '
      + 'do not certify is not the same statement and does not satisfy the row.',
    query: 'CLM-025, approved 8 October 2026.',
    severity: 'missing',
  },
];

/* ------------------------------------------------------------------ *
 * THE 17, SETTLED
 * ------------------------------------------------------------------ */

const SEVENTEEN = [
  { k: 'Enrollments with at least one verified story', v: '17',
    note: 'This is what the number 17 counts, and it is reproducible' },
  { k: 'Enrollments with EVERY story verified', v: '0',
    note: 'This is what "build-complete" claims' },
  { k: 'Enrollments carrying any story at all', v: '30',
    note: 'The denominator for both figures above' },
  { k: 'Verified stories in total', v: '345',
    note: 'Across 29 projects, as of 17 October 2026' },
];

const LIMITS = [
  'The six-pager is a designed PDF with no generator in this repository, so this ticket '
    + 'produces the recut rather than a new file. Whoever owns the design applies it.',
  'Every count here moves. Verified stories rose from 319 to 345 while this ticket sat open. '
    + 'Each row names its query so the figure can be re-derived on the day it is printed '
    + 'rather than trusted from this page.',
  'Rows 6 and 7 are judgment and policy, not arithmetic, and are tagged as such. They need '
    + 'Ali’s decision rather than a re-run.',
  'CLM-002 expires 8 November 2026. The verified-stories row needs a re-verification pass '
    + 'before that date whatever this document says.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** Every row states where it came from, or the build fails. */
function assertSourced() {
  const bad = ROWS.filter((r) => !r.src || !r.query || !String(r.query).trim());
  if (bad.length) throw new Error('C4.12: unsourced row(s): ' + bad.map((b) => b.n).join(', '));
  return ROWS.length;
}

/**
 * The retired figure must be handled as a REMOVAL, never quietly corrected.
 *
 * The failure this guards is subtle: having discovered that 17 is reproducible, the tempting
 * move is to reinstate it. The page claims build-complete, that number is 0, and reinstating
 * 17 under the old label would make this document the thing that put a retired claim back.
 */
function assertSeventeenComesOff() {
  const row = ROWS.find((r) => r.n === 3);
  if (!/^Remove\b/.test(row.becomes)) {
    throw new Error('C4.12: row 3 must begin by removing the figure, not restating it');
  }
  const complete = SEVENTEEN.find((s) => /EVERY story/.test(s.k));
  if (complete.v !== '0') {
    throw new Error('C4.12: the build-complete count is the whole argument; it must be 0');
  }
  return true;
}

/** The two judgment items may not masquerade as measurements. */
function assertJudgmentIsLabeled() {
  for (const r of ROWS) {
    const isJudgment = r.severity === 'judgment';
    const taggedJudgment = r.src === SRC.JUDGMENT;
    if (isJudgment !== taggedJudgment) {
      throw new Error(`C4.12: row ${r.n} disagrees with itself about being a judgment call`);
    }
  }
  return ROWS.filter((r) => r.severity === 'judgment').length;
}

/** No figure may be printed without an as-of date somewhere in its row. */
function assertDatedWhereItMoves() {
  const moving = ROWS.filter((r) => r.severity === 'stale');
  for (const r of moving) {
    if (!/\d{1,2} October 2026|as of/i.test(r.becomes + r.why)) {
      throw new Error(`C4.12: row ${r.n} moves over time and carries no date`);
    }
  }
  return moving.length;
}

module.exports = {
  AS_OF, SRC, HEADLINE, SO_WHAT, ROWS, SEVENTEEN, LIMITS,
  assertSourced, assertSeventeenComesOff, assertJudgmentIsLabeled, assertDatedWhereItMoves,
};
