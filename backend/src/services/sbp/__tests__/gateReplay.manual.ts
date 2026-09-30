/**
 * Replay every plan production has ever generated through the CURRENT gate.
 *
 * Not a unit test — a measurement harness, run by hand before shipping a change
 * that makes the gate stricter. Reviving six dead rules (see planGateRegexes)
 * raises the bar for every future build, and "it should be fine" is not a
 * number. This prints the number.
 *
 *   node -r ts-node/register src/services/sbp/__tests__/gateReplay.manual.ts <plans.json>
 *
 * where plans.json is `select project_id, version, gate_ok, plan_json from build_plans`.
 */
import { readFileSync } from 'fs';
import { gatePlan } from '../planGate';
import { BuildPlan } from '../planContract';

interface Row { project_id: string; version: number; gate_ok: boolean; plan_json: unknown }

const rows: Row[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));

let sameOk = 0, sameFail = 0, newlyFailing = 0, newlyPassing = 0;
const newRules = new Map<string, number>();

for (const row of rows) {
  const plan = (typeof row.plan_json === 'string' ? JSON.parse(row.plan_json) : row.plan_json) as BuildPlan;
  // No sourceText: the invented-vendor rule needs the original brief, which is
  // not stored on the plan. Omitting it is the conservative choice — it can only
  // under-report, never invent a regression that is not there.
  const now = gatePlan(plan);

  const was = row.gate_ok;
  if (was && now.ok) sameOk += 1;
  else if (!was && !now.ok) sameFail += 1;
  else if (was && !now.ok) {
    newlyFailing += 1;
    for (const v of now.violations) newRules.set(v.rule, (newRules.get(v.rule) ?? 0) + 1);
  } else newlyPassing += 1;

  const verdict = was === now.ok ? '   ' : (was ? '>>>' : ' ^ ');
  console.log(
    `${verdict} ${row.project_id.slice(0, 8)} v${row.version}  stored=${was ? 'PASS' : 'FAIL'}  now=${now.ok ? 'PASS' : 'FAIL'}` +
    `  ${now.violations.length ? now.violations.map((v) => v.rule).join(', ') : ''}`,
  );
}

console.log(`\n${rows.length} plans replayed`);
console.log(`  unchanged pass : ${sameOk}`);
console.log(`  unchanged fail : ${sameFail}`);
console.log(`  NEWLY FAILING  : ${newlyFailing}   <- the cost of the stricter gate`);
console.log(`  newly passing  : ${newlyPassing}`);
if (newRules.size) {
  console.log('\n  rules firing on the newly-failing plans:');
  [...newRules.entries()].sort((a, b) => b[1] - a[1]).forEach(([r, n]) => console.log(`    ${r}: ${n}`));
}
