/**
 * intakeQuestionsService — the I/O shell for the intake interview.
 *
 * Prompt content lives in ./intakeQuestionsPrompt (pure); this file owns the
 * model call and its failure behaviour, matching decomposeService.ts.
 *
 * Failure-first (CLAUDE.md): bounded timeout, capped retries, one reshape
 * attempt, and — unlike decomposition — it NEVER throws to the caller. A
 * student sitting in the wizard must not be blocked by a model outage, so a
 * failure degrades to the generic question set and says so in the response and
 * the logs. Silent degradation would be worse than the bug this replaces.
 */
import OpenAI from 'openai';
import {
  BuildSize,
  IntakeQuestionsInputs,
  INTAKE_SYSTEM_PROMPT,
  INTAKE_QUESTIONS_JSON_SCHEMA,
  QUESTION_TARGETS,
  buildIntakeQuestionsPrompt,
  fallbackQuestions,
} from './intakeQuestionsPrompt';

/** Bounded. This one is user-facing and interactive, so it is far tighter than decompose. */
const REQUEST_TIMEOUT_MS = 45_000;
const SDK_RETRIES = 1;
const MAX_SHAPE_ATTEMPTS = 2;

export interface IntakeQuestion {
  id: string;
  question: string;
  why: string;
  placeholder: string;
}

export interface IntakeQuestionsResult {
  questions: IntakeQuestion[];
  /** false when the model failed and the generic set was substituted. */
  generated: boolean;
  model: string | null;
  attempts: number;
}

export interface IntakeQuestionsOptions extends IntakeQuestionsInputs {
  model?: string;
  correlationId?: string;
  /** Injected in tests. */
  client?: Pick<OpenAI['chat']['completions'], 'create'>;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-intake-questions',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

let sharedClient: OpenAI | null = null;
function defaultClient(): Pick<OpenAI['chat']['completions'], 'create'> | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!sharedClient) {
    sharedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: SDK_RETRIES,
    });
  }
  return sharedClient.chat.completions;
}

function isQuestionShaped(v: unknown): v is IntakeQuestion {
  const q = v as IntakeQuestion | null;
  return !!q
    && typeof q.id === 'string' && q.id.length > 0
    && typeof q.question === 'string' && q.question.trim().length > 8
    && typeof q.why === 'string'
    && typeof q.placeholder === 'string';
}

/**
 * Reject a response that technically parses but defeats the purpose — a set of
 * questions that never mentions anything from the student's own idea is the
 * generic form again, wearing a model call as a costume.
 */
function isGroundedInIdea(questions: IntakeQuestion[], idea: string): boolean {
  const words = new Set(
    idea.toLowerCase().match(/[a-z][a-z-]{4,}/g)?.filter((w) => !STOPWORDS.has(w)) ?? [],
  );
  if (words.size < 3) return true; // too short an idea to demand grounding
  const text = questions.map((q) => `${q.question} ${q.placeholder}`).join(' ').toLowerCase();
  let hits = 0;
  words.forEach((w) => { if (text.includes(w)) hits += 1; });
  return hits >= 2;
}

const STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'their', 'there', 'these', 'those', 'which', 'while',
  'would', 'could', 'should', 'every', 'other', 'thing', 'things', 'something', 'anything',
  'build', 'building', 'system', 'project', 'create', 'using', 'needs', 'want', 'wants',
  'people', 'where', 'that', 'this', 'with', 'from', 'into', 'have',
]);

/**
 * Generate the interview questions for one idea. Never throws — the wizard is
 * interactive and a model outage must not strand a student on a blank step.
 */
export async function generateIntakeQuestions(opts: IntakeQuestionsOptions): Promise<IntakeQuestionsResult> {
  const size: BuildSize = opts.size || 'project';
  const model = opts.model || process.env.SBP_INTAKE_MODEL || 'gpt-4o';
  const client = opts.client ?? defaultClient();
  const started = Date.now();

  const degrade = (errorClass: string, message: string, attempts: number): IntakeQuestionsResult => {
    log('intake_questions', opts.correlationId, 'failure', {
      error_class: errorClass, message, attempts, model, duration_ms: Date.now() - started,
      degraded_to: 'generic_question_set',
    });
    return { questions: fallbackQuestions(size), generated: false, model: null, attempts };
  };

  if (!client) return degrade('ConfigError', 'OPENAI_API_KEY is not configured', 0);

  const userPrompt = buildIntakeQuestionsPrompt({ idea: opts.idea, size, name: opts.name });
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_SHAPE_ATTEMPTS; attempt += 1) {
    const system = INTAKE_SYSTEM_PROMPT
      .replace('{{MIN}}', String(QUESTION_TARGETS[size].min))
      .replace('{{MAX}}', String(QUESTION_TARGETS[size].max));
    try {
      const res: any = await client.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: attempt === 1 ? userPrompt : `${userPrompt}\n\nYour previous response was rejected: ${lastProblem}. Return only valid JSON matching the schema.` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'intake_questions', strict: true, schema: INTAKE_QUESTIONS_JSON_SCHEMA },
        },
      } as any);

      const content = res?.choices?.[0]?.message?.content;
      if (!content) { lastProblem = 'empty response'; continue; }

      let parsed: any;
      try { parsed = JSON.parse(content); } catch { lastProblem = 'unparseable JSON'; continue; }

      const questions: IntakeQuestion[] = Array.isArray(parsed?.questions)
        ? parsed.questions.filter(isQuestionShaped) : [];
      if (questions.length < 3) { lastProblem = 'fewer than 3 well-formed questions'; continue; }
      if (!isGroundedInIdea(questions, opts.idea)) {
        lastProblem = 'questions were generic — none referenced the student\'s own idea';
        continue;
      }

      const capped = questions.slice(0, QUESTION_TARGETS[size].max);
      log('intake_questions', opts.correlationId, 'success', {
        attempt, model, count: capped.length, size, duration_ms: Date.now() - started,
      });
      return { questions: capped, generated: true, model, attempts: attempt };
    } catch (err: any) {
      lastProblem = err?.message || 'upstream error';
      const isTimeout = /timeout|ETIMEDOUT|aborted/i.test(lastProblem);
      if (attempt >= MAX_SHAPE_ATTEMPTS) {
        return degrade(isTimeout ? 'UpstreamTimeout' : 'UpstreamError', lastProblem, attempt);
      }
    }
  }
  return degrade('ContractViolation', lastProblem || 'no usable questions', MAX_SHAPE_ATTEMPTS);
}
