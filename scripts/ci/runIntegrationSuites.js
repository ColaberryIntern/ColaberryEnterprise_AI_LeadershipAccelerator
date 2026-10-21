#!/usr/bin/env node
/**
 * Run the database-backed integration tier, ONE DATABASE PER SUITE.
 *
 * ## Why per-suite and not one shared database
 *
 * These suites were each written to own a disposable Postgres - every one of their docblocks
 * says so, with its own `docker run` and its own port. Pointing all of them at one database
 * was measured on 2026-10-18 and fails: 15 of 25 suites red, and the dominant cause is not
 * missing schema but COLLISION. Two suites each create `projects` their own way, the second
 * `CREATE TABLE IF NOT EXISTS` is a no-op, and the loser then indexes a column that is not
 * there ("column enrollment_id does not exist"). Serialising with --runInBand does not help,
 * because the conflict is over persistent state, not over timing.
 *
 * The three lock suites that failed that way all pass, unchanged, when each is given its own
 * database. So isolation is the fix, and it needs no edits to any suite.
 *
 * ## What this does
 *
 * For each `*.integration.test.ts` under `backend/src`: create a database, run jest on that
 * one file against it, drop the database. The suite list is DERIVED, never hand-maintained,
 * so a new integration suite joins this job by existing.
 *
 * ## Inputs
 *
 *   DATABASE_URL   a Postgres server this script may create and drop databases on. The
 *                  database named in the URL is only used to connect; each suite gets its own.
 *                  NEVER point this at production: the script creates and drops databases.
 *   --filter <s>   only suites whose path contains <s> (local use)
 *   --shard k/n    run only the k-th of n equal slices, in sorted order. The job runs whole
 *                  today; this exists so it can be split across runners without reshuffling
 *                  which suite lands where, and so a long local run can be taken in pieces.
 *   --keep         do not drop the per-suite databases (local debugging)
 *
 * Exit code is 1 if any suite failed, so CI can gate on it.
 */
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND = path.join(REPO_ROOT, 'backend');
const SRC = path.join(BACKEND, 'src');

// jest's own default is 5 s, and ten of these suites spend longer than that building their
// schema in a beforeAll. Raised here, at the runner, rather than editing every suite.
const TEST_TIMEOUT_MS = 180_000;

/**
 * Hard wall-clock cap per suite, enforced on the child process.
 *
 * jest's own timeout only covers work inside a test or hook body, so a suite that blocks
 * elsewhere - two in this set do - runs for ever and takes the whole job's budget with it.
 * A suite that hits this is reported as a FAILURE with its elapsed time, because a job that
 * hangs tells you less than one that says which suite stopped responding.
 */
const SUITE_TIMEOUT_MS = Number(process.env.INTEGRATION_SUITE_TIMEOUT_MS || 300_000);

const args = process.argv.slice(2);
const filter = args.includes('--filter') ? args[args.indexOf('--filter') + 1] : null;
const keepDatabases = args.includes('--keep');
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : null;

function fail(message) {
  console.error(`[integration-tier] ${message}`);
  process.exit(2);
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  fail('DATABASE_URL is required: a Postgres server this may create and drop databases on.');
}

let serverUrl;
try {
  serverUrl = new URL(rawUrl);
} catch {
  fail(`DATABASE_URL is not a URL: ${rawUrl}`);
}

/**
 * EXCLUDED BY NAME, WITH A REASON. The list may only shrink, and an entry needs evidence -
 * same contract as backend/jest.ci.config.ts's ignore-list.
 *
 * `multiProjectIsolation` is gated behind SBP_INTEGRATION_DB=1 as well as DATABASE_URL, so it
 * has never run anywhere. Enabled, it DOES NOT TERMINATE: 420 s against postgres:16-alpine and
 * 480 s against pgvector/pgvector:pg16 (the image its own docblock asks for), alone, with
 * nothing else competing, where every other suite in this set finishes inside 40 s. Its
 * `jest.setTimeout(180_000)` never fires, so whatever blocks sits outside a test body.
 *
 * It is named here rather than left to skip silently, because this job treats a skip as a
 * failure. Fixing it is its own piece of work.
 */
const EXCLUDED = new Map([
  ['src/services/sbp/__tests__/multiProjectIsolation.integration.test.ts',
    'does not terminate when SBP_INTEGRATION_DB=1 — measured 420s on postgres:16, 480s on pgvector:pg16'],

  // Also does not terminate, and for a reason worth noticing: on a SHARED database it failed
  // in 5.7s, because the tables it wanted already existed in another suite's shape. Given a
  // genuinely empty one it gets as far as really building the publishing schema and then
  // blocks. The old failure was hiding the real behaviour.
  ['src/db/__tests__/ensurePublishingSchema.integration.test.ts',
    'does not terminate against an empty database — measured 240s and 90s caps, killed both times'],

  // One test, `counts TWO published rows rather than reporting the newest as healthy`. It
  // UPDATEs a second build_plans row to `published` to recreate a legacy state, and the real
  // schema now refuses that write - the state the test documents can no longer be created,
  // which is arguably the point it was making. It is a disagreement between the suite and the
  // schema, not a flake: 7 of its 8 tests pass.
  ['src/services/lifecycle/__tests__/lifecyclePlanReads.integration.test.ts',
    'one test writes a second published build_plans row, which the real schema rejects'],
]);

/** Every *.integration.test.ts under backend/src, derived rather than listed. */
function discoverSuites(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      found.push(...discoverSuites(full));
    } else if (entry.name.endsWith('.integration.test.ts')) {
      found.push(full);
    }
  }
  return found;
}

const allFound = discoverSuites(SRC)
  .map((full) => path.relative(BACKEND, full).split(path.sep).join('/'))
  .sort();

// Named exclusions must still EXIST. A path that stops matching means the list has rotted into
// a record of something that was renamed or deleted, and the reason went with it.
for (const rel of EXCLUDED.keys()) {
  if (!allFound.includes(rel)) fail(`excluded suite no longer exists: ${rel}`);
}

const discovered = allFound
  .filter((rel) => !EXCLUDED.has(rel))
  .filter((rel) => (filter ? rel.includes(filter) : true));

/** The k-th of n contiguous slices of the sorted list, so the same suite always lands in the
 *  same shard whatever else is in the repo. */
function shardOf(list) {
  if (!shardArg) return list;
  const match = /^([0-9]+)\/([0-9]+)$/.exec(shardArg);
  if (!match) fail(`--shard wants k/n, got "${shardArg}"`);
  const [k, n] = [Number(match[1]), Number(match[2])];
  if (k < 1 || n < 1 || k > n) fail(`--shard ${shardArg} is out of range`);
  const size = Math.ceil(list.length / n);
  return list.slice((k - 1) * size, k * size);
}

const suites = shardOf(discovered);

if (discovered.length === 0) fail(filter ? `no integration suite matches "${filter}"` : 'no integration suites found');
if (suites.length === 0) fail(`--shard ${shardArg} selects none of ${discovered.length} suite(s)`);

/**
 * A legal, unique, <=63-character database name for one suite.
 *
 * It STARTS WITH `test_` deliberately. `multiProjectIsolation` refuses to run at all unless
 * the database name carries a `test` / `scratch` / `throwaway` segment - a guard against
 * pointing destructive tests at something real - and an earlier `itier_…` name tripped it, so
 * the suite failed to run rather than running somewhere it should not. Any suite that adopts
 * the same guard is satisfied by this shape, and a stray database left behind is legible as
 * a test database at a glance.
 */
function databaseNameFor(rel, index) {
  const slug = path.basename(rel, '.integration.test.ts').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return `test_itier_${String(index).padStart(2, '0')}_${slug}`.slice(0, 63);
}

function urlForDatabase(name) {
  const url = new URL(serverUrl.toString());
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * Create and drop databases through the `pg` client the backend already depends on, so this
 * needs no `psql` on the runner. Each statement is its own connection: CREATE DATABASE cannot
 * run inside a transaction, and a pool held open would block the DROP.
 */
const { Client } = require(require.resolve('pg', { paths: [BACKEND] }));

async function onServer(sql) {
  const admin = new URL(serverUrl.toString());
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

const jestBin = require.resolve('jest/bin/jest', { paths: [BACKEND, REPO_ROOT] });

async function runSuite(rel, index) {
  const database = databaseNameFor(rel, index);
  await onServer(`DROP DATABASE IF EXISTS ${database}`);
  await onServer(`CREATE DATABASE ${database}`);

  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    [jestBin, '-c', 'jest.config.ts', '--ci', '--runInBand', `--testTimeout=${TEST_TIMEOUT_MS}`, rel],
    {
      cwd: BACKEND,
      env: {
        ...process.env,
        DATABASE_URL: urlForDatabase(database),
        // multiProjectIsolation gates itself on this as well, per CLAUDE.md's rule that
        // integration tests need an explicit opt-in. This job IS that opt-in: a dedicated
        // run against a disposable database. Without it the suite skips inside the very job
        // built to run it - measured, 5 tests silently skipped.
        SBP_INTEGRATION_DB: '1',
      },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: SUITE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    },
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const output = `${result.stdout || ''}${result.stderr || ''}`.replace(/\x1b\[[0-9;]*m/g, '');

  if (!keepDatabases) await onServer(`DROP DATABASE IF EXISTS ${database}`);

  // spawnSync reports a timeout as signal SIGKILL with a null status, which is otherwise
  // indistinguishable from a crash - so say which it was.
  const timedOut = result.signal === 'SIGKILL' || result.error?.code === 'ETIMEDOUT';
  const summary = timedOut
    ? `TIMED OUT after ${seconds}s (cap ${(SUITE_TIMEOUT_MS / 1000).toFixed(0)}s) — it did not finish, it was killed`
    : (output.match(/^Tests:.*$/m) || [])[0] || 'no test summary';
  const skipped = !timedOut && /^Test Suites:.*\b1 skipped\b/m.test(output);
  return { rel, ok: !timedOut && result.status === 0, skipped, timedOut, seconds, summary, output };
}

(async () => {
  console.log(`[integration-tier] ${suites.length} suite(s), one database each, on `
    + `${serverUrl.host}${filter ? ` (filter: ${filter})` : ''}${shardArg ? ` (shard ${shardArg})` : ''}`);
  for (const [rel, reason] of EXCLUDED) console.log(`  EXCLUDED  ${rel}\n            ${reason}`);

  const runs = [];
  for (const rel of suites) {
    // Numbered by position in the FULL discovered list, so a suite keeps its database name
    // whatever shard or filter selected it - two shards can run at once without colliding.
    const index = discovered.indexOf(rel) + 1;
    // eslint-disable-next-line no-await-in-loop
    const run = await runSuite(rel, index);
    const mark = run.ok ? (run.skipped ? "SKIP" : "PASS") : (run.timedOut ? "HUNG" : "FAIL");
    console.log(`  ${mark}  ${run.rel}  (${run.seconds}s)  ${run.summary}`);
    runs.push(run);
  }

  const failures = runs.filter((run) => !run.ok);

  // A SKIP here is a failure of this job's purpose, not a neutral outcome: every suite in
  // this set self-skips when its environment is missing, and this job is the environment. A
  // run that reports green over skipped suites is the thing it was built to stop.
  const skipped = runs.filter((run) => run.skipped);
  if (skipped.length > 0) {
    console.log(`\n[integration-tier] ${skipped.length} suite(s) SKIPPED inside the job built `
      + 'to run them. Each one prints its own reason above; it is an unmet environment '
      + 'requirement, not a passing test:');
    for (const run of skipped) console.log(`  SKIP  ${run.rel}`);
  }

  if (failures.length > 0 || skipped.length > 0) {
    console.log(`\n[integration-tier] ${failures.length} failed, ${skipped.length} skipped, `
      + `of ${suites.length} suite(s)\n`);
    for (const run of failures) {
      console.log(`──────── ${run.rel} ────────`);
      // The failure detail, not the whole run: jest's own ● blocks plus any SQL complaint.
      const lines = run.output.split('\n');
      const start = lines.findIndex((l) => l.includes('●'));
      console.log(lines.slice(start === -1 ? -40 : start, start === -1 ? undefined : start + 40).join('\n'));
    }
    process.exit(1);
  }

  console.log(`\n[integration-tier] all ${suites.length} suite(s) green`);
})().catch((err) => fail(err && err.stack ? err.stack : String(err)));
