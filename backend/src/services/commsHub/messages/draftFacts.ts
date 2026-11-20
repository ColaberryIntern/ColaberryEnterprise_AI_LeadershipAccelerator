import type CommsHubEvent from '../../../models/CommsHubEvent';
import { BANNED_COPY_RULES, ruleRegex } from '../../content/bannedCopyRule';
import { CENTRAL_TZ } from '../../centralDate';
import { expandOccurrences } from '../eventRecurrence';

/**
 * Facts by code (CH6.3). The model writes the prose and marks where a fact goes with a placeholder;
 * code fills every placeholder from the event record, in Central time. Then a pure validator decides
 * whether a draft may be submitted for approval: an event draft must state the event's correct Central
 * date and time, and no draft may state another date or time, leave a placeholder unfilled, or use a
 * word the TWC rules ban (the canonical rule in services/content/bannedCopyRule.ts).
 */
export const PLACEHOLDERS = ['{{DATE}}', '{{TIME}}', '{{JOIN_LINK}}', '{{REGISTRATION_LINK}}', '{{HOSTS}}'] as const;

export interface DraftFacts {
  /** "Tuesday, December 1" (Central). */
  date: string;
  /** "6:00 PM CST" (Central, CST or CDT as the date requires). */
  time: string;
  join_link: string | null;
  registration_link: string | null;
  /** "Aleem (Design) and Sai", or null when the event names no hosts. */
  hosts: string | null;
  starts_at: Date;
  /** The same instant as numbers on the Central clock, for comparing whatever form a draft states it in. */
  central: CentralParts;
  /** Minutes after Central midnight the occurrence ends, or null when the event has no end time. */
  end_minutes: number | null;
}

export interface CentralParts { year: number; month: number; day: number; weekday: number; minutes: number; zone: 'CST' | 'CDT' }

const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZoneName: 'short' });
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function centralParts(d: Date): CentralParts {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day), weekday: WEEKDAY_INDEX[p.weekday],
    minutes: Number(p.hour) * 60 + Number(p.minute), zone: p.timeZoneName === 'CDT' ? 'CDT' : 'CST',
  };
}

const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, weekday: 'long', month: 'long', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

function joinNames(names: string[]): string | null {
  if (!names.length) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The facts for the occurrence a message is about: the one it was created for (a promotion-plan
 * message), else the event's next date that has not started, else its first date.
 */
export function factsFor(e: Pick<CommsHubEvent, 'starts_at' | 'ends_at' | 'repeat_rule' | 'join_url' | 'registration_url' | 'hosts'>, occurrence: Date | null, now: Date = new Date()): DraftFacts {
  const startsAt = occurrence ?? expandOccurrences(e.starts_at, e.ends_at, e.repeat_rule).find((o) => o.starts_at.getTime() >= now.getTime())?.starts_at ?? e.starts_at;
  const endsAt = e.ends_at ? new Date(startsAt.getTime() + (e.ends_at.getTime() - e.starts_at.getTime())) : null;
  return {
    central: centralParts(startsAt),
    end_minutes: endsAt ? centralParts(endsAt).minutes : null,
    date: dateFmt.format(startsAt),
    time: timeFmt.format(startsAt),
    join_link: e.join_url ?? null,
    registration_link: e.registration_url ?? null,
    hosts: joinNames((e.hosts ?? []).map((h) => (h.role ? `${h.name} (${h.role})` : h.name))),
    starts_at: startsAt,
  };
}

/** Fill every placeholder from the facts. A fact the event does not have leaves its placeholder, which the validator reports. */
export function fillFacts(text: string, f: DraftFacts | null): string {
  if (!f) return text;
  return text
    .split('{{DATE}}').join(f.date)
    .split('{{TIME}}').join(f.time)
    .split('{{JOIN_LINK}}').join(f.join_link ?? '{{JOIN_LINK}}')
    .split('{{REGISTRATION_LINK}}').join(f.registration_link ?? '{{REGISTRATION_LINK}}')
    .split('{{HOSTS}}').join(f.hosts ?? '{{HOSTS}}');
}

/* ---------------------------------------------------------------------------------------------
 * The submit/approve validator. It READS every date, day and time a draft states, in any common
 * form, as values (month + day, weekday, minutes on the clock, zone) and compares them with the
 * event's, so correct text passes however it is written ("6 PM", "6:00 p.m. CST", "Dec 1",
 * "Tuesday, December 1") and wrong text is named ("7pm ET", "18:00", "12/2", "Weds", "tomorrow").
 * ------------------------------------------------------------------------------------------- */
const MONTH_NUM: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';
const ORD = '(?:st|nd|rd|th)?';
const DATE_FORMS: Array<[RegExp, (m: RegExpExecArray) => { month: number; day: number; year?: number } | null]> = [
  [new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})${ORD}\\b(?:,?\\s+(\\d{4}))?`, 'gi'), (m) => ({ month: MONTH_NUM[m[1].toLowerCase()], day: Number(m[2]), year: m[3] ? Number(m[3]) : undefined })],
  [new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?(${MONTH})\\b\\.?(?:,?\\s+(\\d{4}))?`, 'gi'), (m) => ({ month: MONTH_NUM[m[2].toLowerCase()], day: Number(m[1]), year: m[3] ? Number(m[3]) : undefined })],
  [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) })],
  [/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (m) => ({ month: Number(m[1]), day: Number(m[2]), year: m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : undefined })],
];
const NUMBER_WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const ZONE = '(CST|CDT|CT|Central(?:\\s+Time)?|EST|EDT|ET|Eastern(?:\\s+Time)?|PST|PDT|PT|Pacific(?:\\s+Time)?|MST|MDT|MT|Mountain(?:\\s+Time)?|UTC|GMT)';
const MERIDIEM = '(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)';
const to24 = (h: number, mer: string | undefined): number => {
  if (!mer) return h;
  const pm = /^p/i.test(mer);
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
};
type TimeMention = { text: string; minutes: number; zone: string | null };
const TIME_FORMS: Array<[RegExp, (m: RegExpExecArray) => TimeMention]> = [
  [new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*${MERIDIEM}(?:\\s+${ZONE})?`, 'gi'), (m) => ({ text: m[0], minutes: to24(Number(m[1]), m[3]) * 60 + Number(m[2] ?? 0), zone: m[4] ?? null })],
  [new RegExp(`\\b(${Object.keys(NUMBER_WORD).join('|')})(?:\\s+o'?clock)?\\s*${MERIDIEM}(?:\\s+${ZONE})?`, 'gi'), (m) => ({ text: m[0], minutes: to24(NUMBER_WORD[m[1].toLowerCase()], m[2]) * 60, zone: m[3] ?? null })],
  [new RegExp(`\\b(\\d{1,2}|${Object.keys(NUMBER_WORD).join('|')})\\s+o'?clock\\b(?!\\s*${MERIDIEM})`, 'gi'), (m) => ({ text: m[0], minutes: -1, zone: null })],
  [new RegExp(`\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b(?!\\s*${MERIDIEM})(?:\\s+${ZONE})?`, 'gi'), (m) => ({ text: m[0], minutes: Number(m[1]) * 60 + Number(m[2]), zone: m[3] ?? null })],
  [new RegExp(`\\b(noon|midday)\\b(?:\\s+${ZONE})?`, 'gi'), (m) => ({ text: m[0], minutes: 12 * 60, zone: m[2] ?? null })],
  [new RegExp(`\\bmidnight\\b(?:\\s+${ZONE})?`, 'gi'), (m) => ({ text: m[0], minutes: 0, zone: m[1] ?? null })],
];
const WEEKDAY_FORMS: Array<[RegExp, number]> = [
  [/\b(Sundays?|Sun\.?)\b/g, 0], [/\b(Mondays?|Mon\.?)\b/g, 1], [/\b(Tuesdays?|Tues?\.?)\b/g, 2], [/\b(Wednesdays?|Weds?\.?)\b/g, 3],
  [/\b(Thursdays?|Thu(?:rs?)?\.?)\b/g, 4], [/\b(Fridays?|Fri\.?)\b/g, 5], [/\b(Saturdays?|Sat\.?)\b/g, 6],
];
const RELATIVE = /\b(tomorrow|tonight|today|this\s+(?:morning|afternoon|evening|week|weekend)|next\s+(?:week|month|weekend|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|later\s+today|in\s+(?:an?|\d+|one|two|three)\s+(?:hours?|days?|weeks?))\b/gi;
const URL = /\bhttps?:\/\/[^\s<>()"']+|\bwww\.[^\s<>()"']+/gi;
const CENTRAL_ZONE = /^(CT|Central(?:\s+Time)?)$/i;

function all<T>(re: RegExp, text: string, map: (m: RegExpExecArray) => T): T[] {
  const out: T[] = [];
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) out.push(map(m));
  return out;
}
const fmtMin = (min: number): string => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, '0')} ${min < 720 ? 'AM' : 'PM'}`;
const cleanUrl = (u: string): string => u.replace(/[.,;:!?]+$/, '').replace(/\/+$/, '').toLowerCase();

export interface DraftForCheck { channel: 'community_post' | 'in_app'; title: string | null; body: string }

/**
 * Why a draft may not be submitted or approved, as sentences for the organizer (empty = fine).
 * Every draft: no unfilled placeholder, no banned word, and no link other than the event's own links
 * (or a colaberry.com page for a message not about an event). A draft about an event must also state
 * the event's Central date and time, in any common form, and may not state any other date, day, time,
 * a time zone other than Central (or the wrong one of CST / CDT for that date), or a relative day
 * ("tomorrow", "next week"), which would be wrong if the message went out at another time.
 */
export function problemsFor(d: DraftForCheck, f: DraftFacts | null): string[] {
  const text = `${d.title ?? ''}\n${d.body}`;
  const where = d.channel === 'community_post' ? 'The community post' : 'The in-app notification';
  const out: string[] = [];
  const left = PLACEHOLDERS.filter((p) => text.includes(p));
  if (left.length) out.push(`${where} still has ${left.join(', ')} in it, and this event has no value for it. Remove it or add it to the event.`);
  for (const rule of BANNED_COPY_RULES) {
    if (ruleRegex(rule).test(text)) { out.push(`${where} uses a word the TWC rules do not allow on Colaberry promotions. Rewrite that sentence.`); break; }
  }
  const allowedLinks = new Set([f?.join_link, f?.registration_link].filter((x): x is string => !!x).map(cleanUrl));
  const badLinks = all(URL, text, (m) => m[0]).filter((u) => {
    const c = cleanUrl(u);
    if (allowedLinks.has(c)) return false;
    return f !== null || !/^(https?:\/\/)?([a-z0-9-]+\.)*colaberry\.com(\/|$)/i.test(c);
  });
  if (badLinks.length) out.push(`${where} has a link that is not ${f ? "this event's" : 'a Colaberry page'}: ${badLinks.map((u) => `"${u}"`).join(', ')}.`);
  if (!f) return out;

  const c = f.central;
  const dates = DATE_FORMS.flatMap(([re, map]) => all(re, text, (m) => ({ text: m[0], v: map(m) })));
  const wrongDates = dates.filter((x) => !x.v || x.v.month !== c.month || x.v.day !== c.day || (x.v.year !== undefined && x.v.year !== c.year));
  if (!dates.some((x) => x.v && x.v.month === c.month && x.v.day === c.day)) out.push(`${where} must say the date: ${f.date}.`);
  const times = TIME_FORMS.flatMap(([re, map]) => all(re, text, map));
  const okMinutes = new Set([c.minutes, ...(f.end_minutes !== null ? [f.end_minutes] : [])]);
  if (!times.some((t) => t.minutes === c.minutes)) out.push(`${where} must say the time: ${f.time}.`);
  const wrongTimes = times.filter((t) => !okMinutes.has(t.minutes));
  const wrongZones = times.filter((t) => t.zone && !CENTRAL_ZONE.test(t.zone) && t.zone.toUpperCase() !== c.zone);
  const days = WEEKDAY_FORMS.flatMap(([re, idx]) => all(re, text, (m) => ({ text: m[0], idx })));
  const wrongDays = days.filter((x) => x.idx !== c.weekday);
  const relative = all(RELATIVE, text, (m) => m[0]);
  const named = [...wrongDates.map((x) => x.text), ...wrongTimes.map((t) => t.text), ...wrongDays.map((x) => x.text)];
  if (named.length) out.push(`${where} mentions ${[...new Set(named.map((x) => `"${x.trim().replace(/[.,]$/, '')}"`))].join(', ')}, which is not this event's date and time (${f.date}, ${f.time}${f.end_minutes !== null ? ` to ${fmtMin(f.end_minutes)}` : ''}).`);
  if (wrongZones.length) out.push(`${where} gives a time in ${[...new Set(wrongZones.map((t) => t.zone!.toUpperCase()))].join(', ')}. Times are in Central (${c.zone}).`);
  if (relative.length) out.push(`${where} says ${[...new Set(relative.map((r) => `"${r}"`))].join(', ')}. Say the date instead: the message could go out at another time.`);
  return out;
}
