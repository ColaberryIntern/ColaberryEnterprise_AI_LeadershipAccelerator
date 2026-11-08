#!/usr/bin/env node
/**
 * Capture the machine-level half of a handoff bundle, then finalize it.
 *
 * WHY THIS IS SEPARATE FROM captureTab.js
 * A tab's state is per-tab and is written by that tab. Everything here is
 * per-MACHINE: installed tool versions, which env vars exist, the memory
 * directory, the worktree inventory. Running it once per bundle rather than
 * once per tab keeps twenty tabs from each re-copying the same 659 memory
 * files, and keeps manifest.json a derived artifact nobody contends for.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY
 * No env var VALUES, ever. The bundle records that `MANDRILL_API_KEY` is set
 * and where to fetch it, never what it is. Same for MCP servers: names only,
 * because their config can hold tokens. A bundle is built to be emailed, so
 * anything secret in it is a leak with a delivery mechanism attached.
 *
 * WHY THE WORKTREE INVENTORY IS SPLIT IN TWO
 * This machine has over 400 worktrees and 2,800 branches. Recreating them all
 * would take hours and produce a machine nobody wants. So the worktrees named
 * by a captured tab are recreated, and the rest are recorded as a path+branch
 * list you can recreate on demand. The bundle says plainly which is which.
 *
 * FAILURE MODES HANDLED: a missing tool (recorded, not fatal), an unreadable
 * ~/.claude.json, no local .env, no memory directory, a zip step that fails.
 * NOT HANDLED: a secret in a form .gitleaks.toml has no rule for.
 *
 * Usage:
 *   node scripts/handoff/captureMachine.js              # machine tier only
 *   node scripts/handoff/captureMachine.js --finalize    # + manifest, scan, zip
 *   node scripts/handoff/captureMachine.js --finalize --with-transcripts
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const B = require('./handoffBundle');
const { gate } = require('./handoffScan');

const TOOLS = [
  ['node', ['--version']],
  ['npm', ['--version']],
  ['git', ['--version']],
  ['gh', ['--version']],
  ['docker', ['--version']],
  ['python', ['--version']],
  ['pwsh', ['--version']],
];

// Names matching these are credentials: they come from the production backend
// container, never from a file in the bundle. A heuristic, labelled as one.
const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|DSN|WEBHOOK)/i;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

function version(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000, shell: process.platform === 'win32' });
  if (r.status !== 0) return null;
  return (r.stdout || r.stderr || '').trim().split('\n')[0] || null;
}

function prereqs() {
  const out = {};
  for (const [cmd, args] of TOOLS) out[cmd] = version(cmd, args);
  out.platform = `${os.platform()} ${os.release()}`;
  out.homedir = os.homedir();
  return out;
}

/**
 * Env var names, and for each one whether this machine has it set. Values are
 * never read into memory beyond the presence test.
 */
function envInventory() {
  const examplePath = path.join(B.REPO_ROOT, 'backend', '.env.example');
  if (!fs.existsSync(examplePath)) return { names: [], note: 'backend/.env.example not found' };

  const names = fs
    .readFileSync(examplePath, 'utf8')
    .split(/\r?\n/)
    .map((l) => (l.match(/^([A-Z0-9_]+)=/) || [])[1])
    .filter(Boolean);

  const localPath = path.join(B.REPO_ROOT, 'backend', '.env');
  const localNames = new Set();
  if (fs.existsSync(localPath)) {
    for (const line of fs.readFileSync(localPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && m[2].trim() !== '') localNames.add(m[1]);
    }
  }

  return {
    names: names.map((n) => ({
      name: n,
      setOnOldMachine: localNames.has(n),
      source: SECRET_NAME.test(n) ? 'prod-container' : 'local-value',
    })),
    note: 'Names and presence only. No values are captured, by design.',
  };
}

/** MCP server names only. Their configs can carry OAuth tokens. */
function mcpServers() {
  const found = new Set();
  const read = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };
  const user = read(path.join(os.homedir(), '.claude.json'));
  if (user) {
    for (const k of Object.keys(user.mcpServers || {})) found.add(k);
    for (const proj of Object.values(user.projects || {})) {
      for (const k of Object.keys((proj && proj.mcpServers) || {})) found.add(k);
    }
  }
  const repo = read(path.join(B.REPO_ROOT, '.mcp.json'));
  if (repo) for (const k of Object.keys(repo.mcpServers || {})) found.add(k);
  return [...found].sort();
}

/** One cheap call gives every worktree; no per-worktree status probing. */
function worktreeInventory() {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: B.REPO_ROOT,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) return [];
  const out = [];
  let cur = {};
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) cur = { path: line.slice(9) };
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line.startsWith('detached')) cur.branch = null;
    else if (line === '' && cur.path) {
      out.push(cur);
      cur = {};
    }
  }
  if (cur.path) out.push(cur);
  return out;
}

/**
 * The MAIN checkout, which is not necessarily where this script is running
 * from. Worktrees are the normal way work happens here, and a worktree's path
 * has its own slug with no memory directory under it. `--git-common-dir`
 * resolves to the main `.git` regardless of which worktree we are in.
 */
function mainCheckoutRoot() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: B.REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });
  const commonDir = r.status === 0 ? (r.stdout || '').trim() : '';
  return commonDir ? path.dirname(commonDir) : B.REPO_ROOT;
}

/**
 * Copy the memory directories belonging to this repo.
 *
 * Finding them is subtler than it looks, and getting it wrong copies nothing
 * while reporting success. Memory lives under the slug of the directory a tab
 * was STARTED in, which may be the main checkout, a subdirectory of it (a tab
 * opened in docs/ gets its own slug) or a worktree. So the search is: this
 * checkout, the main checkout, every captured tab's cwd, and any slug that
 * begins with the main checkout's slug.
 */
function copyMemory(paths, tabCwds) {
  const mainRoot = mainCheckoutRoot();
  const mainSlug = B.projectSlug(mainRoot);
  const slugs = new Set([B.projectSlug(B.REPO_ROOT), mainSlug, ...tabCwds.map((c) => B.projectSlug(c))]);
  try {
    for (const d of fs.readdirSync(B.PROJECTS_DIR)) if (d.startsWith(mainSlug)) slugs.add(d);
  } catch {
    /* no projects dir: nothing to copy, reported as zero below */
  }
  const copied = [];
  for (const slug of slugs) {
    const src = path.join(B.PROJECTS_DIR, slug, 'memory');
    if (!fs.existsSync(src)) continue;
    const dest = path.join(paths.memory, slug);
    fs.mkdirSync(dest, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(src)) {
      const from = path.join(src, f);
      if (!fs.statSync(from).isFile()) continue;
      fs.copyFileSync(from, path.join(dest, f));
      n += 1;
    }
    copied.push({ slug, files: n });
  }
  return copied;
}

function copyLocalSettings(paths) {
  const copied = [];
  const candidates = [
    [path.join(os.homedir(), '.claude', 'settings.json'), 'user-settings.json'],
    [path.join(B.REPO_ROOT, '.claude', 'settings.local.json'), 'project-settings.local.json'],
  ];
  for (const [src, name] of candidates) {
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(paths.machine, name));
    copied.push(name);
  }
  return copied;
}

function readTabs(paths) {
  if (!fs.existsSync(paths.tabs)) return [];
  return fs
    .readdirSync(paths.tabs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(paths.tabs, f), 'utf8')));
}

function copyTranscripts(paths, tabs) {
  fs.mkdirSync(paths.transcripts, { recursive: true });
  const out = [];
  for (const t of tabs) {
    if (!t.transcript || !fs.existsSync(t.transcript.file)) continue;
    const dest = path.join(paths.transcripts, t.transcriptSlug);
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(t.transcript.file, path.join(dest, `${t.sessionId}.jsonl`));
    out.push({ sessionId: t.sessionId, bytes: t.transcript.bytes });
  }
  return out;
}

function zipBundle(root) {
  const zip = `${root}.zip`;
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path '${root}\\*' -DestinationPath '${zip}' -Force`],
    { encoding: 'utf8', timeout: 600000 }
  );
  if (r.status !== 0 || !fs.existsSync(zip)) return { zip: null, error: (r.stderr || 'Compress-Archive failed').trim().slice(0, 300) };
  return { zip, bytes: fs.statSync(zip).size, error: null };
}

/**
 * Findings an operator has personally reviewed and judged not to be secrets.
 *
 * One per line, `<path-suffix>  # why`, with `#` comments allowed. A reviewed
 * finding is accepted; everything else still refuses the bundle. This is
 * deliberately an operator file rather than a list baked into the code: a
 * path allowlist inside a secret scanner rots immediately and would go on
 * suppressing the same file after someone drops a real credential into it.
 */
function loadAcceptances(file) {
  if (!file) return [];
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) B.fail(`--accept-findings file not found: ${resolved}`);
  return fs
    .readFileSync(resolved, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const hash = l.indexOf('#');
      const left = (hash === -1 ? l : l.slice(0, hash)).trim();
      const reason = hash === -1 ? '(no reason given)' : l.slice(hash + 1).trim();
      return { pattern: left.replace(/\\/g, '/'), reason };
    })
    .filter((a) => a.pattern);
}

/** The refusal, written down. A list in a terminal scrollback is not a record. */
function writeFindingsDoc(paths, findings, control) {
  const L = [];
  L.push('# Secret scan findings');
  L.push('');
  L.push(`Scanned ${new Date().toISOString()}. Control: ${control}.`);
  L.push('');
  L.push('This bundle was REFUSED and no zip was produced. Each finding below is either a real');
  L.push('credential, which must be removed and rotated, or a false positive you have reviewed.');
  L.push('');
  L.push('| Rule | File | Line |');
  L.push('|---|---|---|');
  for (const f of findings) {
    L.push(`| \`${f.rule}\` | \`${path.relative(paths.root, f.file).replace(/\\/g, '/')}\` | ${f.line} |`);
  }
  L.push('');
  L.push('## Two ways forward');
  L.push('');
  L.push('**Preferred: remove or redact the file**, then re-run `--finalize`. If it turns out to be a');
  L.push('live credential, rotate it as well: it has been on disk in a folder built for copying.');
  L.push('');
  L.push('**Or, if you have reviewed it and it is not a secret**, list it in a file and pass that file:');
  L.push('');
  L.push('```');
  for (const f of findings) {
    L.push(`${path.relative(paths.root, f.file).replace(/\\/g, '/')}  # why this is not a secret`);
  }
  L.push('```');
  L.push('');
  L.push('```');
  L.push('node scripts/handoff/captureMachine.js --finalize --accept-findings reviewed.txt');
  L.push('```');
  L.push('');
  L.push('Accepted findings are recorded in `manifest.json` under `scan.acceptedFindings`, so the');
  L.push('machine receiving this bundle can see what was waved through and on what reasoning.');
  L.push('');
  const file = path.join(paths.root, 'SCAN_FINDINGS.md');
  B.writeTextAtomic(file, L.join('\n'));
  return file;
}

/**
 * Read-only view of the current bundle. Deliberately does NOT call
 * ensureBundle(), because asking "what is in the bundle" must never be the
 * thing that creates one.
 */
function printStatus(explicit) {
  const pointer = B.readPointer();
  const root = explicit ? path.resolve(explicit) : pointer && pointer.bundlePath;
  if (!root || !fs.existsSync(root)) {
    console.log('No bundle in progress. Run `node scripts/handoff/captureTab.js --session <uuid>` to start one.');
    return;
  }
  const paths = B.bundlePaths(root);
  const tabs = readTabs(paths);
  const hasMachine = fs.existsSync(path.join(paths.machine, 'machine.json'));
  const zipped = fs.existsSync(`${root}.zip`);

  console.log(`bundle   ${root}`);
  console.log(`started  ${pointer ? pointer.createdAt : '(unknown)'}`);
  console.log(`tabs     ${tabs.length} reported`);
  for (const t of tabs) {
    const pr = t.prs && t.prs.length ? ` prs=${t.prs.map((p) => `#${p.number}`).join(',')}` : '';
    console.log(`  - ${t.sessionId}  ${t.git && t.git.branch ? t.git.branch : '(detached)'}  changed=${t.git ? t.git.trackedChangedCount : '?'}${pr}`);
  }
  console.log(`machine  ${hasMachine ? 'captured' : 'NOT captured'}`);
  console.log(`sendable ${zipped ? `yes: ${root}.zip` : 'no, not finalized'}`);
  if (!zipped) console.log('\nRun `node scripts/handoff/captureMachine.js --finalize` when every tab has reported.');
}

async function main() {
  if (flag('status')) {
    printStatus(arg('bundle'));
    return;
  }

  const paths = B.ensureBundle({ explicitPath: arg('bundle') });
  fs.mkdirSync(paths.memory, { recursive: true });

  const tabs = readTabs(paths);
  const inventory = worktreeInventory();

  // `git worktree list` emits forward slashes; path.resolve() on Windows emits
  // backslashes. Comparing them raw matched nothing, so every worktree a tab was
  // actually working in was filed as "inventory only" and would not have been
  // recreated. Normalize separators and case, because Windows paths are
  // case-insensitive.
  const norm = (p) => (p ? path.resolve(p).replace(/\\/g, '/').toLowerCase() : '');
  const activePaths = new Set(tabs.map((t) => norm(t.worktree)));

  const machine = {
    schema: 'colaberry.handoff.machine/1',
    capturedAt: new Date().toISOString(),
    targetOs: 'windows',
    prereqs: prereqs(),
    repo: {
      root: B.REPO_ROOT,
      remote: (spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: B.REPO_ROOT, encoding: 'utf8', timeout: 30000 }).stdout || '').trim() || null,
      originMain: (spawnSync('git', ['rev-parse', 'origin/main'], { cwd: B.REPO_ROOT, encoding: 'utf8', timeout: 30000 }).stdout || '').trim() || null,
    },
    env: envInventory(),
    mcpServers: mcpServers(),
    settingsCopied: copyLocalSettings(paths),
    memoryCopied: copyMemory(paths, tabs.map((t) => t.cwd)),
    worktrees: {
      total: inventory.length,
      // Recreated by bootstrap, because a captured tab is working in them.
      active: inventory.filter((w) => activePaths.has(norm(w.path))),
      // Recorded only. Recreating 400+ worktrees would take hours and help nobody.
      inventoryOnly: inventory
        .filter((w) => !activePaths.has(norm(w.path)))
        .map((w) => ({ path: w.path, branch: w.branch || null })),
    },
  };

  if (flag('with-transcripts')) machine.transcripts = copyTranscripts(paths, tabs);

  B.writeJsonAtomic(path.join(paths.machine, 'machine.json'), machine);
  const memoryFiles = machine.memoryCopied.reduce((n, m) => n + m.files, 0);
  console.log(`machine tier captured into ${paths.root}`);
  console.log(`  tabs reported     ${tabs.length}`);
  console.log(`  env var names     ${machine.env.names.length} (no values)`);
  console.log(`  memory files      ${memoryFiles}`);
  console.log(`  worktrees         ${machine.worktrees.active.length} active of ${machine.worktrees.total} (rest listed only)`);

  // Memory is among the most valuable things in the bundle and the easiest to
  // miss silently, because an empty copy reports success just as a full one
  // does. Say so loudly rather than letting the new machine find out.
  if (memoryFiles === 0) {
    console.warn('  WARNING: no memory files were found to copy. The new machine would start with no');
    console.warn('           recall. Check which slug under ~/.claude/projects holds a memory/ dir.');
  }

  if (!flag('finalize')) {
    console.log('\nRun again with --finalize to derive the manifest, scan for secrets and zip.');
    return;
  }

  B.writeJsonAtomic(paths.manifest, B.deriveManifest(paths.root));

  console.log('\nscanning the bundle for secrets (proving the scanner works first)...');
  const verdict = await gate(paths.root);
  if (!verdict.trustworthy) {
    console.error(`REFUSED: ${verdict.reason}`);
    console.error('No zip was produced. A bundle that cannot be scanned is not sendable.');
    process.exit(1);
  }

  const rel = (f) => path.relative(paths.root, f.file).replace(/\\/g, '/');
  const acceptances = loadAcceptances(arg('accept-findings'));
  const acceptedBy = (f) => acceptances.find((a) => rel(f) === a.pattern || rel(f).endsWith(a.pattern));
  const accepted = verdict.findings.filter((f) => acceptedBy(f));
  const blocking = verdict.findings.filter((f) => !acceptedBy(f));

  if (blocking.length) {
    const findingsDoc = writeFindingsDoc(paths, blocking, verdict.control);
    console.error(`REFUSED: ${blocking.length} unreviewed finding(s). Control: ${verdict.control}.`);
    for (const f of blocking) console.error(`  ${f.rule}  ${rel(f)}:${f.line}`);
    console.error(`\nWritten up, with what to do about each: ${findingsDoc}`);
    console.error('No zip was produced. The bundle folder is NOT deleted, because other tabs captured into it.');
    process.exit(1);
  }

  if (accepted.length) {
    // Accepting is never silent. It is echoed here and recorded in the manifest,
    // so the receiving machine can see exactly what was waved through and why.
    console.log(`  ${accepted.length} finding(s) accepted as reviewed:`);
    for (const f of accepted) console.log(`    ${f.rule}  ${rel(f)}:${f.line}  -- ${acceptedBy(f).reason}`);
  }
  console.log(`  sendable. Control: ${verdict.control}.`);

  const finalManifest = B.deriveManifest(paths.root);
  finalManifest.scan = {
    control: verdict.control,
    acceptedFindings: accepted.map((f) => ({ rule: f.rule, file: rel(f), line: f.line, reason: acceptedBy(f).reason })),
  };
  B.writeJsonAtomic(paths.manifest, finalManifest);

  const z = zipBundle(paths.root);
  if (!z.zip) {
    console.log(`\nZip step failed (${z.error}). The folder is complete and sendable as a folder:`);
    console.log(`  ${paths.root}`);
    return;
  }
  console.log(`\nSENDABLE: ${z.zip}  (${(z.bytes / 1048576).toFixed(1)} MB)`);
  console.log('On the new machine: clone the repo, then run');
  console.log('  powershell -ExecutionPolicy Bypass -File scripts\\handoff\\bootstrapMachine.ps1 -Bundle <unzipped folder>');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`FATAL: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { envInventory, mcpServers, worktreeInventory, prereqs, loadAcceptances };
