/**
 * Ticket Board UX fixes (2026-08-17) — pins the 6 real ownership rules and the
 * "never fabricate a timer" honesty contract for buildTicketAutoCheckResolver().
 */
jest.mock('../../models/AiAgent', () => ({ findAll: jest.fn() }));
jest.mock('../governanceResolutionService', () => ({ resolveCronSchedule: jest.fn() }));
jest.mock('../reese/reeseIdentitySeed', () => ({ getReeseAdminUserId: jest.fn() }));

import AiAgent from '../../models/AiAgent';
import { resolveCronSchedule } from '../governanceResolutionService';
import { getReeseAdminUserId } from '../reese/reeseIdentitySeed';
import { buildTicketAutoCheckResolver, TicketAutoCheckInput } from '../ticketAutoCheckService';

const mockAiAgentFindAll = AiAgent.findAll as unknown as jest.Mock;
const mockResolveCronSchedule = resolveCronSchedule as unknown as jest.Mock;
const mockGetReeseAdminUserId = getReeseAdminUserId as unknown as jest.Mock;

const REESE_ADMIN_ID = '82c2dfd2-369e-4545-8d2f-22d1ae3451ff';

const ALL_ENABLED_AGENTS = [
  { agent_name: 'CoryEngineTicketAutoResolver', enabled: true },
  { agent_name: 'CoryBrainInitiativeTicketAutoResolver', enabled: true },
  { agent_name: 'InboxCaseSourceCompletionResolver', enabled: true },
  { agent_name: 'BposCapabilityTicketAutoResolver', enabled: true },
  { agent_name: 'WorkforceTicketAutoResolver', enabled: true },
  { agent_name: 'ReeseStudentSupportSupersessionResolver', enabled: true },
];

function baseTicket(overrides: Partial<TicketAutoCheckInput>): TicketAutoCheckInput {
  return {
    created_by_type: 'cory',
    created_by_id: 'unknown',
    type: 'task',
    source: 'manual',
    entity_type: null,
    status: 'backlog',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReeseAdminUserId.mockResolvedValue(REESE_ADMIN_ID);
  mockAiAgentFindAll.mockResolvedValue(ALL_ENABLED_AGENTS);
  // Every resolveCronSchedule() call defaults to enabled + its own passed-in
  // hardcoded default, mirroring the real function's own no-override fallback.
  mockResolveCronSchedule.mockImplementation((agentName: string, hardcodedSchedule: string) =>
    Promise.resolve({ agent_name: agentName, schedule: hardcodedSchedule, enabled: true, source: 'hardcoded' }),
  );
});

describe('buildTicketAutoCheckResolver — the 6 real ownership rules', () => {
  it('cory-engine: created_by_id + type + source all matching resolves to CoryEngineTicketAutoResolver with a real next-check time', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({ created_by_id: 'cory-engine', type: 'agent_action', source: 'cory_autonomous_cycle' }),
    );

    expect(info.hasAutoCheck).toBe(true);
    expect(info.resolverAgentName).toBe('CoryEngineTicketAutoResolver');
    expect(info.nextCheckAt).not.toBeNull();
    expect(info.nextCheckLabel).not.toBeNull();
  });

  it('cory-engine: a NEAR MISS (right created_by_id, wrong type) resolves to no owner — proves this is a real scope match, not a loose created_by_id-only check', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({ created_by_id: 'cory-engine', type: 'bug', source: 'cory_autonomous_cycle' }),
    );

    expect(info.hasAutoCheck).toBe(false);
    expect(info.resolverAgentName).toBeNull();
    expect(info.reason).toMatch(/no automated resolver/i);
  });

  it('CoryBrain: created_by_id alone is sufficient (no type/source narrowing, matching the real resolver scope)', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(baseTicket({ created_by_id: 'CoryBrain', type: 'workflow_redesign', source: 'cory:evolution' }));

    expect(info.hasAutoCheck).toBe(true);
    expect(info.resolverAgentName).toBe('CoryBrainInitiativeTicketAutoResolver');
  });

  it('bpos_orchestrator: created_by_id + type + entity_type all matching resolves to BposCapabilityTicketAutoResolver', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({
        created_by_id: 'bpos_orchestrator',
        type: 'bpos_execution',
        source: 'bpos_engine',
        entity_type: 'capability',
      }),
    );

    expect(info.hasAutoCheck).toBe(true);
    expect(info.resolverAgentName).toBe('BposCapabilityTicketAutoResolver');
  });

  it('workforce_intelligence_engine: created_by_id + type + entity_type all matching resolves to WorkforceTicketAutoResolver', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({
        created_by_id: 'workforce_intelligence_engine',
        type: 'workforce_decision',
        source: 'workforce_intelligence',
        entity_type: 'agent',
        created_by_type: 'agent',
      }),
    );

    expect(info.hasAutoCheck).toBe(true);
    expect(info.resolverAgentName).toBe('WorkforceTicketAutoResolver');
  });

  it('inbox_case type alone owns InboxCaseSourceCompletionResolver regardless of creator (the general closure-guard sweep covers every open case)', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({ created_by_id: 'InboxCaseEngine', created_by_type: 'agent', type: 'inbox_case', source: 'inbox_case' }),
    );

    expect(info.hasAutoCheck).toBe(true);
    expect(info.resolverAgentName).toBe('InboxCaseSourceCompletionResolver');
  });

  it('Reese: created_by_id === the LIVE Reese AdminUser id (not a hardcoded string) + type student_support owns ReeseStudentSupportSupersessionResolver', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({ created_by_id: REESE_ADMIN_ID, created_by_type: 'ai_staff', type: 'student_support', source: 'reese' }),
    );

    expect(info.hasAutoCheck).toBe(true);
    expect(info.resolverAgentName).toBe('ReeseStudentSupportSupersessionResolver');
    expect(mockGetReeseAdminUserId).toHaveBeenCalledTimes(1); // fetched once for the whole batch, not per ticket
  });

  it('Reese: a DIFFERENT student_support ticket (not created by Reese\'s real admin id) has no owner — proves this is a real identity check, not "any student_support ticket"', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({ created_by_id: 'some-other-admin-uuid', created_by_type: 'human', type: 'student_support' }),
    );

    expect(info.hasAutoCheck).toBe(false);
  });
});

describe('buildTicketAutoCheckResolver — honesty: never a fabricated timer', () => {
  it('an already-closed ticket (done) never gets a next-check value even though it would otherwise match an ownership rule', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({ created_by_id: 'cory-engine', type: 'agent_action', source: 'cory_autonomous_cycle', status: 'done' }),
    );

    expect(info.hasAutoCheck).toBe(false);
    expect(info.reason).toMatch(/already closed/i);
  });

  it('a cancelled ticket is treated the same as done', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({ created_by_id: 'CoryBrain', status: 'cancelled' }),
    );

    expect(info.hasAutoCheck).toBe(false);
  });

  it('a ticket matching NO rule (e.g. a manually-created ticket, or one of the 16 unrelated Architect agents) honestly reports no owner', async () => {
    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(baseTicket({ created_by_id: 'StudentSuccessArchitect', created_by_type: 'agent', type: 'task' }));

    expect(info.hasAutoCheck).toBe(false);
    expect(info.resolverAgentName).toBeNull();
    expect(info.reason).toMatch(/no automated resolver/i);
  });

  it('AiAgent.enabled=false for the owning resolver forces hasAutoCheck:false with a distinct honest reason, not a stale timer', async () => {
    mockAiAgentFindAll.mockResolvedValue([
      ...ALL_ENABLED_AGENTS.filter((a) => a.agent_name !== 'CoryEngineTicketAutoResolver'),
      { agent_name: 'CoryEngineTicketAutoResolver', enabled: false },
    ]);

    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({ created_by_id: 'cory-engine', type: 'agent_action', source: 'cory_autonomous_cycle' }),
    );

    expect(info.hasAutoCheck).toBe(false);
    expect(info.resolverAgentName).toBe('CoryEngineTicketAutoResolver'); // owner is still named, just paused
    expect(info.reason).toMatch(/paused/i);
  });

  it('resolveCronSchedule() reporting enabled:false (a real governance-UI override) also forces hasAutoCheck:false, independently of AiAgent.enabled', async () => {
    mockResolveCronSchedule.mockImplementation((agentName: string, hardcodedSchedule: string) =>
      Promise.resolve({
        agent_name: agentName,
        schedule: hardcodedSchedule,
        enabled: agentName === 'BposCapabilityTicketAutoResolver' ? false : true,
        source: agentName === 'BposCapabilityTicketAutoResolver' ? 'database' : 'hardcoded',
      }),
    );

    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({
        created_by_id: 'bpos_orchestrator',
        type: 'bpos_execution',
        source: 'bpos_engine',
        entity_type: 'capability',
      }),
    );

    expect(info.hasAutoCheck).toBe(false);
    expect(info.reason).toMatch(/schedule is currently disabled/i);
  });

  it('a missing AiAgent row for the owning resolver (registration never ran in this environment) is treated as disabled, not assumed-enabled', async () => {
    mockAiAgentFindAll.mockResolvedValue(
      ALL_ENABLED_AGENTS.filter((a) => a.agent_name !== 'WorkforceTicketAutoResolver'),
    );

    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({
        created_by_id: 'workforce_intelligence_engine',
        created_by_type: 'agent',
        type: 'workforce_decision',
        entity_type: 'agent',
      }),
    );

    expect(info.hasAutoCheck).toBe(false);
  });

  it('reeseAdminUserId lookup failing (null) never crashes — student_support tickets just have no owner that run', async () => {
    mockGetReeseAdminUserId.mockResolvedValue(null);

    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(baseTicket({ created_by_id: REESE_ADMIN_ID, type: 'student_support' }));

    expect(info.hasAutoCheck).toBe(false);
  });

  it('an unparseable live schedule string fails closed to no-auto-check rather than throwing', async () => {
    mockResolveCronSchedule.mockImplementation((agentName: string) =>
      Promise.resolve({ agent_name: agentName, schedule: 'not a real cron string', enabled: true, source: 'database' }),
    );

    const resolve = await buildTicketAutoCheckResolver();
    const info = resolve(
      baseTicket({ created_by_id: 'CoryBrain' }),
    );

    expect(info.hasAutoCheck).toBe(false);
    expect(info.reason).toMatch(/could not be parsed/i);
  });
});
