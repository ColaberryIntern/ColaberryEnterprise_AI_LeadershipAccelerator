/**
 * classifyAiAgentDepartments — Phase D.1 "Inventory" of the AI Workforce
 * Reset governance rollout (Ali signed off on abac-design.md's own
 * recommendations wholesale, 2026-08-24, decision 4: per-department scope
 * to start).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * `authorizeAgentAction()` (Phase D.2+, not yet built) will need to know
 * which department an agent belongs to before it can scope anything. Today
 * every enabled `ai_agents` row has `department: null` — this script is the
 * one-time (and safely rerunnable) pass that fills it in, using
 * `agentDepartmentClassifier.ts`'s real, documented category/agent-name
 * mapping rather than a manual spreadsheet.
 *
 * ── READ-ONLY BY DEFAULT ────────────────────────────────────────────────────
 *
 * Prints what it would set and exits. `--apply` is required to write.
 * Idempotent: an agent whose `department` is already non-null is left
 * untouched, even under `--apply` — an operator's hand-edit is never
 * silently overwritten by a rerun.
 *
 * Nothing here enables enforcement. `department` stays purely declarative
 * until Phase D.2+ builds and wires the real authorization chokepoint.
 *
 * Usage:
 *   node dist/scripts/classifyAiAgentDepartments.js            # dry run
 *   node dist/scripts/classifyAiAgentDepartments.js --apply
 */
import { classifyAgentDepartment, ClassificationConfidence } from '../services/governance/agentDepartmentClassifier';

interface Row {
  agentId: string;
  agentName: string;
  category: string | null;
  currentDepartment: string | null;
  newDepartment: string | null;
  confidence: ClassificationConfidence;
  reason: string;
  applied: boolean;
}

export async function classify(apply: boolean): Promise<Row[]> {
  const { default: AiAgent } = await import('../models/AiAgent');
  const agents: any[] = await AiAgent.findAll({ where: { enabled: true } });

  const rows: Row[] = [];
  for (const agent of agents) {
    const currentDepartment: string | null = agent.department ?? null;
    const { department: newDepartment, confidence, reason } = classifyAgentDepartment(agent.agent_name, agent.category ?? null);

    const row: Row = {
      agentId: agent.id,
      agentName: agent.agent_name,
      category: agent.category ?? null,
      currentDepartment,
      newDepartment,
      confidence,
      reason,
      applied: false,
    };

    // Idempotency: never overwrite a department an operator (or a previous
    // run) already set — a rerun only fills in what is still null.
    if (apply && currentDepartment === null && newDepartment !== null) {
      await agent.update({ department: newDepartment });
      row.applied = true;
    }

    rows.push(row);
  }
  return rows;
}

/** PURE. What the operator needs to see, not a dump of every row. */
export function summarise(rows: Row[]): string {
  const alreadySet = rows.filter((r) => r.currentDepartment !== null);
  const toClassify = rows.filter((r) => r.currentDepartment === null);
  const autoConfident = toClassify.filter((r) => r.confidence === 'auto');
  const needsReview = toClassify.filter((r) => r.confidence === 'needs_review');
  const unclassifiable = toClassify.filter((r) => r.newDepartment === null);
  const applied = rows.filter((r) => r.applied);

  const lines = [
    `agents checked:         ${rows.length}`,
    `already had department: ${alreadySet.length}  (never touched by this script)`,
    `to classify:            ${toClassify.length}`,
    `  -> auto (confident):  ${autoConfident.length}`,
    `  -> needs review:      ${needsReview.length}`,
    `  -> unclassifiable:    ${unclassifiable.length}  (department stays null, disclosed honestly)`,
    `applied this run:       ${applied.length}`,
  ];
  if (needsReview.length > 0) {
    lines.push('', 'NEEDS REVIEW (per-agent override or no known mapping — verify before trusting):');
    for (const r of needsReview) lines.push(`  ${r.agentName.padEnd(32)} -> ${String(r.newDepartment)}  (${r.reason})`);
  }
  if (unclassifiable.length > 0) {
    lines.push('', 'UNCLASSIFIABLE (department stays null):');
    for (const r of unclassifiable) lines.push(`  ${r.agentName.padEnd(32)} category=${r.category ?? 'none'}  (${r.reason})`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rows = await classify(apply);
  console.log(apply ? '=== APPLIED ===' : '=== DRY RUN (pass --apply to write) ===');
  console.log(summarise(rows));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('classifyAiAgentDepartments failed:', err?.message ?? err);
    process.exit(1);
  });
}
