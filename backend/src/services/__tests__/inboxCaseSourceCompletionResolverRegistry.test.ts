/**
 * T005 — InboxCaseEngine source-completion resolver cron wiring, registry-shape tests.
 *
 * Mirrors coryEngineTicketAutoResolverRegistry.test.ts's established mocking shape
 * exactly (same reasons: AiAgent mocked lightly, aiOpsScheduler.ts NOT imported
 * directly to avoid pulling the full models/index.ts association graph, its
 * SCHEDULE_REGISTRY entry verified via source-text checks instead).
 *
 * The hard requirement under test is the same hold-until-reviewed gate this session's
 * two earlier fixes both carry: the new agent MUST be seeded `enabled: false` so the
 * cron cannot execute real writes against the 627-ticket backlog before the
 * human-reviewed --plan/--apply CLI sequence runs (see execution-contract.md).
 */
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn(), findOne: jest.fn().mockResolvedValue(null) }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));

import * as fs from 'fs';
import * as path from 'path';
import AiAgent from '../../models/AiAgent';
import { seedAgentRegistry } from '../agentRegistrySeed';

const mockFindOrCreate = AiAgent.findOrCreate as unknown as jest.Mock;
const mockUpdate = AiAgent.update as unknown as jest.Mock;

const REPO_ROOT = path.resolve(__dirname, '../../../../'); // backend/src/services/__tests__ -> repo root
const AGENT_NAME = 'InboxCaseSourceCompletionResolver';

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

describe('AGENT_REGISTRY — InboxCaseSourceCompletionResolver hold-until-reviewed gate', () => {
  it('is seeded with enabled:false on first creation — the same safety pattern as CoryEngineTicketAutoResolver/CoryBrainInitiativeTicketAutoResolver', async () => {
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
    expect(call![0].defaults.schedule).toBe('19 * * * *');
  });

  it("source_file resolves to a real file on disk (traceability)", async () => {
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

describe('aiOpsScheduler.ts SCHEDULE_REGISTRY — InboxCaseSourceCompletionResolver cron entry (source-text check)', () => {
  const schedulerSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/services/aiOpsScheduler.ts'), 'utf8');

  it('has exactly one entry for InboxCaseSourceCompletionResolver with the runner wired and a schedule matching the AGENT_REGISTRY row', async () => {
    const entryMatches = schedulerSource.match(/agentName:\s*'InboxCaseSourceCompletionResolver'/g) || [];
    expect(entryMatches.length).toBe(1);

    const entryLineMatch = schedulerSource.match(
      /\{\s*agentName:\s*'InboxCaseSourceCompletionResolver',\s*hardcodedSchedule:\s*'([^']+)',\s*runner:\s*(\w+),/,
    );
    expect(entryLineMatch).not.toBeNull();
    const [, hardcodedSchedule, runnerName] = entryLineMatch!;
    expect(hardcodedSchedule).toBe('19 * * * *');
    expect(runnerName).toBe('runInboxCaseSourceCompletionResolverAgent');

    await seedAgentRegistry();
    const call = findCreateCallFor(AGENT_NAME);
    expect(hardcodedSchedule).toBe(call![0].defaults.schedule);
  });

  it('imports runInboxCaseSourceCompletionResolverAgent from aiOrchestrator.ts (the runner actually exists and is wired, not just referenced by name)', () => {
    expect(schedulerSource).toMatch(/runInboxCaseSourceCompletionResolverAgent,?\s*\n/);
    const orchestratorSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/services/aiOrchestrator.ts'), 'utf8');
    expect(orchestratorSource).toMatch(/export async function runInboxCaseSourceCompletionResolverAgent\(/);
  });

  it('does not modify the existing CoryBrainInitiativeTicketAutoResolver entry (pure addition)', () => {
    expect(schedulerSource).toContain(
      "{ agentName: 'CoryBrainInitiativeTicketAutoResolver', hardcodedSchedule: '40 */6 * * *', runner: runCoryBrainInitiativeTicketAutoResolverAgent, label: 'CoryBrain initiative-linked ticket sync (re-check + close on initiative terminal state)' }",
    );
  });

  it("'19 * * * *' does not exactly duplicate any OTHER schedule string already present in aiOpsScheduler.ts", () => {
    const otherEntries = schedulerSource.match(/hardcodedSchedule:\s*'19 \* \* \* \*'/g) || [];
    expect(otherEntries.length).toBe(1); // only this run's own new entry
  });
});

describe("no time-based fallback closure — regression guard on the new agent's own source", () => {
  it('the resolver module contains none of the tokens a time-based close gate would use', () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'backend/src/intelligence/autonomy/inboxCaseSourceCompletionResolver.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/daysSince/i);
    expect(source).not.toMatch(/ageInDays/i);
    expect(source).not.toMatch(/created_at\s*[<>]/);
    expect(source).not.toMatch(/createdAt\s*[<>]/);
  });
});
