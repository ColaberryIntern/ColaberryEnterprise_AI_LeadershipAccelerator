/**
 * evidenceEngine — the Composer optimizes for EVIDENCE, not activities. Given a
 * plan, it estimates the concrete proof a student will produce: GitHub repos /
 * commits / PRs, portfolio entries, labs, reflections, interviews, evaluations,
 * XP totals, competency coverage, and a normalized Architect-readiness
 * contribution. Pure + deterministic (no LLM) so the numbers are stable and
 * testable. Drives the Evidence panel + Curriculum DNA.
 */
import { resolve } from '../timeline/typeRegistry';
import { PlanCard } from './types';

export interface EvidenceEstimate {
  github: { repos: number; commits: number; branches: number; prs: number };
  portfolio: { entries: number; presentations: number; artifacts: number };
  counts: { labs: number; reflections: number; mock_interviews: number; evaluations: number; evidence_items: number };
  competencies: string[];
  xp: { learning: number; builder: number; community: number; total: number };
  architect_readiness: number;    // 0..1 contribution of this plan
  certification_coverage: number; // 0..1
  employment_value: 'low' | 'moderate' | 'high' | 'exceptional';
}

const CERT_TYPES = new Set(['prompt_lab', 'implementation_task', 'certification_exercise', 'evaluation', 'artifact_submission', 'mock_interview', 'project_task']);

/** PURE — estimate the evidence a plan will produce from registry metadata. */
export function estimateEvidence(cards: PlanCard[]): EvidenceEstimate {
  const gh = { repos: 0, commits: 0, branches: 0, prs: 0 };
  const pf = { entries: 0, presentations: 0, artifacts: 0 };
  const counts = { labs: 0, reflections: 0, mock_interviews: 0, evaluations: 0, evidence_items: 0 };
  const comps = new Set<string>();
  const xp = { learning: 0, builder: 0, community: 0, total: 0 };
  let readinessRaw = 0;

  for (const c of cards) {
    const def = resolve(c.type);
    xp.learning += c.points.learning || 0;
    xp.builder += c.points.builder || 0;
    xp.community += c.points.community || 0;
    (c.competencies || []).forEach((k) => comps.add(k));

    if (!def) continue;
    if (def.evidence_required) counts.evidence_items += 1;
    if (def.github_required) {
      gh.commits += def.difficulty === 'stretch' ? 5 : 3;
      gh.branches += 1;
      gh.prs += 1;
      if (['implementation_task', 'project_task', 'internship_activity'].includes(def.slug)) gh.repos += 1;
    }
    if (def.portfolio_eligible) pf.entries += 1;
    if (def.slug === 'artifact_submission') pf.artifacts += 1;
    if (def.slug === 'presentation' || def.slug === 'demo') pf.presentations += 1;
    if (def.render_band === 'promptlab') counts.labs += 1;
    if (def.slug === 'reflection' || def.slug === 'ai_video_feedback') counts.reflections += 1;
    if (def.slug === 'mock_interview') counts.mock_interviews += 1;
    if (def.slug === 'evaluation' || def.slug === 'certification_exercise') counts.evaluations += 1;

    // readiness: builder evidence + graded work moves the needle most.
    readinessRaw += (def.builder_xp || 0) * (def.evidence_required ? 1.2 : 0.6) + (def.ai_evaluation ? 15 : 0) + (def.github_required ? 20 : 0);
  }
  xp.total = xp.learning + xp.builder + xp.community;

  const certHits = cards.filter((c) => CERT_TYPES.has(c.type)).length;
  const certification_coverage = clamp01(certHits / 5);          // ~5 cert-relevant activities = full week coverage
  const architect_readiness = clamp01(readinessRaw / 400);        // 400 raw ≈ a strong build week
  const evScore = counts.evidence_items + gh.commits + pf.entries;
  const employment_value = evScore >= 14 ? 'exceptional' : evScore >= 9 ? 'high' : evScore >= 4 ? 'moderate' : 'low';

  return { github: gh, portfolio: pf, counts, competencies: Array.from(comps).sort(), xp, architect_readiness: round2(architect_readiness), certification_coverage: round2(certification_coverage), employment_value };
}

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
function round2(n: number): number { return Math.round(n * 100) / 100; }
