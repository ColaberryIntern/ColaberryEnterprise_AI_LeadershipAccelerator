/**
 * hireInterviewInbox - the CANDIDATE's side of booking (kit §4.2 learner routes): the requests
 * employers sent them, and confirm / decline / propose another time.
 *
 * ONLY THEIR OWN. Every statement is `WHERE id = $1 AND enrollment_id = $2`, with the enrollment
 * from the portal session. Somebody else's interview id is the same 404 as a made-up one.
 *
 * NO EMPLOYER EMAIL. The candidate sees who is asking (name, company, role, message) but not
 * the address: "no emails or phone numbers are exchanged until both sides want to continue".
 *
 * TRANSITIONS (anything else is a 409; repeating the transition you just made is a no-op 200):
 *   confirm   requested            -> confirmed
 *   decline   requested|rescheduled -> declined
 *   propose   requested            -> rescheduled, at the new time (the employer accepts in Phase 4)
 *
 * This module records the decision only. The controller then tells the other side
 * (hireInterviewNotify): confirm sends the room link and .ics, decline and propose email the
 * employer, and a proposed time is taken by the employer through hireInterviewAccept.
 */
import { z } from 'zod';
import { sequelize } from '../../config/database';
import { StudioError } from './hireStudioSettings';

export interface InboxInterview {
  readonly id: string;
  readonly format: string;
  readonly caseStudySlug: string | null;
  readonly startsAt: string;
  readonly minutes: number;
  readonly status: string;
  readonly employer: { readonly name: string; readonly company: string; readonly role: string; readonly message: string };
  readonly extraInterviewers: number;
  readonly recordRequested: boolean;
  readonly roomUrl: string | null;
  /** The candidate's own note when they declined; the employer reads it in the decline email. */
  readonly declineReason: string | null;
  readonly createdAt: string;
}

const COLUMNS = `id, format, case_study_slug, starts_at, minutes, status, employer_name, employer_company,
  employer_role, message, COALESCE(array_length(extra_interviewers, 1), 0) AS extra_count, record_requested,
  room_url, decline_reason, created_at`;

type Row = Record<string, unknown>;
const iso = (v: unknown) => new Date(v as string).toISOString();

export function toInboxInterview(r: Row): InboxInterview {
  return {
    id: String(r.id), format: String(r.format), caseStudySlug: (r.case_study_slug as string | null) ?? null,
    startsAt: iso(r.starts_at), minutes: Number(r.minutes), status: String(r.status),
    employer: { name: String(r.employer_name), company: String(r.employer_company), role: String(r.employer_role), message: String(r.message ?? '') },
    extraInterviewers: Number(r.extra_count ?? 0), recordRequested: r.record_requested === true,
    roomUrl: (r.room_url as string | null) ?? null, declineReason: (r.decline_reason as string | null) ?? null,
    createdAt: iso(r.created_at),
  };
}

export async function listMyInterviews(enrollmentId: string): Promise<InboxInterview[]> {
  const [rows] = await sequelize.query(
    `SELECT ${COLUMNS} FROM hire_interviews WHERE enrollment_id = $1 ORDER BY starts_at DESC LIMIT 200`,
    { bind: [enrollmentId] },
  );
  return (Array.isArray(rows) ? rows : []).map((r) => toInboxInterview(r as Row));
}

export const INBOX_ACTIONS = ['confirm', 'decline', 'propose'] as const;
export type InboxAction = typeof INBOX_ACTIONS[number];

const TRANSITIONS: Record<InboxAction, { from: readonly string[]; to: string }> = {
  confirm: { from: ['requested'], to: 'confirmed' },
  decline: { from: ['requested', 'rescheduled'], to: 'declined' },
  propose: { from: ['requested'], to: 'rescheduled' },
};

export const proposeSchema = z.object({
  startsAt: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'startsAt must be an ISO date-time'),
}).strict();

/** Decline takes an OPTIONAL note (or no body at all); whitespace is collapsed, empty means none. */
export const DECLINE_REASON_MAX = 500;
export const declineSchema = z.object({ reason: z.string().max(DECLINE_REASON_MAX * 2).optional() }).strict();

function declineReasonOf(body: unknown): string | null {
  const p = declineSchema.safeParse(body ?? {});
  if (!p.success) throw new StudioError(`body must be {} or { reason: text up to ${DECLINE_REASON_MAX} characters }`, 400, 'ValidationError');
  const reason = (p.data.reason ?? '').replace(/\s+/g, ' ').trim();
  if (reason.length > DECLINE_REASON_MAX) throw new StudioError(`The note can be up to ${DECLINE_REASON_MAX} characters`, 400, 'ValidationError');
  return reason || null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function actOnInterview(
  enrollmentId: string, id: string, action: InboxAction, body: unknown, now: Date = new Date(),
): Promise<InboxInterview> {
  if (!UUID.test(id)) throw new StudioError('Interview not found', 404, 'NotFound');
  let proposed: Date | null = null;
  const reason = action === 'decline' ? declineReasonOf(body) : null;
  if (action === 'propose') {
    const p = proposeSchema.safeParse(body);
    if (!p.success) throw new StudioError('body must be exactly { startsAt: ISO date-time }', 400, 'ValidationError');
    proposed = new Date(p.data.startsAt);
    if (proposed.getTime() <= now.getTime() || proposed.getTime() > now.getTime() + 60 * 86_400_000) {
      throw new StudioError('startsAt must be in the next 60 days', 400, 'ValidationError');
    }
  }
  const [rows] = await sequelize.query(
    `SELECT ${COLUMNS} FROM hire_interviews WHERE id = $1 AND enrollment_id = $2`, { bind: [id, enrollmentId] },
  );
  const current = Array.isArray(rows) && rows[0] ? toInboxInterview(rows[0] as Row) : null;
  if (!current) throw new StudioError('Interview not found', 404, 'NotFound');

  const t = TRANSITIONS[action];
  const sameAgain = current.status === t.to && (!proposed || current.startsAt === proposed.toISOString());
  if (sameAgain) return current;
  if (!t.from.includes(current.status)) {
    throw new StudioError(`Cannot ${action} an interview that is ${current.status}`, 409, 'InvalidTransition');
  }
  // The status guard in the WHERE makes a concurrent second action lose cleanly instead of overwriting.
  const [updated] = await sequelize.query(
    `UPDATE hire_interviews SET status = $3, starts_at = COALESCE($4, starts_at),
        decline_reason = COALESCE($6, decline_reason), updated_at = NOW()
      WHERE id = $1 AND enrollment_id = $2 AND status = ANY($5::text[])
      RETURNING ${COLUMNS}`,
    { bind: [id, enrollmentId, t.to, proposed, t.from, reason] },
  );
  const row = Array.isArray(updated) && updated[0] ? (updated[0] as Row) : null;
  if (!row) throw new StudioError('This interview changed while you were deciding; reload it', 409, 'InvalidTransition');
  return toInboxInterview(row);
}
