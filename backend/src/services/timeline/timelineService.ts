/**
 * timelineService — read/compose layer for the Timeline Engine.
 *
 * Turns `timeline_cards` + a student's `timeline_card_progress` into the feed
 * the Classroom (and later Today/Projects/etc.) render. Progress init is
 * idempotent via the (card_id, enrollment_id) unique constraint.
 */
import { Op } from 'sequelize';
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress, { TimelineCardStatus } from '../../models/TimelineCardProgress';
import Enrollment from '../../models/Enrollment';
import { resolve as resolveType } from './typeRegistry';

const BUCKET_ORDER = ['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance'] as const;

export interface FeedVideo {
  url: string;
  presenter: string | null;
  poster: string | null;
}

/** AI-generated student content saved onto the card (by the Timeline editor's
 *  "Generate content"), rendered in the student drawer — what was previewed IS
 *  what the student sees. */
export interface FeedContent {
  summary?: string;
  body_html?: string;
  questions?: string[];
  reflection?: string;
}

export interface FeedCard {
  id: string;
  type: string;
  student_label: string;
  render_band: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  week: number | null;
  bucket: string;
  order: number;
  difficulty: string;
  estimated_time: number | null;
  points: any;
  competencies: any;
  status: TimelineCardStatus;
  quiz_score: number | null;
  completed_at: Date | null;
  video: FeedVideo | null;
  content: FeedContent | null;
}

/** PURE — the saved AI content from a card's metadata blob, or null. */
export function contentFromMetadata(metadata: any): FeedContent | null {
  const c = metadata && typeof metadata === 'object' ? metadata.content : null;
  if (!c || typeof c !== 'object') return null;
  const out: FeedContent = {};
  if (typeof c.summary === 'string' && c.summary.trim()) out.summary = c.summary;
  if (typeof c.body_html === 'string' && c.body_html.trim()) out.body_html = c.body_html;
  if (Array.isArray(c.questions) && c.questions.length) out.questions = c.questions.map(String);
  if (typeof c.reflection === 'string' && c.reflection.trim()) out.reflection = c.reflection;
  return Object.keys(out).length ? out : null;
}

/** PURE — a typed video from a card's metadata blob, or null. Only the URL is
 *  required; presenter/poster are optional display extras. */
export function videoFromMetadata(metadata: any): FeedVideo | null {
  const v = metadata && typeof metadata === 'object' ? metadata.video : null;
  if (!v || typeof v !== 'object' || typeof v.url !== 'string' || !v.url.trim()) return null;
  return {
    url: v.url.trim(),
    presenter: typeof v.presenter === 'string' && v.presenter.trim() ? v.presenter.trim() : null,
    poster: typeof v.poster === 'string' && v.poster.trim() ? v.poster.trim() : null,
  };
}

export interface TimelineFeed {
  cohort_id: string | null;
  buckets: string[];
  cards: FeedCard[];
}

/**
 * Published, active cards of the ONE shared curriculum. The class runs a single
 * curriculum across every batch/cohort, so cards live at the global scope
 * (cohort_id IS NULL) and every enrolled student sees the same timeline. (The
 * cohort_id column is kept nullable for a possible future per-cohort override.)
 */
export async function getGlobalCards(): Promise<TimelineCard[]> {
  return TimelineCard.findAll({
    where: { cohort_id: null, status: 'active', visibility: 'published' },
    order: [['week', 'ASC'], ['order', 'ASC']],
  });
}

/**
 * Idempotently ensure a progress row exists for every published card in the
 * shared curriculum. Safe to re-run (findOrCreate on the unique key).
 */
export async function initProgress(enrollmentId: string): Promise<{ created: number; existing: number }> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return { created: 0, existing: 0 };

  const cards = await getGlobalCards();
  let created = 0;
  let existing = 0;
  for (const card of cards) {
    const [, wasCreated] = await TimelineCardProgress.findOrCreate({
      where: { card_id: card.id, enrollment_id: enrollmentId },
      defaults: {
        card_id: card.id,
        enrollment_id: enrollmentId,
        // Phase 1: cards open by default; unlock_rules enforcement lands with
        // the gating pass. System/announcement types are always available.
        status: 'available',
      },
    });
    if (wasCreated) created += 1; else existing += 1;
  }
  return { created, existing };
}

/** Compose the student's feed: cards merged with their progress status. */
export async function getFeed(enrollmentId: string): Promise<TimelineFeed> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) {
    return { cohort_id: null, buckets: [...BUCKET_ORDER], cards: [] };
  }

  const cards = await getGlobalCards();
  const progressRows = await TimelineCardProgress.findAll({
    where: { enrollment_id: enrollmentId, card_id: { [Op.in]: cards.map((c) => c.id) } },
  });
  const progressByCard = new Map(progressRows.map((p) => [p.card_id, p]));

  const feedCards: FeedCard[] = cards.map((card) => {
    const def = resolveType(card.type);
    const progress = progressByCard.get(card.id);
    return {
      id: card.id,
      type: card.type,
      student_label: def?.student_label || card.type,
      render_band: def?.render_band || 'overview',
      title: card.title,
      subtitle: card.subtitle,
      description: card.description,
      week: card.week,
      bucket: card.bucket,
      order: card.order,
      difficulty: card.difficulty,
      estimated_time: card.estimated_time,
      points: card.points,
      competencies: card.competencies,
      status: progress?.status || 'available',
      quiz_score: progress?.quiz_score ?? null,
      completed_at: progress?.completed_at ?? null,
      video: videoFromMetadata(card.metadata),
      content: contentFromMetadata(card.metadata),
    };
  });

  return { cohort_id: enrollment.cohort_id, buckets: [...BUCKET_ORDER], cards: feedCards };
}
