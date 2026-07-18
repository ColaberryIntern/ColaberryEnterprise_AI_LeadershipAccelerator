/**
 * progressionService — the orchestrator that runs when a card is completed.
 * Routes the completion to the right engine (Learning vs Evidence), records
 * community XP where relevant, recomputes competency, then re-evaluates the
 * promotion gate. Also composes the student progression summary the feed shows.
 *
 * The three engines stay independent (learningEngine / evidenceEngine /
 * competencyEngine); this module only sequences them.
 */
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import XpEvent from '../../models/XpEvent';
import StudentLevel from '../../models/StudentLevel';
import { EvidenceSource } from '../../models/EvidenceRecord';
import { resolve as resolveType } from '../timeline/typeRegistry';
import { getTypeXp } from './pointsConfigService';
import { awardLearningXp } from './learningEngine';
import { recordCardEvidence } from './evidenceEngine';
import { recomputeForEnrollment, getStudentCompetency } from './competencyEngine';
import { evaluateForEnrollment, PromotionOutcome } from './promotionService';
import { aggregateXp, XpTotals } from './scoring';

const EVIDENCE_SOURCE_BY_TYPE: Record<string, EvidenceSource> = {
  prompt_lab: 'prompt_lab',
  prompt_challenge: 'prompt_lab',
  implementation_task: 'implementation',
  project_task: 'implementation',
  internship_activity: 'implementation',
  artifact_submission: 'artifact',
  github_sync: 'github_commit',
  evaluation: 'instructor_review',
  certification_exercise: 'instructor_review',
  mock_interview: 'deliverable',
  presentation: 'deliverable',
  demo: 'deliverable',
  build_story: 'deliverable',
  ai_video_feedback: 'deliverable',
};

async function awardCommunityXp(enrollmentId: string, card: { id: string; type: string }, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const key = `community:${enrollmentId}:${card.id}`;
  await XpEvent.findOrCreate({
    where: { idempotency_key: key },
    defaults: { enrollment_id: enrollmentId, stream: 'community', card_id: card.id, amount, reason: `community:${card.type}`, idempotency_key: key },
  });
  return amount;
}

export interface CardCompletionOutcome {
  card_id: string;
  learning_xp: number;
  builder_xp: number;
  community_xp: number;
  promotion: PromotionOutcome;
}

/**
 * Mark a card completed for a student and run the progression pipeline.
 * Idempotent end-to-end: XP/evidence are keyed, competency is a full
 * recompute, and progress upserts to 'completed'.
 */
export async function onCardCompleted(enrollmentId: string, cardId: string): Promise<CardCompletionOutcome> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card) throw new Error(`card ${cardId} not found`);

  // Gating: a card whose prerequisites are unmet can't be force-completed by a
  // direct API call. Single choke point — covers the classroom + runtime complete
  // paths. Already-engaged cards never re-gate; fail-open on error.
  // Throws { status: 423, code: 'card_locked' } when locked.
  const { assertCardUnlocked } = await import('../timeline/timelineGatingService');
  await assertCardUnlocked(enrollmentId, card);

  // Watch gate: video-bearing cards (video/testimonial/podcast) require the
  // configured share actually watched (default 75%) BEFORE completion + XP.
  // Single choke point — covers the classroom drawer, Today, and the runtime.
  // Throws { status: 422, code: 'watch_requirement' } when below threshold.
  const { assertWatchRequirement } = await import('../runtime/watchProgressService');
  await assertWatchRequirement(enrollmentId, card);

  // Mark progress complete (idempotent).
  const [progress] = await TimelineCardProgress.findOrCreate({
    where: { card_id: cardId, enrollment_id: enrollmentId },
    defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'completed', completed_at: new Date() },
  });
  if (progress.status !== 'completed') {
    await progress.update({ status: 'completed', completed_at: new Date() });
  }

  const def = resolveType(card.type);
  let learning_xp = 0;
  let builder_xp = 0;

  if (def?.evidence_required) {
    const source = EVIDENCE_SOURCE_BY_TYPE[card.type] || 'deliverable';
    const ev = await recordCardEvidence(enrollmentId, { id: card.id, type: card.type, competencies: card.competencies }, source);
    builder_xp = ev.builder_xp;
  } else {
    learning_xp = await awardLearningXp(enrollmentId, { id: card.id, type: card.type });
  }

  const community_xp = await awardCommunityXp(enrollmentId, { id: card.id, type: card.type }, (await getTypeXp(card.type)).community);

  await recomputeForEnrollment(enrollmentId);
  const promotion = await evaluateForEnrollment(enrollmentId);

  return { card_id: cardId, learning_xp, builder_xp, community_xp, promotion };
}

export interface ProgressionSummary {
  xp: XpTotals;
  competencies: Array<{ domain_id: string; confidence: number; evidence_count: number }>;
  level: { slug: string; rank: number; readiness: number };
}

export async function getProgressionSummary(enrollmentId: string): Promise<ProgressionSummary> {
  const events = await XpEvent.findAll({ where: { enrollment_id: enrollmentId } });
  const xp = aggregateXp(events.map((e) => ({ stream: e.stream, amount: e.amount })));

  const comps = await getStudentCompetency(enrollmentId);
  const [level] = await StudentLevel.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: { enrollment_id: enrollmentId, level_slug: 'builder', rank: 0 },
  });

  return {
    xp,
    competencies: comps.map((c) => ({ domain_id: c.domain_id, confidence: c.confidence, evidence_count: c.evidence_count })),
    level: { slug: level.level_slug, rank: level.rank, readiness: level.architect_readiness },
  };
}
