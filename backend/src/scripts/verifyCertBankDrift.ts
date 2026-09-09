/**
 * verifyCertBankDrift — does the database hold the questions this build authored?
 *
 * WHY THIS EXISTS. On 2026-09-08 all 150 CCAR-F items were rewritten, merged and
 * deployed. Every signal was green: CI passed, `tsc --noEmit` was clean, 332
 * tests passed, the container came up healthy, and the rewritten text was
 * verifiably present in the running container's `dist`. Production was still
 * serving the OLD questions, because shipping the code and seeding the bank are
 * two different actions and only the first had happened.
 *
 * Nothing anywhere would have caught that. The rubric scores TypeScript files in
 * this repo. The E2E drives a browser against whatever is in the database.
 * Neither compares the two, so the gap between "what we authored" and "what a
 * student would be served" was invisible until someone queried Postgres by hand.
 * This script is that comparison, and it is the missing half of a deploy.
 *
 * READ-ONLY. It opens no transaction and writes nothing, so it is safe against
 * production and safe to run twice. It reports; the operator decides.
 *
 * WHAT IT REPORTS, AND WHY EACH IS SEPARATE
 *   MISSING   — authored item with no revision at all in the database. The bank
 *               was never seeded, or was seeded from an older build.
 *   DRIFTED   — the latest stored revision does not match the authored content.
 *               This is the 2026-09-08 case: code deployed, bank not re-seeded.
 *   UNSERVABLE— stored content matches, but nothing is approved and in-window, so
 *               a student would be served nothing. Not drift; a review-gate state.
 *               Reported separately so a pending review is never mistaken for a
 *               deploy failure, which is the exact confusion this script exists
 *               to remove.
 *   EXTRA     — a question key in the database that this build does not author.
 *               Usually a retired item; worth seeing, never worth failing on.
 *
 * EXIT CODE. Non-zero when anything is MISSING or DRIFTED, because those mean the
 * database does not hold what this build says it should. UNSERVABLE and EXTRA do
 * not fail the run: both are legitimate states that a human decides about.
 *
 * Usage (inside the backend container, so it uses the app's own connection):
 *   node dist/scripts/verifyCertBankDrift.js
 *   node dist/scripts/verifyCertBankDrift.js --verbose   # list every key
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { sameContent } from './lib/certItemContent';
import { isRevisionServable } from '../services/certPrep/certQuestionBankService';
import { CertReviewStatus } from '../models/CertQuestionRevision';
import { CCAR_F_ALL_ITEMS } from '../data/certBlueprints/items';

const verbose = process.argv.includes('--verbose');

interface StoredRevision {
  question_key: string;
  revision: number;
  stem: string;
  options: unknown;
  correct_keys: unknown;
  rationale: string | null;
  distractor_rationales: unknown;
  // Typed as the model types them, not as the driver happens to return them:
  // `isRevisionServable` compares these as dates, and a string here would only
  // agree with it by coincidence.
  review_status: CertReviewStatus;
  active_from: Date | null;
  active_to: Date | null;
}

function log(line: string): void {
  console.log(line);
}

/**
 * The highest revision per key — what a re-seed would have written last.
 *
 * Exported so it can be tested without a database. The rest of this script is
 * one query and some printing; this is the only part with a decision in it, and
 * an off-by-one here would report the WRONG revision as current and then compare
 * against it, which is a drift checker that reports drift incorrectly.
 */
export function latestByKey(rows: StoredRevision[]): Map<string, StoredRevision> {
  const out = new Map<string, StoredRevision>();
  for (const r of rows) {
    const seen = out.get(r.question_key);
    if (!seen || r.revision > seen.revision) out.set(r.question_key, r);
  }
  return out;
}

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  log(`database        : ${db}`);
  log(`authored items  : ${CCAR_F_ALL_ITEMS.length}`);

  const rows = await sequelize.query<StoredRevision>(
    `SELECT question_key, revision, stem, options, correct_keys, rationale,
            distractor_rationales, review_status, active_from, active_to
       FROM cert_question_revisions`,
    { type: QueryTypes.SELECT },
  );
  const latest = latestByKey(rows);
  log(`stored revisions: ${rows.length} across ${latest.size} question(s)`);
  log('');

  const missing: string[] = [];
  const drifted: string[] = [];
  const unservable: string[] = [];

  for (const authored of CCAR_F_ALL_ITEMS) {
    const stored = latest.get(authored.question_key);
    if (!stored) {
      missing.push(authored.question_key);
      continue;
    }
    // Compared through the SAME helper the seeder uses to decide whether to mint
    // a revision. A second comparison written here would drift from that one and
    // this script would start disagreeing with the thing it checks.
    const matches = sameContent(
      {
        stem: stored.stem,
        options: stored.options,
        correct_keys: stored.correct_keys,
        rationale: stored.rationale,
        distractor_rationales: stored.distractor_rationales,
      },
      {
        stem: authored.stem,
        options: authored.options,
        correct_keys: authored.correct_keys,
        rationale: authored.rationale ?? null,
        distractor_rationales: authored.distractor_rationales,
      },
    );
    if (!matches) {
      drifted.push(authored.question_key);
      continue;
    }
    // Servability is asked of EVERY revision of the key, not just the latest:
    // a student is served the highest approved one, which may not be the newest.
    const anyServable = rows
      .filter((r) => r.question_key === authored.question_key)
      .some((r) => isRevisionServable(r));
    if (!anyServable) unservable.push(authored.question_key);
  }

  const authoredKeys = new Set(CCAR_F_ALL_ITEMS.map((i) => i.question_key));
  const extra = [...latest.keys()].filter((k) => !authoredKeys.has(k));

  const show = (label: string, keys: string[]): void => {
    log(`${label.padEnd(16)}: ${keys.length}`);
    if (keys.length > 0 && verbose) log(`                  ${keys.join(', ')}`);
    else if (keys.length > 0) log(`                  ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ` … (+${keys.length - 8}, use --verbose)` : ''}`);
  };

  show('MISSING', missing);
  show('DRIFTED', drifted);
  show('UNSERVABLE', unservable);
  show('EXTRA', extra);
  log('');

  if (missing.length > 0 || drifted.length > 0) {
    log('FAIL: the database does not hold what this build authored.');
    log('      Re-seed with: node dist/scripts/seedCertPrepContent.js --items --revise');
    process.exitCode = 1;
    return;
  }
  if (unservable.length > 0) {
    log(`OK (content matches). ${unservable.length} item(s) have no approved revision —`);
    log('   a student would be served nothing until a named reviewer approves them.');
    return;
  }
  log('OK: every authored item is stored, current, and servable.');
}

main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('verifyCertBankDrift failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    await sequelize.close().catch(() => undefined);
  });
