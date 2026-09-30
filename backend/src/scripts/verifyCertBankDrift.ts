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
 *   STALE     — an approved revision EXISTS, but it is not the authored content.
 *               A student is being served a superseded question while the current
 *               one waits for a reviewer.
 *   EXTRA     — a question key in the database that this build does not author.
 *               Usually a retired item; worth seeing, never worth failing on.
 *
 * EXIT CODE. Non-zero when anything is MISSING or DRIFTED, because those mean the
 * database does not hold what this build says it should. UNSERVABLE, STALE and
 * EXTRA do not fail the run: all three are legitimate states that a human decides
 * about. STALE in particular is the NORMAL condition immediately after a rewrite —
 * the new draft is waiting for a reviewer while the old approved revision keeps
 * serving, which is exactly what the review gate is for. It fails nothing and it
 * must be impossible to miss, because a STALE that persists means students are
 * practising on questions the team has already replaced.
 *
 * STALE WAS ADDED AFTER THE FIRST LIVE RUN, 2026-09-09, WHICH MISSED IT. The
 * script reported DRIFTED: 0 against production while `CCARF-A1` was serving its
 * pre-rewrite revision 1, because it compared the LATEST stored revision to the
 * authored content — and revision 2 matched perfectly. It never asked which
 * revision a student would actually be SERVED. A drift checker that cannot see
 * the difference between "we stored it" and "they get it" is checking the easier
 * half of its own question.
 *
 * Usage (inside the backend container, so it uses the app's own connection):
 *   node dist/scripts/verifyCertBankDrift.js
 *   node dist/scripts/verifyCertBankDrift.js --verbose   # list every key
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { sameContent } from './lib/certItemContent';
import { pickServableRevision } from '../services/certPrep/certQuestionBankService';
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

/** What this build believes about one authored item, given what is stored. */
export type DriftVerdict = 'missing' | 'drifted' | 'unservable' | 'stale' | 'ok';

/** Only the fields the comparison reads, so a test needs no full revision row. */
type ComparableSource = {
  stem: string; options: unknown; correct_keys: unknown;
  rationale: string | null; distractor_rationales?: unknown;
};

const asComparable = (r: ComparableSource) => ({
  stem: r.stem,
  options: r.options,
  correct_keys: r.correct_keys,
  rationale: r.rationale ?? null,
  distractor_rationales: r.distractor_rationales,
});

/**
 * Classify one authored item against every stored revision of it.
 *
 * Exported and pure so the four-way decision can be tested without a database.
 * The order matters and is not arbitrary:
 *
 *   missing    — nothing stored at all; every later question is moot.
 *   drifted    — what we stored is not what we authored. A deploy/seed problem.
 *   unservable — stored correctly, nothing approved. A review-gate state.
 *   stale      — approved, but the approved one is NOT what we authored. The
 *                student is getting a superseded question.
 *
 * `drifted` is checked against the LATEST stored revision and `stale` against the
 * SERVABLE one, because they are different questions. After a rewrite the latest
 * revision matches the authored content perfectly while the revision a student
 * receives is the previous, still-approved one — which is precisely the case the
 * first live run of this script failed to notice.
 */
export function classifyItem(
  authored: ComparableSource & { question_key: string },
  revisionsForKey: StoredRevision[],
  now: Date = new Date(),
): { verdict: DriftVerdict; servedRevision: number | null } {
  if (revisionsForKey.length === 0) return { verdict: 'missing', servedRevision: null };

  const latest = revisionsForKey.reduce((a, b) => (b.revision > a.revision ? b : a));
  // Compared through the SAME helper the seeder uses to decide whether to mint a
  // revision. A second comparison written here would drift from that one and this
  // script would start disagreeing with the thing it checks.
  if (!sameContent(asComparable(latest), asComparable(authored))) {
    return { verdict: 'drifted', servedRevision: null };
  }

  const served = pickServableRevision(revisionsForKey, now);
  if (!served) return { verdict: 'unservable', servedRevision: null };

  if (!sameContent(asComparable(served), asComparable(authored))) {
    return { verdict: 'stale', servedRevision: served.revision };
  }
  return { verdict: 'ok', servedRevision: served.revision };
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

  const byKey = new Map<string, StoredRevision[]>();
  for (const r of rows) {
    const list = byKey.get(r.question_key) ?? [];
    list.push(r);
    byKey.set(r.question_key, list);
  }

  const missing: string[] = [];
  const drifted: string[] = [];
  const unservable: string[] = [];
  const stale: string[] = [];

  for (const authored of CCAR_F_ALL_ITEMS) {
    const { verdict, servedRevision } = classifyItem(
      { ...authored, rationale: authored.rationale ?? null },
      byKey.get(authored.question_key) ?? [],
    );
    if (verdict === 'missing') missing.push(authored.question_key);
    else if (verdict === 'drifted') drifted.push(authored.question_key);
    else if (verdict === 'unservable') unservable.push(authored.question_key);
    else if (verdict === 'stale') stale.push(`${authored.question_key}@r${servedRevision}`);
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
  show('STALE', stale);
  show('EXTRA', extra);
  log('');

  if (missing.length > 0 || drifted.length > 0) {
    log('FAIL: the database does not hold what this build authored.');
    log('      Re-seed with: node dist/scripts/seedCertPrepContent.js --items --revise');
    process.exitCode = 1;
    return;
  }
  if (stale.length > 0) {
    log(`ATTENTION: ${stale.length} item(s) are SERVING a superseded revision.`);
    log('   The authored version is stored and waiting for a reviewer; until it is');
    log('   approved, students get the older question. Not a deploy failure.');
  }
  if (unservable.length > 0) {
    log(`OK (content matches). ${unservable.length} item(s) have no approved revision —`);
    log('   a student would be served nothing until a named reviewer approves them.');
    return;
  }
  if (stale.length > 0) return;
  log('OK: every authored item is stored, current, and servable.');
}

// Only run when invoked directly; `latestByKey` and `classifyItem` are imported
// by tests, and firing main() on import tries to reach a database the test does
// not have.
if (require.main === module) main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('verifyCertBankDrift failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    await sequelize.close().catch(() => undefined);
  });
