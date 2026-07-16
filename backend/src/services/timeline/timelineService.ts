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
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { resolve as resolveType } from './typeRegistry';
import { selectTestimonialForEnrollment } from './networkVideoService';
import { selectPodcastForEnrollment } from './podcastMediaService';

const BUCKET_ORDER = ['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance'] as const;

export interface FeedVideo {
  url: string;
  presenter: string | null;
  poster: string | null;
  title?: string | null;   // the specific video's own title — overlaid on the poster (personalized picks)
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

/** Anthropic Skills Course link (skills_jar) — the class name + SkillsJar URL
 *  the student opens, then uploads their completion certificate against. */
export interface FeedCourse {
  name: string | null;
  url: string | null;
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
  course: FeedCourse | null;          // Skills Course link (skills_jar)
  capabilities: string[];             // the type's Parts (from CurriculumTypeDefinition) — drive optional render sections
  type_thumbnail_url: string | null;  // the type's banner — the card's DEFAULT image (own media poster overrides it)
}

/** PURE — normalize a capabilities blob (JSONB, may be junk) into a string[]. */
export function normalizeCapabilities(caps: any): string[] {
  if (!Array.isArray(caps)) return [];
  return caps.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim());
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
    title: typeof v.title === 'string' && v.title.trim() ? v.title.trim() : null,
  };
}

/** PURE — a typed Skills Course link from a card's metadata blob, or null when
 *  neither the class name nor the URL is present. */
export function courseFromMetadata(metadata: any): FeedCourse | null {
  const c = metadata && typeof metadata === 'object' ? metadata.course : null;
  if (!c || typeof c !== 'object') return null;
  const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : null;
  const url = typeof c.url === 'string' && c.url.trim() ? c.url.trim() : null;
  return name || url ? { name, url } : null;
}

export interface TimelineFeed {
  cohort_id: string | null;
  buckets: string[];
  cards: FeedCard[];
  is_explorer?: boolean;   // true = free Explorer tier (Week 0 only) — drives the enroll upsell
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

  // Free lead-magnet gate: Explorers (unenrolled prospects) get ONLY the Week 0
  // "AI Preview" tier for free; paid enrollments see the full curriculum. Gated
  // here so the paid weeks stay behind enrollment.
  const isExplorer = (enrollment as any).enrollment_type === 'explorer';
  const allCards = await getGlobalCards();
  const cards = isExplorer ? allCards.filter((c) => c.week === 0) : allCards;

  const progressRows = await TimelineCardProgress.findAll({
    where: { enrollment_id: enrollmentId, card_id: { [Op.in]: cards.map((c) => c.id) } },
  });
  const progressByCard = new Map(progressRows.map((p) => [p.card_id, p]));

  // The type's Parts (capabilities) live on CurriculumTypeDefinition (what the
  // Studio "Parts" panel edits), keyed by slug (= card.type). One query, mapped.
  const typeDefs = await CurriculumTypeDefinition.findAll({ attributes: ['slug', 'capabilities', 'thumbnail_url'] });
  const capsBySlug = new Map(typeDefs.map((t) => [t.slug, normalizeCapabilities(t.capabilities)]));
  const thumbBySlug = new Map(typeDefs.map((t) => [t.slug, t.thumbnail_url || null]));

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
      course: courseFromMetadata(card.metadata),
      capabilities: capsBySlug.get(card.type) || [],
      type_thumbnail_url: thumbBySlug.get(card.type) || null,
    };
  });

  // Resolve per-student random testimonials (personalized, non-repeating). A
  // testimonial card in "random" mode carries no fixed metadata.video — instead we
  // pick a video this student hasn't seen and record it. Sequential (not parallel)
  // so two random cards in the same feed can't both claim the same video.
  for (let i = 0; i < feedCards.length; i++) {
    const fc = feedCards[i];
    const card = cards[i];
    // Any testimonial card WITHOUT a fixed pasted video pulls a matched testimonial
    // from our library (per student, non-repeating). A pasted link keeps its own video.
    if (fc.type === 'testimonial' && !fc.video) {
      const picked = await selectTestimonialForEnrollment(enrollmentId, card);
      if (picked) {
        // The picked testimonial IS the card now — its title + description take
        // over the authored placeholder, and no stale AI lesson notes are shown.
        fc.video = picked.video;
        if (picked.title) { fc.title = picked.title; fc.subtitle = null; }
        if (picked.description) fc.description = picked.description;
        fc.content = null;
      }
    }
    // Any podcast card WITHOUT a fixed pasted link pulls a personalized episode from
    // the Buzzsprout catalog (per student, non-repeating), recorded in podcast_views.
    // A pasted link keeps its own video. Exact sibling of the testimonial block above.
    if (fc.type === 'podcast' && !fc.video) {
      const picked = await selectPodcastForEnrollment(enrollmentId, card);
      if (picked) {
        fc.video = picked.video;
        if (picked.title) { fc.title = picked.title; fc.subtitle = null; }
        if (picked.description) fc.description = picked.description;
        fc.content = null;
      }
    }
  }

  return { cohort_id: enrollment.cohort_id, buckets: [...BUCKET_ORDER], cards: feedCards, is_explorer: isExplorer };
}
