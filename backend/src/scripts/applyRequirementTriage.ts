/**
 * Apply the requirement triage to one delivery project's stored rows.
 *
 * PREFLIGHT BY DEFAULT. Prints exactly what would change and writes nothing until EXECUTE=1.
 *
 * ## Why this exists
 *
 * `requirementTriage` can tell an obligation from a sentence describing the buyer's own
 * procedure, but until that verdict reaches the stored row it changes nothing: every
 * decomposition re-reads `contract_requirements` and rebuilds the City's procedure as our task
 * list. That is not hypothetical. The Herriman decomposition generated on 5 Nov 2026 produced
 * seven tasks, three of which -- Review Proposals, Select Proposal, Negotiate Agreement -- are
 * the City's job, because the rows describing them are stored as `compliance/must` like
 * everything else.
 *
 * ## What it refuses to do
 *
 *  - It never touches a row with `human_confirmed = true`. A person who looked at the row and
 *    agreed outranks the classifier, and overwriting that silently is the difference between a
 *    helpful backfill and a destructive one.
 *  - It never SETS `human_confirmed`. The verdict lands in `interpretation` as a proposal
 *    awaiting confirmation. A machine marking its own output as human-confirmed is the
 *    self-certification failure this codebase keeps guarding against.
 *  - It is scoped to ONE project by required env var. There is no "all projects" mode, because
 *    the first use of such a mode would be the 864-row backfill nobody has authorised.
 *
 * Idempotent: a second run reports every row as already correct and writes nothing.
 *
 * Run (inside the backend container):
 *   docker exec -w /app -e PROJECT=<id> accelerator-backend node dist/scripts/applyRequirementTriage.js
 *   docker exec -w /app -e PROJECT=<id> -e EXECUTE=1 accelerator-backend node dist/scripts/applyRequirementTriage.js
 */
import { sequelize } from '../config/database';
import { planTriageBackfill, renderTriagePlan, type TriagePlanRow } from './lib/requirementTriagePlan';

interface Row {
  id: string;
  canonical_req_id: string;
  statement: string | null;
  kind: string | null;
  priority: string | null;
  interpretation: string | null;
  human_confirmed: boolean | null;
}

async function main(): Promise<void> {
  const projectId = process.env.PROJECT;
  const execute = process.env.EXECUTE === '1';
  if (!projectId) {
    console.error('REFUSED: set PROJECT=<delivery_project_id>. There is no all-projects mode.');
    process.exitCode = 1;
    return;
  }

  const { default: ContractRequirement } = await import('../models/ContractRequirement');

  const found = await ContractRequirement.findAll({
    where: { delivery_project_id: projectId },
    order: [['canonical_req_id', 'ASC']],
  });
  const rows = found.map((m) => m.get({ plain: true })) as unknown as Row[];

  if (!rows.length) {
    console.log(`\nNo requirements for ${projectId}. Nothing to do.\n`);
    return;
  }

  const planRows: TriagePlanRow[] = rows.map((r) => ({
    id: r.id,
    canonicalReqId: r.canonical_req_id,
    statement: r.statement ?? '',
    kind: r.kind,
    priority: r.priority,
    interpretation: r.interpretation,
    humanConfirmed: r.human_confirmed === true,
  }));

  const plan = planTriageBackfill(planRows);
  console.log(renderTriagePlan(projectId, plan, execute));

  if (!execute || !plan.changes.length) return;

  // One transaction: a half-applied triage is worse than none, because the distribution would
  // then describe neither the old state nor the new one.
  await sequelize.transaction(async (transaction) => {
    for (const c of plan.changes) {
      await ContractRequirement.update(
        { kind: c.to.kind, priority: c.to.priority, interpretation: c.interpretation },
        { where: { id: c.id }, transaction },
      );
    }
  });
  console.log(`  Applied ${plan.changes.length} row(s). human_confirmed untouched on every one.\n`);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('FAILED:', e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}
