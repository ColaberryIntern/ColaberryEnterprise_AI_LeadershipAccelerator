/**
 * hireSlots - the open interview times for one candidate. PURE: no I/O, no clock, so every
 * rule is unit-tested, including the DST edges.
 *
 *   blocks          the candidate's weekly grid, `Mon-morning` ... `Fri-evening`, in THEIR zone
 *                   (morning 9-12, afternoon 12-5, evening 5-8; kit §3.4).
 *   a slot          starts on the half hour inside a block and ends inside it, so a 60-minute
 *                   working session never runs past the block the candidate opened.
 *   removed         anything sooner than `now + min notice`; anything overlapping an interview
 *                   that already holds a time; every slot in a week (Mon-Sun, candidate's zone)
 *                   that already has `max_per_week` holding interviews; every observed US federal
 *                   holiday (the candidate's calendar date), from the same calendar the gov build
 *                   schedule uses, so nobody is booked on Thanksgiving or the 4th of July.
 *
 * Times are computed as WALL-CLOCK in the candidate's zone and converted to UTC per slot, so
 * "Mon 9:00 AM Central" is 14:00Z under CDT and 15:00Z under CST. The conversion is per date,
 * which is what keeps a week that crosses a DST change correct.
 */

import { dayKey, usFederalHolidays } from '../factory/govWorkingDays';

export const BLOCK_HOURS = { morning: [9, 12], afternoon: [12, 17], evening: [17, 20] } as const;
export type BlockPart = keyof typeof BLOCK_HOURS;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const BLOCK_KEYS: readonly string[] = WEEKDAYS.flatMap((d) => (Object.keys(BLOCK_HOURS) as BlockPart[]).map((p) => `${d}-${p}`));

export const FORMATS = {
  intro: { name: 'Intro call', minutes: 20 },
  walkthrough: { name: 'Case study walkthrough', minutes: 45 },
  working: { name: 'Working session', minutes: 60 },
} as const;
export type InterviewFormat = keyof typeof FORMATS;
export const FORMAT_IDS = Object.keys(FORMATS) as InterviewFormat[];

export const SLOT_STEP_MINUTES = 30;
export const WINDOW_DAYS = 14;
const MIN = 60_000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The observed holidays a window starting in `year` can touch. The public endpoint clamps the
 * start to 60 days out and the window is 14, so it crosses at most one New Year; next year's set
 * also carries a Saturday New Year's Day observed on 31 December.
 */
function holidaysFrom(year: number): Set<string> {
  return new Set([...usFederalHolidays(year), ...usFederalHolidays(year + 1)]);
}

/** True for a zone Intl knows (IANA), so a bad `tz=` is a 400, not a throw deep inside. */
export function isTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

interface Parts { y: number; m: number; d: number; hh: number; mm: number }

function partsIn(t: number, tz: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { y: p.year, m: p.month, d: p.day, hh: p.hour % 24, mm: p.minute };
}

/** The zone's offset from UTC at instant t, in ms (CDT = -5h). */
function offsetAt(t: number, tz: string): number {
  const p = partsIn(t, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Math.floor(t / MIN) * MIN;
}

/** A wall-clock time in `tz` as a UTC instant. Correct on both sides of a DST change. */
export function wallToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetAt(guess, tz);
  const second = guess - offsetAt(t, tz);
  if (second !== t) t = second;
  return new Date(t);
}

/** The calendar date of instant t in `tz`, as YYYY-MM-DD. */
export function localDate(t: Date, tz: string): string {
  const p = partsIn(t.getTime(), tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** The Monday (YYYY-MM-DD) of the candidate-zone week that instant t falls in. */
export function weekOf(t: Date, tz: string): string {
  const p = partsIn(t.getTime(), tz);
  const dayIdx = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sun
  const monday = new Date(Date.UTC(p.y, p.m - 1, p.d - ((dayIdx + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

export interface SlotRules {
  readonly tz: string;
  readonly blocks: readonly string[];
  readonly maxPerWeek: number | null;
  readonly minNoticeHours: number;
}

export interface HeldTime { readonly startsAt: Date; readonly minutes: number }

export interface SlotQuery {
  readonly minutes: number;
  /** The first candidate-zone day considered (YYYY-MM-DD). */
  readonly fromDate: string;
  readonly now: Date;
  readonly held: readonly HeldTime[];
  readonly days?: number;
}

/** Every open start time, ascending, as UTC Dates. */
export function openSlots(rules: SlotRules, q: SlotQuery): Date[] {
  const open = new Set(rules.blocks.filter((b) => BLOCK_KEYS.includes(b)));
  if (!open.size || q.minutes <= 0) return [];
  const earliest = q.now.getTime() + Math.max(0, rules.minNoticeHours) * 3_600_000;
  const perWeek = new Map<string, number>();
  for (const h of q.held) perWeek.set(weekOf(h.startsAt, rules.tz), (perWeek.get(weekOf(h.startsAt, rules.tz)) ?? 0) + 1);
  const overlaps = (s: number, e: number) => q.held.some((h) => {
    const hs = h.startsAt.getTime();
    return s < hs + h.minutes * MIN && hs < e;
  });

  const [fy, fm, fd] = q.fromDate.split('-').map(Number);
  const holidays = holidaysFrom(fy);
  const out: Date[] = [];
  for (let i = 0; i < (q.days ?? WINDOW_DAYS); i++) {
    const day = new Date(Date.UTC(fy, fm - 1, fd + i));
    const y = day.getUTCFullYear(); const m = day.getUTCMonth() + 1; const d = day.getUTCDate();
    const dow = DAY_NAMES[day.getUTCDay()];
    if (holidays.has(dayKey(day))) continue;
    for (const part of Object.keys(BLOCK_HOURS) as BlockPart[]) {
      if (!open.has(`${dow}-${part}`)) continue;
      const [startH, endH] = BLOCK_HOURS[part];
      for (let off = 0; off + q.minutes <= (endH - startH) * 60; off += SLOT_STEP_MINUTES) {
        const start = wallToUtc(y, m, d, startH + Math.floor(off / 60), off % 60, rules.tz);
        const s = start.getTime();
        const e = s + q.minutes * MIN;
        if (s < earliest || overlaps(s, e)) continue;
        if (rules.maxPerWeek !== null && (perWeek.get(weekOf(start, rules.tz)) ?? 0) >= rules.maxPerWeek) continue;
        out.push(start);
      }
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}
