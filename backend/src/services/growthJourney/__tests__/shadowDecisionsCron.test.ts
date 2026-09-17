import * as fs from 'fs';
import * as path from 'path';

/**
 * T408 guards, source-level like `governorCron.test.ts`: the property under
 * test is "this cron block registers the job the house way, after the three
 * Explorer blocks, and contains no send call" - a property of the text - and
 * importing schedulerService pulls in nodemailer, the database and half the
 * service graph.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const scheduler = read('services/schedulerService.ts');
const registry = read('services/agentRegistrySeed.ts');
const runner = read('services/growthJourney/runShadowDecisionsNightly.ts');

const AGENT = 'GrowthJourneyShadowDecisions';
const SCHEDULE = '20 4 * * *';

/** The nightly block: from its cron.schedule line to the end of the block. */
function cronBlock(): string {
  const at = scheduler.indexOf(`instrumentCronJob('${AGENT}'`);
  expect(at).toBeGreaterThan(-1);
  return scheduler.slice(Math.max(0, at - 1500), at + 400);
}

/** The registry entry, from its agent_name to the next entry's. */
function registryEntry(): string {
  const at = registry.indexOf(`agent_name: '${AGENT}'`);
  expect(at).toBeGreaterThan(-1);
  const next = registry.indexOf('agent_name:', at + 20);
  return registry.slice(at, next);
}

describe('registered the house way', () => {
  it('is wrapped in instrumentCronJob and calls runScheduledShadowDecisions and nothing else', () => {
    const block = cronBlock();
    expect(block).toContain(`instrumentCronJob('${AGENT}'`);
    expect(block).toContain('await runScheduledShadowDecisions();');
    expect(scheduler).toContain("import { runScheduledShadowDecisions } from './growthJourney/runShadowDecisionsNightly';");
  });

  it('is registered in agentRegistrySeed, PAUSED (enabled: false), as a cron-triggered behavioral processor', () => {
    const entry = registryEntry();
    expect(entry).toContain("trigger_type: 'cron'");
    expect(entry).toContain("category: 'behavioral'");
    expect(entry).toContain("agent_type: 'scheduled_processor'");
    expect(entry).toContain('enabled: false');
    expect(entry).toContain("source_file: 'backend/src/services/growthJourney/runShadowDecisionsNightly.ts'");
  });

  it('declares the SAME schedule in both places, and the runner names it too', () => {
    // A registry entry that disagrees with the real cron misleads whoever reads
    // Admin > Agents to decide whether a job has run.
    expect(cronBlock()).toContain(`cron.schedule('${SCHEDULE}'`);
    expect(registryEntry()).toContain(`schedule: '${SCHEDULE}'`);
    expect(runner).toContain(`export const SHADOW_DECISIONS_SCHEDULE = '${SCHEDULE}';`);
    expect(runner).toContain(`export const SHADOW_DECISIONS_AGENT = '${AGENT}';`);
  });

  it('runs AFTER the three Explorer blocks, not inside any of them', () => {
    // 02:50 content sync, 03:20 recompute, 03:50 Governor - the learner brands
    // decide on scores recomputed the same night.
    const nightly = scheduler.indexOf(`instrumentCronJob('${AGENT}'`);
    for (const explorer of ['ExplorerContentSync', 'ExplorerProfileRecompute', 'ExplorerGovernorDecide']) {
      const at = scheduler.indexOf(`instrumentCronJob('${explorer}'`);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(nightly);
    }
    // Textually after the recompute block CLOSES: the recompute's own `});` closers come before our schedule line.
    const recompute = scheduler.indexOf("instrumentCronJob('ExplorerProfileRecompute'");
    const recomputeClose = scheduler.indexOf('  });', scheduler.indexOf('}).catch', recompute));
    expect(recomputeClose).toBeGreaterThan(recompute);
    expect(scheduler.indexOf(`cron.schedule('${SCHEDULE}'`)).toBeGreaterThan(recomputeClose);
    // And the hour says the same: 04:20 is after 03:50.
    expect(SCHEDULE).toMatch(/^20 4 /);
  });
});

describe('the cron DECIDES ONLY - it must never send', () => {
  const SEND_PATHS = ['sendMail', 'sendRawEmail', 'triggerVoiceCall', 'sendSmsViaGhl', 'enrollLeadInSequence', 'ScheduledEmail.create', 'sendNewLeadAlert', 'requestInstantCallback'];

  it.each(SEND_PATHS)('the cron block contains no %s', (fn) => {
    expect(cronBlock()).not.toContain(fn);
  });

  it.each(SEND_PATHS)('the runner contains no %s', (fn) => {
    expect(runner).not.toContain(fn);
  });

  it('names no send function that emailService exports', () => {
    const emailSrc = read('services/emailService.ts');
    const sendFns = Array.from(emailSrc.matchAll(/^export (?:async )?function (send[A-Za-z]+)/gm)).map((m) => m[1]);
    expect(sendFns.length).toBeGreaterThan(20);
    for (const fn of sendFns) {
      expect(runner).not.toContain(fn);
      expect(cronBlock()).not.toContain(fn);
    }
  });

  it('the import direction is scheduler -> growthJourney, never back', () => {
    expect(runner).not.toMatch(/schedulerService|cronInstrumentation|node-cron/);
    const imports = Array.from(runner.matchAll(/^import .* from '([^']+)';/gm)).map((m) => m[1]);
    expect(imports.sort()).toEqual([
      '../../config/env',
      '../../config/growthJourneyFlags',
      '../../models',
      '../../models/GrowthJourneyHandoff',
      '../../utils/errorClassifier',
      '../../utils/piiRedaction',
      './decisionService',
      './handoffs/handoffService',
      './outcomes/nightlyOutcomesPass',
    ]);
  });
});
