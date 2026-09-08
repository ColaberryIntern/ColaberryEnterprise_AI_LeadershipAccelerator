import { connectDatabase } from '../config/database';
import '../models';
import { RoutingRule } from '../models';

/**
 * Routing rules that belong in code rather than in somebody's memory.
 *
 * WHY THIS FILE EXISTS
 *
 * Routing rules have only ever been created through the admin API. That is fine
 * for a rule an operator tunes, and wrong for a rule a FEATURE depends on: the
 * OpportunityLift voice interview does not work at all without its rule, so
 * shipping the code and leaving the rule to be remembered means shipping a
 * button that does nothing.
 *
 * This session hit that shape four times - three lead-source seeds and this - and
 * each was caught because somebody remembered rather than because anything
 * checked. A rule a deploy cannot carry is a deploy that is not finished.
 *
 * ## Deliberately narrow
 *
 * It seeds ONLY the rules listed here, by name, and never deletes or deactivates
 * anything. Operator-created rules - including AI Flotation's, which predate this
 * file - are left exactly alone. A seeder that asserted the full set would
 * silently undo tuning somebody did in the admin UI at three in the morning.
 *
 * Idempotent: matched on `name`, updated in place, safe to re-run.
 */

interface SeedRule {
  name: string;
  priority: number;
  conditions: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
}

const RULES: SeedRule[] = [
  {
    /**
     * The OpportunityLift voice interview.
     *
     * Shape copied from the working `Call back on ai-flotation call_me_now` rule
     * rather than invented: same priority, same single action, conditions keyed on
     * source and entry slug.
     *
     * Three things have to line up for a call to happen, and this is one:
     *   1. the `scholarship_interview_call` entry point  (seedLeadSources.ts)
     *   2. this rule                                     (here)
     *   3. SYNTHFLOW_CPN_AGENT_ID set in the environment (external, see below)
     *
     * (3) cannot be seeded - it is a shell agent somebody creates in Synthflow.
     * Until it exists `resolveAgentId` returns empty for cpn and every call is
     * skipped with `no_agent_id`, which is a visible no-op rather than a call
     * placed in Colaberry's voice.
     */
    name: 'Call back on cpn scholarship_interview_call',
    priority: 100,
    conditions: { source_slug: 'cpn', entry_slug: 'scholarship_interview_call' },
    actions: [{ type: 'request_callback' }],
  },
];

export async function seedRoutingRules(): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const rule of RULES) {
    const existing = await RoutingRule.findOne({ where: { name: rule.name } });

    if (existing) {
      await existing.update({
        priority: rule.priority,
        conditions: rule.conditions,
        actions: rule.actions,
        is_active: true,
        updated_at: new Date(),
      } as any);
      updated += 1;
      console.log(`[SeedRoutingRules] Updated "${rule.name}"`);
    } else {
      await RoutingRule.create({
        name: rule.name,
        priority: rule.priority,
        conditions: rule.conditions,
        actions: rule.actions,
        is_active: true,
      } as any);
      created += 1;
      console.log(`[SeedRoutingRules] Created "${rule.name}"`);
    }
  }

  console.log(`[SeedRoutingRules] Done. ${created} created, ${updated} updated.`);
  return { created, updated };
}

/* Runnable directly, the same way seedLeadSources is:
     docker exec accelerator-backend node dist/seeds/seedRoutingRules.js          */
if (require.main === module) {
  connectDatabase()
    .then(seedRoutingRules)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[SeedRoutingRules] Failed:', err?.message);
      process.exit(1);
    });
}
