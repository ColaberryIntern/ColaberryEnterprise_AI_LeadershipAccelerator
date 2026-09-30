/**
 * T026 — the publishing queue tick's cron wiring, registry-shape tests.
 *
 * Same shape as corybrainInitiativeTicketAutoResolverRegistry.test.ts, for the same class of
 * risk: a cron entry that runs a queue worker. The safety-critical assertion is that the
 * agent row is seeded `enabled: false` - instrumentCronJob skips a disabled agent, so this is
 * the hold-until-reviewed gate; it is flipped by one production UPDATE after the queue has
 * been watched on dev, never by a deploy.
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
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const AGENT_NAME = 'MarketingPublishingWorker';

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [{ ...defaults, config: {}, update: jest.fn().mockResolvedValue(undefined) }, true]);
  mockUpdate.mockResolvedValue([0]);
});

function createCall() {
  return mockFindOrCreate.mock.calls.find((call) => call[0]?.where?.agent_name === AGENT_NAME);
}

describe('AGENT_REGISTRY — MarketingPublishingWorker', () => {
  it('is seeded enabled:false (the hold-until-reviewed gate)', async () => {
    await seedAgentRegistry();
    const call = createCall();
    expect(call).toBeDefined();
    expect(call![0].defaults.enabled).toBe(false);
  });

  it('is a cron every minute in the outbound category, so the global kill switch disables it too', async () => {
    await seedAgentRegistry();
    const d = createCall()![0].defaults;
    expect(d.trigger_type).toBe('cron');
    expect(d.schedule).toBe('* * * * *');
    // launchSafety.activateKillSwitch() sets enabled=false for every agent in these categories.
    expect(['email', 'sms', 'voice', 'outbound', 'messaging']).toContain(d.category);
  });

  it('source_file resolves to a real file on disk', async () => {
    await seedAgentRegistry();
    const sourceFile = createCall()![0].defaults.source_file;
    expect(fs.existsSync(path.join(REPO_ROOT, sourceFile))).toBe(true);
  });
});

describe('aiOpsScheduler.ts DYNAMIC_SCHEDULE_REGISTRY — MarketingPublishingWorker (source-text check)', () => {
  const schedulerSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/services/aiOpsScheduler.ts'), 'utf8');

  it('has exactly one entry, dynamically importing runDueJobs, with a schedule matching the seed row', async () => {
    expect((schedulerSource.match(/agentName:\s*'MarketingPublishingWorker'/g) || []).length).toBe(1);
    const m = schedulerSource.match(/agentName:\s*'MarketingPublishingWorker',\s*hardcodedSchedule:\s*'([^']+)',\s*dynamicImport:\s*async \(\) => \{\s*const \{ runDueJobs \} = await import\('\.\/publishing\/publishingWorker'\);/);
    expect(m).not.toBeNull();
    await seedAgentRegistry();
    expect(m![1]).toBe(createCall()![0].defaults.schedule);
  });

  it('the imported runner exists and takes no required arguments', () => {
    const workerSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/services/publishing/publishingWorker.ts'), 'utf8');
    expect(workerSource).toMatch(/export async function runDueJobs\(overrides: Partial<WorkerDeps> = \{\}\)/);
  });
});
