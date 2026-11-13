/**
 * hireInterviews - the PUBLIC side of booking (kit §4.2): a candidate's open times, and an
 * employer's request for one of them.
 *
 * REACHABLE ONLY. Both go through `loadHireIndex(['public','unlisted'])`, the same gate as the
 * profile, so an unknown, private or case-study-less person is the same 404 everywhere.
 *
 * OPT-IN. Nothing is bookable until the candidate turns booking on in their studio
 * (`hire_interview_availability.enabled`). Off is the default, so every existing profile,
 * including the Kes test profile, keeps "Request intro" and cannot receive a request.
 *
 * A REQUEST MUST BE FOR AN OPEN SLOT, decided under a per-candidate advisory lock: inside one
 * transaction we lock the candidate, re-read the times already held, recompute that day's open
 * slots and insert only if the requested start is still one of them. Two employers racing for
 * the same or overlapping times cannot both win.
 *
 * IDEMPOTENT. The same employer asking for the same slot again gets `duplicate` and no second
 * row (also enforced by `uq_hire_interviews_repeat`).
 *
 * NO NOTIFICATION YET. This phase records the request; Phase 4 emails the candidate and the
 * Colaberry team and links it to the `hire-refactored` lead source. No email, phone or work
 * authorization is ever returned: the response carries a status and the slot.
 */
import { z } from 'zod';
import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import { loadHireIndex, type HireIndexEntry } from './hireTalentIndex';
import { readAvailability, type AvailabilityInput } from './hireStudioSettings';
import {
  FORMATS, FORMAT_IDS, isTimeZone, localDate, openSlots, type HeldTime, type InterviewFormat,
} from './hireSlots';

export const HOLDING_STATUSES = ['requested', 'confirmed', 'rescheduled'] as const;
const DAY = 86_400_000;

/** The times a candidate already holds around a window (a week either side, for the weekly cap). */
export async function heldTimes(enrollmentId: string, from: Date, to: Date, transaction?: Transaction): Promise<HeldTime[]> {
  const [rows] = await sequelize.query(
    `SELECT starts_at, minutes FROM hire_interviews
      WHERE enrollment_id = $1 AND status = ANY($2::text[]) AND starts_at >= $3 AND starts_at < $4`,
    { bind: [enrollmentId, HOLDING_STATUSES, new Date(from.getTime() - 8 * DAY), new Date(to.getTime() + 8 * DAY)], transaction },
  );
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const row = r as { starts_at: string | Date; minutes: number };
    return { startsAt: new Date(row.starts_at), minutes: Number(row.minutes) };
  });
}

function rulesOf(a: AvailabilityInput) {
  return { tz: a.tz, blocks: a.blocks, maxPerWeek: a.maxPerWeek, minNoticeHours: a.minNoticeHours };
}

function shortestFormat(a: AvailabilityInput): InterviewFormat {
  return [...a.formats].sort((x, y) => FORMATS[x].minutes - FORMATS[y].minutes)[0] ?? 'intro';
}

export interface BookingSummary {
  readonly enabled: boolean;
  /** The next three open starts (UTC ISO) for the shortest accepted format. */
  readonly nextSlots: readonly string[];
  readonly formats: readonly { readonly id: InterviewFormat; readonly name: string; readonly minutes: number }[];
}

const CLOSED: BookingSummary = { enabled: false, nextSlots: [], formats: [] };

/** For the profile payload. Closed (and the card falls back to Request intro) unless opted in AND open. */
export async function bookingSummary(enrollmentId: string, now: Date): Promise<BookingSummary> {
  const a = await readAvailability(enrollmentId);
  if (!a.enabled || !a.blocks.length || !a.formats.length) return CLOSED;
  const fromDate = localDate(now, a.tz);
  const held = await heldTimes(enrollmentId, now, new Date(now.getTime() + 15 * DAY));
  const next = openSlots(rulesOf(a), { minutes: FORMATS[shortestFormat(a)].minutes, fromDate, now, held }).slice(0, 3);
  if (!next.length) return CLOSED;
  return {
    enabled: true,
    nextSlots: next.map((d) => d.toISOString()),
    formats: a.formats.map((id) => ({ id, name: FORMATS[id].name, minutes: FORMATS[id].minutes })),
  };
}

// ── GET /api/public/hire/talent/:slug/slots ─────────────────────────────────

export const slotsQuerySchema = z.object({
  tz: z.string().refine(isTimeZone).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(FORMAT_IDS as [InterviewFormat, ...InterviewFormat[]]).optional(),
});

export type SlotsOutcome =
  | { status: 'ok'; body: { tz: string; format: InterviewFormat | null; minutes: number | null; formats: BookingSummary['formats']; slots: { start: string; end: string; day: string }[] } }
  | { status: 'invalid'; error: string }
  | { status: 'not_found' };

export async function talentSlots(slug: string, rawQuery: unknown, now: Date = new Date()): Promise<SlotsOutcome> {
  const q = slotsQuerySchema.safeParse(rawQuery);
  if (!q.success) return { status: 'invalid', error: q.error.issues.map((i) => i.path.join('.')).join(', ') };
  const [entry] = await loadHireIndex(['public', 'unlisted'], slug);
  if (!entry) return { status: 'not_found' };
  const a = await readAvailability(entry.page.enrollment_id);
  const viewerTz = q.data.tz ?? a.tz;
  const formats = a.enabled ? a.formats.map((id) => ({ id, name: FORMATS[id].name, minutes: FORMATS[id].minutes })) : [];
  const format = q.data.format && a.formats.includes(q.data.format) ? q.data.format : (formats.length ? shortestFormat(a) : null);
  if (!a.enabled || !format) return { status: 'ok', body: { tz: viewerTz, format: null, minutes: null, formats, slots: [] } };

  // The window starts no earlier than today (candidate zone) and no later than 60 days out.
  const today = localDate(now, a.tz);
  const latest = localDate(new Date(now.getTime() + 60 * DAY), a.tz);
  const fromDate = !q.data.from || q.data.from < today ? today : q.data.from > latest ? latest : q.data.from;
  const minutes = FORMATS[format].minutes;
  const fromUtc = new Date(`${fromDate}T00:00:00Z`);
  const held = await heldTimes(entry.page.enrollment_id, fromUtc, new Date(fromUtc.getTime() + 15 * DAY));
  const slots = openSlots(rulesOf(a), { minutes, fromDate, now, held }).map((s) => ({
    start: s.toISOString(), end: new Date(s.getTime() + minutes * 60_000).toISOString(), day: localDate(s, viewerTz),
  }));
  return { status: 'ok', body: { tz: viewerTz, format, minutes, formats, slots } };
}

// ── POST /api/public/hire/interviews ────────────────────────────────────────

const blankToUndef = (v: unknown) => (typeof v === 'string' && !v.trim() ? undefined : v);
const emailList = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v ?? []),
  z.array(z.string().max(254).email()).max(5),
);
const checkbox = z.preprocess((v) => v === true || v === 'on' || v === 'true' || v === '1', z.boolean());

export const interviewRequestSchema = z.object({
  talentSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,158}$/i),
  format: z.enum(FORMAT_IDS as [InterviewFormat, ...InterviewFormat[]]),
  caseStudySlug: z.preprocess(blankToUndef, z.string().regex(/^[a-z0-9][a-z0-9-]{0,254}$/).optional()),
  startsAt: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'startsAt must be an ISO date-time'),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254).email(),
  company: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(120),
  message: z.string().trim().max(2000).optional().default(''),
  interviewers: emailList.optional().default([]),
  record: checkbox.optional().default(false),
}).strict();
export type InterviewRequestInput = z.infer<typeof interviewRequestSchema>;

export type InterviewRequestOutcome =
  | { status: 'created' | 'duplicate'; http: 201 | 200; startsAt: string; minutes: number; format: InterviewFormat }
  | { status: 'invalid'; http: 400; error: string }
  | { status: 'not_found'; http: 404 }
  | { status: 'unavailable'; http: 409 };

function walkthroughOk(entry: HireIndexEntry, input: InterviewRequestInput): boolean {
  if (input.format !== 'walkthrough') return true;
  return !!input.caseStudySlug && entry.cases.some((c) => c.slug === input.caseStudySlug);
}

export async function requestInterview(raw: unknown, now: Date = new Date()): Promise<InterviewRequestOutcome> {
  const parsed = interviewRequestSchema.safeParse(raw);
  if (!parsed.success) return { status: 'invalid', http: 400, error: parsed.error.issues.map((i) => i.path.join('.') || 'body').join(', ') };
  const input = parsed.data;
  const [entry] = await loadHireIndex(['public', 'unlisted'], input.talentSlug);
  if (!entry) return { status: 'not_found', http: 404 };
  if (!walkthroughOk(entry, input)) return { status: 'invalid', http: 400, error: 'caseStudySlug' };

  const eid = entry.page.enrollment_id;
  const start = new Date(input.startsAt);
  const minutes = FORMATS[input.format].minutes;
  const base = { startsAt: start.toISOString(), minutes, format: input.format };

  return sequelize.transaction(async (transaction) => {
    const opts = (bind: unknown[]) => ({ bind, transaction });
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext($1))', opts([`hire_interviews:${eid}`]));

    const [dupes] = await sequelize.query(
      `SELECT id FROM hire_interviews WHERE enrollment_id = $1 AND starts_at = $2 AND LOWER(employer_email) = LOWER($3)
         AND status = ANY($4::text[]) LIMIT 1`,
      opts([eid, start, input.email, HOLDING_STATUSES]),
    );
    if (Array.isArray(dupes) && dupes.length) return { status: 'duplicate' as const, http: 200 as const, ...base };

    const a = await readAvailability(eid);
    if (!a.enabled || !a.formats.includes(input.format)) return { status: 'unavailable' as const, http: 409 as const };
    const held = await heldTimes(eid, start, start, transaction);
    const open = openSlots(rulesOf(a), { minutes, fromDate: localDate(start, a.tz), now, held, days: 1 });
    if (!open.some((s) => s.getTime() === start.getTime())) return { status: 'unavailable' as const, http: 409 as const };

    await sequelize.query(
      `INSERT INTO hire_interviews (enrollment_id, talent_slug, format, case_study_slug, starts_at, minutes, status,
         employer_name, employer_email, employer_company, employer_role, message, extra_interviewers, record_requested)
       VALUES ($1, $2, $3, $4, $5, $6, 'requested', $7, $8, $9, $10, $11, $12::text[], $13)`,
      opts([eid, entry.page.slug, input.format, input.format === 'walkthrough' ? input.caseStudySlug : null, start, minutes,
        input.name, input.email.toLowerCase(), input.company, input.role, input.message,
        input.interviewers.map((e) => e.toLowerCase()), input.record]),
    );
    console.log(JSON.stringify({
      timestamp: now.toISOString(), level: 'info', service: 'backend', event: 'hire_interview_requested',
      outcome: 'success', context: { talent_slug: entry.page.slug, format: input.format, starts_at: base.startsAt },
    }));
    return { status: 'created' as const, http: 201 as const, ...base };
  });
}
