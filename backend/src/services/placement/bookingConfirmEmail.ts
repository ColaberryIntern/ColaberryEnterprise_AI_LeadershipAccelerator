import { candidateFirstName } from './bookingReplyEmail';
import { label } from './timeLabel';

/**
 * Career Prep v27, CP8.2b (kit F4 step 3): the messages after an employer books a time. PURE copy, plain text.
 *
 *   learner    to the learner's PERSONAL address: who, when (Central), the role, and their consent-room page in the portal
 *   employer   to the employer and to each interviewer, one message each: when (Central and the booker's zone), with whom,
 *              and the employer's consent-room page link
 * Every message carries the consent-room PAGE link only, never the meeting provider's link (execution contract, safety
 * rules); the .ics carries the same page link. No fee or price, no learner email or phone in employer mail, no en or em
 * dash. Subjects are FIXED (no names, no times): they are part of the send-once key, and the business event id carries
 * the interview and the start time, so a rebook at a new time sends fresh messages and a retry never sends twice.
 */
export const LEARNER_SUBJECT = 'Interview booked: your consent room link';
export const EMPLOYER_SUBJECT = 'Interview confirmed: your room link';
export const RECORDING_LINE = 'Recording is off. It starts only if everyone in the room agrees when the interview begins; if anyone declines, it goes ahead unrecorded.';

export interface ConfirmFacts {
  candidateName: string | null;
  company: string | null;
  position: string | null;
  startsAt: Date;
  minutes: number;
  bookerTz: string | null;
}
export interface ConfirmMail { subject: string; text: string }

const role = (f: ConfirmFacts): string =>
  [f.position?.trim() ? `the ${f.position.trim()} role` : 'the role', f.company?.trim() ? `at ${f.company.trim()}` : ''].filter(Boolean).join(' ');

export function whenLine(f: ConfirmFacts): string {
  const central = label(f.startsAt, 'America/Chicago');
  const local = f.bookerTz && f.bookerTz !== 'America/Chicago' ? ` (${label(f.startsAt, f.bookerTz)})` : '';
  return `${central}${local}, ${f.minutes} minutes`;
}

export function learnerBookedEmail(f: ConfirmFacts, roomPage: string): ConfirmMail {
  const text = [
    f.candidateName?.trim() ? `Hi ${candidateFirstName(f.candidateName)},` : 'Hi,',
    '',
    `${f.company?.trim() || 'An employer'} booked your interview for ${role(f)}.`,
    '',
    `When: ${label(f.startsAt, 'America/Chicago')}, ${f.minutes} minutes`,
    '',
    'Join from your interview room page, a few minutes early:',
    roomPage,
    '',
    RECORDING_LINE,
    '',
    'The calendar file attached adds it to your calendar. Good luck.',
    '',
    'Ali M.',
    'Refactored.ai',
  ].join('\n');
  return { subject: LEARNER_SUBJECT, text };
}

export function employerBookedEmail(f: ConfirmFacts, roomPage: string): ConfirmMail {
  const who = candidateFirstName(f.candidateName);
  const text = [
    'Hello,',
    '',
    `Your interview with ${who} for ${role(f)} is confirmed.`,
    '',
    `When: ${whenLine(f)}`,
    '',
    'Join from this room page at the start time:',
    roomPage,
    '',
    'The link works until two hours after the interview ends.',
    RECORDING_LINE,
    '',
    'The calendar file attached adds it to your calendar. To change the time, reply to this email.',
    '',
    'Ali M.',
    `Refactored.ai, on behalf of ${who}`,
  ].join('\n');
  return { subject: EMPLOYER_SUBJECT, text };
}
