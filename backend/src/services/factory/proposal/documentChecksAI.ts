/**
 * documentChecksAI — the AI half of the six-check scorer (P3): evaluator, proof, clarity. Same rails as the AI
 * drafter: instrumented OpenAI, explicit timeout, FAIL SOFT (no key / upstream error → a 0 score with a finding,
 * never a throw past the caller). The deterministic checks live in documentChecks.ts; runDocumentChecks merges them.
 *
 *  - evaluator: THREE independent calls, each scoring the document against the blueprint's Section M factors. We take
 *    the MEDIAN and flag a 2+ adjectival-level spread for a human (the Red-team "independent reviewers disagree" rule).
 *  - proof: extract the document's claims and mark each backed (by an inserted artifact, a library fact, or a cited
 *    reference) or not; an unbacked claim is a finding.
 *  - clarity: a theme statement per section, customer focus, and a readability band.
 *
 * NEVER FABRICATE: these checks SCORE, they never write content; a missing fact is the drafter's job (a gap), not
 * the scorer's. Returns null when there is no API key, so runDocumentChecks shows the honest "not run" state.
 */
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { DEFAULT_MODEL } from '../../components/costEstimationService';
import type { AiCheckResults } from './documentChecks';
import type { CheckFinding } from './proposalReviewTypes';

export interface AiCheckInput {
  docKey: string;
  title: string;
  contentHtml: string | null;
  /** Section M factors from the blueprint, for the evaluator scoresheet. */
  scoringFactors?: Array<{ label: string; points?: number; percent?: number }>;
  /** Backing the proof check can join claims to: inserted-artifact captions, approved library facts, references. */
  backingRefs?: string[];
}

const clamp100 = (n: unknown): number => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0; };
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
/** 5 adjectival bands (unacceptable→outstanding), the Section M convention, from a 0–100 score. */
const adjLevel = (score: number): number => (score >= 90 ? 4 : score >= 80 ? 3 : score >= 70 ? 2 : score >= 60 ? 1 : 0);

function text(html: string | null): string { return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000); }

async function callJson(workflow: string, system: string, user: string): Promise<any | null> {
  try {
    const client = getInstrumentedOpenAI({ workflow_id: workflow }, { timeout: 60000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.2, max_tokens: 1200, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    try { return JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { return null; }
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'proposal-studio-checks', event: workflow, outcome: 'failure', error_class: (err as any)?.constructor?.name ?? 'Error', context: { message: (err as any)?.message } }));
    return null;
  }
}

/** Evaluator: 3 independent scores vs the Section M factors; median + a spread flag. */
async function aiEvaluator(input: AiCheckInput): Promise<{ score: number; findings: CheckFinding[] }> {
  const factors = (input.scoringFactors ?? []).map((f) => `- ${f.label}${typeof f.points === 'number' ? ` (${f.points} pts)` : typeof f.percent === 'number' ? ` (${f.percent}%)` : ''}`).join('\n') || '- Overall responsiveness and quality';
  const system = 'You are an independent government source-selection evaluator. Score the proposal section on the given factors from 0 to 100 as a real evaluator would (no points for "comply" boilerplate). Return STRICT JSON {"score": <0-100>, "rationale": "<one sentence>"}.';
  const user = `Factors:\n${factors}\n\nProposal content:\n${text(input.contentHtml)}`;
  const results = await Promise.all([0, 1, 2].map(() => callJson('gov_proposal_check_evaluator', system, user)));
  const scores = results.filter((r) => r && Number.isFinite(Number(r.score))).map((r) => clamp100(r.score));
  if (scores.length === 0) return { score: 0, findings: [{ check: 'evaluator', severity: 'major', message: 'The evaluator check could not run (no model result).' }] };
  const findings: CheckFinding[] = [];
  const spread = adjLevel(Math.max(...scores)) - adjLevel(Math.min(...scores));
  if (scores.length >= 2 && spread >= 2) findings.push({ check: 'evaluator', severity: 'major', message: `Evaluators disagree by ${spread} adjectival levels (${scores.join(', ')}) — needs a human reviewer.` });
  return { score: median(scores), findings };
}

/** Proof: claims extracted and marked backed/unbacked against the provided backing. */
async function aiProof(input: AiCheckInput): Promise<{ score: number; findings: CheckFinding[] }> {
  const backing = (input.backingRefs ?? []).slice(0, 40).map((b, i) => `[${i + 1}] ${String(b).slice(0, 300)}`).join('\n') || '(no backing provided)';
  const system = 'You check whether the proposal\'s claims are backed. Extract each substantive claim (a capability, result, metric, differentiator) and mark it backed=true ONLY if the provided backing supports it; otherwise backed=false. Do not invent backing. Return STRICT JSON {"claims":[{"text":"...","backed":true|false}]}.';
  const user = `Backing available:\n${backing}\n\nProposal content:\n${text(input.contentHtml)}`;
  const r = await callJson('gov_proposal_check_proof', system, user);
  const claims: Array<{ text: string; backed: boolean }> = Array.isArray(r?.claims) ? r.claims : [];
  if (!r || claims.length === 0) return { score: r ? 100 : 0, findings: r ? [] : [{ check: 'proof', severity: 'major', message: 'The proof check could not run (no model result).' }] };
  const unbacked = claims.filter((c) => c && c.backed === false);
  const findings: CheckFinding[] = unbacked.slice(0, 10).map((c) => ({ check: 'proof', severity: 'major', message: `Unbacked claim: "${String(c.text).slice(0, 160)}"` }));
  return { score: Math.round(((claims.length - unbacked.length) / claims.length) * 100), findings };
}

/** Clarity: theme statement per section, customer focus, readability band. */
async function aiClarity(input: AiCheckInput): Promise<{ score: number; findings: CheckFinding[] }> {
  const system = 'You assess a government proposal section for clarity: does it open with a theme statement (discriminator + customer benefit + proof), keep a customer focus, and read cleanly? Return STRICT JSON {"score": <0-100>, "issues": ["..."]}.';
  const r = await callJson('gov_proposal_check_clarity', system, text(input.contentHtml) ? `Proposal content:\n${text(input.contentHtml)}` : 'Proposal content: (empty)');
  if (!r || !Number.isFinite(Number(r.score))) return { score: 0, findings: [{ check: 'clarity', severity: 'minor', message: 'The clarity check could not run (no model result).' }] };
  const issues: string[] = Array.isArray(r.issues) ? r.issues : [];
  return { score: clamp100(r.score), findings: issues.slice(0, 5).map((i) => ({ check: 'clarity', severity: 'minor', message: String(i).slice(0, 200) })) };
}

/**
 * Run the three AI checks. Returns null when there is no API key (runDocumentChecks then shows the honest "not run"
 * state). Each check is fail-soft on its own, so one check's upstream error never sinks the others.
 */
export async function runAiChecks(input: AiCheckInput): Promise<AiCheckResults | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const [ev, pr, cl] = await Promise.all([aiEvaluator(input), aiProof(input), aiClarity(input)]);
  return {
    scores: { evaluator: ev.score, proof: pr.score, clarity: cl.score },
    findings: [...ev.findings, ...pr.findings, ...cl.findings],
  };
}
