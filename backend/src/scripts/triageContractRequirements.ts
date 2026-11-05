/**
 * Triage a delivery project's extracted requirements: which are obligations on us, and which
 * are the buyer describing its own process?
 *
 * READ-ONLY BY CONSTRUCTION. There is no `EXECUTE` path in this file at all. Not a flag that
 * defaults off — no write code exists, so there is nothing to misfire at 3am. Triage is advisory
 * until a human confirms it; `ContractRequirement` already carries `interpretation` and
 * `human_confirmed` for that, and filling them is a separate, authorised act.
 *
 * WHY THIS EXISTS. `contract_requirements` can say what KIND a row is but has no way to say
 * "this row is not a requirement at all". So 56 extracted sentences become 56 requirements, and
 * SOURCE_COVERAGE then demands a task cite every one — including the ones that impose nothing on
 * anybody. This prints the split so a person can see which rows belong in a compliance matrix
 * before a decomposition is built on top of them.
 *
 * Run (inside the backend container):
 *   docker exec -w /app -e PROJECT=<delivery_project_id> accelerator-backend \
 *     node dist/scripts/triageContractRequirements.js
 */
import { sequelize } from '../config/database';
import { triageStatement, tallyTriage, type TriageResult } from '../services/factory/proposal/requirementTriage';

interface Row { canonical_req_id: string; statement: string }

const WIDTH = 96;

/** Render one line of the table, clipped so a long statement cannot wrap the report into noise. */
export function renderRow(reqId: string, r: TriageResult, statement: string): string {
  const flag = r.triageClass === 'obligation' ? ' ' : '*';
  const clipped = statement.length > WIDTH ? `${statement.slice(0, WIDTH - 1)}…` : statement;
  return `${flag} ${reqId.padEnd(8)} ${r.triageClass.padEnd(13)} ${r.kind.padEnd(15)} ${r.priority.padEnd(7)} ${clipped}`;
}

export function renderReport(projectId: string, rows: readonly Row[], results: readonly TriageResult[]): string {
  const tally = tallyTriage(results);
  const out: string[] = [
    '',
    `=== Requirement triage: ${projectId} ===`,
    `  rows            : ${tally.total}`,
    `  BINDING on us   : ${tally.binding}`,
    `  buyer's process : ${tally.byClass.city_process}`,
    `  questions / Q&A : ${tally.byClass.question}`,
    `  notes           : ${tally.byClass.note}`,
    '',
    `  kinds           : ${Object.entries(tally.byKind).map(([k, n]) => `${k}=${n}`).join('  ') || '(none)'}`,
    `  single-valued   : ${tally.singleValued ? 'YES - this is the defect, the kind field carries no signal' : 'no'}`,
    '',
    '  (* = not an obligation on us; it should not be driving a compliance task)',
    '',
  ];
  rows.forEach((row, i) => out.push(renderRow(row.canonical_req_id, results[i], row.statement)));
  out.push('');
  const notBinding = tally.total - tally.binding;
  out.push(`  ${notBinding} of ${tally.total} rows bind nobody. Each one the coverage gate still demands a task cite.`);
  out.push('');
  return out.join('\n');
}

async function main(): Promise<void> {
  const projectId = process.env.PROJECT;
  if (!projectId) {
    console.error('REFUSED: set PROJECT=<delivery_project_id>.');
    process.exitCode = 1;
    return;
  }

  // Read-only transaction, belt and braces: the statement below is a SELECT, and the session
  // could not write even if it were not.
  const rows = (await sequelize.query(
    `select canonical_req_id, coalesce(statement, '') as statement
       from public.contract_requirements
      where delivery_project_id = :p
      order by canonical_req_id`,
    { replacements: { p: projectId }, type: 'SELECT' as never },
  )) as unknown as Row[];

  if (!rows.length) {
    console.log(`\nNo requirements for ${projectId}. Nothing to triage.\n`);
    return;
  }

  const results = rows.map((r) => triageStatement(r.statement));
  console.log(renderReport(projectId, rows, results));
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('FAILED:', e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}
