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
import { approvedSlugs } from './composerAi';
import { recomputeBlueprintHours } from './blueprintRollup';
import { PlanCard, CurriculumPlan } from './types';
import TimelineCard, { TimelineBucket } from '../../models/TimelineCard';
import { weekBlueprint, CANONICAL_PROGRAM_ID } from '../../data/weekBlueprints';

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

  // Approval gate: only approved activities may reach the Timeline.
  const approved = await approvedSlugs();
  const unapproved = Array.from(new Set(plan.cards.map((c) => c.type))).filter((t) => !approved.has(t));
  if (unapproved.length) {
    throw Object.assign(new Error(`Not approved for curriculum: ${unapproved.join(', ')}. Approve these activities in Experience Studio first.`), { status: 400 });
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

  // The Anthropic Skilljar course is "outside work" — its card carries the real
  // course duration (from data/weekBlueprints), not the generic type default.
  const courseMinutes =
    bp.program_id === CANONICAL_PROGRAM_ID && bp.week != null
      ? weekBlueprint(bp.week)?.anthropic_course_minutes ?? null
      : null;

  const cardIds: string[] = [];
  for (const c of plan.cards) {
    const input = toCardInput(c);
    if (c.type === 'anthropic_skills_jar' && courseMinutes != null) {
      input.estimated_time = courseMinutes;
    }
    const card = await createCard(input);
    cardIds.push(card.id);
  }
  await bp.update({ published_card_ids: [...existing, ...cardIds], status: 'published' });
  // estimated_hours becomes the live sum of the week's cards.
  await recomputeBlueprintHours(bp.program_id, bp.week);
  return { published: true, created: cardIds.length, card_ids: cardIds, quality: validation.quality };
}

/**
 * ADD-ONLY publish of the plan's video cards to the live Timeline. Unlike
 * publishBlueprint(force) — which re-creates the WHOLE plan and would duplicate
 * existing curriculum — this creates ONLY the `video` cards that aren't already
 * published for the week (de-duped by title), scoped to the blueprint's program.
 * Idempotent: re-running creates nothing new. Used to push curated gap-fill /
 * topic-pack videos live without touching the rest of the week.
 */
export async function publishNewVideoCards(id: string): Promise<{ created: number; skipped: number; card_ids: string[] }> {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  const plan: CurriculumPlan | null = bp.generated_plan || null;
  const videoCards = (plan?.cards || []).filter((c) => c.type === 'video' && c.video_url);
  if (!videoCards.length) return { created: 0, skipped: 0, card_ids: [] };

  const existing = await TimelineCard.findAll({ where: { week: bp.week, type: 'video', visibility: 'published' } });
  const existingTitles = new Set(existing.map((c: any) => String(c.title || '').trim()));

  const created: string[] = [];
  let skipped = 0;
  for (const c of videoCards) {
    const title = String(c.title).trim();
    if (existingTitles.has(title)) { skipped++; continue; }
    const card = await createCard({ ...toCardInput(c), program_id: bp.program_id });
    created.push(card.id);
    existingTitles.add(title);
  }
  if (created.length) {
    const prev: string[] = Array.isArray(bp.published_card_ids) ? bp.published_card_ids : [];
    await bp.update({ published_card_ids: [...prev, ...created] });
    await recomputeBlueprintHours(bp.program_id, bp.week);
  }
  return { created: created.length, skipped, card_ids: created };
}
