/*
 * codexEngine - runs the Codex CLI for the platform build runner. I/O.  L13.5
 *
 * WHAT HAPPENS WHEN IT FAILS
 *   - sandbox canary fails      -> SandboxUnavailable, before any paid call. Never runs bare.
 *   - agent exits or turn fails -> classified; nothing is stored. No retry here: an agent run is
 *                                  paid, and the next publish queues a new one (capped at 3).
 *   - agent hangs               -> killed at timeoutMs, AgentTimeout.
 * NOT handled: a dollar cap. Codex has none and reports usage only when the turn ends, so the
 * limits are the timeout here and the spend limit on the OpenAI project.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { codexConfigToml, newState, readEvent, classifyFailure } = require('./codexConfig.cjs');

export class EngineError extends Error {
  constructor(errorClass, message, usage) { super(message); this.errorClass = errorClass; this.usage = usage; }
}

/** The proxy step writes {"port":N} once it is listening. */
export function proxyPort(infoFile) {
  try {
    const port = JSON.parse(fs.readFileSync(infoFile, 'utf8')).port;
    if (Number.isInteger(port)) return port;
  } catch { /* reported below with the class that names the cause */ }
  throw new EngineError('AuthError', 'the OpenAI key proxy is not running (is the OPENAI_API_KEY secret set?)');
}

/** Codex's own environment: only what it needs to start. No GitHub or OIDC variable reaches it. */
function childEnv(home) {
  const env = { PATH: process.env.PATH, HOME: os.homedir(), CODEX_HOME: home, LANG: 'C.UTF-8' };
  if (process.platform === 'win32') Object.assign(env, { SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), USERPROFILE: os.homedir() });
  return env;
}

export function createEngine({ codexBin, model, port, workspace }) {
  // Never under /tmp: the agent's commands can write there, and this file IS their sandbox policy.
  const home = fs.mkdtempSync(path.join(os.homedir(), '.codex-build-'));
  fs.writeFileSync(path.join(home, 'config.toml'), codexConfigToml({ model, proxyPort: port }));
  return { codexBin, home, workspace, port };
}

/**
 * Prove the sandbox before trusting it. Each probe runs under the same config as the agent's
 * commands. The first is a positive control: without it, a sandbox that cannot start at all would
 * "pass" every probe that expects a failure.
 */
export function assertSandbox(engine) {
  const run = (script, ...args) => spawnSync(engine.codexBin, ['sandbox', '--permission-profile', ':workspace', '--cd', engine.workspace, '--', '/bin/sh', '-c', script, 'sh', ...args], {
    cwd: engine.workspace, env: childEnv(engine.home), timeout: 60_000, encoding: 'utf8',
  });
  const fail = (what) => { throw new EngineError('SandboxUnavailable', `sandbox check failed: ${what}`); };

  const ok = run('echo ok > .sandbox-probe && cat .sandbox-probe && rm .sandbox-probe');
  if (ok.status !== 0 || ok.stdout.trim() !== 'ok') fail(`a command could not run and write in the workspace (exit ${ok.status}: ${String(ok.error?.code ?? ok.stderr ?? '').trim().slice(-300)})`);

  // Listening right now on this machine, so refusal means the sandbox blocked it.
  const net = run('node -e \'const s=require("net").connect(+process.argv[1],"127.0.0.1");s.on("connect",()=>{console.log("OPEN");process.exit()});s.on("error",()=>{console.log("BLOCKED")});setTimeout(()=>{console.log("BLOCKED");process.exit()},5000)\' "$1"', String(engine.port));
  if (net.status !== 0 || net.stdout.trim() !== 'BLOCKED') fail('network is reachable, or could not be tested');

  const proc = run('if cat "/proc/$1/environ" >/dev/null 2>&1; then echo READABLE; else echo HIDDEN; fi', String(process.pid));
  if (proc.status !== 0 || proc.stdout.trim() !== 'HIDDEN') fail('the runner process environment is readable');

  const outside = path.join(os.homedir(), '.sandbox-escape-probe');
  const write = run('if echo x > "$1" 2>/dev/null; then echo WROTE; else echo DENIED; fi', outside);
  if (write.status !== 0 || write.stdout.trim() !== 'DENIED' || fs.existsSync(outside)) fail('a write outside the workspace succeeded');
}

/**
 * One agent run. The environment policy is proven the same way as the rest of the boundary:
 * Codex gets `childEnv`, so there is no secret for a command to inherit.
 */
export function runCodex(engine, { prompt, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const state = newState();
    let timedOut = false;
    const child = spawn(engine.codexBin, [
      'exec', '--json', '--strict-config', '--ephemeral', '--ignore-rules', '--skip-git-repo-check',
      '--cd', engine.workspace, '-',
    ], { env: childEnv(engine.home), stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });

    let stderrTail = '';
    child.stderr.on('data', (d) => { stderrTail = (stderrTail + d).slice(-2000); });
    const lines = readline.createInterface({ input: child.stdout });
    const drained = new Promise((done) => lines.on('close', done));
    lines.on('line', (line) => readEvent(state, line));

    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }, timeoutMs);

    child.on('error', (err) => { clearTimeout(timer); reject(new EngineError('EngineMissing', `codex could not start: ${err.code}`, state.usage)); });
    child.on('close', async (code) => {
      clearTimeout(timer);
      await drained;
      if (timedOut) return reject(new EngineError('AgentTimeout', `agent exceeded ${Math.round(timeoutMs / 60000)} minutes`, state.usage));
      if (code !== 0 || state.failed || !state.completed) {
        const why = state.error || stderrTail.trim() || `exit ${code}`;
        return reject(new EngineError(classifyFailure(why), why.slice(-400), state.usage));
      }
      resolve(state);
    });
    // The child may die before reading the prompt; its exit code is the report, not this EPIPE.
    child.stdin.on('error', (err) => { if (err.code !== 'EPIPE' && err.code !== 'EOF') stderrTail += err.code; });
    child.stdin.end(prompt);
  });
}

export function destroyEngine(engine) { fs.rmSync(engine.home, { recursive: true, force: true }); }
