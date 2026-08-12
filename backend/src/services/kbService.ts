import { Op } from 'sequelize';
import CoraKbCourse from '../models/CoraKbCourse';
import CoraKbCohort from '../models/CoraKbCohort';
import CoraKbEntry from '../models/CoraKbEntry';
import ResponsiblePerson from '../models/ResponsiblePerson';
import type {
  CreateEntryInput, UpdateEntryInput,
  CreatePersonInput, UpdatePersonInput,
  CreateCohortInput, UpdateCohortInput,
} from '../schemas/kbSchemas';

// ── Merge tag resolution ─────────────────────────────────────────────────────

const MERGE_TAG_MAP: Record<string, (c: CoraKbCohort, course: CoraKbCourse) => string> = {
  '{{cohort.name}}':            (c) => c.name ?? '[TBD]',
  '{{cohort.number}}':          (c) => String(c.cohort_number ?? '[TBD]'),
  '{{cohort.open_house_date}}': (c) => c.open_house_date ?? '[TBD]',
  '{{cohort.open_house_url}}':  (c) => c.open_house_url ?? '[TBD]',
  '{{cohort.start_date}}':      (c) => c.start_date ?? '[TBD]',
  '{{cohort.end_date}}':        (c) => c.end_date ?? '[TBD]',
  '{{cohort.expo_date}}':       (c) => c.expo_date ?? '[TBD]',
  '{{cohort.price_annual}}':    (c) => c.price_annual != null ? String(c.price_annual) : '[TBD]',
  '{{cohort.price_monthly}}':   (c) => c.price_monthly != null ? String(c.price_monthly) : '[TBD]',
  '{{cohort.seats_total}}':     (c) => c.seats_total != null ? String(c.seats_total) : '[TBD]',
  '{{cohort.seats_remaining}}': (c) => c.seats_remaining != null ? String(c.seats_remaining) : '[TBD]',
  '{{cohort.enrollment_url}}':  (c) => c.enrollment_url ?? '[TBD]',
  '{{cohort.waitlist_url}}':    (c) => c.waitlist_url ?? '[TBD]',
  '{{course.name}}':            (_c, course) => course.name ?? '[TBD]',
  '{{course.slug}}':            (_c, course) => course.slug ?? '[TBD]',
};

export function resolveMergeTags(template: string, cohort: CoraKbCohort, course: CoraKbCourse): string {
  let resolved = template;
  for (const [tag, fn] of Object.entries(MERGE_TAG_MAP)) {
    resolved = resolved.replaceAll(tag, fn(cohort, course));
  }
  return resolved;
}

export function hasUnresolvedTags(text: string): boolean {
  return text.includes('[TBD]');
}

// ── Active cohort lookup ─────────────────────────────────────────────────────

export async function getActiveCohort(courseId: string): Promise<{ cohort: CoraKbCohort; course: CoraKbCourse } | null> {
  const course = await CoraKbCourse.findByPk(courseId);
  if (!course) return null;
  const cohort = await CoraKbCohort.findOne({ where: { course_id: courseId, is_active: true } });
  if (!cohort) return null;
  return { cohort, course };
}

/**
 * Best-effort cohort context for course-agnostic (course_id = NULL) entries:
 * the most recently activated cohort across all courses.
 */
export async function getMostRecentActiveCohortAnyCourse(): Promise<{ cohort: CoraKbCohort; course: CoraKbCourse } | null> {
  const cohort = await CoraKbCohort.findOne({ where: { is_active: true }, order: [['updated_at', 'DESC']] });
  if (!cohort) return null;
  const course = await CoraKbCourse.findByPk(cohort.course_id);
  if (!course) return null;
  return { cohort, course };
}

// ── Courses ──────────────────────────────────────────────────────────────────

export async function listCourses() {
  return CoraKbCourse.findAll({ order: [['name', 'ASC']] });
}

export async function getCourseBySlug(slug: string) {
  return CoraKbCourse.findOne({ where: { slug } });
}

// ── Cohorts ──────────────────────────────────────────────────────────────────

export async function listCohorts(courseId?: string) {
  const where = courseId ? { course_id: courseId } : {};
  return CoraKbCohort.findAll({ where, order: [['cohort_number', 'ASC']] });
}

export async function createCohort(data: CreateCohortInput) {
  return CoraKbCohort.create(data);
}

export async function updateCohort(id: string, data: UpdateCohortInput) {
  const cohort = await CoraKbCohort.findByPk(id);
  if (!cohort) return null;
  return cohort.update({ ...data, updated_at: new Date() });
}

export async function activateCohort(id: string): Promise<CoraKbCohort | null> {
  const cohort = await CoraKbCohort.findByPk(id);
  if (!cohort) return null;
  // Deactivate current active cohort for this course
  await CoraKbCohort.update(
    { is_active: false, updated_at: new Date() },
    { where: { course_id: cohort.course_id, is_active: true, id: { [Op.ne]: id } } }
  );
  return cohort.update({ is_active: true, updated_at: new Date() });
}

// ── Responsible persons ──────────────────────────────────────────────────────

export async function listPersons() {
  return ResponsiblePerson.findAll({ order: [['name', 'ASC']] });
}

export async function createPerson(data: CreatePersonInput) {
  return ResponsiblePerson.create(data);
}

export async function updatePerson(id: string, data: UpdatePersonInput) {
  const person = await ResponsiblePerson.findByPk(id);
  if (!person) return null;
  return person.update({ ...data, updated_at: new Date() });
}

// ── KB Entries ───────────────────────────────────────────────────────────────

export async function listEntries(opts: { courseId?: string; category?: string; activeOnly?: boolean }) {
  // course_id = NULL means "applies to all courses" — when filtering by a
  // specific course, global entries must still be included alongside that
  // course's own entries, not silently dropped.
  const conditions: Record<string, unknown>[] = [];
  if (opts.courseId) conditions.push({ course_id: { [Op.or]: [opts.courseId, null] } });
  if (opts.category) conditions.push({ main_category: opts.category });
  if (opts.activeOnly !== false) conditions.push({ is_active: true });
  const where = conditions.length ? { [Op.and]: conditions } : {};
  return CoraKbEntry.findAll({ where, order: [['main_category', 'ASC'], ['sub_category', 'ASC']] });
}

export async function getEntry(id: string) {
  return CoraKbEntry.findByPk(id);
}

export async function createEntry(data: CreateEntryInput) {
  return CoraKbEntry.create(data as any);
}

export async function updateEntry(id: string, data: UpdateEntryInput) {
  const entry = await CoraKbEntry.findByPk(id);
  if (!entry) return null;
  return entry.update({ ...data, updated_at: new Date() });
}

export async function softDeleteEntry(id: string) {
  const entry = await CoraKbEntry.findByPk(id);
  if (!entry) return null;
  return entry.update({ is_active: false, updated_at: new Date() });
}

export async function previewEntry(entryId: string, cohortId?: string): Promise<string | null> {
  const entry = await CoraKbEntry.findByPk(entryId);
  if (!entry) return null;

  // Resolve cohort: explicit cohortId, then active cohort for the entry's course, then first active across all
  let cohort: CoraKbCohort | null = null;
  let course: CoraKbCourse | null = null;

  if (cohortId) {
    cohort = await CoraKbCohort.findByPk(cohortId);
    if (cohort) course = await CoraKbCourse.findByPk(cohort.course_id);
  } else if (entry.course_id) {
    const result = await getActiveCohort(entry.course_id);
    if (result) { cohort = result.cohort; course = result.course; }
  } else {
    const result = await getMostRecentActiveCohortAnyCourse();
    if (result) { cohort = result.cohort; course = result.course; }
  }

  if (!cohort || !course) return entry.answer_template;
  return resolveMergeTags(entry.answer_template, cohort, course);
}

// ── Synthflow CSV export ─────────────────────────────────────────────────────
// Column set matches the real Google Sheet rubric Synthflow already consumes
// (confirmed by Kes 2026-07-06) — not the earlier internal draft shape.

export interface SynthflowRow {
  main_category: string;
  main_category_qualifier: string;
  sub_category: string;
  full_category: string;
  question: string;
  answer: string;
  generated_date: string;
  email_examples: string;
  keywords: string;
  responsible_person_email: string;
  escalation_logic: string;
  calendar_link: string;
  priority: string;
  response_time: string;
  automation_potential: string;
  emotional_tone: string;
}

export async function buildSynthflowExport(
  courseId?: string,
  forceIncludeUnresolved = false
): Promise<{ rows: SynthflowRow[]; skipped: number }> {
  const entries = await listEntries({ courseId, activeOnly: true });
  const persons = await listPersons();
  const personMap = new Map(persons.map((p) => [p.id, p]));

  // Pre-load active cohorts per course
  const cohortCache = new Map<string, { cohort: CoraKbCohort; course: CoraKbCourse }>();
  let globalCohort: { cohort: CoraKbCohort; course: CoraKbCourse } | null | undefined;

  const rows: SynthflowRow[] = [];
  let skipped = 0;

  for (const entry of entries) {
    let resolved = entry.answer_template;

    if (entry.course_id) {
      if (!cohortCache.has(entry.course_id)) {
        const result = await getActiveCohort(entry.course_id);
        if (result) cohortCache.set(entry.course_id, result);
      }
      const cached = cohortCache.get(entry.course_id);
      if (cached) resolved = resolveMergeTags(entry.answer_template, cached.cohort, cached.course);
    } else {
      // course_id = NULL: resolve against the most recently active cohort
      // across all courses (best-effort, per spec §3.3).
      if (globalCohort === undefined) globalCohort = await getMostRecentActiveCohortAnyCourse();
      if (globalCohort) resolved = resolveMergeTags(entry.answer_template, globalCohort.cohort, globalCohort.course);
    }

    if (hasUnresolvedTags(resolved)) {
      if (!forceIncludeUnresolved) {
        skipped++;
        continue;
      }
      // Forced through: [TBD] stays literally in the answer text as the
      // visible signal — no separate flag column needed.
    }

    const primary = entry.primary_person_id ? personMap.get(entry.primary_person_id) : null;

    rows.push({
      main_category: entry.main_category,
      main_category_qualifier: '',
      sub_category: entry.sub_category ?? '',
      full_category: entry.sub_category ? `${entry.main_category} > ${entry.sub_category}` : entry.main_category,
      question: entry.question_pattern,
      answer: resolved,
      generated_date: entry.updated_at.toISOString().slice(0, 10),
      email_examples: entry.email_examples ?? '',
      keywords: entry.keywords ?? '',
      responsible_person_email: primary ? `${primary.name}${primary.email ? ` <${primary.email}>` : ''}` : '',
      escalation_logic: entry.escalation_logic ?? '',
      calendar_link: primary?.calendar_link ?? entry.calendar_link ?? '',
      priority: entry.priority,
      response_time: entry.response_time ?? '',
      automation_potential: entry.automation_potential,
      emotional_tone: entry.emotional_tone ?? '',
    });
  }

  return { rows, skipped };
}

// ── Cora runtime query (replaces coraKnowledgeBase.ts) ──────────────────────

export interface CoraKbResult {
  answer: string;
  primary_person_id: string | null;
  team_person_ids: string[];
  escalation_logic: string | null;
  priority: string;
  automation_potential: string;
}

export async function queryKbForCora(courseId: string, keywords: string[]): Promise<CoraKbResult[]> {
  const entries = await listEntries({ courseId, activeOnly: true });
  const active = await getActiveCohort(courseId);

  const matched = entries.filter((e) => {
    const haystack = `${e.question_pattern} ${e.keywords ?? ''}`.toLowerCase();
    return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
  });

  return matched.map((e) => {
    const answer = active
      ? resolveMergeTags(e.answer_template, active.cohort, active.course)
      : e.answer_template;
    return {
      answer,
      primary_person_id: e.primary_person_id,
      team_person_ids: Array.isArray(e.team_person_ids) ? e.team_person_ids : [],
      escalation_logic: e.escalation_logic,
      priority: e.priority,
      automation_potential: e.automation_potential,
    };
  });
}
