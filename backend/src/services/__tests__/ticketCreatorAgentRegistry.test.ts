/**
 * Agent Quality Cleanup, Item 5 — tools_granted for the 5 ticket-creator
 * agents. Before this, `ai_agents.tools_granted` was `[]` (JSONB default)
 * for all 5 in production, confirmed live. Two things are proven here:
 * (1) each AGENT_REGISTRY entry now carries a non-empty, deduplicated
 * `tools_granted` array, and it reaches `AiAgent.findOrCreate`/`.update`
 * (the existing self-heal path — seedAgentRegistry() already re-applies
 * `tools_granted` to EXISTING rows on every boot, no migration needed);
 * (2) traceability — every capability string is backed by a real, grep-able
 * export in the agent's real source code, not an invented label. Mirrors
 * agentRegistrySeedReeseOutreach.test.ts's established mock shape (the only
 * existing precedent for testing this registry) rather than re-testing the
 * full 130+-entry seed.
 */
// findOne is mocked too (returns null) so seedAgentRegistry()'s internal
// seedTicketCreatorIdentities() call — which this test doesn't otherwise
// exercise — fails its own AiAgent lookup cleanly rather than throwing
// "findOne is not a function"; that function already swallows its own
// per-entry errors by design (see ticketCreatorIdentitySeed.ts), so this
// only silences noise, it doesn't change what's being asserted here.
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn(), findOne: jest.fn().mockResolvedValue(null) }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
// Same rationale as agentRegistrySeedReeseOutreach.test.ts: cuts the
// REESE_PERSONA_BLOCK -> learnerContextService.ts -> full models/index.ts
// association-graph chain, which this test doesn't need.
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));

import * as fs from 'fs';
import * as path from 'path';
import AiAgent from '../../models/AiAgent';
import { seedAgentRegistry } from '../agentRegistrySeed';

const mockFindOrCreate = AiAgent.findOrCreate as unknown as jest.Mock;
const mockUpdate = AiAgent.update as unknown as jest.Mock;

const REPO_ROOT = path.resolve(__dirname, '../../../../'); // backend/src/services/__tests__ -> repo root

const FIVE_AGENTS = [
  'cory-engine',
  'CoryBrain',
  'InboxCaseEngine',
  'workforce_intelligence_engine',
  'bpos_orchestrator',
] as const;

// Explicit, ordered mapping: tools_granted[i] must be backed by a real
// export findable in the named file — proves traceability rather than
// asserting shape alone. CoryBrain's three capabilities genuinely span two
// real files (coryBrain.ts for AgentTask creation, coryInitiatives.ts for
// the other two), which is why this is a per-capability map rather than one
// file per agent.
const CAPABILITY_TRACE: Record<(typeof FIVE_AGENTS)[number], Array<{ file: string; realExport: string }>> = {
  'cory-engine': [
    { file: 'backend/src/intelligence/agents/ProblemDiscoveryAgent.ts', realExport: 'discoverProblems' },
    { file: 'backend/src/intelligence/autonomy/autonomousEngine.ts', realExport: 'IntelligenceDecision.create' },
    { file: 'backend/src/intelligence/autonomy/autonomousEngine.ts', realExport: 'createTicket' },
    { file: 'backend/src/intelligence/agents/ExecutionAgent.ts', realExport: 'executeAction' },
  ],
  CoryBrain: [
    { file: 'backend/src/services/cory/coryBrain.ts', realExport: 'generateStrategicActions' },
    { file: 'backend/src/services/cory/coryInitiatives.ts', realExport: 'createStrategicInitiative' },
    { file: 'backend/src/services/cory/coryBrain.ts', realExport: 'proposeNewAgent' },
  ],
  InboxCaseEngine: [
    { file: 'backend/src/services/inboxCase/caseTicketService.ts', realExport: 'ensureCaseTicket' },
    { file: 'backend/src/services/inboxCase/caseTicketService.ts', realExport: 'syncTicketForCase' },
    { file: 'backend/src/services/inboxCase/caseTicketService.ts', realExport: 'postCaseProgressNote' },
  ],
  workforce_intelligence_engine: [
    { file: 'backend/src/services/company/workforceIntelligenceEngine.ts', realExport: 'FROM ai_agents' },
    { file: 'backend/src/services/company/ticketOrchestrator.ts', realExport: 'createWorkforceTicket' },
  ],
  bpos_orchestrator: [
    { file: 'backend/src/services/company/ticketOrchestrator.ts', realExport: 'createBPOSTicket' },
    { file: 'backend/src/services/company/ticketOrchestrator.ts', realExport: 'updateTicketStatus' },
    { file: 'backend/src/services/company/ticketOrchestrator.ts', realExport: 'addTicketOutput' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
    { ...defaults, config: {}, update: jest.fn().mockResolvedValue(undefined) },
    true, // created
  ]);
  mockUpdate.mockResolvedValue([0]);
});

function findCreateCallFor(agentName: string) {
  return mockFindOrCreate.mock.calls.find((call) => call[0]?.where?.agent_name === agentName);
}

describe('AGENT_REGISTRY — tools_granted populated for the 5 ticket-creator agents', () => {
  it.each(FIVE_AGENTS)('%s: registry entry carries a non-empty, deduplicated tools_granted array', async (agentName) => {
    await seedAgentRegistry();

    const call = findCreateCallFor(agentName);
    expect(call).toBeDefined();
    const toolsGranted = call![0].defaults.tools_granted;
    expect(Array.isArray(toolsGranted)).toBe(true);
    expect(toolsGranted.length).toBeGreaterThan(0);
    for (const tool of toolsGranted) {
      expect(typeof tool).toBe('string');
      expect(tool.length).toBeGreaterThan(0);
    }
    expect(new Set(toolsGranted).size).toBe(toolsGranted.length); // no duplicates
  });

  it.each(FIVE_AGENTS)('%s: every capability string is backed by a real, grep-able export in its real source file (traceability, not just shape)', (agentName) => {
    const trace = CAPABILITY_TRACE[agentName];
    for (const { file, realExport } of trace) {
      const absolutePath = path.join(REPO_ROOT, file);
      expect(fs.existsSync(absolutePath)).toBe(true);
      const content = fs.readFileSync(absolutePath, 'utf8');
      expect(content).toContain(realExport);
    }
  });

  it('seedAgentRegistry() self-heals tools_granted onto an ALREADY-EXISTING row (production today: all 5 read []) — no migration or one-off script needed', async () => {
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { id: 'existing-row-id', agent_name: defaults.agent_name, config: {}, tools_granted: [], update: jest.fn().mockResolvedValue(undefined) },
      false, // NOT created — row already existed, exactly today's production state
    ]);

    const createdAgent = (await (async () => {
      let captured: any;
      mockFindOrCreate.mockImplementation(async ({ where, defaults }: any) => {
        const row = { id: 'existing-row-id', agent_name: where.agent_name, config: {}, tools_granted: [], update: jest.fn().mockResolvedValue(undefined) };
        if (where.agent_name === 'cory-engine') captured = row;
        return [row, false];
      });
      await seedAgentRegistry();
      return captured;
    })());

    expect(createdAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tools_granted: expect.arrayContaining(['detect_problems']),
      }),
    );
  });
});

// Registration-time hardening (Ali, live, 2026-08-19 — "harden the agent
// building process"): seedAgentIdentity() now throws if a ticket-creating
// agent's tools_granted is missing/empty. AgentBehaviorMonitorAgent was
// found with NO tools_granted at all on its AGENT_REGISTRY entry during this
// hardening pass — the exact gap this hardening exists to catch. Fixed by
// adding a real, traced tools_granted array (not boilerplate/aspirational —
// directive Step 4). Unlike the 5 agents above, this agent has ONE exported
// function with inline logic, not separate named exports per capability —
// traceability here means each tool name's real underlying signal (an
// anomaly_type/event_type literal, or an imported real function actually
// called) is grep-able in the source, not that the tool name itself is an
// export.
describe('AGENT_REGISTRY — AgentBehaviorMonitorAgent tools_granted (added 2026-08-19)', () => {
  const AGENT_FILE = 'backend/src/services/agents/security/agentBehaviorMonitorAgent.ts';

  it("registry entry carries a non-empty, deduplicated tools_granted array, traceable to real code in agentBehaviorMonitorAgent.ts", async () => {
    await seedAgentRegistry();

    const call = findCreateCallFor('AgentBehaviorMonitorAgent');
    expect(call).toBeDefined();
    const toolsGranted = call![0].defaults.tools_granted;
    expect(Array.isArray(toolsGranted)).toBe(true);
    expect(toolsGranted.length).toBeGreaterThan(0);
    expect(new Set(toolsGranted).size).toBe(toolsGranted.length); // no duplicates
    expect(toolsGranted).toEqual([
      'detect_stuck_agents',
      'detect_agent_error_spikes',
      'detect_agent_duration_anomalies',
      'create_security_alerts',
      'create_tickets',
    ]);
  });

  it('every declared tool traces to a real, grep-able signal in the agent\'s own source file — not an invented label', () => {
    const absolutePath = path.join(REPO_ROOT, AGENT_FILE);
    expect(fs.existsSync(absolutePath)).toBe(true);
    const content = fs.readFileSync(absolutePath, 'utf8');

    // detect_stuck_agents -> the real 'stuck' anomaly_type literal
    expect(content).toContain("anomaly_type: 'stuck'");
    // detect_agent_error_spikes -> the real 'error_spike' anomaly_type literal
    expect(content).toContain("anomaly_type: 'error_spike'");
    // detect_agent_duration_anomalies -> the real 'duration_anomaly' anomaly_type literal
    expect(content).toContain("anomaly_type: 'duration_anomaly'");
    // create_security_alerts -> the real DepartmentEvent event_type literal it writes
    expect(content).toContain("event_type: 'security_alert'");
    // create_tickets -> the real, imported ticketService function it actually calls
    expect(content).toContain('createTicket(');
    expect(content).toContain("from '../../ticketService'");
  });
});
