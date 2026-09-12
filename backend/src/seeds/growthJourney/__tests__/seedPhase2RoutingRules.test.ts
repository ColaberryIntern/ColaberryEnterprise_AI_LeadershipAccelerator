/**
 * T227 — the default Phase 2 rules are defined, valid, idempotent by name,
 * and NOT boot-wired. The last of those is the load-bearing one.
 */
const findOne = jest.fn();
const create = jest.fn();
jest.mock('../../../models', () => ({ RoutingRule: { findOne: (...a: unknown[]) => findOne(...a), create: (...a: unknown[]) => create(...a) } }));
jest.mock('../../../services/emailService', () => ({ sendNewLeadAlert: jest.fn() }));
jest.mock('../../../services/communicationLogService', () => ({ logCommunication: jest.fn() }));
jest.mock('../../../services/callbackRequestService', () => ({ requestInstantCallback: jest.fn() }));
jest.mock('../../../services/activityService', () => ({ logActivity: jest.fn() }));

import { PHASE2_ROUTING_RULES } from '../phase2RoutingRuleDefinitions';
import { seedPhase2RoutingRules } from '../seedPhase2RoutingRules';
import { routingRuleCreateSchema } from '../../../schemas/routingRuleSchema';
import { activeBootCall, serverSourceText } from '../../../db/__tests__/helpers/bootCalls';

beforeEach(() => {
  findOne.mockReset().mockResolvedValue(null);
  create.mockReset().mockImplementation(async (row: Record<string, unknown>) => ({ id: 'r', ...row }));
});

describe('the definitions', () => {
  it('one rule per brand, priority 50, continue_on_match, matching on the brand_slug FACT', () => {
    expect(PHASE2_ROUTING_RULES.map((r) => r.conditions.brand_slug)).toEqual(['cpn', 'colaberry-training', 'colaberry-enterprise', 'ai-flotation']);
    for (const r of PHASE2_ROUTING_RULES) {
      expect(r.priority).toBe(50);
      expect(r.continue_on_match).toBe(true);
      expect(r.actions.map((a) => a.type)).toEqual(['assign_journey_program', 'assign_service_path']);
    }
  });

  it('every definition passes the SAME schema the admin route enforces (registry-checked action types)', () => {
    for (const r of PHASE2_ROUTING_RULES) expect(routingRuleCreateSchema.safeParse(r).success).toBe(true);
  });
});

describe('the seed', () => {
  it('creates each rule once and leaves an existing rule of the same name untouched', async () => {
    const first = await seedPhase2RoutingRules();
    expect(first.created).toHaveLength(4);
    expect(create).toHaveBeenCalledTimes(4);
    findOne.mockResolvedValue({ id: 'existing' });
    const second = await seedPhase2RoutingRules();
    expect(second).toEqual({ created: [], existing: PHASE2_ROUTING_RULES.map((r) => r.name) });
    expect(create).toHaveBeenCalledTimes(4);
  });

  it('refuses a definition the schema rejects, before touching the database', async () => {
    await expect(seedPhase2RoutingRules([{ ...PHASE2_ROUTING_RULES[0], actions: [{ type: 'assign_journey_programme' as never }] }])).rejects.toThrow(/fails the routing-rule schema/);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('NOT boot-wired', () => {
  it('server.ts has no active call to seedPhase2RoutingRules, and never mentions it', () => {
    expect(activeBootCall('seedPhase2RoutingRules')).toBe(-1);
    expect(serverSourceText()).not.toContain('seedPhase2RoutingRules');
    // control: the helper does find calls that exist
    expect(activeBootCall('await ensureRoutingAuditSchema()')).toBeGreaterThan(-1);
  });

  it('the pre-existing hand-run seed is not boot-wired either (unchanged)', () => {
    expect(activeBootCall('seedRoutingRules')).toBe(-1);
  });
});
