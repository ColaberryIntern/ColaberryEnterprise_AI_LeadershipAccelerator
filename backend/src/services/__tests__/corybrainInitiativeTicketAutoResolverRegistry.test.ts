/**
 * T004 — CoryBrain initiative-ticket reconciliation cron wiring, registry-shape tests.
 *
 * Mirrors coryEngineTicketAutoResolverRegistry.test.ts's established mocking shape
 * (PR #1531) for the identical class of problem.
 *
 * The hard requirement under test is the same hold-until-reviewed gate PR #1531's own
 * plan-audit cycle 1 required: the new agent MUST be seeded `enabled: false` so the
 * cron cannot execute real writes against the 1,323-ticket resolvable backlog (of
 * 1,348 total CoryBrain tickets stuck in `backlog`) before the human-reviewed
 * --plan/--apply CLI sequence runs (see execution-contract.md). This is the single
 * most safety-critical assertion in this task's suite — its absence must fail loudly,
 * not silently default to true.
 */
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn(), findOne: jest.fn().mockResolvedValue(null) }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));

import * as fs from 'fs';
import * as path from 'path';
import AiAgent from '../../models/AiAgent';
import { seedAgentRegistry } from '../agentRegistrySeed';

// aiOpsScheduler.ts is deliberately NOT imported here — see
// coryEngineTicketAutoResolverRegistry.test.ts's own header for why (importing it
// transitively pulls in the full models/index.ts association graph, which breaks
// against the lightweight AiAgent mock above). SCHEDULE_REGISTRY's shape is verified by
// reading aiOpsScheduler.ts's actual exported source text below, following the same
// established precedent.

const mockFindOrCreate = AiAgent.findOrCreate as unknown as jest.Mock;
const mockUpdate = AiAgent.update as unknown as jest.Mock;

const REPO_ROOT = path.resolve(__dirname, '../../../../'); // backend/src/services/__tests__ -> repo root
const AGENT_NAME = 'CoryBrainInitiativeTicketAutoResolver';

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

describe('AGENT_REGISTRY — CoryBrainInitiativeTicketAutoResolver hold-until-reviewed gate', () => {
  it('is seeded with enabled:false on first creation — the same safety gate PR #1531 established for this class of resolver', async () => {
    await seedAgentRegistry();

    const call = findCreateCallFor(AGENT_NAME);
    expect(call).toBeDefined();
    expect(call!.length).toBeGreaterThan(0);
    expect(call![0].defaults.enabled).toBe(false);
  });

  it('carries trigger_type cron and the schedule matching its SCHEDULE_REGISTRY entry', async () => {
    await seedAgentRegistry();

    const call = findCreateCallFor(AGENT_NAME);
    expect(call![0].defaults.trigger_type).toBe('cron');
    expect(call![0].defaults.schedule).toBe('40 */6 * * *');
  });

  it('source_file resolves to a real file on disk', async () => {
    await seedAgentRegistry();

    const call = findCreateCallFor(AGENT_NAME);
    const sourceFile = call![0].defaults.source_file;
    expect(typeof sourceFile).toBe('string');
    const absolutePath = path.join(REPO_ROOT, sourceFile);
    expect(fs.existsSync(absolutePath)).toBe(true);
  });

  it('carries a non-empty, deduplicated tools_granted array (same shape rule as every other registry entry)', async () => {
    await seedAgentRegistry();

    const call = findCreateCallFor(AGENT_NAME);
    const toolsGranted = call![0].defaults.tools_granted;
    expect(Array.isArray(toolsGranted)).toBe(true);
    expect(toolsGranted.length).toBeGreaterThan(0);
    expect(new Set(toolsGranted).size).toBe(toolsGranted.length);
  });
});

describe('aiOpsScheduler.ts SCHEDULE_REGISTRY — CoryBrainInitiativeTicketAutoResolver cron entry (source-text check)', () => {
  const schedulerSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/services/aiOpsScheduler.ts'), 'utf8');

  it('has exactly one entry for CoryBrainInitiativeTicketAutoResolver with the runner wired and a schedule matching the AGENT_REGISTRY row', async () => {
    const entryMatches = schedulerSource.match(/agentName:\s*'CoryBrainInitiativeTicketAutoResolver'/g) || [];
    expect(entryMatches.length).toBe(1);

    const entryLineMatch = schedulerSource.match(
      /\{\s*agentName:\s*'CoryBrainInitiativeTicketAutoResolver',\s*hardcodedSchedule:\s*'([^']+)',\s*runner:\s*(\w+),/,
    );
    expect(entryLineMatch).not.toBeNull();
    const [, hardcodedSchedule, runnerName] = entryLineMatch!;
    expect(hardcodedSchedule).toBe('40 */6 * * *');
    expect(runnerName).toBe('runCoryBrainInitiativeTicketAutoResolverAgent');

    await seedAgentRegistry();
    const call = findCreateCallFor(AGENT_NAME);
    expect(hardcodedSchedule).toBe(call![0].defaults.schedule);
  });

  it('is staggered 15 minutes after CoryEngineTicketAutoResolver\'s "25 */6 * * *" cron, avoiding same-minute contention', () => {
    expect(schedulerSource).toContain("hardcodedSchedule: '25 */6 * * *'"); // CoryEngineTicketAutoResolver
    expect(schedulerSource).toContain("hardcodedSchedule: '40 */6 * * *'"); // this resolver, +15 min
  });

  it('imports runCoryBrainInitiativeTicketAutoResolverAgent from aiOrchestrator.ts (the runner actually exists and is wired, not just referenced by name)', () => {
    expect(schedulerSource).toMatch(/runCoryBrainInitiativeTicketAutoResolverAgent,?\s*\n/);
    const orchestratorSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/services/aiOrchestrator.ts'), 'utf8');
    expect(orchestratorSource).toMatch(/export async function runCoryBrainInitiativeTicketAutoResolverAgent\(/);
  });

  it('does not modify the existing CoryEngineTicketAutoResolver or WorkforceTicketAutoResolver entries (pure addition)', () => {
    expect(schedulerSource).toContain(
      "{ agentName: 'CoryEngineTicketAutoResolver', hardcodedSchedule: '25 */6 * * *', runner: runCoryEngineTicketAutoResolverAgent, label: 'cory-engine ticket auto-resolve (re-check + close on recovery)' }",
    );
    expect(schedulerSource).toContain(
      "{ agentName: 'WorkforceTicketAutoResolver', hardcodedSchedule: '15 */6 * * *', runner: runWorkforceTicketAutoResolverAgent, label: 'Workforce ticket auto-resolve (re-check + close on recovery)' }",
    );
  });
});
