/**
 * Applies the 2026-07-31 ai_agents registry audit's classification
 * (agentRegistryAuditClassification.ts) to the database: annotates every
 * confirmed_dead / internal_pipeline_step agent with config.registry_audit, and
 * disables (enabled: false) the confirmed_dead ones only. Never deletes anything.
 *
 * Idempotent: re-running updates audited_at but never double-appends, never
 * re-disables an already-disabled row differently, and never touches a row this
 * audit didn't enumerate.
 *
 * Run (dry-run, default — prints what WOULD change, writes nothing):
 *   npx ts-node src/scripts/auditAgentRegistryStatus.ts
 * Run (applies the writes):
 *   npx ts-node src/scripts/auditAgentRegistryStatus.ts --execute
 */
import AiAgent from '../models/AiAgent';
import { classifyAgent, allClassifiedAgentNames, REGISTRY_AUDIT_DATE } from '../services/agentRegistryAuditClassification';

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const execute = argv.includes('--execute');
  const names = allClassifiedAgentNames();

  let found = 0;
  let disabled = 0;
  let annotatedOnly = 0;
  let missing: string[] = [];

  for (const agentName of names) {
    const classification = classifyAgent(agentName);
    if (!classification) continue; // unreachable given names comes from the same module, but keeps this loop type-safe

    const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
    if (!agent) {
      missing.push(agentName);
      continue;
    }
    found++;

    const registryAudit = {
      status: classification.status,
      note: classification.note,
      parent_agent: classification.parentAgent ?? null,
      audited_at: new Date().toISOString(),
      audit_date: REGISTRY_AUDIT_DATE,
    };

    if (classification.disable) disabled++;
    else annotatedOnly++;

    console.log(
      `${execute ? '[APPLY]' : '[DRY-RUN]'} ${agentName}: status=${classification.status} disable=${classification.disable}`
    );

    if (execute) {
      await agent.update({
        config: { ...(agent.config || {}), registry_audit: registryAudit },
        ...(classification.disable ? { enabled: false } : {}),
        updated_at: new Date(),
      });
    }
  }

  console.log('');
  console.log(`=== ${execute ? 'APPLIED' : 'DRY-RUN'} SUMMARY ===`);
  console.log(`Enumerated: ${names.length}`);
  console.log(`Found in registry: ${found}`);
  console.log(`Disabled + annotated (confirmed_dead): ${disabled}`);
  console.log(`Annotated only (internal_pipeline_step): ${annotatedOnly}`);
  if (missing.length > 0) {
    console.log(`NOT FOUND in ai_agents (classification enumerated a name that no longer exists in the registry): ${missing.join(', ')}`);
  }
  if (!execute) {
    console.log('');
    console.log('Dry run only — no rows were changed. Re-run with --execute to apply.');
  }
}

// Only auto-run when executed directly (node/ts-node), never on import — lets tests
// import and await main() themselves without triggering a second, untestable run.
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('audit script failed:', e.message);
      process.exit(1);
    });
}
