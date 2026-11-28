/**
 * Calendar math for Jackie's event brief (WL4.4). Pure, so every edge is a unit test: the class time in
 * four US zones on the air date (daylight saving included), the US holidays that fall in a promotion
 * week, and the promotion slots fitted between today and the air date.
 *
 * Dates are calendar days (YYYY-MM-DD) in Central time; the class is Mondays 6:30 PM Central.
 */
export const CLASS_TZ = 'America/Chicago';
const ZONES: readonly [string, string][] = [['CT', 'America/Chicago'], ['ET', 'America/New_York'], ['MT', 'America/Denver'], ['PT', 'America/Los_Angeles']];

const day = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number): string => { const d = day(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const daysBetween = (from: string, to: string): number => Math.round((day(to).getTime() - day(from).getTime()) / 86_400_000);
const weekday = (s: string) => day(s).getUTCDay(); // 0 Sunday
export const label = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => day(s).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

/** The UTC instant of 6:30 PM Central on a date, whatever the daylight-saving offset that day. */
export function classStart(airDate: string, hour = 18, minute = 30): Date {
  for (const offset of [5, 6]) { // CDT is UTC-5, CST is UTC-6
    const at = new Date(Date.UTC(Number(airDate.slice(0, 4)), Number(airDate.slice(5, 7)) - 1, Number(airDate.slice(8, 10)), hour + offset, minute));
    const local = new Intl.DateTimeFormat('en-US', { timeZone: CLASS_TZ, hour: 'numeric', minute: '2-digit', hour12: false }).format(at);
    if (local === `${hour}:${String(minute).padStart(2, '0')}`) return at;
  }
  throw new RangeError(`no 6:30 PM Central on ${airDate}`);
}

/** "6:30 PM CT · 7:30 PM ET · 5:30 PM MT · 4:30 PM PT" */
export function classTimes(airDate: string): { zone: string; time: string }[] {
  const at = classStart(airDate);
  return ZONES.map(([zone, tz]) => ({ zone, time: new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(at) }));
}

/** The nth weekday (0 Sunday) of a month, or the last one when n is -1. */
function nthWeekday(year: number, month: number, dow: number, n: number): string {
  if (n === -1) { const d = new Date(Date.UTC(year, month + 1, 0, 12)); while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() - 1); return iso(d); }
  const d = new Date(Date.UTC(year, month, 1, 12)); while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + 7 * (n - 1)); return iso(d);
}

/** US days that change what people do online: the posts should know about them. */
export function holidays(year: number): Map<string, string> {
  const fixed = (m: number, d: number) => iso(new Date(Date.UTC(year, m, d, 12)));
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  return new Map([
    [fixed(0, 1), "New Year's Day"], [nthWeekday(year, 0, 1, 3), 'Martin Luther King Jr. Day'], [fixed(1, 14), "Valentine's Day"],
    [nthWeekday(year, 1, 1, 3), "Presidents' Day"], [nthWeekday(year, 4, 1, -1), 'Memorial Day'], [fixed(5, 19), 'Juneteenth'],
    [fixed(6, 4), 'Independence Day'], [nthWeekday(year, 8, 1, 1), 'Labor Day'], [fixed(9, 31), 'Halloween'],
    [thanksgiving, 'Thanksgiving'], [addDays(thanksgiving, 1), 'Black Friday'], [addDays(thanksgiving, 4), 'Cyber Monday'],
    [fixed(11, 24), 'Christmas Eve'], [fixed(11, 25), 'Christmas Day'], [fixed(11, 31), "New Year's Eve"],
  ]);
}
export const holidayOn = (s: string): string | null => holidays(Number(s.slice(0, 4))).get(s) ?? null;

export interface PromoSlot { id: string; date: string; when: string; who: string; task: string; holiday: string | null; }

/**
 * The promotion week: from `today` (the day the brief is written) to the air date, one slot a day plus
 * the day-of reminders. A short runway keeps the essentials only (create + announce, the day before,
 * noon, one hour before). Holidays are named on their slot so the posts can lean on them.
 */
export function promotionSlots(today: string, airDate: string): PromoSlot[] {
  const runway = daysBetween(today, airDate);
  if (runway < 0) throw new RangeError('the air date is in the past');
  const slot = (id: string, date: string, when: string, task: string, who = 'Jackie'): PromoSlot => ({ id, date, when, who, task, holiday: holidayOn(date) });
  const out: PromoSlot[] = [];
  if (runway >= 1) out.push(slot('announce', today, label(today), 'Create the Eventbrite event and thumbnail 1. Announce with post A and the event link.'));
  const middle = [];
  for (let d = addDays(today, 1); daysBetween(d, airDate) >= 2; d = addDays(d, 1)) middle.push(d);
  const tasks = ['Post B with thumbnail 4.', 'Post C with thumbnail 2, or the parody Short if Piyush has it ready.', 'Quote card from the class promise.', 'Post B again on another channel, with thumbnail 3.'];
  middle.slice(-4).forEach((d, k) => out.push(slot(`day${k + 1}`, d, label(d), tasks[k])));
  if (runway >= 1) out.push(slot('tomorrow', addDays(airDate, -1), label(addDays(airDate, -1)), '"Tomorrow" reminder with thumbnail 3.'));
  out.push(slot('noon', airDate, `${label(airDate)} · noon`, '"Tonight at 6:30 PM CT" reminder.'));
  out.push(slot('hour', airDate, `${label(airDate)} · 5:30 PM`, '"Starting in one hour" reminder with the Zoom link.'));
  out.push(slot('live', airDate, `${label(airDate)} · 6:30 PM CT`, 'Live session. Piyush gets the video the next day.', 'Ali'));
  if (runway === 0) out.unshift(slot('announce', today, label(today), 'Create the Eventbrite event now; same-day class, reminders only.'));
  return out;
}

/** Jackie's to-do is due two days after approval, never after the air date. */
export function briefDueOn(approvedOn: string, airDate: string): string {
  const due = addDays(approvedOn, 2);
  return daysBetween(due, airDate) < 0 ? airDate : due;
}

export const isMonday = (s: string): boolean => weekday(s) === 1;
