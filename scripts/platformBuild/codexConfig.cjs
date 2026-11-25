'use strict';
/*
 * codexConfig - the settings, cost arithmetic and event reading for the Codex runner. PURE.
 *
 * L13.5. CommonJS so the backend's jest suite can require it; codexEngine.mjs does the I/O.
 *
 * The agent is driven by a student's plan, which is untrusted text, and whatever it writes is
 * served. So a secret it could READ is a secret it could publish, even with no network. Hence:
 * the OpenAI key lives only in a proxy process started by an earlier workflow step, commands get
 * an empty environment, and a canary proves all of it before the agent starts.
 */

const CODEX_VERSION = '0.172.0';
const DEFAULT_MODEL = 'gpt-6.2-sol';

/** $ per 1M tokens, standard rate, developers.openai.com/api/docs/pricing, read 2026-11-24. */
const PRICES = {
  'gpt-6.2-astra': { input: 8, cached: 0.4, output: 40 },
  'gpt-6.2-sol': { input: 2, cached: 0.1, output: 10 },
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
  'gpt-6.1-terra': { input: 1, cached: 0.05, output: 5 },
};

/** The whole config.toml. One file, read by both `codex exec` and `codex sandbox`. */
function codexConfigToml({ model, proxyPort }) {
  if (!/^[a-z0-9.-]+$/.test(model)) throw new Error('model id has unexpected characters');
  if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535) throw new Error('proxy port is invalid');
  return [
    `model = "${model}"`,
    'model_provider = "build-proxy"',
    'model_reasoning_effort = "high"',
    'approval_policy = "never"',
    // One profile for `codex exec` and `codex sandbox` (which ignores the legacy sandbox_mode), so
    // the sandbox that is proven is the one the agent runs in. :workspace grants no network.
    'default_permissions = ":workspace"',
    'web_search = "disabled"',
    // The workspace carries a CLAUDE.md managed block, as a student's session would read.
    'project_doc_fallback_filenames = ["CLAUDE.md"]',
    'project_doc_max_bytes = 131072',
    '',
    '[model_providers.build-proxy]',
    'name = "build-proxy"',
    `base_url = "http://127.0.0.1:${proxyPort}/v1"`,
    'wire_api = "responses"',
    '',
    '[shell_environment_policy]',
    'inherit = "none"',
    '',
    '[shell_environment_policy.set]',
    'PATH = "/usr/local/bin:/usr/bin:/bin"',
    'HOME = "/tmp"',
    'LANG = "C.UTF-8"',
    '',
  ].join('\n');
}

/** Null when the model has no known price: an unknown cost must not be recorded as $0. */
function costUsd(model, usage) {
  const p = PRICES[model];
  if (!p) return null;
  const cached = Math.min(usage.cached, usage.input);
  return ((usage.input - cached) * p.input + cached * p.cached + usage.output * p.output) / 1e6;
}

const newState = () => ({
  completed: false, failed: false, lastMessage: '', error: '', items: 0, unreadable: 0,
  usage: { input: 0, cached: 0, output: 0 },
});

const count = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/** Fold one `codex exec --json` line into the state. A line that is not JSON is counted, not fatal. */
function readEvent(state, line) {
  if (!line.trim()) return state;
  let ev;
  try { ev = JSON.parse(line); } catch { state.unreadable += 1; return state; }
  if (!ev || typeof ev !== 'object') { state.unreadable += 1; return state; }
  if (ev.type === 'turn.completed') {
    state.completed = true;
    state.usage.input += count(ev.usage?.input_tokens);
    state.usage.cached += count(ev.usage?.cached_input_tokens);
    state.usage.output += count(ev.usage?.output_tokens);
  } else if (ev.type === 'turn.failed') {
    state.failed = true;
    state.error = String(ev.error?.message ?? ev.message ?? 'turn failed').slice(0, 400);
  } else if (ev.type === 'error') {
    // Codex also emits `error` while it retries, so only turn.failed or the exit code is fatal.
    state.error = String(ev.message ?? 'error').slice(0, 400);
  } else if (ev.type === 'item.completed') {
    state.items += 1;
    if (ev.item?.type === 'agent_message') state.lastMessage = String(ev.item.text ?? '');
  }
  return state;
}

/** A stable class for a failed run. The message itself is never logged: the logs are public. */
function classifyFailure(message) {
  const m = String(message);
  if (/\b401\b|invalid.api.key|incorrect api key|unauthorized/i.test(m)) return 'AuthError';
  if (/quota|billing|insufficient/i.test(m)) return 'QuotaError';
  if (/\b429\b|rate limit/i.test(m)) return 'RateLimitError';
  if (/\b404\b|model.*(not found|does not exist)/i.test(m)) return 'ModelUnavailable';
  if (/\b5\d\d\b|stream (disconnected|error)|timed? ?out|connection/i.test(m)) return 'UpstreamUnavailable';
  return 'AgentIncomplete';
}

module.exports = { CODEX_VERSION, DEFAULT_MODEL, PRICES, codexConfigToml, costUsd, newState, readEvent, classifyFailure };
