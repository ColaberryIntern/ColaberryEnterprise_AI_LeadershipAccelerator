/**
 * scoreCertQuestionRubric — measure every CCAR-F item against the published
 * reference and say, per question, what to change first.
 *
 * READ-ONLY. It writes nothing, sends nothing and approves nothing. There is no
 * `--write` because there is nothing to persist: the score is a pure function of
 * the question, so it can be recomputed at any time and storing it would only
 * create a copy that can go stale.
 *
 * WHY THIS EXISTS ALONGSIDE THE ADVERSARIAL TRIAGE. That one asks a model
 * whether an item is defensible, and answers differently on different days. This
 * counts words and matches documented patterns against Anthropic's own 12
 * published samples, and answers identically forever. They measure different
 * things: the triage asks "is this item sound?", the rubric asks "does this item
 * look like the exam?" — and only the second tells you what to edit.
 *
 * Usage:
 *   node dist/scripts/scoreCertQuestionRubric.js              # summary + worst items
 *   node dist/scripts/scoreCertQuestionRubric.js --all        # every question
 *   node dist/scripts/scoreCertQuestionRubric.js --domain D2
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { LATEST_REVISION_SQL, ReviewRow } from './sendCertQuestionReview';
import { scoreItem, summariseBank, RubricScore } from '../services/certPrep/certQuestionRubric';
import { RUBRIC } from '../data/certBlueprints/ccarRubric';

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const domIdx = args.indexOf('--domain');
const onlyDomain = domIdx >= 0 ? args[domIdx + 1] : null;

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  console.log(`database : ${db}`);
  console.log('rubric   : measured from Anthropic\'s 12 published CCAR-F samples');
  console.log('');

  const rows = await sequelize.query<ReviewRow>(LATEST_REVISION_SQL, { type: QueryTypes.SELECT });
  const items = rows
    .filter((r) => !onlyDomain || r.domain_id === onlyDomain)
    .map((r) => ({
      question_key: r.question_key,
      domain_id: r.domain_id,
      objective_id: r.objective_id,
      stem: r.stem,
      options: r.options,
      correct_keys: r.correct_keys,
      rationale: r.rationale,
      distractor_rationales: r.distractor_rationales,
    }));

  if (items.length === 0) throw new Error('no questions found');

  const scores = items.map(scoreItem);
  const summary = summariseBank(scores, items);

  console.log(`scored   : ${summary.scored} question(s)`);
  console.log('');
  console.log('  dimension                          meets      of');
  for (const spec of RUBRIC) {
    const n = summary.byDimension[spec.id] ?? 0;
    const pct = Math.round((100 * n) / summary.scored);
    console.log(`  ${spec.label.padEnd(34)} ${String(n).padStart(4)}  ${String(pct).padStart(3)}%`);
  }

  console.log('');
  console.log(`  meets all six                      ${String(summary.fullyMeets).padStart(4)}  ${String(Math.round(100 * summary.fullyMeets / summary.scored)).padStart(3)}%`);
  console.log('');
  console.log(`  median stem   : ${summary.medianStemWords} words   (reference 46, range 32-88)`);
  console.log(`  median option : ${summary.medianOptionWords} words   (reference 17, range 7-35)`);
  console.log(`  scenario-framed: ${Math.round(100 * summary.scenarioFramingRate)}%   (reference 100%)`);

  // Per domain, so a rewrite can be scheduled a domain at a time.
  const byDomain = new Map<string, RubricScore[]>();
  for (const s of scores) {
    const list = byDomain.get(s.domain_id) ?? [];
    list.push(s);
    byDomain.set(s.domain_id, list);
  }
  console.log('');
  console.log('  by domain        n   meets all   median met');
  for (const d of [...byDomain.keys()].sort()) {
    const list = byDomain.get(d)!;
    const full = list.filter((s) => s.met === s.of).length;
    const medMet = [...list].map((s) => s.met).sort((a, b) => a - b)[Math.floor(list.length / 2)];
    console.log(`  ${d.padEnd(14)} ${String(list.length).padStart(3)}   ${String(full).padStart(9)}   ${String(medMet).padStart(10)}`);
  }

  const shown = showAll ? scores : scores.filter((s) => s.met <= 3);
  console.log('');
  console.log(showAll
    ? `every question, ${scores.length}:`
    : `the ${shown.length} weakest (3 or fewer of 6 dimensions met):`);
  console.log('');
  for (const s of shown.sort((a, b) => a.met - b.met || a.question_key.localeCompare(b.question_key))) {
    console.log(`  ${s.question_key.padEnd(16)} ${s.met}/${s.of}  ${s.firstFix ? s.firstFix.slice(0, 88) : 'meets every dimension'}`);
  }

  console.log('');
  console.log('This measures RESEMBLANCE to the published exam, not correctness. A short');
  console.log('definitional question can be perfectly true and still prepare a student for');
  console.log('a differently shaped exam. Nothing here was approved or changed.');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('FAILED:', err?.message ?? err); process.exit(1); })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
