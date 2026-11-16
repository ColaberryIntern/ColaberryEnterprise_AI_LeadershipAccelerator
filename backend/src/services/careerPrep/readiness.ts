import config from './readinessWeights.json';

/**
 * Career Prep v27, CP1.3 (kit P5 "Readiness"). PURE: no I/O, no clock unless passed in.
 *
 *   skill score   recency-weighted mean of the skill's observations in the last 60 days,
 *                 weight = source weight x observation weight x 0.5^(age days / 14).
 *                 Fewer than 3 observations in the window = not enough data (null).
 *   30-day change today's skill score minus the score as of 30 days ago (null if either is null).
 *   readiness     weighted mean of the skill scores that have data, with per-interview-type skill
 *                 weights (unlisted skills weigh 1). Fewer than 5 such skills = hidden (null).
 *   target        default "ready at" per interview type (recruiter 65, hiring manager 75,
 *                 technical 75, behavioral 70); a recruiter may override it on the interview.
 *   streak        consecutive Central days with at least one finished session, counted back from
 *                 today (from yesterday when today has none yet, so the streak is not "lost" at 8 AM).
 *   this week     minutes active Monday to Sunday, Central.
 *
 * Every weight and threshold is in readinessWeights.json, not here.
 */
export type ObservationSource = 'video' | 'phone_mock' | 'real_interview' | 'training' | 'project';
export type InterviewType = 'recruiter' | 'hiring_manager' | 'technical' | 'behavioral';
export interface Observation { skill: string; value: number; source: ObservationSource; observedAt: Date; weight?: number }
export interface SessionTime { startedAt: Date; secondsActive: number; status: string }
export interface SkillReading { skill: string; score: number | null; change30: number | null; count: number; sources: ObservationSource[] }

const DAY_MS = 86_400_000;
const TZ = 'America/Chicago';

/** The Central calendar date (YYYY-MM-DD) of an instant. */
export function centralDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function inWindow(obs: Observation[], skill: string, asOf: Date): Observation[] {
  const from = asOf.getTime() - config.windowDays * DAY_MS;
  return obs.filter((o) => o.skill === skill && o.observedAt.getTime() <= asOf.getTime() && o.observedAt.getTime() > from);
}

/** The skill's score as of `asOf`, or null with fewer than the minimum observations. */
export function skillScore(obs: Observation[], skill: string, asOf: Date): number | null {
  const rows = inWindow(obs, skill, asOf);
  if (rows.length < config.minObservationsPerSkill) return null;
  let sum = 0;
  let weights = 0;
  for (const o of rows) {
    const age = (asOf.getTime() - o.observedAt.getTime()) / DAY_MS;
    const w = (config.sourceWeights[o.source] ?? 1) * (o.weight ?? 1) * 0.5 ** (age / config.halfLifeDays);
    sum += w * o.value;
    weights += w;
  }
  return weights > 0 ? round1(sum / weights) : null;
}

export function skillReading(obs: Observation[], skill: string, asOf: Date): SkillReading {
  const score = skillScore(obs, skill, asOf);
  const before = skillScore(obs, skill, new Date(asOf.getTime() - 30 * DAY_MS));
  const rows = inWindow(obs, skill, asOf);
  return {
    skill, score, count: rows.length,
    change30: score !== null && before !== null ? round1(score - before) : null,
    sources: [...new Set(rows.map((o) => o.source))].sort(),
  };
}

/** Readiness for an interview type, or null when fewer than the minimum skills have data. */
export function readiness(readings: SkillReading[], type: InterviewType | null): number | null {
  const scored = readings.filter((r) => r.score !== null);
  if (scored.length < config.minSkillsForReadiness) return null;
  const weights: Record<string, number> = (type && config.skillWeightsByType[type]) || {};
  let sum = 0;
  let total = 0;
  for (const r of scored) {
    const w = weights[r.skill] ?? 1;
    sum += w * (r.score as number);
    total += w;
  }
  return round1(sum / total);
}

export function targetFor(type: InterviewType, override?: number | null): number {
  return typeof override === 'number' ? override : config.targets[type];
}

/** Consecutive Central days with a finished session, back from today (or yesterday). */
export function streak(sessions: SessionTime[], now: Date): number {
  const days = new Set(sessions.filter((s) => s.status === 'finished').map((s) => centralDate(s.startedAt)));
  let cursor = new Date(now.getTime());
  if (!days.has(centralDate(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
  let n = 0;
  while (days.has(centralDate(cursor))) {
    n++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return n;
}

/** Monday (Central) of the week containing `now`, as YYYY-MM-DD. */
export function centralWeekStart(now: Date): string {
  const today = centralDate(now);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const back = (dow + 6) % 7;
  return new Date(Date.parse(`${today}T12:00:00Z`) - back * DAY_MS).toISOString().slice(0, 10);
}

/** Minutes active this Central week (Monday to Sunday), rounded down. */
export function minutesThisWeek(sessions: SessionTime[], now: Date): number {
  const start = centralWeekStart(now);
  const today = centralDate(now);
  const secs = sessions
    .filter((s) => { const d = centralDate(s.startedAt); return d >= start && d <= today; })
    .reduce((a, s) => a + Math.max(0, s.secondsActive), 0);
  return Math.floor(secs / 60);
}
