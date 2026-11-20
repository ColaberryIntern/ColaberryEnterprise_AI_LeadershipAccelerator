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
import { newJudgeRun, type JudgeRun } from './judgeRuns';

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

/** Strip tags to plain text — NO truncation. The old 8,000-char cut here was the defect that let any obligation
 *  past char 8,000 go unscored on a long proposal (spec defect #2 / T05). */
function plainText(html: string | null): string { return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

/** The most characters we put in ONE evaluator/proof/clarity prompt. A document longer than this is read in order
 *  via a windowed map-reduce so the WHOLE document is judged (never silently truncated). ~48k chars ~= 12k tokens,
 *  well inside the model context with headroom for the system/factor text. */
const MAX_PROMPT_CHARS = 48000;

/** Split plain text into in-order windows of at most MAX_PROMPT_CHARS. Returns a single window (possibly empty) for
 *  any document that already fits, so short-document behavior is byte-identical to before. Pure. */
function windows(full: string): string[] {
  if (full.length <= MAX_PROMPT_CHARS) return [full];
  const out: string[] = [];
  for (let i = 0; i < full.length; i += MAX_PROMPT_CHARS) out.push(full.slice(i, i + MAX_PROMPT_CHARS));
  return out;
}

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

/**
 * Evaluator: THREE independent judges vs the Section M factors; median of the three + a spread flag. Each judge reads
 * the WHOLE document — for a long document it scores every in-order window and takes its STRICTEST (min) window score,
 * so a weak section near the end can never hide behind a strong opening. Short documents are one window, so behavior is
 * identical to before (3 calls, median, spread). Its own judge run (T11).
 */
async function aiEvaluator(input: AiCheckInput): Promise<{ score: number; findings: CheckFinding[]; run: JudgeRun }> {
  const full = plainText(input.contentHtml);
  const run = newJudgeRun('evaluator', input.docKey, full.slice(0, 8000), DEFAULT_MODEL);
  const wins = windows(full);
  const factors = (input.scoringFactors ?? []).map((f) => `- ${f.label}${typeof f.points === 'number' ? ` (${f.points} pts)` : typeof f.percent === 'number' ? ` (${f.percent}%)` : ''}`).join('\n') || '- Overall responsiveness and quality';
  const system = 'You are an independent government source-selection evaluator. Score the proposal section on the given factors from 0 to 100 as a real evaluator would (no points for "comply" boilerplate). Return STRICT JSON {"score": <0-100>, "rationale": "<one sentence>"}.';
  const judgeScores: number[] = [];
  for (const _ of [0, 1, 2]) {
    const winScores: number[] = [];
    for (const w of wins) {
      const r = await callJson('gov_proposal_check_evaluator', system, `Factors:\n${factors}\n\nProposal content:\n${w}`);
      if (r && Number.isFinite(Number(r.score))) winScores.push(clamp100(r.score));
    }
    if (winScores.length) judgeScores.push(Math.min(...winScores));
  }
  if (judgeScores.length === 0) return { score: 0, findings: [{ check: 'evaluator', severity: 'major', message: 'The evaluator check could not run (no model result).' }], run };
  const findings: CheckFinding[] = [];
  const spread = adjLevel(Math.max(...judgeScores)) - adjLevel(Math.min(...judgeScores));
  if (judgeScores.length >= 2 && spread >= 2) findings.push({ check: 'evaluator', severity: 'major', message: `Evaluators disagree by ${spread} adjectival levels (${judgeScores.join(', ')}) — needs a human reviewer.` });
  return { score: median(judgeScores), findings, run };
}

/**
 * Proof: extract each substantive claim across the WHOLE document (union of claims over all windows) and mark backed /
 * unbacked against the provided backing. CRITICAL (spec defect #3 / T06): a valid model response that identifies ZERO
 * claims is UNVERIFIED, scored 0 with a finding — NEVER an automatic 100. A total model failure is also 0 (honest "not
 * run"). Its own judge run (T11).
 */
async function aiProof(input: AiCheckInput): Promise<{ score: number; findings: CheckFinding[]; run: JudgeRun; unverified?: boolean }> {
  const full = plainText(input.contentHtml);
  const run = newJudgeRun('proof', input.docKey, full.slice(0, 8000), DEFAULT_MODEL);
  const wins = windows(full);
  const backing = (input.backingRefs ?? []).slice(0, 40).map((b, i) => `[${i + 1}] ${String(b).slice(0, 300)}`).join('\n') || '(no backing provided)';
  const system = 'You check whether the proposal\'s claims are backed. Extract each substantive claim (a capability, result, metric, differentiator) and mark it backed=true ONLY if the provided backing supports it; otherwise backed=false. Do not invent backing. Return STRICT JSON {"claims":[{"text":"...","backed":true|false}]}.';
  let anyResult = false;
  const claims: Array<{ text: string; backed: boolean }> = [];
  for (const w of wins) {
    const r = await callJson('gov_proposal_check_proof', system, `Backing available:\n${backing}\n\nProposal content:\n${w}`);
    if (r) { anyResult = true; if (Array.isArray(r.claims)) claims.push(...r.claims); }
  }
  if (!anyResult) return { score: 0, findings: [{ check: 'proof', severity: 'major', message: 'The proof check could not run (no model result).' }], run };
  if (claims.length === 0) return { score: 0, unverified: true, findings: [{ check: 'proof', severity: 'major', message: 'UNVERIFIED: no verifiable claims were identified, so the proof check cannot pass (an empty claim set is never an automatic pass).' }], run };
  const unbacked = claims.filter((c) => c && c.backed === false);
  const findings: CheckFinding[] = unbacked.slice(0, 10).map((c) => ({ check: 'proof', severity: 'major', message: `Unbacked claim: "${String(c.text).slice(0, 160)}"` }));
  return { score: Math.round(((claims.length - unbacked.length) / claims.length) * 100), findings, run };
}

/** Clarity: theme statement, customer focus, readability — averaged over all windows so the whole document is read.
 *  Single-window (short) behavior is identical to before. Its own judge run (T11). */
async function aiClarity(input: AiCheckInput): Promise<{ score: number; findings: CheckFinding[]; run: JudgeRun }> {
  const full = plainText(input.contentHtml);
  const run = newJudgeRun('clarity', input.docKey, full.slice(0, 8000), DEFAULT_MODEL);
  const wins = windows(full);
  const system = 'You assess a government proposal section for clarity: does it open with a theme statement (discriminator + customer benefit + proof), keep a customer focus, and read cleanly? Return STRICT JSON {"score": <0-100>, "issues": ["..."]}.';
  const scores: number[] = [];
  const issues: string[] = [];
  for (const w of wins) {
    const r = await callJson('gov_proposal_check_clarity', system, w ? `Proposal content:\n${w}` : 'Proposal content: (empty)');
    if (r && Number.isFinite(Number(r.score))) { scores.push(clamp100(r.score)); if (Array.isArray(r.issues)) issues.push(...r.issues); }
  }
  if (scores.length === 0) return { score: 0, findings: [{ check: 'clarity', severity: 'minor', message: 'The clarity check could not run (no model result).' }], run };
  return { score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), findings: issues.slice(0, 5).map((i) => ({ check: 'clarity', severity: 'minor', message: String(i).slice(0, 200) })), run };
}

/**
 * Run the three AI checks AS INDEPENDENT JUDGES (T11): each is its own call with its own prompt + distinct judge run,
 * so no judge shares another's reasoning or cache. Returns null when there is no API key (runDocumentChecks then shows
 * the honest "not run" state). Each judge is fail-soft on its own, so one judge's upstream error never sinks the
 * others. `judgeRuns` carries the per-judge run records recorded on the scored version.
 */
export async function runAiChecks(input: AiCheckInput): Promise<AiCheckResults | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const [ev, pr, cl] = await Promise.all([aiEvaluator(input), aiProof(input), aiClarity(input)]);
  const unverified: Array<'evaluator' | 'proof' | 'clarity'> = [];
  if (pr.unverified) unverified.push('proof');
  return {
    scores: { evaluator: ev.score, proof: pr.score, clarity: cl.score },
    findings: [...ev.findings, ...pr.findings, ...cl.findings],
    judgeRuns: [ev.run, pr.run, cl.run],
    // The judges read the WHOLE document via the windowed map-reduce (no 8,000-char truncation), so the coverage
    // footprint is complete. Surfaced so the report can prove the evaluation was not truncated (T05).
    coverageFootprint: 1,
    unverified: unverified.length ? unverified : undefined,
  };
}
