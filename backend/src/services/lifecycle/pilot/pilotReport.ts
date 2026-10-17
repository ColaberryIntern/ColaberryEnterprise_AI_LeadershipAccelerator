/**
 * P7-T5 — the controlled pilot's report, and the NAMED CHECK that guards what it may claim.
 *
 * ## Why a check exists at all
 *
 * `plan-phase7.md` §3.4 is explicit that this is not prose discipline:
 *
 * > *"Cycle 1 relied on discipline. T5 now ships an assertion over the generated report that
 * > fails on any `%` within 40 characters of a comparison word (`better`, `faster`, `improve`,
 * > `reduce`, `versus`, `vs`), with a positive control proving the check fires."*
 *
 * The underlying rule comes from the request itself: report the pilot **with no fabricated
 * improvement percentage**. The failure mode is specific and easy to commit by accident -- a
 * sentence like "the lifecycle path reduced approval effort by 40%" reads as a measurement and
 * is, in fact, two numbers divided by each other with no denominator, no baseline run, and no
 * date. A percentage sitting next to a comparison word is the shape that claim always takes, so
 * that shape is what gets refused.
 *
 * ## What the check does NOT do, so nobody mistakes it for more
 *
 * It is a TEXT check. It cannot tell a true comparison from a false one, and it does not try:
 * a legitimately measured comparison would also be refused, and the right response to that is a
 * sentence with both absolute numbers and their denominators, which is better writing anyway.
 *
 * **Three known bypasses, measured rather than guessed**, because a tripwire whose gaps are
 * undocumented gets mistaken for a proof:
 *
 *  1. **The six words only.** `a 40% reduction` and `reducing by 40%` both pass, as do `cut`,
 *     `fewer`, `less`, `more`, `saving`, `outperform`, `gain` and `half`.
 *  2. **The spelled-out percentage.** `faster by 40 percent` sails through, because the check
 *     looks for the SIGN. The report you are reading uses exactly that construction to describe
 *     the rule without tripping it, so the document demonstrates its own bypass.
 *  3. **Distance.** The whole matched word must fit inside the window, so the effective trailing
 *     reach is `COMPARISON_WINDOW - len(word) + 1` -- about 34 characters for `improve`. A claim
 *     that puts the number further away than that is not caught.
 *
 * None of these is a defect against §3.4, which specifies the sign and names six words. They are
 * the limits of what a text tripwire can be, written down so nobody reads a pass as a proof.
 *
 * **Provenance, kept here rather than in the published report:** the first generated draft of
 * `pilot-results.md` was refused by this function before the file was opened, because the
 * sentence explaining the rule put a literal sign inside the window of the word list it was
 * describing. That draft was never committed, so a reader cannot check the claim -- which is
 * exactly why it belongs in the source and not in the document.
 */

/** The comparison words §3.4 names. Matched as PREFIXES, so "improved" and "improvement" count. */
export const COMPARISON_WORDS: ReadonlyArray<string> = [
  'better', 'faster', 'improve', 'reduce', 'versus', 'vs',
];

/** Characters either side of a `%` that the check looks in. §3.4 fixes this at 40. */
export const COMPARISON_WINDOW = 40;

export interface ComparisonClaim {
  /** Index of the offending `%`. */
  index: number;
  /** The comparison word found near it. */
  word: string;
  /** The window, so a reader can see the sentence without opening the file. */
  excerpt: string;
}

/**
 * Every `%` that sits within `COMPARISON_WINDOW` characters of a comparison word.
 *
 * Exported from production rather than written inside a test, so the same function that guards
 * the report is the one a future report generator can call before writing anything.
 */
export function comparisonClaimViolations(text: string): ComparisonClaim[] {
  const out: ComparisonClaim[] = [];
  // A word boundary before the stem, so `vs` does not match inside `versus`'s neighbours or a
  // word like "savs"; no boundary after, so `improved` and `improvement` are caught.
  const pattern = new RegExp(`\\b(${COMPARISON_WORDS.join('|')})`, 'i');

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '%') continue;
    const from = Math.max(0, i - COMPARISON_WINDOW);
    const to = Math.min(text.length, i + COMPARISON_WINDOW + 1);
    const window = text.slice(from, to);
    const m = pattern.exec(window);
    if (m) {
      out.push({ index: i, word: m[1].toLowerCase(), excerpt: window.replace(/\s+/g, ' ').trim() });
    }
  }
  return out;
}

/** One fixture's observed numbers. Every field is measured; absences are their own type below. */
export interface PilotObservation {
  fixture: string;
  /** What the fixture is, in one clause, so the table is readable without the corpus docs. */
  shape: string;
  stagesDriven: number;
  stagesNotReached: number;
  refusals: number;
  workspaceCount: number;
  effortBases: string;
  requirementBlocks: number;
  covered: number;
  uncovered: number;
  /** False for every fixture today: stories do not exist until a DB-backed stage. */
  storyCoverageAssessable: boolean;
  aiNumeratorMinutes: number;
  aiDenominatorMinutes: number;
  belowTarget: boolean;
  composeMs: number;
}

/** Something the pilot could not measure, with the reason it could not. */
export interface NotMeasured {
  dimension: string;
  why: string;
}

export interface PilotInputs {
  measuredOn: string;
  /** Total stages in the corpus ladder -- the denominator for `stagesDriven`. */
  corpusStages: number;
  observations: ReadonlyArray<PilotObservation>;
  notMeasured: ReadonlyArray<NotMeasured>;
  /** Recovery OUTCOMES, never a rate. See the renderer's note. */
  recoveryOutcomes: ReadonlyArray<{ case: string; observed: string }>;
}

/**
 * Render the report.
 *
 * Every number is printed WITH ITS DENOMINATOR and the document carries the measurement date,
 * which is the acceptance criterion. Recovery is a list of outcomes observed, never a
 * reliability rate -- a rate over seven hand-built cases would be a statistic about the fixture
 * set, dressed as a statistic about the system.
 */
export function renderPilotReport(input: PilotInputs): string {
  const { measuredOn, corpusStages, observations, notMeasured, recoveryOutcomes } = input;
  const L: string[] = [];

  L.push('# Project lifecycle pilot results');
  L.push('');
  L.push(`**Measured on ${measuredOn}.** Every figure below carries its denominator. Figures`);
  L.push('without one are not in this document; dimensions that could not be measured are listed');
  L.push('as unmeasured with the reason, rather than estimated.');
  L.push('');
  // THE PERCENT SIGN IS SPELLED OUT, NOT PRINTED, and that is not fastidiousness: the first
  // generated draft of this report was REFUSED by its own check, because this very sentence
  // put a literal percent sign within the window of the word list it was describing. The check
  // caught the first document it ever saw. Fixing the prose was the right response; widening
  // the check to permit its own explanation would have been the wrong one.
  L.push('**There are no comparison percentages in this report, and that is enforced rather');
  L.push('than intended:** `comparisonClaimViolations` fails a test on any percent sign within');
  L.push(`${COMPARISON_WINDOW} characters of a comparison word. The words it knows are listed in`);
  L.push('`COMPARISON_WORDS`. The check has its own positive control, so it is known to be');
  L.push('capable of failing, and its known bypasses are documented in that module rather than');
  L.push('left for a reader to discover.');
  L.push('');

  L.push('## 1. Completeness');
  L.push('');
  L.push('Requirement blocks covered by a derived enumeration, per fixture. Not a share: the');
  L.push('covered count and the total are both printed.');
  L.push('');
  L.push('| Fixture | Shape | Blocks covered | Blocks total | Uncovered |');
  L.push('|---|---|---|---|---|');
  for (const o of observations) {
    L.push(`| ${o.fixture} | ${o.shape} | ${o.covered} | ${o.requirementBlocks} | ${o.uncovered} |`);
  }
  L.push('');
  L.push('Story coverage is **not assessable at this tier** for any fixture: stories do not exist');
  L.push('until the planning stage, which is database-backed and not driven by this pilot. It is');
  L.push('reported as unmeasured rather than as zero gaps, because an empty gap list would read as');
  L.push('"measured, nothing missing" for data nobody measured.');
  L.push('');

  L.push('## 2. Page consolidation');
  L.push('');
  L.push('Workspace states each composed blueprint resolves to, per fixture.');
  L.push('');
  L.push('| Fixture | Consolidated workspaces |');
  L.push('|---|---|');
  for (const o of observations) L.push(`| ${o.fixture} | ${o.workspaceCount} |`);
  L.push('');
  L.push('No comparison against the existing path is reported, because measuring it needs the same');
  L.push('live model calls named in section 4.');
  L.push('');

  L.push('## 3. Approval effort');
  L.push('');
  // DERIVED, not asserted over the cohort. An earlier version rendered this sentence from
  // `observations[0]` and section 4's below-target claim was hardcoded, so a heterogeneous
  // cohort would have produced a document that contradicted its own table -- invisible to the
  // golden-file test, which would rebuild the same wrong sentence, and to the comparison check.
  const driven = [...new Set(observations.map((o) => o.stagesDriven))].sort((a, b) => a - b);
  const notReached = [...new Set(observations.map((o) => o.stagesNotReached))].sort((a, b) => a - b);
  const uniform = driven.length === 1 && notReached.length === 1;
  L.push(uniform
    ? `Of ${corpusStages} stages in the corpus ladder, every one of the ${observations.length} `
      + `fixtures drove ${driven[0]} and did not reach ${notReached[0]}.`
    : `Of ${corpusStages} stages in the corpus ladder, the ${observations.length} fixtures drove `
      + `between ${driven[0]} and ${driven[driven.length - 1]}, and did not reach between `
      + `${notReached[0]} and ${notReached[notReached.length - 1]}.`);
  L.push('');
  L.push('The stages not reached are the database-backed ones, and **two of those five are the');
  L.push('approval gates themselves** (`awaiting_blueprint_approval` and `blueprint_approved`).');
  L.push('So **the number of human approval decisions this pilot observed is zero** — not a small');
  L.push('number, zero — and that is a consequence of which stages a generation-tier pilot can');
  L.push('reach, rather than a claim about how much approval effort the system needs.');
  L.push('');
  L.push('| Fixture | Stages driven | Stages not reached | Refusals |');
  L.push('|---|---|---|---|');
  for (const o of observations) {
    L.push(`| ${o.fixture} | ${o.stagesDriven} of ${corpusStages} | ${o.stagesNotReached} | ${o.refusals} |`);
  }
  L.push('');

  L.push('## 4. Generation time and cost');
  L.push('');
  L.push('| Fixture | Effort bases | AI minutes | Total minutes | Below target |');
  L.push('|---|---|---|---|---|');
  for (const o of observations) {
    L.push(`| ${o.fixture} | ${o.effortBases} | ${o.aiNumeratorMinutes} `
      + `| ${o.aiDenominatorMinutes} | ${o.belowTarget ? 'yes' : 'no'} |`);
  }
  L.push('');
  L.push('**Compose wall time is NOT published here, and the reason is the point.** It was');
  L.push('observed in the single-digit-millisecond range, dominated by module load on whichever');
  L.push('fixture runs first: the same fixture was observed at three different values across three');
  L.push('consecutive runs, while later fixtures sat near the bottom of the range. A per-fixture');
  L.push('millisecond would therefore be unreproducible AND would invite exactly the cost');
  L.push('comparison this section cannot support. It is recorded as an observation in the session');
  L.push('log and left out of the published tables.');
  L.push('');
  L.push('AI minutes are printed as a numerator and a denominator, never divided.');
  const below = observations.filter((o) => o.belowTarget).length;
  // Counted, with its denominator, rather than asserted over the cohort.
  L.push(`${below} of the ${observations.length} fixtures are below the automation target, which`);
  L.push('is a recorded decision for the manual-only and human-heavy shapes rather than a');
  L.push('shortfall.');
  L.push('');

  L.push('## 5. Failure recovery');
  L.push('');
  L.push('**Outcomes observed, not a reliability rate.** A rate over a hand-built case set would be');
  L.push('a statistic about the fixtures dressed as a statistic about the system.');
  L.push('');
  L.push('| Replay case | Observed |');
  L.push('|---|---|');
  for (const r of recoveryOutcomes) L.push(`| ${r.case} | ${r.observed} |`);
  L.push('');

  L.push('## What this pilot could not measure');
  L.push('');
  for (const n of notMeasured) L.push(`- **${n.dimension}** — ${n.why}`);
  L.push('');

  return L.join('\n');
}
