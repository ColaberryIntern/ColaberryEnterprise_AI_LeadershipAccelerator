/**
 * finderMatch - pair processes with needs, and keep what an existing case study already covers out. PURE.
 *
 * COVERAGE runs first, because the build-case-study skill treats an overlap as a HARD STOP. Two strengths:
 *   EXCLUDED (certain)   a case study scoped to this code (same repo, a scope prefix at or inside this directory, or a
 *                        specific parent directory); a case study bound to a whole connected repo; a case study whose
 *                        title/slug/capability carries every word of a two-or-more-word process name.
 *   WARNED (possible)    a broad scope above this directory (e.g. all of backend/src/services, which every platform
 *                        case study about the whole product has), or a one-word name appearing in a title. Shown on the
 *                        proposal, never hidden: one word in a title ("Reporting" in "Scam Reporting Tool") is not proof.
 * The build step re-runs the skill's full preflight anyway, so a warning is checked again before anything is created.
 *
 * MATCH is the share of the process's own (weighted) words that the need also uses: a focused module whose words are
 * mostly the need's words scores high. Weights are rarity across ALL processes in the run (IDF): a word in many
 * modules ("capability", "report", "check") says little about any one. Keywords only SHORTLIST; finderJudge decides.
 */
import type { ExcludedProcess, Need, ProcessCandidate } from './finderTypes';
import { tokenSet, tokens } from './finderText';

export const MIN_SHARED = 2;
export const MIN_MATCH = 10;
/** A scope prefix with at most this many path segments is "broad" (backend/src/services = 3). */
export const BROAD_SCOPE_SEGMENTS = 3;
/** A word in more than this share of processes carries no weight at all (judged only from MIN_POPULATION processes up). */
export const COMMON_WORD_SHARE = 0.15;
export const MIN_POPULATION = 20;

export interface CaseStudyRef { id: string; title: string; slug: string | null; status: string; capability: string | null }
export interface CaseStudyRepoScope { caseStudyId: string; owner: string; repo: string; pathScope: string[] }
export interface Coverage { excluded: ExcludedProcess | null; warnings: ExcludedProcess[] }

const norm = (p: string): string => p.toLowerCase().replace(/^\/+|\/+$/g, '');
const segments = (p: string): number => (p ? p.split('/').length : 0);

export function coverageOf(
  p: ProcessCandidate, caseStudies: readonly CaseStudyRef[], scopes: readonly CaseStudyRepoScope[],
): Coverage {
  const byId = new Map(caseStudies.map((c) => [c.id, c]));
  const root = norm(p.root);
  const warnings: ExcludedProcess[] = [];
  const ref = (cs: CaseStudyRef): ExcludedProcess['caseStudy'] => ({ id: cs.id, title: cs.title, status: cs.status });
  for (const s of scopes) {
    if (s.owner.toLowerCase() !== p.owner.toLowerCase() || s.repo.toLowerCase() !== p.repo.toLowerCase()) continue;
    const cs = byId.get(s.caseStudyId);
    if (!cs) continue;
    const scoped = s.pathScope.map(norm).filter(Boolean);
    if (!scoped.length) {
      if (p.source !== 'platform') return { excluded: { key: p.key, name: p.name, reason: 'Its repository is already a case study', caseStudy: ref(cs) }, warnings };
      continue; // an unscoped case study on the platform repo is about the platform, not about every module in it
    }
    if (scoped.some((x) => x === root || x.startsWith(`${root}/`) || !root)) {
      return { excluded: { key: p.key, name: p.name, reason: 'An existing case study is scoped to this code', caseStudy: ref(cs) }, warnings };
    }
    const parent = scoped.find((x) => root.startsWith(`${x}/`));
    if (parent && segments(parent) > BROAD_SCOPE_SEGMENTS) {
      return { excluded: { key: p.key, name: p.name, reason: `An existing case study is scoped to ${parent}, which contains this code`, caseStudy: ref(cs) }, warnings };
    }
    if (parent) warnings.push({ key: p.key, name: p.name, reason: `A broad case study includes ${parent}; check it does not tell this story already`, caseStudy: ref(cs) });
  }
  const nameWords = tokens(p.root.split('/').pop() || p.repo);
  for (const cs of caseStudies) {
    if (!nameWords.length) break;
    if (nameWords.length >= 2) {
      const words = tokenSet(cs.title, cs.slug, cs.capability);
      if (nameWords.every((w) => words.has(w))) {
        return { excluded: { key: p.key, name: p.name, reason: `An existing case study is about "${nameWords.join(' ')}"`, caseStudy: ref(cs) }, warnings };
      }
    } else if (new Set(tokens(cs.title)).has(nameWords[0])) {
      warnings.push({ key: p.key, name: p.name, reason: `"${nameWords[0]}" appears in an existing case study title`, caseStudy: ref(cs) });
    }
  }
  return { excluded: null, warnings: warnings.slice(0, 5) };
}

/** Rarity weight per word, from the processes found in this run. A word in over COMMON_WORD_SHARE of them weighs 0. */
export function wordWeights(processes: readonly ProcessCandidate[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const p of processes) for (const k of new Set(p.keywords)) df.set(k, (df.get(k) ?? 0) + 1);
  const n = Math.max(1, processes.length);
  const w = new Map<string, number>();
  for (const [k, d] of df) w.set(k, n >= MIN_POPULATION && d / n > COMMON_WORD_SHARE ? 0 : Math.log(1 + n / d));
  return w;
}

export interface Match { need: Need; match: number; shared: string[] }

export function matchNeeds(p: ProcessCandidate, needs: readonly Need[], weights: ReadonlyMap<string, number> = new Map()): Match[] {
  const unseen = Math.log(1 + Math.max(2, weights.size)); // a need word no process uses: rare by definition
  const wt = (t: string): number => (weights.has(t) ? (weights.get(t) as number) : unseen);
  const ps = new Set(p.keywords.filter((k) => wt(k) > 0));
  const pNorm = Math.sqrt([...ps].reduce((a, k) => a + wt(k) ** 2, 0));
  const out: Match[] = [];
  for (const n of needs) {
    const nt = [...new Set(n.tokens)].filter((t) => wt(t) > 0);
    const shared = nt.filter((t) => ps.has(t));
    if (shared.length < MIN_SHARED || !pNorm) continue;
    const match = Math.round((100 * shared.reduce((a, k) => a + wt(k) ** 2, 0)) / (pNorm * pNorm));
    if (match >= MIN_MATCH) out.push({ need: n, match, shared });
  }
  return out.sort((a, b) => b.match - a.match);
}

/** How strong the process is as evidence material: tests and docs make a case study verifiable. */
export function materialScore(p: ProcessCandidate, commitCount = 0): number {
  return Math.min(15, p.testFiles * 2) + Math.min(5, p.docPaths.length * 2) + Math.min(10, commitCount) + Math.min(10, Math.floor(p.codeFiles / 3));
}

/** Overall rank: fit counts as much as need (a strong need with a weak fit is a bad case study), then material. */
export function rankScore(m: Match, p: ProcessCandidate): number {
  return m.need.needScore + m.match + materialScore(p);
}
