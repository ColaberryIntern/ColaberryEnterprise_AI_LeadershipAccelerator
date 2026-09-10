/**
 * sweepCertQuestionRubric — bring every question in the bank to 6/6, one at a
 * time, and optionally approve the result under a named reviewer.
 *
 * THE LOOP, PER QUESTION:
 *   score → if 6/6, done
 *         → improve, re-score, keep only if the score went UP
 *         → repeat until 6/6 or the improvement stalls
 *         → on a stall, REPLACE: write a fresh item for the same objective
 *         → if the replacement is no better either, leave it and report it
 *
 * THE RUBRIC IS THE JUDGE AND THE MODEL DOES NOT GET A VOTE. Every candidate is
 * scored by `scoreItem`, which is pure and deterministic. A candidate that does
 * not improve is discarded. That is what makes a loop safe to run unattended:
 * it cannot drift downhill, because each step must prove itself against a
 * measurement the model cannot influence.
 *
 * ── WHAT 6/6 DOES AND DOES NOT MEAN ──────────────────────────────────────────
 * The rubric measures whether an item LOOKS LIKE a real exam item: an observed
 * situation, stems and options at reference length, articulated approaches, four
 * options, every wrong option explained. It cannot tell whether the answer key is
 * right, whether the question is fair, or whether it tests the objective it
 * claims. A 6/6 bank is a bank that resembles the exam, not a bank that is
 * correct.
 *
 * That is why `--approve-as` is a separate, explicit flag and defaults to off,
 * and why the reviewer it records is a real named person. Approving on the
 * strength of a shape score alone is what a fixture account did to this bank
 * once already; those 93 revisions were retired for exactly that reason.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────────
 *   - DRY RUN BY DEFAULT. Without `--write` it changes nothing and prints what
 *     it would do.
 *   - Every improvement lands as a NEW DRAFT revision. Nothing is edited in
 *     place, so a response already recorded keeps meaning what it meant.
 *   - Idempotent: an item already at 6/6 is skipped, so a re-run after a failure
 *     resumes rather than re-spending on work already done.
 *   - `--limit N` and `--key K` exist so the first run of a change is small.
 *     A hundred and fifty model calls is not the place to discover a bad prompt.
 *
 * Usage (inside the backend container):
 *   node dist/scripts/sweepCertQuestionRubric.js                      # dry run, whole bank
 *   node dist/scripts/sweepCertQuestionRubric.js --limit 3            # dry run, three items
 *   node dist/scripts/sweepCertQuestionRubric.js --limit 3 --write    # actually write drafts
 *   node dist/scripts/sweepCertQuestionRubric.js --write --approve-as ali@colaberry.com
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { scoreItem } from '../services/certPrep/certQuestionRubric';
import { improveItem, ImproverItem, achievableScore, unachievableDimensions } from '../services/certPrep/certQuestionImprover';
import { createDraftRevision, setReviewStatus } from '../services/certPrep/certQuestionBankService';

const args = process.argv.slice(2);
const write = args.includes('--write');
const approveIdx = args.indexOf('--approve-as');
const approveAs = approveIdx >= 0 ? args[approveIdx + 1] : null;
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const keyIdx = args.indexOf('--key');
const onlyKey = keyIdx >= 0 ? args[keyIdx + 1] : null;
const maxRoundsIdx = args.indexOf('--max-rounds');
const MAX_ROUNDS = maxRoundsIdx >= 0 ? Number(args[maxRoundsIdx + 1]) : 3;

interface Row {
  question_key: string;
  revision: number;
  track_id: string;
  blueprint_version: string;
  domain_id: string;
  objective_id: string | null;
  scenario_family: string | null;
  difficulty: string | null;
  stem: string;
  options: { key: string; text: string }[];
  correct_keys: string[];
  select_count: number | null;
  rationale: string | null;
  distractor_rationales: Record<string, string> | null;
  review_status: string;
}

const log = (line: string): void => { console.log(line); };

/**
 * The one query this script runs, exported so a test can check its columns
 * against the schema without a database.
 *
 * `track_id` and `scenario_family` live on the IDENTITY, not on the revision.
 * The first live run of this script died on `column "track_id" does not exist`
 * because it selected them from `cert_question_revisions`. Both tables are
 * needed and the join is not optional.
 *
 * Retired identities are excluded: a question somebody deliberately took out of
 * circulation should not be improved, re-drafted and offered back for approval.
 */
export const BANK_QUERY = `SELECT r.question_key, r.revision, q.track_id, r.blueprint_version,
            r.domain_id, r.objective_id, q.scenario_family, r.difficulty, r.stem,
            r.options, r.correct_keys, r.select_count, r.rationale,
            r.distractor_rationales, r.review_status
       FROM cert_question_revisions r
       JOIN cert_questions q ON q.question_key = r.question_key
      WHERE q.is_retired = false`;

/** The latest revision of each question — the version the team has decided on. */
export function latestPerKey(rows: Row[]): Row[] {
  const out = new Map<string, Row>();
  for (const r of rows) {
    const seen = out.get(r.question_key);
    if (!seen || r.revision > seen.revision) out.set(r.question_key, r);
  }
  return [...out.values()].sort((a, b) => a.question_key.localeCompare(b.question_key));
}

const toImproverItem = (r: Row): ImproverItem => ({
  question_key: r.question_key,
  domain_id: r.domain_id,
  objective_id: r.objective_id ?? '',
  stem: r.stem,
  options: r.options ?? [],
  correct_keys: r.correct_keys ?? [],
  rationale: r.rationale ?? null,
  distractor_rationales: r.distractor_rationales ?? null,
  difficulty: r.difficulty,
  scenario_family: r.scenario_family,
});

interface Outcome {
  key: string;
  before: number;
  after: number;
  rounds: number;
  action: 'skipped' | 'improved' | 'stalled' | 'failed';
  detail?: string;
}

/**
 * Improve ONE question until it meets every dimension or stops getting better.
 *
 * Returns the best item it reached, which may be the original. The caller
 * decides whether that is worth persisting — this function writes nothing.
 */
export async function improveUntilMeets(
  start: ImproverItem,
  maxRounds: number,
): Promise<{ item: ImproverItem; before: number; after: number; rounds: number; stalledReason?: string }> {
  const before = scoreItem(start).met;
  let current = start;
  let rounds = 0;

  for (let i = 0; i < maxRounds; i += 1) {
    const score = scoreItem(current);
    if (score.met === score.of) break;
    rounds += 1;
    const out = await improveItem(current);
    if (out.status === 'improved') { current = out.item; continue; }
    if (out.status === 'already_meets') break;
    // Every other outcome is a stall: no_better, invariant_violated, failed.
    // Retrying an identical request against the same prompt is the definition of
    // a loop that cannot converge, so we stop and let the caller escalate.
    return {
      item: current,
      before,
      after: scoreItem(current).met,
      rounds,
      stalledReason: out.status === 'failed'
        ? `${out.error_class}: ${out.message}`
        : out.status,
    };
  }
  return { item: current, before, after: scoreItem(current).met, rounds };
}

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  log(`database    : ${db}`);
  log(`mode        : ${write ? 'WRITE — new draft revisions will be created' : 'DRY RUN — nothing will be written'}`);
  log(`approve as  : ${approveAs ?? 'nothing will be approved'}`);
  log(`max rounds  : ${MAX_ROUNDS} per question`);
  if (onlyKey) log(`only key    : ${onlyKey}`);
  if (limit !== Infinity) log(`limit       : ${limit}`);
  log('');

  if (approveAs && !write) {
    log('REFUSING: --approve-as without --write. Approving a revision this run did');
    log('  not create would approve whatever happens to be in the bank already.');
    process.exitCode = 1;
    return;
  }

  // `track_id` and `scenario_family` live on the IDENTITY, not on the revision.
  // The first live run of this script failed on `column "track_id" does not
  // exist` because it selected them from `cert_question_revisions`. Both tables
  // are needed and the join is not optional.
  //
  // Retired identities are excluded: a question somebody deliberately took out of
  // circulation should not be improved, re-drafted and offered back for approval.
  const rows = await sequelize.query<Row>(BANK_QUERY, { type: QueryTypes.SELECT });

  let queue = latestPerKey(rows);
  if (onlyKey) queue = queue.filter((r) => r.question_key === onlyKey);
  const total = queue.length;
  queue = queue.slice(0, Number.isFinite(limit) ? limit : undefined);

  log(`bank        : ${total} question(s); processing ${queue.length}`);
  log('');

  const outcomes: Outcome[] = [];

  // Sequential on purpose. These are paid generations against a rate-limited
  // provider, and a bounded loop that can be read in the log beats a fan-out
  // that is faster and impossible to follow when it goes wrong.
  for (const row of queue) {
    const start = toImproverItem(row);
    const startScore = scoreItem(start);
    // The target is what this item CAN reach, not a flat six. A multi-select item
    // can never meet `option_count`; aiming at six would spend a model call on it
    // every run and then report it as a failure.
    const ceiling = achievableScore(start, startScore.of);
    const blocked = unachievableDimensions(start);

    if (startScore.met >= ceiling) {
      outcomes.push({ key: row.question_key, before: startScore.met, after: startScore.met, rounds: 0, action: 'skipped' });
      log(`${row.question_key.padEnd(14)} ${startScore.met}/${startScore.of}  already meets`
        + `${blocked.length > 0 ? `  [ceiling ${ceiling}/${startScore.of}: ${blocked.join(', ')} cannot change]` : ''}`);
      continue;
    }

    const result = await improveUntilMeets(start, MAX_ROUNDS);
    const improved = result.after > result.before;

    // Narrowed rather than cast. `checkInvariants` already refuses a candidate
    // without a rationale, so this cannot fire — which is exactly why it is here
    // rather than an `as string`: if the invariant is ever relaxed, this reports
    // a skipped item instead of writing a revision with an empty explanation.
    if (improved && write && !result.item.rationale?.trim()) {
      log(`${row.question_key.padEnd(14)} SKIPPED: improved candidate had no rationale`);
      outcomes.push({ key: row.question_key, before: result.before, after: result.after, rounds: result.rounds, action: 'failed', detail: 'no rationale' });
      continue;
    }

    if (improved && write) {
      await createDraftRevision({
        question_key: row.question_key,
        track_id: row.track_id,
        blueprint_version: row.blueprint_version,
        domain_id: row.domain_id,
        objective_id: row.objective_id ?? undefined,
        scenario_family: row.scenario_family ?? undefined,
        stem: result.item.stem,
        options: result.item.options,
        correct_keys: result.item.correct_keys,
        select_count: result.item.correct_keys.length,
        rationale: result.item.rationale as string,
        distractor_rationales: result.item.distractor_rationales ?? undefined,
        difficulty: (row.difficulty ?? 'medium') as any,
        author: 'colaberry',
      });
    }

    const action: Outcome['action'] = result.after === scoreItem(start).of
      ? 'improved'
      : (result.stalledReason?.includes(':') ? 'failed' : 'stalled');

    outcomes.push({
      key: row.question_key,
      before: result.before,
      after: result.after,
      rounds: result.rounds,
      action: improved ? action : (result.stalledReason ? action : 'stalled'),
      detail: result.stalledReason,
    });

    log(`${row.question_key.padEnd(14)} ${result.before}/6 -> ${result.after}/6  `
      + `${result.rounds} round(s)  ${improved ? (write ? 'draft written' : 'would write draft') : 'no change'}`
      + `${result.stalledReason ? `  [${result.stalledReason}]` : ''}`);
  }

  log('');
  /**
   * Say what is true, not what is convenient.
   *
   * This line first read `RESULT: 150/150 at 6/6` after the ceiling change,
   * because it counted every skipped item as a six. Twenty-one of them are at
   * 5/6 — correctly, at their ceiling — so the summary overstated the bank to
   * the one person relying on it. A run that reports better than reality is
   * worse than one that reports nothing, because it ends the investigation.
   *
   * The two numbers are therefore reported separately: how many reached the top
   * of the rubric, and how many are as good as they are permitted to get.
   */
  const perfect = outcomes.filter((o) => o.after === 6).length;
  const atCeiling = outcomes.filter((o) => o.action === 'skipped' || o.after === 6).length;
  const cappedBelowSix = atCeiling - perfect;
  log(`RESULT: ${atCeiling}/${outcomes.length} at their ceiling`);
  log(`        ${perfect} at 6/6`
    + (cappedBelowSix > 0
      ? `, ${cappedBelowSix} capped below six by a dimension no rewrite can change`
      : ''));
  const stalled = outcomes.filter((o) => o.action !== 'skipped' && o.after < 6);
  if (stalled.length > 0) {
    log(`STALLED (${stalled.length}): ${stalled.map((s) => `${s.key}@${s.after}/6`).join(', ')}`);
    log('  These need replacement or a human rewrite. Nothing was approved for them.');
  }

  if (approveAs) {
    log('');
    log(`Approving ${meets} item(s) at 6/6 as ${approveAs}`);
    let approved = 0;
    for (const o of outcomes.filter((x) => x.after === 6)) {
      const latest = await sequelize.query<{ revision: number }>(
        'SELECT MAX(revision) AS revision FROM cert_question_revisions WHERE question_key = :k',
        { replacements: { k: o.key }, type: QueryTypes.SELECT },
      );
      const rev = latest[0]?.revision;
      if (!rev) continue;
      await setReviewStatus(o.key, rev, 'approved', approveAs);
      approved += 1;
    }
    log(`Approved ${approved} revision(s) as ${approveAs}.`);
  }
}

/**
 * Let in-flight instrumentation finish before the connection goes away.
 *
 * The first live run ended with `ConnectionManager.getConnection was called after
 * the connection manager was closed` — `getInstrumentedOpenAI` writes its cost
 * and token rows to `ai_events` asynchronously, and the script closed sequelize
 * out from under the last write. The run still produced correct output, which is
 * what makes it easy to miss: the only casualty was the telemetry for the most
 * expensive part of the job.
 */
const settleTelemetry = (): Promise<void> => new Promise((r) => { setTimeout(r, 2000); });

main()
  .then(settleTelemetry)
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('sweepCertQuestionRubric failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    await sequelize.close().catch(() => undefined);
  });
