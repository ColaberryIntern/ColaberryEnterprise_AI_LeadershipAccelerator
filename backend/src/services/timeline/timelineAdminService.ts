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
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { resolve as resolveType, allTypes, CardTypeDef } from './typeRegistry';
import { normalizeCapabilities } from './timelineService';

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
  video?: { url?: string | null; presenter?: string | null; poster?: string | null } | null;
  content?: { title?: string; summary?: string; body_html?: string; questions?: string[]; reflection?: string } | null;
  course?: { name?: string | null; url?: string | null } | null;   // Anthropic Skills Course (skills_jar): class name + link
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
export function buildCourseMeta(course: CreateCardInput['course']): { name: string | null; url: string | null } | null {
  if (!course || typeof course !== 'object') return null;
  const str = (s: any) => (typeof s === 'string' && s.trim() ? s.trim() : null);
  const name = str(course.name);
  const url = str(course.url);
  if (!name && !url) return null;
  return { name, url };
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
    estimated_time: input.estimated_time ?? (def.evidence_required ? 45 : 15),
    points,
    competencies,
    ref_kind: 'none',
    status: 'active',
    cohort_id: null,                 // global — one curriculum for every batch
    program_id: input.program_id ?? null,
    order,
    metadata: {
      authored: true,
      ...(buildVideoMeta(input.video) ? { video: buildVideoMeta(input.video) } : {}),
      ...(buildContentMeta(input.content) ? { content: buildContentMeta(input.content), content_at: new Date().toISOString() } : {}),
      ...(buildCourseMeta(input.course) ? { course: buildCourseMeta(input.course) } : {}),
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
  const defRows = await CurriculumTypeDefinition.findAll({ attributes: ['slug', 'capabilities', 'approved', 'is_active'] });
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
      };
    });
  return { scope: 'global', buckets: BUCKETS, cards, types };
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

export async function createCard(input: CreateCardInput): Promise<TimelineCard> {
  const def = resolveType(input.type);
  if (!def) throw Object.assign(new Error(`Unknown card type "${input.type}"`), { status: 400 });
  if (def.system) throw Object.assign(new Error(`Type "${input.type}" is system-emitted and cannot be created manually`), { status: 400 });
  await assertTypeLaunched(input.type); // only launched/approved types may be hand-placed
  if (input.bucket && !BUCKETS.includes(input.bucket)) throw Object.assign(new Error(`Invalid bucket "${input.bucket}"`), { status: 400 });

  const bucket = input.bucket || def.bucket;
  const order = await nextOrderInLane(input.week ?? null, bucket);
  return TimelineCard.create(composeCardAttributes(def, input, order) as any);
}

const EDITABLE_FIELDS = [
  'title', 'subtitle', 'description', 'week', 'bucket', 'difficulty',
  'estimated_time', 'points', 'competencies', 'visibility', 'release_date', 'priority', 'order',
] as const;

export async function updateCard(id: string, patch: Record<string, any>): Promise<TimelineCard> {
  const card = await TimelineCard.findByPk(id);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  if (patch.bucket && !BUCKETS.includes(patch.bucket)) throw Object.assign(new Error(`Invalid bucket "${patch.bucket}"`), { status: 400 });
  if (patch.visibility && !VISIBILITIES.includes(patch.visibility)) throw Object.assign(new Error(`Invalid visibility "${patch.visibility}"`), { status: 400 });

  const clean: Record<string, any> = {};
  for (const f of EDITABLE_FIELDS) {
    if (f in patch) clean[f] = f === 'release_date' && patch[f] ? new Date(patch[f]) : patch[f];
  }
  // Video + content live in the metadata blob; merge them (setting/clearing each
  // key) without disturbing other metadata. Start from the latest metadata (or
  // whatever a prior branch already staged in clean.metadata).
  if ('video' in patch || 'content' in patch || 'course' in patch) {
    const meta = { ...(card.metadata && typeof card.metadata === 'object' ? card.metadata : {}) };
    if ('video' in patch) {
      const v = buildVideoMeta(patch.video);
      if (v) meta.video = v; else delete meta.video;
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
    clean.metadata = meta;
  }
  await card.update(clean);
  return card;
}

export async function deleteCard(id: string): Promise<void> {
  const card = await TimelineCard.findByPk(id);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  // Schema has no DB-level FK cascade (tables are raw-created), so clear the
  // student progress rows explicitly to avoid orphans.
  await sequelize.transaction(async (t) => {
    await TimelineCardProgress.destroy({ where: { card_id: id }, transaction: t });
    await card.destroy({ transaction: t });
  });
}

/**
 * Bulk reorder / re-lane after a drag. Each item sets the card's order (and
 * optionally its week/bucket when dragged to another lane). One transaction so
 * a partial drag never leaves the board half-ordered.
 */
export async function reorderCards(items: Array<{ id: string; order: number; week?: number | null; bucket?: string }>): Promise<{ updated: number }> {
  return sequelize.transaction(async (t) => {
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
}

/** Clone a card to the tail of its lane, as a draft. */
export async function cloneCard(id: string): Promise<TimelineCard> {
  const src = await TimelineCard.findByPk(id);
  if (!src) throw Object.assign(new Error('Card not found'), { status: 404 });
  const order = await nextOrderInLane(src.week, src.bucket);
  const attrs = src.toJSON() as any;
  delete attrs.id; delete attrs.created_at; delete attrs.updated_at;
  return TimelineCard.create({
    ...attrs,
    title: `${src.title} (copy)`,
    visibility: 'draft',
    order,
  });
}
