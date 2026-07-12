/**
 * cardContentService — generate the AI content a student actually sees on a
 * Timeline card, and SAVE it onto the card. This is the bridge that connects the
 * Experience Studio's generation prompt to the real classroom: an author enters
 * the card's unique inputs, generates, and the result is persisted to
 * card.metadata.content — which the student feed then renders. No more throwaway
 * previews. Reuses the runtimePreview generation pattern (componentAiService).
 */
import TimelineCard from '../../models/TimelineCard';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { resolvePrompt } from '../components/promptTesterService';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL, MODEL_PRICING } from '../components/costEstimationService';

export interface CardContent {
  title?: string;
  summary?: string;
  body_html?: string;
  questions?: string[];
  reflection?: string;
}

/** Build the generation variables from the card's own fields + any author-set per-card vars. */
function buildVars(card: TimelineCard): Record<string, string> {
  const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  const authored = meta.vars && typeof meta.vars === 'object' ? meta.vars : {};
  return {
    topic: card.title, title: card.title, subject: card.title,
    week: card.week != null ? String(card.week) : '',
    description: card.description || '',
    content: card.description || card.title,
    ...authored, // author-provided per-card variables win
  };
}

function cost(model: string, res: any): number {
  const p = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const i = res.usage?.prompt_tokens ?? 0, o = res.usage?.completion_tokens ?? 0;
  return Number(((i * p.input_per_1m + o * p.output_per_1m) / 1_000_000).toFixed(6));
}

/**
 * Generate the student-facing content for one card using its type's generation
 * prompt (or a generic instruction if the type has none), and persist it to
 * card.metadata.content. Idempotent — re-running overwrites with a fresh render.
 */
export async function generateCardContent(cardId: string, model = DEFAULT_MODEL): Promise<{ content: CardContent; resolved_prompt: string; cost_usd: number }> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });

  const def = await CurriculumTypeDefinition.findOne({ where: { slug: card.type } });
  const gen = def ? ((def as any).generation_prompt as string | null) : null;
  const vars = buildVars(card);
  const resolved = gen
    ? resolvePrompt(gen, vars)
    : `Write the student-facing content for a "${card.type.replace(/_/g, ' ')}" titled "${card.title}".${card.description ? ` Context: ${card.description}` : ''}`;

  const client = getInstrumentedOpenAI({ workflow_id: 'timeline_card_generate' });
  const res = await client.chat.completions.create({
    model, temperature: 0.6, max_tokens: 1600, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `You render the "${def?.student_label || card.type}" activity into the exact content a student sees on this card. Return STRICT json.` },
      { role: 'user', content: `Produce the student content as json with keys: title, summary, body_html (clean self-contained HTML, no scripts), questions (string[]), reflection (string).\n\nInstruction:\n${resolved}` },
    ],
  });
  let parsed: any = {};
  try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  const content: CardContent = {
    title: typeof parsed.title === 'string' ? parsed.title : undefined,
    summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    body_html: typeof parsed.body_html === 'string' ? parsed.body_html : undefined,
    questions: Array.isArray(parsed.questions) ? parsed.questions.map(String) : undefined,
    reflection: typeof parsed.reflection === 'string' ? parsed.reflection : undefined,
  };

  // Persist onto the shared card so every student sees EXACTLY this. Stamp
  // content_at so the copy expires after 30 days (see ensureFreshContent).
  const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  await card.update({ metadata: { ...meta, content, content_at: new Date().toISOString() } });

  return { content, resolved_prompt: resolved, cost_usd: cost(model, res) };
}

/** Student-facing content expires after 30 days; the first student past that
 *  window regenerates it once (class-wide), and the fresh copy lasts 30 days. */
export const CONTENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ensure a card's student content is fresh, regenerating it (once, class-wide)
 * when it is missing or older than 30 days — the "first student in the cohort
 * past 30 days regenerates" model. Returns the content (existing or fresh), or
 * null when the card has nothing to generate from.
 *
 * Idempotent + cheap on the hot path: a fresh copy is returned without any LLM
 * call or write. Only a stale/absent copy triggers a regenerate.
 */
export async function ensureFreshContent(cardId: string): Promise<{ content: CardContent | null; regenerated: boolean }> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  const existing = meta.content && typeof meta.content === 'object' ? (meta.content as CardContent) : null;
  const at = typeof meta.content_at === 'string' ? Date.parse(meta.content_at) : null;

  // Only content the ADMIN populated is refreshed here — never auto-generate for
  // a card that was intentionally left without content.
  if (!existing) return { content: null, regenerated: false };

  const fresh = at !== null && !Number.isNaN(at) && Date.now() - at <= CONTENT_TTL_MS;
  if (fresh) return { content: existing, regenerated: false };

  // Legacy content with no timestamp: start its 30-day clock now, no regenerate
  // (nothing pre-existing suddenly re-bills).
  if (at === null || Number.isNaN(at)) {
    await card.update({ metadata: { ...meta, content_at: new Date().toISOString() } }).catch(() => {});
    return { content: existing, regenerated: false };
  }

  // Existing but past the 30-day TTL → regenerate once (class-wide).
  try {
    const r = await generateCardContent(cardId);
    return { content: r.content, regenerated: true };
  } catch {
    return { content: existing, regenerated: false }; // never 500 a student view
  }
}
