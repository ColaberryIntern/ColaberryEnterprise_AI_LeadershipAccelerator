/**
 * finderJudge - does this business process really prove that need? ONE model call per shortlisted process.
 *
 * Keyword overlap finds candidates but cannot tell "a hiring pipeline module -> Data Talent Pipeline" from
 * "a utils folder -> AI Pilot" (both share two words). So, like the Gap Detector: retrieval shortlists, the model
 * judges, our code decides what is allowed through.
 *   - the model sees the process (repo, directory, file names, docs) and the candidate needs as opaque refs N1..Nn:
 *     the keyword matches first, then every other need, so a fit keywords missed can still be found;
 *     it may only pick one of those refs or none, with a fit 0-100 and one sentence why;
 *   - file names and docs are fenced as untrusted (a file called "ignore_instructions.md" is data);
 *   - FAIL SOFT: no key / error / bad JSON / unknown ref returns null and the keyword ranking stands;
 *   - the model never sees or writes a number we show as a delta; those stay deterministic.
 */
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { DEFAULT_MODEL } from '../../components/costEstimationService';
import { untrustedBlock } from '../govUntrustedText';
import type { Need, ProcessCandidate } from './finderTypes';
import { FINDER_PROMPT_VERSION } from './finderNarrative';

export const MIN_FIT = 75;
/** Keyword matches first, then every other need, up to this many candidates per call. */
export const MAX_JUDGE_CANDIDATES = 16;

export interface Judgment { needId: string | null; fit: number; why: string }

const SYSTEM = 'You review whether a module of software an AI and data consulting firm built would make a convincing '
  + 'case study for one of its services or capabilities. Judge the BUSINESS PROCESS the module performs (read the '
  + 'directory and file names), not shared buzzwords. Plumbing (utils, config, routes, auth, a generic web folder) is '
  + 'rarely a case study on its own. Be strict: most modules are NOT a convincing case study for any service; a module '
  + 'that only touches the topic, or would need a stretch to explain, scores under 70. Score 85+ only when a buyer of '
  + 'that service would see this exact work as proof. Pick the ONE candidate the work genuinely demonstrates, or null. '
  + 'Return strict JSON: {"ref": "N1".."Nn" or null, "fit": 0-100, "why": one plain sentence naming the process and the service}.';

export function judgePrompt(p: ProcessCandidate, candidates: readonly Need[]): { system: string; user: string; refs: Map<string, string> } {
  const refs = new Map<string, string>();
  const lines = candidates.map((n, i) => {
    const ref = `N${i + 1}`; refs.set(ref, n.id);
    return `${ref} | ${n.name} | ${n.kind === 'service' ? 'service' : 'capability needed by live proposals'}${n.description ? ` | ${n.description.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`;
  });
  const facts = JSON.stringify({
    repository: `${p.owner}/${p.repo}`, directory: p.root || '(whole repository)', codeFiles: p.codeFiles, testFiles: p.testFiles,
    files: p.samplePaths, docs: p.docPaths, keywords: p.keywords.slice(0, 20),
  });
  const { rule, block } = untrustedBlock(facts.slice(0, 6000));
  return { system: `${SYSTEM}\n${rule}`, user: `Candidates (our services and needs):\n${lines.join('\n')}\n\nModule:\n${block}`, refs };
}

export function parseJudgment(raw: unknown, refs: ReadonlyMap<string, string>): Judgment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const fit = Number(r.fit);
  if (!Number.isFinite(fit)) return null;
  const ref = typeof r.ref === 'string' ? r.ref.trim().toUpperCase() : null;
  if (ref && !refs.has(ref)) return null; // a ref we did not send: ignore the whole answer
  return { needId: ref ? (refs.get(ref) as string) : null, fit: Math.max(0, Math.min(100, Math.round(fit))), why: String(r.why ?? '').trim().slice(0, 300) };
}

export async function judgeFit(p: ProcessCandidate, candidates: readonly Need[]): Promise<Judgment | null> {
  if (!process.env.OPENAI_API_KEY || !candidates.length) return null;
  const { system, user, refs } = judgePrompt(p, candidates);
  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'case_study_finder', prompt_version: FINDER_PROMPT_VERSION }, { timeout: 30_000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0, max_tokens: 200, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    return parseJudgment(JSON.parse(res.choices?.[0]?.message?.content || 'null'), refs);
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'case_study_finder_judge_failed',
      outcome: 'failure', error_class: (err as Error)?.name ?? 'Error', context: { process: p.key, message: String((err as Error)?.message ?? err).slice(0, 200) } }));
    return null;
  }
}
