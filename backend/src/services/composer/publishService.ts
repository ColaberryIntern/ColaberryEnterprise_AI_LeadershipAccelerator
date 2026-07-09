/**
 * publishService — turns an approved Blueprint plan into REAL Timeline cards.
 * The Composer owns design; the Timeline owns delivery — so publishing is the
 * one bridge, and it goes exclusively through timelineAdminService.createCard
 * (no direct card writes here). Publishing is gated by the validation engine:
 * a plan that fails validation cannot publish.
 */
import CurriculumBlueprint from '../../models/CurriculumBlueprint';
import { createCard, CreateCardInput } from '../timeline/timelineAdminService';
import { assessPlan } from './blueprintService';
import { PlanCard, CurriculumPlan } from './types';
import { TimelineBucket } from '../../models/TimelineCard';

function toCardInput(c: PlanCard): CreateCardInput {
  return {
    type: c.type,
    title: c.title,
    subtitle: c.subtitle ?? null,
    description: c.description ?? null,
    week: c.week ?? null,
    bucket: c.bucket as TimelineBucket,
    difficulty: (['intro', 'core', 'stretch'].includes(c.difficulty) ? c.difficulty : 'core') as any,
    estimated_time: c.estimated_time,
    points: c.points,
    competencies: (c.competencies || []).map((domain_id) => ({ domain_id, weight: 1 })),
    visibility: 'published',
    video: c.video_url ? { url: c.video_url } : null,
  };
}

export interface PublishResult { published: boolean; created: number; card_ids: string[]; already?: boolean; quality: number }

/**
 * Publish the blueprint's generated plan to the global Timeline. Idempotent-ish:
 * if already published, returns the existing card ids unless `force` re-publishes
 * a fresh set (old cards are left in place for the author to prune — we never
 * silently delete published curriculum).
 */
export async function publishBlueprint(id: string, force = false): Promise<PublishResult> {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  const plan: CurriculumPlan | null = bp.generated_plan || null;
  if (!plan || !Array.isArray(plan.cards) || plan.cards.length === 0) {
    throw Object.assign(new Error('Nothing to publish — generate a curriculum first.'), { status: 400 });
  }

  const { validation } = assessPlan(bp, plan);
  if (!validation.publishable) {
    const failing = validation.checks.filter((c) => c.status === 'fail').map((c) => c.label);
    throw Object.assign(new Error(`Validation must pass before publishing. Failing: ${failing.join(', ')}`), { status: 400 });
  }

  const existing: string[] = Array.isArray(bp.published_card_ids) ? bp.published_card_ids : [];
  if (existing.length && !force) {
    return { published: true, created: 0, card_ids: existing, already: true, quality: validation.quality };
  }

  const cardIds: string[] = [];
  for (const c of plan.cards) {
    const card = await createCard(toCardInput(c));
    cardIds.push(card.id);
  }
  await bp.update({ published_card_ids: [...existing, ...cardIds], status: 'published' });
  return { published: true, created: cardIds.length, card_ids: cardIds, quality: validation.quality };
}
