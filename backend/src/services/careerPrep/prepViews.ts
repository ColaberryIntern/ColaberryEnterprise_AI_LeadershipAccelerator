import { NO_INTERVIEW, PREP_SKILLS } from '../../db/ensureCareerPrepSchema';
import { centralDate, centralWeekStart, minutesThisWeek, previousDate, readiness, skillReading, streak, targetFor, type SkillReading } from './readiness';
import type { PrepData, PrepInterview } from './prepData';

/**
 * Career Prep v27, CP1.5: PURE builders for the dashboard and the floor/card summary.
 * NO INVENTED DATA: a value that cannot be computed is OMITTED (undefined), never 0. The routes
 * validate these shapes at the boundary.
 */
export interface InterviewView {
  id: string; source: PrepInterview['source']; company: string; role: string; type: PrepInterview['type'];
  startsAt?: string; readiness?: number; target: number; questions?: string[];
}
export interface SkillView { key: string; label: string; score?: number; change30?: number; count: number; sources: string[] }
export interface Dashboard {
  anchorId?: string;
  /** target is the anchor interview's "ready at"; absent with no anchor (never a made-up default). */
  readiness?: { value: number; target?: number; changeSinceFirst?: number; trend: Array<{ week: string; value: number }> };
  interviews: InterviewView[];
  skills: SkillView[];
  sources: { video: number; phone_mock: number; real_interview: number; training: number; project: number };
  weeklyMinutes: Array<{ week: string; minutes: number }>;
  streak: number;
  thisWeek: number;
}

const LABEL = new Map(PREP_SKILLS.map((s) => [s.key, s.label]));

export function readingsFor(data: PrepData, now: Date): SkillReading[] {
  return PREP_SKILLS.map((s) => skillReading(data.observations, s.key, now));
}

function interviewView(i: PrepInterview, readings: SkillReading[]): InterviewView {
  const r = readiness(readings, i.type);
  return {
    id: i.id, source: i.source, company: i.company, role: i.role, type: i.type,
    ...(i.startsAt ? { startsAt: i.startsAt.toISOString() } : {}),
    ...(r !== null ? { readiness: r } : {}),
    target: targetFor(i.type, i.targetReadiness),
    ...(i.questions && i.questions.length ? { questions: i.questions } : {}),
  };
}

/** Soonest dated interview still ahead, else the newest practice one. */
export function defaultAnchor(interviews: PrepInterview[], now: Date): PrepInterview | undefined {
  return interviews.find((i) => i.startsAt && i.startsAt.getTime() >= now.getTime()) ?? interviews.find((i) => i.source === 'practice');
}

/** The last readiness value in each Central week (week = its Monday), oldest first. */
function weeklyTrend(data: PrepData, interviewId: string): Array<{ week: string; value: number }> {
  const byWeek = new Map<string, number>();
  for (const t of data.trend) {
    if (t.interviewId !== interviewId || t.readiness === null) continue;
    byWeek.set(centralWeekStart(new Date(`${t.date}T18:00:00Z`)), t.readiness);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, value]) => ({ week, value }));
}

function weeklyMinutes(data: PrepData, now: Date, weeks = 8): Array<{ week: string; minutes: number }> {
  const out: Array<{ week: string; minutes: number }> = [];
  let monday = centralWeekStart(now);
  for (let w = 0; w < weeks; w++) {
    // Any instant inside that Central week works: minutesThisWeek compares calendar dates.
    const sundayNoon = new Date(Date.parse(`${monday}T18:00:00Z`) + 6 * 86_400_000);
    out.unshift({ week: monday, minutes: minutesThisWeek(data.sessions, sundayNoon) });
    for (let d = 0; d < 7; d++) monday = previousDate(monday);
  }
  return out;
}

export function buildDashboard(data: PrepData, now: Date, anchorId?: string): Dashboard {
  const readings = readingsFor(data, now);
  const anchor = anchorId ? data.interviews.find((i) => i.id === anchorId) : defaultAnchor(data.interviews, now);
  const value = readiness(readings, anchor?.type ?? null);
  const trend = weeklyTrend(data, anchor?.id ?? NO_INTERVIEW);
  const sources = { video: 0, phone_mock: 0, real_interview: 0, training: 0, project: 0 };
  for (const ref of new Set(data.sourceRefs.map((s) => `${s.source}|${s.ref}`))) sources[ref.split('|')[0] as keyof typeof sources]++;
  return {
    ...(anchor ? { anchorId: anchor.id } : {}),
    ...(value !== null ? { readiness: {
      value,
      ...(anchor ? { target: targetFor(anchor.type, anchor.targetReadiness) } : {}),
      ...(trend.length >= 2 ? { changeSinceFirst: Math.round((value - trend[0].value) * 10) / 10 } : {}),
      trend,
    } } : {}),
    interviews: data.interviews.map((i) => interviewView(i, readings)),
    skills: readings
      .map((r) => ({ key: r.skill, label: LABEL.get(r.skill) ?? r.skill, count: r.count, sources: r.sources,
        ...(r.score !== null ? { score: r.score } : {}), ...(r.change30 !== null ? { change30: r.change30 } : {}) }))
      .sort((a, b) => (a.score ?? 101) - (b.score ?? 101)),
    sources,
    weeklyMinutes: weeklyMinutes(data, now),
    streak: streak(data.sessions, now),
    thisWeek: minutesThisWeek(data.sessions, now),
  };
}

export interface Summary {
  firstName?: string;
  nextInterview?: InterviewView;
  stops: { readiness?: number; readyAt?: number; streak?: number; thisWeek?: number };
  interviews: InterviewView[];
  /** CP5.1: how many dated interviews there are in all (the card shows 2 and "+n more"). */
  interviewCount: number;
  /** CP5.1: minutes planned for today (Central) in the next interview's active plan; absent when none. */
  sessionMinutes?: number;
  today: string;
}

function todaysMinutes(data: PrepData, interviewId: string | null, today: string): { sessionMinutes?: number } {
  const plan = (data.plans ?? []).find((p) => p.interviewId === interviewId);
  const minutes = plan?.days.find((d) => d.date === today)?.minutes ?? 0;
  return minutes > 0 ? { sessionMinutes: minutes } : {};
}

/** The floor screen, the door and the campus card all read this. Stops with no data are omitted. */
export function buildSummary(data: PrepData, now: Date): Summary {
  const d = buildDashboard(data, now);
  const next = d.interviews.find((i) => i.id === d.anchorId);
  return {
    ...(data.firstName ? { firstName: data.firstName } : {}),
    ...(next ? { nextInterview: next } : {}),
    stops: {
      ...(d.readiness ? { readiness: d.readiness.value } : {}),
      ...(d.readiness?.target !== undefined ? { readyAt: d.readiness.target } : {}),
      ...(d.streak > 0 ? { streak: d.streak } : {}),
      ...(d.thisWeek > 0 ? { thisWeek: d.thisWeek } : {}),
    },
    interviews: d.interviews.filter((i) => i.startsAt).slice(0, 3),
    interviewCount: d.interviews.filter((i) => i.startsAt).length,
    ...todaysMinutes(data, next?.id ?? null, centralDate(now)),
    today: centralDate(now),
  };
}
