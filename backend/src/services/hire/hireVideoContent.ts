/**
 * hireVideoContent - what the candidate SAID, judged against what an interviewer listens for.
 *
 * colaberry/video-analysis judged delivery only. An employer watching an intro also judges the
 * content: did they say who they are and what role they want, show one real problem with a real
 * result, and leave a clear next step. Those are the studio's three prompts (hireVideoModel.ts),
 * so the review checks each, plus specificity and confident wording.
 *
 * GROUNDED, NOT INVENTED. The model must quote the transcript for every point it makes; a quote
 * that is not actually in the transcript is dropped here, and a point left without evidence is
 * shown without a quote rather than with a made-up one. Levels, not fake-precise scores.
 *
 * FAILURE. One call, explicit timeout, the SDK's capped retries. If it fails or returns something
 * malformed, the review is null and the delivery coaching still ships without it.
 */
import { z } from 'zod';
import { getInstrumentedOpenAI } from '../openaiInstrumented';

export const CRITERIA = [
  // Research (Naim et al. 2015): candidates rated well on the first answer were rated well overall.
  { key: 'opening', label: 'Your first 15 seconds', ask: 'Do the first one or two sentences (marked [0-15s]) make a strong first impression: a clear, confident start rather than filler or apology?' },
  { key: 'intro', label: 'Who you are and the role you want', ask: 'Did they say who they are and the specific role they want next?' },
  { key: 'proof', label: 'One problem, and what changed', ask: 'Did they describe one concrete problem they solved and the result (ideally a number or a visible change)?' },
  { key: 'next', label: 'Your first 30 days', ask: 'Did they say what they would do in their first 30 days on a new team?' },
  { key: 'specific', label: 'Specific, not generic', ask: 'Did they name real tools, systems, users or outcomes rather than buzzwords?' },
  { key: 'confident', label: 'Confident wording', ask: 'Did they state their work plainly ("I built") rather than hedge or understate it ("I kind of helped with")?' },
] as const;

export type Level = 'strong' | 'ok' | 'work_on';
export interface ContentPoint { readonly key: string; readonly label: string; readonly level: Level; readonly note: string; readonly quote: string | null }
export interface ContentReview { readonly points: readonly ContentPoint[]; readonly topTip: string }

const replySchema = z.object({
  points: z.array(z.object({
    key: z.string(),
    level: z.enum(['strong', 'ok', 'work_on']),
    note: z.string().min(1).max(240),
    quote: z.string().max(200).nullable().optional(),
  })),
  topTip: z.string().min(1).max(240),
});

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Keeps only the criteria we asked about, in our order, and only quotes really in the transcript. */
export function readReview(raw: unknown, transcript: string): ContentReview | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { return null; } }
  const parsed = replySchema.safeParse(obj);
  if (!parsed.success) return null;
  const said = squash(transcript);
  const points: ContentPoint[] = [];
  for (const c of CRITERIA) {
    const p = parsed.data.points.find((x) => x.key === c.key);
    if (!p) continue;
    const q = p.quote ? p.quote.trim() : '';
    points.push({ key: c.key, label: c.label, level: p.level, note: p.note.trim(), quote: q && said.includes(squash(q)) ? q : null });
  }
  return points.length ? { points, topTip: parsed.data.topTip.trim() } : null;
}

export const SYSTEM = [
  'You coach early-career AI engineers on a 30 to 180 second intro video that hiring managers watch on their profile.',
  'Judge only what is in the transcript. Be direct, warm and specific; write to the candidate as "you".',
  'Never comment on accent, grammar of a non-native speaker, appearance, age, gender or anything protected.',
  'For each criterion give level strong | ok | work_on, a note of at most 2 short sentences saying what to keep or change,',
  'and a quote copied EXACTLY from the transcript that shows it (null if nothing in the transcript applies).',
  'topTip: the single change that would most improve how an interviewer sees them.',
  'Reply as JSON: {"points":[{"key","level","note","quote"}],"topTip"}.',
].join(' ');

export const userPrompt = (transcript: string, seconds: number, opening = ''): string =>
  `Video length: ${Math.round(seconds)} seconds.\nCriteria:\n${CRITERIA.map((c) => `- ${c.key}: ${c.ask}`).join('\n')}\n\n`
  + (opening ? `[0-15s]: """${opening.slice(0, 600)}"""\n\n` : '')
  + `Transcript:\n"""${transcript.slice(0, 6000)}"""`;

export type ReviewCall = (system: string, user: string) => Promise<string | null>;

export function openAiReview(apiKey = process.env.OPENAI_API_KEY): ReviewCall {
  return async (system, user) => {
    if (!apiKey) return null;
    // Instrumented: PII redaction plus an ai_events row with cost, like every other chat call.
    const client = getInstrumentedOpenAI({ workflow_id: 'hire-video-coaching', prompt_version: 'hire-video-review-v1' }, { apiKey, timeout: 60_000, maxRetries: 2 });
    const r = await client.chat.completions.create({
      model: process.env.HIRE_REVIEW_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    return r.choices[0]?.message?.content ?? null;
  };
}

/** Null when there is too little said to judge, or when the call fails: never blocks the rest. */
export async function reviewContent(transcript: string, seconds: number, call: ReviewCall = openAiReview(), opening = ''): Promise<ContentReview | null> {
  if (transcript.split(/\s+/).filter(Boolean).length < 15) return null;
  try {
    return readReview(await call(SYSTEM, userPrompt(transcript, seconds, opening)), transcript);
  } catch (err) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'hire_video_review_failed',
      outcome: 'failure', error_class: (err as { status?: number })?.status === 429 ? 'RateLimitError' : 'UpstreamUnavailable',
    }));
    return null;
  }
}
