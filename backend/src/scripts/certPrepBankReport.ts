/**
 * certPrepBankReport — what the bank looks like as a measurement rather than an
 * intention: coverage per domain and objective, difficulty spread, and the
 * length cue that a first pass at authoring almost always leaves behind.
 *
 * THE LENGTH CUE IS THE INTERESTING ONE. An author explains the right answer and
 * asserts the wrong ones, so the correct option ends up longest and a student
 * can score well by picking the longest option without knowing anything. It is
 * invisible to the author and obvious to arithmetic, which is why it is measured
 * here and asserted in `bankShape.test.ts` rather than left to review.
 */
import { CCAR_F_ALL_ITEMS, MOCK_DEMAND } from '../data/certBlueprints/items';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../data/certBlueprints/ccarFoundations';

const rows = CCAR_F_ALL_ITEMS.map((i) => {
  const correct = i.options.filter((o) => i.correct_keys.includes(o.key));
  const wrong = i.options.filter((o) => !i.correct_keys.includes(o.key));
  const cMax = Math.max(...correct.map((o) => o.text.length));
  const wMax = Math.max(...wrong.map((o) => o.text.length));
  return { key: i.question_key, domain: i.domain_id, cMax, wMax, gap: cMax - wMax };
});

const offenders = rows.filter((r) => r.gap > 0).sort((a, b) => b.gap - a.gap);

console.log(`items: ${CCAR_F_ALL_ITEMS.length}`);
console.log('\nby domain (have / mock demand):');
for (const [d, need] of Object.entries(MOCK_DEMAND)) {
  const have = CCAR_F_ALL_ITEMS.filter((i) => i.domain_id === d).length;
  console.log(`  ${d}  ${String(have).padStart(3)} / ${need}${have < need ? '   SHORT' : ''}`);
}

console.log('\nobjective coverage:');
for (const d of CCAR_FOUNDATIONS_BLUEPRINT.domains) {
  for (const o of d.objectives) {
    const n = CCAR_F_ALL_ITEMS.filter((i) => i.objective_id === o.objective_id).length;
    if (n === 0) console.log(`  ${o.objective_id}  NONE`);
  }
}

const byDiff: Record<string, number> = {};
for (const i of CCAR_F_ALL_ITEMS) byDiff[i.difficulty ?? 'unset'] = (byDiff[i.difficulty ?? 'unset'] ?? 0) + 1;
console.log('\ndifficulty:', JSON.stringify(byDiff));

console.log(`\nlength cue: the correct option is the longest in ${offenders.length} of ${rows.length} items `
  + `(${Math.round((offenders.length / rows.length) * 100)}%)`);
console.log(`  gap > 40 chars: ${offenders.filter((r) => r.gap > 40).length}`);
console.log(`  gap > 20 chars: ${offenders.filter((r) => r.gap > 20).length}`);
console.log('\nworst offenders:');
for (const r of offenders.slice(0, Number(process.argv[2] ?? 30))) {
  console.log(`  ${r.key.padEnd(14)} ${r.domain}  correct ${String(r.cMax).padStart(3)}  longest-wrong ${String(r.wMax).padStart(3)}  +${r.gap}`);
}
