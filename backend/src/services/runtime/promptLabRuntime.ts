/**
 * promptLabRuntime — the interactive Prompt Lab. The student writes a prompt,
 * runs it, and gets a real AI evaluation: a score, an Architect score, concrete
 * strengths + gaps, actionable suggestions, and an improved version to compare
 * against. Retry-friendly (each call is independent). LLM-backed with a graceful
 * fallback so the lab never dead-ends.
 */
import { chatJson } from './runtimeAi';

interface CardCtx { id: string; type: string; title: string; description?: string | null }

export interface PromptEvaluation {
  score: number;            // 0..100 overall
  architect_score: number;  // 0..100 architect-thinking
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  better_prompt: string;
  cost_usd: number;
}

export async function evaluatePrompt(card: CardCtx, prompt: string, output?: string): Promise<PromptEvaluation> {
  const system =
    'You are a Senior AI Systems Architect grading a student\'s prompt. Score craft (clarity, structure, explicit ' +
    'contracts, constraints, examples) AND architect-thinking (does it treat the model as a component with I/O ' +
    'contracts, failure handling, evaluability?). Be specific and encouraging. Return STRICT json.';
  const user =
    `Activity: "${card.title}". ${card.description || ''}\n` +
    `Student prompt:\n"""${(prompt || '').slice(0, 4000)}"""\n` +
    (output ? `Model output they saw:\n"""${output.slice(0, 2000)}"""\n` : '') +
    `Return json { "score": int 0-100, "architect_score": int 0-100, "strengths": string[], "gaps": string[], ` +
    `"suggestions": string[], "better_prompt": string (a concretely improved version of THEIR prompt) }.`;
  const r = await chatJson('runtime_prompt_lab', system, user, undefined, 1400);
  const p = r.parsed || {};
  if (typeof p.score !== 'number') {
    return { score: 0, architect_score: 0, strengths: [], gaps: ['Could not evaluate — try running again.'], suggestions: [], better_prompt: prompt, cost_usd: r.cost_usd };
  }
  return {
    score: clampScore(p.score), architect_score: clampScore(p.architect_score),
    strengths: arr(p.strengths), gaps: arr(p.gaps), suggestions: arr(p.suggestions),
    better_prompt: typeof p.better_prompt === 'string' ? p.better_prompt : prompt, cost_usd: r.cost_usd,
  };
}

const clampScore = (n: any) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String) : []);
