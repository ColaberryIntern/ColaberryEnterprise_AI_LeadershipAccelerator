/**
 * kitConfigAi.ts — AI-assisted content generation for the Class Kit Customize
 * config. Today: one survey question, grounded in the session's real week
 * content. A later phase reuses `groundedJsonCall` for rewriting Lessons/
 * Story Beats/prompts from a one-line instruction.
 *
 * Modeled on the Composer's jsonCall/fillCard pattern (composer/composerAi.ts)
 * but fixes the one real gap in that pattern: an explicit timeout + bounded
 * retry, ported from llmCallWrapper.ts's getTimeout()/AbortController shape.
 * That wrapper itself doesn't fit here as-is — it's scoped to a lessonId + a
 * DB audit log built for the participant content pipeline, which has no
 * analog for an admin-triggered session-config button — so the timeout/retry
 * shape is reproduced locally rather than importing it wholesale.
 *
 * Every path has a deterministic scaffold fallback (same principle as
 * composerAi.ts's own header comment) so the button always returns
 * something — with or without an API key — and is unit-testable without a
 * real network call.
 */
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { env } from '../../config/env';
import { InteractionPlacement } from './kitConfig';

const BASE_TIMEOUT_MS = 15_000;
const TIMEOUT_PER_1K_TOKENS = 5_000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

function getTimeout(maxTokens: number): number {
  return BASE_TIMEOUT_MS + Math.ceil(maxTokens / 1000) * TIMEOUT_PER_1K_TOKENS;
}

/** A grounded JSON-mode call with an explicit timeout and bounded exponential-
 * backoff retry — the one addition every AI-generate action in this module
 * shares over the Composer's own `jsonCall`. */
export async function groundedJsonCall(workflow: string, system: string, user: string, maxTokens: number): Promise<any> {
  const client = getInstrumentedOpenAI({ workflow_id: workflow });
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getTimeout(maxTokens));
    try {
      const res = await client.chat.completions.create({
        model: env.aiModel, temperature: 0.6, max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }, { signal: controller.signal });
      clearTimeout(timer);
      try {
        return JSON.parse(res.choices?.[0]?.message?.content || '{}');
      } catch {
        return {};
      }
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI generation failed');
}

function scaffoldQuestion(segment: string, weekTitle: string): InteractionPlacement {
  return {
    segment, kind: 'trivia', eyebrow: '🧠 Quick check', title: 'Quick check',
    q: `What was the key idea in this week's "${weekTitle}" content?`,
    options: ['Not sure yet', 'I can explain it', 'I need a recap', 'Ask me later'],
    answer: 1,
    reveal: 'Edit this question — it is a placeholder scaffold, not AI-generated (no OpenAI key configured, or the request failed).',
  };
}

export interface GenerateQuestionInput {
  segment: string;
  weekTitle: string;
  /** Real week content to ground the question in — blueprint purpose/
   * objectives + the resolved Lessons content, joined by the caller. */
  contentSummary: string;
  /** Optional instructor steer, e.g. "focus on the failure-recovery part". */
  instruction?: string;
}
export interface GenerateQuestionResult { question: InteractionPlacement; source: 'ai' | 'scaffold' }

export async function generateQuestion(input: GenerateQuestionInput): Promise<GenerateQuestionResult> {
  const scaffold = scaffoldQuestion(input.segment, input.weekTitle);
  if (!env.openaiApiKey) return { question: scaffold, source: 'scaffold' };

  const system =
    'You write one multiple-choice trivia or opinion-poll question for a live coding-bootcamp class, grounded in ' +
    'the specific week content given — not generic. Return STRICT json: { "kind": "trivia"|"poll", ' +
    '"eyebrow": string (short label, one emoji), "title": string (a few words), "q": string, ' +
    '"options": string[] (3-5 short options), "answer": integer index of the correct option (trivia only, omit for poll), ' +
    '"reveal": string (one sentence explaining the answer or provoking discussion) }.';
  const user =
    `Week: "${input.weekTitle}"\nContent taught this week:\n${input.contentSummary.slice(0, 3000)}\n` +
    (input.instruction ? `Instructor instruction: "${input.instruction}"\n` : '') +
    'Write one question grounded in this content.';

  try {
    const parsed = await groundedJsonCall('classkit_generate_question', system, user, 400);
    const kind = parsed.kind === 'poll' ? 'poll' : 'trivia';
    const options = Array.isArray(parsed.options)
      ? parsed.options.filter((o: unknown): o is string => typeof o === 'string').slice(0, 6)
      : [];
    if (typeof parsed.q !== 'string' || !parsed.q.trim() || options.length < 2) {
      return { question: scaffold, source: 'scaffold' };
    }
    const question: InteractionPlacement = {
      segment: input.segment,
      kind,
      eyebrow: typeof parsed.eyebrow === 'string' && parsed.eyebrow.trim() ? parsed.eyebrow : '🗳️ Survey',
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : 'Quick check',
      q: parsed.q,
      options,
      answer: kind === 'trivia' && Number.isInteger(parsed.answer) ? parsed.answer : undefined,
      reveal: typeof parsed.reveal === 'string' ? parsed.reveal : undefined,
    };
    return { question, source: 'ai' };
  } catch {
    return { question: scaffold, source: 'scaffold' };
  }
}
