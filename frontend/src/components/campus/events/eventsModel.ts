import type { OpenHouseView } from '../../../services/onboardingApi';

/**
 * Upcoming events with one-tap sign up (Basecamp C27, v6 D5). Pure. Eventbrite is the record (Ali, 2026-10-24, Q1: A): "Sign up"
 * opens the event's Eventbrite registration in a new tab, and "✓ You're going" reads is_registered from GET /api/portal/events
 * (matched by email against the Eventbrite attendee mirror). There is no portal RSVP and no cancel here: cancelling is Eventbrite's.
 * All days and times are Central, the program's zone.
 */
export const EVENTS_TZ = 'America/Chicago';

export type SignupState = { kind: 'going' } | { kind: 'signup'; href: string } | { kind: 'none' };

/** What the button shows: registered, a link to register, or nothing (no registration page yet). */
export function signupOf(e: Pick<OpenHouseView, 'is_registered' | 'registration_url'>): SignupState {
  if (e.is_registered) return { kind: 'going' };
  return e.registration_url ? { kind: 'signup', href: e.registration_url } : { kind: 'none' };
}

/** Central calendar day "YYYY-MM-DD" of an instant. */
export function centralDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: EVENTS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p; // en-CA formats as YYYY-MM-DD
}

/** "Tue, Oct 27" and "6:30 PM" in Central. */
export function eventWhen(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-US', { timeZone: EVENTS_TZ, weekday: 'short', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { timeZone: EVENTS_TZ, hour: 'numeric', minute: '2-digit' }),
  };
}

/** Events that have not ended, soonest first. */
export function upcoming(events: OpenHouseView[], now: Date, limit = Infinity): OpenHouseView[] {
  return events
    .filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= now.getTime())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, limit);
}

/** The Events Hall screen's facts about one event (C118). Every field comes from the event itself; a missing one is null, never a guess. */
export interface EventFacts {
  /** "Fri, Nov 6 · 9:00 AM – 10:30 AM CT" (the end only when it is known and on the same Central day). */
  when: string;
  /** "Online" when the event carries a meeting link; null otherwise (the API has no venue field, so none is invented). */
  where: string | null;
  /** "12 signed up" from the real registrant count; null when unknown or zero (null must never render as 0). */
  going: string | null;
  /** The description as plain text, whitespace collapsed, cut at a word boundary to `max` characters; null when empty. */
  about: string | null;
}

export const ABOUT_MAX = 180;

/** Plain text from an Eventbrite description: tags dropped, entities for spaces and ampersands decoded, whitespace collapsed. */
function plainText(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

export function eventFacts(e: Pick<OpenHouseView, 'starts_at' | 'ends_at' | 'meeting_link' | 'signup_count' | 'description'>, max = ABOUT_MAX): EventFacts {
  const start = eventWhen(e.starts_at);
  const sameDay = !!e.ends_at && Number.isFinite(new Date(e.ends_at).getTime()) && centralDay(e.ends_at) === centralDay(e.starts_at);
  const when = `${start.day} · ${start.time}${sameDay ? ` – ${eventWhen(e.ends_at as string).time}` : ''} CT`;
  const text = e.description ? plainText(e.description) : '';
  let about: string | null = text || null;
  if (about && about.length > max) {
    const cut = about.slice(0, max);
    const at = cut.lastIndexOf(' ');
    about = `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
  }
  return {
    when,
    where: e.meeting_link ? 'Online' : null,
    going: e.signup_count && e.signup_count > 0 ? `${e.signup_count} signed up` : null,
    about,
  };
}

/** An Open House (the title says so; CCPP has no event type). */
export const isOpenHouse = (e: Pick<OpenHouseView, 'title'>): boolean => /open house/i.test(e.title);

/**
 * What this account is shown (Ali, 2026-10-26: "Open house should not be promoted for business accounts"). Every campus events source
 * runs through this, so no board, list, badge or banner can promote one to a partner account.
 */
export function eventsFor(audience: string | null | undefined, events: OpenHouseView[]): OpenHouseView[] {
  return audience === 'business' ? events.filter((e) => !isOpenHouse(e)) : events;
}

/** One event a page would promote (the next Open House strip, the Next event chip), or null when this account must not see it. */
export function promotable<T extends Pick<OpenHouseView, 'title'>>(audience: string | null | undefined, e: T | null | undefined): T | null {
  if (!e) return null;
  return audience === 'business' && isOpenHouse(e) ? null : e;
}

/** The registered ones (the side panel's Coming up). */
export const goingTo = (events: OpenHouseView[], now: Date, limit = 3): OpenHouseView[] => upcoming(events.filter((e) => e.is_registered), now, limit);

export interface StripDay { ymd: string; wd: string; d: string; today: boolean; hasEvent: boolean }

/** The board's 7-day strip from today: weekday, date, today filled, days with an event dotted. */
export function weekStrip(events: OpenHouseView[], now: Date): StripDay[] {
  const days = new Set(events.map((e) => centralDay(e.starts_at)));
  const out: StripDay[] = [];
  for (let i = 0; i < 7; i++) {
    const at = new Date(now.getTime() + i * 86_400_000);
    const ymd = centralDay(at);
    out.push({
      ymd,
      wd: at.toLocaleDateString('en-US', { timeZone: EVENTS_TZ, weekday: 'short' }),
      d: at.toLocaleDateString('en-US', { timeZone: EVENTS_TZ, day: 'numeric' }),
      today: i === 0,
      hasEvent: days.has(ymd),
    });
  }
  return out;
}
