/**
 * exportGeneratedCertItems — write the generated half of the bank back into the
 * repo as `data/certBlueprints/items/generated.ts`.
 *
 * WHY. Generated items are born in the database. Until they are exported, the
 * drift check reports them as EXTRA, the CI rubric floor does not cover them,
 * and a lost database takes them with it. This makes the repo the source of
 * truth for all of them, which every downstream check already assumes.
 *
 * WHAT COUNTS AS GENERATED: any live, approved question whose key is not in
 * `HAND_AUTHORED_ITEMS`. The set of authored keys is the per-domain files, not
 * `CCAR_F_ALL_ITEMS`, because the latter includes the previous export and would
 * classify every generated item as authored.
 *
 * AS STORED, NOT THROUGH `item()`. The factory re-derives the answer position
 * from the key; for an item that already exists that would change the stored
 * content and register as drift against the database it came from.
 *
 * READ-ONLY. Prints the TypeScript module to stdout; redirect it into the file:
 *   node dist/scripts/exportGeneratedCertItems.js > src/data/certBlueprints/items/generated.ts
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { HAND_AUTHORED_ITEMS } from '../data/certBlueprints/items';

interface Row {
  question_key: string;
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
}

const s = (v: unknown): string => JSON.stringify(v);

/** One item as a TypeScript object literal. Exported so the shape is testable. */
export function emitItem(r: Row): string {
  const opts = r.options.map((o) => `      { key: ${s(o.key)}, text: ${s(o.text)} }`).join(',\n');
  const dr = Object.entries(r.distractor_rationales ?? {}).map(([k, v]) => `      ${s(k)}: ${s(v)}`).join(',\n');
  return [
    '  {',
    `    question_key: ${s(r.question_key)},`,
    `    track_id: ${s(r.track_id)},`,
    `    blueprint_version: ${s(r.blueprint_version)},`,
    `    domain_id: ${s(r.domain_id)},`,
    `    objective_id: ${s(r.objective_id)},`,
    `    scenario_family: ${s(r.scenario_family)},`,
    `    stem: ${s(r.stem)},`,
    '    options: [',
    opts + ',',
    '    ],',
    `    correct_keys: ${s(r.correct_keys)},`,
    `    select_count: ${r.select_count ?? r.correct_keys.length},`,
    `    rationale: ${s(r.rationale)},`,
    '    distractor_rationales: {',
    dr + (dr ? ',' : ''),
    '    },',
    `    difficulty: ${s(r.difficulty)},`,
    "    author: 'colaberry',",
    '  }',
  ].join('\n');
}

export function emitModule(rows: Row[], exportedOn: string): string {
  const sorted = [...rows].sort((a, b) => a.question_key.localeCompare(b.question_key));
  const header = `import type { DraftRevisionInput } from '../../../services/certPrep/certQuestionBankService';

/**
 * The generated half of the bank — ${sorted.length} items written by
 * \`growCertQuestionBank\`, held to the rubric and the adversarial triage gate,
 * approved by a named reviewer, rebalanced through the same answer-position
 * hash as the authored half, and passed through \`balanceCertOptionLengths\` so
 * the longest option is not usually the answer.
 *
 * WRITTEN OUT AS STORED, NOT BUILT THROUGH \`item()\`. The factory assigns each
 * answer's position from a hash of the question key, which is right for an
 * item authored by hand and wrong for one that already exists: re-deriving the
 * position would change the stored content and register as drift against the
 * database it came from. Option order here is the order a student was approved
 * to be served.
 *
 * PROVENANCE. Generated under Colaberry's own process against the published
 * blueprint, from the objective and scenario definitions in this directory.
 * None derives from any third-party question bank.
 *
 * DO NOT EDIT BY HAND. Exported from the database on ${exportedOn} by
 * \`exportGeneratedCertItems.ts\`; regenerate with the same script so this file
 * and the bank cannot disagree.
 */
export const GENERATED_ITEMS: DraftRevisionInput[] = [
`;
  return header + sorted.map(emitItem).join(',\n') + ',\n];\n';
}

async function main(): Promise<void> {
  const authored = new Set(HAND_AUTHORED_ITEMS.map((i) => i.question_key));
  const rows = await sequelize.query<Row>(
    `SELECT DISTINCT ON (r.question_key)
            r.question_key, q.track_id, r.blueprint_version, r.domain_id, r.objective_id,
            q.scenario_family, r.difficulty, r.stem, r.options, r.correct_keys, r.select_count,
            r.rationale, r.distractor_rationales
       FROM cert_question_revisions r
       JOIN cert_questions q ON q.question_key = r.question_key
      WHERE q.is_retired = false AND r.review_status = 'approved'
      ORDER BY r.question_key, r.revision DESC`,
    { type: QueryTypes.SELECT },
  );
  const generated = rows.filter((r) => !authored.has(r.question_key));
  process.stdout.write(emitModule(generated, new Date().toISOString().slice(0, 10)));
  // Counts go to stderr so stdout stays a clean module.
  console.error(`exported ${generated.length} generated item(s); ${rows.length - generated.length} authored skipped`);
}

if (require.main === module) main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('exportGeneratedCertItems failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    await sequelize.close().catch(() => undefined);
  });
