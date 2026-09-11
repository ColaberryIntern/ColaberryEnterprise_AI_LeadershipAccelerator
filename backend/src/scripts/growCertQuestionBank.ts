/**
 * growCertQuestionBank — write new questions for chosen categories, hold them to
 * the rubric, and land them as drafts.
 *
 * WHY MORE QUESTIONS. A 60-item mock draws a fixed number from each domain, so
 * the number of genuinely different mocks a student can sit is the smallest of
 * bank/demand across the five domains. At 150 items that number is TWO. A student
 * sitting a third mock starts seeing questions they have already answered, which
 * stops measuring readiness and starts measuring recall. 300 items gives five.
 *
 * WHAT IT DOES, PER QUESTION:
 *   generate for (objective, scenario, difficulty)
 *     -> score against the rubric
 *     -> below its ceiling? improve, re-score, keep only if strictly better
 *     -> at its ceiling? write it as a DRAFT
 *     -> still short after the rounds? discard it and say so
 *
 * IT DISCARDS RATHER THAN LOWERING THE BAR. A generated item that cannot reach
 * its ceiling is thrown away, not written as a weaker draft. The bank already
 * holds 150 items at ceiling; adding worse ones to hit a number would make the
 * average worse and the count better, which is the wrong trade in a question
 * bank that exists to measure people.
 *
 * IT APPROVES NOTHING. Same as the sweep: `--approve-as` is a separate flag that
 * records a named person. A generated question has had no human read it at all,
 * which is a stronger reason for the gate rather than a weaker one.
 *
 * TWO GATES, NOT ONE. The first live batch produced questions that scored 6/6 and
 * read as mediocre: an unmeasured observation, options at the seven-word floor,
 * a "disable the feature" distractor nobody would pick, and a key that fixed a
 * failed call when the stem described an inaccurate one. The rubric measures
 * SHAPE and the model found the cheapest shape that passes. So after the shape
 * gate, every candidate goes through `triageQuestion` - the adversarial reviewer
 * that argues against the marked answer - and a high-severity concern discards
 * it. Lower-severity concerns are logged beside the draft for the human who
 * reads it; the triage script can persist them afterwards.
 *
 * Usage (inside the backend container):
 *   node dist/scripts/growCertQuestionBank.js --plan
 *   node dist/scripts/growCertQuestionBank.js --objective D5.5 --count 3
 *   node dist/scripts/growCertQuestionBank.js --objective D5.5 --count 3 --write
 *   node dist/scripts/growCertQuestionBank.js --scenario S5 --count 10 --write
 *   node dist/scripts/growCertQuestionBank.js --to 300 --write     (the whole plan)
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { scoreItem } from '../services/certPrep/certQuestionRubric';
import {
  generateItem, improveItem, achievableScore, ImproverItem,
} from '../services/certPrep/certQuestionImprover';
import { createDraftRevision } from '../services/certPrep/certQuestionBankService';
import { triageQuestion } from '../services/certPrep/certQuestionTriage';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../data/certBlueprints/ccarFoundations';
import { MOCK_DEMAND } from '../data/certBlueprints/items';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string): string | null => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] ?? null : null;
};

const write = has('--write');
const planOnly = has('--plan');
const onlyObjective = val('--objective');
const onlyScenario = val('--scenario');
const count = Number(val('--count') ?? '0');
const targetTotal = Number(val('--to') ?? '0');
/** A form is 60 items, so a bank size is only meaningful in whole mocks. */
const target = targetTotal ? Math.max(1, Math.round(targetTotal / 60)) : 0;
const MAX_ROUNDS = Number(val('--max-rounds') ?? '2');

const BP = CCAR_FOUNDATIONS_BLUEPRINT;
const log = (line: string): void => { console.log(line); };

/** Difficulty spread, so a batch is not uniformly medium. */
const DIFFICULTIES: Array<'easy' | 'medium' | 'hard'> = ['medium', 'hard', 'medium', 'easy', 'hard'];

interface Existing { question_key: string; domain_id: string; objective_id: string; stem: string; scenario_family: string | null }

/**
 * How many questions each domain needs so a student can sit N different mocks.
 *
 * ALLOCATED BY MOCK DEMAND, NOT BY BLUEPRINT WEIGHT — and the difference is not
 * cosmetic. D2 is 18% of the exam, which is 10.8 of 60 items and therefore 11 in
 * practice. Allocating 300 questions by weight gives D2 fifty-four; five mocks
 * need fifty-five. The bank would have been the right size, correctly
 * proportioned, and one question short of the thing it was sized for.
 *
 * That was the original recommendation until a test computed the mock count from
 * the plan instead of trusting the proportions. Demand is what a form actually
 * draws, so demand is what the plan counts in.
 *
 * Exported and pure so it can be tested without a database.
 */
export function growthPlan(
  have: Record<string, number>,
  targetMocks: number,
): { domain_id: string; have: number; want: number; add: number }[] {
  return BP.domains.map((d) => {
    const want = (MOCK_DEMAND[d.domain_id] ?? 0) * targetMocks;
    const h = have[d.domain_id] ?? 0;
    return { domain_id: d.domain_id, have: h, want, add: Math.max(0, want - h) };
  });
}

/** Mocks a bank supports: the SMALLEST domain division, not the average. */
export function nonOverlappingMocks(have: Record<string, number>): number {
  return Math.min(...Object.entries(MOCK_DEMAND).map(([d, need]) => Math.floor((have[d] ?? 0) / need)));
}

/** Next free key for an objective, e.g. CCARF-D5-22. */
function nextKey(domainId: string, taken: Set<string>): string {
  const prefix = `CCARF-${domainId}-`;
  let n = 1;
  while (taken.has(`${prefix}${String(n).padStart(2, '0')}`)) n += 1;
  const key = `${prefix}${String(n).padStart(2, '0')}`;
  taken.add(key);
  return key;
}

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  log(`database    : ${db}`);
  log(`mode        : ${write ? 'WRITE — new drafts will be created' : 'DRY RUN — nothing will be written'}`);
  log('');

  const rows = await sequelize.query<Existing>(
    `SELECT DISTINCT ON (r.question_key)
            r.question_key, r.domain_id, r.objective_id, r.stem, q.scenario_family
       FROM cert_question_revisions r
       JOIN cert_questions q ON q.question_key = r.question_key
      WHERE q.is_retired = false
      ORDER BY r.question_key, r.revision DESC`,
    { type: QueryTypes.SELECT },
  );

  const byDomain: Record<string, number> = {};
  const byObjective: Record<string, Existing[]> = {};
  const taken = new Set<string>();
  for (const r of rows) {
    byDomain[r.domain_id] = (byDomain[r.domain_id] ?? 0) + 1;
    (byObjective[r.objective_id] ??= []).push(r);
    taken.add(r.question_key);
  }

  log(`bank        : ${rows.length} question(s), supporting ${nonOverlappingMocks(byDomain)} non-overlapping mock(s)`);
  log('');

  if (planOnly || (!onlyObjective && !onlyScenario && !target)) {
    const mocks = target || 5;
    const plan = growthPlan(byDomain, mocks);
    log(`PLAN for ${mocks} non-overlapping mock(s) — ${mocks * 60} questions:`);
    for (const p of plan) {
      log(`  ${p.domain_id}  have ${String(p.have).padStart(3)}  want ${String(p.want).padStart(3)}  add ${String(p.add).padStart(3)}`);
    }
    log('');
    log('Thinnest objectives (fewest questions):');
    const thin = Object.entries(byObjective).sort((a, b) => a[1].length - b[1].length).slice(0, 6);
    for (const [obj, list] of thin) log(`  ${obj}  ${list.length}`);
    if (planOnly) return;
  }

  // Build the work list: which (objective, scenario) pairs to write for.
  const objectives = BP.domains.flatMap((d) =>
    d.objectives.map((o) => ({ domain: d, objective: o })));

  let work: { domain: any; objective: any; scenario: any; difficulty: 'easy' | 'medium' | 'hard' }[] = [];

  // How many questions each scenario holds, kept current as the run writes, so
  // twenty-five picks in one chunk spread out rather than all landing on the
  // scenario that was thinnest at the start.
  const byScenario: Record<string, number> = {};
  for (const r of rows) byScenario[r.scenario_family ?? ''] = (byScenario[r.scenario_family ?? ''] ?? 0) + 1;

  const pickScenario = (domainId: string, override: string | null) => {
    if (override) return BP.scenarios.find((s) => s.scenario_id === override) ?? BP.scenarios[0];
    // Prefer a scenario that names this domain as primary, so the setting fits
    // the skill rather than being decorative — and among those, the one with the
    // FEWEST questions. The first chunk of the scaled run wrote 25 D1 items and
    // every one was S1, because this picked the first fit rather than the
    // thinnest. The exam draws four scenarios of six at random; a student who
    // lands the thin one is measured against a shallower pool, and the plan was
    // making that worse with every question it added.
    const fits = BP.scenarios.filter((s) => s.primary_domains.includes(domainId));
    const pool = fits.length > 0 ? fits : BP.scenarios;
    const pick = pool.reduce((best, s) =>
      ((byScenario[s.scenario_id] ?? 0) < (byScenario[best.scenario_id] ?? 0) ? s : best));
    byScenario[pick.scenario_id] = (byScenario[pick.scenario_id] ?? 0) + 1;
    return pick;
  };

  if (onlyObjective) {
    const found = objectives.find((x) => x.objective.objective_id === onlyObjective);
    if (!found) { log(`No such objective: ${onlyObjective}`); process.exitCode = 1; return; }
    for (let i = 0; i < (count || 1); i += 1) {
      work.push({
        domain: found.domain,
        objective: found.objective,
        scenario: pickScenario(found.domain.domain_id, onlyScenario),
        difficulty: DIFFICULTIES[i % DIFFICULTIES.length],
      });
    }
  } else if (onlyScenario) {
    const scen = BP.scenarios.find((s) => s.scenario_id === onlyScenario);
    if (!scen) { log(`No such scenario: ${onlyScenario}`); process.exitCode = 1; return; }
    // Spread across the objectives of the domains this scenario is built for.
    const pool = objectives.filter((x) => scen.primary_domains.includes(x.domain.domain_id));
    for (let i = 0; i < (count || 1); i += 1) {
      const pick = pool[i % pool.length];
      work.push({ domain: pick.domain, objective: pick.objective, scenario: scen, difficulty: DIFFICULTIES[i % DIFFICULTIES.length] });
    }
  } else if (target) {
    // Fill toward the target, thinnest objective first, staying inside each
    // domain's share so the bank keeps the blueprint's shape.
    const plan = growthPlan(byDomain, target);
    for (const p of plan) {
      const objs = objectives.filter((x) => x.domain.domain_id === p.domain_id)
        .sort((a, b) => (byObjective[a.objective.objective_id]?.length ?? 0)
          - (byObjective[b.objective.objective_id]?.length ?? 0));
      for (let i = 0; i < p.add; i += 1) {
        const pick = objs[i % objs.length];
        work.push({
          domain: pick.domain,
          objective: pick.objective,
          scenario: pickScenario(p.domain_id, null),
          difficulty: DIFFICULTIES[i % DIFFICULTIES.length],
        });
      }
    }
  }

  if (count && work.length > count) work = work.slice(0, count);
  log(`writing     : ${work.length} question(s)`);
  log('');

  let made = 0; let discarded = 0; let failed = 0;

  for (const w of work) {
    const key = nextKey(w.domain.domain_id, taken);
    const avoid = (byObjective[w.objective.objective_id] ?? []).map((e) => e.stem.slice(0, 120));

    const gen = await generateItem({
      question_key: key,
      domain_id: w.domain.domain_id,
      domain_label: w.domain.label,
      objective_id: w.objective.objective_id,
      objective_label: w.objective.label,
      scenario_id: w.scenario.scenario_id,
      scenario_label: w.scenario.label,
      scenario_summary: w.scenario.summary,
      difficulty: w.difficulty,
      avoidStems: avoid.slice(0, 8),
    });

    if (gen.status !== 'generated') {
      failed += 1;
      log(`${key.padEnd(14)} FAILED  ${gen.status === 'failed' ? `${gen.error_class}: ${gen.message}` : gen.reason}`);
      continue;
    }

    let item: ImproverItem = gen.item;
    let score = gen.score;
    const ceiling = achievableScore(item, score.of);

    for (let r = 0; r < MAX_ROUNDS && score.met < ceiling; r += 1) {
      const out = await improveItem(item);
      if (out.status !== 'improved') break;
      item = out.item;
      score = out.after;
    }

    if (score.met < ceiling) {
      // Discarded, not written weaker. See the header: a bank that grows by
      // adding worse items has a better count and a worse average.
      //
      // Say WHICH dimension missed. The first run reported two discards at 5/6
      // and nothing else, which made it impossible to tell whether the prompt
      // was failing on framing, length, or rationales - three different fixes.
      const missed = score.dimensions.filter((x) => x.verdict !== 'meets').map((x) => x.id).join(', ');
      discarded += 1;
      log(`${key.padEnd(14)} ${score.met}/${score.of}  DISCARDED (below ceiling ${ceiling}: ${missed})`);
      continue;
    }

    // Second gate: is the answer defensible? The rubric cannot tell, and the
    // first batch proved the model will satisfy the rubric with a question whose
    // key does not follow from its own stem.
    const triage = await triageQuestion({
      question_key: key,
      stem: item.stem,
      options: item.options,
      correct_keys: item.correct_keys,
      rationale: item.rationale,
      distractor_rationales: item.distractor_rationales,
      domain_id: w.domain.domain_id,
      objective_id: w.objective.objective_id,
    });
    if (triage.verdict === 'error') {
      // A reviewer that could not read the item is not a pass. Treated as a
      // discard rather than a write, because "unreviewed" and "reviewed clean"
      // must never look the same downstream.
      discarded += 1;
      log(`${key.padEnd(14)} ${score.met}/${score.of}  DISCARDED (triage error: ${triage.errorClass ?? 'unknown'})`);
      continue;
    }
    if (triage.verdict === 'needs_human' && triage.severity === 'high') {
      discarded += 1;
      const why = triage.concerns[0]?.detail?.slice(0, 90) ?? 'unspecified';
      log(`${key.padEnd(14)} ${score.met}/${score.of}  DISCARDED (triage high: ${why})`);
      continue;
    }
    const triageNote = triage.verdict === 'needs_human'
      ? `  [triage ${triage.severity}: ${triage.concerns[0]?.detail?.slice(0, 70) ?? ''}]`
      : '';

    if (write) {
      await createDraftRevision({
        question_key: key,
        track_id: BP.track_id,
        blueprint_version: BP.blueprint_version,
        domain_id: w.domain.domain_id,
        objective_id: w.objective.objective_id,
        scenario_family: w.scenario.scenario_id,
        stem: item.stem,
        options: item.options,
        correct_keys: item.correct_keys,
        select_count: item.correct_keys.length,
        rationale: item.rationale as string,
        distractor_rationales: item.distractor_rationales ?? undefined,
        difficulty: w.difficulty,
        author: 'colaberry',
      });
    }
    made += 1;
    log(`${key.padEnd(14)} ${score.met}/${score.of}  ${w.objective.objective_id} · ${w.scenario.scenario_id} · ${w.difficulty}`
      + `  ${write ? 'draft written' : 'would write'}${triageNote}`);
  }

  log('');
  log(`RESULT: ${made} written, ${discarded} discarded below ceiling, ${failed} failed`);
  if (made > 0 && write) {
    log('All new items are DRAFTS. Nothing reaches a student until a named human approves them.');
  }
}

/** Let instrumentation finish before the connection goes; see the sweep script. */
const settleTelemetry = (): Promise<void> => new Promise((r) => { setTimeout(r, 2000); });

main()
  .then(settleTelemetry)
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('growCertQuestionBank failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    await sequelize.close().catch(() => undefined);
  });
