/**
 * optimizationEngine — the AI Curriculum Architect's recommendations. Turns
 * validation gaps + evidence shortfalls into ranked, explained, one-click-
 * applicable actions, each answering "does this improve the student's journey to
 * Architect?". Deterministic core (the LLM layer can add nuance later); every
 * recommendation carries a machine-applicable `patch` the UI can apply.
 */
import { PlanCard } from './types';
import { ValidationResult, BlueprintLike } from './validationEngine';
import { estimateEvidence } from './evidenceEngine';
import { checkDependencies } from './dependencyEngine';
import { coverageGaps } from './coverageGapEngine';

export interface Recommendation {
  rank: number;
  area: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  why: string;
  /** Machine-applicable action the UI applies WITHOUT an LLM regen.
   *  `add_videos` → curate short videos for `competencies` (the gap ids). */
  patch: { op: 'add' | 'insert_before' | 'remove' | 'reorder' | 'add_videos'; type?: string; before?: string; target?: string; competencies?: string[] };
}

const SEV_WEIGHT = { high: 3, medium: 2, low: 1 };

/** PURE — ranked recommendations from the validated plan. */
export function recommend(cards: PlanCard[], blueprint: BlueprintLike, validation: ValidationResult): Recommendation[] {
  const recs: Recommendation[] = [];
  const ev = estimateEvidence(cards);
  const dep = checkDependencies(cards);
  const has = (t: string) => cards.some((c) => c.type === t);

  // 1. dependency repairs — highest priority (blocks publish)
  for (const issue of dep.issues) {
    for (const miss of issue.missing) {
      recs.push({ area: 'dependency', severity: 'high', rank: 0,
        title: `Add ${label(miss)} before ${label(issue.type)}`,
        why: `${label(issue.type)} assumes students already did ${label(miss)}; without it the activity has no scaffold.`,
        patch: { op: 'insert_before', type: miss, before: issue.type } });
    }
  }

  // 2. evidence / github / portfolio shortfalls
  if (ev.github.commits === 0) recs.push({ area: 'github', severity: 'high', rank: 0,
    title: 'Add a GitHub-backed build', why: 'No GitHub evidence this span — architects are hired on their commit history. A Implementation Task or GitHub Sync produces real, reviewable proof.',
    patch: { op: 'add', type: 'implementation_task' } });
  if (ev.portfolio.entries === 0) recs.push({ area: 'portfolio', severity: 'medium', rank: 0,
    title: 'Add a portfolio artifact', why: 'Nothing here grows the student portfolio; an Artifact Submission converts the work into a shareable asset.',
    patch: { op: 'add', type: 'artifact_submission' } });

  // 3. cognitive load / reflection balance
  const reflections = cards.filter((c) => c.type === 'reflection' || c.type === 'ai_video_feedback').length;
  const builds = cards.filter((c) => (c.points.builder || 0) >= 40).length;
  if (builds >= 3 && reflections < 2) recs.push({ area: 'cognitive_load', severity: 'medium', rank: 0,
    title: 'Add another Reflection', why: `${builds} build-heavy activities with only ${reflections} reflection — a second reflection consolidates learning and lowers cognitive load.`,
    patch: { op: 'add', type: 'reflection' } });

  // 4. difficulty curve
  if (validation.difficulty_mix.intro === 0) recs.push({ area: 'difficulty', severity: 'low', rank: 0,
    title: 'Add an intro warmup', why: 'The span opens at core/stretch difficulty; a warmup eases students in and improves completion.',
    patch: { op: 'add', type: 'warmup' } });

  // 5. certification readiness
  if (ev.certification_coverage < 0.5 && !has('certification_exercise')) recs.push({ area: 'certification', severity: 'low', rank: 0,
    title: 'Add a Certification Exercise', why: 'Certification readiness is below target; a graded certification exercise directly advances it.',
    patch: { op: 'add', type: 'certification_exercise' } });

  // 6. competency gaps vs blueprint — the specific competencies taught by no card
  //    AND no live/Academy session. Offer to fill them with curated short videos.
  const gaps = coverageGaps(blueprint, cards);
  if (gaps.length) {
    const shown = gaps.slice(0, 4).map((g) => g.label).join(', ');
    const more = gaps.length > 4 ? `, +${gaps.length - 4} more` : '';
    recs.push({ area: 'coverage', severity: 'medium', rank: 0,
      title: `Fill ${gaps.length} coverage gap${gaps.length > 1 ? 's' : ''} with short videos`,
      why: `${shown}${more} ${gaps.length > 1 ? 'are' : 'is'} taught by no card or session. Curate 3–10 min videos to cover ${gaps.length > 1 ? 'them' : 'it'} within your video-time budget.`,
      patch: { op: 'add_videos', competencies: gaps.map((g) => g.competency) } });
  }

  return recs
    .sort((a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity])
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function label(slug: string): string {
  return slug.split('_').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}
