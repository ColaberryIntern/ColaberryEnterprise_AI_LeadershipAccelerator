import * as fs from 'fs';
import * as path from 'path';

/**
 * EPIC 4's defining property: THE GOVERNOR DECIDES, IT NEVER SENDS.
 *
 * WHY THIS IS A WHITELIST. The plan inherited EPIC 3's denylist of six strings
 * (`sendMail`, `sendRawEmail`, `triggerVoiceCall`, `sendSmsViaGhl`,
 * `enrollLeadInSequence`, `ScheduledEmail.create`). The plan auditor found that
 * `emailService.ts` exports TWENTY-SIX `send*` functions, and only one of them
 * is in that list — so a generator importing `sendDigestEmail` or
 * `sendInterestEmail` would pass every "zero sends" check in the plan.
 *
 * EPIC 3's equivalent test was safe only because it paired its denylist with a
 * whitelist ("calls runScheduledRecompute and nothing else"). This restores
 * that pairing and makes it structural: the governor may import from an
 * explicitly allowed set, and nothing else. A new dependency is a deliberate
 * decision that fails this test until someone adds it and says why.
 *
 * The denylist below is DERIVED FROM SOURCE rather than hardcoded, so adding a
 * 27th send function to emailService cannot silently widen what the governor is
 * allowed to reach.
 */

const GOVERNOR_DIR = path.join(__dirname, '..');
const SERVICES_DIR = path.join(__dirname, '..', '..', '..');

/** Every .ts file in the governor tree, tests excluded. */
function governorSourceFiles(dir: string = GOVERNOR_DIR): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...governorSourceFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Module specifiers a file imports. */
function importsOf(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  return Array.from(src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
}

/**
 * What the Governor is allowed to depend on.
 *
 * Deliberately narrow. Anything reaching outward — a mailer, a queue, a
 * campaign engine — is absent, so adding one is a visible, arguable change
 * rather than an import nobody notices in review.
 */
const ALLOWED_IMPORT_PATTERNS: RegExp[] = [
  /^\.{1,2}\//,                              // within explorerGrowth / governor
  /^sequelize$/,
  /^\.\.\/\.\.\/\.\.\/types\//,
  /^\.\.\/\.\.\/\.\.\/config\/(env|database|explorerGrowthFlags)$/,
  /^\.\.\/\.\.\/\.\.\/models$/,
  /^\.\.\/\.\.\/\.\.\/utils\/piiRedaction$/,
  /^\.\.\/\.\.\/access\//,                   // entitlement + staff, read-only
  /^\.\.\/\.\.\/consentService$/,            // consent verdicts, read-only
];

/** Modules the Governor must never import, whatever they export. */
const FORBIDDEN_MODULES = [
  'emailService',
  'schedulerService',
  'sequenceService',
  'synthflowService',
  'mandrill',
  'nodemailer',
  'communicationSafetyService',
];

describe('the Governor cannot reach a send path', () => {
  const files = governorSourceFiles();

  it('has source files to check (guards against a silently empty sweep)', () => {
    // A test that scans nothing passes forever. This is the assertion that
    // keeps the rest of this file honest.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN_MODULES)('imports nothing from %s', (mod) => {
    for (const f of files) {
      for (const spec of importsOf(f)) {
        expect(spec).not.toContain(mod);
      }
    }
  });

  it('imports ONLY from the allowed set — a whitelist, not a denylist', () => {
    const violations: string[] = [];
    for (const f of files) {
      for (const spec of importsOf(f)) {
        if (!ALLOWED_IMPORT_PATTERNS.some((p) => p.test(spec))) {
          violations.push(`${path.basename(f)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('names no send function that emailService actually exports', () => {
    // Derived from source, not hardcoded: a 27th send function cannot silently
    // fall outside this check.
    const emailSrc = fs.readFileSync(path.join(SERVICES_DIR, 'emailService.ts'), 'utf8');
    const sendFns = Array.from(
      emailSrc.matchAll(/^export (?:async )?function (send[A-Za-z]+)/gm),
    ).map((m) => m[1]);

    expect(sendFns.length).toBeGreaterThan(20); // sanity: the sweep found them

    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const fn of sendFns) {
        expect(src).not.toContain(fn);
      }
    }
  });

  it('contains no queue write or enqueue call', () => {
    const FORBIDDEN_CALLS = [
      'ScheduledEmail.create',
      'enrollLeadInSequence',
      'triggerVoiceCall',
      'sendSmsViaGhl',
      'guardedSendMail',
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const call of FORBIDDEN_CALLS) {
        expect(src).not.toContain(call);
      }
    }
  });
});
