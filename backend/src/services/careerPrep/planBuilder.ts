import { centralDate, previousDate } from './readiness';

/**
 * Career Prep v27, CP4.1 (kit P4.4): the plan, built DETERMINISTICALLY (no model in the structure).
 *
 *   days     one short session a day from today to the day BEFORE the interview (never on or after it),
 *            at most 14 sessions; each targets the next weakest skill; the day before the interview is always
 *            the Full rehearsal (with a far interview: the first 13 days, then the day before).
 *            A practice interview uses its practice window instead. An interview today = one session today.
 *   tonight  one 15-minute session today on the weakest skill.
 *   full     one 30-minute Full rehearsal today (Cora as the hiring manager, then a critique).
 *   custom   one session today of 10, 20 or 45 minutes on a chosen skill.
 *
 * Session shapes. 20 min: Warm up 2, Learn 4, Try 8, Pressure round 5, Cool down 1. The kit's Watch
 * segment (3 min, an approved answer from the Answer Library) is left out until that library exists,
 * and its minutes go to Try. 15 min or less: Warm up, Learn, Try, Cool down. 45 min: a longer version.
 * Dates are Central calendar dates. A day carries its DATE only: "Today" and "Tomorrow" are worked out
 * when the plan is shown, so a plan read tomorrow never calls yesterday "Today".
 */
export type SegmentKind = 'warmup' | 'learn' | 'try' | 'pressure' | 'cooldown' | 'rehearsal';
export interface Segment { kind: SegmentKind; title: string; minutes: number; targetSkill?: string }
export interface PlanDay { date: string; segments: Segment[] }
export type PlanKind = 'days' | 'tonight' | 'full' | 'custom';
export interface Plan { kind: PlanKind; minutes: number; days: PlanDay[] }
export interface PlanInput {
  kind: PlanKind;
  now: Date;
  interview: { startsAt: Date | null; practiceUntil: string | null };
  /** Scored skills, weakest first: [key, label]. */
  weakest: ReadonlyArray<{ key: string; label: string }>;
  minutes?: 10 | 20 | 45;
  focus?: { key: string; label: string };
}

const MAX_DAYS = 14;

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** The segments of one session of `minutes`, aimed at `skill` (when there is one). */
export function session(minutes: 10 | 15 | 20 | 45, skill?: { key: string; label: string }): Segment[] {
  const t = skill ? { targetSkill: skill.key } : {};
  const learn = skill ? `Learn: ${skill.label}` : 'Learn';
  if (minutes === 10) return [{ kind: 'warmup', title: 'Warm up', minutes: 1 }, { kind: 'learn', title: learn, minutes: 3, ...t }, { kind: 'try', title: 'Try it on camera', minutes: 5, ...t }, { kind: 'cooldown', title: 'Cool down', minutes: 1 }];
  if (minutes === 15) return [{ kind: 'warmup', title: 'Warm up', minutes: 2 }, { kind: 'learn', title: learn, minutes: 4, ...t }, { kind: 'try', title: 'Try it on camera', minutes: 8, ...t }, { kind: 'cooldown', title: 'Cool down', minutes: 1 }];
  if (minutes === 45) return [{ kind: 'warmup', title: 'Warm up', minutes: 3 }, { kind: 'learn', title: learn, minutes: 8, ...t }, { kind: 'try', title: 'Try it on camera', minutes: 14, ...t }, { kind: 'pressure', title: 'Pressure round', minutes: 15, ...t }, { kind: 'cooldown', title: 'Cool down', minutes: 5 }];
  return [{ kind: 'warmup', title: 'Warm up', minutes: 2 }, { kind: 'learn', title: learn, minutes: 4, ...t }, { kind: 'try', title: 'Try it on camera', minutes: 8, ...t }, { kind: 'pressure', title: 'Pressure round', minutes: 5, ...t }, { kind: 'cooldown', title: 'Cool down', minutes: 1 }];
}

export function rehearsal(): Segment[] {
  return [{ kind: 'warmup', title: 'Warm up', minutes: 2 }, { kind: 'rehearsal', title: 'Full rehearsal with Cora as the hiring manager', minutes: 25 }, { kind: 'cooldown', title: 'Cool down and critique', minutes: 3 }];
}

const total = (segs: Segment[]) => segs.reduce((a, s) => a + s.minutes, 0);

/** The Central dates a days plan covers: today up to the day before the interview, or the practice window. */
export function planDates(now: Date, interview: PlanInput['interview']): string[] {
  const today = centralDate(now);
  const last = interview.startsAt ? previousDate(centralDate(interview.startsAt)) : interview.practiceUntil ?? today;
  if (last < today) return [today]; // the interview is today: one session now
  const out: string[] = [];
  for (let d = today; d <= last; d = nextDate(d)) out.push(d);
  // A far interview: the first MAX_DAYS - 1 days, then the day before it (the rehearsal stays last).
  return out.length > MAX_DAYS ? [...out.slice(0, MAX_DAYS - 1), out[out.length - 1]] : out;
}

export function buildPlan(input: PlanInput): Plan {
  const today = centralDate(input.now);
  const day = (date: string, segments: Segment[]): PlanDay => ({ date, segments });
  const weakest = input.weakest;
  if (input.kind === 'full') return { kind: 'full', minutes: 30, days: [day(today, rehearsal())] };
  if (input.kind === 'tonight') return { kind: 'tonight', minutes: 15, days: [day(today, session(15, weakest[0]))] };
  if (input.kind === 'custom') {
    const minutes = input.minutes ?? 20;
    return { kind: 'custom', minutes, days: [day(today, session(minutes, input.focus ?? weakest[0]))] };
  }
  const dates = planDates(input.now, input.interview);
  const days = dates.map((date, i) => (i === dates.length - 1 && dates.length > 1
    ? day(date, rehearsal())
    : day(date, session(20, weakest.length ? weakest[i % weakest.length] : undefined))));
  return { kind: 'days', minutes: total(days[0].segments), days };
}
