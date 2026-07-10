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

  // Persist onto the shared card so every student sees EXACTLY this.
  const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  await card.update({ metadata: { ...meta, content } });

  return { content, resolved_prompt: resolved, cost_usd: cost(model, res) };
}
