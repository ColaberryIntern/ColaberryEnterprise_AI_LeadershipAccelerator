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
  /**
   * 2-4 concrete answers in the student's own domain, shown as chips they can
   * tap to fill the box and then edit. This is what makes the interview
   * answerable for someone new to AI, and it is where they discover a
   * capability they did not know to ask for. Optional on the type so a plan
   * generated before suggestions existed still parses.
   */
  suggestions?: string[];
  /**
   * How the student answers. 'multi' (tick everything that applies) is what the
   * tools question uses — one tick-through gets the whole list, where three
   * questions about integrations got two vague answers and a skip. Optional so
   * a response cached before choices existed still parses as free text.
   */
  kind?: 'text' | 'single' | 'multi';
}

/** One angle the description already answered, and the phrase that answered it. */
export interface CoveredAngle {
  angle: string;
  evidence: string;
}

export interface IntakeQuestionsResult {
  questions: IntakeQuestion[];
  /**
   * What was NOT asked, and why. Empty on the degraded path, because the
   * fallback set knows nothing about the student's description.
   *
   * This is the receipt for a short interview: a student who wrote three
   * paragraphs and got two questions can be shown the other eight, quoted.
   */
  covered: CoveredAngle[];
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

/**
 * Upper bounds on what we GENERATE, matching what `startSchema` will accept
 * back. The wizard echoes each question's `id` and `question` verbatim in the
 * build request, so a model that wrote a 600-character question would 400 the
 * student's build on text they never wrote and cannot edit. Only a lower bound
 * existed here, which left the round trip unbounded in the one direction that
 * breaks it.
 */
const QUESTION_ID_MAX = 80;
const QUESTION_TEXT_MAX = 500;

/** Well-formed covered entries only. A claim with no quote is not evidence. */
function coveredAngles(raw: unknown): CoveredAngle[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is CoveredAngle => {
    const v = c as CoveredAngle | null;
    return !!v && typeof v.angle === 'string' && v.angle.trim().length > 0
      && typeof v.evidence === 'string' && v.evidence.trim().length > 0;
  });
}

function isQuestionShaped(v: unknown): v is IntakeQuestion {
  const q = v as IntakeQuestion | null;
  return !!q
    && typeof q.id === 'string' && q.id.length > 0 && q.id.length <= QUESTION_ID_MAX
    && typeof q.question === 'string' && q.question.trim().length > 8
    && q.question.length <= QUESTION_TEXT_MAX
    && typeof q.why === 'string'
    && typeof q.placeholder === 'string'
    // Suggestions are optional on the wire (an older cached response has none)
    // but must be strings when present — the UI renders them as buttons.
    && (q.suggestions === undefined
      || (Array.isArray(q.suggestions) && q.suggestions.every((x: unknown) => typeof x === 'string')))
    && (q.kind === undefined || ['text', 'single', 'multi'].includes(q.kind));
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
    // `covered` is empty on this path, and that is the honest answer: the
    // fallback set was written without ever seeing this student's description,
    // so it cannot claim any angle was already answered.
    return { questions: fallbackQuestions(size), covered: [], generated: false, model: null, attempts };
  };

  if (!client) return degrade('ConfigError', 'OPENAI_API_KEY is not configured', 0);

  const userPrompt = buildIntakeQuestionsPrompt({ idea: opts.idea, size, name: opts.name });
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_SHAPE_ATTEMPTS; attempt += 1) {
    // No {{MIN}} substitution any more: there is no minimum. See QUESTION_TARGETS.
    const system = INTAKE_SYSTEM_PROMPT
      .replace(/\{\{MAX\}\}/g, String(QUESTION_TARGETS[size].max));
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

      const returned: unknown[] = Array.isArray(parsed?.questions) ? parsed.questions : [];
      const questions: IntakeQuestion[] = returned.filter(isQuestionShaped);
      const covered = coveredAngles(parsed?.covered);

      /*
       * THE OLD RULE HERE WAS `questions.length < 3` AND IT WAS A REAL DEFECT.
       *
       * It could not tell "the model returned junk" apart from "the student's
       * description already answered almost everything". So the better a
       * student wrote, the more likely their response was rejected, retried,
       * and finally degraded to the GENERIC fallback set — the exact outcome
       * this adaptive path exists to prevent, arriving only for the students
       * who put in the most effort.
       *
       * The two cases are now separated on evidence:
       *   malformed  some returned entries failed the shape check  -> retry
       *   short      well-formed, and the model quoted what covers -> accept
       */
      const malformed = returned.length - questions.length;
      if (malformed > 0) {
        lastProblem = `${malformed} of ${returned.length} questions were malformed`;
        continue;
      }
      /*
       * A SHORT INTERVIEW HAS TO BE JUSTIFIED.
       *
       * Asking fewer than the tier maximum means angles were skipped, and the
       * only acceptable reason is that the description already answered them.
       * So a short set must quote at least one. Without this the change that
       * removed the floors would also let a degrading model quietly ask one
       * question and skip nine, which looks identical to the feature working.
       *
       * The existing suite already pinned this from the other direction: "never
       * returns fewer than 3 questions, on any path" passes a single question
       * and no evidence, and still degrades to the fallback set.
       */
      if (questions.length < QUESTION_TARGETS[size].max && covered.length === 0) {
        lastProblem = `${questions.length} questions but no covered angles quoted`;
        continue;
      }
      // Grounding checks questions that EXIST. A legitimately empty set has
      // nothing to be generic about, and running the check on it would reject
      // exactly the case this change was made to allow.
      if (questions.length > 0 && !isGroundedInIdea(questions, opts.idea)) {
        lastProblem = 'questions were generic — none referenced the student\'s own idea';
        continue;
      }

      const capped = questions.slice(0, QUESTION_TARGETS[size].max);
      log('intake_questions', opts.correlationId, 'success', {
        attempt, model, count: capped.length, covered_count: covered.length, size,
        duration_ms: Date.now() - started,
      });
      return { questions: capped, covered, generated: true, model, attempts: attempt };
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
