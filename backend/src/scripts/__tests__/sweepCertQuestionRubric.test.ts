import { latestPerKey, improveUntilMeets } from '../sweepCertQuestionRubric';
import { ImproverItem } from '../../services/certPrep/certQuestionImprover';

/**
 * The sweep's own decisions, tested without a database or a model call.
 *
 * `improveUntilMeets` is the loop that decides how many times to try and when to
 * give up. Getting that wrong is expensive in a way a unit test is cheap: a loop
 * that does not stop spends real money against a rate-limited provider, and one
 * that stops too early leaves the bank short and reports success.
 */

jest.mock('../../services/certPrep/certQuestionImprover', () => {
  const actual = jest.requireActual('../../services/certPrep/certQuestionImprover');
  return { ...actual, improveItem: jest.fn() };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { improveItem } = require('../../services/certPrep/certQuestionImprover');

const mockImprove = improveItem as jest.Mock;

/** A deliberately poor item: definitional stem, label options. Scores low. */
const poor = (): ImproverItem => ({
  question_key: 'A1',
  domain_id: 'D1',
  objective_id: 'D1.2',
  stem: 'An agent loop runs until the model stops requesting tools.',
  options: [
    { key: 'A', text: 'Isolation' }, { key: 'B', text: 'Parallelism' },
    { key: 'C', text: 'Cost' }, { key: 'D', text: 'Latency' },
  ],
  correct_keys: ['A'],
  rationale: 'Isolation.',
  distractor_rationales: { B: 'no', C: 'no', D: 'no' },
});

/** A well-formed item that meets every dimension. */
const good = (): ImproverItem => ({
  question_key: 'A1',
  domain_id: 'D1',
  objective_id: 'D1.2',
  stem: 'A research system runs each researcher as a subagent rather than as a loop inside the '
    + 'orchestrator. Monitoring shows the orchestrator context stays roughly flat as researchers '
    + 'are added, where the earlier design grew until it truncated. What is the primary reason?',
  options: [
    { key: 'A', text: 'Each researcher spends its own context on raw retrieved text and returns only a condensed finding' },
    { key: 'B', text: 'Subagents run concurrently, so the total wall-clock time of the research phase falls sharply' },
    { key: 'C', text: 'Subagents can be retried individually, so one failure does not require re-running the whole phase' },
    { key: 'D', text: 'Each subagent can be given a different model, so cheaper models handle the simpler searches' },
  ],
  correct_keys: ['A'],
  rationale: 'The isolation is the point. The researcher spends its own context on raw retrieved '
    + 'text and returns a condensed finding, so the orchestrator only ever sees the summary.',
  distractor_rationales: {
    B: 'A real benefit of fan-out and unrelated to the flat context.',
    C: 'True of any isolated unit of work.',
    D: 'Possible and not what the observation shows.',
  },
});

const row = (over: any = {}): any => ({ question_key: 'A1', revision: 1, ...over });

describe('latestPerKey', () => {
  it('takes the highest revision, whatever order the database returned', () => {
    const out = latestPerKey([row({ revision: 2 }), row({ revision: 1 }), row({ revision: 3 })]);
    expect(out).toHaveLength(1);
    expect(out[0].revision).toBe(3);
  });

  it('keeps keys separate and returns them in a stable order', () => {
    // Stable ordering matters: --limit 3 must mean the same three every run, or
    // a resumed sweep silently processes a different slice than the one before.
    const out = latestPerKey([row({ question_key: 'B1' }), row({ question_key: 'A1' })]);
    expect(out.map((r) => r.question_key)).toEqual(['A1', 'B1']);
  });
});

describe('improveUntilMeets — when to try again and when to stop', () => {
  beforeEach(() => mockImprove.mockReset());

  it('stops the moment the item meets every dimension', async () => {
    mockImprove.mockResolvedValueOnce({
      status: 'improved', item: good(), before: { met: 2, of: 6 }, after: { met: 6, of: 6 },
    });
    const out = await improveUntilMeets(poor(), 3);
    expect(out.after).toBe(6);
    expect(out.rounds).toBe(1);
    // The guard that matters for cost: no further calls once it meets.
    expect(mockImprove).toHaveBeenCalledTimes(1);
  });

  it('gives up on the first stall rather than re-sending an identical request', async () => {
    // Retrying the same prompt against the same input is a loop that cannot
    // converge. It spends money to produce the same answer.
    mockImprove.mockResolvedValue({ status: 'no_better', before: { met: 2, of: 6 }, after: { met: 2, of: 6 } });
    const out = await improveUntilMeets(poor(), 3);
    expect(mockImprove).toHaveBeenCalledTimes(1);
    expect(out.stalledReason).toBe('no_better');
  });

  it('reports a refused candidate as a stall, not as a success', async () => {
    mockImprove.mockResolvedValue({
      status: 'invariant_violated', before: { met: 2, of: 6 }, reason: 'correct count changed: 1 -> 2',
    });
    const out = await improveUntilMeets(poor(), 3);
    expect(out.stalledReason).toBe('invariant_violated');
    expect(out.after).toBeLessThan(6);
  });

  it('surfaces the error class when the provider fails', async () => {
    mockImprove.mockResolvedValue({
      status: 'failed', before: { met: 2, of: 6 }, error_class: 'RateLimitError', message: 'slow down',
    });
    const out = await improveUntilMeets(poor(), 3);
    expect(out.stalledReason).toMatch(/RateLimitError/);
  });

  it('never exceeds the round cap even when every round improves a little', async () => {
    // The runaway case. Without the cap this bills until it happens to reach 6/6.
    mockImprove.mockResolvedValue({
      status: 'improved', item: poor(), before: { met: 2, of: 6 }, after: { met: 3, of: 6 },
    });
    await improveUntilMeets(poor(), 3);
    expect(mockImprove).toHaveBeenCalledTimes(3);
  });

  it('does not call the model at all for an item that already meets', async () => {
    const out = await improveUntilMeets(good(), 3);
    expect(mockImprove).not.toHaveBeenCalled();
    expect(out.after).toBe(6);
    expect(out.rounds).toBe(0);
  });
});

/**
 * Every column the sweep selects must actually exist, checked against the schema.
 *
 * WHY THIS TEST EXISTS. The first live run of this script died on
 * `column "track_id" does not exist` — it selected `track_id` and
 * `scenario_family` from `cert_question_revisions`, where they have never lived.
 * Nothing caught it: `tsc` cannot see inside a SQL string, the unit tests mocked
 * the query away, and CI has no database. It took a deploy and a production run.
 *
 * So the columns are checked against the CREATE TABLE statements in
 * `ensureCertPrepSchema.ts`, which is the file the database is actually built
 * from. This catches the whole class before deploy rather than this one instance.
 */
describe('BANK_QUERY columns exist in the schema', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fsMod = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pathMod = require('path');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { BANK_QUERY } = require('../sweepCertQuestionRubric');

  const schema: string = fsMod.readFileSync(
    pathMod.join(__dirname, '..', '..', 'db', 'ensureCertPrepSchema.ts'), 'utf8',
  );

  /**
   * Column names declared in one CREATE TABLE block.
   *
   * Scanned line by line rather than matched with a multiline regex. The regex
   * version silently found nothing — the file has CRLF endings and the column
   * lines contain their own parentheses (`VARCHAR(60)`, `gen_random_uuid()`),
   * both of which a `\(...\)` pattern has to be written very carefully to
   * survive. A line scan has neither problem and is readable.
   */
  const columnsOf = (table: string): Set<string> => {
    const lines = schema.split('\n').map((l) => l.replace(/\r$/, ''));
    const start = lines.findIndex((l) => l.includes(`CREATE TABLE IF NOT EXISTS ${table} (`));
    if (start < 0) throw new Error(`no CREATE TABLE found for ${table}`);
    const cols = new Set<string>();
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (line.startsWith(')')) break;
      const c = line.match(/^([a-z_]+)\s+[A-Z]/);
      if (c) cols.add(c[1]);
    }
    return cols;
  };

  const revisionCols = columnsOf('cert_question_revisions');
  const questionCols = columnsOf('cert_questions');

  it('found real column lists to check against', () => {
    // Guards the guard: a regex that matched nothing would make every assertion
    // below vacuous, which is the failure mode of a test that parses source.
    expect(revisionCols.size).toBeGreaterThan(10);
    expect(questionCols.size).toBeGreaterThan(5);
    expect(questionCols.has('track_id')).toBe(true);
    expect(revisionCols.has('track_id')).toBe(false);
  });

  it('every r.<column> exists on cert_question_revisions', () => {
    const referenced = [...String(BANK_QUERY).matchAll(/\br\.([a-z_]+)/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(5);
    expect(referenced.filter((c) => !revisionCols.has(c))).toEqual([]);
  });

  it('every q.<column> exists on cert_questions', () => {
    const referenced = [...String(BANK_QUERY).matchAll(/\bq\.([a-z_]+)/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(2);
    expect(referenced.filter((c) => !questionCols.has(c))).toEqual([]);
  });
});

/**
 * The summary line must not claim more than the run achieved.
 *
 * After the ceiling change it read `RESULT: 150/150 at 6/6` while 21 questions
 * were at 5/6 — correctly capped, but not sixes. It counted every skipped item
 * as perfect. A run that reports better than reality is worse than one that
 * reports nothing, because it ends the investigation.
 *
 * Asserted on the source rather than by running main(), which needs a database:
 * what matters is that the two counts stay distinct and the label on each is the
 * one it actually measures.
 */
describe('the result summary distinguishes perfect from capped', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const src: string = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'sweepCertQuestionRubric.ts'), 'utf8',
  );

  it('counts sixes strictly, without folding in skipped items', () => {
    expect(src).toMatch(/const perfect = outcomes\.filter\(\(o\) => o\.after === 6\)/);
  });

  it('labels the ceiling count as a ceiling, not as 6/6', () => {
    expect(src).toMatch(/RESULT: \$\{atCeiling\}\/\$\{outcomes\.length\} at their ceiling/);
    expect(src).not.toMatch(/RESULT: \$\{meets\}\/\$\{outcomes\.length\} at 6\/6/);
  });

  it('says out loud when items are capped below six', () => {
    expect(src).toMatch(/capped below six by a dimension no rewrite can change/);
  });
});
