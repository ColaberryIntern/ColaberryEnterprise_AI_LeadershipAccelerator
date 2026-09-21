/**
 * factoryDecompose — grounded input → a raw FactoryProject decomposition (processes + tasks +
 * assignments + transitions + roles). The I/O shell only: the prompt lives in ./factoryDecomposePrompt
 * (pure) and the gate in ./factoryValidate (pure), so this file owns just the model call and its
 * failure behaviour, exactly as sbp/decomposeService owns the BuildPlan call.
 *
 * Failure-first (CLAUDE.md): the call is bounded (explicit timeout, capped retries), a
 * shape-invalid response is retried exactly once and then fails cleanly with a classified error,
 * and every outcome is a structured log event. It never leaves a caller on an unbounded call and
 * never returns a half-built decomposition. It does NOT gate — factoryAssemble + factoryValidate
 * (T5/T7) do, so generation and judgement stay separable and the model never self-certifies.
 */
import OpenAI from 'openai';
import type {
  ProcessRecord, FactoryTask, Assignment, TransitionEdge, Role,
} from './contracts/factoryContract';
import { FACTORY_DECOMPOSITION_JSON_SCHEMA } from './contracts/factoryContractSchema';
import {
  FACTORY_DECOMPOSE_SYSTEM_PROMPT,
  buildFactoryDecomposeUserPrompt,
  type FactoryDecomposeInputs,
} from './factoryDecomposePrompt';

/** Bounded per CLAUDE.md: no unbounded external call. Decomposition is a big completion. */
const REQUEST_TIMEOUT_MS = 240_000;
const SDK_RETRIES = 1;
/** Shape-invalid output is retried once, then the job fails. No unbounded loop. */
const MAX_SHAPE_ATTEMPTS = 2;

export type FactoryDecomposeErrorClass =
  | 'ConfigError'
  | 'UpstreamTimeout'
  | 'UpstreamError'
  | 'EmptyResponse'
  | 'ContractViolation';

export class FactoryDecomposeError extends Error {
  constructor(public readonly error_class: FactoryDecomposeErrorClass, message: string) {
    super(message);
    this.name = 'FactoryDecomposeError';
  }
}

/** The raw five-list decomposition the model returns (pre-assembly, pre-gate). */
export interface FactoryDecomposition {
  processes: ProcessRecord[];
  tasks: FactoryTask[];
  assignments: Assignment[];
  transitions: TransitionEdge[];
  roles: Role[];
}

export interface FactoryDecomposeOptions {
  inputs: FactoryDecomposeInputs;
  model?: string;
  correlationId?: string;
  /** Injected in tests. Production resolves the shared bounded client. */
  client?: Pick<OpenAI['chat']['completions'], 'create'>;
}

export interface FactoryDecomposeResult {
  decomposition: FactoryDecomposition;
  /** How many model calls it took (1 = clean first pass). */
  attempts: number;
  model: string;
  /** The bounded client used, so the repair pass (T6) reuses the same failure behaviour. */
  client: Pick<OpenAI['chat']['completions'], 'create'>;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'factory-decompose',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

let sharedClient: OpenAI | null = null;
function defaultClient(): Pick<OpenAI['chat']['completions'], 'create'> {
  if (!process.env.OPENAI_API_KEY) {
    throw new FactoryDecomposeError('ConfigError', 'OPENAI_API_KEY is not configured');
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

/**
 * OpenAI strict structured outputs accept `anyOf` but reject `oneOf`. The frozen assignment schema
 * expresses the executor as `oneOf: [object, null]` (Phase 1, unchangeable). Deep-clone the schema
 * and rewrite every `oneOf` to `anyOf` so it is submittable with strict:true, WITHOUT touching the
 * frozen source. Pure and total; exported so a test can assert no `oneOf` survives.
 */
export function toStrictSchema<T>(schema: T): T {
  if (Array.isArray(schema)) return schema.map((s) => toStrictSchema(s)) as unknown as T;
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      out[k === 'oneOf' ? 'anyOf' : k] = toStrictSchema(v);
    }
    return out as unknown as T;
  }
  return schema;
}

const STRICT_DECOMPOSITION_SCHEMA = toStrictSchema(FACTORY_DECOMPOSITION_JSON_SCHEMA);

/** Structural check before the decomposition reaches assembly — cheap, localises a bad response. */
export function isDecompositionShaped(v: unknown): v is FactoryDecomposition {
  const d = v as FactoryDecomposition | null;
  return !!d
    && Array.isArray(d.processes) && d.processes.length > 0
    && Array.isArray(d.tasks) && d.tasks.length > 0
    && Array.isArray(d.assignments)
    && Array.isArray(d.transitions)
    && Array.isArray(d.roles);
}

/**
 * Generate a decomposition. Does NOT gate it — the caller (factoryGenerate) assembles a
 * FactoryProject and runs factoryValidate, deciding whether to repair or fail closed.
 */
export async function factoryDecompose(opts: FactoryDecomposeOptions): Promise<FactoryDecomposeResult> {
  const model = opts.model || process.env.FACTORY_DECOMPOSE_MODEL || 'gpt-4o';
  const client = opts.client ?? defaultClient();
  const userPrompt = buildFactoryDecomposeUserPrompt(opts.inputs);

  const started = Date.now();
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_SHAPE_ATTEMPTS; attempt++) {
    let completion: any;
    try {
      completion = await client.create({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: FACTORY_DECOMPOSE_SYSTEM_PROMPT },
          { role: 'user', content: attempt === 1 ? userPrompt : `${userPrompt}\n\nYour previous response was rejected: ${lastProblem}. Return valid JSON matching the schema exactly.` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'factory_decomposition', strict: true, schema: STRICT_DECOMPOSITION_SCHEMA },
        },
      });
    } catch (err: any) {
      const isTimeout = err?.name === 'APIConnectionTimeoutError'
        || /timeout|aborted|ETIMEDOUT/i.test(String(err?.message ?? ''));
      const error_class: FactoryDecomposeErrorClass = isTimeout ? 'UpstreamTimeout' : 'UpstreamError';
      log('factory_decompose_failed', opts.correlationId, 'failure', {
        error_class, attempt, model, duration_ms: Date.now() - started, message: err?.message,
      });
      throw new FactoryDecomposeError(error_class, `decomposition call failed (${error_class}): ${err?.message}`);
    }

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      lastProblem = 'the response contained no content';
      if (attempt < MAX_SHAPE_ATTEMPTS) continue;
      log('factory_decompose_failed', opts.correlationId, 'failure', {
        error_class: 'EmptyResponse', attempt, model, duration_ms: Date.now() - started,
      });
      throw new FactoryDecomposeError('EmptyResponse', 'model returned no content after retry');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err: any) {
      lastProblem = `the response was not valid JSON (${err?.message})`;
      if (attempt < MAX_SHAPE_ATTEMPTS) continue;
      log('factory_decompose_failed', opts.correlationId, 'failure', {
        error_class: 'ContractViolation', attempt, model, reason: 'unparseable JSON',
      });
      throw new FactoryDecomposeError('ContractViolation', 'model returned unparseable JSON after retry');
    }

    if (!isDecompositionShaped(parsed)) {
      lastProblem = 'the JSON did not match the decomposition shape (need non-empty processes and tasks, and assignment/transition/role arrays)';
      if (attempt < MAX_SHAPE_ATTEMPTS) continue;
      log('factory_decompose_failed', opts.correlationId, 'failure', {
        error_class: 'ContractViolation', attempt, model, reason: 'shape mismatch',
      });
      throw new FactoryDecomposeError('ContractViolation', 'model output did not match the decomposition contract after retry');
    }

    log('factory_decompose_completed', opts.correlationId, 'success', {
      attempts: attempt,
      model,
      duration_ms: Date.now() - started,
      processes: parsed.processes.length,
      tasks: parsed.tasks.length,
      assignments: parsed.assignments.length,
      transitions: parsed.transitions.length,
      roles: parsed.roles.length,
    });
    return { decomposition: parsed, attempts: attempt, model, client };
  }

  /* istanbul ignore next -- the loop always returns or throws; this satisfies the compiler. */
  throw new FactoryDecomposeError('ContractViolation', 'decomposition exhausted its attempts');
}
