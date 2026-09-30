/**
 * rendererService — the Component Renderer Engine. Every AI Component owns a
 * prompt-driven Renderer Definition: 8 surfaces (thumbnail, timeline, expanded,
 * runtime, student, mobile, tablet, desktop), each a prompt describing how the
 * AI builds that surface's HTML. No hardcoded layouts — the component defines how
 * it renders itself. `renderSurface` executes a surface prompt live.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL, MODEL_PRICING } from './costEstimationService';
import { resolvePrompt } from './promptTesterService';

export const RENDERER_SURFACES = ['thumbnail', 'timeline', 'expanded', 'runtime', 'student', 'mobile', 'tablet', 'desktop'] as const;
export type RendererSurface = typeof RENDERER_SURFACES[number];

const SURFACE_GUIDANCE: Record<RendererSurface, string> = {
  thumbnail: 'a compact 320x180 thumbnail card — title + one-line summary + a colored band. Minimal.',
  timeline: 'the feed card as it appears in the student timeline — icon tile, title, subtitle, points, a single CTA.',
  expanded: 'the expanded detail view when the student opens the card — full content, sections, actions.',
  runtime: 'the complete live runtime experience — everything the component generates for the student session.',
  student: 'exactly what the student sees and interacts with, faithful to capabilities enabled.',
  mobile: 'a single-column layout optimized for a 375px mobile viewport.',
  tablet: 'a layout optimized for a 768px tablet viewport.',
  desktop: 'a rich layout optimized for a >=1000px desktop viewport.',
};

/** PURE — default renderer prompt for a surface, derived from the component. */
export function defaultRendererFor(surface: RendererSurface, c: { student_label?: string; label: string; render_band?: string | null }): string {
  const label = c.student_label || c.label;
  return `Render this "${label}" (${c.render_band || 'card'}) as ${SURFACE_GUIDANCE[surface]} ` +
    `Output clean, self-contained, accessible HTML (no scripts). Use the content:\n{{content}}`;
}

/** Default renderer definition for all 8 surfaces (backfill helper). */
export function defaultRenderers(c: any): Record<RendererSurface, string> {
  const out = {} as Record<RendererSurface, string>;
  for (const s of RENDERER_SURFACES) out[s] = defaultRendererFor(s, c);
  return out;
}

export async function backfillRenderers(force = false): Promise<{ filled: number }> {
  const rows = await CurriculumTypeDefinition.findAll();
  let filled = 0;
  for (const c of rows) {
    const cur = (c.renderers && typeof c.renderers === 'object') ? c.renderers : {};
    const has = RENDERER_SURFACES.every((s) => cur[s]);
    if (force || !has) { await c.update({ renderers: { ...defaultRenderers(c.toJSON()), ...(force ? {} : cur) } }); filled += 1; }
  }
  return { filled };
}

export async function renderSurface(slug: string, surface: RendererSurface, variables: Record<string, string> = {}, model = DEFAULT_MODEL) {
  if (!RENDERER_SURFACES.includes(surface)) throw Object.assign(new Error(`Unknown surface "${surface}"`), { status: 400 });
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const renderers = (c.renderers && typeof c.renderers === 'object') ? c.renderers : {};
  const template = renderers[surface] || defaultRendererFor(surface, c.toJSON() as any);
  const resolved = resolvePrompt(template, variables);

  const client = getInstrumentedOpenAI({ workflow_id: `renderer_${surface}` });
  const started = Date.now();
  const res = await client.chat.completions.create({
    model, temperature: 0.5, max_tokens: 1200,
    messages: [
      { role: 'system', content: `You are the ${surface} renderer for an AI curriculum component. Output ONLY HTML — no markdown fences, no commentary.` },
      { role: 'user', content: resolved },
    ],
  });
  const runtime_ms = Date.now() - started;
  const html = (res.choices?.[0]?.message?.content || '').replace(/^```html?\s*|\s*```$/g, '').trim();
  const p = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const it = res.usage?.prompt_tokens ?? 0, ot = res.usage?.completion_tokens ?? 0;
  return { surface, html, resolved_prompt: resolved, usage: { input_tokens: it, output_tokens: ot }, cost_usd: Number(((it * p.input_per_1m + ot * p.output_per_1m) / 1_000_000).toFixed(6)), runtime_ms };
}
