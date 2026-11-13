/**
 * hireInterviewNotify - who hears about a Hire interview, and when (kit §4.2 notifications).
 *
 *   requested  -> the candidate (answer it in your studio); the employer becomes a lead on the
 *                 `hire-refactored` source, entry `interview_request`, and that source's
 *                 `notify_sales` rule tells the Colaberry team, the same path `/intro/` uses.
 *   confirmed  -> a room link, then a calendar file to the employer, each extra interviewer and
 *                 the candidate, each in their own message.
 *   declined   -> the employer, with a link to pick another time.
 *   proposed   -> the employer, with a one-click link to take the new time.
 *
 * NO ADDRESS CROSSES OVER. Every message has exactly one recipient, so nobody sees another
 * person's email in To or Cc, and the bodies and .ics carry none (hireInterviewEmails, Ics).
 *
 * IDEMPOTENT. Every send goes through `sendOnce` (email_send_ledger, unique on recipient +
 * subject + event). The event id is the interview, the step and the start time, so a retried
 * confirm sends nothing twice while a confirm at a NEW time sends a fresh invite. The room is
 * created with requestId `hire-interview-<id>-<start>` (the Zoom adapter's own idempotency
 * ledger) and stored only `WHERE room_url IS NULL`.
 *
 * FAILURE-FIRST. These run after the employer or candidate already has their answer, so a
 * failure never undoes the decision; every step is caught and logged with an error_class:
 *   - candidate email missing or a send refused: `hire_interview_email_failed`. The request is
 *     still in the candidate's studio, which is the source of truth; a `failed` ledger row can
 *     be re-sent by calling the same function again.
 *   - the room provider down or slow (25s cap): the invite goes out saying the room link
 *     follows from the Colaberry team, and `hire_interview_room_failed` is logged for them.
 *   - the lead ingest refused (e.g. the entry is not seeded yet): `hire_interview_lead_failed`;
 *     the interview and the candidate email are unaffected.
 * No retry loop here: the ledger makes a manual re-run safe, and that is the recovery path.
 */
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { guardedSendMail, resolveEmailRecipient } from '../emailService';
import { sendOnce } from '../email/idempotentSend';
import { handleIngest } from '../leadIngestionService';
import { getMeetingProvider } from '../communityRooms/meetingProvider';
import { getCaseStudySurfaceProfile } from '../caseStudy/caseStudySurfaceProfiles';
import { loadHireIndex } from './hireTalentIndex';
import { FORMATS, isTimeZone, type InterviewFormat } from './hireSlots';
import { buildInterviewIcs } from './hireInterviewIcs';
import {
  candidateConfirmedEmail, candidateRequestedEmail, employerConfirmedEmail, employerDeclinedEmail,
  employerProposedEmail, type Email, type InterviewFacts,
} from './hireInterviewEmails';
import { acceptUrl } from './hireInterviewAccept';

export const HIRE_INTERVIEW_ENTRY = 'interview_request';
const ROOM_TIMEOUT_MS = 25_000;

interface Loaded {
  readonly facts: InterviewFacts;
  readonly candidateEmail: string | null;
  readonly employerEmail: string;
  readonly extraEmails: string[];
  readonly status: string;
}

export const hireBase = (): string => getCaseStudySurfaceProfile('hire').publicBaseUrl || 'https://hire.refactored.ai';
/** The existing intro form: it reaches the Colaberry team through the lead source's notify rule. */
export const introUrl = (slug: string): string => `${hireBase()}/intro/?talent=${encodeURIComponent(slug)}`;
export const studioUrl = (): string => `${env.frontendUrl.replace(/\/$/, '')}/portal/portfolio?tab=hire`;

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context,
  });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}
const errClass = (e: unknown) => (e instanceof Error && e.name && e.name !== 'Error' ? e.name : 'UpstreamUnavailable');

export async function loadInterview(id: string): Promise<Loaded | null> {
  const [rows] = await sequelize.query(
    `SELECT i.*, e.full_name AS candidate_name, e.email AS candidate_email, a.tz AS candidate_tz
       FROM hire_interviews i
       JOIN enrollments e ON e.id = i.enrollment_id
       LEFT JOIN hire_interview_availability a ON a.enrollment_id = i.enrollment_id
      WHERE i.id = $1`,
    { bind: [id] },
  );
  const r = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
  if (!r) return null;
  let caseStudyTitle: string | null = null;
  if (r.case_study_slug) {
    const [entry] = await loadHireIndex(['public', 'unlisted'], String(r.talent_slug)).catch(() => []);
    caseStudyTitle = entry?.cases.find((c) => c.slug === r.case_study_slug)?.title ?? null;
  }
  const tz = typeof r.candidate_tz === 'string' && isTimeZone(r.candidate_tz) ? r.candidate_tz : 'America/Chicago';
  const extra = Array.isArray(r.extra_interviewers) ? (r.extra_interviewers as string[]) : [];
  return {
    status: String(r.status),
    candidateEmail: typeof r.candidate_email === 'string' && r.candidate_email.includes('@') ? r.candidate_email : null,
    employerEmail: String(r.employer_email),
    extraEmails: extra,
    facts: {
      id: String(r.id), talentSlug: String(r.talent_slug), candidateName: String(r.candidate_name || 'The candidate'),
      candidateTz: tz, format: String(r.format) as InterviewFormat, caseStudyTitle,
      start: new Date(r.starts_at as string), minutes: Number(r.minutes),
      employer: { name: String(r.employer_name), company: String(r.employer_company), role: String(r.employer_role), message: String(r.message ?? '') },
      extraInterviewers: extra.length, recordRequested: r.record_requested === true,
      roomUrl: (r.room_url as string | null) ?? null,
      declineReason: typeof r.decline_reason === 'string' && r.decline_reason.trim() ? r.decline_reason : null,
    },
  };
}

/** One message, one recipient, through the send ledger. True when it went (or already had). */
async function sendOne(to: string, mail: Email, eventId: string, ics?: string): Promise<boolean> {
  const result = await sendOnce({ recipient: to, subject: mail.subject, businessEventId: eventId }, async () => {
    const r = await resolveEmailRecipient(to, mail.subject);
    const from = `"Refactored Hire" <${env.emailFrom}>`;
    const info = await guardedSendMail({
      from, to: r.to, subject: r.subject, html: mail.html, text: mail.text,
      ...(ics ? { icalEvent: { method: 'PUBLISH', filename: 'interview.ics', content: ics } } : {}),
      headers: { 'X-MC-Tags': 'hire-interview', 'X-MC-Metadata': JSON.stringify({ business_event_id: eventId }) },
    });
    return info.messageId
      ? { ok: true, messageId: String(info.messageId) }
      : { ok: false, errorClass: 'SendBlocked', error: 'blocked by kill switch or dev guard' };
  });
  if (result.outcome === 'failed') {
    log('warn', 'hire_interview_email_failed', { event_id: eventId, error: result.error.slice(0, 200) }, result.errorClass);
  }
  return result.outcome !== 'failed';
}

const eventId = (f: InterviewFacts, step: string) => `hire-interview-${f.id}-${step}-${f.start.toISOString()}`;

async function ingestLead(l: Loaded, ctx: NotifyContext): Promise<void> {
  const f = l.facts;
  const rawBody = {
    name: f.employer.name, email: l.employerEmail, company: f.employer.company, role: f.employer.role,
    message: f.employer.message, talent_slug: f.talentSlug, interview_id: f.id, format: f.format,
    starts_at: f.start.toISOString(),
  };
  const out = await handleIngest({
    sourceSlug: 'hire-refactored', entrySlug: HIRE_INTERVIEW_ENTRY, rawBody, rawBodyText: JSON.stringify(rawBody),
    // handleIngest declares headers as Record<string, any>; the request's headers pass through untouched.
    headers: ctx.headers as Record<string, any>, remoteIp: ctx.remoteIp, signature: '', sessionId: '',
  }).catch((e: unknown) => ({ success: false as const, httpStatus: 500, error: e instanceof Error ? e.message : String(e) }));
  if (!out?.success) {
    log('warn', 'hire_interview_lead_failed', { interview_id: f.id, http_status: out?.httpStatus ?? null }, 'UpstreamUnavailable');
  }
}

/** Create the room once and store it; on failure the invite says the link follows. */
async function ensureRoom(f: InterviewFacts): Promise<string | null> {
  if (f.roomUrl) return f.roomUrl;
  try {
    const created = await Promise.race([
      getMeetingProvider().createMeeting({
        title: `Interview: ${f.candidateName} and ${f.employer.company}`,
        description: `${FORMATS[f.format].name}, booked on hire.refactored.ai`,
        startAt: f.start, endAt: new Date(f.start.getTime() + f.minutes * 60_000),
        requestId: `hire-interview-${f.id}-${f.start.toISOString()}`,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('room timed out'), { name: 'TimeoutError' })), ROOM_TIMEOUT_MS)),
    ]);
    if (!created.joinUrl) throw Object.assign(new Error('provider returned no join link'), { name: 'ContractViolation' });
    await sequelize.query('UPDATE hire_interviews SET room_url = $2, updated_at = NOW() WHERE id = $1 AND room_url IS NULL',
      { bind: [f.id, created.joinUrl] });
    const [rows] = await sequelize.query('SELECT room_url FROM hire_interviews WHERE id = $1', { bind: [f.id] });
    return (Array.isArray(rows) && rows[0] ? (rows[0] as { room_url: string | null }).room_url : null) ?? created.joinUrl;
  } catch (e: unknown) {
    log('error', 'hire_interview_room_failed', { interview_id: f.id, message: e instanceof Error ? e.message.slice(0, 200) : '' }, errClass(e));
    return null;
  }
}

export interface NotifyContext { readonly headers?: Record<string, unknown>; readonly remoteIp?: string; readonly now?: Date }

/** A new booking: the candidate is told (or, when it confirmed itself, everybody gets the invite). */
export async function notifyInterviewRequested(id: string, ctx: NotifyContext = {}): Promise<void> {
  const l = await loadInterview(id);
  if (!l) return;
  await ingestLead(l, ctx);
  if (l.status === 'confirmed') { await sendConfirmation(l, true, ctx.now); return; }
  if (!l.candidateEmail) { log('warn', 'hire_interview_email_failed', { interview_id: id, reason: 'no candidate email' }, 'NoRecipient'); return; }
  await sendOne(l.candidateEmail, candidateRequestedEmail(l.facts, studioUrl()), eventId(l.facts, 'requested'));
}

async function sendConfirmation(l: Loaded, autoConfirmed: boolean, now: Date = new Date()): Promise<void> {
  const facts: InterviewFacts = { ...l.facts, roomUrl: await ensureRoom(l.facts) };
  const ics = buildInterviewIcs({
    interviewId: facts.id, start: facts.start, minutes: facts.minutes, roomUrl: facts.roomUrl, now,
    summary: `${FORMATS[facts.format].name}: ${facts.candidateName} and ${facts.employer.company}`,
    description: `Booked on hire.refactored.ai.${facts.roomUrl ? ` Join: ${facts.roomUrl}` : ''}`,
  });
  const profile = `${hireBase()}/talent/${facts.talentSlug}/`;
  await sendOne(l.employerEmail, employerConfirmedEmail(facts, profile), eventId(facts, 'confirmed'), ics);
  for (const to of l.extraEmails) await sendOne(to, employerConfirmedEmail(facts, profile, true), eventId(facts, 'confirmed'), ics);
  if (l.candidateEmail) await sendOne(l.candidateEmail, candidateConfirmedEmail(facts, autoConfirmed), eventId(facts, 'confirmed'), ics);
  log('info', 'hire_interview_confirmation_sent', { interview_id: facts.id, room: !!facts.roomUrl, recipients: 2 + l.extraEmails.length });
}

/** After the candidate (or the employer, taking a suggested time) confirms. */
export async function notifyInterviewConfirmed(id: string, now?: Date): Promise<void> {
  const l = await loadInterview(id);
  if (!l || l.status !== 'confirmed') return;
  await sendConfirmation(l, false, now);
}

export async function notifyInterviewDeclined(id: string): Promise<void> {
  const l = await loadInterview(id);
  if (!l || l.status !== 'declined') return;
  await sendOne(l.employerEmail, employerDeclinedEmail(l.facts, `${hireBase()}/talent/${l.facts.talentSlug}/schedule/`, introUrl(l.facts.talentSlug)), eventId(l.facts, 'declined'));
}

export async function notifyInterviewProposed(id: string): Promise<void> {
  const l = await loadInterview(id);
  if (!l || l.status !== 'rescheduled') return;
  await sendOne(l.employerEmail, employerProposedEmail(l.facts, acceptUrl(hireBase(), l.facts), introUrl(l.facts.talentSlug)), eventId(l.facts, 'proposed'));
}

/** Fire one of the above without making the caller wait or fail; anything thrown is logged. */
export function inBackground(what: string, id: string, run: () => Promise<void>): void {
  run().catch((e: unknown) => log('error', 'hire_interview_notify_failed', {
    step: what, interview_id: id, message: e instanceof Error ? e.message.slice(0, 200) : '',
  }, errClass(e)));
}
