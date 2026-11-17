/**
 * finderAssemble - processes x needs -> ranked proposals. PURE (the I/O lives in finderRun).
 *
 *   1. coverage first: a process an existing case study covers is EXCLUDED and listed with that case study;
 *   2. each remaining process is paired with its best need (need weight + fit + how much there is to show);
 *   3. diversity: at most MAX_PER_NEED proposals per service or capability, so one thin service cannot fill the list;
 *   4. that SHORTLIST goes to finderJudge (in finderRun); its answers re-rank it, and the top MAX_PROPOSALS are kept,
 *      at most MAX_PER_NEED per need; commits and the narrative are added afterwards, for those only.
 */
import { createHash } from 'crypto';
import type { ExcludedProcess, FinderProposal, Need, ProcessCandidate } from './finderTypes';
import { coverageOf, materialScore, matchNeeds, rankScore, wordWeights, type CaseStudyRef, type CaseStudyRepoScope, type Match } from './finderMatch';
import { profileDelta } from './finderDelta';
import { factsNarrative } from './finderNarrative';

export const MAX_PROPOSALS = 8;
export const MAX_PER_NEED = 2;
/** How many processes go to the judge, and how many per need, so one thin service cannot take the whole shortlist. */
export const MAX_SHORTLIST = 24;
export const MAX_SHORTLIST_PER_NEED = 4;
export const CANDIDATES_PER_PROCESS = 4;
export const MAX_SCOPE = 40;

export interface Ranked {
  process: ProcessCandidate; best: Match; alternatives: Match[]; score: number; warnings: ExcludedProcess[];
  fit: { score: number; source: 'ai' | 'keywords'; why: string | null };
}

export function proposalId(processKey: string, needId: string): string {
  return createHash('sha1').update(`${processKey}|${needId}`).digest('hex').slice(0, 16);
}

export function pathScopeFor(p: ProcessCandidate): string[] {
  if (!p.root) return [];
  return [...new Set([p.root, ...p.docPaths].map((x) => x.toLowerCase()))].slice(0, MAX_SCOPE);
}

export function buildCommandFor(p: ProcessCandidate, needName: string, title: string, scope: string[]): string {
  const q = (s: string): string => `"${s.replace(/"/g, "'")}"`;
  return `/build-case-study repo=${p.owner}/${p.repo}${scope.length ? ` scope=${scope.join(',')}` : ''} service=${q(needName)} title=${q(title)}`;
}

export function rankProcesses(
  processes: readonly ProcessCandidate[], needs: readonly Need[],
  caseStudies: readonly CaseStudyRef[], scopes: readonly CaseStudyRepoScope[],
): { ranked: Ranked[]; excluded: ExcludedProcess[] } {
  const excluded: ExcludedProcess[] = [];
  const ranked: Ranked[] = [];
  const weights = wordWeights(processes);
  for (const p of processes) {
    const cover = coverageOf(p, caseStudies, scopes);
    if (cover.excluded) { excluded.push(cover.excluded); continue; }
    const matches = matchNeeds(p, needs, weights).filter((m) => m.need.needScore > 0);
    if (!matches.length) continue;
    const scored = matches.map((m) => ({ m, s: rankScore(m, p) })).sort((a, b) => b.s - a.s);
    ranked.push({
      process: p, best: scored[0].m, alternatives: scored.slice(1, CANDIDATES_PER_PROCESS).map((x) => x.m), score: scored[0].s,
      warnings: cover.warnings, fit: { score: scored[0].m.match, source: 'keywords', why: null },
    });
  }
  return { ranked: capPerNeed(ranked, MAX_SHORTLIST_PER_NEED, MAX_SHORTLIST), excluded };
}

/** The candidates the judge sees: this process's keyword matches first, then every other need with a need. */
export function judgeCandidates(r: Ranked, needs: readonly Need[], max: number): Need[] {
  const first = [r.best, ...r.alternatives].map((m) => m.need);
  const ids = new Set(first.map((n) => n.id));
  return [...first, ...needs.filter((n) => n.needScore > 0 && !ids.has(n.id))].slice(0, max);
}

/** Best first, at most `perNeed` for any one need, at most `max` in all. */
export function capPerNeed(ranked: readonly Ranked[], perNeed: number, max: number): Ranked[] {
  const sorted = [...ranked].sort((a, b) => b.score - a.score || a.process.key.localeCompare(b.process.key));
  const seen = new Map<string, number>();
  const out: Ranked[] = [];
  for (const r of sorted) {
    const n = seen.get(r.best.need.id) ?? 0;
    if (n >= perNeed) continue;
    seen.set(r.best.need.id, n + 1);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Apply the judge's answer: the need it picked (only one we offered), its fit, re-scored. A rejection (no need, or a
 * fit under minFit) drops the process; no answer at all (model unavailable) keeps the keyword ranking.
 */
export function applyJudgment(
  r: Ranked, j: { needId: string | null; fit: number; why: string } | null, minFit: number, offered: readonly Need[] = [],
): Ranked | null {
  if (!j) return r;
  if (!j.needId || j.fit < minFit) return null;
  const all = [r.best, ...r.alternatives];
  const extra = offered.find((n) => n.id === j.needId);
  const best = all.find((m) => m.need.id === j.needId) ?? (extra ? { need: extra, match: 0, shared: [] } : undefined);
  if (!best) return null;
  return {
    ...r, best, alternatives: all.filter((m) => m !== best),
    fit: { score: j.fit, source: 'ai', why: j.why || null },
    score: best.need.needScore + j.fit + materialScore(r.process),
  };
}

/** A proposal with the facts narrative; finderRun swaps in commits and the AI narrative when it has them. */
export function toProposal(r: Ranked, rank: number, currentYear: number): FinderProposal {
  const need = r.best.need;
  const delta = profileDelta(need, currentYear);
  const commits = { count: 0, first: null, last: null, recent: [] };
  const narrative = factsNarrative({ process: r.process, need, delta, commits });
  const pathScope = pathScopeFor(r.process);
  return {
    id: proposalId(r.process.key, need.id), rank, process: r.process,
    need: { kind: need.kind, id: need.id, name: need.name, status: need.status, reasons: need.reasons, needScore: need.needScore },
    alternatives: r.alternatives.map((a) => ({ kind: a.need.kind, id: a.need.id, name: a.need.name, match: a.match })),
    match: r.best.match, sharedTerms: r.best.shared, fit: r.fit, possibleOverlaps: r.warnings, delta, commits, narrative, pathScope,
    buildCommand: buildCommandFor(r.process, need.name, narrative.title, pathScope),
  };
}
