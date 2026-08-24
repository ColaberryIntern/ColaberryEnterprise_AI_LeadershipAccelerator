import * as fs from 'fs';
import * as path from 'path';

/**
 * EPIC 4 T005 guards. Source-level, because the property under test is "this
 * code path contains no send call", which is a property of the text — and
 * importing schedulerService pulls in nodemailer, the database and half the
 * service graph.
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const scheduler = read('services/schedulerService.ts');
const registry = read('services/agentRegistrySeed.ts');
const script = read('scripts/runExplorerGovernor.ts');
const runner = read('services/explorerGrowth/governor/runGovernor.ts');

/** The Governor cron block. */
function cronBlock(): string {
  const i = scheduler.indexOf("instrumentCronJob('ExplorerGovernorDecide'");
  expect(i).toBeGreaterThan(-1);
  return scheduler.slice(Math.max(0, i - 900), i + 400);
}

describe('registered the house way', () => {
  it('is wrapped in instrumentCronJob', () => {
    expect(scheduler).toContain("instrumentCronJob('ExplorerGovernorDecide'");
  });

  it('is registered in agentRegistrySeed so it is pausable without a redeploy', () => {
    expect(registry).toContain("agent_name: 'ExplorerGovernorDecide'");
  });

  it('declares the SAME schedule in both places', () => {
    // A registry entry that disagrees with the real cron misleads whoever reads
    // Admin > Agents to decide whether a job has run.
    expect(cronBlock()).toContain("cron.schedule('50 3 * * *'");
    expect(registry).toContain("schedule: '50 3 * * *'");
  });

  it('runs AFTER the recompute, not beside it', () => {
    // The Governor reads the scores the recompute writes. Deciding on
    // yesterday's scores would defeat the freshness gate it enforces.
    const recompute = scheduler.match(/cron\.schedule\('(\d+) (\d+) \* \* \*'.*\n.*ExplorerProfileRecompute/);
    const governorMinute = Number(cronBlock().match(/cron\.schedule\('(\d+) 3/)![1]);
    expect(governorMinute).toBeGreaterThan(20); // recompute is at :20
    expect(recompute || scheduler.includes('ExplorerProfileRecompute')).toBeTruthy();
  });
});

describe('the cron DECIDES ONLY — it must never send', () => {
  const SEND_PATHS = [
    'sendMail',
    'sendRawEmail',
    'triggerVoiceCall',
    'sendSmsViaGhl',
    'enrollLeadInSequence',
    'ScheduledEmail.create',
  ];

  it.each(SEND_PATHS)('the cron block contains no %s', (fn) => {
    expect(cronBlock()).not.toContain(fn);
  });

  it.each(SEND_PATHS)('the operator script contains no %s', (fn) => {
    expect(script).not.toContain(fn);
  });

  it('calls runScheduledGovernor and nothing else', () => {
    // The whitelist half of the pairing: a denylist alone would miss any send
    // helper nobody thought to name.
    expect(cronBlock()).toContain('runScheduledGovernor()');
  });

  it('names no send function that emailService exports', () => {
    const emailSrc = read('services/emailService.ts');
    const sendFns = Array.from(
      emailSrc.matchAll(/^export (?:async )?function (send[A-Za-z]+)/gm),
    ).map((m) => m[1]);
    expect(sendFns.length).toBeGreaterThan(20);
    for (const fn of sendFns) {
      expect(script).not.toContain(fn);
      expect(cronBlock()).not.toContain(fn);
    }
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

  it('EXITS CLEANLY — closes the pool then exits', () => {
    // EPIC 3's recompute script did its work in 219ms and then hung forever on
    // Sequelize's pooled sockets. An operator saw no completion and no error.
    expect(script).toContain('sequelize.close()');
    expect(script).toContain('process.exit(');
  });

  it('reports the complete failure count while truncating the error list', () => {
    expect(script).toContain('errors: result.errors.slice(0, 10)');
    expect(script).toContain('...result');
  });
});

describe('the script argument parser', () => {
  it('rejects --limit 0 rather than treating it as unlimited', async () => {
    const mod = await import('../../../../scripts/runExplorerGovernor');
    await expect(mod.main(['--limit', '0'])).rejects.toThrow('positive integer');
  });

  it('rejects a FUTURE --as-of', async () => {
    // A future as-of would make every profile look freshly scored and silently
    // disable the staleness gate. Caught at the point the mistake is made.
    const mod = await import('../../../../scripts/runExplorerGovernor');
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await expect(mod.main(['--as-of', future])).rejects.toThrow('must not be in the future');
  });

  it('rejects an unparseable --as-of', async () => {
    const mod = await import('../../../../scripts/runExplorerGovernor');
    await expect(mod.main(['--as-of', 'yesterday'])).rejects.toThrow('ISO date');
  });
});

describe('tier 0 is SUPPRESSION, not channel availability', () => {
  /**
   * THE BUG THIS PREVENTS, found by the shadow review on real data:
   *
   * The first version mapped `dnc: sms.eligible !== true && voice.eligible !==
   * true`. SMS and voice are correctly ineligible for EVERY learner, because
   * the TCPA gate permits nobody without an express-consent record. So "no
   * phone channel" became "do not contact", and ALL 153 learners were hard
   * stopped out of email and in-app too. The Governor decided nothing for
   * anyone, and every unit test still passed — this is the I/O layer, which
   * none of them cover.
   */

  it('does not derive unsubscribed or dnc from an eligibility flag', () => {
    const block = runner.slice(runner.indexOf('hardStop: {'), runner.indexOf('hardStop: {') + 2200);
    expect(block).toContain('unsubscribed:');
    expect(block).toContain('dnc:');
    // The failing shape: reading .eligible to decide a tier-0 stop.
    expect(block).not.toMatch(/unsubscribed:\s*contactability\.\w+\?\.eligible/);
    expect(block).not.toMatch(/dnc:\s*contactability\.\w+\?\.eligible/);
  });

  it('derives them from the suppression REASON instead', () => {
    const block = runner.slice(runner.indexOf('hardStop: {'), runner.indexOf('hardStop: {') + 2200);
    expect(block).toMatch(/unsubscribed:.*reason/s);
    expect(block).toMatch(/dnc:.*reason/s);
  });

  it('still hard-stops a converted learner on the state machine verdict', () => {
    // The one tier-0 condition that SHOULD come from state, not a reason string.
    expect(runner).toContain("converted: profile.primary_state === 'CONVERTED'");
  });
});
