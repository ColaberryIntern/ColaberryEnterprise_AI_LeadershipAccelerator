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
const CONTENT_DIR = path.join(__dirname, '..', '..', 'content');
const SERVICES_DIR = path.join(__dirname, '..', '..', '..');

/**
 * Every directory this guard sweeps.
 *
 * EPIC 5 ADDED `content/`, AND THE SCAN ROOT IS THE FIX — not the allow-list.
 * The allow-list already permitted `../content/…` through `/^\.\.\/[A-Za-z]/`,
 * so "extend the whitelist to content/" would have been a no-op that LOOKED
 * like a fix: the resolver could have imported `emailService` and every
 * assertion below would still have passed, because none of them would ever have
 * opened the file.
 *
 * Depth is unchanged by the addition: `content/` and `governor/` are both direct
 * children of `services/explorerGrowth/`, so `../../../models` and its siblings
 * resolve identically from either.
 */
const SWEPT_DIRS = [GOVERNOR_DIR, CONTENT_DIR];

/** Every .ts file in the swept trees, tests excluded. */
function governorSourceFiles(dirs: string[] = SWEPT_DIRS): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        out.push(...governorSourceFiles([full]));
      } else if (entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Module specifiers a file imports.
 *
 * TWO FAULTS FIXED IN EPIC 5, one cosmetic and one not.
 *
 * The old pattern was `/(?:from|import)\s+['"]([^'"]+)['"]/`, which matched any
 * prose containing the word "from" before a quoted phrase. A doc comment reading
 * `different from "match nothing"` was reported as an import of a module called
 * `match nothing`. Annoying, and worse than annoying: a guard that fails on
 * English teaches people to reword the comment rather than trust the guard.
 *
 * The serious one is the opposite direction. That pattern required a QUOTE right
 * after the keyword, so `require('../../emailService')` and dynamic
 * `import('../../emailService')` matched NOTHING and sailed straight through
 * every assertion in this file. The guard's whole promise is that the Governor
 * cannot reach a mailer; a CommonJS require would have reached one silently.
 *
 * Now: static imports are anchored to statement position, and require/dynamic
 * import are matched anywhere. Comments are stripped first so prose cannot
 * trip it — stripping can only ever REMOVE candidates that were never real
 * imports, since a real import is not inside a comment.
 */
function importsOf(file: string): string[] {
  const raw = fs.readFileSync(file, 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];

  // `import ... from 'x'` and `export ... from 'x'`, including the multi-line
  // form. `[^;]*?` may span newlines so a wrapped specifier list still matches,
  // and it is bounded by the semicolon that ends the statement.
  //
  // The `from` is REQUIRED. An earlier draft used `[^;'"]*?['"]` — no `from` —
  // and matched the first quoted value inside any `export const X = { ... }`,
  // reporting `assetPurposeMap.ts -> LESSON` as an import.
  for (const m of src.matchAll(/^[ \t]*(?:import|export)[^;]*?\sfrom[ \t]*['"]([^'"]+)['"]/gm)) {
    out.push(m[1]);
  }
  // Bare side-effect import: `import 'x';`
  for (const m of src.matchAll(/^[ \t]*import[ \t]+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  // require('x') and dynamic import('x'), anywhere in the file.
  for (const m of src.matchAll(/(?:require|import)[ \t]*\([ \t]*['"]([^'"]+)['"][ \t]*\)/g)) {
    out.push(m[1]);
  }
  return out;
}

/**
 * What the Governor is allowed to depend on.
 *
 * Deliberately narrow. Anything reaching outward — a mailer, a queue, a
 * campaign engine — is absent, so adding one is a visible, arguable change
 * rather than an import nobody notices in review.
 */
const ALLOWED_IMPORT_PATTERNS: RegExp[] = [
  // NOTE: `^\.{1,2}\/` would be WRONG here — it matches `../../../emailService`
  // too, because that also begins `../`. The whitelist has to pin the depth or
  // it silently permits anything reachable by climbing far enough.
  /^\.\/[A-Za-z]/,                            // same directory (governor/)
  /^\.\.\/[A-Za-z]/,                           // one level up (explorerGrowth/)
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

  it('extracts real imports, and is not fooled by prose', () => {
    // The extractor is the load-bearing part of every assertion below. If it
    // returns nothing, this whole file passes while checking nothing.
    const arbiter = files.find((f) => f.endsWith('arbiter.ts'))!;
    expect(importsOf(arbiter)).toContain('./types');

    const tmp = path.join(__dirname, '__extractor_probe.ts.txt');
    fs.writeFileSync(
      tmp,
      [
        "// a comment saying import 'not-a-real-module'",
        '/* different from "also not a module" */',
        "import { a } from './real-static';",
        "const b = require('./real-require');",
        "const c = await import('./real-dynamic');",
      ].join(String.fromCharCode(10)),
    );
    try {
      const found = importsOf(tmp);
      expect(found).toEqual(
        expect.arrayContaining(['./real-static', './real-require', './real-dynamic']),
      );
      // The two that must NOT appear: both were matched by the old pattern.
      expect(found).not.toContain('not-a-real-module');
      expect(found).not.toContain('also not a module');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('has source files to check (guards against a silently empty sweep)', () => {
    // A test that scans nothing passes forever. This is the assertion that
    // keeps the rest of this file honest.
    expect(files.length).toBeGreaterThan(0);
  });

  it('actually sweeps the content tree, not just the governor tree', () => {
    // Without this, adding `content/` to SWEPT_DIRS could be silently undone by
    // a refactor and the sweep would shrink back to the governor tree while
    // every other assertion here still passed. Name the tree, not a count.
    const swept = files.map((f) => f.split(path.sep).join('/'));
    expect(swept.some((f) => f.includes('/explorerGrowth/content/'))).toBe(true);
    expect(swept.some((f) => f.includes('/explorerGrowth/governor/'))).toBe(true);
  });

  it('reaches the resolver specifically — the module closest to a send', () => {
    // resolveContentAssets is what decides WHAT a learner would be shown. If any
    // file in this repo should be provably unable to reach a mailer, it is this
    // one, and it lives outside the tree this guard used to walk.
    const swept = files.map((f) => f.split(path.sep).join('/'));
    expect(swept.some((f) => f.endsWith('/content/resolveContentAssets.ts'))).toBe(true);
    expect(swept.some((f) => f.endsWith('/content/syncTimelineCards.ts'))).toBe(true);
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
