/**
 * judgeRuns — v3 §V2, T11. The independence rail for the three AI judges (evaluator, proof, clarity). Each judge is
 * its OWN call with its own prompt and no drafter reasoning; this module gives each a DISTINCT cache key (the judge
 * name is part of the key, so evaluator/proof/clarity can never return each other's cached result even on identical
 * content) and a stable per-judge run id that is recorded on the scored version (gov_proposal_document_versions.
 * judge_run_ids, from T-SCHEMA), so a reviewer can see each judge was run independently.
 *
 * PURE + total: same inputs ⇒ same keys/ids, so a re-judge of identical content is idempotent and table-testable.
 */
import crypto from 'crypto';

export const JUDGES = ['evaluator', 'proof', 'clarity'] as const;
export type JudgeName = (typeof JUDGES)[number];

export interface JudgeRun {
  judge: JudgeName;
  /** Stable id for this judge's evaluation of this exact content — distinct per judge (no cross-judge cache hit). */
  runId: string;
  model: string;
  at: string;
}

const sha = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/**
 * The cache key for one judge's call. The judge NAME is part of the key, so the evaluator/proof/clarity judges never
 * collide on identical content — that is the independence guarantee at the caching layer.
 */
export function judgeCacheKey(judge: JudgeName, docKey: string, content: string, model: string): string {
  return `judge:${judge}:${model}:${sha(`${docKey}\u0000${content}`).slice(0, 32)}`;
}

/** A judge-run record whose id derives from judge + content + model: distinct per judge, stable for identical inputs. */
export function newJudgeRun(judge: JudgeName, docKey: string, content: string, model: string, at?: string): JudgeRun {
  return { judge, runId: `jr:${judge}:${sha(`${docKey}\u0000${content}\u0000${model}`).slice(0, 24)}`, model, at: at ?? new Date().toISOString() };
}

/** The run ids to persist on the version's judge_run_ids column — one per judge, in the stable JUDGES order. */
export function judgeRunIds(runs: JudgeRun[] | null | undefined): string[] {
  const byJudge = new Map<JudgeName, string>();
  for (const r of Array.isArray(runs) ? runs : []) if (r && r.judge && r.runId && !byJudge.has(r.judge)) byJudge.set(r.judge, r.runId);
  return JUDGES.map((j) => byJudge.get(j)).filter((x): x is string => !!x);
}
