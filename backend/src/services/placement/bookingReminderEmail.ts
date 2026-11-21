import { candidateFirstName } from './bookingReplyEmail';
import { RECORDING_LINE, whenLine, type ConfirmFacts, type ConfirmMail } from './bookingConfirmEmail';
import { label } from './timeLabel';

/**
 * Career Prep v27, CP8.2c (kit F4): the reminders before a booked interview and the nudge when a booking link goes
 * unused. PURE copy, plain text. Reminders carry the consent-room PAGE link (learner: the portal page; employer: the
 * signed hire-site page), never the meeting provider's link. The nudge goes before any booking exists, so it carries
 * no room link at all: it points back to the booking link already sent (only its fingerprint is stored, so it cannot be
 * re-sent; a new one would break the first) and offers a reply. Subjects are FIXED (part of the send-once key); the
 * business event id carries the interview, the kind and the booked time (the round, for the nudge). No en or em dash.
 */
export type ReminderKind = '24h' | '1h';
export const LEARNER_REMINDER_SUBJECT: Record<ReminderKind, string> = { '24h': 'Your interview is tomorrow', '1h': 'Your interview starts in 1 hour' };
export const EMPLOYER_REMINDER_SUBJECT: Record<ReminderKind, string> = { '24h': 'Reminder: interview tomorrow', '1h': 'Reminder: interview in 1 hour' };
export const NUDGE_SUBJECT = 'Booking your interview: a quick reminder';

const lead = (k: ReminderKind) => (k === '24h' ? 'tomorrow' : 'in about an hour');
const role = (f: ConfirmFacts): string =>
  [f.position?.trim() ? `the ${f.position.trim()} role` : 'the role', f.company?.trim() ? `at ${f.company.trim()}` : ''].filter(Boolean).join(' ');

export function learnerReminderEmail(kind: ReminderKind, f: ConfirmFacts, roomPage: string): ConfirmMail {
  const text = [
    f.candidateName?.trim() ? `Hi ${candidateFirstName(f.candidateName)},` : 'Hi,',
    '',
    `Your interview for ${role(f)} is ${lead(kind)}.`,
    '',
    `When: ${label(f.startsAt, 'America/Chicago')}, ${f.minutes} minutes`,
    '',
    'Join from your interview room page, a few minutes early:',
    roomPage,
    '',
    RECORDING_LINE,
    '',
    'Ali M.',
    'Refactored.ai',
  ].join('\n');
  return { subject: LEARNER_REMINDER_SUBJECT[kind], text };
}

export function employerReminderEmail(kind: ReminderKind, f: ConfirmFacts, roomPage: string): ConfirmMail {
  const who = candidateFirstName(f.candidateName);
  const text = [
    'Hello,',
    '',
    `A reminder: your interview with ${who} for ${role(f)} is ${lead(kind)}.`,
    '',
    `When: ${whenLine(f)}`,
    '',
    'Join from this room page at the start time:',
    roomPage,
    '',
    RECORDING_LINE,
    '',
    'To change the time, reply to this email.',
    '',
    'Ali M.',
    `Refactored.ai, on behalf of ${who}`,
  ].join('\n');
  return { subject: EMPLOYER_REMINDER_SUBJECT[kind], text };
}

export function nudgeEmail(f: { candidateName: string | null; company: string | null; position: string | null }): ConfirmMail {
  const who = candidateFirstName(f.candidateName);
  const text = [
    'Hello,',
    '',
    `A day ago we sent you a link to book your interview with ${who} for ${role({ ...f, startsAt: new Date(0), minutes: 0, bookerTz: null })}.`,
    '',
    'You can still pick a time with the link in that email. If none of the times suit you, or the link did not arrive, reply to this email and we will find one.',
    '',
    'Ali M.',
    `Refactored.ai, on behalf of ${who}`,
  ].join('\n');
  return { subject: NUDGE_SUBJECT, text };
}
