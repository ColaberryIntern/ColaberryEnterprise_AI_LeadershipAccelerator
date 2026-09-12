import { RoutingRule } from '../../models';
import { routingRuleCreateSchema } from '../../schemas/routingRuleSchema';
import { PHASE2_ROUTING_RULES, type Phase2RoutingRuleDefinition } from './phase2RoutingRuleDefinitions';

/**
 * Seeds the Phase 2 default routing rules BY HAND (T227). Not boot-wired — see
 * `phase2RoutingRuleDefinitions.ts` for why — and idempotent by rule name:
 * an existing rule of the same name is left exactly as the operator has it.
 * Every definition goes through the same Zod schema the admin route uses, so
 * a rule this file cannot create through the UI it cannot create here either.
 *
 *   node dist/seeds/growthJourney/seedPhase2RoutingRules.js
 */

export interface SeedRulesResult {
  created: string[];
  existing: string[];
}

export async function seedPhase2RoutingRules(
  table: readonly Phase2RoutingRuleDefinition[] = PHASE2_ROUTING_RULES,
): Promise<SeedRulesResult> {
  const result: SeedRulesResult = { created: [], existing: [] };
  for (const def of table) {
    const parsed = routingRuleCreateSchema.safeParse(def);
    if (!parsed.success) throw new Error(`rule "${def.name}" fails the routing-rule schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    const found = await RoutingRule.findOne({ where: { name: def.name } });
    if (found) {
      result.existing.push(def.name);
      continue;
    }
    await RoutingRule.create({
      name: def.name,
      priority: def.priority,
      conditions: def.conditions,
      actions: def.actions,
      continue_on_match: def.continue_on_match,
      is_active: def.is_active,
    });
    result.created.push(def.name);
  }
  return result;
}

if (require.main === module) {
  (async () => {
    const { connectDatabase, sequelize } = await import('../../config/database');
    await import('../../models');
    await connectDatabase();
    try {
      const r = await seedPhase2RoutingRules();
      console.log(JSON.stringify({ event: 'growth_journey.phase2_rules.seeded', ...r }));
    } finally {
      await sequelize.close().catch(() => undefined);
    }
  })().catch((err: unknown) => {
    console.error(`[seedPhase2RoutingRules] ${(err as { message?: string })?.message ?? err}`);
    process.exitCode = 1;
  });
}
