/**
 * promptTesterService — the live "Test" button of the Experience Builder. Runs
 * one of a component's prompts (generation / renderer / evaluation / reflection /
 * github / improvement) against the LLM with author-supplied sample variables and
 * returns the real output + measured tokens/cost/runtime. Read-only; nothing is
 * persisted except the optional preview example the author chooses to save.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL, MODEL_PRICING } from './costEstimationService';

export type PromptKind = 'generation' | 'renderer' | 'evaluation' | 'reflection' | 'github' | 'improvement';
const FIELD: Record<PromptKind, keyof CurriculumTypeDefinition> = {
  generation: 'generation_prompt', renderer: 'renderer_prompt', evaluation: 'evaluation_prompt',
  reflection: 'reflection_prompt', github: 'github_prompt', improvement: 'improvement_prompt',
};

/** Substitute {{var}} / {var} placeholders with supplied values (missing -> left visible). */
export function resolvePrompt(template: string, variables: Record<string, string>): string {
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k) => (k in variables ? variables[k] : `{{${k}}}`))
    .replace(/\{\s*([a-zA-Z0-9_.]+)\s*\}/g, (_m, k) => (k in variables ? variables[k] : `{${k}}`));
}

export interface TestResult {
  kind: PromptKind;
  model: string;
  resolved_prompt: string;
  output: string;
  usage: { input_tokens: number; output_tokens: number };
  cost_usd: number;
  runtime_ms: number;
}

export async function testPrompt(
  slug: string, kind: PromptKind, variables: Record<string, string> = {}, model: string = DEFAULT_MODEL,
): Promise<TestResult> {
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const template = (c as any)[FIELD[kind]] as string | null;
  if (!template) throw Object.assign(new Error(`Component "${slug}" has no ${kind} prompt`), { status: 400 });

  const resolved = resolvePrompt(template, variables);
  const client = getInstrumentedOpenAI({ workflow_id: 'experience_builder_prompt_test' });

  const started = Date.now();
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are an AI curriculum component. Produce exactly what the prompt asks — no preamble.' },
      { role: 'user', content: resolved },
    ],
    temperature: 0.7,
    max_tokens: 900,
  });
  const runtime_ms = Date.now() - started;

  const output = res.choices?.[0]?.message?.content?.trim() || '(empty)';
  const input_tokens = res.usage?.prompt_tokens ?? 0;
  const output_tokens = res.usage?.completion_tokens ?? 0;
  const p = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const cost_usd = Number(((input_tokens * p.input_per_1m + output_tokens * p.output_per_1m) / 1_000_000).toFixed(6));

  return { kind, model, resolved_prompt: resolved, output, usage: { input_tokens, output_tokens }, cost_usd, runtime_ms };
}
