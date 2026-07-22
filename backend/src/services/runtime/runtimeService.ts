/**
 * runtimeService — the Learning Runtime orchestrator. Opens a published Timeline
 * card for a student, and on completion runs the whole loop with NO admin work:
 * existing progression (competency + architect readiness) -> auto portfolio
 * artifact -> recomputed Employment + Certification readiness + Architect
 * Journey. The Runtime only CONSUMES the frozen Timeline/Composer/progression.
 */
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import PortfolioArtifact from '../../models/PortfolioArtifact';
import { resolve as resolveType } from '../timeline/typeRegistry';
import { onCardCompleted, getProgressionSummary } from '../progression/progressionService';
import { estimateEvidence } from '../composer/evidenceEngine';
import { journeyContribution } from '../composer/architectJourney';
import { computeEmploymentReadiness } from './employmentReadiness';
import { computeCertificationReadiness } from './certificationReadiness';
import { StudentSignals } from './readinessTypes';
import { generateArtifact, listArtifacts } from './portfolioService';
import { videoFromMetadata, contentFromMetadata, blogFromMetadata, courseFromMetadata } from '../timeline/timelineService';
import { selectTestimonialForEnrollment } from '../timeline/networkVideoService';
import { selectPodcastForEnrollment } from '../timeline/podcastMediaService';
import { selectBlogForEnrollment } from '../timeline/blogMediaService';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { ritualStudentLabel } from './communityRituals';

/** Build the student's signal vector from progression + completed evidence + portfolio. */
export async function studentSignals(enrollmentId: string): Promise<StudentSignals> {
  const summary = await getProgressionSummary(enrollmentId);
  const progs = await TimelineCardProgress.findAll({ where: { enrollment_id: enrollmentId, status: 'completed' } });
  const cards = progs.length ? await TimelineCard.findAll({ where: { id: progs.map((p) => p.card_id) } }) : [];
  const planCards = cards.map((c) => ({ type: c.type, points: c.points || { learning: 0, builder: 0, community: 0 }, competencies: Array.isArray(c.competencies) ? c.competencies.map((x: any) => x.domain_id || x) : [] }));
  const ev = estimateEvidence(planCards as any);
  const artifactCount = await PortfolioArtifact.count({ where: { enrollment_id: enrollmentId } });
  return {
    competencies: summary.competencies,
    github: ev.github,
    portfolio: { entries: Math.max(ev.portfolio.entries, artifactCount), artifacts: Math.max(ev.portfolio.artifacts, artifactCount) },
    xp: { learning: summary.xp.learning, builder: summary.xp.builder, community: summary.xp.community },
  };
}

/** The full readiness snapshot the Runtime renders (bottom panel + journey). */
export async function readinessSummary(enrollmentId: string) {
  const signals = await studentSignals(enrollmentId);
  const progression = await getProgressionSummary(enrollmentId);
  const journeyCards = signals.competencies.filter((c) => c.confidence >= 0.25).map((c) => ({ type: 'announcement', competencies: [c.domain_id] }));
  return {
    progression,
    employment: computeEmploymentReadiness(signals),
    certification: computeCertificationReadiness(signals),
    journey: journeyContribution(journeyCards as any),
    evidence: { github: signals.github, portfolio: signals.portfolio },
    portfolio: await listArtifacts(enrollmentId),
  };
}

/** Minimal card context for the mentor / prompt-lab / augment services. */
export async function cardContext(cardId: string) {
  const c = await TimelineCard.findByPk(cardId);
  if (!c) throw Object.assign(new Error('Card not found'), { status: 404 });
  const def = resolveType(c.type);
  return { id: c.id, type: c.type, title: c.title, description: c.description, student_label: def?.student_label || c.type, metadata: c.metadata, program_id: (c as any).program_id ?? null, week: c.week ?? null };
}

/** Open a published card for the runtime (card + the student's progress + video +
 *  the saved lesson content + the type's picture, so the workspace opens WITH the
 *  lesson the student saw on the card and its hero image). */
export async function openCard(enrollmentId: string, cardId: string, opts: { readOnly?: boolean } = {}) {
  const card = await TimelineCard.findByPk(cardId);
  if (!card || card.visibility !== 'published') throw Object.assign(new Error('Card not available'), { status: 404 });
  // Gating: a locked card (unmet prerequisites) can't be opened by direct URL.
  // Throws { status: 423, code: 'card_locked' }; fail-open on error.
  const { assertCardUnlocked } = await import('../timeline/timelineGatingService');
  await assertCardUnlocked(enrollmentId, card);
  const def = resolveType(card.type);
  // The type's Studio thumbnail lives on the DB definition (not the code registry).
  const dbDef = await CurriculumTypeDefinition.findOne({ where: { slug: card.type }, attributes: ['thumbnail_url'] });
  // Read-only "view as": read the existing progress row but never create one
  // (creating would mark the member as having started this card).
  const progress = opts.readOnly
    ? await TimelineCardProgress.findOne({ where: { card_id: cardId, enrollment_id: enrollmentId } })
    : (await TimelineCardProgress.findOrCreate({
        where: { card_id: cardId, enrollment_id: enrollmentId },
        defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'available' },
      }))[0];

  // Per-student media resolution — the SAME picks the feed shows (stable per
  // (enrollment, card) assignments make these idempotent). Without this a
  // random testimonial/podcast/blog card opens in the workspace with no media,
  // which would also dead-end the watch gate.
  let title = card.title;
  let description = card.description;
  let video = videoFromMetadata(card.metadata);
  let blog = blogFromMetadata(card.metadata);
  if (!video && (card.type === 'testimonial' || card.type === 'podcast')) {
    const picked = card.type === 'testimonial'
      ? await selectTestimonialForEnrollment(enrollmentId, card)
      : await selectPodcastForEnrollment(enrollmentId, card);
    if (picked) {
      video = picked.video;
      if (picked.title) title = picked.title;
      if (picked.description) description = picked.description;
    }
  }
  if (!blog && card.type === 'blog') {
    const picked = await selectBlogForEnrollment(enrollmentId, card);
    if (picked) {
      blog = picked.blog;
      if (picked.title) title = picked.title;
      if (picked.description) description = picked.description;
    }
  }

  return {
    card: {
      id: card.id, type: card.type, title, subtitle: card.subtitle, description,
      student_label: ritualStudentLabel(card.type, card.week ?? null, def?.student_label || card.type), render_band: def?.render_band || 'overview',
      estimated_time: card.estimated_time, competencies: card.competencies,
      evidence_required: !!def?.evidence_required, video,
      blog,
      course: courseFromMetadata(card.metadata),   // Skills Course link — the workspace needs it to render SkillsJarPanel
      points: card.points,
      content: contentFromMetadata(card.metadata),
      type_thumbnail: ((dbDef?.thumbnail_url || '') as string).trim() || null,
      week_title: null,
    },
    progress: { status: progress?.status ?? 'available', completed_at: progress?.completed_at ?? null },
  };
}

/**
 * Complete an activity: run progression, auto-generate a portfolio artifact for
 * evidence/portfolio types, and return the updated readiness. Idempotent
 * (progression is idempotent; a portfolio artifact is generated at most once per
 * card per student).
 */
export async function completeActivity(enrollmentId: string, cardId: string, payload: { work?: string; reflection?: string } = {}) {
  const card = await TimelineCard.findByPk(cardId);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  const outcome = await onCardCompleted(enrollmentId, cardId);

  const def = resolveType(card.type);
  let artifact: any = null;
  if (def?.evidence_required || def?.portfolio_eligible) {
    const existing = await PortfolioArtifact.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId } });
    artifact = existing ? existing.toJSON()
      : await generateArtifact(enrollmentId, { id: card.id, type: card.type, title: card.title, description: card.description, competencies: card.competencies }, payload.work || payload.reflection || '');
  }
  const readiness = await readinessSummary(enrollmentId);
  return { outcome, artifact, readiness };
}
