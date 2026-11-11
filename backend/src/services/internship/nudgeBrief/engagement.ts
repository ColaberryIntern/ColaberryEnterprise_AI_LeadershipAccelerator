/**
 * engagement - PURE. Who is overdue a message, and did the last one actually land.
 *
 * Ali, 2026-11-11: "the idea is to get them to engage. We might not be able to solve their issue if
 * they have one, but the goal is to create a process that keeps the engagement up and doesn't let
 * anyone slide from the cracks."
 *
 * ## That changes what "good" means here
 *
 * Every measurement in this subsystem so far has been about the MESSAGE: how similar two messages
 * were, whether a sentence was true, whether a quote was really theirs. Those matter, but none of
 * them is the goal. The goal is that an intern answers, and that nobody goes quiet unnoticed. So
 * this module measures two things and neither is about wording:
 *
 *   COVERAGE     has anyone gone longer than the floor without hearing from us
 *   ENGAGEMENT   did anything happen after the last message we sent
 *
 * ## Both numbers already exist, which is the useful discovery
 *
 * `last_ask` is the newest message sent TO them, and `last_ask.satisfied` is already computed from
 * a commit, a verified story, or a reply dated after it. So "did our last message produce
 * anything" has been in the sidecar the whole time and nothing read it. This module does not
 * gather new data; it states the rule those fields imply and makes the gap visible.
 *
 * ## The floor
 *
 * Two days, Ali's number, and it is a FLOOR rather than a schedule: a message exists because there
 * is a reason to write, and this only catches the person no reason has been found for. Weekends
 * collapse to one contact across Saturday and Sunday together, so a quiet weekend cannot generate
 * two.
 *
 * Someone we have never written to at all is overdue immediately. That is the exact shape of
 * sliding through the cracks, and a rule keyed on "days since last contact" would otherwise score
 * them as having no problem, because there is no last contact to be late from.
 */
import type { SidecarIntern } from '../portfolioReport/sidecar/types';

/** Ali, 2026-11-11: "no more than 2 days overdue", and "at least every 48 hours". */
export const CONTACT_FLOOR_DAYS = 2;

const DAY = 86400000;

/** Calendar day in Central, which is the day a person means when they say "today". */
export function centralDay(iso: string | number | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Short weekday in Central: Mon, Tue, ... */
export function centralWeekday(iso: string | number | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(d);
}

const isWeekend = (iso: string | number | Date): boolean => ['Sat', 'Sun'].includes(centralWeekday(iso));

/**
 * The Saturday that opens the weekend containing this moment, as a Central day string, or null on
 * a weekday. Used to collapse Saturday and Sunday into one contact slot.
 */
export function weekendKey(iso: string | number | Date): string | null {
  const day = centralWeekday(iso);
  if (day === 'Sat') return centralDay(iso);
  if (day === 'Sun') return centralDay(new Date(new Date(iso).getTime() - DAY));
  return null;
}

export interface EngagementState {
  /** When we last wrote to them, or null if we never have. */
  readonly lastContactAt: string | null;
  readonly daysSinceContact: number | null;
  /**
   * Did anything come back after that message: a reply, a commit, or a verified story.
   * `null` means unknowable, not "no" - the message predates the data window.
   */
  readonly engagedSinceContact: boolean | null;
  readonly engagedBy: string | null;
  /** True when a message is owed under the floor. */
  readonly overdue: boolean;
  /** One sentence naming the fact, for a person deciding whether to act on it. */
  readonly reason: string;
}

export function engagementState(i: SidecarIntern, now: Date = new Date()): EngagementState {
  const nowMs = now.getTime();
  const sent = i.last_ask ? Date.parse(i.last_ask.sent_at) : NaN;

  if (!i.last_ask || Number.isNaN(sent)) {
    return {
      lastContactAt: null,
      daysSinceContact: null,
      engagedSinceContact: null,
      engagedBy: null,
      overdue: true,
      reason: 'We have no record of ever writing to them, so they are overdue by default rather than by arithmetic.',
    };
  }

  const days = Math.floor((nowMs - sent) / DAY);
  const engaged = i.last_ask.satisfied;
  const by = i.last_ask.satisfied_by;

  // One contact across Saturday and Sunday together. A weekend that already had its message does
  // not get a second one just because a day boundary passed.
  const thisWeekend = weekendKey(nowMs);
  if (thisWeekend && weekendKey(sent) === thisWeekend) {
    return {
      lastContactAt: new Date(sent).toISOString(),
      daysSinceContact: days,
      engagedSinceContact: engaged,
      engagedBy: by,
      overdue: false,
      reason: 'We already wrote to them this weekend, and a weekend gets one message.',
    };
  }

  const overdue = days >= CONTACT_FLOOR_DAYS;
  const plural = days === 1 ? 'day' : 'days';
  return {
    lastContactAt: new Date(sent).toISOString(),
    daysSinceContact: days,
    engagedSinceContact: engaged,
    engagedBy: by,
    overdue,
    reason: overdue
      ? `${days} ${plural} since we last wrote, and the floor is ${CONTACT_FLOOR_DAYS}.`
      : engaged === false
        ? `We wrote ${days} ${plural} ago and nothing has come back yet, but the floor has not passed.`
        : `We wrote ${days} ${plural} ago${by ? ` and they ${by === 'reply' ? 'replied' : by === 'commit' ? 'committed' : 'verified a story'} after it` : ''}.`,
  };
}

export interface Coverage {
  readonly total: number;
  /** Owed a message right now. The number that must be zero for nobody to be sliding. */
  readonly overdue: number;
  /** Never written to at all, which is the worst case and is counted separately. */
  readonly neverContacted: number;
  /** Our last message produced a reply, a commit or a verified story. */
  readonly engaged: number;
  /** Our last message produced nothing, and it is recent enough to say so. */
  readonly silent: number;
  /** Too old to judge: the message predates the data window. */
  readonly unknown: number;
  /** Engaged as a share of those we can actually judge, or null when none are judgeable. */
  readonly engagementRate: number | null;
}

/**
 * The roster in one line, which is the number Ali is actually asking about.
 *
 * `engagementRate` deliberately excludes the unknowns rather than counting them as failures. A
 * message too old to judge is a gap in the data, and folding it into the denominator would make
 * the rate drift down as the window moves rather than as engagement changes.
 */
export function coverage(states: ReadonlyArray<EngagementState>): Coverage {
  const engaged = states.filter((s) => s.engagedSinceContact === true).length;
  const silent = states.filter((s) => s.engagedSinceContact === false).length;
  const judgeable = engaged + silent;
  return {
    total: states.length,
    overdue: states.filter((s) => s.overdue).length,
    neverContacted: states.filter((s) => s.lastContactAt === null).length,
    engaged,
    silent,
    unknown: states.filter((s) => s.engagedSinceContact === null).length,
    engagementRate: judgeable ? Math.round((engaged / judgeable) * 100) : null,
  };
}
