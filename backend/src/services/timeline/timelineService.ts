/**
 * timelineService — read/compose layer for the Timeline Engine.
 *
 * Turns `timeline_cards` + a student's `timeline_card_progress` into the feed
 * the Classroom (and later Today/Projects/etc.) render. Progress init is
 * idempotent via the (card_id, enrollment_id) unique constraint.
 */
import { Op } from 'sequelize';
import { ritualStudentLabel } from '../runtime/communityRituals';
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress, { TimelineCardStatus } from '../../models/TimelineCardProgress';
import Enrollment from '../../models/Enrollment';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { resolve as resolveType } from './typeRegistry';
import { selectTestimonialForEnrollment } from './networkVideoService';
import { selectPodcastForEnrollment } from './podcastMediaService';
import { selectBlogForEnrollment } from './blogMediaService';
import { buildGateContext, evaluateCardLock, GateCard } from './timelineGatingService';
import { isStaffEnrollment } from '../access/staffAccess';
import { env } from '../../config/env';

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
  title?: string;    // the generated lesson title (e.g. "Overview — {week topic}") — display beats the card's raw title
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
  completion?: 'certificate' | 'progress'; // 'progress' = interim (upload a progress screenshot)
  sections?: string;                        // which sections this part covers (split course)
}

/** A blog post on the card (Blog type) — a fixed pasted post, or the per-student
 *  auto-matched pick from the training-site library (see blogMediaService). */
export interface FeedBlog {
  url: string;
  title: string | null;
  excerpt?: string | null;
  thumbnail?: string | null;
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
  lock_reason: string | null;         // when status='locked', the student-facing "why" (e.g. "Finish the Learn tasks first")
  quiz_score: number | null;
  completed_at: Date | null;
  video: FeedVideo | null;
  content: FeedContent | null;
  course: FeedCourse | null;          // Skills Course link (skills_jar)
  image: string | null;               // the item's OWN image (blog cover, testimonial still) — tiles use it over the generic type visual
  blog: FeedBlog | null;              // Blog post (blog type) — fixed or auto-matched per student
  capabilities: string[];             // the type's Parts (from CurriculumTypeDefinition) — drive optional render sections
  type_thumbnail: string | null;      // the type's Experience Studio thumbnail (AI banner) — the card's DEFAULT image; own media art overrides it
  week_title: string | null;          // the week's SECTION title from the Blueprint (e.g. "Claude Code Foundations + Workspace") — the Overview card's display title; null for non-overview or no blueprint
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
  if (typeof c.title === 'string' && c.title.trim()) out.title = c.title;
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

/** PURE — the card's own display image from its metadata blob, or null. Set by
 *  the Timeline editor (Image URL) for non-video items like blogs; video-band
 *  cards usually carry theirs on video.poster instead. */
export function imageFromMetadata(metadata: any): string | null {
  const img = metadata && typeof metadata === 'object' ? metadata.image : null;
  return typeof img === 'string' && img.trim() ? img.trim() : null;
}

/** PURE — a typed blog post from a card's metadata blob (link mode), or null.
 *  Only the URL is required; title/thumbnail/excerpt are display extras filled
 *  from the library at save time when the URL is a training-site post. */
export function blogFromMetadata(metadata: any): FeedBlog | null {
  const b = metadata && typeof metadata === 'object' ? metadata.blog : null;
  if (!b || typeof b !== 'object' || typeof b.url !== 'string' || !b.url.trim()) return null;
  return {
    url: b.url.trim(),
    title: typeof b.title === 'string' && b.title.trim() ? b.title.trim() : null,
    excerpt: typeof b.excerpt === 'string' && b.excerpt.trim() ? b.excerpt.trim() : null,
    thumbnail: typeof b.thumbnail === 'string' && b.thumbnail.trim() ? b.thumbnail.trim() : null,
  };
}

/** PURE — a typed Skills Course link from a card's metadata blob, or null when
 *  neither the class name nor the URL is present. */
export function courseFromMetadata(metadata: any): FeedCourse | null {
  const c = metadata && typeof metadata === 'object' ? metadata.course : null;
  if (!c || typeof c !== 'object') return null;
  const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : null;
  const url = typeof c.url === 'string' && c.url.trim() ? c.url.trim() : null;
  if (!name && !url) return null;
  const completion = c.completion === 'progress' ? 'progress' : undefined;
  const sections = typeof c.sections === 'string' && c.sections.trim() ? c.sections.trim() : undefined;
  return { name, url, ...(completion ? { completion } : {}), ...(sections ? { sections } : {}) };
}

export interface TimelineFeed {
  cohort_id: string | null;
  buckets: string[];
  cards: FeedCard[];
  is_explorer?: boolean;   // true = free Explorer tier — drives the enroll upsell (Week-0-only content gate is ON by default; EXPLORER_WEEK0_ONLY=false lifts it)
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

  // Free lead-magnet gate (DEFAULT ON): Explorers (unenrolled free-trial prospects)
  // see ONLY the Week 0 "AI Preview" tier; paid enrollments see the full 12-week
  // curriculum. Set EXPLORER_WEEK0_ONLY=false to lift the gate (e.g. a launch promo
  // that opens the whole program to free signups); any other value keeps it on.
  // (The 2026-07 launch briefly ran with it off; gating is the permanent default.)
  const isExplorer = (enrollment as any).enrollment_type === 'explorer';
  const gateExplorersToWeek0 = process.env.EXPLORER_WEEK0_ONLY !== 'false';
  const allCards = await getGlobalCards();
  const cards = (isExplorer && gateExplorersToWeek0) ? allCards.filter((c) => c.week === 0) : allCards;

  const progressRows = await TimelineCardProgress.findAll({
    where: { enrollment_id: enrollmentId, card_id: { [Op.in]: cards.map((c) => c.id) } },
  });
  const progressByCard = new Map(progressRows.map((p) => [p.card_id, p]));

  // Gating overlay: compute each card's locked/available status from the student's
  // completion snapshot + section/card unlock rules (timelineGatingService). Lock
  // is a read-time overlay — nothing is persisted; a card already engaged
  // (completed / in_progress) is never re-locked. Evaluated over the full
  // curriculum (allCards) so section/type predicates see every card.
  const completedCardIds = new Set(
    progressRows.filter((p) => p.status === 'completed').map((p) => p.card_id),
  );
  const gateCtx = await buildGateContext(allCards, completedCardIds);
  const gateCardById = new Map<string, GateCard>(gateCtx.allCards.map((c) => [c.id, c]));

  // Staff have unrestricted curriculum access: skip the lock overlay entirely so
  // every not-yet-engaged card reads as 'available' (mirrors assertCardUnlocked).
  const staffUnrestricted = await isStaffEnrollment(enrollmentId);

  // The type's Parts (capabilities) live on CurriculumTypeDefinition (what the
  // Studio "Parts" panel edits), keyed by slug (= card.type). One query, mapped.
  const typeDefs = await CurriculumTypeDefinition.findAll({ attributes: ['slug', 'capabilities', 'thumbnail_url'] });
  const capsBySlug = new Map(typeDefs.map((t) => [t.slug, normalizeCapabilities(t.capabilities)]));
  // The type's Studio thumbnail (AI banner) — every card's default image.
  const thumbBySlug = new Map(typeDefs.map((t) => [t.slug, (t.thumbnail_url || '').trim() || null]));

  // NOTE: the 'overview' card type (which surfaced the week's SECTION title as
  // its week_title) was retired 2026-07-21, so week_title is always null now.

  const feedCards: FeedCard[] = cards.map((card) => {
    const def = resolveType(card.type);
    const progress = progressByCard.get(card.id);
    // Already-engaged cards keep their stored status; everything else gets the
    // computed lock overlay. Fail-open (available) if evaluation ever throws.
    const stored = progress?.status;
    let status: TimelineCardStatus;
    let lock_reason: string | null = null;
    if (stored === 'completed' || stored === 'in_progress') {
      status = stored;
    } else if (staffUnrestricted) {
      status = 'available';
    } else {
      try {
        const gc = gateCardById.get(card.id)
          || { id: card.id, type: card.type, bucket: card.bucket, week: card.week, program_id: (card as any).program_id ?? null, unlock_rules: card.unlock_rules };
        const verdict = evaluateCardLock(gc, gateCtx);
        status = verdict.locked ? 'locked' : 'available';
        lock_reason = verdict.locked ? (verdict.unmet[0]?.label ?? null) : null;
      } catch {
        status = 'available';
      }
    }
    return {
      id: card.id,
      type: card.type,
      // community_discussion cards show their WEEK'S ritual name (Roll Call, Cohort
      // Wins, …) so each week's card reads as a distinct ritual on the tile.
      student_label: ritualStudentLabel(card.type, card.week ?? null, def?.student_label || card.type),
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
      status,
      lock_reason,
      quiz_score: progress?.quiz_score ?? null,
      completed_at: progress?.completed_at ?? null,
      video: videoFromMetadata(card.metadata),
      content: contentFromMetadata(card.metadata),
      course: courseFromMetadata(card.metadata),
      image: imageFromMetadata(card.metadata),
      blog: blogFromMetadata(card.metadata),
      capabilities: capsBySlug.get(card.type) || [],
      type_thumbnail: thumbBySlug.get(card.type) || null,
      week_title: null,
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
    // Any blog card WITHOUT a fixed pasted post pulls a week+student-matched post
    // from the training-site blog library (per student, non-repeating), recorded in
    // blog_post_views. A pasted link keeps its own post. Third sibling of the
    // testimonial/podcast blocks above; see blogMediaService.
    if (fc.type === 'blog' && !fc.blog) {
      const picked = await selectBlogForEnrollment(enrollmentId, card);
      if (picked) {
        fc.blog = picked.blog;
        if (picked.title) { fc.title = picked.title; fc.subtitle = null; }
        if (picked.description) fc.description = picked.description;
        fc.content = null;
      }
    }
  }

  // Order the feed the way the week reads top-to-bottom: by week, then by the
  // section order (pre_class → learn → practice → build → reflect → share →
  // advance), then by the card's order within its lane. Card `order` is
  // per-(week,bucket) so sorting by it alone interleaves sections (a reflect
  // card could surface above a learn card) — bucket-first keeps reflect last.
  const bIdx = (b: string) => { const i = BUCKET_ORDER.indexOf(b as any); return i < 0 ? BUCKET_ORDER.length : i; };
  if (env.feedControlEnabled) {
    // Feed Control: a live pin floats to the top of the feed; within each lane,
    // higher `priority` rises. The week→bucket structure is otherwise preserved.
    const now = Date.now();
    const ctrl = new Map(cards.map((c) => [c.id, { priority: c.priority ?? 0, pinned: c.pinned_until ? new Date(c.pinned_until).getTime() > now : false }]));
    const pin = (id: string) => (ctrl.get(id)?.pinned ? 1 : 0);
    const pri = (id: string) => ctrl.get(id)?.priority ?? 0;
    feedCards.sort((a, b) =>
      pin(b.id) - pin(a.id)
      || (a.week ?? 0) - (b.week ?? 0)
      || bIdx(a.bucket) - bIdx(b.bucket)
      || pri(b.id) - pri(a.id)
      || a.order - b.order);
  } else {
    feedCards.sort((a, b) => (a.week ?? 0) - (b.week ?? 0) || bIdx(a.bucket) - bIdx(b.bucket) || a.order - b.order);
  }

  return { cohort_id: enrollment.cohort_id, buckets: [...BUCKET_ORDER], cards: feedCards, is_explorer: isExplorer };
}
