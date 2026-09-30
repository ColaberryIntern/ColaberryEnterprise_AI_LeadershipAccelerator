const m = {
  schedule: jest.fn(),
  instrument: jest.fn(),
  nightly: jest.fn(),
  executor: jest.fn(),
  digest: jest.fn(),
};
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: (...a: unknown[]) => m.schedule(...a) } }));
jest.mock('../../cronInstrumentation', () => ({ instrumentCronJob: (...a: unknown[]) => m.instrument(...a) }));
jest.mock('../../growthJourney/runShadowDecisionsNightly', () => ({ runScheduledShadowDecisions: (...a: unknown[]) => m.nightly(...a) }));
jest.mock('../../growthJourney/execution/runExecutor', () => ({ runExecutor: (...a: unknown[]) => m.executor(...a) }));
// The sender's constants are the real ones (the cron registers on them); only its runner is a spy.
jest.mock('../../briefings/handoffDigestSender', () => ({ ...jest.requireActual('../../briefings/handoffDigestSender'), sendHandoffDigests: (...a: unknown[]) => m.digest(...a) }));
jest.mock('../../../models', () => ({}));
jest.mock('../../emailService', () => ({}));
jest.mock('../../executiveBriefingService', () => ({}));

import * as fs from 'fs';
import * as path from 'path';
import { HANDOFF_DIGEST_AGENT, HANDOFF_DIGEST_SCHEDULE } from '../../briefings/handoffDigestSender';
import { registerGrowthJourneyCrons } from '../growthJourneyCrons';

/**
 * T513 — the Growth Journey crons live in their own module now: the Phase 4
 * T408 shadow block moved out of `schedulerService.ts` verbatim (the byte
 * compare is in the evidence; the pins here hold the lines that matter), the
 * executor cron added beside it. Half the file is source-level, like the
 * scheduler's other cron guards, because importing the scheduler pulls in half
 * the service graph; the other half registers the crons for real against a
 * mocked node-cron and drives each callback once. T517 added the handoff
 * digest beside them: the one runner here that sends (staff mail, through
 * the guarded mailer), registered on the sender's own constants.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** The source without its comments - an import-direction guard reads code, and a header may name what it must not import. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const crons = read('services/scheduling/growthJourneyCrons.ts');
const scheduler = read('services/schedulerService.ts');
const registry = read('services/agentRegistry/growthJourneyAgents.ts');
const executor = read('services/growthJourney/execution/runExecutor.ts');

const NIGHTLY = { agent: 'GrowthJourneyShadowDecisions', schedule: '20 4 * * *' };
const EXECUTOR = { agent: 'GrowthJourneyExecutor', schedule: '*/15 14-22 * * 1-5' };
const DIGEST = { agent: 'GrowthJourneyHandoffDigest', schedule: '30 12 * * 1-5' };

/** The registry entry, from its agent_name to the next entry's. */
function registryEntry(agent: string): string {
  const at = registry.indexOf(`agent_name: '${agent}'`);
  expect(at).toBeGreaterThan(-1);
  const next = registry.indexOf('agent_name:', at + 20);
  return registry.slice(at, next === -1 ? undefined : next);
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.instrument.mockImplementation(async (_name: string, body: () => Promise<void>) => body());
  m.nightly.mockResolvedValue({ skipped: true, reason: 'journeyDecisions_off' });
  m.executor.mockResolvedValue({ status: 'skipped', reason: 'journeyExecution_off' });
  m.digest.mockResolvedValue({ status: 'skipped', reason: 'journeyHandoffs_off' });
});

describe('the extraction (acceptance 4, 5)', () => {
  it('the scheduler calls the module once, at the position the block held: after the three Explorer blocks, and names no journey agent itself', () => {
    expect(scheduler).toContain("import { registerGrowthJourneyCrons } from './scheduling/growthJourneyCrons';");
    expect(scheduler.split('registerGrowthJourneyCrons();').length - 1).toBe(1);
    expect(scheduler).not.toContain(NIGHTLY.agent);
    expect(scheduler).not.toContain(EXECUTOR.agent);
    expect(scheduler).not.toContain('runScheduledShadowDecisions');
    const call = scheduler.indexOf('registerGrowthJourneyCrons();');
    for (const explorer of ['ExplorerContentSync', 'ExplorerProfileRecompute', 'ExplorerGovernorDecide']) {
      const at = scheduler.indexOf(`instrumentCronJob('${explorer}'`);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(call);
    }
    // Textually after the recompute block CLOSES, as the shadow block was.
    const recompute = scheduler.indexOf("instrumentCronJob('ExplorerProfileRecompute'");
    const recomputeClose = scheduler.indexOf('  });', scheduler.indexOf('}).catch', recompute));
    expect(call).toBeGreaterThan(recomputeClose);
  });

  it('the moved block is gone from schedulerService.ts line for line (a count is not a regression property - main grows)', () => {
    // T520's gate: the sibling pin on server.ts (T514a) broke on the merge; this one was eight lines from breaking.
    for (const line of [
      '  // Growth Journey OS - the nightly shadow decisions (Phase 4 T408).',
      `  cron.schedule('${NIGHTLY.schedule}', () => {`,
      `    instrumentCronJob('${NIGHTLY.agent}', async () => {`,
      '      await runScheduledShadowDecisions();',
    ]) expect(scheduler).not.toContain(line);
  });

  it('the shadow block moved whole: its comment, schedule, wrapping, runner call and error line are in the module', () => {
    for (const line of [
      '  // Growth Journey OS - the nightly shadow decisions (Phase 4 T408).',
      '  // SHIPPED PAUSED, three times over: the agentRegistrySeed row is',
      `  cron.schedule('${NIGHTLY.schedule}', () => {`,
      `    instrumentCronJob('${NIGHTLY.agent}', async () => {`,
      '      await runScheduledShadowDecisions();',
      `      console.error('[Scheduler] ${NIGHTLY.agent} failed:', err);`,
    ]) expect(crons).toContain(line);
    expect(crons).toContain("import { runScheduledShadowDecisions } from '../growthJourney/runShadowDecisionsNightly';");
    expect(crons).toContain('export function registerGrowthJourneyCrons(): void {');
  });

  it('the module holds exactly three crons, each wrapped the house way, and the import direction is scheduler -> journey', () => {
    expect(crons.split('cron.schedule(').length - 1).toBe(3);
    expect(crons.split('instrumentCronJob(').length - 1).toBe(3);
    expect(code(read('services/growthJourney/handoffs/assigneeDigest.ts'))).not.toMatch(/schedulerService|cronInstrumentation|node-cron|scheduling\/|briefings\//);
    expect(executor).not.toMatch(/schedulerService|cronInstrumentation|node-cron|scheduling\//);
    expect(read('services/growthJourney/runShadowDecisionsNightly.ts')).not.toMatch(/schedulerService|cronInstrumentation|node-cron|scheduling\//);
  });
});

describe('the executor cron (acceptance 4)', () => {
  it('declares the SAME schedule and agent name as the batch exports and the registry seed carries', () => {
    expect(crons).toContain(`cron.schedule('${EXECUTOR.schedule}', () => {`);
    expect(crons).toContain(`instrumentCronJob('${EXECUTOR.agent}', async () => {`);
    expect(crons).toContain('      await runExecutor();');
    expect(executor).toContain(`export const EXECUTOR_AGENT = '${EXECUTOR.agent}';`);
    expect(executor).toContain(`export const EXECUTOR_SCHEDULE = '${EXECUTOR.schedule}';`);
    const entry = registryEntry(EXECUTOR.agent);
    expect(entry).toContain(`schedule: '${EXECUTOR.schedule}'`);
    expect(entry).toContain("source_file: 'backend/src/services/growthJourney/execution/runExecutor.ts'");
    expect(entry).toContain('enabled: false');
    expect(entry).toContain("category: 'outbound'");
  });

  it('business hours Central: every quarter hour, 14-22 UTC, Monday to Friday', () => {
    const [minute, hour, dom, month, dow] = EXECUTOR.schedule.split(' ');
    expect([minute, hour, dom, month, dow]).toEqual(['*/15', '14-22', '*', '*', '1-5']);
  });

  it('the cron module names no send path', () => {
    for (const fn of ['sendMail', 'sendRawEmail', 'triggerVoiceCall', 'sendSmsViaGhl', 'enrollLeadInSequence', 'enrollLeadsInCampaign', 'ScheduledEmail.create', 'sendNewLeadAlert', 'requestInstantCallback']) {
      expect(crons).not.toContain(fn);
    }
  });
});

describe('the digest cron (T517)', () => {
  it('registers on the sender\'s own constants, which are the values the registry seed carries: a weekday-morning schedule, category outbound, shipped disabled', () => {
    expect(HANDOFF_DIGEST_AGENT).toBe(DIGEST.agent);
    expect(HANDOFF_DIGEST_SCHEDULE).toBe(DIGEST.schedule);
    expect(crons).toContain('  cron.schedule(HANDOFF_DIGEST_SCHEDULE, () => {');
    expect(crons).toContain('    instrumentCronJob(HANDOFF_DIGEST_AGENT, async () => {');
    expect(crons).toContain('      await sendHandoffDigests();');
    expect(crons).toContain("import { HANDOFF_DIGEST_AGENT, HANDOFF_DIGEST_SCHEDULE, sendHandoffDigests } from '../briefings/handoffDigestSender';");
    const entry = registryEntry(DIGEST.agent);
    expect(entry).toContain(`schedule: '${DIGEST.schedule}'`);
    expect(entry).toContain("source_file: 'backend/src/services/briefings/handoffDigestSender.ts'");
    expect(entry).toContain('enabled: false');
    expect(entry).toContain("category: 'outbound'");
    expect(DIGEST.schedule.split(' ')).toEqual(['30', '12', '*', '*', '1-5']);
  });
});

describe('registration, for real, against a mocked node-cron', () => {
  it('registers the three crons on their schedules, in order, and each callback runs its runner once under its agent name', async () => {
    registerGrowthJourneyCrons();
    expect(m.schedule.mock.calls.map((c) => c[0])).toEqual([NIGHTLY.schedule, EXECUTOR.schedule, DIGEST.schedule]);
    for (const [, callback] of m.schedule.mock.calls) (callback as () => void)();
    await new Promise((r) => setImmediate(r));
    expect(m.instrument.mock.calls.map((c) => c[0])).toEqual([NIGHTLY.agent, EXECUTOR.agent, DIGEST.agent]);
    expect(m.nightly).toHaveBeenCalledTimes(1);
    expect(m.executor).toHaveBeenCalledTimes(1);
    expect(m.executor).toHaveBeenCalledWith();
    expect(m.digest).toHaveBeenCalledTimes(1);
    expect(m.digest).toHaveBeenCalledWith();
  });

  it('a runner that throws is caught at the cron boundary and logged; the process does not fall over', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    m.instrument.mockRejectedValue(new Error('boom'));
    registerGrowthJourneyCrons();
    for (const [, callback] of m.schedule.mock.calls) (callback as () => void)();
    await new Promise((r) => setImmediate(r));
    expect(error.mock.calls.map((c) => c[0])).toEqual([`[Scheduler] ${NIGHTLY.agent} failed:`, `[Scheduler] ${EXECUTOR.agent} failed:`, `[Scheduler] ${DIGEST.agent} failed:`]);
    error.mockRestore();
  });

  it('registering never runs a runner by itself', () => {
    registerGrowthJourneyCrons();
    expect(m.nightly).not.toHaveBeenCalled();
    expect(m.executor).not.toHaveBeenCalled();
    expect(m.digest).not.toHaveBeenCalled();
    expect(m.instrument).not.toHaveBeenCalled();
  });
});
