/**
 * Spark Hour - pure scheduling logic (no database, no network), so it can be unit tested.
 *
 * Spark Hour (Ali + Addie, 2026-11-16): each week Spark plans 3 weekday "Sparks" in a midday hour when
 * both are out of meetings (about 1 hour at home, or up to 90 minutes out including the drive) and 1
 * weekend date. Each person answers questions separately; Spark decides. They can change the time but
 * never pick the activity. Anything not done on its day carries to the next day ("If something is not
 * done on Monday, combine for Tuesday and so on throughout the week").
 *
 * All times here are Central (America/Chicago) wall-clock strings: dates 'YYYY-MM-DD', times 'HH:MM'.
 */

export interface Busy { date: string; start: string; end: string }
export interface Slot { date: string; start: string; maxEnd: string }

export const PROGRAM_START = '2026-11-17';
export const MIDDAY_FROM = '10:00';
export const MIDDAY_TO = '15:30';
// Evenings count too: Addie's work calendar fills 9 to 5 every weekday, which left the week with only
// the weekend date (Ali, 2026-11-18: "should be 2-3 during the week and one on the weekend").
export const EVENING_FROM = '17:30';
export const EVENING_TO = '21:30';
const EVENING_ANCHOR = 19 * 60;
const EVENING_PENALTY = 60; // midday still wins when it is open
export const MIN_WEEKDAY = 2;
export const HOME_MINUTES = 60;
export const OUT_MINUTES = 90;
export const WEEKEND_MINUTES = 180;
const STEP = 30;
const NOON = 12 * 60;

export const toMin = (hm: string): number => { const [h, m] = hm.split(':').map(Number); return h * 60 + (m || 0); };
export const fromMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** 0 = Sunday ... 6 = Saturday */
export function dow(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function mondayOf(ymd: string): string { return addDays(ymd, -((dow(ymd) + 6) % 7)); }
export function weekDates(monday: string): string[] { return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i)); }
export const isWeekday = (ymd: string): boolean => dow(ymd) >= 1 && dow(ymd) <= 5;

/** Central-time date and time for an instant. */
export function ctNow(at: Date = new Date()): { date: string; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function prettyDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}
export function prettyTime(hm: string): string {
  const m = toMin(hm); const h = Math.floor(m / 60); const mm = m % 60;
  return `${((h + 11) % 12) + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Free intervals on one date inside [from, to], after removing every busy block of every person. */
export function freeWindows(date: string, busy: Busy[], from = MIDDAY_FROM, to = MIDDAY_TO): Array<[number, number]> {
  const blocks = busy.filter((b) => b.date === date)
    .map((b) => [toMin(b.start), toMin(b.end)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let cur = toMin(from); const end = toMin(to);
  for (const [s, e] of blocks) {
    if (e <= cur) continue;
    if (s >= end) break;
    if (s > cur) out.push([cur, Math.min(s, end)]);
    cur = Math.max(cur, e);
  }
  if (cur < end) out.push([cur, end]);
  return out;
}

/** True when a slot on `date` starting at `start` is still ahead (with a 90-minute heads-up). */
export function isAhead(date: string, start: string, now: { date: string; time: string }): boolean {
  if (date > now.date) return true;
  return date === now.date && toMin(start) >= toMin(now.time) + 90;
}

/** Every possible start (30-minute steps) on the given dates where an hour fits: midday (closest to noon) first, then evenings. */
export function candidateSlots(dates: string[], busy: Busy[], now: { date: string; time: string }): Slot[] {
  const out: Array<Slot & { score: number }> = [];
  const windows: Array<[string, string, number, number]> = [[MIDDAY_FROM, MIDDAY_TO, NOON, 0], [EVENING_FROM, EVENING_TO, EVENING_ANCHOR, EVENING_PENALTY]];
  for (const date of dates) {
    if (!isWeekday(date)) continue;
    for (const [from, to, anchor, penalty] of windows) {
      for (const [s, e] of freeWindows(date, busy, from, to)) {
        for (let t = Math.ceil(s / STEP) * STEP; t + HOME_MINUTES <= e; t += STEP) {
          const start = fromMin(t);
          if (!isAhead(date, start, now)) continue;
          const maxEnd = Math.min(e, t + OUT_MINUTES);
          // Prefer the middle of the window, and a little room for an outing.
          out.push({ date, start, maxEnd: fromMin(maxEnd), score: penalty + Math.abs(t + 30 - anchor) - (maxEnd - t >= OUT_MINUTES ? 15 : 0) });
        }
      }
    }
  }
  return out.sort((a, b) => a.score - b.score || a.date.localeCompare(b.date)).map(({ score, ...s }) => s);
}

/** The best slot on each of up to `n` different days, returned in calendar order. */
export function pickWeekdaySlots(cands: Slot[], n = 3): Slot[] {
  const byDay = new Map<string, Slot>();
  for (const c of cands) if (!byDay.has(c.date)) byDay.set(c.date, c);
  let days = [...byDay.keys()].sort();
  // Spread them out: when there are more free days than needed, skip back-to-back days where possible.
  if (days.length > n) {
    const spread: string[] = [];
    for (const d of days) if (!spread.length || d > addDays(spread[spread.length - 1], 1)) spread.push(d);
    for (const d of [...days].reverse()) if (spread.length < n && !spread.includes(d)) spread.push(d); // fill from the end of the week
    days = spread.slice(0, n).sort();
  }
  return days.slice(0, n).map((d) => byDay.get(d) as Slot);
}

/** Weekend date options (Sat and Sun, morning / afternoon / evening), minus anything busy or past. */
export function weekendSlots(monday: string, busy: Busy[], now: { date: string; time: string }): Slot[] {
  const sat = addDays(monday, 5); const sun = addDays(monday, 6);
  const opts: Array<[string, string]> = [[sat, '18:30'], [sat, '10:00'], [sat, '14:00'], [sun, '10:30'], [sun, '14:00'], [sun, '17:30']];
  return opts
    .filter(([d, s]) => isAhead(d, s, now))
    .filter(([d, s]) => !busy.some((b) => b.date === d && toMin(b.start) < toMin(s) + WEEKEND_MINUTES && toMin(b.end) > toMin(s)))
    .map(([d, s]) => ({ date: d, start: s, maxEnd: fromMin(toMin(s) + WEEKEND_MINUTES) }));
}

/** Weekdays from the program start (or this Monday) through today that still have unanswered daily questions. */
export function pendingDays(today: string, answered: string[]): string[] {
  const from = [mondayOf(today), PROGRAM_START].sort()[1];
  const out: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) if (isWeekday(d) && !answered.includes(d)) out.push(d);
  return out;
}

/** Index of a weekday since the program started (0 for the first weekday), used to rotate the question bank. */
export function weekdayIndex(day: string): number {
  let n = 0;
  for (let d = PROGRAM_START; d < day; d = addDays(d, 1)) if (isWeekday(d)) n++;
  return n;
}

export interface PlanItem {
  id: string; kind: 'weekday' | 'weekend'; date: string; start: string; end: string;
  place: 'home' | 'out'; title: string; emoji: string; plan: string; why: string;
  venue: string | null; driveMinutes: number; tried: string[]; rejected: string[];
  calendarId?: string | null; eventId?: string | null;
}

export interface RawPick {
  slot?: string; place?: string; title?: string; emoji?: string; plan?: string; why?: string;
  venue?: string | null; driveMinutesEachWay?: number; minutes?: number;
}

/** Turn a model's pick into a safe plan item for a slot: enforce the time limits, never trust free text blindly. */
export function shapeItem(id: string, kind: 'weekday' | 'weekend', slot: Slot, raw: RawPick): PlanItem | null {
  const title = String(raw.title || '').trim().slice(0, 90);
  if (!title) return null;
  const room = toMin(slot.maxEnd) - toMin(slot.start);
  let place: 'home' | 'out' = raw.place === 'out' ? 'out' : 'home';
  let drive = Math.max(0, Math.round(Number(raw.driveMinutesEachWay) || 0));
  if (place === 'home') drive = 0;
  let minutes: number;
  if (kind === 'weekend') {
    if (drive > 90) return null; // the weekend date can travel, but not more than 1.5 hours each way
    minutes = Math.min(WEEKEND_MINUTES, Math.max(90, Math.round(Number(raw.minutes) || 150)));
  } else {
    if (place === 'out' && (room < OUT_MINUTES || drive > 25)) return null; // an outing needs 90 minutes, drive included
    minutes = place === 'out' ? OUT_MINUTES : HOME_MINUTES;
  }
  const clean = (s: unknown, n: number) => String(s || '').replace(/\s+/g, ' ').replace(/ ?[—–] ?/g, ', ').trim().slice(0, n);
  return {
    id, kind, date: slot.date, start: slot.start, end: fromMin(toMin(slot.start) + minutes),
    place, title: clean(title, 90), emoji: String(raw.emoji || '💘').slice(0, 4), plan: clean(raw.plan, 420), why: clean(raw.why, 300),
    venue: raw.venue ? clean(raw.venue, 120) : null, driveMinutes: drive, tried: [], rejected: [],
  };
}

/** Next time for an item: another shared free slot (weekday) or weekend option, never one already tried or taken. */
export function nextSlot(item: PlanItem, all: PlanItem[], weekdayCands: Slot[], weekendCands: Slot[]): Slot | null {
  const key = (d: string, s: string) => `${d} ${s}`;
  const tried = new Set([...item.tried, key(item.date, item.start)]);
  if (item.kind === 'weekend') return weekendCands.find((s) => !tried.has(key(s.date, s.start))) || null;
  const takenDays = new Set(all.filter((x) => x.kind === 'weekday' && x.id !== item.id).map((x) => x.date));
  const ok = weekdayCands.filter((s) => !tried.has(key(s.date, s.start)) && !takenDays.has(s.date));
  // Prefer another time the same day, then the nearest other day.
  ok.sort((a, b) => Number(a.date !== item.date) - Number(b.date !== item.date) || Math.abs(dayGap(a.date, item.date)) - Math.abs(dayGap(b.date, item.date)));
  return ok[0] || null;
}
const dayGap = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86400000;

/** The weekday before `day` (Friday for a Monday): whose game is revealed this morning. */
export function prevWeekday(day: string): string {
  let d = addDays(day, -1);
  while (!isWeekday(d)) d = addDays(d, -1);
  return d;
}

/**
 * Who won a day's game. Best score wins; a tie means both win; skipping the day counts as a loss
 * (so if only one played, they win); nobody played means no winner. Null scores = did not play.
 */
export function decideWinner(a: number | null, b: number | null): Array<'a' | 'b'> {
  if (a === null && b === null) return [];
  if (b === null || (a !== null && a > b)) return ['a'];
  if (a === null || b > a) return ['b'];
  return ['a', 'b'];
}

/** Does the current activity still fit a new slot (enough room for an outing)? */
export function fitsSlot(item: PlanItem, slot: Slot): boolean {
  if (item.kind === 'weekend') return true;
  const room = toMin(slot.maxEnd) - toMin(slot.start);
  return item.place === 'home' ? room >= HOME_MINUTES : room >= OUT_MINUTES;
}

// ---------------------------------------------------------------------------------- what was read from a calendar photo

/** One day's busy time as merged ranges (overlapping or touching blocks joined), in time order. */
export function mergeBusy(blocks: Busy[], date: string): Array<[number, number]> {
  const b = blocks.filter((x) => x.date === date).map((x) => [toMin(x.start), toMin(x.end)] as [number, number]).filter(([s, e]) => e > s).sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of b) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); else out.push([s, e]);
  }
  return out;
}

/**
 * Does a day's read look like the calendar's hour grid rather than real meetings? The first real read
 * (Addie, 2026-11-17) came back as identical back-to-back one-hour blocks from 9 to 5 on every weekday.
 * Flag a day when 6 or more distinct blocks are each exactly one hour on the hour and chain into one run
 * of 6 hours or more.
 */
export function looksLikeGrid(blocks: Busy[], date: string): boolean {
  const seen = new Set<string>();
  const hours = blocks.filter((x) => x.date === date).filter((x) => {
    const k = `${x.start}-${x.end}`; if (seen.has(k)) return false; seen.add(k);
    return toMin(x.end) - toMin(x.start) === 60 && x.start.endsWith(':00');
  });
  if (hours.length < 6) return false;
  return mergeBusy(hours, date).some(([s, e]) => e - s >= 360);
}

/** Drop every block on `date` that overlaps [start, end): "that is wrong, I am open then". */
export function removeRange(blocks: Busy[], date: string, start: string, end: string): Busy[] {
  const s = toMin(start); const e = toMin(end);
  return blocks.filter((x) => !(x.date === date && toMin(x.start) < e && toMin(x.end) > s));
}

const PRIZE_FILLER = new Set(['with', 'your', 'from', 'that', 'this', 'just', 'tonight', 'minute', 'minutes', 'somewhere', 'hidden', 'surprise', 'made', 'little', 'special', 'choice']);
const prizeWords = (s: string): Set<string> => new Set(String(s).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
  .filter((w) => w.length >= 4 && !PRIZE_FILLER.has(w)).map((w) => w.replace(/s$/, '')));

/** Two prizes are "the same prize" when most of the shorter one's real words are in the other (love note vs love note in a pocket). */
export function similarPrize(a: string, b: string): boolean {
  const x = prizeWords(a); const y = prizeWords(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.min(x.size, y.size) >= 0.5;
}

/** Weekday work hours to assume for someone whose new calendar photo is not in yet, so Sparks land in the evening. */
export function assumedWorkHours(week: string): Busy[] {
  return weekDates(week).filter(isWeekday).map((date) => ({ date, start: '08:00', end: '17:30' }));
}
