/**
 * One bounded, shape-checked, structured-output model call.
 *
 * EXTRACTED from `decomposeService.decomposeBuild` for P6-T2, which splits requirement
 * extraction from implementation-plan generation into two separately reachable stages. Both
 * stages need the identical apparatus: a capped timeout, capped SDK retries, ONE schema-failure
 * retry, and an error taxonomy that tells a caller "retry later" from "this is broken".
 *
 * ## Why extracted rather than written twice
 *
 * The duplicate would not have been the loop, it would have been the TAXONOMY. Sixty lines
 * deciding whether a thrown error is an `UpstreamTimeout` or an `UpstreamError`, whether empty
 * content is retryable, and whether a shape mismatch is a `ContractViolation`. Two copies of
 * that classification drift, and the day they drift one stage starts reporting a timeout as a
 * contract violation, which sends an operator to the wrong problem.
 *
 * ## The proof this extraction is behaviour-preserving
 *
 * `decomposeBuild` now calls this and ITS OWN TESTS PASS UNEDITED, including the source
 * truncation suite, the workspace flow suite and the shape-retry cases. That is the evidence,
 * not the reading of the diff. The one thing deliberately NOT moved here is the source-overflow
 * reporting: it is about the PROMPT, not about the call, and it belongs with the thing that
 * built the prompt.
 */
import OpenAI from 'openai';

/** Bounded per CLAUDE.md: no unbounded external call. These completions are large. */
export const REQUEST_TIMEOUT_MS = 240_000;
export const SDK_RETRIES = 1;
/** Schema-invalid output is retried once, then the call fails. No unbounded loop. */
export const MAX_SHAPE_ATTEMPTS = 2;

export type ModelCallErrorClass =
  | 'ConfigError'
  | 'UpstreamTimeout'
  | 'UpstreamError'
  | 'EmptyResponse'
  | 'ContractViolation';

export class ModelCallError extends Error {
  constructor(public readonly errorClass: ModelCallErrorClass, message: string) {
    super(message);
    this.name = 'ModelCallError';
  }
}

export type ChatClient = Pick<OpenAI['chat']['completions'], 'create'>;

export function defaultClient(): ChatClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ModelCallError('ConfigError', 'OPENAI_API_KEY is not set');
  return new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: SDK_RETRIES }).chat.completions;
}

export interface ModelJsonCallOptions<T> {
  /** The structured-output schema name, which also names the failure in logs. */
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
  /**
   * The LOCAL shape check, run on the parsed response.
   *
   * Deliberately a caller-supplied predicate rather than a generic "is an object": each stage
   * knows what an unusable answer looks like for it, and an empty requirements array is a
   * different failure from an empty stories array.
   */
  isShaped: (v: unknown) => v is T;
  /** What to tell the model its previous answer failed, when `isShaped` rejects it. */
  shapeProblem: string;
  model: string;
  client: ChatClient;
  /** Emitted on every outcome, so a stage can keep its own event names. */
  log: (event: string, outcome: 'success' | 'failure', ctx: Record<string, unknown>) => void;
  /** Event name prefix, e.g. `sbp_decompose` gives `sbp_decompose_completed`. */
  eventPrefix: string;
  /** Added to the success log, so a stage can report what it actually produced. */
  describe?: (value: T) => Record<string, unknown>;
}

export interface ModelJsonCallResult<T> {
  value: T;
  /** How many model calls it took. 1 means a clean first pass. */
  attempts: number;
  model: string;
  /**
   * The bounded client this call used. Returned so a follow-on pass reuses the same configured
   * connection, with the same timeout and the same capped retries, rather than constructing a
   * second one with different failure behaviour.
   */
  client: ChatClient;
}

export async function modelJsonCall<T>(opts: ModelJsonCallOptions<T>): Promise<ModelJsonCallResult<T>> {
  const { model, client } = opts;
  const started = Date.now();
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_SHAPE_ATTEMPTS; attempt++) {
    let completion: any;
    try {
      completion = await client.create({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          {
            role: 'user',
            content: attempt === 1
              ? opts.userPrompt
              : `${opts.userPrompt}\n\nYour previous response was rejected: ${lastProblem}. Return valid JSON matching the schema exactly.`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
        },
      });
    } catch (err: any) {
      // Distinguish a timeout from any other upstream failure so the caller can tell
      // "retry later" from "this is broken".
      const isTimeout = err?.name === 'APIConnectionTimeoutError'
        || /timeout|aborted|ETIMEDOUT/i.test(String(err?.message ?? ''));
      const errorClass: ModelCallErrorClass = isTimeout ? 'UpstreamTimeout' : 'UpstreamError';
      opts.log(`${opts.eventPrefix}_failed`, 'failure', {
        error_class: errorClass, attempt, model, duration_ms: Date.now() - started, message: err?.message,
      });
      throw new ModelCallError(errorClass, `model call failed (${errorClass}): ${err?.message}`);
    }

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      lastProblem = 'the response contained no content';
      if (attempt < MAX_SHAPE_ATTEMPTS) continue;
      opts.log(`${opts.eventPrefix}_failed`, 'failure', {
        error_class: 'EmptyResponse', attempt, model, duration_ms: Date.now() - started,
      });
      throw new ModelCallError('EmptyResponse', 'model returned no content after retry');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err: any) {
      lastProblem = `the response was not valid JSON (${err?.message})`;
      if (attempt < MAX_SHAPE_ATTEMPTS) continue;
      opts.log(`${opts.eventPrefix}_failed`, 'failure', {
        error_class: 'ContractViolation', attempt, model, reason: 'unparseable JSON',
      });
      throw new ModelCallError('ContractViolation', 'model returned unparseable JSON after retry');
    }

    if (!opts.isShaped(parsed)) {
      lastProblem = opts.shapeProblem;
      if (attempt < MAX_SHAPE_ATTEMPTS) continue;
      opts.log(`${opts.eventPrefix}_failed`, 'failure', {
        error_class: 'ContractViolation', attempt, model, reason: 'shape mismatch',
      });
      throw new ModelCallError('ContractViolation', `model output did not match ${opts.schemaName} after retry`);
    }

    opts.log(`${opts.eventPrefix}_completed`, 'success', {
      attempts: attempt,
      model,
      duration_ms: Date.now() - started,
      ...(opts.describe ? opts.describe(parsed) : {}),
    });
    return { value: parsed, attempts: attempt, model, client };
  }

  /* istanbul ignore next -- the loop always returns or throws; this satisfies the compiler. */
  throw new ModelCallError('ContractViolation', 'model call exhausted its attempts');
}
