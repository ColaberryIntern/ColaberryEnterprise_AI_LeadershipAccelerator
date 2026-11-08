#!/usr/bin/env node
/**
 * Prove the handoff tooling works, including that its secret gate can REFUSE.
 *
 * WHY THIS IS THE TEST AND NOT A JEST SUITE
 * jest in this repo runs from backend/ against backend/ (ci.yml: `npx jest -c
 * jest.ci.config.ts`), so a test file under scripts/ would never be collected
 * and would look green by never running. CI's own convention for repo-root
 * scripts is a `--self-test` entry point it invokes directly
 * (lint-explorer-copy, checkPriceAgreement, secret-scan-selftest). This follows
 * that convention so the checks actually execute.
 *
 * WHAT IS PROVED, AND WHY EACH ONE EARNS ITS PLACE
 *   1. Slug derivation         a wrong slug silently captures an empty tab
 *   2. First-writer-wins       twenty tabs must land in ONE bundle, not twenty
 *   3. Stale pointer ignored   a deleted bundle must not swallow new captures
 *   4. Manifest is derived     the anti-contention property PROGRESS.md taught
 *   5. Idempotency             re-running a capture must not duplicate state
 *   6. THE SECRET GATE REFUSES a planted credential must stop the bundle
 *   7. No env values captured  presence and name only, never the value
 *
 * Check 6 is the one that matters most. The gate's normal output is an absence,
 * so a gate that can no longer see anything looks exactly like a clean bundle.
 * Here it is handed a known credential and the run fails unless it refuses.
 *
 * Exit codes: 0 = every check passed. 1 = a check failed, so the tooling must
 * not be trusted to carry anything off this machine.
 *
 * Usage:  node scripts/handoff/handoffSelfTest.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const rows = [];
let failures = 0;

function check(name, fn) {
  try {
    const detail = fn();
    rows.push({ name, ok: true, detail: detail || 'ok' });
  } catch (err) {
    failures += 1;
    rows.push({ name, ok: false, detail: err.message });
  }
}

async function checkAsync(name, fn) {
  try {
    const detail = await fn();
    rows.push({ name, ok: true, detail: detail || 'ok' });
  } catch (err) {
    failures += 1;
    rows.push({ name, ok: false, detail: err.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Each sub-test gets its own temp pointer so the live bundle is never touched. */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-selftest-'));
  process.env.HANDOFF_POINTER = path.join(dir, 'pointer.json');
  process.env.HANDOFF_PARENT = path.join(dir, 'bundles');
  fs.mkdirSync(process.env.HANDOFF_PARENT, { recursive: true });
  // The module caches the pointer path at require time, so it is loaded fresh.
  delete require.cache[require.resolve('./handoffBundle')];
  return { dir, B: require('./handoffBundle') };
}

async function main() {
  // ---- 1. Slug derivation -------------------------------------------------
  check('slug: non-alphanumerics become hyphens', () => {
    const { B } = sandbox();
    // Platform-neutral, so this check means the same thing on CI as on Windows.
    const got = B.projectSlug(path.resolve('/tmp/My Project.v2'));
    assert(/-tmp-My-Project-v2$/.test(got), `got ${got}`);
    assert(!/[^a-zA-Z0-9-]/.test(got), `slug kept a non-alphanumeric: ${got}`);
    return got;
  });

  check('slug: trailing separators do not produce a trailing hyphen', () => {
    const { B } = sandbox();
    const got = B.projectSlug(`${path.resolve('/tmp/x')}${path.sep}`);
    assert(!got.endsWith('-'), `got ${got}`);
    return got;
  });

  if (process.platform === 'win32') {
    check('slug: resolves this machine\'s real transcript folder', () => {
      const { B } = sandbox();
      const dir = B.resolveTranscriptDir(B.REPO_ROOT, { required: false });
      // Absence is legitimate (a repo nobody has opened a tab in); a WRONG
      // directory is not, so only the shape is asserted when one is found.
      if (!dir) return 'no transcript folder for the repo root (legitimate)';
      assert(fs.existsSync(dir), `resolved a path that does not exist: ${dir}`);
      return path.basename(dir);
    });
  }

  check('slug: an unknown path returns null rather than guessing', () => {
    const { B } = sandbox();
    const got = B.resolveTranscriptDir(path.resolve('/no/such/place/at/all'), { required: false });
    assert(got === null, `expected null, got ${got}`);
    return 'null';
  });

  // ---- 2 & 3. The bundle pointer ------------------------------------------
  check('pointer: the second caller joins the first caller\'s bundle', () => {
    const { B } = sandbox();
    const first = B.ensureBundle({ sessionId: 'tab-one' });
    const second = B.ensureBundle({ sessionId: 'tab-two' });
    assert(first.root === second.root, `two bundles created: ${first.root} vs ${second.root}`);
    return path.basename(first.root);
  });

  check('pointer: a bundle folder that was deleted is not reused', () => {
    const { B } = sandbox();
    const first = B.ensureBundle({ sessionId: 'tab-one' });
    fs.rmSync(first.root, { recursive: true, force: true });
    const second = B.ensureBundle({ sessionId: 'tab-two' });
    assert(fs.existsSync(second.root), 'the replacement bundle was not created');
    return `recovered into ${path.basename(second.root)}`;
  });

  // ---- 4. Derived manifest ------------------------------------------------
  check('manifest: derived from the tab files, never appended to', () => {
    const { B } = sandbox();
    const p = B.ensureBundle({ sessionId: 'tab-one' });
    // Two tabs write independently, exactly as concurrent sessions would.
    for (const id of ['aaa', 'bbb']) {
      B.writeJsonAtomic(path.join(p.tabs, `${id}.json`), {
        sessionId: id,
        git: { branch: `workstream/${id}` },
        worktree: `/w/${id}`,
        prs: [],
      });
    }
    const m = B.deriveManifest(p.root);
    assert(m.tabCount === 2, `expected 2 tabs, got ${m.tabCount}`);
    assert(m.tabs.map((t) => t.sessionId).sort().join(',') === 'aaa,bbb', 'wrong tabs in the manifest');
    assert(m.machineCaptured === false, 'claimed a machine tier that was never captured');
    return '2 tabs, no contention';
  });

  // ---- 5. Idempotency ----------------------------------------------------
  check('idempotency: deriving twice yields the same state', () => {
    const { B } = sandbox();
    const p = B.ensureBundle({ sessionId: 'tab-one' });
    B.writeJsonAtomic(path.join(p.tabs, 'aaa.json'), { sessionId: 'aaa', git: {}, prs: [] });
    const strip = (m) => JSON.stringify({ ...m, generatedAt: null });
    assert(strip(B.deriveManifest(p.root)) === strip(B.deriveManifest(p.root)), 'manifest is not stable');
    assert(fs.readdirSync(p.tabs).length === 1, 'a second derive duplicated a tab file');
    return 'stable';
  });

  // ---- 7. No env values --------------------------------------------------
  check('env: names and presence are captured, values are not', () => {
    sandbox();
    delete require.cache[require.resolve('./captureMachine')];
    const { envInventory } = require('./captureMachine');
    const inv = envInventory();
    if (!inv.names.length) return 'no .env.example in this checkout (nothing to prove)';
    const keys = new Set();
    for (const e of inv.names) for (const k of Object.keys(e)) keys.add(k);
    const allowed = new Set(['name', 'setOnOldMachine', 'source']);
    for (const k of keys) assert(allowed.has(k), `env entry carries an unexpected field: ${k}`);
    return `${inv.names.length} names, fields: ${[...keys].join('/')}`;
  });

  // ---- 9. One worktree, many tabs: stored once ---------------------------
  // The break this pins: 18 tabs were captured on the machine this was built
  // from and 14 shared ONE checkout, so a session-keyed patch meant serializing
  // a 947-file diff fourteen times. Keyed on the worktree, the first tab writes
  // it and the rest point at the same file.
  check('worktree key: same path same key, different path different key', () => {
    const { worktreeId } = require('./captureTab');
    const a = worktreeId(path.resolve('/repo/acc-handoff-wt'));
    const b = worktreeId(path.resolve('/repo/acc-handoff-wt'));
    const c = worktreeId(path.resolve('/repo/acc-internship-wt'));
    assert(a === b, `the same worktree produced two keys: ${a} vs ${b}`);
    assert(a !== c, `two different worktrees collided on ${a}`);
    assert(!/[^a-zA-Z0-9._-]/.test(a), `key is not filename-safe: ${a}`);
    return `${a} != ${c}`;
  });

  check('worktree key: case and separator differences do not fork the key', () => {
    const { worktreeId } = require('./captureTab');
    // Windows paths are case-insensitive, and git reports forward slashes while
    // path.resolve emits backslashes. Either difference forking the key would
    // reintroduce the duplicate patch this is here to prevent.
    const a = worktreeId('C:\\Users\\x\\Downloads\\acc-handoff-wt');
    const b = worktreeId('c:/users/x/downloads/acc-handoff-wt');
    assert(a === b, `separator or case forked the key: ${a} vs ${b}`);
    return a;
  });

  // ---- 10. Scratch and credential-shaped files never enter extras --------
  // The break this pins: the first multi-tab run copied a checkout's 873
  // untracked files, and the gate then refused the bundle over real JWT session
  // cookies, a GitHub PAT, a Slack webhook and a GCP key -- all of it out of
  // `tmp/`, which this repo defines as disposable scratch. The gate catching it
  // is the backstop; not assembling the bundle out of it is the fix.
  check('extras: scratch and credential-shaped paths are refused entry', () => {
    const { EXTRA_SKIP, EXTRA_SKIP_NAMES } = require('./captureTab');
    const mustSkip = [
      'tmp/suralink-cookie.txt',
      'tmp/ma-opps/ma.json',
      'tmp/manifest-secret-probe.json',
      'backend/tmp/probe.json',
      'node_modules/x/index.js',
      '.venv/lib/thing.py',
    ];
    for (const p of mustSkip) {
      assert(EXTRA_SKIP.test(p) || EXTRA_SKIP_NAMES.test(p), `would have carried ${p}`);
    }

    const mustSkipByName = ['backend/src/authCookie.json', 'scripts/getToken.js', '.env.local'];
    for (const p of mustSkipByName) {
      assert(EXTRA_SKIP.test(p) || EXTRA_SKIP_NAMES.test(p), `would have carried ${p}`);
    }

    // Real work must still travel, or the fix has quietly emptied the bundle.
    const mustCarry = ['scripts/handoff/captureTab.js', 'backend/src/services/newThing.ts', 'docs/sessions/CC-1.md'];
    for (const p of mustCarry) {
      assert(!EXTRA_SKIP.test(p) && !EXTRA_SKIP_NAMES.test(p), `refused real work: ${p}`);
    }
    return `${mustSkip.length + mustSkipByName.length} refused, ${mustCarry.length} carried`;
  });

  // ---- 8. Accepting a finding is explicit and carries a reason -----------
  check('acceptances: parsed with reasons, comments ignored', () => {
    const { dir } = sandbox();
    delete require.cache[require.resolve('./captureMachine')];
    const { loadAcceptances } = require('./captureMachine');
    const f = path.join(dir, 'reviewed.txt');
    fs.writeFileSync(f, ['# a comment line', 'memory/x/note.md  # public OAuth client id', '', 'tabs/y.json'].join('\n'));
    const acc = loadAcceptances(f);
    assert(acc.length === 2, `expected 2 acceptances, got ${acc.length}`);
    assert(acc[0].reason === 'public OAuth client id', `reason not carried: ${acc[0].reason}`);
    assert(acc[1].reason === '(no reason given)', 'a missing reason must be recorded as such, not dropped');
    assert(loadAcceptances(null).length === 0, 'no file must mean no acceptances');
    return '2 parsed, 1 comment ignored, reasons kept';
  });

  // ---- 6. The secret gate must refuse ------------------------------------
  await checkAsync('GATE: a planted credential stops the bundle', async () => {
    const { B } = sandbox();
    const p = B.ensureBundle({ sessionId: 'tab-one' });
    const { FIXTURES } = require('../lib/gitleaksSelfTest');
    const planted = FIXTURES.find((f) => f.mustDetect);
    assert(planted, 'no detectable fixture available to plant');
    fs.writeFileSync(path.join(p.tabs, planted.file), planted.body);

    const { gate } = require('./handoffScan');
    const verdict = await gate(p.root);
    assert(verdict.trustworthy, `the scanner could not prove itself: ${verdict.reason}`);
    assert(verdict.clean === false, 'THE GATE MISSED A PLANTED CREDENTIAL, so no clean verdict can be trusted');
    assert(verdict.findings.length > 0, 'refused without naming a finding');
    return `refused on ${verdict.findings.length} finding(s); control: ${verdict.control}`;
  });

  await checkAsync('GATE: a bundle with nothing planted passes', async () => {
    const { B } = sandbox();
    const { worktreeId } = require('./captureTab');
    const p = B.ensureBundle({ sessionId: 'tab-one' });

    // The tab record carries its REAL shape here, worktree id included, because
    // that field once refused a whole bundle. Named `worktreeKey` and holding a
    // long slug plus a hex hash, it tripped gitleaks' generic-api-key rule in
    // every tab file at once: 62 false findings and no zip. Renaming it so it no
    // longer reads as a credential is the fix, and this is what pins it -- a
    // rename back to anything key-shaped fails here rather than at finalize.
    B.writeJsonAtomic(path.join(p.tabs, 'aaa.json'), {
      sessionId: 'aaa',
      worktreeId: worktreeId(path.resolve('/repo/colaberry-enterprise-ai-leadership-accelerator')),
      git: { branch: 'workstream/x' },
      patch: { worktreeId: worktreeId(path.resolve('/repo/colaberry-enterprise-ai-leadership-accelerator')), bytes: 474418 },
      prs: [],
    });

    const { gate } = require('./handoffScan');
    const verdict = await gate(p.root);
    assert(verdict.trustworthy, `the scanner could not prove itself: ${verdict.reason}`);
    assert(verdict.clean === true, `a legitimate bundle was refused: ${JSON.stringify(verdict.findings)}`);
    return 'clean, and the control still detected the planted set';
  });

  // ---- report ------------------------------------------------------------
  const width = Math.max(...rows.map((r) => r.name.length));
  console.log('');
  for (const r of rows) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
  console.log('');
  if (failures) {
    console.error(`SELF-TEST FAILED: ${failures} of ${rows.length} checks failed. Do not send a bundle built by this code.`);
    process.exit(1);
  }
  console.log(`SELF-TEST PASSED: ${rows.length} checks, including a planted credential the gate refused.`);
}

main().catch((e) => {
  console.error(`SELF-TEST COULD NOT RUN: ${e.message}`);
  process.exit(1);
});
