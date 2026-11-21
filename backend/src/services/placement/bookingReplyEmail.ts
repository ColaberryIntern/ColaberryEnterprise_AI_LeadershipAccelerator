/**
 * Career Prep v27, CP8.1b (kit F4 step 2): the reply to an employer who asked a learner for an interview. PURE copy.
 *
 *   From      "Ali M. via Refactored.ai" (decision D3), our sending address
 *   Reply-To  the learner's job-search address, which is also CC'd, so the employer's answer lands back in the pipeline
 *   Body      plain text: who it is for, the one booking link, how long it lasts, what to do if no time works
 * Never: a fee or price, a personal email or phone of the learner, the meeting provider's link, an en or em dash.
 */
export const FROM_NAME = 'Ali M. via Refactored.ai';
/** FIXED, with no name in it: it is part of the send-once key, so a learner's rename can never cause a second send. */
export const BOOKING_SUBJECT = 'Booking your interview: pick a time';

export interface BookingReplyFacts {
  contactName: string | null;
  candidateName: string | null;
  company: string | null;
  position: string | null;
  link: string;
}
export interface BookingReplyMail { subject: string; text: string }

const first = (s: string | null | undefined) => String(s ?? '').trim().split(/\s+/)[0] || '';

/** "Ann" for "Ann Marie Lee"; "the candidate" when we do not have a name. */
export const candidateFirstName = (fullName: string | null | undefined): string => first(fullName) || 'the candidate';

export function bookingReplyEmail(f: BookingReplyFacts): BookingReplyMail {
  const who = candidateFirstName(f.candidateName);
  const greet = first(f.contactName);
  const role = [f.position?.trim() ? `the ${f.position.trim()} role` : 'the role', f.company?.trim() ? `at ${f.company.trim()}` : ''].filter(Boolean).join(' ');
  const text = [
    `Hi${greet ? ` ${greet}` : ''},`,
    '',
    `Thank you for reaching out to ${who} about ${role}.`,
    '',
    'Please pick a time for the interview here:',
    f.link,
    '',
    `The page shows ${who}'s open times in Central time, with your own time zone beside them. The interview is held in the Refactored interview room. The link works for 14 days.`,
    '',
    'If none of the times suit you, reply to this email and we will find one.',
    '',
    'Ali M.',
    `Refactored.ai, on behalf of ${who}`,
  ].join('\n');
  return { subject: BOOKING_SUBJECT, text };
}
