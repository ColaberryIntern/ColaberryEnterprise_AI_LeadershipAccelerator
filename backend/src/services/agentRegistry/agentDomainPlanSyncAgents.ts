import type { AgentSeedEntry } from './agentSeedTypes';

/**
 * The agent-domain plan-to-repo sweep's registry row.
 *
 * Declared in its own module rather than inline in `agentRegistrySeed.ts`, which is over
 * the file ceiling; the seed spreads it, the same arrangement as the Growth Journey and
 * domain-agent entries.
 *
 * `schedule` must stay byte-identical to the cron expression in
 * `scheduling/planRepoSyncCrons.ts`. `cronRegistryReconciliation.test.ts` pins the two
 * together, because a job whose registry row disagrees with its clock reports its runs
 * against the wrong schedule and nothing notices.
 *
 * Shipped enabled. Every other recently added scheduled agent ships paused; this one does
 * not, because it exists to close a delivery gap that cost a builder credit she had
 * earned, and a paused job closes nothing. The safety is in the writer rather than in the
 * switch: `refreshRepoDocuments` renders only from the published plan, commits only files
 * whose content hash differs, and merges the builder's own progress file field by field.
 * Admin > Agents can pause it in one click if that judgement turns out to be wrong.
 */
export const AGENT_DOMAIN_PLAN_SYNC_ENTRIES: AgentSeedEntry[] = [
  {
    agent_name: 'AgentDomainPlanRepoSync',
    agent_type: 'scheduled_processor',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/planRepoSyncSweep.ts',
    trigger_type: 'cron',
    schedule: '41 */6 * * *',
    category: 'maintenance',
    description:
      'Delivers each agent domain\'s PUBLISHED build plan into its builder\'s GitHub repo '
      + 'every six hours, so a republished plan no longer waits for the builder to press '
      + 'Sync. Writes nothing of its own: every file goes through refreshRepoDocuments, '
      + 'which renders from the published plan, commits only what differs by content hash, '
      + 'and merges .colaberry/progress.json field by field. Also reports board-versus-plan '
      + 'drift, the republish debt that is otherwise invisible because the six-hourly tree '
      + 'pull stamps last_sync_at on repos it never writes to. Added 2026-11-24 after five '
      + 'of seven builder repos were found eleven days behind their plans.',
  },
];
