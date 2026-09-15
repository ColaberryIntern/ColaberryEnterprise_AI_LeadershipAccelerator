/**
 * classifyAiAgentAutonomyLevels — Fleet-wide autonomy-level auto-
 * classification, Phase 3 (one-time backfill).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Ali: "The autonomy level should be set based on the agent's capabilities.
 * Can you build a process to detect and categorize the agents." Confirmed:
 * auto-set directly, whole fleet. `seedAgentRegistry()` never sets
 * `autonomy_level` for any agent — every one of the 232 real registered
 * agents sits at the untouched DB default (`'observe'`,
 * `autonomy_level_set_at` null) unless a human has manually reactivated it.
 * This is the one-time pass that stamps a real, capability-derived value,
 * using `agentCapabilityClassifier.ts`'s real, tested keyword taxonomy over
 * each agent's own `tools_granted` — never a manual spreadsheet, never a
 * guess.
 *
 * ── READ-ONLY BY DEFAULT ────────────────────────────────────────────────────
 *
 * Prints what it would set and exits. `--apply` is required to write.
 * Idempotent AND non-destructive of human decisions: an agent whose
 * `autonomy_level_set_at` is already non-null — whether set by a real human
 * via the reactivation flow, or by a previous run of this same script — is
 * left completely untouched, even under `--apply`. This script only ever
 * fills in agents nobody has ever set an opinion on.
 *
 * Every write is stamped `autonomy_level_source: 'auto'` (never 'manual') —
 * see AgentDetailV2Header.tsx for why that distinction must never blur: an
 * auto-classification must never be allowed to look like a real human
 * decision.
 *
 * Nothing here enables enforcement. `autonomy_level` stays purely
 * declarative until the separate, explicitly-deferred real-enforcement plan
 * (see docs/plans — the shadow-mode -> enforce track) wires a real send
 * path to actually respect it.
 *
 * ── SCOPING TO ONE AGENT ─────────────────────────────────────────────────────
 *
 * `--agent=<agent_name>` restricts the run to a single real agent — the shape
 * needed to migrate the fleet "one at a time" (Ali's stated onboarding
 * process, see the onboard-ai-agent skill) rather than only ever running a
 * blanket fleet-wide pass. Same idempotency/no-overwrite contract applies.
 *
 * Usage:
 *   node dist/scripts/classifyAiAgentAutonomyLevels.js                        # dry run, whole fleet
 *   node dist/scripts/classifyAiAgentAutonomyLevels.js --apply                # apply, whole fleet
 *   node dist/scripts/classifyAiAgentAutonomyLevels.js --apply --agent=Reese  # apply, one agent only
 */
import { classifyAgentAutonomyLevel } from '../services/agentCapabilityClassifier';
import { AutonomyLevel } from '../services/workforce/agentReactivationService';

interface Row {
  agentId: string;
  agentName: string;
  toolsGranted: string[] | null;
  alreadySet: boolean;
  newLevel: AutonomyLevel;
  reason: string;
  matchedTool: string | null;
  applied: boolean;
}

export async function classify(apply: boolean, agentName?: string): Promise<Row[]> {
  const { default: AiAgent } = await import('../models/AiAgent');
  const where: Record<string, unknown> = { enabled: true };
  if (agentName) where.agent_name = agentName;
  const agents: any[] = await AiAgent.findAll({ where });

  const rows: Row[] = [];
  for (const agent of agents) {
    const alreadySet = agent.autonomy_level_set_at != null;
    const toolsGranted: string[] | null = agent.tools_granted ?? null;
    const { level: newLevel, reason, matchedTool } = classifyAgentAutonomyLevel(toolsGranted);

    const row: Row = {
      agentId: agent.id,
      agentName: agent.agent_name,
      toolsGranted,
      alreadySet,
      newLevel,
      reason,
      matchedTool,
      applied: false,
    };

    // Idempotency + never overwrite a human decision: a rerun (or a prior
    // real reactivation) leaves the row untouched no matter what the
    // classifier would say today.
    if (apply && !alreadySet) {
      await agent.update({
        autonomy_level: newLevel,
        autonomy_level_set_at: new Date(),
        autonomy_level_source: 'auto',
      });
      row.applied = true;
    }

    rows.push(row);
  }
  return rows;
}

/** PURE. What the operator needs to see, not a dump of every row. */
export function summarise(rows: Row[]): string {
  const alreadySet = rows.filter((r) => r.alreadySet);
  const toClassify = rows.filter((r) => !r.alreadySet);
  const withRealTools = toClassify.filter((r) => r.toolsGranted && r.toolsGranted.length > 0);
  const noToolsData = toClassify.filter((r) => !r.toolsGranted || r.toolsGranted.length === 0);
  const applied = rows.filter((r) => r.applied);

  const byLevel: Record<AutonomyLevel, number> = { observe: 0, suggest: 0, act_audited: 0, communicate: 0 };
  for (const r of toClassify) byLevel[r.newLevel] += 1;

  const lines = [
    `agents checked:              ${rows.length}`,
    `already had a level set:     ${alreadySet.length}  (never touched by this script — human or prior run)`,
    `to classify:                 ${toClassify.length}`,
    `  -> from real tools_granted: ${withRealTools.length}`,
    `  -> no tools_granted (safe observe default): ${noToolsData.length}`,
    `  -> observe:      ${byLevel.observe}`,
    `  -> suggest:      ${byLevel.suggest}`,
    `  -> act_audited:  ${byLevel.act_audited}`,
    `  -> communicate:  ${byLevel.communicate}`,
    `applied this run:            ${applied.length}`,
  ];
  const communicateTier = toClassify.filter((r) => r.newLevel === 'communicate');
  if (communicateTier.length > 0) {
    lines.push('', 'COMMUNICATE-TIER (the highest trust level — verify before trusting):');
    for (const r of communicateTier) lines.push(`  ${r.agentName.padEnd(32)} matched "${r.matchedTool}"`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const agentArg = process.argv.find((a) => a.startsWith('--agent='));
  const agentName = agentArg ? agentArg.slice('--agent='.length) : undefined;
  const rows = await classify(apply, agentName);
  console.log(apply ? '=== APPLIED ===' : '=== DRY RUN (pass --apply to write) ===');
  if (agentName) console.log(`(scoped to agent: ${agentName})`);
  console.log(summarise(rows));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('classifyAiAgentAutonomyLevels failed:', err?.message ?? err);
    process.exit(1);
  });
}
