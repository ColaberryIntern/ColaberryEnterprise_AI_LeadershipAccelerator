/**
 * Career Prep v27, CP1.4: PURE mappers from the scores the platform already records to
 * prep_observations rows. One mapper per source; each returns [] for a record it cannot read
 * (and says why), never a guessed number.
 *
 *   video      the intro-video coaching record (Phase 8, version 2):
 *              delivery scores pace -> pace_clarity, fillers -> few_fillers (already 0-100,
 *              each scored against a published target); content points proof -> proof_of_work,
 *              specific -> ending_with_number, as strong 85 / good 65 / work on 40.
 *   training   a quiz attempt (runtime_assessment_attempts, score 0..1) on a card mapped to a
 *              skill in prep_skill_sources; a card with no mapping writes nothing.
 *   training   a scored weekly interview (interview_sessions.total_score 0-100, topic coverage
 *              from interviewService.scoreAnswer) -> role_knowledge. It is a written exercise,
 *              not a phone mock, so its source is training (weight 0.8), not phone_mock.
 *   project    a case study about the student's own build, published on Hire through the
 *              approval gate (hireTalentIndex) -> proof_of_work 100: verified proof of work.
 *
 * Never: eye contact, expression, accent (no face analysis; Ali's 2026-11-14 ruling).
 */
import type { ObservationSource } from './readiness';

export interface ObservationRow {
  enrollmentId: string;
  skill: string;
  value: number;
  source: ObservationSource;
  sourceRef: string;
  observedAt: Date;
}
export interface Skipped { sourceRef: string; reason: string }
export type Mapped = { rows: ObservationRow[]; skipped: Skipped | null };

export const LEVEL_VALUE = { strong: 85, ok: 65, work_on: 40 } as const;
const DELIVERY_SKILL: Record<string, string> = { pace: 'pace_clarity', fillers: 'few_fillers' };
const CONTENT_SKILL: Record<string, string> = { proof: 'proof_of_work', specific: 'ending_with_number' };

const isScore = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
const validDate = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
const skip = (sourceRef: string, reason: string): Mapped => ({ rows: [], skipped: { sourceRef, reason } });

export interface VideoCoachingInput { enrollmentId: string; assetId: string | null; updatedAt: Date; coaching: unknown }

export function fromVideoCoaching(v: VideoCoachingInput): Mapped {
  const ref = `hire-intro:${v.assetId ?? 'none'}`;
  const c = v.coaching as { version?: unknown; scores?: unknown; content?: { points?: unknown } | null } | null;
  if (!v.assetId || !c || c.version !== 2 || !Array.isArray(c.scores) || !validDate(v.updatedAt)) return skip(ref, 'not a version 2 coaching record');
  const rows: ObservationRow[] = [];
  const push = (skill: string, value: number) => rows.push({ enrollmentId: v.enrollmentId, skill, value, source: 'video', sourceRef: ref, observedAt: v.updatedAt });
  for (const s of c.scores as Array<{ key?: unknown; score?: unknown }>) {
    const skill = DELIVERY_SKILL[String(s?.key)];
    if (skill && isScore(s.score)) push(skill, s.score);
  }
  const points = Array.isArray(c.content?.points) ? (c.content?.points as Array<{ key?: unknown; level?: unknown }>) : [];
  for (const p of points) {
    const skill = CONTENT_SKILL[String(p?.key)];
    const value = LEVEL_VALUE[p?.level as keyof typeof LEVEL_VALUE];
    if (skill && value !== undefined) push(skill, value);
  }
  return { rows, skipped: null };
}

export interface QuizInput { id: string; enrollmentId: string; cardId: string; score: unknown; createdAt: Date }

export function fromQuizAttempt(q: QuizInput, skillsForCard: readonly string[]): Mapped {
  const ref = `assessment:${q.id}`;
  if (typeof q.score !== 'number' || q.score < 0 || q.score > 1 || !validDate(q.createdAt)) return skip(ref, 'quiz score not in 0..1');
  return {
    rows: skillsForCard.map((skill) => ({ enrollmentId: q.enrollmentId, skill, value: Math.round(q.score as number * 1000) / 10, source: 'training', sourceRef: ref, observedAt: q.createdAt })),
    skipped: null,
  };
}

export interface WeeklyInterviewInput { id: string; enrollmentId: string; totalScore: unknown; updatedAt: Date }

export function fromWeeklyInterview(w: WeeklyInterviewInput): Mapped {
  const ref = `interview-session:${w.id}`;
  if (!isScore(w.totalScore) || !validDate(w.updatedAt)) return skip(ref, 'no total score');
  return { rows: [{ enrollmentId: w.enrollmentId, skill: 'role_knowledge', value: w.totalScore, source: 'training', sourceRef: ref, observedAt: w.updatedAt }], skipped: null };
}

export interface PublishedCaseInput { enrollmentId: string; slug: string; publishedAt: string }

export function fromPublishedCaseStudy(p: PublishedCaseInput): Mapped {
  const ref = `case-study:${p.slug}`;
  const at = new Date(p.publishedAt);
  if (!p.slug || !validDate(at)) return skip(ref, 'no published date');
  return { rows: [{ enrollmentId: p.enrollmentId, skill: 'proof_of_work', value: 100, source: 'project', sourceRef: ref, observedAt: at }], skipped: null };
}
