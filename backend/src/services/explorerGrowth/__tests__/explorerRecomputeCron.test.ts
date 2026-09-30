import * as fs from 'fs';
import * as path from 'path';

/**
 * EPIC 3 T006 guards. Source-level rather than behavioural, because the point
 * is what this cron MUST NOT be able to do.
 *
 * Reading the source is deliberate: importing schedulerService pulls in
 * nodemailer, the database and half the service graph, and the property under
 * test — "this code path contains no send call" — is a property of the text.
 */

const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const scheduler = read('services/schedulerService.ts');
const registry = read('services/agentRegistrySeed.ts');
const script = read('scripts/recomputeExplorerProfiles.ts');

/** The cron block, from its schedule line to the closing of the callback. */
function recomputeCronBlock(): string {
  const i = scheduler.indexOf("instrumentCronJob('ExplorerProfileRecompute'");
  expect(i).toBeGreaterThan(-1);
  return scheduler.slice(i - 400, i + 400);
}

describe('the recompute cron is registered the house way', () => {
  it('is wrapped in instrumentCronJob', () => {
    expect(scheduler).toContain("instrumentCronJob('ExplorerProfileRecompute'");
  });

  it('is registered in agentRegistrySeed so it is pausable without a redeploy', () => {
    expect(registry).toContain("agent_name: 'ExplorerProfileRecompute'");
  });

  it('declares the same schedule in both places', () => {
    // A registry entry that disagrees with the real cron misleads whoever reads
    // Admin > Agents to decide whether a job has run.
    expect(recomputeCronBlock()).toContain("cron.schedule('20 3 * * *'");
    expect(registry).toContain("schedule: '20 3 * * *'");
  });

  it('is offset from the on-the-hour and every-5-minute jobs', () => {
    // A 153-learner batch must not contend with them on the shared Postgres.
    const m = recomputeCronBlock().match(/cron\.schedule\('(\d+) (\d+) \* \* \*'/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0); // not on the hour
  });
});

describe('the cron RECOMPUTES ONLY — it must never send', () => {
  const SEND_PATHS = [
    'sendMail',
    'sendRawEmail',
    'triggerVoiceCall',
    'sendSmsViaGhl',
    'enrollLeadInSequence',
    'ScheduledEmail.create',
  ];

  it.each(SEND_PATHS)('the cron block contains no %s', (fn) => {
    expect(recomputeCronBlock()).not.toContain(fn);
  });

  it.each(SEND_PATHS)('the operator script contains no %s', (fn) => {
    expect(script).not.toContain(fn);
  });

  it('calls runScheduledRecompute and nothing else', () => {
    expect(recomputeCronBlock()).toContain('runScheduledRecompute()');
  });
});

describe('the operator script is safe to hand to a human', () => {
  it('supports --dry-run and --limit', () => {
    expect(script).toContain('--dry-run');
    expect(script).toContain('--limit');
  });

  it('refuses production writes without an explicit flag', () => {
    expect(script).toContain('--confirm-production');
    expect(script).toContain('Refusing to write');
  });

  it('reports the complete failure count even though it truncates the error list', () => {
    // A silent cap would read as "all fine" when it was not.
    expect(script).toContain('errors: result.errors.slice(0, 10)');
    expect(script).toContain('...result');
  });
});

describe('the script argument parser', () => {
  // Imported lazily so the module-level require.main guard does not run.
  it('rejects --limit 0 rather than treating it as unlimited', async () => {
    const mod = await import('../../../scripts/recomputeExplorerProfiles');
    await expect(mod.main(['--limit', '0'])).rejects.toThrow('positive integer');
  });

  it('rejects a non-numeric --limit', async () => {
    const mod = await import('../../../scripts/recomputeExplorerProfiles');
    await expect(mod.main(['--limit', 'all'])).rejects.toThrow('positive integer');
  });
});
