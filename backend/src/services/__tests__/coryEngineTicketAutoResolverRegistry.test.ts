/**
 * T004 — cory-engine ticket auto-resolve cron wiring, registry-shape tests.
 *
 * Mirrors ticketCreatorAgentRegistry.test.ts's established mocking shape for
 * agentRegistrySeed.ts (the only existing precedent for testing this 2600+-line
 * registry) rather than re-testing the full seed. Also imports the now-exported
 * SCHEDULE_REGISTRY from aiOpsScheduler.ts directly (plan-audit cycle 2 finding: it was
 * module-private and no test file for that module existed yet — T004 added `export`).
 *
 * The hard requirement under test is the plan-audit cycle 1 fix: the new agent MUST be
 * seeded `enabled: false` so the cron cannot execute real writes against the 6,843-ticket
 * backlog before the human-reviewed --plan/--apply CLI sequence runs (see
 * execution-contract.md §3b). This is the single most safety-critical assertion in this
 * whole run's test suite — its absence must fail loudly, not silently default to true.
 */
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn(), findOne: jest.fn().mockResolvedValue(null) }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));

import * as fs from 'fs';
import * as path from 'path';
import AiAgent from '../../models/AiAgent';
import { seedAgentRegistry } from '../agentRegistrySeed';

// aiOpsScheduler.ts is deliberately NOT imported here — importing it transitively pulls
// in the full backend/src/models/index.ts association graph (via aiOrchestrator.ts ->
// campaignHealthScanner.ts), which breaks against the lightweight AiAgent mock above
// (jest.mock replaces the module for every importer, including models/index.ts's own
// `AiAgent.hasMany(...)` association wiring). Following this repo's own precedent in
// ticketCreatorAgentRegistry.test.ts (source-text traceability checks via
// fs.readFileSync rather than importing heavy module trees), SCHEDULE_REGISTRY's shape
// is verified by reading aiOpsScheduler.ts's actual exported source text below.

const mockFindOrCreate = AiAgent.findOrCreate as unknown as jest.Mock;
const mockUpdate = AiAgent.update as unknown as jest.Mock;

const REPO_ROOT = path.resolve(__dirname, '../../../../'); // backend/src/services/__tests__ -> repo root
const AGENT_NAME = 'CoryEngineTicketAutoResolver';

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

describe('AGENT_REGISTRY — CoryEngineTicketAutoResolver hold-until-reviewed gate', () => {
  it('is seeded with enabled:false on first creation — the load-bearing safety fix from plan-audit cycle 1', async () => {
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
    expect(call![0].defaults.schedule).toBe('25 */6 * * *');
  });

  it('source_file resolves to a real file on disk (traceability, matches PR #1468 Item 5\'s pattern extended to the file path)', async () => {
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

describe('aiOpsScheduler.ts SCHEDULE_REGISTRY — CoryEngineTicketAutoResolver cron entry (source-text check)', () => {
  const schedulerSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/services/aiOpsScheduler.ts'), 'utf8');

  it('SCHEDULE_REGISTRY const is exported (T004 prerequisite fix from plan-audit cycle 2)', () => {
    expect(schedulerSource).toMatch(/export const SCHEDULE_REGISTRY:/);
  });

  it('has exactly one entry for CoryEngineTicketAutoResolver with the runner wired and a schedule matching the AGENT_REGISTRY row', async () => {
    const entryMatches = schedulerSource.match(/agentName:\s*'CoryEngineTicketAutoResolver'/g) || [];
    expect(entryMatches.length).toBe(1);

    const entryLineMatch = schedulerSource.match(
      /\{\s*agentName:\s*'CoryEngineTicketAutoResolver',\s*hardcodedSchedule:\s*'([^']+)',\s*runner:\s*(\w+),/,
    );
    expect(entryLineMatch).not.toBeNull();
    const [, hardcodedSchedule, runnerName] = entryLineMatch!;
    expect(hardcodedSchedule).toBe('25 */6 * * *');
    expect(runnerName).toBe('runCoryEngineTicketAutoResolverAgent');

    await seedAgentRegistry();
    const call = findCreateCallFor(AGENT_NAME);
    expect(hardcodedSchedule).toBe(call![0].defaults.schedule);
  });

  it('imports runCoryEngineTicketAutoResolverAgent from aiOrchestrator.ts (the runner actually exists and is wired, not just referenced by name)', () => {
    expect(schedulerSource).toMatch(/runCoryEngineTicketAutoResolverAgent,?\s*\n/);
    const orchestratorSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/services/aiOrchestrator.ts'), 'utf8');
    expect(orchestratorSource).toMatch(/export async function runCoryEngineTicketAutoResolverAgent\(/);
  });

  it('does not modify the existing WorkforceTicketAutoResolver entry (pure addition)', () => {
    expect(schedulerSource).toContain(
      "{ agentName: 'WorkforceTicketAutoResolver', hardcodedSchedule: '15 */6 * * *', runner: runWorkforceTicketAutoResolverAgent, label: 'Workforce ticket auto-resolve (re-check + close on recovery)' }",
    );
  });
});
