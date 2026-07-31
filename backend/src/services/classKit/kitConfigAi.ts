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
import { InteractionPlacement, StoryBeatOverride } from './kitConfig';
import { TeachSlide } from '../../data/classTeachContent';
import { ClassPrompt } from '../../data/classSessionPlan';

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
    theater: false,
    presenterTip: '',
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
    // Every field is set explicitly (never `undefined`) — an `undefined` value
    // is dropped by JSON serialization entirely, which silently produced an
    // incomplete object on the frontend (caught in Phase 1 review: a missing
    // `theater`/`presenterTip`/`reveal` key, not just a falsy one).
    const question: InteractionPlacement = {
      segment: input.segment,
      kind,
      eyebrow: typeof parsed.eyebrow === 'string' && parsed.eyebrow.trim() ? parsed.eyebrow : '🗳️ Survey',
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : 'Quick check',
      q: parsed.q,
      options,
      answer: kind === 'trivia' && Number.isInteger(parsed.answer) ? parsed.answer : undefined,
      reveal: typeof parsed.reveal === 'string' ? parsed.reveal : '',
      theater: false,
      presenterTip: '',
    };
    return { question, source: 'ai' };
  } catch {
    return { question: scaffold, source: 'scaffold' };
  }
}

// ── List rewrite (Phase 3): "write my own" for Lessons/Story Beats/Claude
// Code Examples means "type an instruction, get a draft, then edit it" —
// this is the shared engine behind that for all three categories. ─────────

export interface RewriteListInput<T> {
  weekTitle: string;
  contentSummary: string;
  currentItems: T[];
  instruction: string;
}
export interface RewriteListResult<T> { items: T[]; source: 'ai' | 'scaffold' }

/** Grounded rewrite of an existing list, given a one-line instruction. Falls
 * back to the CURRENT list unchanged (not a blank scaffold — there is
 * nothing sensible to invent generically for an arbitrary T) with or
 * without an OpenAI key, or if the response can't be parsed into at least
 * one valid item. `workflow` feeds `groundedJsonCall`'s tracing; `system`
 * is the category-specific shape instructions; `normalize` validates/coerces
 * one raw parsed item or returns null to drop it. */
async function rewriteList<T>(
  workflow: string, system: string, normalize: (raw: unknown) => T | null,
  input: RewriteListInput<T>,
): Promise<RewriteListResult<T>> {
  if (!env.openaiApiKey) return { items: input.currentItems, source: 'scaffold' };
  const user =
    `Week: "${input.weekTitle}"\nContent taught this week:\n${input.contentSummary.slice(0, 3000)}\n` +
    `Current list:\n${JSON.stringify(input.currentItems).slice(0, 3000)}\n` +
    `Instructor instruction: "${input.instruction}"\n` +
    'Rewrite the list per the instruction — keep the same number of items unless the instruction asks to add or remove some.';
  try {
    const parsed = await groundedJsonCall(workflow, system, user, 1400);
    const raw = Array.isArray(parsed.items) ? parsed.items : [];
    const items = raw.map(normalize).filter((x: T | null): x is T => x != null);
    if (!items.length) return { items: input.currentItems, source: 'scaffold' };
    return { items, source: 'ai' };
  } catch {
    return { items: input.currentItems, source: 'scaffold' };
  }
}

function normalizeTeachItem(raw: unknown): TeachSlide | null {
  const r = raw as Record<string, unknown>;
  if (!r || typeof r.title !== 'string' || !r.title.trim()) return null;
  const item: TeachSlide = {
    segment: typeof r.segment === 'string' && r.segment.trim() ? r.segment : 'guided-build',
    eyebrow: typeof r.eyebrow === 'string' ? r.eyebrow : '',
    title: r.title,
  };
  if (typeof r.body === 'string') item.body = r.body;
  if (Array.isArray(r.bullets)) item.bullets = r.bullets.filter((b: unknown): b is string => typeof b === 'string');
  if (typeof r.script === 'string') item.script = r.script;
  const rc = r.code as Record<string, unknown> | undefined;
  if (rc && typeof rc.code === 'string') item.code = { label: typeof rc.label === 'string' ? rc.label : '', code: rc.code };
  return item;
}

export async function rewriteTeach(input: RewriteListInput<TeachSlide>): Promise<RewriteListResult<TeachSlide>> {
  const system =
    'You rewrite a list of deep-teaching "Lesson" slides for a live coding-bootcamp class, grounded in the week ' +
    'content given, per the instructor\'s instruction. Return STRICT json: { "items": [ { "segment": string, ' +
    '"eyebrow": string (emoji + short label), "title": string, "body": string, "bullets": string[] (optional), ' +
    '"code": {"label": string, "code": string} (optional, a copy-ready Claude Code prompt/snippet), ' +
    '"script": string (optional, what the instructor says) } ] }.';
  return rewriteList('classkit_rewrite_teach', system, normalizeTeachItem, input);
}

function normalizeStoryBeat(raw: unknown): StoryBeatOverride | null {
  const r = raw as Record<string, unknown>;
  if (!r || typeof r.title !== 'string' || !r.title.trim() || typeof r.body !== 'string') return null;
  return {
    segment: typeof r.segment === 'string' && r.segment.trim() ? r.segment : 'business-problem',
    icon: typeof r.icon === 'string' && r.icon.trim() ? r.icon : '💡',
    eyebrow: typeof r.eyebrow === 'string' ? r.eyebrow : 'Change of pace',
    title: r.title,
    body: r.body,
    punch: typeof r.punch === 'string' ? r.punch : undefined,
    tone: (['cherry', 'berry', 'amber', 'leaf', 'violet'] as const).some((t) => t === r.tone) ? (r.tone as StoryBeatOverride['tone']) : 'berry',
  };
}

export async function rewriteStoryBeats(input: RewriteListInput<StoryBeatOverride>): Promise<RewriteListResult<StoryBeatOverride>> {
  const system =
    'You rewrite a list of "change of pace" story-beat slides (a metaphor or real-world story that illustrates a ' +
    'concept) for a live coding-bootcamp class, grounded in the week content given, per the instructor\'s ' +
    'instruction. Return STRICT json: { "items": [ { "segment": string, "icon": string (one large emoji), ' +
    '"eyebrow": string, "title": string, "body": string (2-4 sentences, the story itself), ' +
    '"punch": string (optional closing one-liner), "tone": "cherry"|"berry"|"amber"|"leaf"|"violet" } ] }.';
  return rewriteList('classkit_rewrite_storybeats', system, normalizeStoryBeat, input);
}

function normalizePrompt(raw: unknown): ClassPrompt | null {
  const r = raw as Record<string, unknown>;
  if (!r || typeof r.label !== 'string' || !r.label.trim() || typeof r.prompt !== 'string' || !r.prompt.trim()) return null;
  const item: ClassPrompt = { label: r.label, prompt: r.prompt };
  if (typeof r.pasteWhere === 'string') item.pasteWhere = r.pasteWhere;
  if (typeof r.ccMode === 'string') item.ccMode = r.ccMode;
  if (typeof r.expectedResult === 'string') item.expectedResult = r.expectedResult;
  if (typeof r.stopCondition === 'string') item.stopCondition = r.stopCondition;
  if (typeof r.rescue === 'string') item.rescue = r.rescue;
  return item;
}

export async function rewritePrompts(input: RewriteListInput<ClassPrompt>): Promise<RewriteListResult<ClassPrompt>> {
  const system =
    'You rewrite a list of copy-ready Claude Code prompts driven live in a coding-bootcamp\'s "Build Bay", grounded ' +
    'in the week content given, per the instructor\'s instruction. Return STRICT json: { "items": [ { "label": ' +
    'string, "prompt": string (the exact text to paste into Claude Code), "pasteWhere": string (optional), ' +
    '"ccMode": "Manual"|"Plan Mode"|"Auto" (optional), "expectedResult": string (optional, "you should see"), ' +
    '"stopCondition": string (optional, "stop when"), "rescue": string (optional, "if stuck") } ] }.';
  return rewriteList('classkit_rewrite_prompts', system, normalizePrompt, input);
}
