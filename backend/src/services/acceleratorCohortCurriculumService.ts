/**
 * acceleratorCohortCurriculumService — what a cohort's students are actually
 * taught, for the Accelerator page's Curriculum tab.
 *
 * WHY THIS EXISTS. The tab used to read `curriculum_modules WHERE cohort_id =
 * :id`. That table is the pre-Timeline authoring model and is effectively dead:
 * nothing in the Composer writes it, so the tab rendered "No curriculum modules
 * found for this cohort" for every cohort, including ones teaching that week.
 * The live curriculum is `timeline_cards`, authored in the Curriculum Composer
 * and published to the Timeline.
 *
 * THE KEY JOIN, and the reason the old query could never have worked: the
 * timeline is COURSE-scoped, not cohort-scoped. Cards carry `program_id` (the
 * Course) and leave `cohort_id` NULL, because one curriculum is shared across
 * every cohort of that course — see timelineAdminService.listTimeline, whose
 * comment states "program_id selects the course". So a cohort's curriculum is
 * reached through `cohorts.program_id`, never through `cards.cohort_id`.
 *
 * A cohort with no `program_id` (e.g. the Explorer prospect pool) genuinely has
 * no course curriculum; that is reported as such rather than as an empty list,
 * so the UI can tell "not attached to a course" apart from "course has no cards
 * yet". Those are different problems with different fixes.
 */
import { Op } from 'sequelize';
// From '../models', not the model files: associations (here, Cohort->program)
// are registered in models/index.ts, and a direct model-file import produces a
// model with none of them. See the note in acceleratorCurrentClassesService.
import { Cohort, Enrollment, TimelineCard, TimelineCardProgress } from '../models';
import { allTypes } from './timeline/typeRegistry';
import { AppError } from '../utils/AppError';

export interface CurriculumCard {
  id: string;
  type: string;
  type_label: string;
  title: string;
  subtitle: string | null;
  week: number | null;
  bucket: string;
  visibility: string;
  status: string;
  order: number | null;
}

export interface CurriculumWeek {
  week: number | null;
  label: string;
  cards: CurriculumCard[];
  total: number;
  published: number;
  draft: number;
}

export interface CohortCurriculum {
  cohort_id: string;
  cohort_name: string;
  program_id: string | null;
  program_name: string | null;
  /** False when the cohort has no parent Course, so there is no curriculum to
   *  show and the empty state must say that instead of "no cards". */
  has_program: boolean;
  weeks: CurriculumWeek[];
  totals: { cards: number; published: number; draft: number; weeks: number };
}

/** slug -> human label, from the Curriculum Type Registry. */
function typeLabels(): Map<string, string> {
  return new Map(allTypes().map((t) => [t.slug, t.label]));
}

function weekLabel(week: number | null): string {
  return week == null ? 'Unscheduled' : `Week ${week}`;
}

/**
 * Groups cards into weeks, ascending, with unscheduled cards (week IS NULL)
 * last rather than first — a null sorts before 1 numerically, which would put
 * the leftovers at the top of the page above Week 1.
 */
export function groupCardsByWeek(cards: CurriculumCard[]): CurriculumWeek[] {
  const byWeek = new Map<number | null, CurriculumCard[]>();
  for (const c of cards) {
    const key = c.week ?? null;
    const list = byWeek.get(key);
    if (list) list.push(c);
    else byWeek.set(key, [c]);
  }
  const keys = [...byWeek.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });
  return keys.map((week) => {
    const list = byWeek.get(week) as CurriculumCard[];
    return {
      week,
      label: weekLabel(week),
      cards: list,
      total: list.length,
      published: list.filter((c) => c.visibility === 'published').length,
      draft: list.filter((c) => c.visibility !== 'published').length,
    };
  });
}

async function loadCohortWithProgram(cohortId: string) {
  const cohort = await Cohort.findByPk(cohortId, {
    include: [{ association: 'program', attributes: ['id', 'name'], required: false }],
  });
  if (!cohort) throw new AppError('Cohort not found', 404);
  return cohort as any;
}

/** Course-scoped cards for a cohort's program. Legacy rows authored before
 *  `program_id` existed carry NULL and belong to every course, so they stay in
 *  scope — the same rule the student-side reader applies (see curriculumScope). */
async function loadProgramCards(programId: string): Promise<CurriculumCard[]> {
  const labels = typeLabels();
  const rows = await TimelineCard.findAll({
    where: {
      cohort_id: null,
      status: 'active',
      program_id: { [Op.or]: [programId, null] },
    },
    order: [['week', 'ASC'], ['bucket', 'ASC'], ['order', 'ASC']],
  });
  return rows.map((c) => ({
    id: c.id,
    type: c.type,
    type_label: labels.get(c.type) ?? c.type,
    title: c.title,
    subtitle: c.subtitle ?? null,
    week: c.week ?? null,
    bucket: c.bucket,
    visibility: c.visibility,
    status: c.status,
    order: (c as any).order ?? null,
  }));
}

export async function getCohortCurriculum(cohortId: string): Promise<CohortCurriculum> {
  const cohort = await loadCohortWithProgram(cohortId);
  const programId: string | null = cohort.program_id ?? null;

  if (!programId) {
    return {
      cohort_id: cohort.id,
      cohort_name: cohort.name,
      program_id: null,
      program_name: null,
      has_program: false,
      weeks: [],
      totals: { cards: 0, published: 0, draft: 0, weeks: 0 },
    };
  }

  const cards = await loadProgramCards(programId);
  const weeks = groupCardsByWeek(cards);

  return {
    cohort_id: cohort.id,
    cohort_name: cohort.name,
    program_id: programId,
    program_name: cohort.program?.name ?? null,
    has_program: true,
    weeks,
    totals: {
      cards: cards.length,
      published: cards.filter((c) => c.visibility === 'published').length,
      draft: cards.filter((c) => c.visibility !== 'published').length,
      weeks: weeks.length,
    },
  };
}

export interface ParticipantCurriculumProgress {
  enrollment_id: string;
  full_name: string;
  overall_pct: number;
  completed_cards: number;
  total_cards: number;
  weeks: Array<{
    week: number | null;
    label: string;
    total: number;
    completed: number;
    in_progress: number;
    pct: number;
    cards: Array<{
      id: string; title: string; type_label: string; visibility: string;
      status: string; quiz_score: number | null; completed_at: string | null;
    }>;
  }>;
}

/**
 * One student's progress through their cohort's curriculum.
 *
 * Only PUBLISHED cards count toward the denominator. A draft card is not
 * visible to the student, so counting it would report every learner as
 * permanently behind through no fault of their own — the percentage has to
 * measure what they were actually given.
 */
export async function getParticipantCurriculumProgress(
  cohortId: string,
  enrollmentId: string
): Promise<ParticipantCurriculumProgress> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) throw new AppError('Enrollment not found', 404);
  if (String((enrollment as any).cohort_id) !== String(cohortId)) {
    throw new AppError('Enrollment does not belong to this cohort', 400);
  }

  const curriculum = await getCohortCurriculum(cohortId);
  const visible = curriculum.weeks
    .flatMap((w) => w.cards)
    .filter((c) => c.visibility === 'published');

  const progressRows = visible.length
    ? await TimelineCardProgress.findAll({
        where: { enrollment_id: enrollmentId, card_id: { [Op.in]: visible.map((c) => c.id) } },
      })
    : [];
  const byCard = new Map(progressRows.map((p) => [p.card_id, p]));

  const weeks = groupCardsByWeek(visible).map((w) => {
    const cards = w.cards.map((c) => {
      const p = byCard.get(c.id);
      return {
        id: c.id,
        title: c.title,
        type_label: c.type_label,
        visibility: c.visibility,
        // No row yet means the student has not reached the card. 'locked' is the
        // model's own default for exactly that state, so absence maps to it
        // rather than inventing a separate "unknown".
        status: p?.status ?? 'locked',
        quiz_score: p?.quiz_score ?? null,
        completed_at: p?.completed_at ? new Date(p.completed_at).toISOString() : null,
      };
    });
    const completed = cards.filter((c) => c.status === 'completed').length;
    return {
      week: w.week,
      label: w.label,
      total: cards.length,
      completed,
      in_progress: cards.filter((c) => c.status === 'in_progress').length,
      pct: cards.length ? Math.round((completed / cards.length) * 100) : 0,
      cards,
    };
  });

  const completedTotal = weeks.reduce((n, w) => n + w.completed, 0);
  return {
    enrollment_id: enrollmentId,
    full_name: (enrollment as any).full_name,
    overall_pct: visible.length ? Math.round((completedTotal / visible.length) * 100) : 0,
    completed_cards: completedTotal,
    total_cards: visible.length,
    weeks,
  };
}
