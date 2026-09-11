/**
 * balanceCertOptionLengths — stop the longest option from being the answer.
 *
 * WHY. In the first 150 generated questions the correct option was the longest
 * of the four in 112. The margin was six characters at the median, invisible to
 * a reviewer reading one item and worth 75% to a student reading none. The
 * bank-level audit (`certBankRubric`) caps the rate at 60%; the authored half
 * sits at 37%; the generated half pushed the whole bank to 66%.
 *
 * WHAT IT DOES, PER GENERATED ITEM. `lengthPlan` says whether the key is the
 * longest option and — by a hash of the question key — whether this item is one
 * of the third that keeps it that way, so the bank lands near chance rather
 * than at zero. For the rest, `lengthenDistractor` asks the model to add
 * detail to the longest WRONG option until it overtakes the key, and the result
 * is refused unless it lands inside the bounds, breaks no invariant and costs
 * no rubric dimension. Then the adversarial triage reads the changed item; a
 * high-severity concern (the longer distractor is now arguable) discards it.
 * What survives is minted as a NEW revision — never an edit in place, because
 * `cert_responses` pins every recorded answer to the revision it was served.
 *
 * IT ALSO REPAIRS ITS OWN MISTAKE. Four of the first twenty-three lengthened
 * options came back as "D. Allocate ..." — the model reciting the list — and
 * were minted that way. An option that begins with its own letter is stripped
 * and re-minted here without a model call, so the repair is idempotent and
 * needs no reviewer beyond the one who approves the run.
 *
 * AUTHORED ITEMS ARE NEVER TOUCHED. Their text lives in the per-domain
 * TypeScript files, and a revision minted here would register as drift against
 * them. They are counted and skipped.
 *
 * IDEMPOTENT. A second run finds every key either not-longest or hash-kept and
 * writes nothing. The dry run spends no model calls; it lists what would be
 * touched.
 *
 * Usage (inside the backend container):
 *   node dist/scripts/balanceCertOptionLengths.js                         # dry run
 *   node dist/scripts/balanceCertOptionLengths.js --write --limit 5
 *   node dist/scripts/balanceCertOptionLengths.js --write --approve-as ali@colaberry.com
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { HAND_AUTHORED_ITEMS } from '../data/certBlueprints/items';
import { lengthPlan, stripOptionLabels } from '../services/certPrep/certOptionLength';
import { lengthenDistractor } from '../services/certPrep/certDistractorLengthener';
import { ImproverItem } from '../services/certPrep/certQuestionImprover';
import { triageQuestion } from '../services/certPrep/certQuestionTriage';
import { createDraftRevision, setReviewStatus } from '../services/certPrep/certQuestionBankService';
import { runLiveAudit } from './lib/certBankAudit';

const args = process.argv.slice(2);
const write = args.includes('--write');
const approveIdx = args.indexOf('--approve-as');
const approveAs = approveIdx >= 0 ? args[approveIdx + 1] : null;
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const keyIdx = args.indexOf('--key');
const onlyKey = keyIdx >= 0 ? args[keyIdx + 1] : null;

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
  rationale: string | null;
  distractor_rationales: Record<string, string> | null;
}

const log = (line: string): void => { console.log(line); };

const toItem = (r: Row): ImproverItem => ({
  question_key: r.question_key,
  domain_id: r.domain_id,
  objective_id: r.objective_id ?? '',
  stem: r.stem,
  options: r.options,
  correct_keys: r.correct_keys,
  rationale: r.rationale,
  distractor_rationales: r.distractor_rationales,
  difficulty: r.difficulty,
  scenario_family: r.scenario_family,
});

/** A new revision carrying the item's current text; never an edit in place. */
async function mint(row: Row, item: ImproverItem): Promise<number> {
  const rev = await createDraftRevision({
    question_key: row.question_key,
    track_id: row.track_id,
    blueprint_version: row.blueprint_version,
    domain_id: row.domain_id,
    objective_id: row.objective_id ?? undefined,
    scenario_family: row.scenario_family ?? undefined,
    stem: item.stem,
    options: item.options,
    correct_keys: item.correct_keys,
    select_count: 1,
    rationale: item.rationale ?? '',
    distractor_rationales: item.distractor_rationales ?? {},
    difficulty: (row.difficulty ?? 'medium') as any,
    author: 'colaberry',
  });
  return rev.revision;
}

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  log(`database    : ${db}`);
  log(`mode        : ${write ? 'WRITE — new revisions will be minted' : 'DRY RUN — nothing written, no model calls'}`);
  log(`approve as  : ${approveAs ?? 'nothing will be approved'}`);
  log('');

  if (approveAs && !write) {
    log('REFUSING: --approve-as without --write.');
    process.exitCode = 1;
    return;
  }

  const authored = new Set(HAND_AUTHORED_ITEMS.map((i) => i.question_key));
  const rows = await sequelize.query<Row>(
    `SELECT DISTINCT ON (r.question_key)
            r.question_key, r.revision, q.track_id, r.blueprint_version, r.domain_id, r.objective_id,
            q.scenario_family, r.difficulty, r.stem, r.options, r.correct_keys, r.rationale,
            r.distractor_rationales
       FROM cert_question_revisions r
       JOIN cert_questions q ON q.question_key = r.question_key
      WHERE q.is_retired = false
      ORDER BY r.question_key, r.revision DESC`,
    { type: QueryTypes.SELECT },
  );

  let skippedAuthored = 0; let notLongest = 0; let kept = 0; let multi = 0;
  let lengthened = 0; let refused = 0; let discarded = 0; let planned = 0; let relabelled = 0;
  const minted: { key: string; revision: number }[] = [];

  for (const row of rows) {
    if (onlyKey && row.question_key !== onlyKey) continue;
    if (authored.has(row.question_key)) { skippedAuthored += 1; continue; }
    if (row.correct_keys.length !== 1) { multi += 1; continue; }

    // Labels first, so the plan measures the words and not the "D. " in front.
    const stripped = stripOptionLabels(toItem(row));
    const item = stripped.item;
    const plan = lengthPlan(item);
    const needsLength = plan.keyIsLongest && !plan.keep;
    if (!plan.keyIsLongest) notLongest += 1;
    else if (plan.keep) kept += 1;

    if (!needsLength && stripped.changed.length === 0) continue;
    if (planned >= limit) break;
    planned += 1;

    if (!write) {
      const what = [
        stripped.changed.length ? `would strip label from ${stripped.changed.join(',')}` : '',
        needsLength ? `would lengthen ${plan.target} to ${plan.minChars}-${plan.maxChars} chars` : '',
      ].filter(Boolean).join('; ');
      log(`${row.question_key.padEnd(14)} ${what}`);
      continue;
    }

    // A label strip alone is not a content change and needs no model and no
    // triage: the words are the reviewer's own, minus the letter in front.
    if (!needsLength) {
      const rev = await mint(row, item);
      minted.push({ key: row.question_key, revision: rev });
      relabelled += 1;
      log(`${row.question_key.padEnd(14)} label stripped from ${stripped.changed.join(',')}  minted r${rev}`);
      continue;
    }

    const out = await lengthenDistractor(item, plan);
    if (out.status !== 'lengthened') {
      refused += 1;
      const why = out.status === 'failed' ? `${out.error_class}: ${out.message}`
        : out.status === 'out_of_bounds' ? `got ${out.got}, wanted ${out.min}-${out.max}`
          : out.status === 'invariant_violated' ? out.reason
            : `${out.before} -> ${out.after}`;
      log(`${row.question_key.padEnd(14)} REFUSED (${out.status}: ${why})`);
      continue;
    }

    // The lengthener cannot tell whether the added detail made the distractor
    // arguable. The triage can, and a high-severity concern is a discard.
    const triage = await triageQuestion({
      question_key: row.question_key,
      stem: out.item.stem,
      options: out.item.options,
      correct_keys: out.item.correct_keys,
      rationale: out.item.rationale,
      distractor_rationales: out.item.distractor_rationales,
      domain_id: row.domain_id,
      objective_id: row.objective_id ?? '',
    });
    if (triage.verdict === 'error') {
      discarded += 1;
      log(`${row.question_key.padEnd(14)} DISCARDED (triage error: ${triage.errorClass ?? 'unknown'})`);
      continue;
    }
    if (triage.verdict === 'needs_human' && triage.severity === 'high') {
      discarded += 1;
      log(`${row.question_key.padEnd(14)} DISCARDED (triage high: ${triage.concerns[0]?.detail?.slice(0, 90) ?? ''})`);
      continue;
    }

    const rev = await mint(row, out.item);
    minted.push({ key: row.question_key, revision: rev });
    lengthened += 1;
    const note = triage.verdict === 'needs_human' ? `  [triage ${triage.severity}]` : '';
    const label = stripped.changed.length ? `  [label stripped from ${stripped.changed.join(',')}]` : '';
    log(`${row.question_key.padEnd(14)} ${plan.target} ${out.before} -> ${out.after} chars  minted r${rev}${note}${label}`);
  }

  log('');
  log(`authored    : ${skippedAuthored} skipped (edited in the repo, not here)`);
  log(`multi-select: ${multi} skipped`);
  log(`not longest : ${notLongest} already fine`);
  log(`kept        : ${kept} keep the key longest by hash (one in three)`);
  log(`planned     : ${planned}`);
  if (write) {
    log(`relabelled  : ${relabelled} (letter label stripped, no other change)`);
    log(`lengthened  : ${lengthened}`);
    log(`refused     : ${refused} (bounds, invariants or rubric)`);
    log(`discarded   : ${discarded} (triage)`);
  }

  if (approveAs && minted.length > 0) {
    for (const m of minted) await setReviewStatus(m.key, m.revision, 'approved', approveAs);
    log(`approved    : ${minted.length} revision(s) as ${approveAs}`);
  }

  // The reason this script exists is a bank-level number; the bank-level audit
  // is how it shows the number moved.
  if (write) await runLiveAudit('after length balance');
}

const settleTelemetry = (): Promise<void> => new Promise((r) => { setTimeout(r, 2000); });

if (require.main === module) main()
  .then(settleTelemetry)
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('balanceCertOptionLengths failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    await sequelize.close().catch(() => undefined);
  });
