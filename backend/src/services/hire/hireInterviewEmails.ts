/**
 * hireInterviewEmails - the words of every Hire interview email (kit §4.2 notifications).
 * Pure: facts in, `{ subject, text, html }` out, so the copy is reviewed and tested here and the
 * sender (hireInterviewNotify) only decides who gets which.
 *
 * RULES THE COPY KEEPS
 * - Neither side's email address or phone number appears in a message to the other. The
 *   employer sees the candidate's name and profile; the candidate sees the employer's name,
 *   company, role and note.
 * - Times: the candidate reads their own zone (the one they set in Interview times); the
 *   employer reads Central, and the attached .ics puts it in their own calendar's zone.
 * - Plain, a little less formal, no dashes as punctuation, no sign-off from a person.
 * - Subjects are stable for a given event: the send ledger dedupes on (recipient, subject,
 *   event), so a subject must not carry anything that changes between two sends of one event.
 */
import { FORMATS, type InterviewFormat } from './hireSlots';

export interface InterviewFacts {
  readonly id: string;
  readonly talentSlug: string;
  readonly candidateName: string;
  readonly candidateTz: string;
  readonly format: InterviewFormat;
  readonly caseStudyTitle: string | null;
  readonly start: Date;
  readonly minutes: number;
  readonly employer: { readonly name: string; readonly company: string; readonly role: string; readonly message: string };
  readonly extraInterviewers: number;
  readonly recordRequested: boolean;
  readonly roomUrl: string | null;
  /** Set only on a decline where the candidate left a note. */
  readonly declineReason?: string | null;
}

export interface Email { readonly subject: string; readonly text: string; readonly html: string }

export const CENTRAL = 'America/Chicago';
const ZONE: Record<string, string> = {
  'America/New_York': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT', 'America/Phoenix': 'MST', 'America/Los_Angeles': 'PT',
};

export const firstName = (full: string): string => full.trim().split(/\s+/)[0] || full.trim();

/** "Monday, November 16 at 9:00 AM CT" */
export function whenIn(d: Date, tz: string): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
  return `${day} at ${time} ${ZONE[tz] ?? tz}`;
}

const formatLine = (f: InterviewFacts) =>
  `${FORMATS[f.format].name}, ${f.minutes} minutes${f.caseStudyTitle ? `, walking through "${f.caseStudyTitle}"` : ''}`;

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Paragraphs in, both bodies out. A paragraph that is exactly a URL becomes a button-like link. */
function compose(subject: string, paragraphs: ReadonlyArray<string | null | false>): Email {
  const ps = paragraphs.filter((p): p is string => typeof p === 'string' && p.length > 0);
  const text = ps.join('\n\n') + '\n\nRefactored.ai Hire, run by the Colaberry team\n';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2a33;max-width:560px">'
    + ps.map((p) => (/^https:\/\/\S+$/.test(p)
      ? `<p><a href="${escHtml(p)}" style="color:#1d6fa5;font-weight:bold">${escHtml(p)}</a></p>`
      : `<p>${escHtml(p).replace(/\n/g, '<br>')}</p>`)).join('')
    + '<p style="color:#6b7780;font-size:13px">Refactored.ai Hire, run by the Colaberry team</p></div>';
  return { subject, text, html };
}

/** To the candidate: someone booked a time and is waiting for an answer. */
export function candidateRequestedEmail(f: InterviewFacts, studioUrl: string): Email {
  const e = f.employer;
  return compose(`${e.name} from ${e.company} wants to interview you`, [
    `Hi ${firstName(f.candidateName)},`,
    `${e.name} from ${e.company} is hiring for ${e.role}, and picked a time on your Hire profile:`,
    `${formatLine(f)}\n${whenIn(f.start, f.candidateTz)}`,
    e.message ? `What they said: "${e.message}"` : null,
    f.extraInterviewers > 0 ? `${f.extraInterviewers === 1 ? 'One more person' : `${f.extraInterviewers} more people`} from their team will join.` : null,
    f.recordRequested ? 'They asked to record the session for their team. You decide in the room whether that is okay.' : null,
    'Accept it, suggest another time or decline in your Hire profile. We told them you would answer within 24 hours, and the time is held until you do.',
    studioUrl,
  ]);
}

/** To the candidate: the interview is on (they accepted, or it confirmed itself). */
export function candidateConfirmedEmail(f: InterviewFacts, autoConfirmed: boolean): Email {
  const e = f.employer;
  return compose(`Confirmed: ${FORMATS[f.format].name} with ${e.company}`, [
    `Hi ${firstName(f.candidateName)},`,
    autoConfirmed
      ? `${e.name} from ${e.company} booked a time with you, and it is confirmed (you set new bookings to confirm automatically).`
      : `You're on with ${e.name} from ${e.company}.`,
    `${formatLine(f)}\n${whenIn(f.start, f.candidateTz)}`,
    f.roomUrl ? 'Join from your browser at that time:' : 'The Colaberry team will send the room link before the call.',
    f.roomUrl,
    'The calendar file is attached. The Colaberry team has a copy of the booking too.',
  ]);
}

/**
 * To the employer, or (`extra`) to an interviewer they invited: the candidate said yes. One
 * subject for both, so each address is still deduped by the ledger on its own.
 */
export function employerConfirmedEmail(f: InterviewFacts, profileUrl: string, extra = false): Email {
  return compose(`Confirmed: ${FORMATS[f.format].name} with ${f.candidateName}`, [
    extra ? 'Hi,' : `Hi ${firstName(f.employer.name)},`,
    extra
      ? `${f.employer.name} from ${f.employer.company} invited you to an interview with ${f.candidateName}, and it's confirmed.`
      : `${firstName(f.candidateName)} confirmed your interview.`,
    `${formatLine(f)}\n${whenIn(f.start, CENTRAL)}`,
    f.roomUrl ? 'Join from your browser at that time:' : 'The Colaberry team will send the room link before the call.',
    f.roomUrl,
    'The attached calendar file shows it in your own time zone. Their profile, if you want another look before you talk:',
    profileUrl,
  ]);
}

/** To the employer: the candidate can't make that time. */
export function employerDeclinedEmail(f: InterviewFacts, scheduleUrl: string, introUrl: string): Email {
  return compose(`About your interview request with ${f.candidateName}`, [
    `Hi ${firstName(f.employer.name)},`,
    `${firstName(f.candidateName)} can't make ${whenIn(f.start, CENTRAL)} work. You're welcome to pick another open time:`,
    !!f.declineReason && `${firstName(f.candidateName)} added a note: "${f.declineReason}"`,
    scheduleUrl,
    'Or ask the Colaberry team to set one up for you:',
    introUrl,
  ]);
}

/** To the employer: the candidate suggested a different time, one click to take it. */
export function employerProposedEmail(f: InterviewFacts, acceptUrl: string, introUrl: string): Email {
  return compose(`${firstName(f.candidateName)} suggested another time`, [
    `Hi ${firstName(f.employer.name)},`,
    `${firstName(f.candidateName)} can't do the time you picked and suggested this instead:`,
    `${formatLine(f)}\n${whenIn(f.start, CENTRAL)}`,
    'If it works for you, confirm it here and you will both get the calendar invite with the room link:',
    acceptUrl,
    "If it doesn't, ask the Colaberry team and they will find one that does:",
    introUrl,
  ]);
}
