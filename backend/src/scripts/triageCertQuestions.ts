/**
 * triageCertQuestions — run the CCAR-F bank past an adversarial reviewer and
 * record what it could not talk itself out of objecting to.
 *
 * WHAT THIS PRODUCES IS A READING ORDER, NOT A RESULT. Claude wrote these
 * questions; the reviewer is GPT-4o-mini. A different model family is more
 * independent than self-review and is still not a person. This script changes
 * which questions a human reads first. It does not change whether a human reads,
 * and it cannot make anything servable — approval lives in `setReviewStatus`,
 * under a named human, in the admin queue, and nothing here touches it.
 *
 * DRY RUN BY DEFAULT. `--write` persists. The default prints exactly what would
 * be stored, because a pass over 150 questions costs real money and a mistyped
 * flag should not be how you find that out.
 *
 * RESUMABLE BY CONSTRUCTION. A question already triaged at that revision, by
 * that model, with that prompt version, is skipped. So an interrupted run costs
 * nothing to restart — and, importantly, a run with an IMPROVED PROMPT is not
 * skipped, because the prompt version is part of what makes an opinion new.
 *
 * EVERY ROW CARRIES ITS `run_id`, which is the rollback:
 *   DELETE FROM cert_question_triage WHERE run_id = '<id>'
 *
 * Usage:
 *   node dist/scripts/triageCertQuestions.js                 # dry run, whole bank
 *   node dist/scripts/triageCertQuestions.js --limit 3       # dry run, 3 items
 *   node dist/scripts/triageCertQuestions.js --write         # persist
 *   node dist/scripts/triageCertQuestions.js --write --limit 3
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import CertQuestionTriage from '../models/CertQuestionTriage';
import { LATEST_REVISION_SQL, ReviewRow } from './sendCertQuestionReview';
import { triageQuestion } from '../services/certPrep/certQuestionTriage';
import {
  needsHuman,
  TriageResult,
  TRIAGE_MODEL,
  TRIAGE_PROMPT_VERSION,
} from '../services/certPrep/triageTypes';

const args = process.argv.slice(2);
const write = args.includes('--write');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Math.max(1, parseInt(args[limitIdx + 1] ?? '', 10) || 0) : null;

/**
 * A run id a human can read and a DELETE can target. Not random: if you are
 * rolling back at 2am you want to recognise the run you just started.
 */
function makeRunId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  return `triage-${stamp}`;
}

/** Already reviewed by this model, at this revision, with this prompt. */
async function alreadyTriaged(): Promise<Set<string>> {
  const rows = await sequelize.query<{ question_key: string; revision: number }>(
    `SELECT question_key, revision FROM cert_question_triage
      WHERE reviewer_model = :model AND prompt_version = :pv`,
    { replacements: { model: TRIAGE_MODEL, pv: TRIAGE_PROMPT_VERSION }, type: QueryTypes.SELECT },
  );
  return new Set(rows.map((r) => `${r.question_key}@${r.revision}`));
}

function summarise(results: { row: ReviewRow; result: TriageResult }[]): void {
  const byDomain = new Map<string, { n: number; flagged: number; errors: number }>();
  for (const { row, result } of results) {
    const d = byDomain.get(row.domain_id) ?? { n: 0, flagged: 0, errors: 0 };
    d.n += 1;
    if (result.verdict === 'needs_human') d.flagged += 1;
    if (result.verdict === 'error') d.errors += 1;
    byDomain.set(row.domain_id, d);
  }
  console.log('');
  for (const domain of [...byDomain.keys()].sort()) {
    const d = byDomain.get(domain)!;
    console.log(`  ${domain}  ${String(d.n).padStart(3)} scored  ${String(d.flagged).padStart(3)} need a human`
      + (d.errors > 0 ? `  ${d.errors} unreadable` : ''));
  }
}

async function main(): Promise<void> {
  const now = new Date();
  const runId = makeRunId(now);

  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  console.log(`database  : ${db}`);
  console.log(`reviewer  : ${TRIAGE_MODEL} (prompt ${TRIAGE_PROMPT_VERSION})`);
  console.log(`mode      : ${write ? `WRITE — rows persist under run ${runId}` : 'dry run (pass --write to persist)'}`);
  console.log('');

  const all = await sequelize.query<ReviewRow>(LATEST_REVISION_SQL, { type: QueryTypes.SELECT });
  if (all.length === 0) throw new Error('no question revisions found — is this the right database?');

  const done = await alreadyTriaged();
  const pending = all.filter((r) => !done.has(`${r.question_key}@${r.revision}`));
  const queue = limit ? pending.slice(0, limit) : pending;

  console.log(`bank      : ${all.length} question(s)`);
  console.log(`already   : ${all.length - pending.length} triaged at this revision by this model and prompt`);
  console.log(`to review : ${queue.length}${limit && pending.length > limit ? ` (limited from ${pending.length})` : ''}`);
  console.log('');

  const results: { row: ReviewRow; result: TriageResult }[] = [];

  for (const row of queue) {
    const result = await triageQuestion({
      question_key: row.question_key,
      stem: row.stem,
      options: row.options,
      correct_keys: row.correct_keys,
      rationale: row.rationale,
      distractor_rationales: row.distractor_rationales,
      domain_id: row.domain_id,
      objective_id: row.objective_id,
    });
    results.push({ row, result });

    const mark = result.verdict === 'needs_human' ? '!' : result.verdict === 'error' ? '?' : '=';
    const note = result.verdict === 'needs_human'
      ? result.concerns[0]?.detail?.slice(0, 72) ?? ''
      : result.verdict === 'error' ? (result.errorClass ?? 'unreadable') : '';
    console.log(`  ${mark} ${row.question_key.padEnd(16)} ${note}`);

    if (write) {
      // Upsert on the natural key so a re-run at the same revision, model and
      // prompt updates in place rather than accumulating opinions.
      await CertQuestionTriage.upsert({
        run_id: runId,
        question_key: row.question_key,
        revision: row.revision,
        verdict: result.verdict,
        severity: result.severity,
        concerns: result.concerns,
        reviewer_model: TRIAGE_MODEL,
        prompt_version: TRIAGE_PROMPT_VERSION,
      } as any);
    }
  }

  summarise(results);

  const flagged = results.filter((r) => needsHuman(r.result.verdict)).length;
  const clean = results.length - flagged;

  console.log('');
  console.log(`scored    : ${results.length}`);
  console.log(`no objection raised : ${clean}   <- NOT the same as checked by a person`);
  console.log(`need a human        : ${flagged}`);
  console.log('');
  if (write) {
    console.log(`run id    : ${runId}`);
    console.log(`rollback  : DELETE FROM cert_question_triage WHERE run_id = '${runId}'`);
  } else {
    console.log('nothing was written. Re-run with --write.');
  }
  console.log('');
  console.log('Nothing was approved and nothing became servable — approval is a');
  console.log('separate act by a named human in the admin queue.');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('FAILED:', err?.message ?? err); process.exit(1); })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
