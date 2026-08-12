/**
 * weekReviewService — the PER-STUDENT data behind the weekly "Week in Review"
 * Reflection panel. Where the reflection card's generated body_html is class-wide
 * (the roster of what the week contained), THIS is what a specific student actually
 * did: their real completions, quiz/evaluation scores, survey, skill movement, and
 * the strategic signals they've saved.
 *
 * Composition, not duplication: it joins the week's TimelineCards with this
 * enrollment's TimelineCardProgress, and layers on assessmentService.getSectionProgress
 * (pre/post skill deltas) + the weekly CardSurveyResponse + the saved ReflectionEntry.
 *
 * Failure-first: every read is graceful — missing/sparse data degrades to sensible
 * empties (the panel shows "your stats fill in as you complete activities"), never
 * throws into the render path. Student identity is enrollment_id throughout.
 */
import { Op } from 'sequelize';
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import CardSurveyResponse from '../../models/CardSurveyResponse';
import ReflectionEntry, { ReflectionSignals } from '../../models/ReflectionEntry';
import { resolve as resolveType } from '../timeline/typeRegistry';
import { getSectionProgress } from './assessmentService';

// Cards that are not "things the student did" — meta/system + the reflection itself.
const EXCLUDED_TYPES = new Set([
  'announcement', 'event', 'milestone', 'achievement', 'daily_streak', 'completion_badge',
]);
const COMPLETED = new Set(['completed', 'complete', 'done']);

const PHASE: Record<string, { label: string; order: number }> = {
  pre_class: { label: 'Prep', order: 0 },
  learn: { label: 'Learn', order: 1 },
  practice: { label: 'Practice', order: 2 },
  build: { label: 'Build', order: 3 },
  reflect: { label: 'Reflect', order: 4 },
  share: { label: 'Share', order: 5 },
  advance: { label: 'Advance', order: 6 },
};
const phaseOf = (bucket?: string | null) => PHASE[bucket || ''] || { label: bucket || 'Other', order: 9 };
export const humanize = (s?: string | null): string =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export interface ReviewActivity {
  card_id: string;
  type: string;
  label: string;      // student-facing type label
  title: string;      // the card's own title
  bucket: string;
  phase: string;      // Prep | Learn | Practice | Build | Reflect | Share
  minutes: number;
  completed: boolean;
  status: string;
  quiz_score: number | null;   // 0..1 when this activity is a scored check the student took
}

export interface ReviewSkill {
  domain: string;
  label: string;
  beginning: number | null;    // 0..1
  current: number | null;      // 0..1
  delta: number | null;        // current - beginning
}

export interface WeekReview {
  program_id: string | null;
  week: number | null;
  week_title: string | null;
  stats: {
    total: number;
    completed: number;
    time_invested_min: number;
    points: number;
    growth_score: number;      // 0..100 (share of the week's activities completed)
  };
  activities: ReviewActivity[];
  skills: ReviewSkill[];
  evaluation: { score: number | null; passed: boolean | null; growth: number | null } | null;
  survey: { avg_rating: number | null; open: string | null } | null;
  signals: {
    readiness: number | null;
    application: string | null;
    application_text: string | null;
    direction: string | null;
    note: string | null;
  } | null;
  generated_at: string;
}

// ── pure helpers (unit-tested) ───────────────────────────────────────────────

/** Sum of a card's point buckets (learning + builder + community). */
export function cardPoints(points: any): number {
  if (!points || typeof points !== 'object') return 0;
  return ['learning', 'builder', 'community'].reduce((s, k) => s + (Number((points as any)[k]) || 0), 0);
}

/** Roll the per-activity list into the headline stats. Growth score is the share of
 *  the week's activities the student has completed (0..100) — always available,
 *  honest, and non-negative. */
export function computeStats(activities: ReviewActivity[]): WeekReview['stats'] {
  const total = activities.length;
  const done = activities.filter((a) => a.completed);
  const completed = done.length;
  const time_invested_min = done.reduce((s, a) => s + (a.minutes || 0), 0);
  const growth_score = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, time_invested_min, points: 0, growth_score };
}

/** Order activities by journey phase, then by their in-week order. */
export function sortByPhase(a: ReviewActivity, b: ReviewActivity): number {
  return (PHASE[a.bucket]?.order ?? 9) - (PHASE[b.bucket]?.order ?? 9);
}

// ── the aggregate read ───────────────────────────────────────────────────────

export async function getWeekReview(enrollmentId: string, cardId: string): Promise<WeekReview> {
  const empty = (): WeekReview => ({
    program_id: null, week: null, week_title: null,
    stats: { total: 0, completed: 0, time_invested_min: 0, points: 0, growth_score: 0 },
    activities: [], skills: [], evaluation: null, survey: null, signals: null,
    generated_at: new Date().toISOString(),
  });

  const self = await TimelineCard.findByPk(cardId);
  if (!self) return empty();
  const programId: string | null = (self as any).program_id ?? null;
  const week: number | null = self.week ?? null;
  if (!programId || week == null) return empty();

  // 1. the week's roster (this program+week), minus meta/system cards and self.
  const cards = await TimelineCard.findAll({
    where: { program_id: programId, week, visibility: 'published' } as any,
    order: [['priority', 'ASC'], ['created_at', 'ASC']],
  });
  const real = cards.filter((c) => c.id !== self.id && !EXCLUDED_TYPES.has(c.type));

  // 2. this student's progress for those cards.
  const progress = await TimelineCardProgress.findAll({
    where: { enrollment_id: enrollmentId, card_id: { [Op.in]: real.map((c) => c.id) } } as any,
  });
  const byCard = new Map<string, TimelineCardProgress>(progress.map((p) => [(p as any).card_id, p]));

  const seen = new Set<string>();
  const activities: ReviewActivity[] = [];
  for (const c of real) {
    const key = `${c.type}|${(c.title || '').trim().toLowerCase()}`;
    if (seen.has(key)) continue;          // collapse duplicate seeds of the same activity
    seen.add(key);
    const def = resolveType(c.type);
    const p = byCard.get(c.id);
    const status = (p as any)?.status || 'available';
    activities.push({
      card_id: c.id,
      type: c.type,
      label: def?.student_label || humanize(c.type),
      title: c.title,
      bucket: c.bucket,
      phase: phaseOf(c.bucket).label,
      minutes: (c as any).estimated_time ?? def?.est_minutes ?? 0,
      completed: COMPLETED.has(status),
      status,
      quiz_score: (p as any)?.quiz_score ?? null,
    });
  }
  activities.sort(sortByPhase);

  const stats = computeStats(activities);
  stats.points = activities.filter((a) => a.completed)
    .reduce((s, a) => s + cardPoints((real.find((c) => c.id === a.card_id) as any)?.points), 0);

  // 3. skill movement + evaluation (pre/post from the section's quiz vs evaluation).
  let skills: ReviewSkill[] = [];
  let evaluation: WeekReview['evaluation'] = null;
  try {
    const section = await getSectionProgress(enrollmentId, programId, week);
    if (section) {
      skills = (section.per_competency || [])
        .filter((c) => c.beginning != null || c.current != null)
        .map((c) => ({ domain: c.domain, label: humanize(c.domain), beginning: c.beginning, current: c.current, delta: c.delta }));
      if (section.current != null || section.beginning != null) {
        evaluation = { score: section.current, passed: section.evaluation_passed, growth: section.growth };
      }
    }
  } catch { /* graceful degrade — skills stay empty */ }

  // 4. the weekly survey (self-ratings + open comment).
  let survey: WeekReview['survey'] = null;
  try {
    const s = await CardSurveyResponse.findOne({ where: { enrollment_id: enrollmentId, program_id: programId, week } as any });
    const ans: any = s ? (s as any).answers : null;
    if (ans) {
      const items = Array.isArray(ans.items) ? ans.items : [];
      const rated = items.filter((i: any) => typeof i.rating === 'number');
      const avg = rated.length ? rated.reduce((sum: number, i: any) => sum + i.rating, 0) / rated.length : null;
      survey = { avg_rating: avg != null ? Math.round(avg * 10) / 10 : null, open: ans.open ? String(ans.open) : null };
    }
  } catch { /* graceful degrade */ }

  // 5. the student's saved signals (if they've reflected before).
  let signals: WeekReview['signals'] = null;
  try {
    const e = await ReflectionEntry.findOne({ where: { card_id: self.id, enrollment_id: enrollmentId } as any });
    if (e) {
      const a: ReflectionSignals = (e as any).answers || {};
      signals = {
        readiness: (e as any).readiness ?? null,
        application: (e as any).application ?? null,
        application_text: (a.application_text as string) ?? null,
        direction: (e as any).direction ?? null,
        note: (e as any).note ?? null,
      };
    }
  } catch { /* graceful degrade */ }

  return {
    program_id: programId, week, week_title: (self as any).week_title || self.title || null,
    stats, activities, skills, evaluation, survey, signals,
    generated_at: new Date().toISOString(),
  };
}

// ── the write (idempotent upsert) ────────────────────────────────────────────

export interface SaveSignalsInput {
  readiness?: number | null;
  application?: string | null;
  application_text?: string | null;
  direction?: string | null;
  note?: string | null;
}

export async function saveReflectionSignals(enrollmentId: string, cardId: string, input: SaveSignalsInput): Promise<WeekReview['signals']> {
  const card = await TimelineCard.findByPk(cardId);
  const answers: ReflectionSignals = {};
  if (input.application_text != null) answers.application_text = input.application_text;

  const [row] = await ReflectionEntry.findOrCreate({
    where: { card_id: cardId, enrollment_id: enrollmentId } as any,
    defaults: {
      card_id: cardId, enrollment_id: enrollmentId,
      program_id: card ? (card as any).program_id ?? null : null,
      week: card ? card.week ?? null : null,
      readiness: input.readiness ?? null,
      application: input.application ?? null,
      direction: input.direction ?? null,
      note: input.note ?? null,
      answers,
    } as any,
  });
  // Re-submit updates in place (idempotent). Only overwrite fields that were sent.
  const patch: any = {};
  if (input.readiness !== undefined) patch.readiness = input.readiness;
  if (input.application !== undefined) patch.application = input.application;
  if (input.direction !== undefined) patch.direction = input.direction;
  if (input.note !== undefined) patch.note = input.note;
  if (input.application_text !== undefined) patch.answers = { ...((row as any).answers || {}), application_text: input.application_text };
  if (Object.keys(patch).length) await row.update(patch);

  return {
    readiness: (row as any).readiness ?? null,
    application: (row as any).application ?? null,
    application_text: ((row as any).answers?.application_text as string) ?? null,
    direction: (row as any).direction ?? null,
    note: (row as any).note ?? null,
  };
}
