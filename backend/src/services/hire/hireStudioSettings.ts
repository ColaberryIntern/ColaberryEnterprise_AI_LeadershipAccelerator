/**
 * hireStudioSettings - what a candidate sets in their studio for Hire (kit §3.3-3.5, §4.1):
 * their own words, the times they can interview, and the order of their carousel.
 *
 * THE CALLER IS ALWAYS THE LEARNER. Every function takes the enrollment id from the portal
 * session (hireStudioController); no id is ever read from a request body.
 *
 * IDEMPOTENT. Each write is a full-replace upsert keyed on enrollment_id: the same PUT twice
 * leaves the same row.
 *
 * PUBLIC vs INTERNAL. `publicIntro` and `publicBooking` are the ONLY projections that reach
 * hire.refactored.ai. They never read `headline_draft` (a headline change goes back through
 * review), `work_auth` (internal, kit non-negotiable), or a video still in `draft`.
 */
import { z } from 'zod';
import { sequelize } from '../../config/database';
import { BLOCK_KEYS, FORMAT_IDS, isTimeZone, type InterviewFormat } from './hireSlots';

/** The three studio questions. Keys are stored; the wording lives here so it can change in one place. */
export const INTRO_QUESTIONS = {
  handed: 'What problem do you most want to be handed?',
  caught: 'Tell us about a time you caught something before it shipped.',
  team: 'How do you like to work with a team?',
} as const;
export type IntroQuestionKey = keyof typeof INTRO_QUESTIONS;
export const SETUPS = ['remote', 'hybrid', 'onsite'] as const;

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const hireIntroInputSchema = z.object({
  headlineDraft: z.string().trim().max(90).nullable(),
  answers: z.array(z.object({
    key: z.enum(Object.keys(INTRO_QUESTIONS) as [IntroQuestionKey, ...IntroQuestionKey[]]),
    text: shortText(400),
  }).strict()).max(3)
    .refine((a) => new Set(a.map((x) => x.key)).size === a.length, 'each question is answered at most once'),
  roles: z.array(shortText(80)).max(5),
  setups: z.array(z.enum(SETUPS)).max(3),
  location: z.string().trim().max(120).nullable(),
  earliestStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  workAuth: z.string().trim().max(80).nullable(),
}).strict();
export type HireIntroInput = z.infer<typeof hireIntroInputSchema>;

export const availabilityInputSchema = z.object({
  enabled: z.boolean(),
  tz: z.string().refine(isTimeZone, 'tz must be an IANA time zone'),
  blocks: z.array(z.enum(BLOCK_KEYS as [string, ...string[]])).max(BLOCK_KEYS.length),
  formats: z.array(z.enum(FORMAT_IDS as [InterviewFormat, ...InterviewFormat[]])).min(1).max(FORMAT_IDS.length),
  maxPerWeek: z.number().int().min(1).max(40).nullable(),
  minNoticeHours: z.number().int().min(0).max(336),
  autoConfirm: z.boolean(),
}).strict();
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>;

export const caseStudyOrderInputSchema = z.object({
  slugs: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,254}$/)).max(50),
}).strict();

export class StudioError extends Error {
  constructor(message: string, readonly status: number, readonly error_class: string) {
    super(message);
    this.name = 'StudioError';
  }
}

type Row = Record<string, unknown>;
async function one(sql: string, bind: unknown[]): Promise<Row | null> {
  const [rows] = await sequelize.query(sql, { bind });
  return Array.isArray(rows) && rows[0] ? (rows[0] as Row) : null;
}
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const dateStr = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : null;

// ── Intro ────────────────────────────────────────────────────────────────────

/** The learner's own view: everything they entered, internal fields included (it is theirs). */
export function toLearnerIntro(row: Row | null): HireIntroInput & { video: { status: string; seconds: number | null } | null } {
  return {
    headlineDraft: str(row?.headline_draft),
    answers: (Array.isArray(row?.answers) ? row!.answers as { key?: unknown; text?: unknown }[] : [])
      .filter((a) => typeof a?.key === 'string' && a.key in INTRO_QUESTIONS && typeof a.text === 'string')
      .map((a) => ({ key: a.key as IntroQuestionKey, text: a.text as string })),
    roles: arr(row?.roles),
    setups: arr(row?.setups) as HireIntroInput['setups'],
    location: str(row?.location),
    earliestStart: dateStr(row?.earliest_start),
    workAuth: str(row?.work_auth),
    video: row?.video_asset_id ? { status: String(row.video_status), seconds: (row.video_seconds as number) ?? null } : null,
  };
}

export async function readHireIntro(enrollmentId: string): Promise<ReturnType<typeof toLearnerIntro>> {
  return toLearnerIntro(await one('SELECT * FROM hire_profile_intro WHERE enrollment_id = $1', [enrollmentId]));
}

export async function writeHireIntro(enrollmentId: string, input: HireIntroInput): Promise<ReturnType<typeof toLearnerIntro>> {
  const row = await one(
    `INSERT INTO hire_profile_intro (enrollment_id, headline_draft, answers, roles, setups, location, earliest_start, work_auth, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::text[], $5::text[], $6, $7::date, $8, NOW())
     ON CONFLICT (enrollment_id) DO UPDATE SET headline_draft = EXCLUDED.headline_draft, answers = EXCLUDED.answers,
       roles = EXCLUDED.roles, setups = EXCLUDED.setups, location = EXCLUDED.location,
       earliest_start = EXCLUDED.earliest_start, work_auth = EXCLUDED.work_auth, updated_at = NOW()
     RETURNING *`,
    [enrollmentId, input.headlineDraft, JSON.stringify(input.answers), input.roles, input.setups,
      input.location, input.earliestStart, input.workAuth],
  );
  return toLearnerIntro(row);
}

export interface PublicIntro {
  readonly answers: readonly { readonly key: string; readonly question: string; readonly text: string }[];
  readonly roles: readonly string[];
  readonly setups: readonly string[];
  readonly earliestStart: string | null;
  readonly video: { readonly streamUrl: string; readonly posterUrl: string | null; readonly captionsUrl: string | null; readonly seconds: number | null } | null;
}

/** What Hire may show. `null` when the candidate filled in nothing public, so the card collapses. */
export function publicIntro(row: Row | null): PublicIntro | null {
  if (!row) return null;
  const answers = (Array.isArray(row.answers) ? row.answers : [])
    .map((a) => a as { key?: unknown; text?: unknown })
    .filter((a) => typeof a.key === 'string' && a.key in INTRO_QUESTIONS && typeof a.text === 'string' && a.text.trim())
    .map((a) => ({ key: String(a.key), question: INTRO_QUESTIONS[a.key as IntroQuestionKey], text: String(a.text) }));
  const stream = str(row.video_stream_url);
  const video = row.video_status === 'published' && stream
    ? { streamUrl: stream, posterUrl: str(row.poster_url), captionsUrl: str(row.captions_url), seconds: (row.video_seconds as number) ?? null }
    : null;
  const out: PublicIntro = { answers, roles: arr(row.roles), setups: arr(row.setups), earliestStart: dateStr(row.earliest_start), video };
  return out.answers.length || out.roles.length || out.setups.length || out.earliestStart || out.video ? out : null;
}

export async function readPublicIntro(enrollmentId: string): Promise<PublicIntro | null> {
  return publicIntro(await one(
    `SELECT answers, roles, setups, earliest_start, video_status, video_stream_url, poster_url, captions_url, video_seconds
       FROM hire_profile_intro WHERE enrollment_id = $1`, [enrollmentId]));
}

// ── Interview availability ───────────────────────────────────────────────────

export const DEFAULT_AVAILABILITY: AvailabilityInput = {
  enabled: false, tz: 'America/Chicago', blocks: [], formats: ['intro'], maxPerWeek: 5, minNoticeHours: 24, autoConfirm: false,
};

export function toAvailability(row: Row | null): AvailabilityInput {
  if (!row) return DEFAULT_AVAILABILITY;
  return {
    enabled: row.enabled === true,
    tz: isTimeZone(String(row.tz)) ? String(row.tz) : DEFAULT_AVAILABILITY.tz,
    blocks: arr(row.blocks).filter((b) => BLOCK_KEYS.includes(b)),
    formats: arr(row.formats).filter((f): f is InterviewFormat => (FORMAT_IDS as string[]).includes(f)),
    maxPerWeek: typeof row.max_per_week === 'number' ? row.max_per_week : null,
    minNoticeHours: typeof row.min_notice_hours === 'number' ? row.min_notice_hours : DEFAULT_AVAILABILITY.minNoticeHours,
    autoConfirm: row.auto_confirm === true,
  };
}

export async function readAvailability(enrollmentId: string): Promise<AvailabilityInput> {
  return toAvailability(await one('SELECT * FROM hire_interview_availability WHERE enrollment_id = $1', [enrollmentId]));
}

export async function writeAvailability(enrollmentId: string, input: AvailabilityInput): Promise<AvailabilityInput> {
  return toAvailability(await one(
    `INSERT INTO hire_interview_availability (enrollment_id, enabled, tz, blocks, formats, max_per_week, min_notice_hours, auto_confirm, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::text[], $6, $7, $8, NOW())
     ON CONFLICT (enrollment_id) DO UPDATE SET enabled = EXCLUDED.enabled, tz = EXCLUDED.tz, blocks = EXCLUDED.blocks,
       formats = EXCLUDED.formats, max_per_week = EXCLUDED.max_per_week, min_notice_hours = EXCLUDED.min_notice_hours,
       auto_confirm = EXCLUDED.auto_confirm, updated_at = NOW()
     RETURNING *`,
    [enrollmentId, input.enabled, input.tz, JSON.stringify([...new Set(input.blocks)]), [...new Set(input.formats)],
      input.maxPerWeek, input.minNoticeHours, input.autoConfirm],
  ));
}

// ── Case study order ─────────────────────────────────────────────────────────

export async function readCaseStudyOrder(enrollmentId: string): Promise<string[]> {
  return arr((await one('SELECT slugs FROM hire_case_study_order WHERE enrollment_id = $1', [enrollmentId]))?.slugs);
}

/** Many saved orders in ONE read (the directory), keyed by enrollment id; absent = no order. */
export async function readCaseStudyOrders(enrollmentIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!enrollmentIds.length) return out;
  const [rows] = await sequelize.query(
    'SELECT enrollment_id, slugs FROM hire_case_study_order WHERE enrollment_id = ANY($1::uuid[])',
    { bind: [[...new Set(enrollmentIds)]] },
  );
  for (const r of (Array.isArray(rows) ? rows : []) as Row[]) out.set(String(r.enrollment_id), arr(r.slugs));
  return out;
}

/** `published` is the learner's published Hire case-study slugs; anything else is a 400. */
export async function writeCaseStudyOrder(enrollmentId: string, slugs: readonly string[], published: readonly string[]): Promise<string[]> {
  const unique = [...new Set(slugs)];
  const unknown = unique.filter((s) => !published.includes(s));
  if (unknown.length) throw new StudioError(`Not a published Hire case study: ${unknown.join(', ')}`, 400, 'ValidationError');
  return arr((await one(
    `INSERT INTO hire_case_study_order (enrollment_id, slugs, updated_at) VALUES ($1, $2::text[], NOW())
     ON CONFLICT (enrollment_id) DO UPDATE SET slugs = EXCLUDED.slugs, updated_at = NOW() RETURNING slugs`,
    [enrollmentId, unique],
  ))?.slugs);
}
