/**
 * planAuthoredOptionLengths — the option-length pass over the AUTHORED items,
 * emitted as patches to the repo rather than as revisions in the database.
 *
 * WHY A SEPARATE SCRIPT. `balanceCertOptionLengths` mints revisions for the
 * generated items, whose text lives in the database. The authored items live
 * in the per-domain TypeScript files, and a revision minted for one of them
 * would register as drift against its source. So the same pass runs here, and
 * instead of writing it prints what should change: one patch per option, with
 * the exact old text to find and the new text to put in its place.
 * `applyCertOptionPatches` edits the files; a PR carries the change; the seed
 * mints the revisions from the repo, as it does for every authored change.
 *
 * WHY IT MATTERS. The authored half measured 58% correct-is-longest by
 * characters after the generated half was fixed to 28%. Under the 60% bank
 * ceiling, but a cue all the same, and the half that a student hits first.
 *
 * OLD TEXT, NOT A POSITION. Patches match the option's TEXT because the letter
 * in the repo is the AUTHORED letter and the letter in the database is the
 * PLACED one — `item()` re-letters options as it moves the key. Text is the
 * one thing both agree on.
 *
 * NO DATABASE. Reads `HAND_AUTHORED_ITEMS` from the build it runs in. Needs the
 * model, so it runs where the key is: the backend container.
 *
 * STREAMS. One JSON patch per line on stdout, written the moment it exists.
 * The first run collected everything and printed it at the end; a concurrent
 * deploy recreated the container fifty seconds in and the run left nothing
 * behind. Now a killed run leaves every patch it made, and `--skip N` resumes
 * past the first N planned items - the plan is pure, so N means the same
 * items on every run. Redirect stdout on the HOST, never inside the container.
 *
 * Usage (from the host):
 *   docker exec accelerator-backend node dist/scripts/planAuthoredOptionLengths.js            # dry run
 *   docker exec accelerator-backend node dist/scripts/planAuthoredOptionLengths.js --write > patches.ndjson
 *   docker exec accelerator-backend node dist/scripts/planAuthoredOptionLengths.js --write --skip 30 >> patches.ndjson
 */
import { HAND_AUTHORED_ITEMS } from '../data/certBlueprints/items';
import { lengthPlan, stripOptionLabels } from '../services/certPrep/certOptionLength';
import { ImproverItem } from '../services/certPrep/certQuestionImprover';
import { passItem } from './lib/certLengthPass';

const args = process.argv.slice(2);
const write = args.includes('--write');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const keyIdx = args.indexOf('--key');
const onlyKey = keyIdx >= 0 ? args[keyIdx + 1] : null;
const skipIdx = args.indexOf('--skip');
const skip = skipIdx >= 0 ? Number(args[skipIdx + 1]) : 0;

/** One change to one option, addressed by text. */
export interface OptionPatch {
  question_key: string;
  domain_id: string;
  option_key: string;
  old_text: string;
  new_text: string;
  before_chars: number;
  after_chars: number;
  triage: { verdict: string; severity: string | null; detail: string | null };
}

const err = (line: string): void => { console.error(line); };

async function main(): Promise<void> {
  err(`items       : ${HAND_AUTHORED_ITEMS.length} authored`);
  err(`mode        : ${write ? 'WRITE — one patch per line to stdout, model calls spent' : 'DRY RUN — no model calls'}`);
  if (skip > 0) err(`skip        : the first ${skip} planned item(s)`);
  err('');

  let notLongest = 0; let kept = 0; let multi = 0; let planned = 0; let skipped = 0;
  let patched = 0; let refused = 0; let discarded = 0; let emitted = 0; let processed = 0;

  for (const a of HAND_AUTHORED_ITEMS) {
    if (onlyKey && a.question_key !== onlyKey) continue;
    if (a.correct_keys.length !== 1) { multi += 1; continue; }
    const item: ImproverItem = {
      question_key: a.question_key,
      domain_id: a.domain_id,
      objective_id: a.objective_id ?? '',
      stem: a.stem,
      options: a.options.map((o) => ({ key: o.key, text: o.text })),
      correct_keys: a.correct_keys,
      rationale: a.rationale,
      distractor_rationales: a.distractor_rationales ?? null,
      difficulty: a.difficulty,
      scenario_family: a.scenario_family,
    };

    if (!write) {
      const plan = lengthPlan(stripOptionLabels(item).item);
      if (!plan.keyIsLongest) { notLongest += 1; continue; }
      if (plan.keep) { kept += 1; continue; }
      if (skipped < skip) { skipped += 1; continue; }
      if (planned >= limit) break;
      planned += 1;
      err(`${a.question_key.padEnd(14)} key ${a.correct_keys[0]} longest; would lengthen ${plan.target} to ${plan.minChars}-${plan.maxChars} chars`);
      continue;
    }

    if (planned >= limit) break;
    // The skip is decided by the pure plan, before any model call is spent.
    const pure = lengthPlan(stripOptionLabels(item).item);
    if (pure.keyIsLongest && !pure.keep) {
      if (skipped < skip) { skipped += 1; continue; }
      processed += 1;
    }
    const out = await passItem(item);
    if (!out.plan.keyIsLongest) notLongest += 1;
    else if (out.plan.keep) kept += 1;
    if (out.status === 'unchanged') continue;
    planned += 1;
    if (out.status === 'refused') { refused += 1; err(`${a.question_key.padEnd(14)} REFUSED (${out.why})`); continue; }
    if (out.status === 'discarded') { discarded += 1; err(`${a.question_key.padEnd(14)} DISCARDED (${out.why})`); continue; }

    // Every option whose text differs becomes a patch. A relabel and a
    // lengthening are the same kind of change to the file.
    for (const o of out.item.options) {
      const before = item.options.find((x) => x.key === o.key)!;
      if (before.text === o.text) continue;
      const patch: OptionPatch = {
        question_key: a.question_key,
        domain_id: a.domain_id,
        option_key: o.key,
        old_text: before.text,
        new_text: o.text,
        before_chars: before.text.trim().length,
        after_chars: o.text.trim().length,
        triage: out.status === 'lengthened'
          ? { verdict: out.triage.verdict, severity: out.triage.severity, detail: out.triage.concerns[0]?.detail ?? null }
          : { verdict: 'not_needed', severity: null, detail: null },
      };
      process.stdout.write(`${JSON.stringify(patch)}\n`);
      emitted += 1;
    }
    patched += 1;
    const note = out.status === 'lengthened' && out.triage.verdict === 'needs_human' ? `  [triage ${out.triage.severity}]` : '';
    err(`${a.question_key.padEnd(14)} ${out.status}${out.status === 'lengthened' ? ` ${out.plan.target} ${out.before} -> ${out.after} chars` : ''}${note}`);
  }

  err('');
  err(`multi-select: ${multi} skipped`);
  err(`not longest : ${notLongest} already fine`);
  err(`kept        : ${kept} keep the key longest by hash (one in three)`);
  if (skip > 0) err(`skipped     : ${skipped}`);
  err(`planned     : ${planned}`);
  if (write) {
    err(`patched     : ${patched} item(s), ${emitted} option(s) written`);
    err(`refused     : ${refused}`);
    err(`discarded   : ${discarded}`);
    // The number to hand `--skip` if this run has to be continued.
    err(`resume with : --skip ${skip + processed}`);
  }
}

if (require.main === module) main().catch((e) => {
  console.error('planAuthoredOptionLengths failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
