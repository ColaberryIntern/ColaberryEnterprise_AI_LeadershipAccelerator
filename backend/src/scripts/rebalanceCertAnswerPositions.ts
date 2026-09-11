/**
 * rebalanceCertAnswerPositions — move every question's correct answer to the
 * position the item factory would have given it.
 *
 * WHY. The first 150 generated questions went into production with the key at
 * A in 144 of them. A student who answered A throughout would have scored 96%
 * on that half of the bank. The authored items never had this problem because
 * `item()` places the key from a hash of the question key; the generator
 * bypassed the factory and inherited the model's habit of writing the right
 * answer first. The generator is fixed; this script fixes what it already wrote.
 *
 * WHAT IT DOES, PER QUESTION. Reads the latest revision. Computes where the
 * factory would put the key (`assignAnswerPosition`, the same function the
 * authored bank uses, so the two halves obey one rule). If the key is already
 * there, nothing. If not, mints a NEW draft revision with the options reordered
 * and the distractor rationales remapped to follow their options — never an
 * edit in place, because `cert_responses` pins every recorded answer to the
 * revision it was served against.
 *
 * IDEMPOTENT. A second run finds every key already in position and writes
 * nothing. The position is a pure function of the question key, so it cannot
 * drift between runs or between environments.
 *
 * APPROVAL IS A SEPARATE FLAG. The content is unchanged - same stem, same
 * options, same key - only the order differs. `--approve-as` re-approves the
 * new revision under the named person so the reordered item is what gets
 * served; without it the old, biased revision stays servable and the fix is
 * invisible to students.
 *
 * Usage (inside the backend container):
 *   node dist/scripts/rebalanceCertAnswerPositions.js                         # dry run
 *   node dist/scripts/rebalanceCertAnswerPositions.js --write
 *   node dist/scripts/rebalanceCertAnswerPositions.js --write --approve-as ali@colaberry.com
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { assignAnswerPosition } from '../data/certBlueprints/items/itemFactory';
import { createDraftRevision, setReviewStatus } from '../services/certPrep/certQuestionBankService';
import { runLiveAudit } from './lib/certBankAudit';

const args = process.argv.slice(2);
const write = args.includes('--write');
const approveIdx = args.indexOf('--approve-as');
const approveAs = approveIdx >= 0 ? args[approveIdx + 1] : null;

interface Row {
  question_key: string;
  revision: number;
  review_status: string;
  track_id: string;
  blueprint_version: string;
  domain_id: string;
  objective_id: string | null;
  scenario_family: string | null;
  difficulty: string | null;
  stem: string;
  options: { key: string; text: string }[];
  correct_keys: string[];
  rationale: string | null;
  distractor_rationales: Record<string, string> | null;
}

const log = (line: string): void => { console.log(line); };

/**
 * Where the key sits now versus where the factory would put it. Exported and
 * pure so the decision can be tested without a database.
 */
export function placement(row: Pick<Row, 'question_key' | 'options' | 'correct_keys'>): {
  current: string | null;
  target: string | null;
  moves: boolean;
} {
  if (row.correct_keys.length !== 1) return { current: null, target: null, moves: false };
  const current = row.correct_keys[0];
  const placed = assignAnswerPosition(
    row.question_key,
    row.options.map((o) => [o.key, o.text] as [string, string]),
    row.correct_keys,
  );
  const target = placed.correct[0];
  return { current, target, moves: current !== target };
}

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  log(`database    : ${db}`);
  log(`mode        : ${write ? 'WRITE — new revisions will be minted' : 'DRY RUN — nothing will be written'}`);
  log(`approve as  : ${approveAs ?? 'nothing will be approved'}`);
  log('');

  if (approveAs && !write) {
    log('REFUSING: --approve-as without --write.');
    process.exitCode = 1;
    return;
  }

  const rows = await sequelize.query<Row>(
    `SELECT DISTINCT ON (r.question_key)
            r.question_key, r.revision, r.review_status, q.track_id, r.blueprint_version,
            r.domain_id, r.objective_id, q.scenario_family, r.difficulty, r.stem, r.options,
            r.correct_keys, r.rationale, r.distractor_rationales
       FROM cert_question_revisions r
       JOIN cert_questions q ON q.question_key = r.question_key
      WHERE q.is_retired = false
      ORDER BY r.question_key, r.revision DESC`,
    { type: QueryTypes.SELECT },
  );

  const before: Record<string, number> = {};
  const after: Record<string, number> = {};
  let moved = 0; let inPlace = 0; let multi = 0;
  const minted: { key: string; revision: number }[] = [];

  for (const row of rows) {
    const p = placement(row);
    if (p.current === null) { multi += 1; continue; }
    before[p.current] = (before[p.current] ?? 0) + 1;
    after[p.target!] = (after[p.target!] ?? 0) + 1;

    if (!p.moves) { inPlace += 1; continue; }
    moved += 1;

    if (write) {
      const placed = assignAnswerPosition(
        row.question_key,
        row.options.map((o) => [o.key, o.text] as [string, string]),
        row.correct_keys,
      );
      const rationales: Record<string, string> = {};
      for (const [oldKey, text] of Object.entries(row.distractor_rationales ?? {})) {
        rationales[placed.remap[oldKey] ?? oldKey] = text;
      }
      const rev = await createDraftRevision({
        question_key: row.question_key,
        track_id: row.track_id,
        blueprint_version: row.blueprint_version,
        domain_id: row.domain_id,
        objective_id: row.objective_id ?? undefined,
        scenario_family: row.scenario_family ?? undefined,
        stem: row.stem,
        options: placed.options.map(([k, text]) => ({ key: k, text })),
        correct_keys: placed.correct,
        select_count: 1,
        rationale: row.rationale ?? '',
        distractor_rationales: rationales,
        difficulty: (row.difficulty ?? 'medium') as any,
        author: 'colaberry',
      });
      minted.push({ key: row.question_key, revision: rev.revision });
    }
    log(`${row.question_key.padEnd(14)} ${p.current} -> ${p.target}  ${write ? 'minted' : 'would mint'}`);
  }

  log('');
  log(`in place    : ${inPlace}`);
  log(`moved       : ${moved}`);
  log(`multi-select: ${multi} (left in authored order, as the factory does)`);
  log(`position    : before ${JSON.stringify(before)}`);
  log(`              after  ${JSON.stringify(after)}`);

  if (approveAs && minted.length > 0) {
    let n = 0;
    for (const m of minted) {
      await setReviewStatus(m.key, m.revision, 'approved', approveAs);
      n += 1;
    }
    log(`approved    : ${n} reordered revision(s) as ${approveAs}`);
  }

  // The whole point of this script is a bank-level property, so the bank-level
  // audit is how it proves it worked. Runs on the live bank after the change.
  if (write) await runLiveAudit('after rebalance');
}

const settleTelemetry = (): Promise<void> => new Promise((r) => { setTimeout(r, 1500); });

if (require.main === module) main()
  .then(settleTelemetry)
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('rebalanceCertAnswerPositions failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    await sequelize.close().catch(() => undefined);
  });
