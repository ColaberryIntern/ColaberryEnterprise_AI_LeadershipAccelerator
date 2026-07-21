/**
 * cardContentService — generate the AI content a student actually sees on a
 * Timeline card, and SAVE it onto the card. This is the bridge that connects the
 * Experience Studio's generation prompt to the real classroom: an author enters
 * the card's unique inputs, generates, and the result is persisted to
 * card.metadata.content — which the student feed then renders. No more throwaway
 * previews. Reuses the runtimePreview generation pattern (componentAiService).
 */
import TimelineCard from '../../models/TimelineCard';
import { getBlueprintContext } from './blueprintContext';
import { getSectionCurriculumContext, SECTION_ROSTER_TYPES } from './sectionCurriculumContext';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { resolvePrompt } from '../components/promptTesterService';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL, MODEL_PRICING } from '../components/costEstimationService';
import { createHash } from 'crypto';

export interface CardContent {
  title?: string;
  summary?: string;
  body_html?: string;
  questions?: string[];
  reflection?: string;
}

// Known acronyms kept uppercase when turning a competency slug into a topic label
// (e.g. "claude_api" -> "Claude API", "mcp" -> "MCP", "ai_foundations" -> "AI Foundations").
const TOPIC_ACRONYMS = new Set(['ai', 'api', 'mcp', 'ux', 'qa', 'ui', 'llm', 'ci', 'cd']);

/**
 * The week's SUBJECT as a human label for the "This Week — {topic}" kickoff title,
 * derived from the blueprint's primary competency (competencies[0]). The blueprint
 * `title` is the week's ROLE (Business Analyst, Software Engineer, …); the kickoff
 * announcement should name what the week is ABOUT (Prompt Engineering), matching the
 * body. Deterministic (no model paraphrase). Falls back to the role when there is no
 * competency to read.
 */
export function weekTopicLabel(bp: { competencies?: string[]; title?: string | null } | null | undefined): string {
  const slug = bp && Array.isArray(bp.competencies) ? bp.competencies[0] : undefined;
  if (!slug) return (bp && bp.title) || '';
  return String(slug).split('_').filter(Boolean)
    .map((w) => (TOPIC_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
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
 * A stable fingerprint of the week's activity roster (each item's type + title,
 * in order). Roster-summary cards (announcement/overview) save this alongside
 * their generated content; when the week's placed curriculum changes, the
 * fingerprint changes and the card regenerates on the next view — so a
 * "what you'll cover this week" summary is never stale. Returns null when there
 * is no roster (nothing to fingerprint / non-roster type).
 */
function sectionFingerprint(roster: { items: Array<{ type: string; title: string; bucket?: string; est_minutes?: number }> } | null): string | null {
  if (!roster || !roster.items.length) return null;
  // Includes phase (bucket) + est_minutes so a re-timed or re-phased week also
  // resets the summary — not just added/removed/retitled activities.
  const basis = roster.items.map((i) => `${i.type}|${(i.title || '').trim().toLowerCase()}|${i.bucket || ''}|${i.est_minutes ?? ''}`).join('~');
  return createHash('sha1').update(basis).digest('hex').slice(0, 16);
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
  const bp = await getBlueprintContext((card as any).program_id, card.week);
  // Week-summary types (overview) also see the week's ACTUAL activity roster —
  // excluding this card itself — so the generated copy describes what the
  // student will really do, not just the blueprint's abstract objectives.
  const roster = SECTION_ROSTER_TYPES.has(card.type)
    ? await getSectionCurriculumContext((card as any).program_id, card.week, card.id)
    : null;
  const vars = buildVars(card);
  const resolved = gen
    ? resolvePrompt(gen, vars)
    : `Write the student-facing content for a "${card.type.replace(/_/g, ' ')}" titled "${card.title}".${card.description ? ` Context: ${card.description}` : ''}`;

  const client = getInstrumentedOpenAI({ workflow_id: 'timeline_card_generate' });
  const res = await client.chat.completions.create({
    model, temperature: 0.6, max_tokens: 3200, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${bp ? bp.prompt_text + '\n\n' : ''}${roster ? roster.prompt_text + '\n\n' : ''}You render the "${def?.student_label || card.type}" activity into the exact content a student sees on this card. Return STRICT json.` },
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

  // Roster-summary titles are DETERMINISTIC — no model paraphrase, so the name never
  // drifts (this also kills the "random title" bug, e.g. "Build Your AI Foundation").
  // The weekly ANNOUNCEMENT names the week's SUBJECT ("This Week — Prompt Engineering")
  // so the title matches the body; the OVERVIEW keeps the week's ROLE theme (bp.title,
  // e.g. "Business Analyst") which the tile also shows as its week_title.
  if (bp?.title) {
    if (card.type === 'announcement') content.title = `This Week — ${weekTopicLabel(bp)}`;
    else if (card.type === 'overview') content.title = `Overview — ${bp.title}`;
  }

  // Persist onto the shared card so every student sees EXACTLY this. Stamp
  // content_at so the copy expires after 30 days (see ensureFreshContent), and
  // section_fingerprint so a roster-summary card resets when the week changes.
  const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  await card.update({ metadata: { ...meta, content, content_at: new Date().toISOString(), section_fingerprint: sectionFingerprint(roster) } });

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
/**
 * Types whose student-facing content is LLM-generated from the week context (they
 * have no hand-authored body) and so should GENERATE on first open when blank —
 * exactly like `warmup` — instead of rendering an empty card. The Claude Code
 * spine lives here: setup_lab (enablement) + the build stations
 * (implementation_task / artifact_submission, render_band build_artifacts).
 * Without this, an un-warmed build card renders blank and never self-heals — the
 * failure mode that made weeks 6–11 look "not built out". prompt_lab is covered
 * separately via SECTION_ROSTER_TYPES (it also needs the week roster).
 */
const GENERATE_ON_FIRST_OPEN = new Set(['setup_lab', 'implementation_task', 'artifact_submission']);

export async function ensureFreshContent(cardId: string): Promise<{ content: CardContent | null; regenerated: boolean }> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  const existing = meta.content && typeof meta.content === 'object' ? (meta.content as CardContent) : null;
  const at = typeof meta.content_at === 'string' ? Date.parse(meta.content_at) : null;

  // Empty card: Self Study readings, roster-summary cards (announcement /
  // overview), and the Claude Code spine (setup_lab + build stations) GENERATE on
  // first open instead of staying blank — the first student to open one produces
  // the class-wide copy. Other card types stay blank (never auto-generate for a
  // card intentionally left without content).
  if (!existing) {
    if (card.type === 'warmup' || SECTION_ROSTER_TYPES.has(card.type) || GENERATE_ON_FIRST_OPEN.has(card.type)) {
      try { const r = await generateCardContent(cardId); return { content: r.content, regenerated: true }; }
      catch { return { content: null, regenerated: false }; }
    }
    return { content: null, regenerated: false };
  }

  // Hand-authored readings are LOCKED — never auto-regenerate over them.
  if ((meta as Record<string, unknown>).locked) return { content: existing, regenerated: false };

  // Roster-summary cards (announcement/overview) reset when the week's curriculum
  // changes: if the placed roster no longer matches the fingerprint saved when we
  // generated, regenerate now so "what you'll cover this week" is never stale.
  // (Runs before the 30-day TTL check so a change resets it immediately.)
  if (SECTION_ROSTER_TYPES.has(card.type)) {
    try {
      const roster = await getSectionCurriculumContext((card as any).program_id, card.week, card.id);
      const currentFp = sectionFingerprint(roster);
      const storedFp = typeof (meta as Record<string, unknown>).section_fingerprint === 'string'
        ? (meta as Record<string, string>).section_fingerprint : null;
      if (currentFp && currentFp !== storedFp) {
        const r = await generateCardContent(cardId);
        return { content: r.content, regenerated: true };
      }
    } catch { /* fall through to the TTL check — never block a student view */ }
  }

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
