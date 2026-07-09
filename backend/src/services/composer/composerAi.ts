/**
 * composerAi — the AI Curriculum Architect's generation core. Turns a Blueprint
 * + a natural-language instruction into an ordered plan of cards, each an
 * instance of a REAL Experience Studio component type (registry slug) — never
 * hardcoded curriculum. Also powers the Blueprint-aware "Fill with AI".
 *
 * Every LLM path has a pure, deterministic scaffold fallback (`scaffoldPlan`)
 * so the Composer works with no OpenAI key (dev) and is unit-testable, and so a
 * bad LLM response never yields an empty week.
 */
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL, MODEL_PRICING } from '../components/costEstimationService';
import { allTypes, resolve, CardTypeDef } from '../timeline/typeRegistry';
import { PlanCard, CurriculumPlan, ComposerScope, Difficulty } from './types';

export interface BlueprintInput {
  title?: string; purpose?: string; week?: number | null;
  difficulty?: string | null; competencies?: string[]; architect_domains?: string[];
  learning_objectives?: string[];
}

/** buildable, author-placeable palette (no system + no event types). */
export function palette(): CardTypeDef[] {
  return allTypes().filter((t) => !t.system && !t.event);
}

// ── canonical scaffolds per scope (all deps satisfied by construction) ────────
const SEQ: Record<ComposerScope, string[]> = {
  lesson: ['overview', 'video', 'knowledge_check'],
  session: ['announcement', 'overview', 'video', 'warmup', 'prompt_lab', 'reflection'],
  day: ['warmup', 'video', 'prompt_lab', 'reflection'],
  week: ['announcement', 'overview', 'warmup', 'video', 'knowledge_check', 'deep_dive', 'prompt_lab', 'implementation_task', 'github_sync', 'artifact_submission', 'reflection', 'community_discussion', 'mock_interview', 'survey', 'evaluation'],
  sprint: ['announcement', 'overview', 'video', 'prompt_lab', 'implementation_task', 'github_sync', 'artifact_submission', 'demo', 'reflection', 'evaluation'],
  month: ['announcement', 'overview', 'deep_dive', 'prompt_lab', 'implementation_task', 'github_sync', 'artifact_submission', 'presentation', 'reflection', 'mock_interview', 'evaluation'],
  certification_module: ['overview', 'deep_dive', 'prompt_lab', 'implementation_task', 'certification_exercise', 'evaluation'],
  internship: ['announcement', 'implementation_task', 'github_sync', 'artifact_submission', 'presentation', 'evaluation'],
  program: ['announcement', 'overview', 'video', 'prompt_lab', 'implementation_task', 'github_sync', 'artifact_submission', 'mock_interview', 'evaluation'],
};

const clampMin = (n: number) => Math.max(3, Math.min(120, Math.round(n)));
function defaultMinutes(def: CardTypeDef): number {
  if (def.evidence_required && def.github_required) return 60;
  if (def.evidence_required) return 40;
  if (def.render_band === 'media' || def.render_band === 'live_class') return 18;
  return 15;
}
function cardFromDef(def: CardTypeDef, topic: string, week: number | null): PlanCard {
  return {
    type: def.slug,
    title: `${def.label}: ${topic}`,
    subtitle: null,
    description: `${def.student_label} for ${topic}. ${def.evidence_required ? 'Produces reviewable evidence.' : 'Builds the concept before you apply it.'}`,
    bucket: def.bucket,
    week,
    difficulty: def.difficulty,
    estimated_time: defaultMinutes(def),
    points: { learning: def.learning_xp, builder: def.builder_xp, community: def.community_xp },
    competencies: def.competencies.slice(),
    rationale: def.competencies.length ? `Advances ${def.competencies.join(', ')} on the path to Architect.` : 'Builds foundational fluency.',
    video_url: null,
  };
}

/** PURE — a sound default plan for a scope, assembled from real registry types. */
export function scaffoldPlan(bp: BlueprintInput, scope: ComposerScope = 'week'): CurriculumPlan {
  const topic = (bp.title || 'the week topic').trim();
  const week = bp.week ?? null;
  const cards = (SEQ[scope] || SEQ.week).map((slug) => cardFromDef(resolve(slug)!, topic, week));
  return { scope, week, summary: `${labelScope(scope)} for ${topic}, assembled from ${cards.length} reusable components.`, cards };
}

function labelScope(s: ComposerScope): string { return s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

// ── LLM generation with fallback ──────────────────────────────────────────────
function cost(model: string, res: any): number {
  const p = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const i = res.usage?.prompt_tokens ?? 0, o = res.usage?.completion_tokens ?? 0;
  return Number(((i * p.input_per_1m + o * p.output_per_1m) / 1_000_000).toFixed(6));
}
async function jsonCall(workflow: string, system: string, user: string, model: string, max_tokens: number) {
  const client = getInstrumentedOpenAI({ workflow_id: workflow });
  const started = Date.now();
  const res = await client.chat.completions.create({
    model, temperature: 0.5, max_tokens, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  let parsed: any = {};
  try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  return { parsed, runtime_ms: Date.now() - started, cost_usd: cost(model, res), usage: { input_tokens: res.usage?.prompt_tokens ?? 0, output_tokens: res.usage?.completion_tokens ?? 0 } };
}

/** Coerce one raw LLM card onto a valid PlanCard, or null if the type is unknown/unplaceable. */
function normalizeCard(raw: any, week: number | null): PlanCard | null {
  const def = resolve(String(raw?.type || ''));
  if (!def || def.system || def.event) return null;
  const diff: Difficulty = ['intro', 'core', 'stretch'].includes(raw?.difficulty) ? raw.difficulty : def.difficulty;
  const p = raw?.points || {};
  return {
    type: def.slug,
    title: (typeof raw?.title === 'string' && raw.title.trim()) || def.label,
    subtitle: typeof raw?.subtitle === 'string' ? raw.subtitle : null,
    description: typeof raw?.description === 'string' ? raw.description : null,
    bucket: def.bucket,
    week,
    difficulty: diff,
    estimated_time: clampMin(Number(raw?.estimated_time) || defaultMinutes(def)),
    points: {
      learning: intOr(p.learning, def.learning_xp), builder: intOr(p.builder, def.builder_xp), community: intOr(p.community, def.community_xp),
    },
    competencies: Array.isArray(raw?.competencies) && raw.competencies.length ? raw.competencies.map(String) : def.competencies.slice(),
    rationale: typeof raw?.rationale === 'string' ? raw.rationale : null,
    video_url: typeof raw?.video_url === 'string' ? raw.video_url : null,
  };
}
const intOr = (v: any, d: number) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);

export interface GenerateResult { plan: CurriculumPlan; source: 'ai' | 'scaffold'; usage?: any; cost_usd?: number; runtime_ms?: number; ai_confidence: number }

/** Generate a curriculum plan from a blueprint + instruction. LLM-first, scaffold-fallback. */
export async function generateCurriculum(bp: BlueprintInput, instruction: string, scope: ComposerScope = 'week', model = DEFAULT_MODEL): Promise<GenerateResult> {
  const week = bp.week ?? null;
  const pal = palette().map((t) => `${t.slug} (${t.label}, ${t.bucket}${t.evidence_required ? ', evidence' : ''}${t.github_required ? ', github' : ''})`).join('; ');
  const system =
    'You are a Senior Instructional Designer + AI Curriculum Architect for an AI Systems Architect Accelerator. ' +
    'You assemble reusable component types into a coherent learning sequence. Your north star: maximize each ' +
    "student's progress toward becoming an AI Systems Architect. Use ONLY the provided component type slugs. Return STRICT json.";
  const user =
    `Blueprint: ${JSON.stringify({ title: bp.title, purpose: bp.purpose, week, difficulty: bp.difficulty, competencies: bp.competencies, architect_domains: bp.architect_domains, learning_objectives: bp.learning_objectives })}\n` +
    `Instruction: "${instruction}"\nScope: ${scope}.\n` +
    `Available component types (use ONLY these slugs): ${pal}.\n` +
    `Assemble the best-sequenced ${scope}. Respect prerequisites (an Overview + Video before a Prompt Lab; a Prompt Lab before a Mock Interview; a GitHub build before an Artifact). End on a capstone (evaluation / certification_exercise).\n` +
    `Return json { "summary": string, "cards": [ { "type": slug, "title": string, "subtitle": string, "description": string, ` +
    `"difficulty": "intro"|"core"|"stretch", "estimated_time": integer minutes, "points": {"learning":int,"builder":int,"community":int}, ` +
    `"competencies": string[], "rationale": string (why this moves the student toward Architect) } ] }. 8-16 cards for a week.`;

  try {
    const r = await jsonCall('composer_generate', system, user, model, 3000);
    const cards = Array.isArray(r.parsed?.cards) ? r.parsed.cards.map((c: any) => normalizeCard(c, week)).filter(Boolean) as PlanCard[] : [];
    if (cards.length >= 3) {
      return { plan: { scope, week, summary: typeof r.parsed.summary === 'string' ? r.parsed.summary : null, cards }, source: 'ai', usage: r.usage, cost_usd: r.cost_usd, runtime_ms: r.runtime_ms, ai_confidence: 0.9 };
    }
  } catch { /* fall through to scaffold */ }
  return { plan: scaffoldPlan(bp, scope), source: 'scaffold', ai_confidence: 0.8 };
}

export interface FillResult { card: Partial<PlanCard>; source: 'ai' | 'scaffold'; usage?: any; cost_usd?: number; runtime_ms?: number }

/** Blueprint-aware Fill with AI — one instruction -> a card's fields, aligned to the blueprint. */
export async function fillCard(bp: BlueprintInput, typeSlug: string, instruction: string, model = DEFAULT_MODEL): Promise<FillResult> {
  const def = resolve(typeSlug);
  if (!def) throw Object.assign(new Error(`Unknown component type "${typeSlug}"`), { status: 400 });
  const scaffold = cardFromDef(def, (instruction || bp.title || def.label).trim(), bp.week ?? null);
  const system =
    `You author a single "${def.label}" learning card, kept consistent with the course Blueprint. Return STRICT json.`;
  const user =
    `Blueprint: ${JSON.stringify({ title: bp.title, difficulty: bp.difficulty, competencies: bp.competencies, architect_domains: bp.architect_domains, learning_objectives: bp.learning_objectives })}\n` +
    `Instruction: "${instruction}". Component type: ${def.slug} (${def.bucket}).\n` +
    `Return json { "title": string, "subtitle": string, "description": string, "difficulty": "intro"|"core"|"stretch", ` +
    `"estimated_time": integer minutes, "points": {"learning":int,"builder":int,"community":int}, "competencies": string[]` +
    `${def.render_band === 'media' ? ', "video_url": string (a real, relevant public YouTube/Vimeo URL if you know one, else empty)' : ''} }.`;
  try {
    const r = await jsonCall('composer_fill_card', system, user, model, 900);
    const c = normalizeCard({ ...r.parsed, type: def.slug }, bp.week ?? null);
    if (c) return { card: c, source: 'ai', usage: r.usage, cost_usd: r.cost_usd, runtime_ms: r.runtime_ms };
  } catch { /* fall through */ }
  return { card: scaffold, source: 'scaffold' };
}
