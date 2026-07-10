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
import { videoFromMetadata } from '../timeline/timelineService';

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
  const journeyCards = signals.competencies.filter((c) => c.confidence >= 0.25).map((c) => ({ type: 'overview', competencies: [c.domain_id] }));
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
  return { id: c.id, type: c.type, title: c.title, description: c.description, student_label: def?.student_label || c.type };
}

/** Open a published card for the runtime (card + the student's progress + video). */
export async function openCard(enrollmentId: string, cardId: string) {
  const card = await TimelineCard.findByPk(cardId);
  if (!card || card.visibility !== 'published') throw Object.assign(new Error('Card not available'), { status: 404 });
  const def = resolveType(card.type);
  const [progress] = await TimelineCardProgress.findOrCreate({
    where: { card_id: cardId, enrollment_id: enrollmentId },
    defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'available' },
  });
  return {
    card: {
      id: card.id, type: card.type, title: card.title, subtitle: card.subtitle, description: card.description,
      student_label: def?.student_label || card.type, render_band: def?.render_band || 'overview',
      estimated_time: card.estimated_time, competencies: card.competencies,
      evidence_required: !!def?.evidence_required, video: videoFromMetadata(card.metadata),
    },
    progress: { status: progress.status, completed_at: progress.completed_at },
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
