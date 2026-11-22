/**
 * Career Prep v27, CP10.3 (kit F8): the rules for an employer's follow-up email. PURE: no clock (now is passed in), no
 * database, no mail. The route checks them before saving and the scheduler checks them again on the merged message
 * before sending, so a message that breaks one is never sent.
 *
 *   No long dash (en or em) in the subject or the message: refused with a clear message (the design blocks it).
 *   At most ONE link, counting {booking link}; no attachments (the API has no way to add one; a caller that tries is
 *   refused); only the merge fields {first} and {booking link}; {booking link} needs the employer's own https link.
 *   The send time is chosen in Central and stored as an instant (daylight saving handled by the zone itself).
 *   Retries: the first try and RETRY_DELAYS_MIN.length retries (5, 15, 45 minutes later), then Failed.
 */
export const TEMPLATES = ['thank_you', 'next_steps', 'offer_reminder', 'custom'] as const;
export const ONLY_IF = ['no_reply', 'always'] as const;
export type Template = (typeof TEMPLATES)[number];
export type OnlyIf = (typeof ONLY_IF)[number];

export const MAX_SUBJECT = 150;
export const MAX_BODY = 5000;
export const MAX_LINK = 500;
export const MAX_DAYS_AHEAD = 90;
export const RETRY_DELAYS_MIN = [5, 15, 45] as const;
export const MAX_TRIES = 1 + RETRY_DELAYS_MIN.length;
export const BOOKING_FIELD = '{booking link}';
export const FIRST_FIELD = '{first}';

const DASH = new RegExp('[\\u2013\\u2014]');
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;
const SAFE_LINK = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d{2,5})?(?:[/?#][^\s<>"'`]*)?$/;

export const TEXT = {
  dashBody: 'Remove the long dash from the message. Use a comma, a colon or a period instead.',
  dashSubject: 'Remove the long dash from the subject. Use a comma, a colon or a period instead.',
  subjectBlank: 'Enter a subject.',
  subjectLong: `The subject can be at most ${MAX_SUBJECT} characters.`,
  subjectLines: 'The subject must be one line.',
  bodyBlank: 'Write the message.',
  bodyLong: `The message can be at most ${MAX_BODY} characters.`,
  oneLink: 'A follow-up can carry at most one link.',
  attachments: 'Attachments cannot be sent with a follow-up.',
  needLink: 'Add your booking link, or take {booking link} out of the message.',
  unusedLink: 'Put {booking link} in the message where the link should go, or clear the booking link.',
  badLink: 'The booking link must be a full https:// address.',
  past: 'Pick a send time from now on.',
  tooFar: `Pick a send time within the next ${MAX_DAYS_AHEAD} days.`,
} as const;

export interface FollowUpDraft {
  subject: string;
  body: string;
  bookingLink?: string | null;
  attachments?: unknown;
}

/** "{first}" and "{booking link}" only; anything else in braces is a field we cannot fill. */
function unknownField(body: string): string | null {
  for (const m of body.matchAll(/\{[^{}\n]{0,40}\}/g)) if (m[0] !== FIRST_FIELD && m[0] !== BOOKING_FIELD) return m[0];
  return null;
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

/** The first thing wrong with a draft, in the words the employer sees; null when it may be saved. */
export function draftProblem(d: FollowUpDraft): string | null {
  const subject = String(d.subject ?? '');
  const body = String(d.body ?? '');
  const link = d.bookingLink == null ? '' : String(d.bookingLink).trim();
  if (Array.isArray(d.attachments) ? d.attachments.length > 0 : d.attachments != null) return TEXT.attachments;
  if (!subject.trim()) return TEXT.subjectBlank;
  if (/[\r\n]/.test(subject)) return TEXT.subjectLines;
  if (subject.length > MAX_SUBJECT) return TEXT.subjectLong;
  if (DASH.test(subject)) return TEXT.dashSubject;
  if (!body.trim()) return TEXT.bodyBlank;
  if (body.length > MAX_BODY) return TEXT.bodyLong;
  if (DASH.test(body)) return TEXT.dashBody;
  const field = unknownField(body);
  if (field) return `Only {first} and {booking link} can be filled in for you. Remove ${field}.`;
  const uses = count(body, BOOKING_FIELD);
  if ((body.match(URL_IN_TEXT) ?? []).length + uses > 1) return TEXT.oneLink;
  if (uses && !link) return TEXT.needLink;
  if (link && !uses) return TEXT.unusedLink;
  if (link && (link.length > MAX_LINK || !SAFE_LINK.test(link) || DASH.test(link))) return TEXT.badLink;
  return null;
}

/** The candidate's first name for {first}; "there" (as in "Hi there,") when we have none. */
export const firstName = (fullName: string | null | undefined): string =>
  String(fullName ?? '').replace(new RegExp('[\\u2013\\u2014]', 'g'), '-').trim().split(/\s+/)[0] || 'there';

/** The merged message still passes: no long dash and at most one link (a learner's name cannot add either). */
export function mergedProblem(merged: string): string | null {
  if (DASH.test(merged)) return TEXT.dashBody;
  return (merged.match(URL_IN_TEXT) ?? []).length > 1 ? TEXT.oneLink : null;
}

/** The message as it is sent: merge fields filled. */
export function mergeBody(body: string, f: { fullName: string | null; bookingLink: string | null }): string {
  return body.split(FIRST_FIELD).join(firstName(f.fullName)).split(BOOKING_FIELD).join(f.bookingLink ?? '');
}

/** The one link in a merged message (for click tracking), or null. */
export function linkIn(merged: string): string | null {
  return (merged.match(URL_IN_TEXT) ?? [])[0] ?? null;
}

/** Why a send time cannot be used, or null. Up to 5 minutes in the past is allowed (the page's clock may lag). */
export function sendOnProblem(sendOn: Date, now: Date): string | null {
  if (Number.isNaN(sendOn.getTime()) || sendOn.getTime() < now.getTime() - 5 * 60_000) return TEXT.past;
  if (sendOn.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return TEXT.tooFar;
  return null;
}

/** The instant of a Central wall-clock time ("2026-11-01", "09:00"), or null for anything else. */
export function centralInstant(ymd: string, hm: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hm));
  if (!d || !t) return null;
  const want = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  let guess = want + 6 * 3_600_000;
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 2; i += 1) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    guess -= Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - want;
  }
  return new Date(guess);
}

/** When to try again after failed try number `attempts` (1-based); null when no retry is left. */
export function nextAttemptAt(attempts: number, now: Date): Date | null {
  const delay = RETRY_DELAYS_MIN[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay * 60_000);
}

const clean = (s: string | null | undefined) => String(s ?? '').replace(/["<>\\\r\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** The From name: "<person> at <company> via Refactored.ai" (kit F8); the company alone when we have no name. */
export function fromName(person: string | null | undefined, company: string | null | undefined): string {
  const p = clean(person); const c = clean(company);
  return `${p && c ? `${p} at ${c}` : p || c || 'An employer'} via Refactored.ai`;
}
