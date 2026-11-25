#!/usr/bin/env node
/*
 * runPlatformBuild - the build runner's one job: build ONE project's Command Center and Demo.
 *
 * Runs only inside .github/workflows/platform-build-runner.yml on a GitHub-hosted runner (ESC-4:
 * agent execution never shares the internet-facing backend's machine). L13.1.
 *
 *   1. Prove who we are with a GitHub OIDC token (no stored secret; the repo is public).
 *   2. Claim the run and download the workspace: the project's rendered docs plus two briefs.
 *   3. Prove the command sandbox holds, then run the agent (OpenAI Codex, codexEngine.mjs) twice in
 *      that workspace: the Command Center brief, then the demo brief.
 *   4. Upload index.html, command-center/** and demo/demo-spec.json. The platform validates and
 *      stores them as a new version, and serves them itself.
 *   5. On any failure, report it with an error class so the run is marked failed and the next
 *      publish can try again.
 *
 * LOGS ARE PUBLIC (public repo). This script prints counts, states and costs only, never file
 * contents, prompts, agent messages or project data.
 *
 * Exit codes: 0 done (or nothing to do), 1 failed and reported, 2 failed and could not report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertSandbox, createEngine, destroyEngine, proxyPort, runCodex } from './codexEngine.mjs';

const require = createRequire(import.meta.url);
const { DEFAULT_MODEL, PRICES, costUsd } = require('./codexConfig.cjs');
const { collectUpload } = require('./collectUpload.cjs');

const AUDIENCE = 'colaberry-platform-build';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_BYTES = 900_000;

const env = process.env;
const RUN_ID = env.RUN_ID || '';
const API_BASE = (env.PLATFORM_API_BASE || '').replace(/\/+$/, '');
const WORKSPACE = path.resolve(env.WORKSPACE || 'workspace');
const MODEL = env.PLATFORM_BUILD_MODEL || DEFAULT_MODEL;
const AGENT_MINUTES_CC = Number(env.PLATFORM_BUILD_MINUTES_CC || 30);
const AGENT_MINUTES_DEMO = Number(env.PLATFORM_BUILD_MINUTES_DEMO || 15);

const say = (event, data = {}) => console.log(JSON.stringify({ event, ...data }));

class StepError extends Error {
  constructor(errorClass, message) { super(message); this.errorClass = errorClass; }
}

// ---- identity + HTTP ---------------------------------------------------------

async function oidcToken() {
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) throw new StepError('AuthError', 'no OIDC endpoint: the job needs permissions.id-token: write');
  const res = await fetch(`${url}&audience=${encodeURIComponent(AUDIENCE)}`, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new StepError('AuthError', `OIDC token request returned ${res.status}`);
  const body = await res.json();
  if (!body.value) throw new StepError('AuthError', 'OIDC token response had no value');
  return body.value;
}

/** One API call with a fresh OIDC token, 30 s timeout, up to 3 attempts on network/5xx. */
async function api(method, suffix, body) {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const token = await oidcToken();
      const res = await fetch(`${API_BASE}/api/platform-build/runs/${RUN_ID}/${suffix}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status < 500) return { status: res.status, json: await res.json().catch(() => ({})) };
      last = new StepError('UpstreamUnavailable', `${suffix} returned ${res.status}`);
    } catch (err) {
      last = err instanceof StepError ? err : new StepError(err?.name === 'TimeoutError' ? 'TimeoutError' : 'UpstreamUnavailable', `${suffix}: ${err?.message}`);
      if (last.errorClass === 'AuthError') throw last;
    }
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  throw last;
}

// ---- workspace ---------------------------------------------------------------

function inside(root, rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new StepError('ContractViolation', 'bundle path escapes the workspace');
  return abs;
}

function writeWorkspace(files) {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  fs.mkdirSync(WORKSPACE, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = inside(WORKSPACE, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

// ---- agent ---------------------------------------------------------------------

/** Priced from token counts; main() has already refused a model with no known price. */
const priced = (usage) => (usage ? Number((costUsd(MODEL, usage) ?? 0).toFixed(4)) : 0);

async function runAgent(engine, label, prompt, minutes, doneMarker) {
  let state;
  try {
    state = await runCodex(engine, { prompt, timeoutMs: minutes * 60_000 });
  } catch (err) {
    const cost = priced(err.usage);
    say('agent_failed', { label, error_class: err.errorClass || err.name, cost_usd: cost });
    throw Object.assign(err, { cost });
  }
  const cost = priced(state.usage);
  say('agent_finished', {
    label, items: state.items, unreadable_events: state.unreadable,
    input_tokens: state.usage.input, output_tokens: state.usage.output, cost_usd: cost,
  });
  if (!state.lastMessage.includes(doneMarker)) say('agent_no_done_marker', { label });
  return cost;
}

// ---- main ----------------------------------------------------------------------

async function main() {
  if (!UUID.test(RUN_ID)) throw new StepError('ValidationError', 'RUN_ID is not a uuid');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(API_BASE)) throw new StepError('ValidationError', 'PLATFORM_API_BASE must be an https origin');
  // An unpriced model would be recorded as costing $0, so it is refused before it can spend.
  if (!(MODEL in PRICES)) throw new StepError('ValidationError', 'PLATFORM_BUILD_MODEL has no price in codexConfig.cjs');
  if (!env.CODEX_BIN || !env.PROXY_INFO) throw new StepError('ContractViolation', 'CODEX_BIN and PROXY_INFO must be set');
  const port = proxyPort(env.PROXY_INFO);

  const bundle = await api('GET', 'bundle');
  if (bundle.status === 409) { say('nothing_to_do', { reason: bundle.json?.error ?? 'conflict' }); return 0; }
  if (bundle.status !== 200) throw new StepError('UpstreamUnavailable', `bundle returned ${bundle.status}`);
  const { files, prompts, done_marker: doneMarker } = bundle.json;
  writeWorkspace(files);
  say('workspace_ready', { files: Object.keys(files).length });

  const engine = createEngine({ codexBin: env.CODEX_BIN, model: MODEL, port, workspace: WORKSPACE });
  let cost = 0;
  try {
    assertSandbox(engine);
    say('sandbox_proven');
    cost += await runAgent(engine, 'command_center', prompts.command_center, AGENT_MINUTES_CC, doneMarker);
    if (!fs.existsSync(path.join(WORKSPACE, 'index.html'))) throw new StepError('AgentIncomplete', 'no index.html was written');
    try {
      cost += await runAgent(engine, 'demo', prompts.demo, AGENT_MINUTES_DEMO, doneMarker);
    } catch (err) {
      // A Command Center without a demo is still worth keeping; the upload reports the gap.
      cost += err.cost || 0;
      say('demo_agent_failed', { error_class: err.errorClass || err.name });
    }
  } catch (err) {
    err.cost = cost + (err.cost || 0);
    throw err;
  } finally {
    destroyEngine(engine);
  }

  const upload = collectUpload(WORKSPACE);
  const bytes = Object.values(upload.files).reduce((n, s) => n + Buffer.byteLength(s, 'utf8'), 0);
  say('upload_ready', { files: Object.keys(upload.files).length, skipped: upload.skipped, bytes });
  if (bytes > MAX_UPLOAD_BYTES) throw Object.assign(new StepError('ContractViolation', `upload is ${bytes} bytes`), { cost });

  const saved = await api('POST', 'artifacts', { files: upload.files, cost_usd: Number(cost.toFixed(4)) });
  if (saved.status !== 200) {
    const problems = (saved.json?.problems || []).slice(0, 10).map((p) => `${p.path ?? '-'}: ${p.problem}`).join('; ');
    throw Object.assign(new StepError('UploadRefused', `upload returned ${saved.status}: ${problems}`), { cost });
  }
  say('uploaded', {
    command_center_version: saved.json.commandCenterVersion ?? null,
    demo_version: saved.json.demoVersion ?? null,
    demo_problems: (saved.json.demo_problems || []).length,
    duplicate: Boolean(saved.json.duplicate),
    cost_usd: Number(cost.toFixed(4)),
  });
  return 0;
}

main().then((code) => process.exit(code)).catch(async (err) => {
  const errorClass = String(err?.errorClass || err?.name || 'Error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64) || 'Error';
  const detail = String(err?.message || '').slice(0, 500);
  say('run_failed', { error_class: errorClass });
  try {
    if (UUID.test(RUN_ID) && API_BASE) {
      await api('POST', 'failure', { error_class: /^[A-Za-z]/.test(errorClass) ? errorClass : 'Error', detail, cost_usd: Number((err?.cost || 0).toFixed(4)) });
    }
    process.exit(1);
  } catch {
    process.exit(2);
  }
});
