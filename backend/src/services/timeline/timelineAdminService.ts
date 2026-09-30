/**
 * timelineAdminService — the AUTHOR side of the Timeline Engine.
 *
 * The student-facing timelineService only READS published cards. This service
 * lets the Orchestration admin build the Classroom feed: create/update/delete/
 * reorder/clone/publish `timeline_cards`, scoped by cohort. New cards inherit
 * their defaults from the Curriculum Type Registry (no per-type logic).
 *
 * Card CRUD is idempotent-friendly (create is explicit; reorder + clone are
 * deterministic). System types (milestone/achievement/streak/badge) are engine-
 * emitted and cannot be author-created.
 */
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import TimelineCard, { TimelineBucket, TimelineCardAttributes } from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import TimelineSectionRule from '../../models/TimelineSectionRule';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { resolve as resolveType, allTypes, CardTypeDef } from './typeRegistry';
import { normalizeCapabilities } from './timelineService';
import { recomputeForCard, recomputeMany, recomputeBlueprintHours } from '../composer/blueprintRollup';
import { normalizeRules, UnlockPredicate } from './timelineGatingService';
import { REFLECT_GATED_TYPES, reflectGateFor, reflectSiblingFlags } from './reflectGating';

export const BUCKETS: TimelineBucket[] = ['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance'];
const VISIBILITIES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type Visibility = typeof VISIBILITIES[number];

export interface CreateCardInput {
  cohort_id?: string | null;   // ignored — the curriculum is global (cohort_id null)
  type: string;
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  week?: number | null;
  bucket?: TimelineBucket;
  difficulty?: 'intro' | 'core' | 'stretch';
  estimated_time?: number | null;
  points?: { learning?: number; builder?: number; community?: number };
  competencies?: Array<{ domain_id: string; weight: number }>;
  visibility?: Visibility;
  release_date?: string | Date | null;
  program_id?: string | null;
  unlock_rules?: any;   // per-card gating predicates (UnlockPredicate[]) — normalized on write
  video?: { url?: string | null; presenter?: string | null; poster?: string | null } | null;
  content?: { title?: string; summary?: string; body_html?: string; questions?: string[]; reflection?: string } | null;
  course?: { name?: string | null; url?: string | null; completion?: 'certificate' | 'progress' | null; sections?: string | null; certName?: string | null } | null;   // Anthropic Skills Course (skills_jar): class name + link + completion mode. certName: the name AS IT APPEARS ON THE ACTUAL CERTIFICATE, when it differs from the display `name` (e.g. a split course renamed per-week for the timeline) — used only for AI cert-match verification.
  image?: string | null;   // the item's OWN display image (blog cover etc.) — tiles show it over the generic type visual
  testimonial?: { mode?: string | null; category?: string | null } | null;   // Testimonials type: link vs random personalized
  podcast?: { mode?: string | null; category?: string | null } | null;       // Podcast type: link vs random personalized episode
  blog?: { mode?: string | null; url?: string | null } | null;               // Blog type: one specific post vs auto-matched per student+week
}

/** PURE — normalize an author's image URL into the stored metadata shape (a
 *  trimmed url string), or null when empty. */
export function buildImageMeta(image: CreateCardInput['image']): string | null {
  return typeof image === 'string' && image.trim() ? image.trim() : null;
}

/** PURE — normalize an author's video input into the stored metadata shape, or
 *  null when no usable URL is given. */
export function buildVideoMeta(video: CreateCardInput['video']): { url: string; presenter: string | null; poster: string | null } | null {
  const url = (video && typeof video.url === 'string') ? video.url.trim() : '';
  if (!url) return null;
  const str = (s: any) => (typeof s === 'string' && s.trim() ? s.trim() : null);
  return { url, presenter: str(video?.presenter), poster: str(video?.poster) };
}

/** PURE — normalize author/AI content into the stored metadata shape, or null
 *  when nothing usable is present (so an empty blob never clobbers real notes). */
export function buildContentMeta(content: CreateCardInput['content']): Record<string, any> | null {
  if (!content || typeof content !== 'object') return null;
  const out: Record<string, any> = {};
  if (typeof content.title === 'string' && content.title.trim()) out.title = content.title;
  if (typeof content.summary === 'string' && content.summary.trim()) out.summary = content.summary;
  if (typeof content.body_html === 'string' && content.body_html.trim()) out.body_html = content.body_html;
  if (Array.isArray(content.questions) && content.questions.length) out.questions = content.questions.map(String);
  if (typeof content.reflection === 'string' && content.reflection.trim()) out.reflection = content.reflection;
  return Object.keys(out).length ? out : null;
}

/** PURE — normalize a Skills Course link (class name + SkillsJar URL) into the
 *  stored metadata shape, or null when neither is given. */
export function buildCourseMeta(course: CreateCardInput['course']): { name: string | null; url: string | null; completion?: 'certificate' | 'progress'; sections?: string; certName?: string } | null {
  if (!course || typeof course !== 'object') return null;
  const str = (s: any) => (typeof s === 'string' && s.trim() ? s.trim() : null);
  const name = str(course.name);
  const url = str(course.url);
  if (!name && !url) return null;
  // completion mode: 'progress' = interim (upload a progress screenshot, e.g. a
  // split course's first part); default/omitted = 'certificate' (whole-course cert).
  const completion = course.completion === 'progress' ? 'progress' : undefined;
  const sections = str(course.sections) || undefined;
  const certName = str(course.certName) || undefined;
  return { name, url, ...(completion ? { completion } : {}), ...(sections ? { sections } : {}), ...(certName ? { certName } : {}) };
}

/** PURE — normalize the Testimonials source config into the stored metadata
 *  shape (top-level `mode` + `testimonial_category`), or null when no valid mode.
 *  `random` = pick a matched testimonial per student; `link` = play a set video. */
export function buildTestimonialMeta(testimonial: CreateCardInput['testimonial']): { mode: 'link' | 'random'; testimonial_category: string } | null {
  if (!testimonial || typeof testimonial !== 'object') return null;
  const mode = testimonial.mode === 'random' ? 'random' : testimonial.mode === 'link' ? 'link' : null;
  if (!mode) return null;
  const cat = typeof testimonial.category === 'string' && testimonial.category.trim() ? testimonial.category.trim().toLowerCase() : 'testimonial';
  return { mode, testimonial_category: cat };
}

/** PURE — normalize the Podcast source config into the stored metadata shape
 *  (top-level `mode` + optional `podcast_category`), or null when no valid mode.
 *  `random` = pick a matched episode per student from the `podcasts` catalog
 *  (blank category = the whole catalog); `link` = play a pasted video/episode. */
export function buildPodcastMeta(podcast: CreateCardInput['podcast']): { mode: 'link' | 'random'; podcast_category?: string } | null {
  if (!podcast || typeof podcast !== 'object') return null;
  const mode = podcast.mode === 'random' ? 'random' : podcast.mode === 'link' ? 'link' : null;
  if (!mode) return null;
  const cat = typeof podcast.category === 'string' && podcast.category.trim() ? podcast.category.trim().toLowerCase() : '';
  return cat ? { mode, podcast_category: cat } : { mode };
}

/** PURE — normalize the Blog source config into the stored metadata shape
 *  (top-level `mode` + `blog { url }` in link mode), or null when no valid mode.
 *  `random` = auto-match a post per student+week from the blog_posts library;
 *  `link` = one specific post (the URL is enriched from the library at save time). */
export function buildBlogMeta(blog: CreateCardInput['blog']): { mode: 'link' | 'random'; blog?: { url: string } } | null {
  if (!blog || typeof blog !== 'object') return null;
  const mode = blog.mode === 'random' ? 'random' : blog.mode === 'link' ? 'link' : null;
  if (!mode) return null;
  const url = typeof blog.url === 'string' && blog.url.trim() ? blog.url.trim() : '';
  return mode === 'link' && url ? { mode, blog: { url } } : { mode };
}

/**
 * PURE — compose the DB attributes for a new card from its type registry entry
 * plus author overrides. No I/O, fully unit-testable. `order` is supplied by the
 * caller (it depends on siblings in the same cohort/week/bucket lane).
 */
export function composeCardAttributes(
  def: CardTypeDef,
  input: CreateCardInput,
  order: number,
): TimelineCardAttributes {
  const bucket = (input.bucket || def.bucket) as TimelineBucket;
  const points = input.points ?? {
    learning: def.learning_xp,
    builder: def.builder_xp,
    community: def.community_xp,
  };
  const competencies = input.competencies ?? def.competencies.map((domain_id) => ({ domain_id, weight: 1 }));
  return {
    type: def.slug,
    title: (input.title && input.title.trim()) || def.label,
    subtitle: input.subtitle ?? null,
    description: input.description ?? null,
    week: input.week ?? null,
    bucket,
    visibility: input.visibility ?? 'draft',
    release_date: input.release_date ? new Date(input.release_date) : null,
    difficulty: input.difficulty ?? def.difficulty,
    estimated_time: input.estimated_time ?? def.est_minutes ?? 15,
    points,
    competencies,
    ref_kind: 'none',
    status: 'active',
    cohort_id: null,                 // global — one curriculum for every batch
    program_id: input.program_id ?? null,
    unlock_rules: normalizeRules(input.unlock_rules),   // gating predicates (usually empty at create)
    order,
    metadata: {
      authored: true,
      ...(buildVideoMeta(input.video) ? { video: buildVideoMeta(input.video) } : {}),
      ...(buildContentMeta(input.content) ? { content: buildContentMeta(input.content), content_at: new Date().toISOString() } : {}),
      ...(buildCourseMeta(input.course) ? { course: buildCourseMeta(input.course) } : {}),
      ...(buildImageMeta(input.image) ? { image: buildImageMeta(input.image) } : {}),
      ...(buildTestimonialMeta(input.testimonial) || {}),   // top-level mode + testimonial_category
      ...(buildPodcastMeta(input.podcast) || {}),           // top-level mode + optional podcast_category
      ...(buildBlogMeta(input.blog) || {}),                 // top-level mode + blog { url } in link mode
    },
  };
}

/** Next order value at the tail of a (week, bucket) lane in the global curriculum. */
async function nextOrderInLane(week: number | null, bucket: string): Promise<number> {
  const max = await TimelineCard.max<number, TimelineCard>('order', {
    where: { cohort_id: null, week: week ?? null, bucket },
  });
  return (typeof max === 'number' ? max : -1) + 1;
}

/** Admin view: the whole global curriculum (all visibilities) + the type registry. */
export async function listTimeline(programId?: string | null) {
  // The timeline is course-scoped (one curriculum per course, shared across that
  // course's cohorts) — cohort_id stays null; program_id selects the course.
  const where: Record<string, any> = { cohort_id: null };
  if (programId) where.program_id = programId;
  const cards = await TimelineCard.findAll({
    where,
    order: [['week', 'ASC'], ['bucket', 'ASC'], ['order', 'ASC']],
  });
  // The type's Parts (capabilities) + curriculum APPROVAL live on the DB
  // CurriculumTypeDefinition (what the Studio edits), keyed by slug — merged in
  // so the editor's preview gates sections like the live render, and so the
  // "Add card" picker can be limited to APPROVED types.
  const defRows = await CurriculumTypeDefinition.findAll({ attributes: ['slug', 'capabilities', 'approved', 'is_active', 'thumbnail_url'] });
  const defBySlug = new Map(defRows.map((c: any) => [c.slug, c]));
  // ALL authorable types are returned (existing cards of unapproved types still
  // need labels/bands); `launched` marks the ones staff may ADD — the same
  // "✓ Approved for curriculum" flag the Composer honors (Studio approval button).
  const types = allTypes()
    .filter((t) => !t.system)
    .map((t) => {
      const row: any = defBySlug.get(t.slug);
      return {
        slug: t.slug, label: t.label, student_label: t.student_label,
        bucket: t.bucket, render_band: t.render_band, difficulty: t.difficulty,
        learning_xp: t.learning_xp, builder_xp: t.builder_xp, community_xp: t.community_xp,
        competencies: t.competencies, event: !!t.event,
        capabilities: row ? normalizeCapabilities(row.capabilities) : [],
        launched: !!row && row.approved === true && row.is_active !== false,
        // The type's banner — so the editor previews carry the same default image
        // the student feed shows (feed cards get it as type_thumbnail).
        thumbnail_url: (row && typeof row.thumbnail_url === 'string' && row.thumbnail_url.trim()) ? row.thumbnail_url : null,
      };
    });
  const sectionRules = await getSectionRules(programId ?? null);
  return { scope: 'global', buckets: BUCKETS, cards, types, sectionRules };
}

// ── section gating rules (per program × bucket) ──────────────────────────────

/** All section (bucket) gating rules for a program, normalized. */
export async function getSectionRules(
  programId: string | null,
): Promise<Array<{ bucket: TimelineBucket; rules: UnlockPredicate[]; active: boolean }>> {
  const where: Record<string, any> = {};
  if (programId) where.program_id = programId;
  const rows = await TimelineSectionRule.findAll({ where, order: [['bucket', 'ASC']] });
  return rows.map((r) => ({ bucket: r.bucket, rules: normalizeRules(r.rules), active: r.active }));
}

/** Upsert one section's gating rules (idempotent on (program_id, bucket)). An
 *  empty rules array clears gating for that section. */
export async function setSectionRule(
  programId: string,
  bucket: TimelineBucket,
  rules: any,
): Promise<{ bucket: TimelineBucket; rules: UnlockPredicate[] }> {
  if (!programId) throw Object.assign(new Error('program_id is required'), { status: 400 });
  if (!BUCKETS.includes(bucket)) throw Object.assign(new Error(`Invalid bucket "${bucket}"`), { status: 400 });
  const clean = normalizeRules(rules);
  const [row] = await TimelineSectionRule.findOrCreate({
    where: { program_id: programId, bucket },
    defaults: { program_id: programId, bucket, rules: clean, active: true },
  });
  await row.update({ rules: clean, active: true });
  return { bucket, rules: clean };
}

/** A type may be hand-placed on the timeline only if it carries the Studio's
 *  "✓ Approved for curriculum" flag (and hasn't been deactivated) — the exact
 *  same gate the Curriculum Composer uses. */
async function assertTypeLaunched(slug: string): Promise<void> {
  const row: any = await CurriculumTypeDefinition.findOne({ where: { slug }, attributes: ['slug', 'approved', 'is_active'] });
  const launched = !!row && row.approved === true && row.is_active !== false;
  if (!launched) {
    throw Object.assign(
      new Error(`Type "${slug}" is not approved for curriculum — approve it in the Experience Studio before adding it to the timeline`),
      { status: 400 },
    );
  }
}

/**
 * Auto-apply the reflect-chain gate to a newly created eval/survey/reflection
 * card, unless the author explicitly supplied unlock_rules (an explicit choice
 * — including a deliberate `[]` — is never overridden). Cross-sibling drift
 * (e.g. an evaluation added after its week's survey already existed) is swept
 * up by the boot-time reflectGatingReconciler, not here.
 */
async function autoGateReflectCard(card: TimelineCard, input: CreateCardInput): Promise<void> {
  if (input.unlock_rules !== undefined) return;
  if (card.bucket !== 'reflect' || !(REFLECT_GATED_TYPES as readonly string[]).includes(card.type)) return;
  const siblings = await TimelineCard.findAll({
    where: { cohort_id: null, program_id: card.program_id, week: card.week, bucket: 'reflect' },
    attributes: ['type'],
  });
  const rules = reflectGateFor(card.type, reflectSiblingFlags(siblings));
  if (rules) await card.update({ unlock_rules: rules });
}

export async function createCard(input: CreateCardInput): Promise<TimelineCard> {
  const def = resolveType(input.type);
  if (!def) throw Object.assign(new Error(`Unknown card type "${input.type}"`), { status: 400 });
  if (def.system) throw Object.assign(new Error(`Type "${input.type}" is system-emitted and cannot be created manually`), { status: 400 });
  await assertTypeLaunched(input.type); // only launched/approved types may be hand-placed
  if (input.bucket && !BUCKETS.includes(input.bucket)) throw Object.assign(new Error(`Invalid bucket "${input.bucket}"`), { status: 400 });

  const bucket = input.bucket || def.bucket;
  const order = await nextOrderInLane(input.week ?? null, bucket);
  const attrs = composeCardAttributes(def, input, order);
  // Link-mode blog: enrich the pasted training-site URL from the blog_posts library
  // so the card carries the real title/thumbnail/excerpt without manual typing.
  const bmeta: any = (attrs.metadata as any)?.blog;
  if (bmeta?.url) {
    const { lookupBlogByUrl } = await import('./blogMediaService');
    const enriched = await lookupBlogByUrl(bmeta.url);
    if (enriched) (attrs.metadata as any).blog = enriched;
  }
  const card = await TimelineCard.create(attrs as any);
  await recomputeForCard(card); // keep the week's blueprint est_hours in sync
  await autoGateReflectCard(card, input); // wire the reflect-chain lock so new eval/survey/reflection cards aren't born ungated
  return card;
}

const EDITABLE_FIELDS = [
  'title', 'subtitle', 'description', 'week', 'bucket', 'difficulty',
  'estimated_time', 'points', 'competencies', 'visibility', 'release_date', 'priority', 'order',
  'unlock_rules',
] as const;

export async function updateCard(id: string, patch: Record<string, any>): Promise<TimelineCard> {
  const card = await TimelineCard.findByPk(id);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  const before = { program_id: card.program_id, week: card.week }; // week/estimated_time may change
  if (patch.bucket && !BUCKETS.includes(patch.bucket)) throw Object.assign(new Error(`Invalid bucket "${patch.bucket}"`), { status: 400 });
  if (patch.visibility && !VISIBILITIES.includes(patch.visibility)) throw Object.assign(new Error(`Invalid visibility "${patch.visibility}"`), { status: 400 });

  const clean: Record<string, any> = {};
  for (const f of EDITABLE_FIELDS) {
    if (!(f in patch)) continue;
    if (f === 'release_date') clean[f] = patch[f] ? new Date(patch[f]) : patch[f];
    else if (f === 'unlock_rules') clean[f] = normalizeRules(patch[f]);   // drop junk predicates
    else clean[f] = patch[f];
  }
  // Video + content live in the metadata blob; merge them (setting/clearing each
  // key) without disturbing other metadata. Start from the latest metadata (or
  // whatever a prior branch already staged in clean.metadata).
  if ('video' in patch || 'content' in patch || 'course' in patch || 'image' in patch || 'testimonial' in patch || 'podcast' in patch || 'blog' in patch) {
    const meta = { ...(card.metadata && typeof card.metadata === 'object' ? card.metadata : {}) };
    if ('video' in patch) {
      const v = buildVideoMeta(patch.video);
      if (v) meta.video = v; else delete meta.video;
    }
    if ('testimonial' in patch) {
      const t = buildTestimonialMeta(patch.testimonial);
      if (t) { meta.mode = t.mode; meta.testimonial_category = t.testimonial_category; }
      else { delete meta.mode; delete meta.testimonial_category; }
    }
    // NOTE: runs after the testimonial branch — a podcast save carries testimonial:null
    // (which clears meta.mode) and then podcast re-sets it. The editor only ever sends
    // the `podcast` key for podcast-type cards, so testimonial cards are never touched here.
    if ('podcast' in patch) {
      const p = buildPodcastMeta(patch.podcast);
      if (p) {
        meta.mode = p.mode;
        if (p.podcast_category) meta.podcast_category = p.podcast_category; else delete meta.podcast_category;
      } else { delete meta.mode; delete meta.podcast_category; }
    }
    // Sibling of the podcast branch — the editor only sends the `blog` key for
    // blog-type cards, so other personalizable types are never touched here.
    if ('blog' in patch) {
      const b = buildBlogMeta(patch.blog);
      if (b) {
        meta.mode = b.mode;
        if (b.blog?.url) {
          const { lookupBlogByUrl } = await import('./blogMediaService');
          meta.blog = (await lookupBlogByUrl(b.blog.url)) || b.blog;
        } else delete meta.blog;
      } else { delete meta.mode; delete meta.blog; }
    }
    if ('content' in patch) {
      const c = buildContentMeta(patch.content);
      // Stamp content_at so the 30-day student-refresh clock starts at save time.
      if (c) { meta.content = c; meta.content_at = new Date().toISOString(); }
      else { delete meta.content; delete meta.content_at; }
    }
    if ('course' in patch) {
      const co = buildCourseMeta(patch.course);
      if (co) meta.course = co; else delete meta.course;
    }
    if ('image' in patch) {
      const img = buildImageMeta(patch.image);
      if (img) meta.image = img; else delete meta.image;
    }
    clean.metadata = meta;
  }
  await card.update(clean);
  // Recompute both the old and (possibly changed) new week's blueprint total.
  await recomputeMany([before, { program_id: card.program_id, week: card.week }]);
  return card;
}

export async function deleteCard(id: string): Promise<void> {
  const card = await TimelineCard.findByPk(id);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  const owner = { program_id: card.program_id, week: card.week };
  // Schema has no DB-level FK cascade (tables are raw-created), so clear the
  // student progress rows explicitly to avoid orphans.
  await sequelize.transaction(async (t) => {
    await TimelineCardProgress.destroy({ where: { card_id: id }, transaction: t });
    await card.destroy({ transaction: t });
  });
  await recomputeBlueprintHours(owner.program_id, owner.week);
}

/**
 * Bulk reorder / re-lane after a drag. Each item sets the card's order (and
 * optionally its week/bucket when dragged to another lane). One transaction so
 * a partial drag never leaves the board half-ordered.
 */
export async function reorderCards(items: Array<{ id: string; order: number; week?: number | null; bucket?: string }>): Promise<{ updated: number }> {
  // Capture each card's current (program_id, week) so a cross-week drag recomputes
  // both the source and destination week totals.
  const before = (await TimelineCard.findAll({
    where: { id: items.map((i) => i.id) },
    attributes: ['id', 'program_id', 'week'],
    raw: true,
  })) as unknown as Array<{ id: string; program_id: string | null; week: number | null }>;
  const beforeById = new Map(before.map((b) => [b.id, b]));

  const result = await sequelize.transaction(async (t) => {
    let updated = 0;
    for (const it of items) {
      if (it.bucket && !BUCKETS.includes(it.bucket as TimelineBucket)) {
        throw Object.assign(new Error(`Invalid bucket "${it.bucket}"`), { status: 400 });
      }
      const fields: Record<string, any> = { order: it.order };
      if ('week' in it) fields.week = it.week ?? null;
      if (it.bucket) fields.bucket = it.bucket;
      const [n] = await TimelineCard.update(fields, { where: { id: it.id }, transaction: t });
      updated += n;
    }
    return { updated };
  });

  // Recompute the union of source weeks + any new destination weeks (only cards
  // that actually moved week matter, but recomputeMany de-dups the rest).
  const keys: Array<{ program_id?: string | null; week?: number | null }> = [];
  for (const b of before) keys.push({ program_id: b.program_id, week: b.week });
  for (const it of items) {
    if ('week' in it) {
      const b = beforeById.get(it.id);
      keys.push({ program_id: b?.program_id ?? null, week: it.week ?? null });
    }
  }
  await recomputeMany(keys);
  return result;
}

/** Clone a card to the tail of its lane, as a draft. */
export async function cloneCard(id: string): Promise<TimelineCard> {
  const src = await TimelineCard.findByPk(id);
  if (!src) throw Object.assign(new Error('Card not found'), { status: 404 });
  const order = await nextOrderInLane(src.week, src.bucket);
  const attrs = src.toJSON() as any;
  delete attrs.id; delete attrs.created_at; delete attrs.updated_at;
  const card = await TimelineCard.create({
    ...attrs,
    title: `${src.title} (copy)`,
    visibility: 'draft',
    order,
  });
  await recomputeForCard(card);
  return card;
}
