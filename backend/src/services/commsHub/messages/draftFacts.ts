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
  return {
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

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const DATE_MENTION = new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b`, 'gi');
const TIME_MENTION = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?:\s*(?:CST|CDT|CT|Central))?/gi;
const WEEKDAYS = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi;

const norm = (s: string): string => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

export interface DraftForCheck { channel: 'community_post' | 'in_app'; title: string | null; body: string }

/**
 * Why a draft may not be submitted, as sentences for the organizer (empty = fine). With facts (a
 * message about an event): each draft must state the correct date and time, and no OTHER date, day or
 * time may appear. Every draft: no unfilled placeholder, no banned word.
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
  if (!f) return out;
  const wantDate = norm(f.date.replace(/^\w+,\s*/, '')); // "december 1"
  const wantDay = norm(f.date.split(',')[0]); // "tuesday"
  const wantTime = norm(f.time.replace(/\s*(CST|CDT)$/i, '')); // "6:00 pm"
  const flat = norm(text);
  if (!flat.includes(norm(f.date)) && !(flat.includes(wantDate))) out.push(`${where} must say the date: ${f.date}.`);
  if (!flat.includes(wantTime)) out.push(`${where} must say the time: ${f.time}.`);
  const otherDates = (text.match(DATE_MENTION) ?? []).filter((m) => norm(m).replace(/(st|nd|rd|th)$/, '') !== wantDate);
  const otherTimes = (text.match(TIME_MENTION) ?? []).map((m) => norm(m).replace(/\s*(cst|cdt|ct|central)$/, '')).filter((m) => {
    const t = m.replace(/\s/g, '');
    return t !== wantTime.replace(/\s/g, '') && t !== wantTime.replace(/:00/, '').replace(/\s/g, '');
  });
  const otherDays = (text.match(WEEKDAYS) ?? []).filter((m) => norm(m) !== wantDay);
  if (otherDates.length || otherTimes.length || otherDays.length) {
    out.push(`${where} mentions ${[...otherDates, ...otherTimes, ...otherDays].map((x) => `"${x.trim()}"`).join(', ')}, which is not this event's date and time (${f.date}, ${f.time}).`);
  }
  return out;
}
