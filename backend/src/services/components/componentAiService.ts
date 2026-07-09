/**
 * componentAiService — the AI-native core of the Experience Studio.
 *
 *  - generateComponent: author types "Create a Prompt Lab that teaches Context
 *    Engineering" -> the LLM designs a full component (metadata + 7-stage prompt
 *    pipeline + variables + objectives + competencies + capabilities). Returned
 *    as a draft; nothing is saved until the author accepts.
 *  - coDesignComponent: the AI reviews an existing component and returns ranked
 *    recommendations with one-click patches.
 *  - runtimePreview: runs the generation prompt with sample variables and returns
 *    the COMPLETE rendered student experience (title, summary, questions,
 *    reflection, discussion, github task, evaluation, completion) — exactly what
 *    the student will see, before publishing.
 *
 * All JSON responses use response_format json_object; the literal word "json"
 * appears in every prompt (repo invariant — see coraJsonFormatInvariant).
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL, MODEL_PRICING } from './costEstimationService';
import { capabilityIds, CAPABILITY_MODULES } from './capabilityRegistry';
import { resolveRecipe } from './recipeRegistry';
import { resolvePrompt } from './promptTesterService';

function cost(model: string, res: any): number {
  const p = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const i = res.usage?.prompt_tokens ?? 0, o = res.usage?.completion_tokens ?? 0;
  return Number(((i * p.input_per_1m + o * p.output_per_1m) / 1_000_000).toFixed(6));
}
async function jsonCall(workflow: string, system: string, user: string, model = DEFAULT_MODEL, max_tokens = 1600) {
  const client = getInstrumentedOpenAI({ workflow_id: workflow });
  const started = Date.now();
  const res = await client.chat.completions.create({
    model, temperature: 0.6, max_tokens,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  const runtime_ms = Date.now() - started;
  let parsed: any = {};
  try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  return { parsed, runtime_ms, cost_usd: cost(model, res), usage: { input_tokens: res.usage?.prompt_tokens ?? 0, output_tokens: res.usage?.completion_tokens ?? 0 } };
}

export async function generateComponent(description: string, recipeId?: string, model = DEFAULT_MODEL) {
  const recipe = resolveRecipe(recipeId);
  const system =
    'You are an expert AI curriculum architect for an AI Systems Architect Accelerator. ' +
    'Design a complete, reusable AI learning Component. Return STRICT json only.';
  const user =
    `Design an AI Component for this request: "${description}".\n` +
    (recipe ? `Recipe "${recipe.label}": ${recipe.guidance} Prefer capabilities: ${recipe.suggested_capabilities.join(', ')}. Difficulty: ${recipe.difficulty}.\n` : '') +
    `Return a json object with EXACTLY these keys:\n` +
    `label, student_label, description, category, tags (string[]), difficulty (intro|core|stretch), ` +
    `render_band, bucket_default (pre_class|learn|practice|build|reflect|share|advance), ` +
    `learning_xp, builder_xp, community_xp (integers), ` +
    `learning_objectives (string[]), architect_domains (string[]), ` +
    `competencies (array of {domain_id, weight}), ` +
    `capabilities (string[] chosen from: ${capabilityIds().join(', ')}), ` +
    `variable_keys (string[] like topic, week, submission), ` +
    `design_prompt, generation_prompt, renderer_prompt, evaluation_prompt, reflection_prompt, github_prompt, improvement_prompt (strings; ` +
    `use {{variable}} placeholders). Make every prompt concrete and specific to the request.`;
  const r = await jsonCall('experience_studio_generate', system, user, model, 2200);
  // guard capabilities to known ids
  if (Array.isArray(r.parsed.capabilities)) {
    const valid = new Set(capabilityIds());
    r.parsed.capabilities = r.parsed.capabilities.filter((c: string) => valid.has(c));
  }
  return { draft: r.parsed, usage: r.usage, cost_usd: r.cost_usd, runtime_ms: r.runtime_ms };
}

export async function coDesignComponent(slug: string, model = DEFAULT_MODEL) {
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const j = c.toJSON() as any;
  const system =
    'You are an AI curriculum design reviewer. Critique the component across: prompt quality, prompt complexity, ' +
    'cost, runtime, student experience, difficulty calibration, competency coverage, Bloom\'s taxonomy level, ' +
    'architect-domain fit, missing variables, missing capabilities, missing GitHub integration, missing portfolio evidence. ' +
    'Return STRICT json.';
  const capList = CAPABILITY_MODULES.map((m) => m.id).join(', ');
  const user =
    `Review this AI Component and return json { "score": number 0-100, "recommendations": [ ` +
    `{ "area": string, "severity": "low"|"medium"|"high", "finding": string, ` +
    `"patch": object (a partial component patch to apply, using real field names/capability ids) } ] }.\n` +
    `Valid capability ids: ${capList}.\n` +
    `Component:\n${JSON.stringify({
      label: j.label, difficulty: j.difficulty, render_band: j.render_band,
      learning_objectives: j.learning_objectives, competencies: j.competencies,
      architect_domains: j.architect_domains, capabilities: j.capabilities, variable_keys: j.variable_keys,
      generation_prompt: j.generation_prompt, evaluation_prompt: j.evaluation_prompt,
      github_prompt: j.github_prompt, est_cost_usd: j.est_cost_usd,
    })}`;
  const r = await jsonCall('experience_studio_codesign', system, user, model, 1400);
  return { score: r.parsed.score ?? null, recommendations: r.parsed.recommendations || [], usage: r.usage, cost_usd: r.cost_usd, runtime_ms: r.runtime_ms };
}

export async function runtimePreview(slug: string, variables: Record<string, string> = {}, model = DEFAULT_MODEL) {
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const gen = (c as any).generation_prompt as string | null;
  if (!gen) throw Object.assign(new Error('Component has no generation prompt'), { status: 400 });
  const resolved = resolvePrompt(gen, variables);
  const system =
    `You are the runtime that renders the "${c.student_label}" component into the exact experience a student sees. ` +
    'Return STRICT json.';
  const user =
    `Using this generation prompt, produce the full student experience as json with keys: ` +
    `title, summary, body_html (clean self-contained HTML, no scripts), questions (string[]), reflection (string), ` +
    `discussion_prompt (string), github_task (string|null), evaluation_criteria (string[]), completion (string describing how the card completes).\n\n` +
    `Generation prompt:\n${resolved}`;
  const r = await jsonCall('experience_studio_runtime_preview', system, user, model, 1800);
  return { experience: r.parsed, resolved_prompt: resolved, usage: r.usage, cost_usd: r.cost_usd, runtime_ms: r.runtime_ms };
}
