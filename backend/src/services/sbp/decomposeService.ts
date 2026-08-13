/**
 * decomposeService — brief + requirements document → a structured BuildPlan.
 *
 * The I/O shell. All prompt content lives in ./decomposePrompt (pure) and all
 * grading in ./planGate (pure), so this file only owns the model call and its
 * failure behaviour.
 *
 * Failure-first (CLAUDE.md): the call is bounded (explicit timeout, capped
 * retries), a schema-invalid response is retried exactly once and then fails
 * cleanly, and every outcome is logged as a structured event with an
 * error_class. It never leaves a caller waiting on an unbounded call and never
 * returns a half-built plan.
 */
import OpenAI from 'openai';
import { BuildPlan, BUILD_PLAN_JSON_SCHEMA } from './planContract';
import {
  DecomposeInputs,
  DECOMPOSE_SYSTEM_PROMPT,
  buildDecomposeUserPrompt,
} from './decomposePrompt';

/** Bounded per CLAUDE.md: no unbounded external call. Decomposition is a big completion. */
const REQUEST_TIMEOUT_MS = 240_000;
const SDK_RETRIES = 1;
/** Schema-invalid output is retried once, then the job fails. No unbounded loop. */
const MAX_SHAPE_ATTEMPTS = 2;

export type DecomposeErrorClass =
  | 'ConfigError'
  | 'UpstreamTimeout'
  | 'UpstreamError'
  | 'EmptyResponse'
  | 'ContractViolation';

export class DecomposeError extends Error {
  constructor(public readonly error_class: DecomposeErrorClass, message: string) {
    super(message);
    this.name = 'DecomposeError';
  }
}

export interface DecomposeOptions extends DecomposeInputs {
  model?: string;
  correlationId?: string;
  /** Injected in tests. Production resolves the shared bounded client. */
  client?: Pick<OpenAI['chat']['completions'], 'create'>;
}

export interface DecomposeResult {
  plan: BuildPlan;
  /** How many model calls it took (1 = clean first pass). */
  attempts: number;
  model: string;
  /**
   * The bounded client this call used. Returned so the repair pass reuses the
   * same configured connection — same timeout, same capped retries — rather
   * than constructing a second one with different failure behaviour.
   */
  client: Pick<OpenAI['chat']['completions'], 'create'>;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-decompose',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

let sharedClient: OpenAI | null = null;
function defaultClient(): Pick<OpenAI['chat']['completions'], 'create'> {
  if (!process.env.OPENAI_API_KEY) {
    throw new DecomposeError('ConfigError', 'OPENAI_API_KEY is not configured');
  }
  if (!sharedClient) {
    sharedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: SDK_RETRIES,
    });
  }
  return sharedClient.chat.completions;
}

/** Structural check before the plan reaches the gate — cheap, and localises a bad response. */
function isPlanShaped(v: unknown): v is BuildPlan {
  const p = v as BuildPlan | null;
  return !!p
    && typeof p.project_name === 'string'
    && typeof p.descriptor === 'string'
    && Array.isArray(p.requirements) && p.requirements.length > 0
    && Array.isArray(p.releases) && p.releases.length > 0
    && Array.isArray(p.stories) && p.stories.length > 0;
}

/**
 * Generate a plan. Does NOT gate it — the caller runs `gatePlan` and decides
 * whether to repair or fail closed, so generation and judgement stay separable.
 */
export async function decomposeBuild(opts: DecomposeOptions): Promise<DecomposeResult> {
  const model = opts.model || process.env.SBP_DECOMPOSE_MODEL || 'gpt-4o';
  const client = opts.client ?? defaultClient();
  const userPrompt = buildDecomposeUserPrompt(opts);

  const started = Date.now();
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_SHAPE_ATTEMPTS; attempt++) {
    let completion: any;
    try {
      completion = await client.create({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: DECOMPOSE_SYSTEM_PROMPT },
          { role: 'user', content: attempt === 1 ? userPrompt : `${userPrompt}\n\nYour previous response was rejected: ${lastProblem}. Return valid JSON matching the schema exactly.` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'build_plan', strict: true, schema: BUILD_PLAN_JSON_SCHEMA },
        },
      });
    } catch (err: any) {
      // Distinguish a timeout from any other upstream failure so the caller can
      // tell "retry later" from "this is broken".
      const isTimeout = err?.name === 'APIConnectionTimeoutError'
        || /timeout|aborted|ETIMEDOUT/i.test(String(err?.message ?? ''));
      const error_class: DecomposeErrorClass = isTimeout ? 'UpstreamTimeout' : 'UpstreamError';
      log('sbp_decompose_failed', opts.correlationId, 'failure', {
        error_class, attempt, model, duration_ms: Date.now() - started, message: err?.message,
      });
      throw new DecomposeError(error_class, `decomposition call failed (${error_class}): ${err?.message}`);
    }

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      lastProblem = 'the response contained no content';
      if (attempt < MAX_SHAPE_ATTEMPTS) continue;
      log('sbp_decompose_failed', opts.correlationId, 'failure', {
        error_class: 'EmptyResponse', attempt, model, duration_ms: Date.now() - started,
      });
      throw new DecomposeError('EmptyResponse', 'model returned no content after retry');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err: any) {
      lastProblem = `the response was not valid JSON (${err?.message})`;
      if (attempt < MAX_SHAPE_ATTEMPTS) continue;
      log('sbp_decompose_failed', opts.correlationId, 'failure', {
        error_class: 'ContractViolation', attempt, model, reason: 'unparseable JSON',
      });
      throw new DecomposeError('ContractViolation', 'model returned unparseable JSON after retry');
    }

    if (!isPlanShaped(parsed)) {
      lastProblem = 'the JSON did not match the BuildPlan shape (empty or missing requirements/releases/stories)';
      if (attempt < MAX_SHAPE_ATTEMPTS) continue;
      log('sbp_decompose_failed', opts.correlationId, 'failure', {
        error_class: 'ContractViolation', attempt, model, reason: 'shape mismatch',
      });
      throw new DecomposeError('ContractViolation', 'model output did not match the plan contract after retry');
    }

    log('sbp_decompose_completed', opts.correlationId, 'success', {
      attempts: attempt,
      model,
      duration_ms: Date.now() - started,
      requirements: parsed.requirements.length,
      releases: parsed.releases.length,
      stories: parsed.stories.length,
    });
    return { plan: parsed, attempts: attempt, model, client };
  }

  /* istanbul ignore next -- the loop always returns or throws; this satisfies the compiler. */
  throw new DecomposeError('ContractViolation', 'decomposition exhausted its attempts');
}
