/**
 * Instrumented OpenAI client for the .js cron/ops scripts (TBI audit P1-2, JS side).
 *
 * The TS runtime paths route through services/openaiInstrumented.ts; the standalone .js
 * cron scripts can't import that TS module, so this is the CommonJS equivalent. It returns a
 * normal OpenAI client whose chat.completions.create is wrapped to (1) strip high-sensitivity
 * PII (SSN/cards) from outgoing string content, (2) forward the call UNCHANGED, and (3) record
 * an ai_events row with computed cost.
 *
 * Migration is a construction-only swap: replace `new OpenAI({ apiKey })` with
 * `getInstrumentedOpenAI({ workflow_id: '<script>' })`. Everything is swallow-safe — a logging
 * or DB failure can NEVER break the cron job (worst case: the event isn't recorded).
 */
const path = require('path');

// Resolve openai exactly the way the sibling .js scripts do (repo-root node_modules, .default
// export). Same __dirname as govBidTaskGenerator.js / launchPmoTaskGenerator.js, so the proven
// '../../../../node_modules/openai' path applies. `|| _oai` covers builds where the module IS the ctor.
const _oai = require(path.resolve(__dirname, '../../../../node_modules/openai'));
const OpenAI = _oai.default || _oai;

// OpenAI list prices, USD per 1M tokens — keep in sync with backend/src/utils/aiCost.ts.
const MODEL_PRICING = {
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10 },
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'text-embedding-3-small': { inputPerM: 0.02, outputPerM: 0.02 },
  'text-embedding-3-large': { inputPerM: 0.13, outputPerM: 0.13 },
};
const PRICING_KEYS = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);

function computeCostUsd(model, promptTokens, completionTokens) {
  if (!model) return null;
  let key = MODEL_PRICING[model] ? model : null;
  if (!key) {
    const m = String(model).toLowerCase();
    key = PRICING_KEYS.find((k) => m.startsWith(k)) || null;
  }
  if (!key) return null;
  const p = MODEL_PRICING[key];
  const cost = ((promptTokens || 0) / 1e6) * p.inputPerM + ((completionTokens || 0) / 1e6) * p.outputPerM;
  return Math.round(cost * 1e6) / 1e6;
}

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const CC_RE = /\b\d(?:[ -]?\d){12,15}\b/g;
function redactSensitive(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(SSN_RE, '[REDACTED-SSN]')
    .replace(CC_RE, (m) => {
      const d = m.replace(/\D/g, '');
      return d.length >= 13 && d.length <= 16 ? '[REDACTED-CARD]' : m;
    });
}

// Lazy, shared pg pool from DATABASE_URL (the cron scripts already run with DB access).
let _pool = null;
function getPool() {
  if (_pool === null) {
    try {
      const { Pool } = require(path.resolve(__dirname, '../../../../node_modules/pg'));
      _pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 2 }) : false;
    } catch {
      _pool = false;
    }
  }
  return _pool || null;
}

async function emitAiEvent(ev) {
  try {
    const pool = getPool();
    if (!pool) return;
    await pool.query(
      `INSERT INTO ai_events
         (event_type, outcome, external_system, workflow_id, model,
          prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, error_class, cache_hit, metadata)
       VALUES ($1,$2,'openai',$3,$4,$5,$6,$7,$8,$9,$10,false,$11)`,
      [
        ev.event_type || 'llm.call',
        ev.outcome || 'success',
        ev.workflow_id || null,
        ev.model || null,
        ev.prompt_tokens ?? null,
        ev.completion_tokens ?? null,
        ev.total_tokens ?? null,
        ev.cost_usd ?? null,
        ev.duration_ms ?? null,
        ev.error_class || null,
        ev.metadata ? JSON.stringify(ev.metadata) : null,
      ]
    );
  } catch {
    /* swallow — telemetry must never break a cron job */
  }
}

function getInstrumentedOpenAI(context = {}, clientOptions = {}) {
  const client = new OpenAI(Object.assign({ apiKey: process.env.OPENAI_API_KEY }, clientOptions));
  const completions = client.chat.completions;
  const origCreate = completions.create.bind(completions);

  completions.create = async (paramsIn, opts) => {
    let params = paramsIn;
    if (params && Array.isArray(params.messages)) {
      params = Object.assign({}, params, {
        messages: params.messages.map((m) =>
          m && typeof m.content === 'string' ? Object.assign({}, m, { content: redactSensitive(m.content) }) : m
        ),
      });
    }
    const model = (params && params.model) || 'unknown';
    const t0 = Date.now();
    if (params && params.stream) {
      const stream = await origCreate(params, opts);
      emitAiEvent({ workflow_id: context.workflow_id, model, duration_ms: Date.now() - t0, metadata: { streamed: true } });
      return stream;
    }
    try {
      const resp = await origCreate(params, opts);
      const u = (resp && resp.usage) || {};
      emitAiEvent({
        workflow_id: context.workflow_id,
        model,
        prompt_tokens: u.prompt_tokens ?? null,
        completion_tokens: u.completion_tokens ?? null,
        total_tokens: u.total_tokens ?? null,
        cost_usd: computeCostUsd(model, u.prompt_tokens, u.completion_tokens),
        duration_ms: Date.now() - t0,
      });
      return resp;
    } catch (err) {
      emitAiEvent({
        workflow_id: context.workflow_id,
        outcome: 'failure',
        model,
        duration_ms: Date.now() - t0,
        error_class: (err && err.name) || 'Error',
        metadata: { message: err && err.message },
      });
      throw err;
    }
  };

  return client;
}

module.exports = { getInstrumentedOpenAI, computeCostUsd, redactSensitive, emitAiEvent };
