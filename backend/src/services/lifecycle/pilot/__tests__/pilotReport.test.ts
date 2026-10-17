/**
 * P7-T5 — the pilot report, and the §3.4 check that governs what it may claim.
 *
 * ## The check already caught something, which is better evidence than a control
 *
 * The FIRST generated draft of `pilot-results.md` was **refused by its own check**: the sentence
 * explaining the rule put a literal percent sign within the window of the word list it was
 * describing. The generator exited non-zero and wrote nothing. The prose was fixed; the check was
 * not widened to permit its own explanation. A positive control still ships below, because a
 * check that happened to fire once is not the same as a check known to be capable of firing on
 * demand — but the live catch is the stronger fact and it is recorded here rather than in a
 * commit message nobody re-reads.
 *
 * ## The committed document is what gets guarded, not a string built in this file
 *
 * `docs/project-lifecycle/pilot-results.md` is read from disk. A test that re-rendered the report
 * and then checked its own output would pass while the committed artifact said anything at all.
 * The numbers are additionally re-derived from LIVE corpus runs and asserted against the
 * document, so the artifact cannot drift from the code that produced it.
 */
import fs from 'fs';
import path from 'path';
import {
  comparisonClaimViolations, COMPARISON_WORDS, COMPARISON_WINDOW,
} from '../pilotReport';
import { runCorpusCase } from '../../__tests__/corpus/corpusRunner';
import { CORPUS_STAGES } from '../../__tests__/corpus/corpusStages';
import { fixtureA, fixtureB, fixtureC } from '../../generation/__tests__/fixtures/referenceFixtures';
import { caseOf, fixtureDCase } from '../../__tests__/corpus/corpusCaseFixtures';

const REPORT = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'docs', 'project-lifecycle', 'pilot-results.md');

describe('§3.4 — the no-comparison-percentage check', () => {
  const text = fs.readFileSync(REPORT, 'utf8');

  it('the COMMITTED report contains no comparison percentage', () => {
    const found = comparisonClaimViolations(text);
    // Printed, so a failure names the sentence rather than only the count.
    if (found.length) {
      // eslint-disable-next-line no-console
      console.log('[pilot] comparison claims: ' + JSON.stringify(found, null, 2));
    }
    expect(found).toEqual([]);
  });

  it('POSITIVE CONTROL: the check FIRES on the sentence it exists to refuse', () => {
    // Without this the assertion above would be satisfied by a function that returns [] always.
    const bad = 'The lifecycle path reduced approval effort by 40% across the pilot.';
    const found = comparisonClaimViolations(bad);

    expect(found).toHaveLength(1);
    expect(found[0].word).toBe('reduce');
    expect(found[0].excerpt).toContain('40%');
  });

  it.each(COMPARISON_WORDS as string[])('fires for the word %s', (word) => {
    // Every listed word, so the set cannot quietly shrink to one that happens to be tested.
    expect(comparisonClaimViolations(`a sentence that is ${word} by 12%`)).toHaveLength(1);
  });

  it('respects the 40-character window in BOTH directions, and does not fire beyond it', () => {
    // The boundary, asserted rather than assumed. `%` then filler then the word.
    const inside = `12% ${'x'.repeat(COMPARISON_WINDOW - 10)} faster`;
    const outside = `12% ${'x'.repeat(COMPARISON_WINDOW + 20)} faster`;
    expect(comparisonClaimViolations(inside)).toHaveLength(1);
    expect(comparisonClaimViolations(outside)).toEqual([]);

    // And the other direction: the word BEFORE the percent sign.
    expect(comparisonClaimViolations('faster, by 12%')).toHaveLength(1);
  });

  it('catches inflected forms, because `improved` is the same claim as `improve`', () => {
    expect(comparisonClaimViolations('improved by 30%')).toHaveLength(1);
    expect(comparisonClaimViolations('a 30% improvement')).toHaveLength(1);
    // And does not fire on an unrelated word that merely contains a stem.
    expect(comparisonClaimViolations('irreducible 30% share')).toEqual([]);
  });

  it('a percentage with NO comparison word nearby is permitted', () => {
    // The check must not ban percentages outright -- a denominator-carrying figure is fine.
    expect(comparisonClaimViolations('coverage was 2 of 2 blocks, which is 100% of them'))
      .toEqual([]);
  });
});

describe('the report carries its denominators, its date, and no reliability rate', () => {
  const text = fs.readFileSync(REPORT, 'utf8');

  it('states the measurement DATE, which the acceptance requires', () => {
    expect(text).toMatch(/\*\*Measured on \d{4}-\d{2}-\d{2}\.\*\*/);
  });

  it('reports recovery as OUTCOMES, never as a rate', () => {
    expect(text).toContain('Outcomes observed, not a reliability rate');
    // The shapes a rate would take, asserted absent.
    expect(text).not.toMatch(/\b\d+(\.\d+)?%\s*(reliab|success|recovery)/i);
    expect(text).not.toMatch(/\b\d+\s*of\s*7\s*(recovered|succeeded)/i);
  });

  it('names what it could NOT measure, rather than omitting those dimensions', () => {
    expect(text).toContain('What this pilot could not measure');
    for (const dimension of ['Model generation cost', 'Story coverage']) {
      expect(text).toContain(dimension);
    }
  });

  it('does NOT publish a per-fixture wall time, and says why', () => {
    // The timings were removed after two consecutive generator runs disagreed: an exact
    // per-fixture millisecond is unreproducible AND invites the cost comparison this section
    // cannot support. What remains is the observation and the reason.
    expect(text).toContain('Compose wall time is NOT published here');
    expect(text).toContain('dominated by module load');
    // No bare millisecond figures in the document.
    expect(text).not.toMatch(/\d+\.\d+ ms/);
  });
});

describe('the committed report matches a LIVE corpus run', () => {
  /**
   * This is what stops the document drifting from the code. The numbers are re-derived here and
   * asserted against the committed text, so editing the fixtures or the generation path without
   * regenerating the report fails this test.
   *
   * `composeMs` is deliberately NOT compared: it is wall-clock and varies run to run, which is
   * the very reason the report says it is not a cost comparison.
   */
  const text = fs.readFileSync(REPORT, 'utf8');
  const cases: Array<[string, unknown]> = [
    ['A-government', caseOf('A-government', 'pilot', fixtureA)],
    ['B-human-heavy', caseOf('B-human-heavy', 'pilot', fixtureB)],
    ['C-ordinary', caseOf('C-ordinary', 'pilot', fixtureC)],
    ['D-manual-only', fixtureDCase()],
  ];

  it.each(cases)('%s: the completeness row matches the live run', (label, fx) => {
    const run = runCorpusCase(fx as never);
    const t = run.traceability;
    const row = `| ${label} |`;
    expect(text).toContain(row);
    // The covered/total pair as the report prints it, so a changed fixture fails here.
    expect(text).toContain(`| ${t.covered?.length ?? 0} | ${t.requirementBlocks?.length ?? 0} | ${t.uncovered?.length ?? 0} |`);
  });

  it.each(cases)('%s: the stage counts match the live run and the real denominator', (label, fx) => {
    const run = runCorpusCase(fx as never);
    expect(text).toContain(`| ${run.stagesDriven.length} of ${CORPUS_STAGES.length} | ${run.stagesNotReached.length} | ${(run.composed?.refusals ?? []).length} |`);
  });

  it.each(cases)('%s: the AI minutes are printed as numerator AND denominator, never divided', (label, fx) => {
    const run = runCorpusCase(fx as never);
    const m = run.composed?.draft?.measures;
    expect(m).toBeTruthy();
    expect(text).toContain(`| ${m!.aiShare.numeratorMinutes} | ${m!.aiShare.denominatorMinutes} |`);
  });

  it('IS what the generator produces — the committed artifact cannot drift', async () => {
    /**
     * The strongest guard in this file, and the one the other assertions in this block become
     * redundant against: render the report from live runs and compare it to the committed
     * document in full.
     *
     * Only the date line is excluded, because it moves with the calendar. Everything else must
     * match byte for byte, which is possible only because the unreproducible per-fixture wall
     * times were removed.
     */
    const { buildPilotReport } = await import('../__tests__/generatePilotReport');
    const dateLine = /\*\*Measured on \d{4}-\d{2}-\d{2}\.\*\*/;
    const committedDate = dateLine.exec(text);
    expect(committedDate).toBeTruthy();

    const rebuilt = buildPilotReport(committedDate![0].slice('**Measured on '.length, -3));
    const norm = (s: string) => s.replace(/\r\n/g, '\n').trimEnd();

    expect(norm(rebuilt)).toBe(norm(text));
  });

  it('uses the CORPUS stage count as the denominator, not the lifecycle stage count', () => {
    // A measurement error caught while building this: an early probe divided generation stage
    // names by `LIFECYCLE_STAGES.length` (13) and printed "10 of 13" -- two different
    // vocabularies, so the ratio meant nothing. The real denominator is the corpus ladder.
    expect(CORPUS_STAGES.length).toBe(15);
    expect(text).toContain(`of ${CORPUS_STAGES.length}`);
    expect(text).not.toContain('10 of 13');
  });
});
