import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuestionAnswer {
  question: string;
  answer: string;
}

export interface ClarifyingQuestionsResult {
  enrollmentId: string;
  questions: string[];
  error: string | null;
}

export interface RequirementsDocResult {
  enrollmentId: string;
  title: string;
  problem_statement: string;
  target_users: string;
  value_proposition: string;
  technical_requirements: string[];
  non_functional_requirements: string[];
  mvp_scope: string;
  success_metrics: string[];
  raw_markdown: string;
  error: string | null;
}

// ─── Client ───────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

function buildClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: env.anthropicApiKey,
      timeout: 30000,
      maxRetries: 1,
    });
  }
  return _client;
}

// Clears the cached client so tests can inject a fresh mock each run.
export function _resetClientForTesting(): void {
  _client = null;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  ctx: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'advisorBrainService',
      event,
      ...ctx,
    }),
  );
}

// ─── Error classification ─────────────────────────────────────────────────────

function classifyError(err: unknown): string {
  const msg = (err as Error)?.message || '';
  const status = (err as any)?.status;
  if (status === 401 || status === 403) return 'AuthError';
  if (status === 429) return 'RateLimitError';
  if (status && status >= 500) return 'UpstreamUnavailable';
  if (/timeout|timed out/i.test(msg)) return 'TimeoutError';
  return 'ClaudeApiError';
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const QUESTIONS_SYSTEM = `You are a senior software product strategist helping a student \
refine their project idea. Your job is to ask exactly 10 targeted clarifying questions \
that will uncover enough detail to write a professional requirements document.

Cover these dimensions across your 10 questions:
1. Core problem being solved
2. Primary target user (who, role, context)
3. Key pain point the user experiences today
4. Must-have features for MVP (the minimum to be useful)
5. AI/ML capabilities needed (if any)
6. Deployment / platform (web app, mobile, API, desktop)
7. Integrations with external systems (databases, APIs, third-party tools)
8. Non-functional requirements (performance, security, scale)
9. Success metric — how does the user know it's working in 3 months?
10. Biggest technical or business risk

Return ONLY valid JSON with this structure:
{"questions": ["Question 1?", "Question 2?", ..., "Question 10?"]}

Rules:
- Questions must be specific to the idea, not generic
- Each question should be answerable in 1-3 sentences
- Return ONLY the JSON object, no markdown or explanation`;

const REQUIREMENTS_SYSTEM = `You are a senior software architect who writes clear, \
actionable requirements documents for AI-powered student projects.

Given a project idea and a set of clarifying Q&A, produce a structured requirements \
document. Be concrete and specific — avoid vague language.

Return ONLY valid JSON with this structure:
{
  "title": "Project title (short, descriptive)",
  "problem_statement": "1-2 sentence problem statement",
  "target_users": "Who uses this and in what context",
  "value_proposition": "The core value delivered",
  "technical_requirements": ["Req 1", "Req 2", ...],
  "non_functional_requirements": ["NFR 1", "NFR 2", ...],
  "mvp_scope": "What the MVP includes and excludes",
  "success_metrics": ["Metric 1", "Metric 2", ...],
  "raw_markdown": "Full requirements doc as formatted markdown"
}

Rules:
- technical_requirements: 5-10 specific, implementable requirements
- non_functional_requirements: 3-6 items (performance, security, scalability, etc.)
- success_metrics: 3-5 measurable outcomes
- raw_markdown: write a complete, professional requirements document using the fields above
- Return ONLY the JSON object, no explanation`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonFromResponse(raw: string): unknown {
  // Strip markdown code fences if Claude wraps in ```json
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

function safeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates ~10 clarifying questions from a raw project idea.
 * One Claude call. Idempotent — same idea produces same question structure.
 * Returns AuthError result (never throws) when ANTHROPIC_API_KEY is absent.
 */
export async function generateClarifyingQuestions(
  idea: string,
  enrollmentId: string,
): Promise<ClarifyingQuestionsResult> {
  if (!env.anthropicApiKey) {
    const error = 'ANTHROPIC_API_KEY not set — add it to the backend .env file';
    log('warn', 'advisor_questions_skipped', { outcome: 'failure', error_class: 'AuthError', enrollmentId });
    return { enrollmentId, questions: [], error };
  }

  const trimmedIdea = (idea || '').trim();
  if (!trimmedIdea) {
    return { enrollmentId, questions: [], error: 'idea must not be empty' };
  }

  const client = buildClient();
  const start = Date.now();

  try {
    const message = await client.messages.create({
      model: env.advisorClaudeModel,
      max_tokens: 1024,
      system: QUESTIONS_SYSTEM,
      messages: [{ role: 'user', content: `Project idea: "${trimmedIdea}"` }],
    });

    const raw = (message.content[0] as Anthropic.TextBlock).text;
    const parsed = parseJsonFromResponse(raw) as { questions?: unknown };
    const questions = safeStringArray(parsed?.questions);

    if (questions.length === 0) {
      throw new Error('Claude returned an empty questions array');
    }

    log('info', 'advisor_questions_generated', {
      outcome: 'success',
      enrollmentId,
      question_count: questions.length,
      duration_ms: Date.now() - start,
    });

    return { enrollmentId, questions, error: null };
  } catch (err) {
    const error_class = classifyError(err);
    log('error', 'advisor_questions_failed', {
      outcome: 'failure',
      error_class,
      enrollmentId,
      duration_ms: Date.now() - start,
      message: (err as Error).message,
    });
    return { enrollmentId, questions: [], error: error_class };
  }
}

/**
 * Generates a structured requirements document from an idea + Q&A answers.
 * One Claude call. Returns AuthError result (never throws) when key is absent.
 */
export async function generateRequirementsDoc(
  idea: string,
  answers: QuestionAnswer[],
  enrollmentId: string,
): Promise<RequirementsDocResult> {
  const empty: Omit<RequirementsDocResult, 'error'> = {
    enrollmentId,
    title: '',
    problem_statement: '',
    target_users: '',
    value_proposition: '',
    technical_requirements: [],
    non_functional_requirements: [],
    mvp_scope: '',
    success_metrics: [],
    raw_markdown: '',
  };

  if (!env.anthropicApiKey) {
    const error = 'ANTHROPIC_API_KEY not set — add it to the backend .env file';
    log('warn', 'advisor_requirements_skipped', { outcome: 'failure', error_class: 'AuthError', enrollmentId });
    return { ...empty, error };
  }

  const trimmedIdea = (idea || '').trim();
  if (!trimmedIdea) {
    return { ...empty, error: 'idea must not be empty' };
  }

  const qaContext = (answers || [])
    .filter((a) => a.question?.trim() && a.answer?.trim())
    .map((a, i) => `Q${i + 1}: ${a.question.trim()}\nA${i + 1}: ${a.answer.trim()}`)
    .join('\n\n');

  const userContent = `Project idea: "${trimmedIdea}"\n\n${qaContext ? `Clarifying Q&A:\n${qaContext}` : '(No clarifying answers provided — infer reasonable defaults.)'}`;

  const client = buildClient();
  const start = Date.now();

  try {
    const message = await client.messages.create({
      model: env.advisorClaudeModel,
      max_tokens: 4096,
      system: REQUIREMENTS_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = (message.content[0] as Anthropic.TextBlock).text;
    const parsed = parseJsonFromResponse(raw) as Record<string, unknown>;

    const result: RequirementsDocResult = {
      enrollmentId,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      problem_statement: typeof parsed.problem_statement === 'string' ? parsed.problem_statement : '',
      target_users: typeof parsed.target_users === 'string' ? parsed.target_users : '',
      value_proposition: typeof parsed.value_proposition === 'string' ? parsed.value_proposition : '',
      technical_requirements: safeStringArray(parsed.technical_requirements),
      non_functional_requirements: safeStringArray(parsed.non_functional_requirements),
      mvp_scope: typeof parsed.mvp_scope === 'string' ? parsed.mvp_scope : '',
      success_metrics: safeStringArray(parsed.success_metrics),
      raw_markdown: typeof parsed.raw_markdown === 'string' ? parsed.raw_markdown : '',
      error: null,
    };

    log('info', 'advisor_requirements_generated', {
      outcome: 'success',
      enrollmentId,
      title: result.title,
      req_count: result.technical_requirements.length,
      duration_ms: Date.now() - start,
    });

    return result;
  } catch (err) {
    const error_class = classifyError(err);
    log('error', 'advisor_requirements_failed', {
      outcome: 'failure',
      error_class,
      enrollmentId,
      duration_ms: Date.now() - start,
      message: (err as Error).message,
    });
    return { ...empty, error: error_class };
  }
}
