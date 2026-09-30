import { buildCaseStudyFoundation, summarise, type CaseStudyFoundation, type CaseStudyFoundationSummary } from './caseStudyFoundation';
import { loadBuildProgress } from './buildProgressSnapshot';
import { loadIntakeTruthAtRevision } from './intakeTruthStore';
import { getPublishedPlan } from './planStore';
import { listStoryEnrichments } from './storyEnrichmentLedger';
import type { BuildPlan } from './planContract';

/**
 * caseStudyFoundationLoader - gather what the pure foundation needs, from the
 * four places it lives. I/O.
 *
 * Reads, never writes. Four reads: the truth at its revision, the published
 * plan, the enrichment ledger, and the story progress (for the verified
 * count). Null when the project has no truth at all: a project that never
 * ran an intake has no hypothesis to found anything on, and the caller says
 * so rather than rendering an empty ladder.
 *
 * `loadForGate` is the narrow form the publish gate uses: two numbers, one
 * import, no plan read.
 */

export async function loadCaseStudyFoundation(projectId: string): Promise<CaseStudyFoundation | null> {
  const stored = await loadIntakeTruthAtRevision(projectId);
  if (!stored) return null;

  const [plan, enrichments, progress] = await Promise.all([
    getPublishedPlan(projectId).catch(() => null),
    listStoryEnrichments(projectId),
    loadBuildProgress(projectId),
  ]);

  const verifiedStories = progress.progress.filter((p) => Boolean(p.verified_at)).length;
  const planShape = plan?.plan ? (plan.plan as BuildPlan) : null;

  return buildCaseStudyFoundation({
    items: stored.items,
    truthRevision: stored.revision,
    plan: planShape ? { descriptor: planShape.descriptor, requirements: planShape.requirements } : null,
    enrichments,
    verifiedStories,
  });
}

/**
 * For the publish gate. Null when the project has no truth, which the gate
 * treats as "no foundation to judge": the rule is a no-op and the other
 * rules decide, exactly as they did before this existed.
 */
export async function loadCaseStudyFoundationForGate(projectId: string): Promise<CaseStudyFoundationSummary | null> {
  const stored = await loadIntakeTruthAtRevision(projectId);
  if (!stored) return null;
  const [enrichments, progress] = await Promise.all([
    listStoryEnrichments(projectId),
    loadBuildProgress(projectId),
  ]);
  return summarise(buildCaseStudyFoundation({
    items: stored.items,
    truthRevision: stored.revision,
    plan: null,
    enrichments,
    verifiedStories: progress.progress.filter((p) => Boolean(p.verified_at)).length,
  }));
}
