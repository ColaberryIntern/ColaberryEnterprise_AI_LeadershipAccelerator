/**
 * OH1u (Ali, 2026-11-20): after each Open House, Maya sends ONE follow-up email, and which
 * one depends on whether the person showed up:
 *
 *   attended  checked in on the platform (guest name+email at the check-in door, or a
 *             signed-in member's attendance row). A thank-you and the next step.
 *   missed    registered for that Open House and did not check in. The replay when one
 *             exists, and the next Open House.
 *
 * The copy is FIXED, not AI-written: Ali approves these exact words before the campaign is
 * activated, and nothing here can drift into a price, an offer or a promise. Every body still
 * goes through screenMayaCopy (the same screen as the countdown) before it is booked.
 *
 * Attendance comes from platform check-ins only, so someone who joined Zoom straight from the
 * Eventbrite listing looks "missed". The missed email is written to be true either way: it
 * thanks them if they did join, and never says "you were not there".
 */
import { PORTAL_TODAY_URL, screenMayaCopy } from './openHouseCountdown';

export type FollowupTrack = 'attended' | 'missed';

/** The public Open House sign-up page (App.tsx /open-house). */
export const OPEN_HOUSE_SIGNUP_URL = 'https://enterprise.colaberry.ai/open-house';

export interface NextOpenHouse {
  /** "Thursday, December 3 at 6:30 PM CST" */
  when_label: string;
  /** True when this person is already registered for it. */
  registered: boolean;
}

export interface FollowupCopyInput {
  track: FollowupTrack;
  firstName: string | null;
  /** The Open House this follows, as a date: "Thursday, November 19". */
  eventDate: string;
  /** A recording of that Open House anyone can watch, when one has been set. */
  replayUrl?: string | null;
  /** The next scheduled Open House, when there is one. */
  next?: NextOpenHouse | null;
}

export interface FollowupCopy { subject: string; body: string; allowedLinks: string[] }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const a = (url: string) => `<a href="${url}">${url}</a>`;

/** First name from a stored name; null for an email-shaped or empty name. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first && !first.includes('@') ? first : null;
}

/** The subject and body (paragraph HTML; the campaign wrapper adds Maya's signature and footer). */
export function followupCopy(input: FollowupCopyInput): FollowupCopy {
  const hi = input.firstName ? `<p>Hi ${esc(input.firstName)},</p>` : '<p>Hi,</p>';
  const date = esc(input.eventDate);
  if (input.track === 'attended') {
    return {
      subject: 'Thank you for coming to the Open House',
      allowedLinks: [],
      body: [
        hi,
        `<p>Thank you for joining the Colaberry Open House on ${date}. I hope it answered some of your questions about the Forward Deployed AI Engineer Accelerator.</p>`,
        `<p>The best next step is to keep going on the platform. Your Today page picks up where you left off: ${a(PORTAL_TODAY_URL)}</p>`,
        '<p>If a question came up after the session, or you would like to talk through whether the program fits you, just reply to this email and an admissions advisor will follow up with you personally.</p>',
      ].join('\n'),
    };
  }
  const replay = (input.replayUrl || '').trim();
  const lines = [
    hi,
    `<p>We did not see you check in at the Colaberry Open House on ${date}. If you joined us on Zoom, thank you for coming. If you could not make it, no problem at all.</p>`,
  ];
  const allowedLinks: string[] = [];
  if (replay) {
    lines.push(`<p>You can watch the recording here: ${a(replay)}</p>`);
    allowedLinks.push(replay);
  }
  if (input.next?.registered) {
    lines.push(`<p>You are already registered for the next one, ${esc(input.next.when_label)}, and your Join link will come by email before it starts.</p>`);
  } else if (input.next) {
    lines.push(`<p>The next Open House is ${esc(input.next.when_label)}. You can save your spot here: ${a(OPEN_HOUSE_SIGNUP_URL)}</p>`);
    allowedLinks.push(OPEN_HOUSE_SIGNUP_URL);
  } else {
    lines.push(`<p>You can see when the next Open House is here: ${a(OPEN_HOUSE_SIGNUP_URL)}</p>`);
    allowedLinks.push(OPEN_HOUSE_SIGNUP_URL);
  }
  lines.push('<p>If you have a question in the meantime, just reply to this email.</p>');
  return { subject: 'The next Colaberry Open House', body: lines.join('\n'), allowedLinks };
}

/**
 * Every problem with a follow-up; empty when it may be booked. The same screen Maya's other
 * copy passes (banned words incl. price/offer/the no-cost word, and the link allowlist).
 */
export function screenFollowupCopy(copy: FollowupCopy): string[] {
  return screenMayaCopy({ subject: copy.subject, body: copy.body, allowedLinks: copy.allowedLinks }).problems;
}
