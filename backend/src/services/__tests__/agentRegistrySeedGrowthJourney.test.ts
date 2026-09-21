/**
 * T509 — the Growth Journey agents in the registry, after the verbatim
 * extraction of Phase 4's `GrowthJourneyShadowDecisions` entry into
 * services/agentRegistry/growthJourneyAgents.ts and the addition of the
 * executor there. Same harness as agentRegistrySeedMandrillPoll.test.ts.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn(), findOne: jest.fn() }));
// The barrel wires associations on the real models; two imports below (the filer's constant, the outbound
// categories) reach it transitively and need none of it.
jest.mock('../../models', () => ({}));
jest.mock('../aiEventService', () => ({ logAiEvent: jest.fn() }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));
jest.mock('../curriculum/daraIdentitySeed', () => ({ seedDaraIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../curriculum/daraPersona', () => ({ DARA_PERSONA_BLOCK: 'MOCKED_DARA' }));
jest.mock('../curriculum/repointLegacyBehaviors', () => ({ repointCurriculumLegacyBehaviors: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../agentBlueprint/ticketCreatorIdentitySeed', () => ({ seedTicketCreatorIdentities: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../agentPersonaVersionHistoryService', () => ({ recordPersonaVersionChangeIfNeeded: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../agentAutonomyReclassificationService', () => ({ classifyNewAgentAutonomyLevel: jest.fn().mockResolvedValue(undefined), maybeReclassifyAutonomyLevel: jest.fn().mockResolvedValue(undefined) }));

import AiAgent from '../../models/AiAgent';
import { seedAgentRegistry } from '../agentRegistrySeed';
import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../agentRegistry/growthJourneyAgents';
import { EXECUTOR_AGENT_NAME } from '../growthJourney/execution/proposalFiler';
import { OUTBOUND_AGENT_CATEGORIES } from '../launchSafety';

const mockFindOrCreate = AiAgent.findOrCreate as unknown as jest.Mock;
const mockFindOne = AiAgent.findOne as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [{ ...defaults, update: jest.fn().mockResolvedValue(undefined) }, true]);
  mockFindOne.mockResolvedValue(null);
});

const names = () => mockFindOrCreate.mock.calls.map((c) => c[0]?.where?.agent_name as string);
const defaultsFor = (agentName: string) => mockFindOrCreate.mock.calls.find((c) => c[0]?.where?.agent_name === agentName)?.[0].defaults;

describe('the module', () => {
  it('holds exactly the two scheduled journey agents, in order: the moved Phase 4 row, then the executor', () => {
    expect(GROWTH_JOURNEY_AGENT_ENTRIES.map((e) => e.agent_name)).toEqual(['GrowthJourneyShadowDecisions', EXECUTOR_AGENT_NAME]);
  });

  it('the moved entry is Phase 4\'s row, field for field', () => {
    expect(GROWTH_JOURNEY_AGENT_ENTRIES[0]).toMatchObject({
      agent_name: 'GrowthJourneyShadowDecisions', agent_type: 'scheduled_processor', module: 'growthJourney',
      source_file: 'backend/src/services/growthJourney/runShadowDecisionsNightly.ts', trigger_type: 'cron', schedule: '20 4 * * *', category: 'behavioral', enabled: false,
    });
    expect(GROWTH_JOURNEY_AGENT_ENTRIES[0].description).toMatch(/^Growth Journey OS nightly shadow decisions \(Phase 4, T408\)/);
    expect(GROWTH_JOURNEY_AGENT_ENTRIES[0].description).toContain('SHIPPED PAUSED');
  });

  it('the executor: the name every journey proposal is filed under, a cron on T513\'s schedule, category outbound, shipped disabled', () => {
    const executor = GROWTH_JOURNEY_AGENT_ENTRIES[1];
    expect(executor).toMatchObject({
      agent_name: EXECUTOR_AGENT_NAME, agent_type: 'scheduled_processor', module: 'growthJourney',
      source_file: 'backend/src/services/growthJourney/execution/planExecution.ts', trigger_type: 'cron', schedule: '*/15 14-22 * * 1-5', category: 'outbound', enabled: false,
    });
    // Acceptance 7: the kill switch disables every agent in these categories, this one included.
    expect(OUTBOUND_AGENT_CATEGORIES).toContain(executor.category);
    expect(executor.description).toContain('SHIPPED DISABLED');
    expect(executor.description).toContain('GROWTH_JOURNEY_EXECUTION_ENABLED');
  });
});

describe('the seed', () => {
  it('acceptance 7: registers both journey rows through findOrCreate with enabled:false, at the same position - the executor beside the shadow row, both before GrowthJourneyHandoffs', async () => {
    await seedAgentRegistry();
    const order = names();
    const shadow = order.indexOf('GrowthJourneyShadowDecisions');
    expect(shadow).toBeGreaterThan(0);
    expect(order[shadow + 1]).toBe(EXECUTOR_AGENT_NAME);
    expect(order[shadow + 2]).toBe('GrowthJourneyHandoffs');
    expect(order.filter((n) => n === EXECUTOR_AGENT_NAME)).toHaveLength(1);
    for (const n of ['GrowthJourneyShadowDecisions', EXECUTOR_AGENT_NAME]) expect([n, defaultsFor(n).enabled]).toEqual([n, false]);
    expect(defaultsFor(EXECUTOR_AGENT_NAME).category).toBe('outbound');
  });

  it('idempotent: a second boot finds the executor row and never re-creates it, and an existing row\'s enabled flag is not in the update patch', async () => {
    await seedAgentRegistry();
    const row = { ...defaultsFor(EXECUTOR_AGENT_NAME), enabled: true, config: {}, update: jest.fn().mockResolvedValue(undefined) };
    mockFindOrCreate.mockImplementation(async ({ where, defaults }: any) => (where.agent_name === EXECUTOR_AGENT_NAME ? [row, false] : [{ ...defaults, update: jest.fn().mockResolvedValue(undefined) }, true]));
    await seedAgentRegistry();
    expect(row.update).toHaveBeenCalledTimes(1);
    expect(row.update.mock.calls[0][0]).not.toHaveProperty('enabled'); // an operator's choice survives every boot
  });
});

describe('acceptance 8: the import graph', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const importsOf = (src: string) => Array.from(src.matchAll(/^import .* from '([^']+)';/gm)).map((m) => m[1]);

  it('agentRegistrySeed -> growthJourneyAgents -> agentSeedTypes, and nothing imports back', () => {
    const seed = importsOf(read('agentRegistrySeed.ts'));
    expect(seed).toContain('./agentRegistry/growthJourneyAgents');
    expect(seed).toContain('./agentRegistry/agentSeedTypes');
    expect(importsOf(read('agentRegistry/growthJourneyAgents.ts'))).toEqual(['./agentSeedTypes']);
    expect(importsOf(read('agentRegistry/agentSeedTypes.ts'))).toEqual(['../../models/AiAgent']);
    for (const f of ['agentRegistry/growthJourneyAgents.ts', 'agentRegistry/agentSeedTypes.ts']) {
      expect({ f, importsSeed: importsOf(read(f)).some((s) => s.includes('agentRegistrySeed')) }).toEqual({ f, importsSeed: false });
    }
  });

  it('the seed no longer declares the entry shape or the shadow row itself', () => {
    const seed = read('agentRegistrySeed.ts');
    expect(seed).not.toMatch(/^interface AgentSeedEntry/m);
    expect(seed).not.toContain("agent_name: 'GrowthJourneyShadowDecisions'");
    expect(seed).toContain('...GROWTH_JOURNEY_AGENT_ENTRIES,');
    expect(seed).toContain("agent_name: 'GrowthJourneyHandoffs'"); // the identity row stays where it was
  });
});
