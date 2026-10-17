/**
 * Regenerates `docs/project-lifecycle/pilot-results.md` from LIVE corpus runs.
 *
 *   cd backend
 *   node ../node_modules/ts-node/dist/bin.js --transpile-only \
 *     src/services/lifecycle/pilot/__tests__/generatePilotReport.ts
 *
 * ## Why this lives in `__tests__/` and not in `src/scripts/`
 *
 * It drives the reference fixtures, which are test-tier by design, and `backend/tsconfig.json`
 * excludes `**` + `/__tests__/**` from the program. A generator under `src/scripts/` importing
 * those fixtures would therefore fail `tsc --noEmit` with an unresolved module — so the honest
 * home for a fixture-driven generator is beside the fixtures. It is not a `.test.ts` file, so
 * jest does not collect it.
 *
 * ## It REFUSES to write a report that breaks its own rule
 *
 * `comparisonClaimViolations` runs before the file is opened, and a violation exits non-zero
 * having written nothing. That is not decoration: the first draft of this report was refused by
 * exactly this path, because the sentence explaining the rule put a literal percent sign within
 * the window of the word list it was describing.
 */
import fs from 'fs';
import path from 'path';
import { runCorpusCase } from '../../__tests__/corpus/corpusRunner';
import { CORPUS_STAGES } from '../../__tests__/corpus/corpusStages';
import { fixtureA, fixtureB, fixtureC } from '../../generation/__tests__/fixtures/referenceFixtures';
import { caseOf, fixtureDCase } from '../../__tests__/corpus/corpusCaseFixtures';
import { renderPilotReport, comparisonClaimViolations, type PilotObservation } from '../pilotReport';

/** One clause per fixture, so the report's tables read without the corpus documentation open. */
const SHAPES: Record<string, string> = {
  'A-government': 'government contract, proposal + solution tracks',
  'B-human-heavy': 'human-heavy workflow, below the automation target by design',
  'C-ordinary': 'ordinary AI service application',
  'D-manual-only': 'manual-only workflow, zero automation as a recorded decision',
};

const CASES = [
  ['A-government', caseOf('A-government', 'pilot', fixtureA)],
  ['B-human-heavy', caseOf('B-human-heavy', 'pilot', fixtureB)],
  ['C-ordinary', caseOf('C-ordinary', 'pilot', fixtureC)],
  ['D-manual-only', fixtureDCase()],
] as const;

/**
 * Recovery OUTCOMES, one per replay case from P7-T3, each one a thing that was observed.
 *
 * Deliberately sentences and not a score. A rate over seven hand-built cases would be a
 * statistic about the fixture set presented as a statistic about the system.
 */
const RECOVERY = [
  { case: 'Crash/restart mid-generation', observed: 'the review hold survives in the stored row; a resumed build does not publish' },
  { case: 'Duplicate start', observed: 'one intake row; the database refuses the second, not the application' },
  { case: 'Concurrent revisions', observed: 'the loser retries on a recomputed revision and lands; the bound is three' },
  { case: 'Concurrent approval', observed: 'exactly one approval; the unique index is the backstop, and the compare-and-swap is bypassed under a true race' },
  { case: 'Partial provider failure', observed: 'the draft survives and nothing is published; the stage does not advance' },
  { case: 'Publish / repo-write failure', observed: 'the approved version is not lost; the intake does not reach published and no tasks are written' },
  { case: 'Expired lease', observed: 'a second worker reclaims and completes; the side effect happens once across the handover' },
];

const NOT_MEASURED = [
  {
    dimension: 'Model generation cost',
    why: 'every generation path requires a live model call, so there is no token count to '
      + 'report. No model was invoked, and spending to produce a pilot figure is outside this '
      + 'packet.',
  },
  {
    dimension: 'The existing path on the same inputs',
    why: 'the existing generation path is model-driven for both student and delivery projects, '
      + 'so a same-inputs comparison needs the same live calls. Without it, any comparative '
      + 'claim here would be invented, which is exactly what the check in this report refuses.',
  },
  {
    dimension: 'Story coverage',
    why: 'stories are created at the planning stage, which is database-backed and not driven at '
      + 'this tier. Reported as unmeasured rather than as zero gaps.',
  },
  {
    dimension: 'Approval effort in human terms',
    why: 'the approval gates are among the stages this pilot does not reach, so no human '
      + 'decision was observed. The count of decisions observed is zero.',
  },
];

function observe(): PilotObservation[] {
  return CASES.map(([label, fx]) => {
    const t0 = process.hrtime.bigint();
    const run = runCorpusCase(fx as never);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const m = run.composed?.draft?.measures;
    const t = run.traceability;
    return {
      fixture: label,
      shape: SHAPES[label],
      stagesDriven: run.stagesDriven.length,
      stagesNotReached: run.stagesNotReached.length,
      refusals: (run.composed?.refusals ?? []).length,
      workspaceCount: run.workspaceCount,
      effortBases: run.effortBases.join('+'),
      requirementBlocks: t.requirementBlocks?.length ?? 0,
      covered: t.covered?.length ?? 0,
      uncovered: t.uncovered?.length ?? 0,
      storyCoverageAssessable: t.storyCoverage !== null,
      aiNumeratorMinutes: m ? m.aiShare.numeratorMinutes : 0,
      aiDenominatorMinutes: m ? m.aiShare.denominatorMinutes : 0,
      belowTarget: m ? m.belowTarget : false,
      composeMs: Number(ms.toFixed(1)),
    };
  });
}

/**
 * The report as text, with NO file written.
 *
 * Exported so `pilotReport.test.ts` can assert that the committed document IS what this
 * generator produces. That assertion only became possible once the per-fixture wall times were
 * removed: with them in, two consecutive runs differed and nothing could be compared.
 *
 * `measuredOn` is a parameter rather than read from the clock here, so a caller comparing
 * against a committed file can hold the date steady and compare everything else.
 */
export function buildPilotReport(measuredOn = new Date().toISOString().slice(0, 10)): string {
  return renderPilotReport({
    measuredOn,
    corpusStages: CORPUS_STAGES.length,
    observations: observe(),
    notMeasured: NOT_MEASURED,
    recoveryOutcomes: RECOVERY,
  });
}

function main(): void {
  const text = buildPilotReport();

  const violations = comparisonClaimViolations(text);
  if (violations.length) {
    // eslint-disable-next-line no-console
    console.log(`REFUSING TO WRITE: ${violations.length} comparison claim(s)`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(violations.slice(0, 3), null, 2));
    process.exit(1);
  }

  const out = path.join(
    __dirname, '..', '..', '..', '..', '..', '..', 'docs', 'project-lifecycle', 'pilot-results.md',
  );
  // CRLF, matching the rest of this repository's tracked text.
  fs.writeFileSync(out, text.replace(/\r?\n/g, '\r\n'), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`WROTE ${out} | lines=${text.split('\n').length} | comparison claims=0`);
}

// Only when run directly. Without this the test's import would write the file as a side
// effect of being imported, which is the opposite of what a golden-file assertion is for.
if (require.main === module) main();
